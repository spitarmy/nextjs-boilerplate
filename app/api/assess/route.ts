// Node ランタイムで OpenAI SDK を使う
export const runtime = 'nodejs';

import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { image_url } = (await req.json()) as { image_url?: string };

    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // 画像＋テキストのマルチモーダルで査定プロンプト
    const prompt =
      'あなたは中古リユースのプロ鑑定士です。画像を見て以下を日本語で簡潔に出力してください。' +
      '1) アイテム種別/ブランド推定 2) 真贋の着眼点（確証ではなく可能性） 3) 状態ランク（S/A/B/C） 4) 国内相場レンジ(概算) 5) 仕入れ上限目安(相場の20〜30%)。';

    const resp = await client.responses.create({
      model: 'gpt-4o-mini', // 画像理解が速くて安価
      input: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'input_image', image_url: image_url }
          ]
        }
      ]
    });

    const assessment =
      resp.output_text?.trim() ||
      resp.content?.map((c: any) => c?.text)?.filter(Boolean)?.join('\n') ||
      '回答取得に失敗しました。';

    return Response.json({ ok: true, assessment });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500 });
  }
}
