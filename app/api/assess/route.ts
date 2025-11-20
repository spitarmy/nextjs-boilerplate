// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase（サービスロール）設定
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase =
  SUPABASE_URL && SERVICE_KEY
    ? createClient(SUPABASE_URL, SERVICE_KEY)
    : null;

// ---------- 型定義 ----------
type BrandRef = {
  id?: number;
  brand: string;
  model_or_line: string;
  category: string;
  release_year_range: string;
  material: string;
  serial_style: string;
  stitch_rules: string;
  logo_rules: string;
  font_rules: string;
  stamp_rules: string;
  hardware_rules: string;
  lining_rules: string;
  common_fake_signs: string;
  quality_markers: string;
  mercari_price_range_jpy: string;
  notes: string;
  example_images: string;
};

type WritingGuideline = {
  id: number;
  section: string;
  platform: string;
  content: string;
  priority: number | null;
};

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
};

// ---------- 1. 画像からブランド・カテゴリを推定 ----------
async function detectBrandAndCategory(
  imageUrls: string[]
): Promise<{
  brand: string | null;
  category: string | null;
  guessed_model: string | null;
}> {
  try {
    const content: any[] = [
      {
        type: "input_text",
        text:
          "あなたはブランド品・ファッションアイテムの分類AIです。" +
          "与えられた画像から、以下の3項目を日本語ではなく英語で簡潔にJSONで返してください。" +
          'フォーマット: {"brand": "LOUIS VUITTON など", "category": "bag / wallet / belt / sneakers など", "guessed_model": "分かる範囲でモデル名。分からなければ null"}' +
          "ブランドが特定できない場合は brand を null にしてください。",
      },
      ...imageUrls.map((u) => ({
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
      return { brand: null, category: null, guessed_model: null };
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { brand: null, category: null, guessed_model: null };
    }

    return {
      brand:
        typeof parsed.brand === "string" && parsed.brand.trim()
          ? parsed.brand.trim()
          : null,
      category:
        typeof parsed.category === "string" && parsed.category.trim()
          ? parsed.category.trim()
          : null,
      guessed_model:
        typeof parsed.guessed_model === "string" && parsed.guessed_model.trim()
          ? parsed.guessed_model.trim()
          : null,
    };
  } catch (e) {
    console.error("detectBrandAndCategory error", e);
    return { brand: null, category: null, guessed_model: null };
  }
}

// ---------- 2. ブランド真贋 RAG 用のリファレンス取得 ----------
async function fetchBrandReferences(params: {
  brand: string | null;
  category: string | null;
  limit?: number;
}): Promise<BrandRef[]> {
  if (!supabase) return [];

  const { brand, category, limit = 10 } = params;

  // brand が分からないときは何も返さない（安全寄り）
  if (!brand) return [];

  let query = supabase
    .from("brand_data_reference")
    .select("*")
    .ilike("brand", `%${brand}%`)
    .limit(limit);

  if (category) {
    // category も分かっていればゆるく絞る
    query = query.ilike("category", `%${category}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("fetchBrandReferences error", error);
    return [];
  }

  return (data as BrandRef[]) ?? [];
}

// ---------- 3. 出品マニュアル RAG 用のガイドライン取得 ----------
async function fetchWritingGuidelines(
  platform: string = "mercari"
): Promise<WritingGuideline[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("writing_guidelines")
    .select("*")
    .eq("platform", platform)
    .order("priority", { ascending: true });

  if (error) {
    console.error("fetchWritingGuidelines error", error);
    return [];
  }

  return (data as WritingGuideline[]) ?? [];
}

// ---------- 4. POST /api/assess ----------
export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");
      return NextResponse.json(
        { ok: false, error: "OPENAI_API_KEY が設定されていません。" },
        { status: 500 }
      );
    }

    if (!supabase) {
      console.error("Supabase client not initialized");
      return NextResponse.json(
        { ok: false, error: "Supabase の設定に問題があります。" },
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

    // image_urls を安全に string[] にまとめる（dataURL / https URL 両対応）
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

    // ---------- 4-1. 画像からブランド・カテゴリを推定 ----------
    const brandInfo = await detectBrandAndCategory(urls);
    console.log("brandInfo:", brandInfo);

    // ---------- 4-2. ブランド真贋 RAG 用リファレンス取得 ----------
    const brandRefs = await fetchBrandReferences({
      brand: brandInfo.brand,
      category: brandInfo.category,
      limit: 8,
    });

    // ---------- 4-3. 出品マニュアル RAG 用ガイドライン取得 ----------
    const guidelines = await fetchWritingGuidelines("mercari");

    // AI に渡すための参考データをテキスト化
    const brandRefSummary = brandRefs.map((r, idx) => ({
      index: idx,
      brand: r.brand,
      model_or_line: r.model_or_line,
      category: r.category,
      material: r.material,
      serial_style: r.serial_style,
      stitch_rules: r.stitch_rules,
      logo_rules: r.logo_rules,
      font_rules: r.font_rules,
      stamp_rules: r.stamp_rules,
      hardware_rules: r.hardware_rules,
      lining_rules: r.lining_rules,
      common_fake_signs: r.common_fake_signs,
      quality_markers: r.quality_markers,
      mercari_price_range_jpy: r.mercari_price_range_jpy,
      notes: r.notes,
    }));

    const guidelineText = guidelines
      .map(
        (g) =>
          `[${g.section}] ${g.content}`
      )
      .join("\n\n");

    // ---------- 4-4. 最終査定用の AI 呼び出し ----------
const instruction = `
あなたは「リサイくん構想」のカンテノAIです。以下の3つを必ず行ってください。
1) 画像とブランド真贋リファレンスを見て、カテゴリ・状態・真贋の可能性・注意点を日本語で詳細にコメントする。
2) メルカリ・ヤフオクなどフリマサイトの相場感で、販売想定価格帯を提案する（高くなりすぎないよう控えめに）。brand_data_reference.mercari_price_range_jpy を基準にしつつ、状態が悪ければ下振れ、非常に良ければ少し上振れの感覚で。
3) マニュアル（writing_guidelines）に沿って、メルカリ用タイトルと説明文を作成する。

重要:
- 真贋はあくまで「画像ベースでの推定」であり、「断定」はしないこと。
- フリマ相場より明らかに高くなりすぎないようにすること。
- 説明文には、状態・サイズ感・付属品・注意事項・検索用ワードを適度に含めること。

出力は必ず JSON 形式のみで返してください。
フォーマット: {"output_text":"...査定コメント...","mercari_title":"...40文字以内タイトル...","mercari_description":"...300〜600文字程度の説明文..."}

ブランド推定結果と参考データ、マニュアルは以下です。

【ブランド推定結果】
${JSON.stringify(brandInfo, null, 2)}

【ブランド真贋リファレンス（一部）】
${JSON.stringify(brandRefSummary, null, 2)}

【出品マニュアル（writing_guidelines 抜粋）】
${guidelineText}
`.trim();

const content: any[] = [
  {
    type: "input_text",
    text: instruction,
  },
  ...urls.map((u) => ({
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

    // JSON パースを試みる
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // パースできなかった場合でも、output_text だけ返す
      return NextResponse.json(
        {
          ok: true,
          output_text: text,
          mercari_title: "【仮】カンテノ自動査定",
          mercari_description:
            "一時的なエラーにより詳細な整形はできませんでしたが、上記の査定コメントを参考にメルカリ出品文を調整してください。",
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
