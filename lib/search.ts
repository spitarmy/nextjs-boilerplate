// lib/search.ts
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function kanteSearch(prompt: string, imageUrl?: string) {
  const content: any[] = [{ type: "input_text", text: prompt }];
  if (imageUrl) content.push({ type: "input_image", image_url: imageUrl });

  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [{ role: "user", content }],
  });

  return resp.output_text ?? "";
}
