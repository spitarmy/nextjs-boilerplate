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
  [
    "あなたは骨董・ブランド・和装などリサイクル商品の査定AIです。",
    "画像からブランド／カテゴリ／型名／状態を推定し、フリマアプリ（メルカリ想定）の実勢相場をもとに査定してください。",
    "出力は必ず JSON 形式の文字列だけで返してください。",
    "",
    "【フィールド定義】",
    "1. output_text（社内用コメント）:",
    "  - 真贋・カテゴリ・型名・状態・想定販売価格を1〜5行で簡潔にまとめる。",
    "  - 価格は「◯◯,000〜◯◯,000円程度」など具体的に書いてよい。",
    "  - メルカリ・出品・説明文などの単語は出さない。あくまで社内メモ。",
    "",
    "2. mercari_title（メルカリ用タイトル・40文字以内）:",
    "  - 例）「ルイヴィトン モノグラム アルマPM ハンドバッグ 茶 中古」",
    "  - 【ブランド名】【ライン/柄】【アイテム名】【色 or 特徴】【状態】を含める。",
    "  - 宣伝っぽい文言（激安、超美品、大人気など）や記号だらけは避ける。",
    "  - 価格・相場・査定・AI などの単語を含めない。",
    "",
    "3. mercari_description（メルカリ商品説明・200〜400文字程度）:",
    "  - 構成は以下の5ブロックとし、改行で区切る。", // :contentReference[oaicite:0]{index=0}
    "    ① 商品概要（1〜2行）: ブランド名・アイテム・柄やカラーなど。",
    "    ② 状態説明（2〜3行）: 傷・汚れ・型崩れなど、実物ベースで具体的に。",
    "    ③ サイズ・付属品（1〜2行）: 分かる範囲でおおよそのサイズ・付属品の有無。",
    "    ④ 注意事項（1〜2行）: 中古品への理解をお願いする一文、発送についてなど。",
    "    ⑤ 検索用タグ（1行）: 例「【検索用】ルイヴィトン モノグラム クラッチ バッグ 中古」。",
    "  - 「相場」「査定」「買取」「高く売れる」「AI」「自動査定」「社内」など、",
    "    内部情報を連想させる単語は一切書かない。",
    "  - 想定販売価格や金額は mercari_description 内には書かない。",
    "  - 「検索にヒットします」「検索用ワードは〜です」などの説明文は書かず、",
    "    検索タグは最後の1行だけにまとめる。",
    "",
    "【出力フォーマット】",
    '必ず次の形式の JSON 文字列だけを返すこと:',
    '{"output_text":"社内用コメント","mercari_title":"40文字以内のタイトル","mercari_description":"メルカリ用説明文（改行入りOK）"}'
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
