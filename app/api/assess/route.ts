// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ListingMode = "flea" | "auction";
type AssessMode = "single" | "bulk";

// ===== タイトル用トークン化ヘルパー =====
function tokenizeForTitle(s: string): string[] {
  return s
    .split(/[\s　\/・,、()\[\]]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// ===== メルカリタイトル最適化ヘルパー =====
function buildMercariTitle(rawTitle: unknown, item_name: string | null, output_text: string): string {
  const baseName = (item_name ?? "").trim();
  const originalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
  let base = baseName || originalTitle;
  if (!base) return "";

  const baseWords = tokenizeForTitle(base);
  const wordsInBase = new Set<string>(baseWords);

  const extraWords: string[] = [];
  const seen = new Set<string>();

  if (originalTitle) {
    const tokens: string[] = tokenizeForTitle(originalTitle);
    tokens.forEach((t: string) => {
      const key = t.trim();
      if (!key) return;
      if (wordsInBase.has(key)) return;
      if (base.includes(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      extraWords.push(key);
    });
  }

  const hints: string[] = [];
  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) hints.push("未使用に近い");
  else if (/美品/.test(output_text) && !base.includes("美品")) hints.push("美品");

  let title = base;
  const tailParts: string[] = [];
  extraWords.forEach((w) => {
    if (!title.includes(w) && !tailParts.includes(w)) tailParts.push(w);
  });
  hints.forEach((h) => {
    if (!title.includes(h) && !tailParts.includes(h)) tailParts.push(h);
  });

  if (tailParts.length > 0) title = `${title} ${tailParts.join(" ")}`.trim();
  if (title.length > 40) title = title.slice(0, 40);
  return title;
}

// ===== ヤフオク想定：半角=0.5 / 全角=1 のカウント =====
function countYahooLike(str: string): number {
  let total = 0;
  for (const ch of str) total += ch.charCodeAt(0) <= 0x007f ? 0.5 : 1;
  return total;
}
function trimYahooLike(str: string, max: number): string {
  let total = 0;
  let out = "";
  for (const ch of str) {
    const w = ch.charCodeAt(0) <= 0x007f ? 0.5 : 1;
    if (total + w > max) break;
    out += ch;
    total += w;
  }
  return out.trim();
}

// ===== オークション用タイトル組み立て =====
function buildAuctionTitle(rawTitle: unknown, item_name: string | null, mercari_title: string, output_text: string): string {
  const original = typeof rawTitle === "string" ? rawTitle.trim() : "";
  let base = original || (item_name ?? "").trim() || mercari_title.trim();
  if (!base) return "";

  base = base
    .replace(/ヤフオク|Yahoo!?\s*オークション|Yahoo!?\s*Auction/gi, "")
    .replace(/メルカリ|Mercari/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const hints: string[] = [];
  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) hints.push("未使用に近い");
  else if (/美品/.test(output_text) && !base.includes("美品")) hints.push("美品");

  let title = base;
  if (hints.length) {
    const add = hints.filter((h) => !title.includes(h)).join(" ");
    if (add) title = `${title} ${add}`.trim();
  }

  if (countYahooLike(title) > 65) title = trimYahooLike(title, 65);
  return title;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAIWithRetry(client: OpenAI, payload: any, maxRetries = 2): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await client.responses.create(payload);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status !== 429 || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitMs = 1500 * attempt;
      console.warn(`OpenAI rate limit (429) on attempt ${attempt}, retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

function buildSystemPrompt(params: { listing_mode: ListingMode; junk_mode: boolean; assess_mode: AssessMode }) {
  const { listing_mode, junk_mode, assess_mode } = params;

  // ★ まとめ査定は「タイトル類を作らない」固定
  const bulkHint =
    assess_mode === "bulk"
      ? [
          "【まとめ査定モード（最優先）】",
          "・出力は「現場の出張買取」を想定して簡潔に。",
          "・画像内に複数商品がある前提で、価値が出そうな上位3点だけをピックアップしてコメントする。",
          "・残りは『その他まとめ』として1行で触れる。",
          "・出品文（mercari_title/mercari_description/auction_title）は一切不要。必ず空文字にする。",
          "・相場は各ピックアップに対して控えめレンジ（下限〜中央値）で提示。自信がないものは不明で良い。",
        ].join("\n")
      : "【通常査定モード】単品査定を基本とし、必要なら複数品のピックアップも補足行で対応する。";

  // ★ 通常のモード節約（singleのときのみ適用）
  const modeHintSingle =
    assess_mode === "single"
      ? listing_mode === "auction"
        ? [
            "出力はオークション向けを意識し、auction_title を特に最適化すること。",
            "mercari_title と mercari_description は不要なので必ず空文字 \"\" にすること。",
          ].join("\n")
        : [
            "出力はフリマ向けを意識し、mercari_title / mercari_description を特に最適化すること。",
            "auction_title は不要なので必ず空文字 \"\" にすること。",
          ].join("\n")
      : "（まとめ査定モードのため出品文は全て空文字）";

  const junkHint = junk_mode
    ? [
        "【ジャンクモード】",
        "・動作未確認/破損/欠品を前提に、相場は必ず下振れ寄りで提示する。",
        "・通常推定ができてもジャンクは概ね 0.2〜0.4 倍レンジを基本とする。",
        "・トレカ（MTG/ポケカ等）は高額個体前提禁止。情報不足時は大量流通ノーマル前提でさらに下げる。",
      ].join("\n")
    : "【通常状態】ジャンク補正は行わない。";

  return [
    "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
    "画像とリファレンス情報をもとに、真贋・型名・状態・相場を一貫した基準で出力します。",
    "",
    "【最重要方針】",
    "・真贋判定は「確率」であり保証ではない。",
    "・偽物を本物と誤認するリスクを最小化する。",
    "・一致点/不一致点を総合評価する。",
    "",
    bulkHint,
    "",
    "【カード系特別ルール（MTG/ポケカ等）】",
    "・高額個体を前提にしない。カード名/レアリティ/型番/状態が不明なら下限評価。",
    "・複数枚は『まとめ売り単価』を基準にする。",
    "",
    "【JSONルール】",
    "返答はJSONのみ。キーは以下の10個：",
    "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / junk_mode / confidence / genre / item_name",
    "",
    "【output_text】",
    "・必ず4行構成（+必要なら補足1〜2行）",
    "1行目：【真贋】",
    "2行目：【型名】",
    "3行目：【状態】",
    "4行目：【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
    "補足（任意）：まとめ査定のピックアップや注意点を短く",
    "",
    modeHintSingle,
    "",
    junkHint,
    "",
    "【重要】JSON外の文字は禁止。コードブロック禁止。断定真贋表現禁止。",
    "【高リスクカテゴリの誤爆防止（最重要）】",
"・テレホンカード/トレーディングカード/アニメキャラ物は、不安な場合、作品名・キャラ名の断定を禁止。",
"・画像内の文字（作品名/ロゴ/型番）を明確に読めた場合のみ、作品名を1つに確定してよい。",
"・文字が読めない/ロゴが不鮮明なら、作品名は「候補：A / B」までに留め、【真贋】は必ず「要追加写真」にする。",
"・断定/候補どちらでも、根拠（見えた文字・ロゴ・特徴）を短く明記する。",

  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY が不足しています。" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "JSON形式のリクエストを送ってください。" }, { status: 400 });
    }

    const user_id: string | null =
      typeof (body as any).user_id === "string" && (body as any).user_id.trim().length > 0 ? (body as any).user_id : null;

    const listing_mode: ListingMode = (body as any).listing_mode === "auction" ? "auction" : "flea";
    const assess_mode: AssessMode = (body as any).assess_mode === "bulk" ? "bulk" : "single";
    const junk_mode: boolean = (body as any).junk_mode === true;

    // 画像抽出
    const raw = (body as any).image_urls ?? (body as any).images ?? null;
    let images: string[] = [];

    if (Array.isArray(raw)) {
      images = raw
        .map((v: any) => {
          if (typeof v === "string") return v;
          if (v?.url) return v.url;
          if (v?.image_url) return v.image_url;
          if (v?.src) return v.src;
          return null;
        })
        .filter((s): s is string => !!s);
    }

    if (!images.length) {
      return NextResponse.json({ ok: false, error: "画像データがありません。" }, { status: 400 });
    }

    // ===== Supabase リファレンス収集（現状維持） =====
    let referenceBlocks: string[] = [];
    try {
      const { data: brandRows } = await supabase.from("brand_data_reference_v2").select("brand,line_name,model_name").limit(20);
      if (brandRows?.length) {
        referenceBlocks.push(
          "[ブランドバッグ系リファレンス]\n" +
            brandRows.map((r: any) => `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`).join("\n")
        );
      }

      const { data: jewelryRows } = await supabase.from("jewelry_reference").select("*").limit(20);
      if (jewelryRows?.length) {
        referenceBlocks.push("[ジュエリー系リファレンス]\n" + jewelryRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }

      const { data: kinkoRows } = await supabase.from("kinko_urushi_reference").select("*").limit(20);
      if (kinkoRows?.length) {
        referenceBlocks.push("[金工・漆器系リファレンス]\n" + kinkoRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }

      const { data: wamonRows } = await supabase
        .from("wamon_reference")
        .select(
          "genre,category,author_name,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,authenticity_points,common_fake_patterns,era,school_lineage"
        )
        .limit(30);

      if (wamonRows?.length) {
        referenceBlocks.push(
          "[和物（書画・陶磁器・茶道具・箱書）リファレンス]\n" +
            wamonRows
              .map(
                (r: any) =>
                  `ジャンル:${r.genre} / カテゴリ:${r.category} / 作家:${r.author_name} / 筆跡:${r.stroke_traits} / 落款:${r.signature_traits} / 印文:${r.seal_text} / 真贋ポイント:${r.authenticity_points} / 贋作パターン:${r.common_fake_patterns} / 時代:${r.era} / 流派:${r.school_lineage}`
              )
              .join("\n")
        );
      }

      const { data: trainingRows } = await supabase
        .from("training_items")
        .select("genre,item_name,output_text,confidence")
        .eq("is_trainable", true)
        .order("created_at", { ascending: false })
        .limit(30);

      if (trainingRows?.length) {
        referenceBlocks.push(
          "[過去の教師データ]\n" + trainingRows.map((r: any) => `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`).join("\n")
        );
      }
    } catch (e) {
      console.error("リファレンス取得エラー", e);
    }

    const referenceText = referenceBlocks.join("\n\n");
    const systemPrompt = buildSystemPrompt({ listing_mode, assess_mode, junk_mode });

    const content: any[] = [
      { type: "input_text", text: systemPrompt },
      referenceText
        ? {
            type: "input_text",
            text: referenceText + "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。",
          }
        : null,
      ...images.map((u) => ({ type: "input_image", image_url: u })),
    ].filter(Boolean);

    // ★ まとめ査定は出力が短くなるので token を絞る
    const maxTokens = assess_mode === "bulk" ? 1100 : listing_mode === "auction" ? 1300 : 1600;

    const aiRes: any = await callOpenAIWithRetry(openai, {
      model: "gpt-4.1",
      temperature: 0.2,
      max_output_tokens: maxTokens,
      input: [{ role: "user", content }],
    });

    const first = aiRes.output?.[0]?.content?.[0];
    const rawText: string = first?.text ?? "";

    if (!rawText) {
      return NextResponse.json({ ok: false, error: "AI出力が空です。" }, { status: 500 });
    }

    const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", e, rawText);
      return NextResponse.json({ ok: false, error: "AI出力のJSON解析に失敗しました。" }, { status: 500 });
    }

    const output_text_raw = typeof parsed.output_text === "string" ? parsed.output_text : String(rawText);
    let output_text = output_text_raw;
    if (!output_text.includes("【想定相場】")) {
      const sep = output_text.endsWith("\n") ? "" : "\n";
      output_text = output_text + sep + "【想定相場】不明（データ不足）";
    }

    const item_name: string | null = typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;
    const confidence: number | null = typeof parsed.confidence === "number" ? parsed.confidence : null;
    const genre: string | null = typeof parsed.genre === "string" ? parsed.genre.trim() : null;

    // ★ 出品文はモードで最終ガード
    let mercari_title_raw = typeof parsed.mercari_title === "string" ? parsed.mercari_title : "";
    let mercari_description_raw = typeof parsed.mercari_description === "string" ? parsed.mercari_description : "";
    let auction_title_raw = typeof parsed.auction_title === "string" ? parsed.auction_title : "";

    if (assess_mode === "bulk") {
      mercari_title_raw = "";
      mercari_description_raw = "";
      auction_title_raw = "";
    } else {
      if (listing_mode === "auction") {
        mercari_title_raw = "";
        mercari_description_raw = "";
      } else {
        auction_title_raw = "";
      }
    }

    const mercari_title = mercari_title_raw ? buildMercariTitle(mercari_title_raw, item_name, output_text) : "";
    const mercari_description = mercari_description_raw || "";
    const auction_title = auction_title_raw ? buildAuctionTitle(auction_title_raw, item_name, mercari_title, output_text) : "";

    // ===== 保存（junk_mode / assess_mode を追加） =====
    try {
      await supabase.from("appraisals").insert([
        {
          user_id,
          genre,
          item_name,
          confidence,
          mercari_title,
          mercari_description,
          auction_title,
          listing_mode,
          assess_mode,
          junk_mode,
          output_text,
          image_urls: images,
          model: "gpt-4.1",
        },
      ]);
    } catch (e) {
      console.error("appraisals 保存中の例外:", e);
    }

    try {
      const isTrainable = confidence !== null && confidence >= 90;
      await supabase.from("training_items").insert([
        {
          genre,
          item_name,
          image_urls: images,
          output_text,
          mercari_title,
          mercari_description,
          auction_title,
          listing_mode,
          assess_mode,
          junk_mode,
          model: "gpt-4.1",
          source: "kanteno-web",
          confidence,
          is_trainable: isTrainable,
          raw_request: { image_urls: images, listing_mode, assess_mode, junk_mode },
          raw_response: aiRes,
        },
      ]);
    } catch (e) {
      console.error("training_items 保存中の例外:", e);
    }

    try {
      await supabase.from("assessment_jobs").insert([
        {
          user_id,
          image_urls: images,
          status: "done",
          assess_mode,
          junk_mode,
          result: {
            output_text,
            mercari_title,
            mercari_description,
            auction_title,
            listing_mode,
            assess_mode,
            junk_mode,
            confidence,
            genre,
            item_name,
          },
          error_message: null,
        },
      ]);
    } catch (e) {
      console.error("assessment_jobs 保存中の例外:", e);
    }

    return NextResponse.json(
      {
        ok: true,
        output_text,
        mercari_title,
        mercari_description,
        auction_title,
        listing_mode,
        assess_mode,
        junk_mode,
        confidence,
        genre,
        item_name,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("assess error", e);

    const status = e?.status ?? e?.response?.status;
    if (status === 429) {
      return NextResponse.json({ ok: false, error: "AI側のレート制限に達しています。少し時間をおいて再度お試しください。" }, { status: 429 });
    }

    return NextResponse.json({ ok: false, error: e?.message ?? "査定中にエラーが発生しました。" }, { status: 500 });
  }
}
