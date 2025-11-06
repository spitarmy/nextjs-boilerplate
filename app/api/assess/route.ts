export const runtime = 'nodejs';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { image_url } = (await req.json()) as { image_url?: string };
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), {
        status: 400,
      });
    }

    const prompt = `
あなたは日本の中古リユース市場の鑑定士です。
以下の画像を見て次の5項目を日本語で出力してください。
1) アイテム種別 / ブランド候補
2) 真贋の着眼点（確率的な推定でOK）
3) 状態ランク（S/A/B/C）
4) 国内相場レンジ（円）
5) 仕入れ上限目安（相場の20〜30%）
    `;

    // 型の厳密チェックを回避しつつ、正しい実行形式
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image_url } as any },
          ] as any,
        },
      ],
      temperature: 0.2,
    });

    const assessment =
      response.choices?.[0]?.message?.content?.toString() ||
      '結果を取得できませんでした。';

    return new Response(JSON.stringify({ ok: true, assessment }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('API Error:', err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500 }
    );
  }
}
