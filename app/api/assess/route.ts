import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';           // 早い・安定
export const dynamic = 'force-dynamic';  // キャッシュ回避

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type ReqBody = {
  image_url?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReqBody;
    const imageUrl = body.image_url?.trim();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'image_url is required' },
        { status: 400 }
      );
    }

    // --- Chat Completions（画像+テキスト） ---
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'あなたは中古リユース査定「カンテノ」です。画像から推定ブランド/素材/型/年代/状態/付属品/真贋の要点を日本語で、最後に概算価格帯(円)を出力します。根拠を簡潔に示し、確信度も%で付けてください。出力は整形済みテキストのみ。',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'この1枚の画像から分かる範囲で査定してください。足りない視点があれば追撮の指示もください。',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    const text = completion.choices[0]?.message?.content ?? '';

    // フロントが扱いやすい形（既存互換）
    return NextResponse.json({
      output_text: text,
    });
  } catch (err: any) {
    const msg =
      typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
