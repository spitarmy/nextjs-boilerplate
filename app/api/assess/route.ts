export const runtime = 'nodejs';
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { image_url } = await req.json() as { image_url?: string };
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    const system = 'あなたはリユース査定士。画像とテキストを分析し、断定せず確度表現で簡潔に答える。';
    const prompt = '画像からブランド/カテゴリ/素材/使用感/修復ポイントと総評を40〜120字で。その後、確認すべき箇所を3〜6個の箇条書きで。';

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image_url } },
          ],
        },
      ],
    });

    const text = chat.choices[0]?.message?.content ?? '解析に失敗しました。';
    return new Response(JSON.stringify({ result: text }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown error' }), { status: 500 });
  }
}
