// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase クライアント（サービスロールキー）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY)
    : null;

// 出品マニュアルのざっくり要約（RAGの代わりの簡易版）
const LISTING_GUIDELINE = `
・タイトルは「ブランド名＋カテゴリー＋特徴＋状態」を簡潔に（40文字以内）。
・説明文の前半で「カテゴリ／ブランド／型名／サイズ感／カラー」を整理して書く。
・状態説明は「外観」「内側」「金具」「角」「持ち手」「ニオイ」を分けて具体的に。
・ダメージは必ず正直に：キズ・汚れ・色ヤケ・ベタつき・ほつれなどは位置と程度を書く。
・付属品（箱・保存袋・ギャランティ・ストラップなど）は有無を一覧で書く。
・相場はメルカリ／ヤフオクなどフリマ実売価格を基準に、少しだけ強気〜普通くらい。
・偽物の可能性が少しでもあれば「真贋は保証できません／画像でご確認ください」と明記する。
・最後に「中古品にご理解ある方のみ」「トラブル防止のため返品不可」などの注意書きを入れる。
`.trim();

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

    // フロントから来る data URL（"data:image/..."）前提で扱う
    let imageInputs: string[] = [];
    if (Array.isArray(raw)) {
      imageInputs = raw.filter(
        (v: any): v is string =>
          typeof v === "string" && v.startsWith("data:image")
      );
    }

    if (!imageInputs.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "有効な画像データがサーバーに届きませんでした。画像の選択やネットワークを確認してください。",
        },
        { status: 400 }
      );
    }

    // ここで Supabase からブランド相場RAGを取得（まずは Louis Vuitton 固定）
    let lvMarketRows: any[] = [];
    if (supabase) {
      const { data, error } = await supabase
        .from("brand_data_reference_v2")
        .select(
          "brand,line_name,model_name,category,subcategory,condition_hint,mercari_price_low,mercari_price_high,notes"
        )
        .eq("brand", "Louis Vuitton")
        .limit(100);

      if (error) {
        console.error("Supabase brand_data_reference_v2 error", error);
      } else if (data) {
        lvMarketRows = data;
      }
    } else {
      console.warn("Supabase client not initialized for assess route.");
    }

    const lvMarketJson = JSON.stringify(lvMarketRows);

    // プロンプト本文（ブランドRAG + 出品マニュアル要約込み）
    const userPrompt = `
あなたは「リサイくん（カンテノ）」というリサイクル専門査定AIです。
骨董／ブランド／和装／雑貨などの中古品を、フリマサイトの実売相場に合わせて査定します。

今回ユーザーは Louis Vuitton を含むブランド品の査定を希望している可能性があります。

【ブランド相場RAG（フリマ実売参考）】
以下は Louis Vuitton のバッグ／小物について、
メルカリ・ヤフオクなどフリマサイトの実売価格をもとに作成した相場データです。
査定価格を決めるときは、このデータを「最優先」で参考にし、
各行の "mercari_price_low"〜"mercari_price_high" のレンジから
大きく外れない妥当な価格帯を提案してください。

${lvMarketJson}

【出品マニュアル要約（文章のクセ）】
${LISTING_GUIDELINE}

【あなたのタスク】
1. 画像をよく観察し、カテゴリ／ブランド／型の雰囲気／素材／おおよそのサイズ感／状態を日本語で説明する。
2. 上記のブランド相場RAGを使って、フリマ実売相場と整合性のある「想定販売価格の目安（円）」を決める。
   - 状態が良い：相場レンジの上〜中くらい
   - 普通：相場レンジの真ん中
   - 使用感が強い：相場レンジの下〜やや下に寄せる
3. 注意点やリスク（色ヤケ・ベタつき・ニオイ・修理歴・真贋の不確実さなど）があれば必ずコメントする。
4. メルカリ用タイトル（40文字以内）と、メルカリ用説明文（200〜400文字程度）を作成する。
   説明文は出品マニュアル要約の方針に沿って書くこと。

【出力フォーマット（重要）】
必ず次の JSON 文字列「だけ」を返してください。余計な文章や説明は付けないこと。

{"output_text":"概要と査定コメント（価格の根拠を含める）","mercari_title":"40文字以内タイトル","mercari_description":"メルカリ用説明文（200〜400文字程度）"}

`.trim();

    const content: any[] = [
      {
        type: "input_text",
        text: userPrompt,
      },
      ...imageInputs.map((u) => ({
        type: "input_image",
        image_url: u,
      })),
    ];

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

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // JSONにパースできなかった場合でも、とりあえず査定コメントは返す
      return NextResponse.json(
        {
          ok: true,
          output_text: text,
          mercari_title: "【仮】カンテノ自動査定",
          mercari_description:
            "一時的なエラーによりJSON形式の整形に失敗しましたが、上記の査定コメントを参考に出品文を作成してください。",
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
