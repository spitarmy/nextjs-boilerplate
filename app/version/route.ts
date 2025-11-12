// /app/api/version/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// シンプルなAPI：現在のバージョン情報を返すだけ
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: 'api-v6-responses-imagedata',
    runtime: 'nodejs',
    now: Date.now(),
  });
}
