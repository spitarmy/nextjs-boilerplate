// app/api/assess/route.ts
import OpenAI from 'openai';
import { kbSearchSmart } from '@/lib/search';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { image_url } = (await req.json()) as { image_url?: string };
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // 1) 画像から短い説明文を抽出
    const system = 'あなたは骨董・ブランド・美術・工芸のバイヤー補助AIです。短く正確に。';
    const ask =
      '画像から読み取れるブランド/素材/型/時代感/状態ポイントを要点箇条書きで40〜120字程で。';

    const vis = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: [{ type: "text", text: system }] },
        {
          role: "user",
          content: [
            { type: "text", text: ask },
            { type: "input_image", image_url }
          ]
        }
      ]
    });

    const draft = vis.output_text?.trim() || '画像説明が抽出できませんでした。';

    // 2) 説明文で KB 検索（弱ければAIが検索語を整えて再検索）
    const { query, results } = await kbSearchSmart(draft, 8);

    // 3) レスポンス
    return Response.json({
      summary: draft,
      search_query: query,
      matches: results
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), { status: 500 });
  }
}
