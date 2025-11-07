// app/api/assess/route.ts
export const runtime = "nodejs";

import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type AssessRequest = { image_url?: string; prompt?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AssessRequest;
    const imageUrl = body.image_url?.trim();
    const userPrompt =
      (body.prompt ?? "").trim() ||
      "画像から読み取れるブランド/素材/型/年代感/状態ポイントを箇条書きで40〜120字。";

    const userContent: any[] = [{ type: "input_text", text: userPrompt }];
    if (imageUrl) {
      userContent.push({
        type: "input_image",
        image_url: imageUrl,
        detail: "high", // ★必須
      });
    }

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      // system相当は instructions に文字列で渡す（ここで {type:"text"} を使わない）
      instructions:
        "あなたはリユース査定士。曖昧な場合は推測の根拠を簡潔に。最終行に国内相場レンジと仕入れ目安も示す。",
      input: [
        {
          role: "user",
          content: userContent, // ★ user配列には input_* だけを入れる
        },
      ],
    });

    return Response.json({ text: resp.output_text ?? "" });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e?.message ?? "unknown error" }),
      { status: 500 }
    );
  }
}
