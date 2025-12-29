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

type PriceMode = "normal" | "junk";

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
  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) {
    hints.push("未使用に近い");
  } else if (/美品/.test(output_text) && !base.includes("美品")) {
    hints.push("美品");
  }

  const qtyMatch = output_text.match(/(\d+)\s*(本|枚|個|体|点)\s*セット?/);
  if (qtyMatch) {
    const phrase = `${qtyMatch[1]}${qtyMatch[2]}セット`;
    if (!base.includes(phrase) && !extraWords.includes(phrase)) {
      hints.push(phrase);
    }
  }

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
  for (const ch of str) {
    total += ch.charCodeAt(0) <= 0x007f ? 0.5 : 1;
  }
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

// ===== オークション用タイトル組み立て（AIが出したのを優先しつつ丸める） =====
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
  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) {
    hints.push("未使用に近い");
  } else if (/美品/.test(output_text) && !base.includes("美品")) {
    hints.push("美品");
  }

  let title = base;
  if (hints.length) {
    const add = hints.filter((h) => !title.includes(h)).join(" ");
    if (add) title = `${title} ${add}`.trim();
  }

  if (countYahooLike(title) > 65) {
    title = trimYahooLike(title, 65);
  }
  return title;
}

// ===== レート制限向け: 遅延ヘルパー =====
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== OpenAI呼び出し（429時はリトライ） =====
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

