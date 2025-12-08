// app/api/assess/worker/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ここに SYSTEM_PROMPT, buildMercariTitle, callOpenAIWithRetry など
// さっきまで route.ts に書いていたものをそのままコピペしてOKです。
// （評価ロジック自体は変えなくて大丈夫）

// 例: sleep, callOpenAIWithRetry だけ簡単に再定義
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOpenAIWithRetry(
  client: OpenAI,
  payload: any,
  maxRetries = 2
): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await client.responses.create(payload);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status !== 429 || attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
      const waitMs = 1500 * attempt;
      console.warn(
        `OpenAI rate limit (429) on attempt ${attempt}, retrying in ${waitMs}ms`
      );
      await sleep(waitMs);
    }
  }
}

// 実際に1ジョブを処理する関数
async function processJob(job: any) {
  const images: string[] = job.image_urls ?? [];
  const user_id: string | null = job.user_id ?? null;

  // （ここに、元の route.ts から
  //   Supabaseリファレンス取得 -> OpenAI呼び出し -> JSONパース
  //   -> appraisals / training_items INSERT
  //   をほぼ丸ごと移植します）
  // ※ 違うのは「req.json()」ではなく、job から取る点だけ

  // ... ここに旧ロジックを移植 ...

  // 最後に、assessment_jobs の result と status を更新
  const resultPayload = {
    output_text,
    mercari_title,
    mercari_description,
    confidence,
    genre,
    item_name,
  };

  await supabase
    .from("assessment_jobs")
    .update({
      status: "done",
      result: resultPayload,
      error_message: null,
    })
    .eq("id", job.id);
}

// GET /api/assess/worker
export async function GET(req: NextRequest) {
  try {
    // 未処理ジョブを数件だけ取る（例: 3件）
    const { data: jobs, error } = await supabase
      .from("assessment_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (error) {
      console.error("fetch jobs error", error);
      return NextResponse.json(
        { ok: false, error: "ジョブ取得に失敗しました。" },
        { status: 500 }
      );
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 }, { status: 200 });
    }

    let processed = 0;

    for (const job of jobs) {
      try {
        // 状態を processing にする
        await supabase
          .from("assessment_jobs")
          .update({ status: "processing" })
          .eq("id", job.id);

        await processJob(job);
        processed += 1;
      } catch (e: any) {
        console.error("job failed", job.id, e);
        await supabase
          .from("assessment_jobs")
          .update({
            status: "error",
            error_message: e?.message ?? "unknown error",
          })
          .eq("id", job.id);
      }
    }

    return NextResponse.json({ ok: true, processed }, { status: 200 });
  } catch (e: any) {
    console.error("worker error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "workerでエラーが発生しました。" },
      { status: 500 }
    );
  }
}
