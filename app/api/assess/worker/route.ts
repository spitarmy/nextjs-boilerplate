// app/api/assess/worker/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// いまはキュー方式をまだ使っていないので、
// このエンドポイントは何も処理せずに空のレスポンスだけ返します。
// （後で本格的なキューワーカーを実装するときにここを書き換えればOK）
export async function GET(req: NextRequest) {
  return NextResponse.json(
    {
      ok: true,
      processed: 0,
      message: "worker stub: no jobs processed.",
    },
    { status: 200 }
  );
}
