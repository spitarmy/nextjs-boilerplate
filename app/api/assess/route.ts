import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { image_url } = await req.json() as { image_url?: string };
    if (!image_url) {
      return new Response(JSON.stringify({ error: "image_url is required" }), { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // あなたのシステムプロンプト（そのまま流用OK）
    const systemPrompt =
      "画像から中古ブランド/時計/陶磁器/絵画などの基本特定ポイントと概算価格帯を100~120字で。";

    // ユーザープロンプト（そのまま流用OK）
    const userPrompt =
      "この写真のアイテムを査定してください。ブランド/型番/年代/素材/真贋観点/ランク/国内相場/仕入れ目安も。";

    // ★ここが重要： 'input_text' / 'input_image' を使う
    const vis = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            { type: "input_image", image_url: image_url },
          ],
        },
      ],
    });

    // 出力テキストの取り出し（SDKのショートカット）
    const text = vis.output_text;

    return Response.json({ ok: true, result: text });
  } catch (err: any) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err?.message ?? "unknown error" }),
      { status: 500 }
    );
  }
}
