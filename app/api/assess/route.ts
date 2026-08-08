import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";
import { checkRateLimit } from "../../../lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Pro: 最大60秒（Hobbyのデフォルト10秒では査定がタイムアウトする）

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ListingMode = "flea" | "auction";
type AssessMode = "normal" | "bundle";

// ===== ジャンル分類（案E: 2段階査定の Step 1 で使用） =====
type GenreCategory =
  | "brand_bag"
  | "jewelry"
  | "wamon"
  | "kinko_urushi"
  | "watch"
  | "toy"
  | "electronics"
  | "other";

// ===== ヒント値のサニタイズ（PostgRESTフィルタインジェクション防止） =====
function sanitizeForFilter(value: string): string {
  // PostgRESTのフィルタ構文で特殊な意味を持つ文字をエスケープ
  return value
    .replace(/[.,()"'\\]/g, "") // フィルタ構文の区切り文字を除去
    .replace(/\s+/g, " ")       // 連続空白を正規化
    .trim()
    .slice(0, 100);              // 長さ制限
}

// ===== プラン別上限 =====
type UserPlan = "light" | "pro";
const PLAN_LIMITS: Record<UserPlan, number | null> = {
  light: 100,   // ライト: 月100件
  pro: null,    // プロ: 無制限
};

function getPlanLimit(plan: UserPlan): number | null {
  return PLAN_LIMITS[plan] ?? 100;
}

function startOfMonthISO(d = new Date()): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return dt.toISOString();
}

// ===== タイトル用トークン化ヘルパー =====
function tokenizeForTitle(s: string): string[] {
  return s
    .split(/[\s　\/・,、()\[\]]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

// ===== メルカリタイトル最適化ヘルパー =====
function buildMercariTitle(rawTitle: unknown, item_name: string | null, output_text: string): string {
  const baseName = (item_name ?? "").trim();
  const originalTitle = typeof rawTitle === "string" ? rawTitle.trim() : "";

  let base = baseName || originalTitle;
  if (!base) return "";

  const baseWords = tokenizeForTitle(base);
  const wordsInBase = new Set<string>(baseWords);

  const extraWords: string[] = [];
  const seen = new Set<string>();

  if (originalTitle) {
    const tokens: string[] = tokenizeForTitle(originalTitle);
    tokens.forEach((t: string) => {
      const key = t.trim();
      if (!key) return;
      if (wordsInBase.has(key)) return;
      if (base.includes(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      extraWords.push(key);
    });
  }

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

  let title = base;
  const tailParts: string[] = [];

  extraWords.forEach((w) => {
    if (!title.includes(w) && !tailParts.includes(w)) tailParts.push(w);
  });
  hints.forEach((h) => {
    if (!title.includes(h) && !tailParts.includes(h)) tailParts.push(h);
  });

  if (tailParts.length > 0) title = `${title} ${tailParts.join(" ")}`.trim();
  if (title.length > 40) title = title.slice(0, 40);
  return title;
}

// ===== ヤフオク想定：半角=0.5 / 全角=1 のカウント =====
function countYahooLike(str: string): number {
  let total = 0;
  for (const ch of str) {
    total += ch.charCodeAt(0) <= 0x007f ? 0.5 : 1;
  }
  return total;
}

function trimYahooLike(str: string, max: number): string {
  let total = 0;
  let out = "";
  for (const ch of str) {
    const w = ch.charCodeAt(0) <= 0x007f ? 0.5 : 1;
    if (total + w > max) break;
    out += ch;
    total += w;
  }
  return out.trim();
}

// ===== オークション用タイトル組み立て =====
function buildAuctionTitle(rawTitle: unknown, item_name: string | null, mercari_title: string, output_text: string): string {
  const original = typeof rawTitle === "string" ? rawTitle.trim() : "";
  let base = original || (item_name ?? "").trim() || mercari_title.trim();
  if (!base) return "";

  base = base
    .replace(/ヤフオク|Yahoo!?\s*オークション|Yahoo!?\s*Auction/gi, "")
    .replace(/メルカリ|Mercari/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const hints: string[] = [];
  if (/未使用|新品同様/.test(output_text) && !base.includes("未使用")) {
    hints.push("未使用に近い");
  } else if (/美品/.test(output_text) && !base.includes("美品")) {
    hints.push("美品");
  }

  let title = base;
  if (hints.length) {
    const add = hints.filter((h) => !title.includes(h)).join(" ");
    if (add) title = `${title} ${add}`.trim();
  }

  if (countYahooLike(title) > 65) title = trimYahooLike(title, 65);
  return title;
}

// ===== レート制限向け: 遅延ヘルパー =====
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== OpenAI呼び出し（429/500/503時はリトライ） =====
async function callOpenAIWithRetry(client: OpenAI, payload: any, maxRetries = 3): Promise<any> {
  let attempt = 0;
  const retryableStatuses = [429, 500, 502, 503];
  while (true) {
    try {
      return await client.responses.create(payload);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (!retryableStatuses.includes(status) || attempt >= maxRetries) {
        // リトライ不可なエラーは分類してログ
        const errorCategory = categorizeOpenAIError(err);
        console.error(`[KANTENO_ERROR] category=${errorCategory} status=${status} model=${payload.model} attempt=${attempt}`, err?.message);
        throw err;
      }
      attempt += 1;
      const waitMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000); // 指数バックオフ（最大10秒）
      console.warn(`[KANTENO_RETRY] status=${status} attempt=${attempt}/${maxRetries} wait=${waitMs}ms model=${payload.model}`);
      await sleep(waitMs);
    }
  }
}

// ===== エラー分類 =====
function categorizeOpenAIError(err: any): string {
  const status = err?.status ?? err?.response?.status;
  const message = (err?.message ?? "").toLowerCase();
  if (status === 429) return "RATE_LIMIT";
  if (status === 500 || status === 502 || status === 503) return "OPENAI_SERVER_ERROR";
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "AUTH_ERROR";
  if (message.includes("timeout") || message.includes("timed out")) return "TIMEOUT";
  if (message.includes("network") || message.includes("econnrefused")) return "NETWORK_ERROR";
  return "UNKNOWN";
}

// ===== ユーザー向けエラーメッセージ =====
function getUserFriendlyError(err: any): string {
  const category = categorizeOpenAIError(err);
  switch (category) {
    case "RATE_LIMIT":
      return "AI側のレート制限に達しています。少し時間をおいて再度お試しください。";
    case "OPENAI_SERVER_ERROR":
      return "AIサービスが一時的に利用できません。数分後に再度お試しください。";
    case "TIMEOUT":
      return "査定がタイムアウトしました。画像を減らすか、再度お試しください。";
    case "NETWORK_ERROR":
      return "ネットワークエラーが発生しました。インターネット接続を確認してください。";
    case "BAD_REQUEST":
      return "画像の形式に問題がある可能性があります。別の画像でお試しください。";
    default:
      return "査定中にエラーが発生しました。しばらくしてから再度お試しください。";
  }
}

// ===== 案D: 月次利用数を集計（最適化版）=====
// Supabase RPC が使えない場合のフォールバックとして、
// select で SUM を使い JS ループを回避
async function getMonthlyUsageUnits(user_id: string | null): Promise<{ used: number; over: number }> {
  if (!user_id) return { used: 0, over: 0 };
  const from = startOfMonthISO();

  // 全件取得ではなく、必要な列だけ取得し集計
  const { data, error } = await supabaseAdmin
    .from("usage_events")
    .select("units,is_overage")
    .eq("user_id", user_id)
    .gte("created_at", from)
    .limit(5000);

  if (error) {
    console.error("usage_events select error", error);
    return { used: 0, over: 0 };
  }

  let used = 0;
  let over = 0;
  for (const r of data ?? []) {
    const u = Number(r.units ?? 0);
    used += u;
    if (r.is_overage) over += u;
  }
  return { used: Number(used.toFixed(1)), over: Number(over.toFixed(1)) };
}

// ===== ユーザーのプランを取得 =====
async function getUserPlan(user_id: string | null): Promise<UserPlan> {
  if (!user_id) return "light";
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user_id)
      .maybeSingle();
    if (error || !data?.plan) return "light";
    return data.plan === "pro" ? "pro" : "light";
  } catch {
    return "light";
  }
}

// ===== usage_events を挿入 =====
async function insertUsageEvent(params: {
  user_id: string | null;
  units: number;
  assess_mode: AssessMode;
  listing_mode: ListingMode | null;
}) {
  const { user_id, units, assess_mode, listing_mode } = params;
  if (!user_id) return;

  await supabaseAdmin.from("usage_events").insert([
    { user_id, units, kind: "assess", assess_mode, listing_mode, is_overage: false },
  ]);
}

// ===== ユーザー設定（学習提供） =====
async function getUserAllowTraining(user_id: string | null): Promise<boolean> {
  if (!user_id) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("allow_training")
      .eq("id", user_id)
      .maybeSingle();

    if (error) {
      console.error("profiles allow_training select error", error);
      return false;
    }
    return Boolean(data?.allow_training);
  } catch (e) {
    console.error("getUserAllowTraining exception", e);
    return false;
  }
}

// ===== 案E: Step 1 — ジャンル事前分類（gpt-4.1-mini で高速判定） =====
async function classifyGenre(
  client: OpenAI,
  images: string[],
  hints: UserHints | null
): Promise<GenreCategory> {
  try {
    const hintClues: string[] = [];
    if (hints?.known_title) hintClues.push(`商品名: ${hints.known_title}`);
    if (hints?.known_author) hintClues.push(`作者/ブランド: ${hints.known_author}`);
    if (hints?.known_model) hintClues.push(`型番: ${hints.known_model}`);
    if (hints?.known_material) hintClues.push(`素材: ${hints.known_material}`);
    if (hints?.known_signature) hintClues.push(`署名/刻印: ${hints.known_signature}`);
    if (hints?.known_seal) hintClues.push(`落款/印文: ${hints.known_seal}`);
    if (hints?.certificate_text) hintClues.push(`鑑定書: ${hints.certificate_text}`);
    if (hints?.notes) hintClues.push(`補足: ${hints.notes}`);

    const classifyPrompt = [
      "以下の画像の商品ジャンルを1つ選んでJSONで出力してください。",
      "選択肢: brand_bag, jewelry, wamon, kinko_urushi, watch, toy, electronics, other",
      "",
      "・brand_bag: ブランドバッグ・財布・革小物（CHANEL, LOUIS VUITTON, GUCCI, HERMES等）",
      "・jewelry: ジュエリー・貴金属・宝石（指輪, ネックレス, K18, Pt, ダイヤ等）",
      "・wamon: 和物（書画, 掛軸, 陶磁器, 茶道具, 着物, 刀剣, 箱書等）",
      "・kinko_urushi: 金工・漆器（鉄瓶, 銀瓶, 蒔絵, 棗等）",
      "・watch: 腕時計・懐中時計",
      "・toy: おもちゃ・ホビー・フィギュア",
      "・electronics: 家電・カメラ・オーディオ",
      "・other: 上記に当てはまらないもの",
      "",
      hintClues.length > 0 ? `【ユーザー入力のヒント】\n${hintClues.join("\n")}` : "",
      "",
      '出力形式: {"genre": "選択肢の1つ"}',
      "JSONのみ出力。説明文禁止。",
    ].filter(Boolean).join("\n");

    const content: any[] = [
      { type: "input_text", text: classifyPrompt },
      // 分類には1枚目だけで十分（速度重視）
      { type: "input_image", image_url: images[0] },
    ];

    const res: any = await callOpenAIWithRetry(client, {
      model: "gpt-4.1-mini",
      temperature: 0,
      max_output_tokens: 50,
      input: [{ role: "user", content }],
    });

    const text = res.output?.[0]?.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      const genre = parsed.genre as string;
      const validGenres: GenreCategory[] = [
        "brand_bag", "jewelry", "wamon", "kinko_urushi",
        "watch", "toy", "electronics", "other",
      ];
      if (validGenres.includes(genre as GenreCategory)) {
        return genre as GenreCategory;
      }
    } catch {
      // パース失敗時は other にフォールバック
    }
  } catch (e) {
    console.error("ジャンル分類エラー（フォールバック: other）", e);
  }

  return "other";
}

// ===== 案E+G: ジャンル別リファレンス取得（関連テーブルだけクエリ） =====
async function loadReferencesForGenre(
  genre: GenreCategory,
  hints: UserHints | null
): Promise<string> {
  const blocks: string[] = [];

  try {
    // ジャンルに応じて必要なリファレンスだけ取得
    // ★ watch/jewelry もブランド品が多いため brand_data を併せて取得
    if (genre === "brand_bag" || genre === "watch" || genre === "jewelry" || genre === "other") {
      // 案G: hints の型番/ブランド名/商品名でフィルタ
      let query = supabaseAdmin.from("brand_data_reference_v2").select("brand,line_name,model_name");

      // ヒントがある場合、OR条件で絞り込み（関連性の高いリファレンスを優先取得）
      const brandFilters: string[] = [];
      if (hints?.known_model) brandFilters.push(`model_name.ilike.%${sanitizeForFilter(hints.known_model)}%`);
      if (hints?.known_author) brandFilters.push(`brand.ilike.%${sanitizeForFilter(hints.known_author)}%`);
      if (hints?.known_title) brandFilters.push(`line_name.ilike.%${sanitizeForFilter(hints.known_title)}%`);

      if (brandFilters.length > 0) {
        query = query.or(brandFilters.join(","));
      }

      const { data: brandRows } = await query.limit(15);
      if (brandRows?.length) {
        blocks.push(
          "[ブランドバッグ系リファレンス]\n" +
          brandRows.map((r: any) => `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`).join("\n")
        );
      }
    }

    if (genre === "jewelry" || genre === "other") {
      const { data: jewelryRows } = await supabaseAdmin.from("jewelry_reference").select("*").limit(15);
      if (jewelryRows?.length) {
        blocks.push("[ジュエリー系リファレンス]\n" + jewelryRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }
    }

    if (genre === "kinko_urushi" || genre === "wamon" || genre === "other") {
      // 金工・漆器は和物と関連が深いため、wamon と kinko_urushi を相互に取得
      const { data: kinkoRows } = await supabaseAdmin.from("kinko_urushi_reference").select("*").limit(15);
      if (kinkoRows?.length) {
        blocks.push("[金工・漆器系リファレンス]\n" + kinkoRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }
    }

    if (genre === "wamon" || genre === "kinko_urushi" || genre === "other") {
      // 案G: 作家名・署名・落款でフィルタ
      let query = supabaseAdmin
        .from("wamon_reference")
        .select(
          "genre,category,author_name,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,authenticity_points,common_fake_patterns,era,school_lineage"
        );

      // ヒントがある場合、OR条件で関連作家を優先取得
      const wamonFilters: string[] = [];
      if (hints?.known_author) wamonFilters.push(`author_name.ilike.%${sanitizeForFilter(hints.known_author)}%`);
      if (hints?.known_signature) wamonFilters.push(`signature_traits.ilike.%${sanitizeForFilter(hints.known_signature)}%`);
      if (hints?.known_seal) wamonFilters.push(`seal_text.ilike.%${sanitizeForFilter(hints.known_seal)}%`);

      if (wamonFilters.length > 0) {
        query = query.or(wamonFilters.join(","));
      }

      const { data: wamonRows } = await query.limit(20);
      if (wamonRows?.length) {
        blocks.push(
          "[和物（書画・陶磁器・茶道具・箱書）リファレンス]\n" +
          wamonRows
            .map(
              (r: any) =>
                `ジャンル:${r.genre} / カテゴリ:${r.category} / 作家:${r.author_name} / 筆跡:${r.stroke_traits} / 落款:${r.signature_traits} / 印文:${r.seal_text} / 真贋ポイント:${r.authenticity_points} / 贋作パターン:${r.common_fake_patterns} / 時代:${r.era} / 流派:${r.school_lineage}`
            )
            .join("\n")
        );
      }
    }

    // 教師データはジャンルでフィルタ（genre が "other" の場合は全ジャンル）
    let trainingQuery = supabaseAdmin
      .from("training_items")
      .select("genre,item_name,output_text,confidence")
      .eq("is_trainable", true)
      .order("created_at", { ascending: false });

    if (genre !== "other") {
      // ジャンル名の部分一致でフィルタ（training_items.genre は日本語なのでマッピング）
      const genreKeywords: Record<GenreCategory, string[]> = {
        brand_bag: ["ブランド", "バッグ", "財布", "革"],
        jewelry: ["ジュエリー", "宝石", "貴金属", "指輪", "ネックレス"],
        wamon: ["書画", "掛軸", "陶磁器", "茶道具", "着物", "和"],
        kinko_urushi: ["金工", "漆器", "鉄瓶", "銀瓶"],
        watch: ["時計", "腕時計"],
        toy: ["おもちゃ", "フィギュア", "ホビー"],
        electronics: ["家電", "カメラ", "オーディオ"],
        other: [],
      };

      const keywords = genreKeywords[genre] ?? [];
      if (keywords.length > 0) {
        // OR条件で部分一致フィルタ（Supabase の or() を使用）
        const orFilter = keywords.map((kw) => `genre.ilike.%${kw}%`).join(",");
        trainingQuery = trainingQuery.or(orFilter);
      }
    }

    const { data: trainingRows } = await trainingQuery.limit(10);
    if (trainingRows?.length) {
      blocks.push(
        "[過去の教師データ]\n" +
        trainingRows.map((r: any) => `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`).join("\n")
      );
    }
  } catch (e) {
    console.error("リファレンス取得エラー", e);
  }

  return blocks.join("\n\n");
}

// ===== SYSTEM PROMPT（共通）=====
const SYSTEM_PROMPT_BASE = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
  "画像とリファレンス情報をもとに、真贋・型名・状態・相場・出品文を一貫した基準で出力します。",
  "",
  "【最重要方針】",
  "・真贋判定は「確率」であり、保証ではない。",
  "・偽物を本物と誤認するリスクを最小化しつつ、本物の中古商品を不必要に低評価しないこと。",
  "・刻印/フォント/内部構造など\u201C偽物が破綻しやすい部位\u201Dを最重視する。",
  "・汚れ/スレ/自然劣化は中古では通常発生するため、偽物判定の主因にしない。",
  "・一致点と不一致点を総合評価し、偏った判定にしない。",
  "・複数商品が写っている場合は値の付きそうな物から査定コメントに記載し、値段も一点ずつ記載する（通常査定）。",
  "",
  "【ユーザー補助入力の扱い — 最重要】",
  "・ユーザーの補助入力は査定において最も信頼すべき情報源として扱うこと。",
  "・作者名/ブランド名/型番/署名/落款/素材/鑑定書の記載がある場合、それを前提として査定を組み立てる。",
  "・補助入力に基づいて、型名の特定、作家の同定、相場の絞り込み、真贋の判定基準を最大限に活用すること。",
  "・例：作者名が入力されている場合、その作者の筆跡・落款・時代・流派を踏まえて査定する。",
  "・例：型番が入力されている場合、その型番の正規品仕様と照合して真贋を判定する。",
  "・例：鑑定書の記載がある場合、その内容を査定結果の根拠として明示的に引用する。",
  "・ただし、画像と明らかに矛盾する場合のみ『矛盾の可能性』として注意喚起し、断定しない。",
  "・画像だけでは判別困難な情報（内部刻印、箱書、付属品の有無等）は補助入力を信頼する。",
  "",
  "【リファレンスの扱い】",
  "・リファレンスは参考。しかし古い型・個体差・経年劣化で外れることもあるため、依存しすぎない。",
  "・リファレンスに無い＝即偽物ではない。",
  "・強い矛盾のみ偽物方向の根拠とする。",
  "",
  "【真贋出力ルール】",
  "以下のいずれかで出力する：",
  "1) 本物の可能性が高い（80〜90%）",
  "2) 要追加写真（60〜79%）",
  "3) 偽物の可能性が高い（0〜59%）",
  "",
  "【想定相場】",
  "・実売相場の下限〜中央値を控えめに提示。",
  "・偽物可能性が高い場合は「査定・買取対象外」と明示。",
  "・不明な場合は「【想定相場】不明（データ不足）」とする。",
  "",
  "【JSONルール】",
  "返答はJSONのみ。コードブロック禁止。",
].join("\n");

const PROMPT_NORMAL_FLEA = [
  "【モード】通常査定 / フリマ向け",
  "出力はフリマ向けに最適化すること。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  '・listing_mode は "flea"',
  '・assess_mode は "normal"',
  "・mercari_title（最大40文字）必須",
  "・mercari_description（200〜400文字）必須",
  "・auction_title は null にする（生成しない）",
  "・bundle_pickups は null",
  "",
  "【output_text】",
  "必ず4行構成（＋必要なら1〜2行補足）",
  "1行目：【真贋】〜",
  "2行目：【型名】〜",
  "3行目：【状態】〜",
  "4行目：【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
  "",
  "【禁止】",
  "・真贋断定（本物です等）禁止",
  "・金額を説明文に書かない",
].join("\n");

const PROMPT_NORMAL_AUCTION = [
  "【モード】通常査定 / オークション向け",
  "出力はオークション向けに最適化すること。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  '・listing_mode は "auction"',
  '・assess_mode は "normal"',
  "・auction_title（最大65カウント想定）必須（サイト名明記禁止）",
  "・mercari_title は null（生成しない）",
  "・mercari_description は null（生成しない）",
  "・bundle_pickups は null",
  "",
  "【auction_title】",
  "・サイト名は絶対に明記しない（ヤフオク/メルカリ等禁止）。",
  "・検索されやすい順に、ブランド/型番/素材/サイズ/付属/状態を並べる。",
  "",
  "【output_text】",
  "必ず4行構成（＋必要なら1〜2行補足）",
  "1行目：【真贋】〜",
  "2行目：【型名】〜",
  "3行目：【状態】〜",
  "4行目：【想定相場】◯◯,◯◯◯〜◯◯,◯◯◯円前後（◯◯基準）",
].join("\n");

const PROMPT_BUNDLE = [
  "【モード】まとめ査定（写真内に複数商品がある想定）",
  "目的：値が付きそうな物を優先して「数点」ピックアップして簡易査定する。",
  "出品用タイトルや説明文は生成しない。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  '・assess_mode は "bundle"',
  '・listing_mode は "flea" を入れてよい（表示用。実際の出品文は作らない）',
  "・mercari_title / mercari_description / auction_title はすべて null",
  "・bundle_pickups は配列で 1〜5件。値が付きそうな順に。",
  "",
  "【bundle_pickups の各要素】",
  "item_name（短い商品名/種類）必須",
  'price_hint（例："2,000〜4,000円前後"）可能なら',
  "notes（要追加写真/真贋注意/見落とし注意点など）",
  "",
  "【output_text】",
  "写真全体に対する総評（要追加写真の指示・危ないポイント）を短く。",
  "",
  "【禁止】",
  "・作者断定・真贋断定は根拠（メーカー、文字、特定に足る要素）がない限りしない。",
].join("\n");

// ===== ユーザー補助入力（自由） =====
type UserHints = {
  known_title?: string;      // 作品名/商品名
  known_author?: string;     // 作家/作者
  known_signature?: string;  // 銘/署名/サイン（読めた文字）
  known_seal?: string;       // 落款（印文）
  known_model?: string;      // 型番/品番
  known_material?: string;   // 素材/金性など
  certificate_text?: string; // 鑑定書/保証書の主要記載（コピペ）
  notes?: string;            // その他補足（箱書の文言、購入先、年代など）
};

function normalizeHints(raw: any): UserHints | null {
  if (!raw || typeof raw !== "object") return null;
  const pick = (k: string) => (typeof raw[k] === "string" ? raw[k].trim() : "");
  const hints: UserHints = {
    known_title: pick("known_title"),
    known_author: pick("known_author"),
    known_signature: pick("known_signature"),
    known_seal: pick("known_seal"),
    known_model: pick("known_model"),
    known_material: pick("known_material"),
    certificate_text: pick("certificate_text"),
    notes: pick("notes"),
  };
  const hasAny = Object.values(hints).some((v) => typeof v === "string" && v.length > 0);
  if (!hasAny) return null;
  return hints;
}

function formatHintsForPrompt(hints: UserHints | null): string | null {
  if (!hints) return null;
  const lines: string[] = [];
  if (hints.known_title) lines.push(`★ 作品/商品名: ${hints.known_title}`);
  if (hints.known_author) lines.push(`★ 作者/作家/ブランド名: ${hints.known_author}`);
  if (hints.known_signature) lines.push(`★ 銘/署名/サイン（読めた文字）: ${hints.known_signature}`);
  if (hints.known_seal) lines.push(`★ 落款・印文: ${hints.known_seal}`);
  if (hints.known_model) lines.push(`★ 型番/品番: ${hints.known_model}`);
  if (hints.known_material) lines.push(`★ 素材/金性等: ${hints.known_material}`);
  if (hints.certificate_text) lines.push(`★★ 鑑定書/保証書の記載（信頼度高）: ${hints.certificate_text}`);
  if (hints.notes) lines.push(`★ 補足情報: ${hints.notes}`);

  return [
    "【ユーザー補助入力 — 査定の最重要ヒント】",
    "以下はユーザーが実物を見て読み取った情報、または手元の資料から転記した情報です。",
    "これらの情報は画像では判別しにくい内部刻印・箱書・付属書類の内容を含む場合があり、",
    "査定の精度を大幅に高める最重要のヒントです。",
    "",
    "■ 活用方法：",
    "・型名/モデルの特定に直接使用してください。",
    "・作者名がある場合、その作者の真贋判定基準（筆跡・落款・流派等）を適用してください。",
    "・型番がある場合、その型番の正規品仕様と照合してください。",
    "・鑑定書/保証書の記載は第三者機関の評価として高い信頼度で扱ってください。",
    "・素材情報は相場や真贋判定の根拠として使用してください。",
    "・これらの情報を査定結果のoutput_textに必ず反映（引用/言及）してください。",
    "",
    "■ 矛盾がある場合のみ注意喚起し、それ以外はヒントを全面的に信頼してください。",
    "",
    ...lines,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  // ===== バリデーション（ストリーム前にエラーを返す） =====
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY が不足しています。" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "JSON形式のリクエストを送ってください。" }, { status: 400 });
  }

  // ★ サーバーサイド認証: クッキーからセッションを取得してuser_idを検証
  let user_id: string | null = null;
  try {
    const supabaseAuth = createSupabaseServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    user_id = user?.id ?? null;
  } catch {
    // 認証失敗時はnullのまま（ミドルウェアで弾かれるはずだがフォールバック）
  }
  // クライアントから送られたuser_idは信頼しない（フォールバックとしてのみ使用）
  if (!user_id) {
    const bodyUserId = typeof (body as any).user_id === "string" && (body as any).user_id.trim().length > 0
      ? (body as any).user_id
      : null;
    user_id = bodyUserId;
  }

  // ★ レート制限チェック（OpenAI APIコール前に実行）
  if (user_id) {
    const rateCheck = checkRateLimit(user_id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "リクエストが多すぎます。しばらく時間をおいてから再度お試しください。",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateCheck.retryAfter ?? 60),
          },
        }
      );
    }
  }

  const assess_mode: AssessMode = (body as any).assess_mode === "bundle" ? "bundle" : "normal";
  const listing_mode: ListingMode = (body as any).listing_mode === "auction" ? "auction" : "flea";

  // ★ ユーザー補助入力
  let hints: UserHints | null = normalizeHints((body as any).user_hints);
  const has_seal_closeup = (body as any).has_seal_closeup === true;
  if (has_seal_closeup) {
    if (!hints) hints = {};
    hints.notes = ((hints.notes || "") + "\n※クローズアップ画像（最後の1枚）を特に注視して査定してください。").trim();
  }
  const hintsText = formatHintsForPrompt(hints);

  // units（まとめ査定は 0.5）
  const units = assess_mode === "bundle" ? 0.5 : 1.0;

  // 画像抽出
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
    return NextResponse.json({ ok: false, error: "画像データがありません。" }, { status: 400 });
  }

  // ===== SSE ストリーミングレスポンス =====
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // SSEイベントを送信するヘルパー
      function sendEvent(event: string, data: any) {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // ストリームが閉じている場合は無視
        }
      }

      const assessStartTime = Date.now();

      try {
        // ===== Stage 1: ジャンル分類 + 利用量チェック（並列） =====
        console.log(`[KANTENO_ASSESS] start user=${user_id ?? 'anon'} images=${images.length} mode=${assess_mode} listing=${listing_mode}`);

        sendEvent("progress", { stage: "classify", message: "ジャンル分類中..." });

        const [monthUsage, allow_training, detectedGenre, userPlan] = await Promise.all([
          getMonthlyUsageUnits(user_id),
          getUserAllowTraining(user_id),
          classifyGenre(openai, images, hints),
          getUserPlan(user_id),
        ]);

        const planLimit = getPlanLimit(userPlan);

        const classifyMs = Date.now() - assessStartTime;
        console.log(`[KANTENO_ASSESS] classified genre=${detectedGenre} plan=${userPlan} elapsed=${classifyMs}ms`);

        // 月次上限チェック（プロプランは無制限のためスキップ）
        if (planLimit !== null) {
          const wouldBe = Number((monthUsage.used + units).toFixed(1));
          if (wouldBe > planLimit) {
            sendEvent("error", {
              ok: false,
              over_limit: true,
              plan: userPlan,
              usage: {
                used_units: monthUsage.used,
                limit_units: planLimit,
                overage_units: 0,
              },
              error: `今月の上限（${planLimit}件）に達しました。プロプランへのアップグレードをご検討ください。`,
            });
            controller.close();
            return;
          }
        }

        // ===== Stage 2: リファレンス取得 =====
        sendEvent("progress", {
          stage: "references",
          message: "リファレンス取得中...",
          genre: detectedGenre,
        });

        const referenceText = await loadReferencesForGenre(detectedGenre, hints);

        // ===== Stage 3: AI査定 =====
        sendEvent("progress", { stage: "assess", message: "AI査定中..." });

        // モード別プロンプト
        let modePrompt = "";
        if (assess_mode === "bundle") {
          modePrompt = PROMPT_BUNDLE;
        } else {
          modePrompt = listing_mode === "auction" ? PROMPT_NORMAL_AUCTION : PROMPT_NORMAL_FLEA;
        }

        const content: any[] = [
          { type: "input_text", text: SYSTEM_PROMPT_BASE },
          { type: "input_text", text: modePrompt },
          { type: "input_text", text: `【事前分類】この商品は「${detectedGenre}」ジャンルと判定されました。この分類を参考にしつつ、画像を主軸に査定してください。分類が明らかに間違っている場合は無視してください。` },
          hintsText ? { type: "input_text", text: hintsText } : null,
          referenceText
            ? { type: "input_text", text: referenceText + "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。" }
            : null,
          ...images.map((u) => ({ type: "input_image", image_url: u })),
        ].filter(Boolean);

        const aiRes: any = await callOpenAIWithRetry(openai, {
          model: "gpt-4.1",
          temperature: 0.2,
          max_output_tokens: assess_mode === "bundle" ? 1200 : 1600,
          input: [{ role: "user", content }],
        });

        const first = aiRes.output?.[0]?.content?.[0];
        const rawText: string = first?.text ?? "";

        if (!rawText) {
          sendEvent("error", { ok: false, error: "AI出力が空です。" });
          controller.close();
          return;
        }

        // JSONパース安定化
        const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          console.error("JSON parse error:", e, rawText);
          sendEvent("error", { ok: false, error: "AI出力のJSON解析に失敗しました。" });
          controller.close();
          return;
        }

        // output_text 最低保証
        const output_text_raw = typeof parsed.output_text === "string" ? parsed.output_text : String(rawText);
        let output_text = output_text_raw;
        if (!output_text.includes("【想定相場】") && assess_mode !== "bundle") {
          const sep = output_text.endsWith("\n") ? "" : "\n";
          output_text = output_text + sep + "【想定相場】不明（データ不足）";
        }

        const item_name: string | null = typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;
        const confidence: number | null = typeof parsed.confidence === "number" ? parsed.confidence : null;
        const genre: string | null = typeof parsed.genre === "string" ? parsed.genre.trim() : null;

        // 生成物をモード別に
        let mercari_title: string | null = null;
        let mercari_description: string | null = null;
        let auction_title: string | null = null;
        let bundle_pickups: any[] | null = null;

        if (assess_mode === "bundle") {
          mercari_title = null;
          mercari_description = null;
          auction_title = null;
          bundle_pickups = Array.isArray(parsed.bundle_pickups) ? parsed.bundle_pickups : null;
        } else if (listing_mode === "flea") {
          mercari_title = buildMercariTitle(parsed.mercari_title, item_name, output_text);
          mercari_description = typeof parsed.mercari_description === "string" ? parsed.mercari_description : output_text;
          auction_title = null;
          bundle_pickups = null;
        } else {
          const tmpMercariTitle = buildMercariTitle(parsed.mercari_title, item_name, output_text);
          auction_title = buildAuctionTitle(parsed.auction_title, item_name, tmpMercariTitle, output_text);
          mercari_title = null;
          mercari_description = null;
          bundle_pickups = null;
        }

        // ===== Stage 4: 結果送信（DB保存を待たずに先にクライアントに返す） =====
        sendEvent("progress", { stage: "saving", message: "結果を保存中..." });

        // usage_events 加算
        await insertUsageEvent({
          user_id,
          units,
          assess_mode,
          listing_mode: assess_mode === "bundle" ? null : listing_mode,
        });

        const updatedUsage = await getMonthlyUsageUnits(user_id);

        // 結果を先にクライアントに送信
        const resultPayload = {
          ok: true,
          output_text,
          mercari_title,
          mercari_description,
          auction_title,
          listing_mode: assess_mode === "bundle" ? "flea" : listing_mode,
          assess_mode,
          bundle_pickups,
          confidence,
          genre,
          item_name,
          detected_genre: detectedGenre,
          plan: userPlan,
          usage: {
            used_units: updatedUsage.used,
            limit_units: planLimit,
            overage_units: 0,
          },
          settings: {
            allow_training,
          },
        };

        sendEvent("result", resultPayload);

        // ===== DB保存はバックグラウンド（結果送信後に並列実行） =====
        const savePromises: Promise<any>[] = [];

        savePromises.push(
          (async () => {
            try {
              await supabaseAdmin.from("appraisals").insert([
                {
                  user_id,
                  genre,
                  item_name,
                  confidence,
                  mercari_title,
                  mercari_description,
                  auction_title,
                  listing_mode: assess_mode === "bundle" ? "flea" : listing_mode,
                  output_text,
                  image_urls: images,
                  model: "gpt-4.1",
                },
              ]);
            } catch (e) {
              console.error("appraisals 保存中の例外:", e);
            }
          })()
        );

        if (allow_training) {
          const isTrainable = confidence !== null && confidence >= 90;
          savePromises.push(
            (async () => {
              try {
                await supabaseAdmin.from("training_items").insert([
                  {
                    genre,
                    item_name,
                    image_urls: images,
                    output_text,
                    mercari_title,
                    mercari_description,
                    auction_title,
                    listing_mode: assess_mode === "bundle" ? "flea" : listing_mode,
                    model: "gpt-4.1",
                    source: "kanteno-web",
                    confidence,
                    is_trainable: isTrainable,
                    raw_request: { image_urls: images, listing_mode, assess_mode, user_hints: hints },
                    raw_response: aiRes,
                  },
                ]);
              } catch (e) {
                console.error("training_items 保存中の例外:", e);
              }
            })()
          );
        }

        savePromises.push(
          (async () => {
            try {
              await supabaseAdmin.from("assessment_jobs").insert([
                {
                  user_id,
                  image_urls: images,
                  status: "done",
                  result: {
                    output_text,
                    mercari_title,
                    mercari_description,
                    auction_title,
                    listing_mode: assess_mode === "bundle" ? "flea" : listing_mode,
                    assess_mode,
                    bundle_pickups,
                    confidence,
                    genre,
                    item_name,
                    user_hints: hints,
                    detected_genre: detectedGenre,
                  },
                  error_message: null,
                },
              ]);
            } catch (e) {
              console.error("assessment_jobs 保存中の例外:", e);
            }
          })()
        );

        await Promise.all(savePromises);

        sendEvent("done", {});

        const totalMs = Date.now() - assessStartTime;
        console.log(`[KANTENO_ASSESS] done user=${user_id ?? 'anon'} genre=${detectedGenre} confidence=${confidence ?? '?'} elapsed=${totalMs}ms`);

        controller.close();
      } catch (e: any) {
        const totalMs = Date.now() - assessStartTime;
        const category = categorizeOpenAIError(e);
        console.error(`[KANTENO_ERROR] assess_failed user=${user_id ?? 'anon'} category=${category} elapsed=${totalMs}ms`, e?.message);

        sendEvent("error", { ok: false, error: getUserFriendlyError(e) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

