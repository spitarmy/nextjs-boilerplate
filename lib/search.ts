// lib/search.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function kanteSearch(prompt: string, imageUrl?: string) {
  const content: any[] = [{ type: "input_text", text: prompt }];
  if (imageUrl) {
    content.push({
      type: "input_image",
      image_url: imageUrl,
      detail: "high", // ★必須
    });
  }

  const resp = await openai.responses.create({
    model: "gpt-4o-pro",
    instructions:
      "あなたはリユース査定士。曖昧な場合は推測の根拠を短く書く。日本語で簡潔に答える。",
    input: [
      {
        role: "user",
        content, // ← user は input_* だけ
      },
    ],
  });

  return resp.output_text ?? "";
}
