// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /api/assess
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "リクエストボディ(JSON)が不正です。" },
        { status: 400 }
      );
    }

    const raw = (body as any).image_urls;

    // いろんな形で来ても頑張って URL の配列にそろえる
    let urls: string[] = [];

    if (Array.isArray(raw)) {
      urls = raw
        .map((v) => {
          if (typeof v === "string") return v;
          if (v && typeof v === "object") {
            if (typeof (v as any).url === "string") return (v as any).url;
            if (typeof (v as any).image_url === "string")
              return (v as any).image_url;
            if (typeof (v as any).src === "string") return (v as any).src;
          }
          return null;
        })
        .filter((u): u is string => !!u)
        .map((u) => u.trim())
        // OpenAI が受け付ける形だけ残す（http/https）
        .filter((u) => /^https?:\/\//i.test(u));
    }

    if (!urls.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "有効な画像URLがサーバーに届きませんでした。アップロード処理かネットワークを確認してください。",
        },
        { status: 400 }
      );
    }

    // OpenAI に投げる content を作成
    const content: any[] = [
      {
        type: "input_text",
        text:
          "あなたは骨董・ブランド・和装などリサイクル商品の査定AIです。" +
          "画像をよく観察し、カテゴリ・状態・想定販売価格・注意点を日本語で丁寧にまとめてください。" +
          "最後にメルカリ用タイトル(40文字以内)と、説明文(200〜400文字程度)をJSONで返してください。" +
          'フォーマット: {"output_text":"概要と査定コメント","mercari_title":"タイトル","mercari_description":"説明文"}',
      },
      ...urls.map((u) => ({
        type: "input_image",
        image_url: u, // ★ ここは必ず string になるよう上で整形済み
      })),
    ];

    const aiRes = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content,
        },
      ],
    });

    const first = aiRes.output?.[0]?.content?.[0];
    const text = (first as any)?.text ?? "";

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          error: "AI から有効なテキスト出力が得られませんでした。",
        },
        { status: 500 }
      );
    }

    // モデルからは JSON 文字列を返すよう指示しているので、パースを試みる
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // パースできなかった場合でも、output_text だけは返す
      return NextResponse.json(
        {
          ok: true,
          output_text: text,
          mercari_title: "【仮】カンテノ自動査定",
          mercari_description:
            "一時的なエラーにより詳細な整形はできませんでしたが、上記の査定コメントを参考に出品文を作成してください。",
        },
        { status: 200 }
      );
    }

    const output_text =
      typeof parsed.output_text === "string"
        ? parsed.output_text
        : String(text);
    const mercari_title =
      typeof parsed.mercari_title === "string"
        ? parsed.mercari_title
        : "【仮】カンテノ自動査定";
    const mercari_description =
      typeof parsed.mercari_description === "string"
        ? parsed.mercari_description
        : output_text;

    return NextResponse.json(
      {
        ok: true,
        output_text,
        mercari_title,
        mercari_description,
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("assess error", e);
    const msg =
      e?.response?.data?.error?.message ||
      e?.message ||
      "査定処理中に不明なエラーが発生しました。";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
