// app/api/assess/route.ts
export const runtime = "nodejs";

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type AssessRequest = { image_url?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssessRequest;
    const imageUrl = body.image_url?.trim();
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "image_url is required" }), { status: 400 });
    }

    // ここに「カンテノ用のプロンプト」
    const prompt =
      "画像から読み取れるブランド/素材/型/年代/状態ポイントを要点箇条書きで40〜120字内。最後に国内相場レンジと仕入れ目安(20〜30%)も。";

    // Responses API: input は content ブロック配列
    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      // システム相当を使いたいときは instructions
      instructions:
        "あなたはリユース査定士。曖昧な場合は推測の度合いを明記し、確証が必要な箇所は『要実機確認』と書くこと。",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageUrl },
          ],
        },
      ],
    });

    // SDK v4: 一番簡単に本文を取る
    const text = resp.output_text ?? "(no result)";

    return Response.json({
      ok: true,
      summary: text,
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown error" }), { status: 500 });
  }
}
