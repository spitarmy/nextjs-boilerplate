// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase"; // ルート/lib/supabase.ts を参照

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 共通プロンプト（JSON で返させる）
const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など、幅広いジャンルのリサイクル商品を扱う査定AIです。",
  "画像からブランド名・カテゴリ・型名・状態・特徴を精密に分析し、",
  "社内向けの査定コメント・真贋確度（confidence）・メルカリ向けの出品文を分離して生成してください。",
  "",
  "【厳守ルール】",
  "◆ 出力は必ず JSON 文字列のみ。",
  "◆ JSON のキーは output_text / mercari_title / mercari_description / confidence / genre / item_name の6つのみ。",
  "◆ confidence は 0〜100 の整数（%）で返す。",
  "◆ genre は『ブランドバッグ』『時計』『骨董品』『おもちゃ』『家電』『雑貨』などの大まかなジャンル名を1つ返す。",
  "◆ item_name は『シャネル マトラッセ チェーンショルダー』のような商品名・型名を短く1行で返す。",
  "",
  "【output_text（社内用）】",
  "・1〜5行のみ。",
  "・真贋、型名、状態、推定販売価格を含める。",
  "・価格は「◯◯,000〜◯◯,000円前後」で書く。",
  "・価格は国内フリマアプリの『実際に売れた価格帯』を基準にし、",
  "　その中でも【やや控えめ（相場の下限〜中間）】のレンジにする。",
  "・強気な高値や買取店の店頭価格は絶対に参考にしない。",
  "",
  "【confidence（真贋信頼度）】",
  "・0〜100 の整数で返す。",
  "・画像などから判断した真贋の確からしさを数値化する。",
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
  '{"output_text":"社内用コメント","mercari_title":"タイトル","mercari_description":"説明文","confidence":90,"genre":"ジャンル","item_name":"商品名"}'
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

    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    // ジャンル別リファレンス＋過去 training_items を取得
    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    let referenceBlocks: string[] = [];

    try {
      // 1) ブランド・バッグ系
      const { data: brandRows, error: brandError } = await supabase
        .from("brand_data_reference_v2")
        .select("brand,line_name,model_name")
        .limit(30);

      if (brandError) {
        console.error("brand_data_reference_v2 取得エラー:", brandError);
      } else if (brandRows && brandRows.length > 0) {
        const txt =
          "[ブランドバッグ系リファレンス]\n" +
          brandRows
            .map((row: any) => {
              const brand = row.brand ?? "";
              const line = row.line_name ?? "";
              const model = row.model_name ?? "";
              return `ブランド:${brand} / ライン:${line} / モデル:${model}`;
            })
            .join("\n");
        referenceBlocks.push(txt);
      }

      // 2) ジュエリー系
      const { data: jewelryRows, error: jewelryError } = await supabase
        .from("jewelry_reference")
        .select("*")
        .limit(30);

      if (jewelryError) {
        console.error("jewelry_reference 取得エラー:", jewelryError);
      } else if (jewelryRows && jewelryRows.length > 0) {
        const txt =
          "[ジュエリー系リファレンス]\n" +
          jewelryRows.map((row: any) => JSON.stringify(row)).join("\n");
        referenceBlocks.push(txt);
      }

      // 3) 金工・漆系
      const { data: kinkoRows, error: kinkoError } = await supabase
        .from("kinko_urushi_reference")
        .select("*")
        .limit(30);

      if (kinkoError) {
        console.error("kinko_urushi_reference 取得エラー:", kinkoError);
      } else if (kinkoRows && kinkoRows.length > 0) {
        const txt =
          "[金工・漆器系リファレンス]\n" +
          kinkoRows.map((row: any) => JSON.stringify(row)).join("\n");
        referenceBlocks.push(txt);
      }

      // 4) 過去の training_items（教師データ）から直近のもの
      const { data: trainingRows, error: trainingError } = await supabase
        .from("training_items")
        .select(
          "genre,item_name,output_text,mercari_title,mercari_description,confidence"
        )
        .eq("is_trainable", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (trainingError) {
        console.error("training_items 取得エラー:", trainingError);
      } else if (trainingRows && trainingRows.length > 0) {
        const txt =
          "[過去の教師データ（training_items）]\n" +
          trainingRows
            .map((row: any) => {
              const g = row.genre ?? "";
              const name = row.item_name ?? "";
              const c =
                typeof row.confidence === "number"
                  ? `${row.confidence}%`
                  : "N/A";
              return `ジャンル:${g} / 商品:${name} / 信頼度:${c} / 概要:${row.output_text ?? ""}`;
            })
            .join("\n");
        referenceBlocks.push(txt);
      }
    } catch (e) {
      console.error("リファレンス取得中の例外:", e);
    }

    const referenceText = referenceBlocks.join("\n\n");

    // OpenAI に渡す content を組み立てる（※ここでだけ content を定義）
    const content: any[] = [
      {
        type: "input_text",
        text: SYSTEM_PROMPT,
      },
      ...(referenceText
        ? [
            {
              type: "input_text",
              text:
                referenceText +
                "\n---\n上記のリファレンスは「ブランドバッグ系」「ジュエリー系」「金工・漆器系」「過去の教師データ」などに分かれています。画像から推定されるジャンルに最も近い情報を主に参考にして査定してください。",
            },
          ]
        : []),
      ...images.map((u) => ({
        type: "input_image",
        image_url: u,
      })),
    ];

    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    // OpenAI に査定を依頼
    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    const aiRes: any = await openai.responses.create({
      model: "gpt-4.1",
      temperature: 0.2,
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

    // JSON パース
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

    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : null;

    const genre =
      typeof parsed.genre === "string" && parsed.genre.trim().length > 0
        ? parsed.genre
        : null;

    const item_name =
      typeof parsed.item_name === "string" && parsed.item_name.trim().length > 0
        ? parsed.item_name
        : null;

    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    // confidence 90%以上を training_items に自動インサート
    // ＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊＊
    if (confidence !== null && confidence >= 90) {
      try {
        const { error: insertError } = await supabase
          .from("training_items")
          .insert([
            {
              genre,
              item_name,
              image_urls: images, // jsonb
              output_text,
              mercari_title,
              mercari_description,
              model: "gpt-4.1",
              source: "kanteno-web",
              confidence,
              delta: null,
              is_trainable: true,
              created_by: null,
              raw_request: { image_urls: images },
              raw_response: aiRes,
            },
          ]);

        if (insertError) {
          console.error("training_items への自動登録に失敗:", insertError);
        }
      } catch (e) {
        console.error("training_items 自動登録中の例外:", e);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        output_text,
        mercari_title,
        mercari_description,
        confidence,
        genre,
        item_name,
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
