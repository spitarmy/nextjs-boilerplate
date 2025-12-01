// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するAIです。",
  "画像からブランド名・カテゴリ・型名・状態を分析し、JSON形式で返答します。",
  "",
  "【厳守ルール】",
  "◆ 出力は必ず JSON 文字列のみ。",
  "◆ JSON のキーは output_text / mercari_title / mercari_description / confidence / genre / item_name の6つ。",
  "◆ confidence は 0〜100 の整数（%）。",
  "◆ item_name は短く1行で返す。",
  "",
  "【output_text（社内用）】1〜5行。真贋・型名・状態・推定販売価格を含める。",
  "価格はフリマアプリの実際の売れた価格帯（控えめ）。",
  "",
  "【mercari_title】40文字以内。",
  "【mercari_description】200〜400文字。金額は禁止。",
  "",
  "【禁止事項】",
  "・査定やAIのことを書くな。",
  "",
  "【JSONフォーマット指定】",
  '{"output_text":"〜","mercari_title":"〜","mercari_description":"〜","confidence":90,"genre":"〜","item_name":"〜"}'
].join("\n");

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が不足しています。" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "JSON形式のリクエストを送ってください。" },
        { status: 400 }
      );
    }

    // 画像を抽出
    const raw = (body as any).image_urls ?? (body as any).images ?? null;
    let images: string[] = [];

    if (Array.isArray(raw)) {
      images = raw
        .map((v) => {
          if (typeof v === "string") return v;
          if (v?.url) return v.url;
          if (v?.image_url) return v.image_url;
          if (v?.src) return v.src;
          return null;
        })
        .filter((s): s is string => !!s);
    }

    if (!images.length) {
      return NextResponse.json(
        { ok: false, error: "画像データがありません。" },
        { status: 400 }
      );
    }

    // ===== Supabase リファレンス収集 =====
    let referenceBlocks: string[] = [];

    try {
      const { data: brandRows } = await supabase
        .from("brand_data_reference_v2")
        .select("brand,line_name,model_name")
        .limit(30);

      if (brandRows?.length) {
        referenceBlocks.push(
          "[ブランドバッグ系]\n" +
            brandRows
              .map(
                (r: any) =>
                  `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`
              )
              .join("\n")
        );
      }

      const { data: jewelryRows } = await supabase
        .from("jewelry_reference")
        .select("*")
        .limit(30);

      if (jewelryRows?.length) {
        referenceBlocks.push(
          "[ジュエリー系]\n" + jewelryRows.map((r: any) => JSON.stringify(r)).join("\n")
        );
      }

      const { data: kinkoRows } = await supabase
        .from("kinko_urushi_reference")
        .select("*")
        .limit(30);

      if (kinkoRows?.length) {
        referenceBlocks.push(
          "[金工・漆器系]\n" + kinkoRows.map((r: any) => JSON.stringify(r)).join("\n")
        );
      }

      const { data: trainingRows } = await supabase
        .from("training_items")
        .select(
          "genre,item_name,output_text,mercari_title,mercari_description,confidence"
        )
        .eq("is_trainable", true)
        .order("created_at", { ascending: false })
        .limit(50);

      if (trainingRows?.length) {
        referenceBlocks.push(
          "[過去の教師データ]\n" +
            trainingRows
              .map(
                (r: any) =>
                  `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`
              )
              .join("\n")
        );
      }
    } catch (e) {
      console.error("リファレンス取得エラー", e);
    }

    const referenceText = referenceBlocks.join("\n\n");

    const content: any[] = [
      { type: "input_text", text: SYSTEM_PROMPT },
      referenceText
        ? {
            type: "input_text",
            text:
              referenceText +
              "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。",
          }
        : null,
      ...images.map((u) => ({ type: "input_image", image_url: u })),
    ].filter(Boolean);

    // ===== OpenAI リクエスト =====
    const aiRes: any = await openai.responses.create({
      model: "gpt-4.1",
      temperature: 0.2,
      input: [{ role: "user", content }],
    });

    const first = aiRes.output?.[0]?.content?.[0];
    const rawText: string = first?.text ?? "";

    if (!rawText) {
      return NextResponse.json(
        { ok: false, error: "AI出力が空です。" },
        { status: 500 }
      );
    }

    // ===== JSONパースの安定化処理 =====
    const cleaned = rawText
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", e, rawText);
      return NextResponse.json(
        { ok: false, error: "AI出力のJSON解析に失敗しました。" },
        { status: 500 }
      );
    }

    // ===== パース結果を抽出 =====
    const output_text =
      typeof parsed.output_text === "string"
        ? parsed.output_text
        : String(rawText);

    const item_name: string | null =
      typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;

    let mercari_title =
      typeof parsed.mercari_title === "string" ? parsed.mercari_title : "";

    if (item_name && !mercari_title.includes(item_name)) {
      mercari_title = `${mercari_title} ${item_name}`.trim();
    }

    if (mercari_title.length > 40) {
      mercari_title = mercari_title.slice(0, 40);
    }

    const mercari_description =
      typeof parsed.mercari_description === "string"
        ? parsed.mercari_description
        : output_text;

    const confidence: number | null =
      typeof parsed.confidence === "number" ? parsed.confidence : null;

    const genre: string | null =
      typeof parsed.genre === "string" ? parsed.genre.trim() : null;

    // ===== 査定履歴(appraisals)に1件保存 =====
    try {
      const userId = (body as any).user_id ?? null;

      if (userId) {
        const { error: appraiseInsertError } = await supabase
          .from("appraisals")
          .insert([
            {
              user_id: userId,
              image_urls: images,
              output_text,
              mercari_title,
              mercari_description,
              confidence,
              genre,
              item_name,
              model: "gpt-4.1",
            },
          ]);

        if (appraiseInsertError) {
          console.error("appraisals への保存に失敗:", appraiseInsertError);
        }
      } else {
        console.warn("user_id が無いため appraisals には保存しませんでした。");
      }
    } catch (e) {
      console.error("appraisals 保存中の例外:", e);
      // ここはログだけ。査定レスポンスは返す。
    }

    // ===== 高信頼度 → training_items 自動登録 =====
    if (confidence !== null && confidence >= 90) {
      try {
        await supabase.from("training_items").insert([
          {
            genre,
            item_name,
            image_urls: images,
            output_text,
            mercari_title,
            mercari_description,
            model: "gpt-4.1",
            source: "kanteno-web",
            confidence,
            is_trainable: true,
            raw_request: { image_urls: images },
            raw_response: aiRes,
          },
        ]);
      } catch (e) {
        console.error("training_items 自動登録エラー:", e);
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
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "査定中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
