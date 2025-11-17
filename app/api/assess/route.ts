// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase（サービスロール）クライアント
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY)
    : null;

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

    // リクエストボディ取得
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

    // OpenAI に渡す content（カンテノ仕様プロンプト）
    const content: any[] = [
      {
        type: "input_text",
        text:
          'あなたは『カンテノ査定AI（リサイくん）』です。' +
          '骨董・ブランド・和装・茶道具・陶磁器・絵画・金工・漆芸・雑貨・家電など、全ジャンルの真贋・相場・状態判断に長けた査定士として振る舞います。' +
          '以下のルールに厳密に従って出力してください。' +

          '【1. 判定内容】' +
          '・カテゴリ（必須）' +
          '・真贋（必要な場合のみ）：根拠を“客観的特徴”ベースで書くこと。感情的・断定的すぎる表現は避ける。' +
          '・状態：具体的に（例：角スレ小、金具小傷、内部汚れ小、芯のヨレ中 等）。' +
          '・想定相場：メルカリなど国内フリマの中古実勢価格を最優先し、幅で出す（例：3.5万〜5万円程度）。' +
          '・注意点：購入者がクレームを起こしやすい部分を先回りで説明する。' +

          '【2. メルカリ用タイトル（40文字以内）】' +
          '検索に強いキーワードを左から並べる。' +
          'ブランド名 → アイテム名 → 特徴（柄・色・サイズなど）→ 状態（美品・訳あり 等）の順に日本語で簡潔に。' +

          '【3. メルカリ用説明文（200〜400字・カンテノ文体）】' +
          '・冒頭に商品概要（丁寧で読みやすく）。' +
          '・続いて状態の詳細（客観的なダメージ箇所・使用感を具体的に）。' +
          '・付属品の有無。' +
          '・注意事項（中古品であること、神経質な方はご遠慮ください など）。' +
          '・発送や梱包についての一言（丁寧に梱包してお送りします 等）。' +
          '文体は「専門店の査定コメント」と「メルカリの出品説明」の中間くらいの、丁寧で落ち着いた日本語にしてください。' +

          '【4. JSONで返す】' +
          '最終的な出力は必ず JSON 1オブジェクトのみとし、フォーマットは {"output_text":"査定全文","mercari_title":"タイトル","mercari_description":"説明文"} の形で返してください。' +
          '日本語の文章中に余計な説明文やマークダウンは出力しないでください。',
      },
      ...urls.map((u) => ({
        type: "input_image",
        image_url: u, // data URL でも https URL でもOK
      })),
    ];

    // OpenAI 呼び出し
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
            "一時的なエラーによりJSON整形ができませんでしたが、上記の査定コメントを参考に出品文を作成してください。",
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

    // 🔽 ここで教師データとして Supabase に保存（失敗してもユーザーには影響させない）
    if (supabase) {
      try {
        await supabase.from("training_items").insert({
          image_urls: urls,
          output_text,
          mercari_title,
          mercari_description,
          model: "gpt-4.1-mini",
          source: "kanteno-web",
          is_trainable: true,
          raw_request: { image_urls: urls },
          raw_response: aiRes,
        });
      } catch (e) {
        console.error("Failed to insert training item", e);
        // ここはログだけにしてレスポンスは普通に返す
      }
    } else {
      console.warn("Supabase client is not initialized, skip training_items insert");
    }

    // クライアントには通常の査定結果を返す
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
