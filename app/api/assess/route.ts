// app/api/assess/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ★ フォーマット固定＋コードブロック禁止（AI側にはJSONのみ出力させる）
const SYSTEM_PROMPT = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
  "画像とリファレンス情報をもとに、真贋・型名・状態・相場・フリマサイト出品文を一貫した基準で出力します。",
  "",
  "【最重要方針】",
  "・真贋判定は「確率」であり、保証ではない。",
  "・偽物を本物と誤認するリスクを最小化しつつ、本物の中古商品を不必要に低評価しないこと。",
  "・刻印/フォント/内部構造など“偽物が破綻しやすい部位”を最重視する。",
  "・汚れ/スレ/自然劣化は中古では通常発生するため、偽物判定の主因にしない。",
  "・一致点と不一致点を総合評価し、偏った判定にしない。",
  "",
  "【リファレンスの扱い】",
  "・リファレンスは参考。しかし古い型・個体差・経年劣化で外れることもあるため、依存しすぎない。",
  "・リファレンスに無い＝即偽物ではない。",
  "・強い矛盾のみ偽物方向の根拠とする。",
  "",
  "【真贋出力ルール】",
  "以下のいずれかで出力する：",
  "",
  "1) 本物の可能性が高い（80〜90%）",
  " （リファレンス整合性が高く、刻印/縫製/構造が本物特有である場合）",
  "",
  "2) 要追加写真（60〜79%）",
  " （判断材料が不足している・照明や角度で刻印が確認できない等）",
  "",
  "3) 偽物の可能性が高い（0〜59%）",
  " （刻印フォント・構造・配置バランスに複数の矛盾がある場合）",
  "",
  "【想定相場】",
  "・フリマサイトの実売相場の下限〜中央値を控えめに提示。",
  "・偽物可能性が高い場合は「査定・買取対象外」と明示。",
  "・不明な場合は「【想定相場】不明（データ不足）」とする。",
  "",
  "【タイトル（40文字以内）】",
  "・ブランド名 / カテゴリ / 型名 / 状態 のみの簡潔構成",
  "・重複ワード禁止",
  "・item_name を必ず含める。ただし英単語の「item_name」という文字列をタイトルに書いてはならない。",
  "・余計な説明ワードは追加しない",
  "",
  "【フリマ説明文（200〜400文字）】",
  "構成：",
  "①商品概要  ",
  "②状態説明  ",
  "③付属品  ",
  "④注意事項  ",
  "⑤検索キーワード  ",
  "金額・断定真贋表現は入れない。",
  "",
  "【JSONルール】",
  "返答はJSONのみ。",
  "キーは以下の6つ：",
  "output_text / mercari_title / mercari_description / confidence / genre / item_name",
  "",
  "【JSONキーの意味と制約】",
  "・output_text（査定コメント全文）",
  "　- 必ず以下の4行構成（＋必要に応じて1〜2行の補足）とする：",
  "　　1行目： 【真贋】〜",
  "　　2行目： 【型名】〜",
  "　　3行目： 【状態】〜",
  "　　4行目： 【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
  "　　5行目以降（任意）：短い補足があれば1〜2行まで",
  "　- 【真贋】行の例：",
  "　　　【真贋】本物の可能性が高いが、刻印の形状にわずかな違和感があるため要注意。",
  "　　　【真贋】偽物の可能性が高い（フォント／刻印位置がリファレンスと一致しない）。",
  "　　　【真贋】要追加写真（画像とリファレンスだけでは真贋を確定できない）。",
  "　- 【想定相場】がどうしても出せない場合：",
  "　　　【想定相場】不明（データ不足／参考事例が少ないため）",
  "",
  "・mercari_title（フリマサイト用タイトル。最大40文字以内）",
  "　- 最大40文字以内に収めること（超えそうな場合は語尾から安全にカット）。",
  "　- item_name が含まれていなければ末尾に必ず含める。ただし英単語の「item_name」という文字列をタイトルに書いてはならない。",
  "　- 具体的かつシンプルに（ブランド名／カテゴリ／特徴／状態）。",
  "",
  "・mercari_description（フリマサイト用説明文。200〜400文字）",
  "　- 構成：商品概要 → 状態詳細 → 付属品 → 注意事項 → 検索用キーワード1行。",
  "　- 金額は絶対に書かない。",
  "　- 真贋については「当方での目視判断／AIによる目安」であることを曖昧に伝え、断定しない。",
  "",
  "・confidence（0〜100の整数）",
  "　- 80%以上：本物の可能性が高い（保証ではない）。",
  "　- 60〜79%：要追加写真（グレー帯）。",
  "　- 59%以下：偽物の可能性が高い、もしくは情報不足で真贋が難しい。",
  "",
  "・genre（「ブランドバッグ」「時計」「家電」など大まかなジャンル名）",
  "・item_name（型名・商品名。1行で簡潔に）",
  "",
  "【重要な禁止事項】",
  "・JSONの外側に一文字でも余計なテキストを書かないこと（挨拶・説明・コードブロックなどは禁止）。",
  "・真贋について「本物です」「正規品です」「確実です」等の断定表現は禁止。",
  "・リファレンスと矛盾する場合に、自分の一般知識を優先してはいけない。",
  "",
  "以上を厳守し、ブランド真贋については特に慎重に、",
  "偽物を本物と誤判定しないことを最重視して出力してください。"
].join("\n");

