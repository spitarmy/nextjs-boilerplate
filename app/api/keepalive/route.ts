import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabaseプロジェクトの一時停止を防ぐためのヘルスチェックエンドポイント
// Vercel Cron で定期的に呼び出す
export async function GET() {
  try {
    const start = Date.now();

    // profilesテーブルに1行だけSELECTしてDBを起こす
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1);

    const elapsed = Date.now() - start;

    if (error) {
      console.log(`[KEEPALIVE] DB error: ${error.message} (${elapsed}ms)`);
      return NextResponse.json({ ok: false, error: error.message, elapsed_ms: elapsed }, { status: 500 });
    }

    console.log(`[KEEPALIVE] OK rows=${data?.length ?? 0} elapsed=${elapsed}ms`);
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      elapsed_ms: elapsed,
      rows: data?.length ?? 0,
    });
  } catch (e: any) {
    console.error("[KEEPALIVE] exception", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "keepalive error" }, { status: 500 });
  }
}
