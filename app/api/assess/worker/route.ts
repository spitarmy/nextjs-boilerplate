// app/api/assess/worker/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- ヘルパーたち（/api/assess と同じ） --------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAIWithRetry(client: OpenAI, payload: any, maxRetries = 2) {
  let attempt = 0;
  while (true) {
    try {
      return await client.responses.create(payload);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status !== 429 || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitMs = 1500 * attempt;
      console.warn(`429 retry wait ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

// --- タイトル生成ヘルパー（短縮版：/api/assess と同一仕様） -----

function tokenizeForTitle(s: string): string[] {
  return s
    .split(/[\s　\/・,、()\[\]]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function buildMercariTitle(rawTitle: unknown, item_name: string | null, output_text: string): string {
  const baseName = (item_name ?? "").trim();
  const originalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";
  let base = baseName || originalTitle;
  if (!base) return "";

  const baseWords = tokenizeForTitle(base);
  const wordsInBase = new Set(baseWords);

  const extra: string[] = [];
  if (originalTitle) {
    tokenizeForTitle(originalTitle).forEach((t) => {
      if (!wordsInBase.has(t) && !base.includes(t)) extra.push(t);
    });
  }

  let title = base;
  if (extra.length) title += " " + extra.join(" ");

  if (title.length > 40) title = title.slice(0, 40);
  return title;
}

// --- 案E: ジャンル分類（gpt-4.1-mini） ---

type GenreCategory =
  | "brand_bag"
  | "jewelry"
  | "wamon"
  | "kinko_urushi"
  | "watch"
  | "toy"
  | "electronics"
  | "other";

async function classifyGenreForWorker(
  client: OpenAI,
  images: string[]
): Promise<GenreCategory> {
  try {
    const classifyPrompt = [
      "以下の画像の商品ジャンルを1つ選んでJSONで出力してください。",
      "選択肢: brand_bag, jewelry, wamon, kinko_urushi, watch, toy, electronics, other",
      '出力形式: {"genre": "選択肢の1つ"}',
      "JSONのみ出力。説明文禁止。",
    ].join("\n");

    const content: any[] = [
      { type: "input_text", text: classifyPrompt },
      { type: "input_image", image_url: images[0] },
    ];

    const res: any = await callOpenAIWithRetry(client, {
      model: "gpt-4.1-mini",
      temperature: 0,
      max_output_tokens: 50,
      input: [{ role: "user", content }],
    });

    const text = res.output?.[0]?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      const genre = parsed.genre as string;
      const validGenres: GenreCategory[] = [
        "brand_bag", "jewelry", "wamon", "kinko_urushi",
        "watch", "toy", "electronics", "other",
      ];
      if (validGenres.includes(genre as GenreCategory)) {
        return genre as GenreCategory;
      }
    } catch {
      // パース失敗
    }
  } catch (e) {
    console.error("worker ジャンル分類エラー", e);
  }

  return "other";
}

// --- 案E+G: ジャンル別リファレンス取得 ---

async function loadReferencesForGenre(genre: GenreCategory): Promise<string> {
  const blocks: string[] = [];

  try {
    // watch/jewelry もブランド品が多いため brand_data を併せて取得
    if (genre === "brand_bag" || genre === "watch" || genre === "jewelry" || genre === "other") {
      const { data: brandRows } = await supabase
        .from("brand_data_reference_v2")
        .select("brand,line_name,model_name")
        .limit(15);
      if (brandRows?.length) {
        blocks.push(
          "[ブランドバッグ系リファレンス]\n" +
          brandRows.map((r) => `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`).join("\n")
        );
      }
    }

    if (genre === "jewelry" || genre === "other") {
      const { data: jewelryRows } = await supabase.from("jewelry_reference").select("*").limit(15);
      if (jewelryRows?.length) {
        blocks.push("[ジュエリー系リファレンス]\n" + jewelryRows.map((r) => JSON.stringify(r)).join("\n"));
      }
    }

    if (genre === "kinko_urushi" || genre === "wamon" || genre === "other") {
      // 金工・漆器は和物と関連が深いため相互取得
      const { data: kinkoRows } = await supabase.from("kinko_urushi_reference").select("*").limit(15);
      if (kinkoRows?.length) {
        blocks.push("[金工・漆器系リファレンス]\n" + kinkoRows.map((r) => JSON.stringify(r)).join("\n"));
      }
    }

    if (genre === "wamon" || genre === "kinko_urushi" || genre === "other") {
      const { data: wamonRows } = await supabase
        .from("wamon_reference")
        .select(
          "genre,category,author_name,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,authenticity_points,common_fake_patterns,era,school_lineage"
        )
        .limit(20);
      if (wamonRows?.length) {
        blocks.push(
          "[和物（書画・陶磁器・茶道具・箱書）リファレンス]\n" +
          wamonRows
            .map(
              (r) =>
                `ジャンル:${r.genre} / カテゴリ:${r.category} / 作家:${r.author_name} / 筆跡:${r.stroke_traits} / 落款:${r.signature_traits} / 印文:${r.seal_text} / 真贋ポイント:${r.authenticity_points} / 贋作パターン:${r.common_fake_patterns} / 時代:${r.era} / 流派:${r.school_lineage}`
            )
            .join("\n")
        );
      }
    }

    // 教師データ（ジャンルでフィルタ）
    let trainingQuery = supabase
      .from("training_items")
      .select("genre,item_name,output_text,confidence")
      .eq("is_trainable", true)
      .order("created_at", { ascending: false });

    if (genre !== "other") {
      const genreKeywords: Record<GenreCategory, string[]> = {
        brand_bag: ["ブランド", "バッグ", "財布"],
        jewelry: ["ジュエリー", "宝石", "貴金属"],
        wamon: ["書画", "掛軸", "陶磁器", "茶道具"],
        kinko_urushi: ["金工", "漆器", "鉄瓶"],
        watch: ["時計"],
        toy: ["おもちゃ", "フィギュア"],
        electronics: ["家電", "カメラ"],
        other: [],
      };
      const keywords = genreKeywords[genre] ?? [];
      if (keywords.length > 0) {
        const orFilter = keywords.map((kw) => `genre.ilike.%${kw}%`).join(",");
        trainingQuery = trainingQuery.or(orFilter);
      }
    }

    const { data: trainingRows } = await trainingQuery.limit(10);
    if (trainingRows?.length) {
      blocks.push(
        "[過去の教師データ]\n" +
        trainingRows
          .map((r) => `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`)
          .join("\n")
      );
    }
  } catch (e) {
    console.error("リファレンス取得エラー", e);
  }

  return blocks.join("\n\n");
}

// --- SYSTEM PROMPT（/api/assess と同一） ---
const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
  "画像とリファレンス情報をもとに、真贋・型名・状態・相場・出品文を一貫した基準で出力します。",
  "",
  "【最重要方針】",
  "・真贋判定は「確率」であり、保証ではない。",
  "・偽物を本物と誤認するリスクを最小化しつつ、本物の中古商品を不必要に低評価しないこと。",
  "・刻印/フォント/内部構造など\u201C偽物が破綻しやすい部位\u201Dを最重視する。",
  "・汚れ/スレ/自然劣化は中古では通常発生するため、偽物判定の主因にしない。",
  "・一致点と不一致点を総合評価し、偏った判定にしない。",
  "",
  "【真贋出力ルール】",
  "1) 本物の可能性が高い（80〜90%）",
  "2) 要追加写真（60〜79%）",
  "3) 偽物の可能性が高い（0〜59%）",
  "",
  "【想定相場】",
  "・実売相場の下限〜中央値を控えめに提示。",
  "・不明な場合は「【想定相場】不明（データ不足）」とする。",
  "",
  "【JSONルール】",
  "返答はJSONのみ。コードブロック禁止。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / confidence / genre / item_name",
].join("\n");

// --- 1ジョブを処理するメイン関数 (案E対応) ---

async function processJob(job: any) {
  const images: string[] = job.image_urls ?? [];

  // Step 1: ジャンル分類
  const detectedGenre = await classifyGenreForWorker(openai, images);
  console.log(`[worker] ジャンル分類: ${detectedGenre} (job=${job.id})`);

  // Step 2: 関連リファレンスだけ取得
  const references = await loadReferencesForGenre(detectedGenre);

  const content: any[] = [
    { type: "input_text", text: SYSTEM_PROMPT },
    { type: "input_text", text: `【事前分類】この商品は「${detectedGenre}」ジャンルと判定されました。参考にしてください。` },
    references ? { type: "input_text", text: references + "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。" } : null,
    ...images.map((u) => ({ type: "input_image", image_url: u })),
  ].filter(Boolean);

  // OpenAI 呼び出し
  const aiRes: any = await callOpenAIWithRetry(openai, {
    model: "gpt-4.1",
    temperature: 0.2,
    max_output_tokens: 1600,
    input: [{ role: "user", content }],
  });

  const first = aiRes.output?.[0]?.content?.[0];
  const rawText = first?.text ?? "";
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error("JSON parse failed");
  }

  // 整形
  let output_text = parsed.output_text ?? rawText;
  if (!output_text.includes("【想定相場】")) {
    output_text += "\n【想定相場】不明（データ不足）";
  }

  const item_name = parsed.item_name ?? null;
  const mercari_title = buildMercariTitle(parsed.mercari_title, item_name, output_text);
  const mercari_description = parsed.mercari_description ?? output_text;
  const confidence = parsed.confidence ?? null;
  const genre = parsed.genre ?? null;

  // worker の戻り値として返す（DB更新にも使う）
  return {
    output_text,
    mercari_title,
    mercari_description,
    confidence,
    genre,
    item_name,
    detected_genre: detectedGenre,
  };
}

// --- worker の本体 -----------------------------------------------------

export async function GET(req: NextRequest) {
  // ★ 認証: CRON_SECRETが設定されている場合は検証
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (bearerToken !== cronSecret) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 1. pending ジョブを最大 3 件だけ取得
    const { data: jobs } = await supabase
      .from("assessment_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let processed = 0;

    for (const job of jobs) {
      try {
        // 2. processing にする
        await supabase.from("assessment_jobs").update({ status: "processing" }).eq("id", job.id);

        // 3. 査定実行
        const result = await processJob(job);

        // 4. DB 更新
        await supabase
          .from("assessment_jobs")
          .update({
            status: "done",
            result,
            error_message: null,
          })
          .eq("id", job.id);

        processed += 1;
      } catch (err: any) {
        console.error("Job failed", job.id, err);

        await supabase
          .from("assessment_jobs")
          .update({
            status: "error",
            error_message: err?.message ?? "unknown error",
          })
          .eq("id", job.id);
      }
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e: any) {
    console.error("worker error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "worker unknown error" },
      { status: 500 }
    );
  }
}
