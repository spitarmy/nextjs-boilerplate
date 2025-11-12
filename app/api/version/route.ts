// app/api/version/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: 'api-v6-responses-imagedata',
    runtime,
    now: Date.now(),
  });
}
