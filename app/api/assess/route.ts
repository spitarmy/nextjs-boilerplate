// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ★ フォーマット固定＋コードブロック禁止
const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するAIです。",
  "画像からブランド名・カテゴリ・型名・状態を分析し、JSON形式で返答します。",
  "",
  "【厳守ルール】",
  "◆ 出力は必ず JSON 文字列のみ。",
  "◆ JSON のキーは output_text / mercari_title / mercari_description / confidence / genre / item_name の6つ。",
  "◆ confidence は 0〜100 の整数（%）。",
  "◆ item_name は短く1行で返す。",
  "◆ ``` や ```json などのコードブロックは一切使わず、プレーンテキストのJSONだけを返す。",
  "",
  "【output_text（社内用）】",
  "・1〜5行のみ。",
  "・原則として次の4行構成にする：",
  "　1行目：【真贋】〜",
  "　2行目：【型名】〜",
  "　3行目：【状態】〜",
  "　4行目：【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
  "・相場が不明な場合でも、4行目は【想定相場】不明（データ不足）という形式で必ず1行出す。",
  "・価格はフリマアプリの『実際に売れた価格帯』を基準にし、やや控えめ（相場の下限〜中間）にする。",
  "・買取店の店頭価格や定価は参考にしない。",
  "",
  "【mercari_title】40文字以内。",
  "【mercari_description】200〜400文字。金額は禁止。",
  "",
  "【禁止事項】",
  "・査定・AI・内部情報について本文に書かない。",
  "・mercari_description に金額を書かない。",
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

    // フロントから送られてきた user_id（ログインユーザー）
    const user_id: string | null =
      typeof (body as any).user_id === "string" &&
      (body as any).user_id.trim().length > 0
        ? (body as any).user_id
        : null;

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
          "[ジュエリー系]\n" +
            jewelryRows.map((r: any) => JSON.stringify(r)).join("\n")
        );
      }

      const { data: kinkoRows } = await supabase
        .from("kinko_urushi_reference")
        .select("*")
        .limit(30);

      if (kinkoRows?.length) {
        referenceBlocks.push(
          "[金工・漆器系]\n" +
            kinkoRows.map((r: any) => JSON.stringify(r)).join("\n")
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
    const output_text_raw =
      typeof parsed.output_text === "string"
        ? parsed.output_text
        : String(rawText);

    // ★ 万一【想定相場】が入っていなかったらサーバー側で 1 行足す
    let output_text = output_text_raw;
    if (!output_text.includes("【想定相場】")) {
      const sep = output_text.endsWith("\n") ? "" : "\n";
      output_text = output_text + sep + "【想定相場】不明（データ不足）";
    }

    const item_name: string | null =
      typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;

    let mercari_title: string =
      typeof parsed.mercari_title === "string" ? parsed.mercari_title : "";

    // 型名は必ず含める
    if (item_name && !mercari_title.includes(item_name)) {
      mercari_title = `${mercari_title} ${item_name}`.trim();
    }

    // ★ タイトル内の重複ワードを削除（同じ単語を何度も書かない）
    if (mercari_title) {
      const tokens: string[] = mercari_title.split(/[\s　]+/);
      const seen = new Set<string>();
      const deduped = tokens.filter((t: string) => {
        const key = t.trim();
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      mercari_title = deduped.join(" ");
    }

    // 40文字にトリム
    if (mercari_title.length > 40) {
      mercari_title = mercari_title.slice(0, 40);
    }

    const mercari_description: string =
      typeof parsed.mercari_description === "string"
        ? parsed.mercari_description
        : output_text;

    const confidence: number | null =
      typeof parsed.confidence === "number" ? parsed.confidence : null;

    const genre: string | null =
      typeof parsed.genre === "string" ? parsed.genre.trim() : null;

    // ===== appraisals に毎回フル情報を保存（ユーザー別履歴用） =====
    try {
      await supabase.from("appraisals").insert([
        {
          user_id, // null も許容（未ログイン時など）
          genre,
          item_name,
          confidence,
          mercari_title,
          mercari_description,
          output_text,
          image_urls: images,
          model: "gpt-4.1",
        },
      ]);
    } catch (e) {
      console.error("appraisals 保存中の例外:", e);
    }

    // ===== training_items にも毎回保存（is_trainable だけ分ける） =====
    try {
      const isTrainable = confidence !== null && confidence >= 90;

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
          is_trainable: isTrainable,
          raw_request: { image_urls: images },
          raw_response: aiRes,
        },
      ]);
    } catch (e) {
      console.error("training_items 保存中の例外:", e);
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
