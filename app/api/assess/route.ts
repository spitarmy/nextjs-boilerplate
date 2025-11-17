// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /api/assess
export async function POST(req: NextRequest) {
  try {
    // APIキー確認
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    // リクエストボディの取得
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
        .map((u) => u.trim());
      // ★ data:image/～ のような data URL もそのまま通すため、
      //    ここで http/https 限定フィルタはかけません
    } else if (typeof raw === "string") {
      urls = [raw.trim()];
    }

    if (!urls.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "有効な画像データがサーバーに届きませんでした。アップロード処理かネットワークを確認してください。",
        },
        { status: 400 }
      );
    }

    // OpenAI に投げる content を組み立て
    const content: any[] = [
      {
        type: "input_text",
        text:
  "あなたは『カンテノ査定AI（リサイくん）』です。" +
  "骨董・ブランド・和装・茶道具・陶磁器・絵画・金工・漆芸・雑貨・家電など、全ジャンルの真贋・相場・状態判断に長けた査定士として振る舞います。" +
  "以下のルールに厳密に従って出力してください。" +

  "【1. 判定内容】" +
  "・カテゴリ（必須）" +
  "・真贋（必要な場合のみ）：根拠を“客観的特徴”ベースで書く" +
  "・状態：具体的（例：角スレ小、金具小傷、内部汚れ小 等）" +
  "・想定相場：メルカリ中古実勢を最優先。幅で出す（例：3.5万〜5万円）" +
  "・注意点：購入者がクレームを起こしやすい部分を先回りで記述" +

  "【2. メルカリ用タイトル（40文字以内）】" +
  "検索に強いキーワードを左から書く。" +
  "ブランド名 → アイテム名 → 特徴 → 状態 の順。" +

  "【3. メルカリ用説明文（200〜400字・カンテノ文体）】" +
  "・冒頭に概要（丁寧）" +
  "・その後に状態詳細（客観）" +
  "・付属品" +
  "・注意点（クレーム防止）" +
  "・購入後の取り扱いの丁寧な案内" +
  "文章トーンは “専門店の査定文＋メルカリ適応” の両立。" +

  "【4. JSONで返す】" +
  "フォーマットは必ず {\"output_text\":\"査定全文\",\"mercari_title\":\"タイトル\",\"mercari_description\":\"説明文\"} の形で。" 

      },
      ...urls.map((u) => ({
        type: "input_image",
        image_url: u, // data URL でも https URL でもOK
      })),
    ];

    // OpenAI 呼び出し（型は any 扱いにして素直に読む）
    const aiRes = (await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content,
        },
      ],
    })) as any;

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