// ===== タイトル用トークン化ヘルパー =====
function tokenizeForTitle(s: string): string[] {
  return s
    .split(/[()\[\]【】「」『』／\/・、,\s　]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// ===== メルカリタイトル最適化ヘルパー =====
function buildMercariTitle(
  rawTitle: unknown,
  item_name: string | null,
  output_text: string
): string {
  const baseName = (item_name ?? "").trim();
  const originalTitle =
    typeof rawTitle === "string" ? rawTitle.trim() : "";

  // ベースは「型名があれば item_name、なければ元タイトル」
  let base = baseName || originalTitle;
  if (!base) return "";

  // ベースに含まれている単語セット（記号でしっかり分割）
  const baseWords = tokenizeForTitle(base);
  const wordsInBase = new Set<string>(baseWords);

  // 元タイトルから「ベースに無い＋重複していない」単語だけ追加
  const extraWords: string[] = [];
  const seen = new Set<string>();

  if (originalTitle) {
    const tokens: string[] = tokenizeForTitle(originalTitle);
    tokens.forEach((t: string) => {
      const key = t.trim();
      if (!key) return;
      if (wordsInBase.has(key)) return; // 既にベースにある
      if (base.includes(key)) return; // 文字列として含まれている
      if (seen.has(key)) return; // 既に追加予定
      seen.add(key);
      extraWords.push(key);
    });
  }

  // output_text から状態／セット数のキーワードを抜く
  const hints: string[] = [];

  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) {
    hints.push("未使用に近い");
  } else if (/美品/.test(output_text) && !base.includes("美品")) {
    hints.push("美品");
  }

  const qtyMatch = output_text.match(/(\d+)\s*(本|枚|個|体|点)\s*セット?/);
  if (qtyMatch) {
    const phrase = `${qtyMatch[1]}${qtyMatch[2]}セット`;
    if (!base.includes(phrase) && !extraWords.includes(phrase)) {
      hints.push(phrase);
    }
  }

  // タイトル組み立て：ベース + extra + hints
  let title = base;
  const tailParts: string[] = [];

  extraWords.forEach((w) => {
    if (!title.includes(w) && !tailParts.includes(w)) {
      tailParts.push(w);
    }
  });

  hints.forEach((h) => {
    if (!title.includes(h) && !tailParts.includes(h)) {
      tailParts.push(h);
    }
  });

  if (tailParts.length > 0) {
    title = `${title} ${tailParts.join(" ")}`.trim();
  }

  // ★ 重複しないことを優先：長さを無理に40文字に近づけない
  if (title.length > 40) {
    title = title.slice(0, 40);
  }

  // 念のため「item_name」という英単語が混ざっていたら除外
  if (title.includes("item_name")) {
    title = title.replace(/item_name/gi, "").trim();
  }

  return title;
}

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

    const user_id: string | null =
      typeof (body as any).user_id === "string" &&
      (body as any).user_id.trim().length > 0
        ? (body as any).user_id
        : null;

    // （オプション）ジャンルヒント：今は null でもOK
    const genre_hint: string | null =
      typeof (body as any).genre_hint === "string" &&
      (body as any).genre_hint.trim().length > 0
        ? (body as any).genre_hint.trim()
        : null;

    // 画像を抽出
    const raw = (body as any).image_urls ?? (body as any).images ?? null;
    let images: string[] = [];

    if (Array.isArray(raw)) {
      images = raw
        .map((v: any) => {
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
    const genreHintLower = (genre_hint ?? "").toLowerCase();

    try {
      // 1) ブランド系（バッグ・時計・アパレル・小物など）
      try {
        let brandQuery = supabase
          .from("brand_data_reference_v2")
          .select(
            "brand,genre,line_name,model_name,category,subcategory,material,authenticity_points,common_fake_patterns,condition_hint"
          )
          .limit(50);

        if (genre_hint) {
          brandQuery = brandQuery.ilike("genre", `%${genre_hint}%`);
        }

        const { data: brandRows } = await brandQuery;

        if (brandRows?.length) {
          referenceBlocks.push(
            "[ブランド系リファレンス]\n" +
              brandRows
                .map((r: any) => {
                  const parts: string[] = [];
                  if (r.brand) parts.push(`ブランド:${r.brand}`);
                  if (r.genre) parts.push(`ジャンル:${r.genre}`);
                  if (r.line_name) parts.push(`ライン:${r.line_name}`);
                  if (r.model_name) parts.push(`モデル:${r.model_name}`);
                  if (r.category || r.subcategory) {
                    parts.push(
                      `カテゴリ:${[r.category, r.subcategory]
                        .filter(Boolean)
                        .join(" / ")}`
                    );
                  }
                  if (r.material) parts.push(`素材:${r.material}`);
                  if (r.authenticity_points) {
                    parts.push(`正規の特徴:${r.authenticity_points}`);
                  }
                  if (r.common_fake_patterns) {
                    parts.push(`偽物の特徴:${r.common_fake_patterns}`);
                  }
                  if (r.condition_hint) {
                    parts.push(`状態の見方:${r.condition_hint}`);
                  }
                  return parts.join(" / ");
                })
                .join("\n")
          );
        }
      } catch (e) {
        console.error("brand_data_reference_v2 取得エラー", e);
      }

      // 2) ジュエリー系（ダイヤグレードなど）
      try {
        const shouldUseJewelry =
          !genre_hint ||
          /ジュエリー|宝石|ダイヤ|diamond|jewelry/i.test(genreHintLower);

        if (shouldUseJewelry) {
          const { data: jewelryRows } = await supabase
            .from("jewelry_reference")
            .select(
              "Carat,Color,Clarity,Cut,Fluorescence,Polish,Symmetry,Proportion_Notes,Inclusion_Features,Appearance_Notes,Lab,Report_Type"
            )
            .limit(50);

          if (jewelryRows?.length) {
            referenceBlocks.push(
              "[ジュエリー系リファレンス]\n" +
                jewelryRows
                  .map((r: any) => {
                    const parts: string[] = [];
                    if (r.Carat != null) parts.push(`Carat:${r.Carat}`);
                    if (r.Color) parts.push(`Color:${r.Color}`);
                    if (r.Clarity) parts.push(`Clarity:${r.Clarity}`);
                    if (r.Cut) parts.push(`Cut:${r.Cut}`);
                    if (r.Fluorescence)
                      parts.push(`Fluo:${r.Fluorescence}`);
                    if (r.Polish) parts.push(`Polish:${r.Polish}`);
                    if (r.Symmetry) parts.push(`Sym:${r.Symmetry}`);
                    if (r.Proportion_Notes)
                      parts.push(`Proportion:${r.Proportion_Notes}`);
                    if (r.Inclusion_Features)
                      parts.push(`Inclusion:${r.Inclusion_Features}`);
                    if (r.Appearance_Notes)
                      parts.push(`Appearance:${r.Appearance_Notes}`);
                    if (r.Lab) parts.push(`Lab:${r.Lab}`);
                    if (r.Report_Type)
                      parts.push(`Report:${r.Report_Type}`);
                    return parts.join(" / ");
                  })
                  .join("\n")
            );
          }
        }
      } catch (e) {
        console.error("jewelry_reference 取得エラー", e);
      }

      // 3) 金工・漆器系（既存テーブル）
      try {
        const shouldUseKinko =
          !genre_hint ||
          /金工|漆器|茶道具|骨董|和物/i.test(genreHintLower);

        if (shouldUseKinko) {
          const { data: kinkoRows } = await supabase
            .from("kinko_urushi_reference")
            .select("*")
            .limit(50);

          if (kinkoRows?.length) {
            referenceBlocks.push(
              "[金工・漆器系リファレンス]\n" +
                kinkoRows
                  .map((r: any) => {
                    const parts: string[] = [];
                    const author = r["作家・工房名"] ?? r.author_name;
                    const kind = r["種別（分野）"] ?? r.category;
                    const mark =
                      r["刻印・花押の特徴"] ?? r.signature_traits;
                    const technique =
                      r["技法・意匠"] ?? r.technique ?? r.design;
                    const judge =
                      r["真贋・模倣判定ポイント"] ??
                      r.authenticity_points;
                    const era = r["主な年代"] ?? r.era;

                    if (author) parts.push(`作家・工房名:${author}`);
                    if (kind) parts.push(`種別:${kind}`);
                    if (mark) parts.push(`刻印/花押:${mark}`);
                    if (technique) parts.push(`技法/意匠:${technique}`);
                    if (judge) parts.push(`真贋ポイント:${judge}`);
                    if (era) parts.push(`主な年代:${era}`);

                    return parts.join(" / ");
                  })
                  .join("\n")
            );
          }
        }
      } catch (e) {
        console.error("kinko_urushi_reference 取得エラー", e);
      }

      // 4) 和物・書画・陶磁器系（新設テーブル：wamon_reference）
      try {
        const shouldUseWamon =
          !genre_hint ||
          /骨董|和物|書画|掛軸|陶磁器|茶道具|日本画/i.test(
            genreHintLower
          );

        if (shouldUseWamon) {
          const { data: wamonRows } = await supabase
            .from("wamon_reference")
            .select(
              "genre,category,subcategory,author_name,work_title,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,box_traits,mounting_traits,technique,material_structure,authenticity_points,common_fake_patterns,era,school_lineage,notes"
            )
            .limit(50);

          if (wamonRows?.length) {
            referenceBlocks.push(
              "[和物・書画・陶磁器系リファレンス]\n" +
                wamonRows
                  .map((r: any) => {
                    const parts: string[] = [];
                    if (r.genre) parts.push(`ジャンル:${r.genre}`);
                    if (r.category || r.subcategory) {
                      parts.push(
                        `種別:${[r.category, r.subcategory]
                          .filter(Boolean)
                          .join(" / ")}`
                      );
                    }
                    if (r.author_name) {
                      parts.push(`作家・銘:${r.author_name}`);
                    }
                    if (r.work_title) {
                      parts.push(`代表題材:${r.work_title}`);
                    }
                    if (r.style_traits) {
                      parts.push(`書風・画風/産地:${r.style_traits}`);
                    }
                    if (r.stroke_traits) {
                      parts.push(`筆跡・筆圧:${r.stroke_traits}`);
                    }
                    if (r.signature_traits) {
                      parts.push(`落款/サイン特徴:${r.signature_traits}`);
                    }
                    if (r.seal_text || r.seal_shape_color) {
                      parts.push(
                        `印章:${[
                          r.seal_text,
                          r.seal_shape_color,
                          r.seal_position,
                        ]
                          .filter(Boolean)
                          .join(" / ")}`
                      );
                    }
                    if (r.box_traits) {
                      parts.push(`箱書/表具:${r.box_traits}`);
                    }
                    if (r.mounting_traits) {
                      parts.push(`表具構成:${r.mounting_traits}`);
                    }
                    if (r.material_structure) {
                      parts.push(`材質・構成:${r.material_structure}`);
                    }
                    if (r.technique) {
                      parts.push(`技法:${r.technique}`);
                    }
                    if (r.authenticity_points) {
                      parts.push(`真贋ポイント:${r.authenticity_points}`);
                    }
                    if (r.common_fake_patterns) {
                      parts.push(`偽物パターン:${r.common_fake_patterns}`);
                    }
                    if (r.era) {
                      parts.push(`時代:${r.era}`);
                    }
                    if (r.school_lineage) {
                      parts.push(`流派・系統:${r.school_lineage}`);
                    }
                    if (r.notes) {
                      parts.push(`備考:${r.notes}`);
                    }
                    return parts.join(" / ");
                  })
                  .join("\n")
            );
          }
        }
      } catch (e) {
        // wamon_reference 未作成の間はここに来る想定
        console.error("wamon_reference 取得エラー（未作成かも）", e);
      }

      // 5) 過去の教師データ（高信頼サンプル）
      try {
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
                .map((r: any) => {
                  return [
                    r.genre ? `ジャンル:${r.genre}` : null,
                    r.item_name ? `商品:${r.item_name}` : null,
                    r.confidence != null
                      ? `信頼度:${r.confidence}%`
                      : null,
                    r.output_text ? `概要:${r.output_text}` : null,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                })
                .join("\n")
          );
        }
      } catch (e) {
        console.error("training_items 取得エラー", e);
      }
    } catch (e) {
      console.error("リファレンス取得全体エラー", e);
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

    const output_text_raw =
      typeof parsed.output_text === "string"
        ? parsed.output_text
        : String(rawText);

    let output_text = output_text_raw;
    if (!output_text.includes("【想定相場】")) {
      const sep = output_text.endsWith("\n") ? "" : "\n";
      output_text = output_text + sep + "【想定相場】不明（データ不足）";
    }

    const item_name: string | null =
      typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;

    // タイトルを最適化
    const mercari_title = buildMercariTitle(
      parsed.mercari_title,
      item_name,
      output_text
    );

    const mercari_description: string =
      typeof parsed.mercari_description === "string"
        ? parsed.mercari_description
        : output_text;

    const confidence: number | null =
      typeof parsed.confidence === "number" ? parsed.confidence : null;

    const genre: string | null =
      typeof parsed.genre === "string" ? parsed.genre.trim() : null;

    // appraisals 保存
    try {
      await supabase.from("appraisals").insert([
        {
          user_id,
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

    // training_items 保存（従来どおり）
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