// ===== プロンプト（固定部分） =====
const SYSTEM_PROMPT_BASE = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
  "画像とリファレンス情報をもとに、真贋・型名・状態・相場・出品文を一貫した基準で出力します。",
  "",
  "【最重要方針】",
  "・真贋判定は「確率」であり、保証ではない。",
  "・偽物を本物と誤認するリスクを最小化しつつ、本物の中古商品を不必要に低評価しないこと。",
  "・刻印/フォント/内部構造など“偽物が破綻しやすい部位”を最重視する。",
  "・汚れ/スレ/自然劣化は中古では通常発生するため、偽物判定の主因にしない。",
  "・一致点と不一致点を総合評価し、偏った判定にしない。",
  "・複数商品が写っている場合は値の付きそうな物から査定コメントのみに記載、値段も一点ずつ記載する。フリマ用にはまとめで記載。",
  "",
  "【リファレンスの扱い】",
  "・リファレンスは参考。しかし古い型・個体差・経年劣化で外れることもあるため、依存しすぎない。",
  "・リファレンスに無い＝即偽物ではない。",
  "・強い矛盾のみ偽物方向の根拠とする。",
  "",
  "【参照データの種類】",
  "入力には以下のリファレンスブロックが含まれることがある：",
  "　[ブランドバッグ系リファレンス]",
  "　[ジュエリー系リファレンス]",
  "　[金工・漆器系リファレンス]",
  "　[和物（書画・陶磁器・茶道具・箱書）リファレンス]",
  "　[過去の教師データ]",
  "",
  "・ブランド品／時計などではブランド系・ジュエリー系リファレンスを優先して照合すること。",
  "・書画／掛軸／陶磁器／茶道具／箱書など和物ジャンルでは、和物リファレンスの「筆跡」「落款・サイン」「印文」「真贋ポイント」「贋作パターン」「時代・流派」を重視して照合すること。",
  "",
  "【真贋出力ルール】",
  "以下のいずれかで出力する：",
  "1) 本物の可能性が高い（80〜90%）",
  "2) 要追加写真（60〜79%）",
  "3) 偽物の可能性が高い（0〜59%）",
  "",
  "【相場ルール】",
  "・通常は実売相場の下限〜中央値を控えめに提示。",
  "・不明な場合は「【想定相場】不明（データ不足）」とする。",
  "・ジャンクモードの場合は、【想定相場】に「ジャンク実売レンジ」を最優先で書く（動作未確認・現状渡し前提）。",
  "",
  "【JSONルール】",
  "返答はJSONのみ。",
  "キーは以下の8つ：",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / confidence / genre / item_name",
  "",
  "【output_text（査定コメント）フォーマット】",
  "必ず以下の4行構成（＋必要に応じて補足1〜2行）:",
  "1行目： 【真贋】〜",
  "2行目： 【型名】〜",
  "3行目： 【状態】〜",
  "4行目： 【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
  "※ジャンクモード時の4行目は「ジャンク実売レンジ（参照元/件数があれば併記）」を必ず含める。",
  "",
  "【モード別の“生成節約ルール”（重要）】",
  "・listing_mode=flea のとき：mercari_title と mercari_description のみ作る。auction_title は必ず空文字 \"\"。",
  "・listing_mode=auction のとき：auction_title のみ作る。mercari_title と mercari_description は必ず空文字 \"\"。",
  "・ただし output_text/confidence/genre/item_name は常に出す。",
  "",
  "【重要な禁止事項】",
  "・JSONの外側に一文字でも余計なテキストを書かない（挨拶・説明・コードブロック禁止）。",
  "・真贋について「本物です」「正規品です」「確実です」等の断定表現は禁止。",
].join("\n");

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
      typeof (body as any).user_id === "string" && (body as any).user_id.trim().length > 0
        ? (body as any).user_id
        : null;

    const listing_mode: ListingMode = (body as any).listing_mode === "auction" ? "auction" : "flea";

    const price_mode: PriceMode = (body as any).junk_mode === true ? "junk" : "normal";

    // 画像を抽出
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

    // ===== Supabase リファレンス収集 =====
    const referenceBlocks: string[] = [];

    // ★ ブランド/実売レンジ系（あなたが提示したカラムを優先して出す）
    try {
      const { data: brandRows } = await supabase
        .from("brand_data_reference_v2")
        .select(
          "brand,line_name,model_name,category,subcategory,material,authenticity_points,common_fake_patterns,condition_hint,mercari_price_low,mercari_price_high,reference_source,notes"
        )
        .limit(30);

      if (brandRows?.length) {
        referenceBlocks.push(
          "[ブランドバッグ系リファレンス]\n" +
            brandRows
              .map((r: any) => {
                const low = r.mercari_price_low ?? "";
                const high = r.mercari_price_high ?? "";
                const range = low || high ? ` / 実売レンジ:${low}〜${high}` : "";
                const src = r.reference_source ? ` / 参照:${r.reference_source}` : "";
                return `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name} / カテゴリ:${r.category} / サブ:${r.subcategory} / 素材:${r.material}${range}${src} / 真贋:${r.authenticity_points} / 贋:${r.common_fake_patterns} / 状態ヒント:${r.condition_hint} / 備考:${r.notes}`;
              })
              .join("\n")
        );
      }
    } catch (e) {
      console.error("brand_data_reference_v2 取得エラー", e);
    }

    try {
      const { data: jewelryRows } = await supabase.from("jewelry_reference").select("*").limit(20);
      if (jewelryRows?.length) {
        referenceBlocks.push("[ジュエリー系リファレンス]\n" + jewelryRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }
    } catch (e) {
      console.error("jewelry_reference 取得エラー", e);
    }

    try {
      const { data: kinkoRows } = await supabase.from("kinko_urushi_reference").select("*").limit(20);
      if (kinkoRows?.length) {
        referenceBlocks.push("[金工・漆器系リファレンス]\n" + kinkoRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }
    } catch (e) {
      console.error("kinko_urushi_reference 取得エラー", e);
    }

    try {
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
                  `ジャンル:${r.genre} / カテゴリ:${r.category} / 作家:${r.author_name} / 筆跡:${r.stroke_traits} / 落款:${r.signature_traits} / 印文:${r.seal_text} / 真贋ポイント:${r.authenticity_points} / 贋作:${r.common_fake_patterns} / 時代:${r.era} / 流派:${r.school_lineage}`
              )
              .join("\n")
        );
      }
    } catch (e) {
      console.error("wamon_reference 取得エラー", e);
    }

    try {
      const { data: trainingRows } = await supabase
        .from("training_items")
        .select("genre,item_name,output_text,mercari_title,mercari_description,confidence")
        .eq("is_trainable", true)
        .order("created_at", { ascending: false })
        .limit(30);

      if (trainingRows?.length) {
        referenceBlocks.push(
          "[過去の教師データ]\n" +
            trainingRows.map((r: any) => `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`).join("\n")
        );
      }
    } catch (e) {
      console.error("training_items 取得エラー", e);
    }

    const referenceText = referenceBlocks.join("\n\n");

    const modeHint =
      listing_mode === "auction"
        ? "listing_mode=auction：オークション向け。auction_title を最適化し、mercari_* は空文字で返す。"
        : "listing_mode=flea：フリマ向け。mercari_title/mercari_description を最適化し、auction_title は空文字で返す。";

    const junkHint =
      price_mode === "junk"
        ? "price_mode=junk：ジャンク（現状渡し/動作未確認）前提。相場は「ジャンク実売レンジ」を最優先で【想定相場】に書く。根拠として参照元（reference_source）やレンジ（mercari_price_low/high）があれば必ず言及。"
        : "price_mode=normal：通常中古前提。相場は控えめレンジで提示。";

    const content: any[] = [
      { type: "input_text", text: SYSTEM_PROMPT_BASE },
      { type: "input_text", text: `【指定】listing_mode=${listing_mode} / price_mode=${price_mode}\n${modeHint}\n${junkHint}` },
      referenceText
        ? {
            type: "input_text",
            text: referenceText + "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。",
          }
        : null,
      ...images.map((u) => ({ type: "input_image", image_url: u })),
    ].filter(Boolean);

    // ★ トークン節約：モードによって出力上限を下げる
    const maxTokens = listing_mode === "auction" ? 900 : 1500;

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

    // ===== モード別：生成節約の強制（AIがルール破ってもここで矯正） =====
    let mercari_title = "";
    let mercari_description = "";
    let auction_title = "";

    if (listing_mode === "flea") {
      mercari_title = buildMercariTitle(parsed.mercari_title, item_name, output_text);
      mercari_description = typeof parsed.mercari_description === "string" ? parsed.mercari_description : output_text;
      auction_title = ""; // 強制
    } else {
      // auction
      const tmpMercari = buildMercariTitle(parsed.mercari_title, item_name, output_text); // 補助で使うだけ
      auction_title = buildAuctionTitle(parsed.auction_title, item_name, tmpMercari, output_text);
      mercari_title = ""; // 強制
      mercari_description = ""; // 強制
    }

    // appraisals 保存（junk_mode も保存しておくと後で便利）
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
          output_text,
          image_urls: images,
          model: "gpt-4.1",
          junk_mode: price_mode === "junk",
        } as any,
      ]);
    } catch (e) {
      console.error("appraisals 保存中の例外:", e);
    }

    // training_items 保存
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
          model: "gpt-4.1",
          source: "kanteno-web",
          confidence,
          is_trainable: isTrainable,
          raw_request: { image_urls: images, listing_mode, junk_mode: price_mode === "junk" },
          raw_response: aiRes,
        },
      ]);
    } catch (e) {
      console.error("training_items 保存中の例外:", e);
    }

    // assessment_jobs 保存
    try {
      await supabase.from("assessment_jobs").insert([
        {
          user_id,
          image_urls: images,
          status: "done",
          result: {
            output_text,
            mercari_title,
            mercari_description,
            auction_title,
            listing_mode,
            confidence,
            genre,
            item_name,
            junk_mode: price_mode === "junk",
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
        confidence,
        genre,
        item_name,
        junk_mode: price_mode === "junk",
      } as any,
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
