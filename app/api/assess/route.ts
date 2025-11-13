// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/assess
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      image_urls?: string[];
      image_url?: string;
    };

    const urls =
      (Array.isArray(body.image_urls) && body.image_urls.length
        ? body.image_urls
        : body.image_url
        ? [body.image_url]
        : []
      ).filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0,
      );

    return NextResponse.json({
      ok: true,
      version: 'dummy-echo-1',
      received_count: urls.length,
      received: urls,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(err?.message ?? err ?? 'unknown error'),
      },
      { status: 500 },
    );
  }
}

// GET /api/assess（動作確認用）
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: 'dummy-echo-1',
    message: 'assess endpoint is alive',
  });
}
