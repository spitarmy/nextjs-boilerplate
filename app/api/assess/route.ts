// app/api/assess/route.ts
// @ts-nocheck

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);

    // フロントから image_urls: string[] が来る想定（1枚のときは image_url でもOK）
    const imageUrls: string[] =
      body?.image_urls ??
      (body?.image_url ? [body.image_url] : []);

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "image_urls が空です。" },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    const response: any = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "あなたは質屋『リサイくん』の査定担当AIです。" +
                "送られた写真をもとに、ブランド品・骨董・雑貨などを査定し、" +
                "メルカリ出品用のタイトルと説明文を日本語で作成してください。" +
                "必ず次のJSON形式だけを返してください：" +
                `{"output_text":"査定の要約","mercari_title":"40字以内のタイトル","mercari_description":"メルカリ出品説明文"}`,
            },
            // 🔴 ここがポイント：image_url は「そのまま文字列」で渡す
            ...imageUrls.map((url: string) => ({
              type: "input_image",
              image_url: url, // ← 文字列！ { url } ではない！
            })),
          ],
        },
      ],
      max_output_tokens: 1024,
    });

    // --- 返ってきたテキストを取り出す ---
    let outputText = "";

    try {
      const first = response.output?.[0];
      const firstContent = first?.content?.[0];

      if (
        firstContent &&
        (firstContent.type === "output_text" || firstContent.type === "text")
      ) {
        outputText = firstContent.text;
      }
    } catch (e) {
      console.log("parse output error:", e);
    }

    if (!outputText) {
      // 取れなかった場合はデバッグ用に全部JSON化
      outputText = JSON.stringify(response);
    }

    // --- モデルからのJSONをパース ---
    let parsed: any = {};
    try {
      parsed = JSON.parse(outputText);
    } catch {
      parsed = {};
    }

    const mercariTitle =
      parsed.mercari_title ?? parsed.title ?? "【仮】カンテノ自動査定";
    const mercariDescription =
      parsed.mercari_description ?? parsed.description ?? outputText;

    return NextResponse.json(
      {
        ok: true,
        output_text: outputText,
        mercari_title: mercariTitle,
        mercari_description: mercariDescription,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("assess error", e);
    const msg =
      e?.response?.data?.error?.message ||
      e?.message ||
      "不明なエラーが発生しました。";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
