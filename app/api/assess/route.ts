// app/api/assess/route.ts
export const runtime = 'nodejs';

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type AssessRequest = { image_url?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssessRequest;
    const image_url = body.image_url?.trim();

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    // システム/ユーザープロンプト
    const system =
      'あなたはリユース査定の専門家。画像やテキストから鑑定・状態評価・検査ポイントを日本語で簡潔に述べる。';
    const prompt =
      '画像から読み取れるブランド/素材/型/年代感/状態/検査ポイントを要点箇条書きで40〜120字で。';

    // ★ Responses API は user 側で type: input_text / input_image を使う！
    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'text', text: system }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url },
          ],
        },
      ],
    });

    // テキストを安全に取り出す
    const output =
      // SDKのヘルパ
      (resp as any).output_text ??
      // 念のためのフォールバック
      (resp as any).output?.[0]?.content?.[0]?.text?.value ??
      '結果の抽出に失敗しました。';

    return Response.json({ result: output });
  } catch (err: any) {
    console.error('assess error', err);
    return new Response(
      JSON.stringify({ error: API error: ${err?.message ?? 'unknown'} }),
      { status: 500 }
    );
  }
}
