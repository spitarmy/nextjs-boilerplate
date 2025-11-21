// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 共通プロンプト（JSON で返させる）
const SYSTEM_PROMPT =
  "あなたは骨董・ブランド・和装などリサイクル商品の査定AIです。" +
  "与えられた画像をよく観察し、カテゴリ・型名・状態・想定販売価格（フリマアプリの相場感）・注意点を日本語で丁寧にまとめてください。" +
  "説明文には、状態・サイズ感・付属品・注意事項・検索用ワードを適度に含めてください。" +
  "出力は必ず JSON 形式の文字列だけで返してください。" +
  'フォーマット: {"output_text":"概要と査定コメント","mercari_title":"40文字以内タイトル","mercari_description":"200〜400文字程度の説明文"}';

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

    // いろんな形で来ても頑張って画像の配列にそろえる
    const raw = (body as any).image_urls ?? (body as any).images ?? null;

    let images: string[] = [];

    if (Array.isArray(raw)) {
      images = raw
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
        .filter((u): u is string => !!u && u.trim().length > 0);
    }

    // data:〜 でも http(s):// でも OK にする
    if (!images.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "有効な画像データがサーバーに届きませんでした。画像の選択やネットワークを確認してください。",
        },
        { status: 400 }
      );
    }

    const content: any[] = [
      {
        type: "input_text",
        text: SYSTEM_PROMPT,
      },
      ...images.map((u) => ({
        type: "input_image",
        image_url: u,
      })),
    ];

    // OpenAI に査定を依頼
    const aiRes: any = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content,
        },
      ],
    });

    const first = aiRes.output?.[0]?.content?.[0];
    const text: string = first?.text ?? "";

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
            "一時的なエラーによりJSONの整形はできませんでしたが、上記の査定コメントを参考に出品文を作成してください。",
        },
        { status: 200 }
      );
    }

    const output_text =
      typeof parsed.output_text === "string" ? parsed.output_text : String(text);
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
