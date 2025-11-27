// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 共通プロンプト（JSON で返させる）
const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨など幅広いジャンルの査定AIです。",
  "画像からブランド名・カテゴリ・型名・状態・特徴を精密に分析し、",
  "社内向けの査定コメント・真贋確度（confidence）・メルカリ向けの出品文を分離して生成してください。",
  "",
  "【厳守ルール】",
  "◆ 出力は必ず JSON 文字列のみ。",
  "◆ JSON のキーは output_text / mercari_title / mercari_description / confidence の4つのみ。",
  "◆ confidence は 0〜100 の整数（%）で返し、理由を１〜３行で説明。",
  "",
  "【output_text（社内用）】",
  "・1〜５行のみ。",
  "・真贋、型名、状態、推定販売価格を含める。",
  "・価格は「◯◯,000〜◯◯,000円前後」で書く。",
  "",
  "【confidence（真贋信頼度）】",
  "・0〜100 の整数で返す。",
  "・画像から判断した真贋確度を示す。",
  "・例：85 なら「85%」という意味。",
  "",
  "【mercari_title（40文字以内）】",
  "・ブランド名 + ライン/柄 + アイテム名 + 色/特徴 + 状態。",
  "",
  "【mercari_description（200〜400文字）】",
  "① 商品概要",
  "② 状態説明",
  "③ サイズ感・付属品",
  "④ 注意事項",
  "⑤ 検索タグ（1行）",
  "",
  "【禁止事項】",
  "・査定・相場・AI・内部情報を本文に含めない。",
  "・金額を mercari_description に書かない。",
  "",
  "【JSONフォーマット】",
  '必ず以下の形式の JSON 文字列のみを返す：',
  '{"output_text":"社内用コメント","mercari_title":"タイトル","mercari_description":"説明文","confidence":90}'
].join("\\n");



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
      model: "gpt-4.1",
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
    const SYSTEM_PROMPT = [
  // ← ここ追加
const confidence =
  typeof parsed.confidence === "number" ? parsed.confidence : null;

return NextResponse.json(
  {
    ok: true,
    output_text,
    mercari_title,
    mercari_description,
    confidence,         // ← フロントに返す
  },
  { status: 200 }
);

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
