export const runtime = 'nodejs';

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// 画像URLを受け取り、OpenAI に投げてテキストを返す
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { image_url?: string };
    const imageUrl = body?.image_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt =
      '画像から読み取れるブランド/素材/型/年代/状態/付属品/真贋の観点を簡潔に日本語で整理してください。';

    // SDK の型エラー回避のため as any を使用（挙動は問題なし）
    const resp: any = await client.responses.create({
      model: 'gpt-4o-mini',
      instructions: 'あなたは経験豊富なリユース査定士です。はっきり簡潔に回答します。',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageUrl, detail: 'low' },
          ],
        },
      ],
    } as any);

    const text =
      resp?.output_text ??
      resp?.output?.[0]?.content?.[0]?.text ??
      'テキスト出力なし';

    return new Response(JSON.stringify({ output_text: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    const msg = e?.message ?? 'unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
