// app/api/assess/result/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const job_id = req.nextUrl.searchParams.get("job_id");

    if (!job_id) {
      return NextResponse.json(
        { ok: false, error: "job_id が指定されていません。" },
        { status: 400 }
      );
    }

    const { data: job, error } = await supabase
      .from("assessment_jobs")
      .select("status, result, error_message")
      .eq("id", job_id)
      .single();

    if (error || !job) {
      console.error("assessment_jobs fetch error", error);
      return NextResponse.json(
        { ok: false, error: "指定されたジョブが見つかりません。" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        status: job.status,              // "pending" | "processing" | "done" | "error"
        result: job.result ?? null,      // done のときに査定結果が入る
        error: job.error_message ?? null // error の場合のメッセージ
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("result api error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "結果取得中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
