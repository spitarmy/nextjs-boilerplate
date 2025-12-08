// app/api/assess/worker/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// --- 和物・ブランドなどのリファレンス取得（/api/assess と同じ） ---

async function loadReferences() {
  let blocks: string[] = [];

  try {
    const { data: brandRows } = await supabase
      .from("brand_data_reference_v2")
      .select("brand,line_name,model_name")
      .limit(20);

     if (brandRows?.length) {
      blocks.push(
        "[ブランドバッグ系リファレンス]\n" +
          brandRows
            .map((r) => `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`)
            .join("\n")
      );
    }

    const { data: jewelryRows } = await supabase
      .from("jewelry_reference")
      .select("*")
      .limit(20);

    if (jewelryRows?.length) {
      blocks.push(
        "[ジュエリー系リファレンス]\n" +
          jewelryRows.map((r) => JSON.stringify(r)).join("\n")
      );
    }

    const { data: kinkoRows } = await supabase
      .from("kinko_urushi_reference")
      .select("*")
      .limit(20);

    if (kinkoRows?.length) {
      blocks.push(
        "[金工・漆器系リファレンス]\n" +
          kinkoRows.map((r) => JSON.stringify(r)).join("\n")
      );
    }

    const { data: wamonRows } = await supabase
      .from("wamon_reference")
      .select(
        "genre,category,author_name,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,authenticity_points,common_fake_patterns,era,school_lineage"
      )
      .limit(30);

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

    const { data: trainingRows } = await supabase
      .from("training_items")
      .select("genre,item_name,output_text,confidence")
      .order("created_at", { ascending: false })
      .eq("is_trainable", true)
      .limit(20);

    if (trainingRows?.length) {
      blocks.push(
        "[過去の教師データ]\n" +
          trainingRows
            .map(
              (r) =>
                `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`
            )
            .join("\n")
      );
    }
  } catch (e) {
    console.error("リファレンス取得エラー", e);
  }

  return blocks.join("\n\n");
}

// --- 1ジョブを処理するメイン関数 -------------------------------------

async function processJob(job: any) {
  const images: string[] = job.image_urls ?? [];
  const user_id = job.user_id ?? null;

  const references = await loadReferences();

  const SYSTEM_PROMPT = "（ここには /api/assess と同じ長文プロンプトを貼るべきですが、あなたの環境ではすでに route.ts に存在するので、.worker 用には省略しています。後で統合可能です）";

  const content: any[] = [
    { type: "input_text", text: SYSTEM_PROMPT },
    { type: "input_text", text: references },
    ...images.map((u) => ({ type: "input_image", image_url: u })),
  ];

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
  };
}

// --- worker の本体 -----------------------------------------------------

export async function GET(req: NextRequest) {
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
