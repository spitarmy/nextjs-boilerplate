// app/api/assess/route.ts
export const runtime = 'nodejs';

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const body = await req.json() as { image_url?: string };
    const imageUrl = body.image_url?.trim();

    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    // システム指示（日本語）
    const system =
      'あなたはリユース査定士。画像とテキストを分析して、一般ユーザーに分かりやすく簡潔に回答する。推測は「〜の可能性」で表現し、断定しない。';

    // ユーザー向けプロンプト（日本語）
    const prompt =
      '画像から読み取れるブランド/カテゴリ/素材/使用感/修復ポイントと総評を、40〜120字で。'
      + ' その後に箇条書きで「確認すべき箇所（ロゴ・刻印・縫製・金具・型番等）」も3〜6個。';

    // ★ Chat Completions API を使う（混在させない）
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          // 画像＋テキストのマルチパート
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const text = chat.choices[0]?.message?.content ?? '解析に失敗しました。';

    return new Response(JSON.stringify({ result: text }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err?.message ?? 'unknown error' }), { status: 500 });
  }
}
