// app/api/appraise/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Payload = { imageUrl?: string };

export async function POST(req: Request) {
  try {
    const { imageUrl } = (await req.json()) as Payload;
    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an appraisal assistant for a recycle shop. Judge authenticity and give a concise rationale and rough resale price in JPY when possible.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `
対象の写真を見てください。以下のJSONだけで返答してください:
{
  "verdict": "<Likely authentic | Unclear | Suspicious>",
  "confidence": <0-100>,
  "summary": "<日本語で100字程度の説明。根拠を簡潔に>",
  "suggestedPrice": <number | omit>
}
注意:
- 信頼度は数値(整数)。
- 不明な場合は "Unclear"。
- 価格は分からなければ省略。
` },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content || '{}';
    const json = JSON.parse(raw);

    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
