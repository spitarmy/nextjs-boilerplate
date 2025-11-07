// /app/api/assess/route.ts
export const runtime = 'nodejs';

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { image_url?: string };
    const imageUrl = body?.image_url;
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    // システム方針（短め）
    const system =
      'あなたはリユース査定員。画像と説明をもとに一般向けの査定サマリを日本語で簡潔に出力する。';

    // ユーザーへのプロンプト（要約＋出力フォーマット指示）
    const prompt =
      [
        '次を見て「アイテム種別/ブランド候補」「真贋観点（箇条書き）」「状態ランク（S/A/B/C）」「国内相場レンジ（円）」「仕入上限目安（円）」を簡潔に。40〜120字で。',
        '不確実な点は「確認ポイント」に回して、断定しない書き方にする。'
      ].join('\n');

    const resp = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageUrl }
          ]
        }
      ]
    });

    // Responses API は output_text で本文を取れる
    const text = resp.output_text ?? '(no output)';

    return Response.json({ result: text });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'unexpected error' }),
      { status: 500 }
    );
  }
}
