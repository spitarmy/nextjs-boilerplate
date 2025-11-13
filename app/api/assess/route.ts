// app/api/assess/route.ts
// @ts-nocheck  ← TypeScriptの型エラーを気にしないようにする

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

    // 🔸 OpenAI Responses API に送る入力
    const input = [
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
          // ここで画像を全部つなぐ
          ...imageUrls.map((url) => ({
            type: "input_image",
            image_url: { url }, // ← ここがポイント。「文字列」じゃなくて { url: string }
          })),
        ],
      },
    ];

    const response: any = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      max_output_tokens: 1024,
    });

    // 🔸 OpenAI からの返り値からテキストを取り出す
    let outputText = "";
    const first = response.output?.[0];
    if (first?.type === "message") {
      const textPart = first.message.content.find(
        (c: any) => c.type === "output_text"
      );
      outputText = textPart?.text ?? "";
    }

    if (!outputText) {
      return NextResponse.json(
        { ok: false, error: "AI からテキストが返ってきませんでした。" },
        { status: 500 }
      );
    }

    // 🔸 モデルから返ってきたJSON文字列をパース
    let parsed: any = {};
    try {
      parsed = JSON.parse(outputText);
    } catch {
      // JSONじゃなかった場合でも一応生テキストは返す
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
