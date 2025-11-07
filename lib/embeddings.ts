// lib/embeddings.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * 与えたテキストの embedding を生成して number[] で返す。
 * kb_refs の embedding 列は 1536 次元なので、モデルは text-embedding-3-small を使用。
 */
export async function embedText(text: string): Promise<number[]> {
  const input = text || " ";
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small", // 1536 次元・低コスト
    input,
  });
  return res.data[0].embedding;
}
