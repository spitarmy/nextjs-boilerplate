// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
      ).filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

    if (urls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "no image urls provided" },
        { status: 400 }
      );
    }

    // 🧪 OpenAI 最小動作テスト
    const response = await client.responses.create({
      model: "gpt-4o-mini",   // 軽いモデル
      input: [
        { role: "system", content: "You are test AI." },
        {
          role: "user",
          content: [
            { type: "input_text", text: "簡単に返事して下さい。" },
            ...urls.map((u) => ({ type: "input_image", image_url: u })),
          ],
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      version: "openai-test-1",
      urls,
      ai_output: response.output_text,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: String(err?.message ?? err ?? "unknown error"),
        stack: err?.stack || null,
      },
      { status: 500 }
    );
  }
}

// GET
export async function GET() {
  return NextResponse.json({
    ok: true,
    version: "openai-test-1",
    message: "assess endpoint alive",
  });
}
