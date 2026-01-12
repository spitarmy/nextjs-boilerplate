import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ListingMode = "flea" | "auction";
type AssessMode = "normal" | "bundle";

const MONTHLY_LIMIT_UNITS = 1500;
const OVERAGE_FEE_YEN_PER_UNIT = 50; // 1件50円（0.5件なら25円の計算も可能）

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

// ===== オークション用タイトル組み立て（AIが出したのを優先しつつ丸める） =====
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

  if (countYahooLike(title) > 65) {
    title = trimYahooLike(title, 65);
  }
  return title;
}

// ===== レート制限向け: 遅延ヘルパー =====
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===== OpenAI呼び出し（429時はリトライ） =====
async function callOpenAIWithRetry(client: OpenAI, payload: any, maxRetries = 2): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      return await client.responses.create(payload);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      if (status !== 429 || attempt >= maxRetries) throw err;
      attempt += 1;
      const waitMs = 1500 * attempt;
      console.warn(`OpenAI rate limit (429) on attempt ${attempt}, retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
}

// ===== 月次利用数を集計（0.5対応）=====
async function getMonthlyUsageUnits(user_id: string | null): Promise<{ used: number; over: number }> {
  if (!user_id) return { used: 0, over: 0 };
  const from = startOfMonthISO();

  const { data, error } = await supabase
    .from("usage_events")
    .select("units,is_overage,created_at")
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

// ===== usage_events を挿入（境界を跨ぐ場合は2行に分割）=====
async function insertUsageEventSplit(params: {
  user_id: string | null;
  units: number;
  assess_mode: AssessMode;
  listing_mode: ListingMode | null;
  allow_overage: boolean;
}) {
  const { user_id, units, assess_mode, listing_mode, allow_overage } = params;

  if (!user_id) return;

  const nowUsage = await getMonthlyUsageUnits(user_id);
  const before = nowUsage.used;
  const after = before + units;

  if (after <= MONTHLY_LIMIT_UNITS) {
    await supabase.from("usage_events").insert([
      {
        user_id,
        units,
        kind: "assess",
        assess_mode,
        listing_mode,
        is_overage: false,
      },
    ]);
    return;
  }

  if (!allow_overage) return;

  if (before >= MONTHLY_LIMIT_UNITS) {
    await supabase.from("usage_events").insert([
      {
        user_id,
        units,
        kind: "assess",
        assess_mode,
        listing_mode,
        is_overage: true,
      },
    ]);
    return;
  }

  const normalPart = Number((MONTHLY_LIMIT_UNITS - before).toFixed(1));
  const overPart = Number((units - normalPart).toFixed(1));

  const rows: any[] = [];
  if (normalPart > 0) {
    rows.push({
      user_id,
      units: normalPart,
      kind: "assess",
      assess_mode,
      listing_mode,
      is_overage: false,
    });
  }
  if (overPart > 0) {
    rows.push({
      user_id,
      units: overPart,
      kind: "assess",
      assess_mode,
      listing_mode,
      is_overage: true,
    });
  }
  if (rows.length) await supabase.from("usage_events").insert(rows);
}

/**
 * ===== ユーザー補助入力（全ジャンル対応）=====
 * - “上書き”ではなく “根拠（Evidence）” として扱う
 */
type UserEvidence = {
  // フリー入力（最重要：何でも入れられる）
  free_text?: string;

  // よくある入力（全ジャンルで使える）
  brand_or_maker?: string;   // ブランド/メーカー
  model_or_title?: string;   // 型番/商品名（ユーザーがわかる場合）
  material?: string;         // 素材
  size?: string;             // サイズ
  era?: string;              // 時代/年代
  author_or_artist?: string; // 作家/作者
  signature_text?: string;   // 署名/銘（読めた文字）
  seal_text?: string;        // 印文（読めた文字）
  accessories?: string;      // 付属（箱/鑑定書/栞など）
  purchase_source?: string;  // 入手経路（任意）

  // 任意：鑑定書/証明情報（ジャンル問わず）
  certificate?: {
    issuer?: string;    // 発行元（例：GIA/中央宝石など）
    report_no?: string; // 番号
    details?: string;   // 4Cや数値など自由記載
  };
};

function normalizeEvidence(body: any): UserEvidence | null {
  const ev = body?.user_evidence;
  if (!ev || typeof ev !== "object") return null;

  const takeStr = (v: any) => (typeof v === "string" ? v.trim() : "");
  const out: UserEvidence = {
    free_text: takeStr(ev.free_text) || undefined,
    brand_or_maker: takeStr(ev.brand_or_maker) || undefined,
    model_or_title: takeStr(ev.model_or_title) || undefined,
    material: takeStr(ev.material) || undefined,
    size: takeStr(ev.size) || undefined,
    era: takeStr(ev.era) || undefined,
    author_or_artist: takeStr(ev.author_or_artist) || undefined,
    signature_text: takeStr(ev.signature_text) || undefined,
    seal_text: takeStr(ev.seal_text) || undefined,
    accessories: takeStr(ev.accessories) || undefined,
    purchase_source: takeStr(ev.purchase_source) || undefined,
    certificate: ev.certificate && typeof ev.certificate === "object"
      ? {
          issuer: takeStr(ev.certificate.issuer) || undefined,
          report_no: takeStr(ev.certificate.report_no) || undefined,
          details: takeStr(ev.certificate.details) || undefined,
        }
      : undefined,
  };

  // 全部空なら null 扱い
  const hasAny =
    Object.values(out).some((v) => (typeof v === "string" && v.length > 0)) ||
    (out.certificate && Object.values(out.certificate).some((v) => typeof v === "string" && v.length > 0));

  return hasAny ? out : null;
}

function formatEvidenceForPrompt(ev: UserEvidence | null): string {
  if (!ev) return "";

  const lines: string[] = [];
  const push = (label: string, v?: string) => {
    if (v && v.trim().length) lines.push(`- ${label}: ${v.trim()}`);
  };

  push("自由入力", ev.free_text);
  push("ブランド/メーカー", ev.brand_or_maker);
  push("型番/商品名", ev.model_or_title);
  push("素材", ev.material);
  push("サイズ", ev.size);
  push("時代/年代", ev.era);
  push("作家/作者", ev.author_or_artist);
  push("署名/銘（読めた文字）", ev.signature_text);
  push("印文（読めた文字）", ev.seal_text);
  push("付属品", ev.accessories);
  push("入手経路", ev.purchase_source);

  if (ev.certificate) {
    push("証明/鑑定書 発行元", ev.certificate.issuer);
    push("証明/鑑定書 番号", ev.certificate.report_no);
    push("証明/鑑定書 詳細", ev.certificate.details);
  }

  return [
    "【USER_EVIDENCE（ユーザー補助情報）】",
    "以下はユーザーが入力した“補助情報”です。必ず次のルールで扱ってください：",
    "・真贋/作者/型番を「上書き」せず、根拠として参照する（矛盾があれば矛盾点も書く）",
    "・画像・刻印・落款が優先だが、鑑定書/証明は強い根拠として扱う",
    "・特に書画/掛軸は、読めた落款/印文があるなら候補提示の精度を上げること",
    lines.join("\n"),
  ].join("\n");
}

// ===== SYSTEM PROMPT（共通）=====
const SYSTEM_PROMPT_BASE = [
  "あなたは骨董・ブランド・和装・雑貨・おもちゃ・時計・家電など幅広い商品を査定するプロの鑑定士AIです。",
  "画像とリファレンス情報をもとに、真贋・型名・状態・相場・出品文を一貫した基準で出力します。",
  "",
  "【最重要方針】",
  "・真贋判定は「確率」であり、保証ではない。",
  "・偽物を本物と誤認するリスクを最小化しつつ、本物の中古商品を不必要に低評価しないこと。",
  "・刻印/フォント/内部構造など“偽物が破綻しやすい部位”を最重視する。",
  "・汚れ/スレ/自然劣化は中古では通常発生するため、偽物判定の主因にしない。",
  "・一致点と不一致点を総合評価し、偏った判定にしない。",
  "・複数商品が写っている場合は値の付きそうな物から査定コメントに記載し、値段も一点ずつ記載する（通常査定）。",
  "",
  "【リファレンスの扱い】",
  "・リファレンスは参考。しかし古い型・個体差・経年劣化で外れることもあるため、依存しすぎない。",
  "・リファレンスに無い＝即偽物ではない。",
  "・強い矛盾のみ偽物方向の根拠とする。",
  "",
  "【書画・掛軸・骨董の注意（重要）】",
  "・作者/落款は「候補提示＋根拠＋不一致点」で表現し、当てに行く（ただし断定は避ける）。",
  "・落款が読めない場合でも、筆致/印の形/配置/時代整合で“推定”を出す。",
  "・作者が外れても相場が破綻しないよう、相場は控えめ・根拠付きで提示する。",
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

// ===== 通常査定：フリマ用（必要なものだけ）=====
const PROMPT_NORMAL_FLEA = [
  "【モード】通常査定 / フリマ向け",
  "出力はフリマ向けに最適化すること。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  "・listing_mode は \"flea\"",
  "・assess_mode は \"normal\"",
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

// ===== 通常査定：オークション用（必要なものだけ）=====
const PROMPT_NORMAL_AUCTION = [
  "【モード】通常査定 / オークション向け",
  "出力はオークション向けに最適化すること。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  "・listing_mode は \"auction\"",
  "・assess_mode は \"normal\"",
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

// ===== まとめ査定：ピックアップ特化（タイトル生成なし）=====
const PROMPT_BUNDLE = [
  "【モード】まとめ査定（写真内に複数商品がある想定）",
  "目的：値が付きそうな物を優先して「数点」ピックアップして簡易査定する。",
  "出品用タイトルや説明文は生成しない。",
  "",
  "【出力キー】",
  "output_text / mercari_title / mercari_description / auction_title / listing_mode / assess_mode / confidence / genre / item_name / bundle_pickups",
  "",
  "【制約】",
  "・assess_mode は \"bundle\"",
  "・listing_mode は \"flea\" を入れてよい（表示用。実際の出品文は作らない）",
  "・mercari_title / mercari_description / auction_title はすべて null",
  "・bundle_pickups は配列で 1〜5件。値が付きそうな順に。",
  "",
  "【bundle_pickups の各要素】",
  "item_name（短い商品名/種類）必須",
  "price_hint（例：\"2,000〜4,000円前後\"）可能なら",
  "notes（要追加写真/真贋注意/見落とし注意点など）",
  "",
  "【output_text】",
  "写真全体に対する総評（要追加写真の指示・危ないポイント）を短く。",
  "",
  "【禁止】",
  "・作者断定・真贋断定は根拠（メーカー、文字、特定に足る要素）がない限りしない。",
].join("\n");

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY が不足しています。" }, { status: 500 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "JSON形式のリクエストを送ってください。" }, { status: 400 });
    }

    const user_id: string | null =
      typeof (body as any).user_id === "string" && (body as any).user_id.trim().length > 0 ? (body as any).user_id : null;

    const assess_mode: AssessMode = (body as any).assess_mode === "bundle" ? "bundle" : "normal";
    const listing_mode: ListingMode = (body as any).listing_mode === "auction" ? "auction" : "flea";

    const allow_overage: boolean = Boolean((body as any).allow_overage);

    // ★ NEW: ユーザー補助入力（全ジャンル）
    const userEvidence = normalizeEvidence(body);
    const evidenceText = formatEvidenceForPrompt(userEvidence);

    // units（まとめ査定は 0.5）
    const units = assess_mode === "bundle" ? 0.5 : 1.0;

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
      return NextResponse.json({ ok: false, error: "画像データがありません。" }, { status: 400 });
    }

    // ===== 先に月次上限チェック（超過なら 402 を返す）=====
    const monthUsage = await getMonthlyUsageUnits(user_id);
    const wouldBe = Number((monthUsage.used + units).toFixed(1));

    if (wouldBe > MONTHLY_LIMIT_UNITS && !allow_overage) {
      const usagePayload = {
        used_units: monthUsage.used,
        limit_units: MONTHLY_LIMIT_UNITS,
        overage_units: monthUsage.over,
      };

      return NextResponse.json(
        {
          ok: false,
          over_limit: true,
          required_overage_fee_yen: OVERAGE_FEE_YEN_PER_UNIT,
          usage: usagePayload,
          error: `今月の上限（${MONTHLY_LIMIT_UNITS}件）に達しました。超過で続行する場合は「1件${OVERAGE_FEE_YEN_PER_UNIT}円」で月末請求になります。`,
        },
        { status: 402 }
      );
    }

    // ===== Supabase リファレンス収集（重いなら後で段階化可能）=====
    let referenceBlocks: string[] = [];

    try {
      const { data: brandRows } = await supabase.from("brand_data_reference_v2").select("brand,line_name,model_name").limit(20);
      if (brandRows?.length) {
        referenceBlocks.push(
          "[ブランドバッグ系リファレンス]\n" +
            brandRows.map((r: any) => `ブランド:${r.brand} / ライン:${r.line_name} / モデル:${r.model_name}`).join("\n")
        );
      }

      const { data: jewelryRows } = await supabase.from("jewelry_reference").select("*").limit(20);
      if (jewelryRows?.length) {
        referenceBlocks.push("[ジュエリー系リファレンス]\n" + jewelryRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }

      const { data: kinkoRows } = await supabase.from("kinko_urushi_reference").select("*").limit(20);
      if (kinkoRows?.length) {
        referenceBlocks.push("[金工・漆器系リファレンス]\n" + kinkoRows.map((r: any) => JSON.stringify(r)).join("\n"));
      }

      const { data: wamonRows } = await supabase
        .from("wamon_reference")
        .select(
          "genre,category,author_name,style_traits,stroke_traits,signature_traits,seal_text,seal_shape_color,seal_position,authenticity_points,common_fake_patterns,era,school_lineage"
        )
        .limit(30);

      if (wamonRows?.length) {
        referenceBlocks.push(
          "[和物（書画・陶磁器・茶道具・箱書）リファレンス]\n" +
            wamonRows
              .map(
                (r: any) =>
                  `ジャンル:${r.genre} / カテゴリ:${r.category} / 作家:${r.author_name} / 筆跡:${r.stroke_traits} / 落款:${r.signature_traits} / 印文:${r.seal_text} / 真贋ポイント:${r.authenticity_points} / 贋作パターン:${r.common_fake_patterns} / 時代:${r.era} / 流派:${r.school_lineage}`
              )
              .join("\n")
        );
      }

      const { data: trainingRows } = await supabase
        .from("training_items")
        .select("genre,item_name,output_text,confidence")
        .eq("is_trainable", true)
        .order("created_at", { ascending: false })
        .limit(20);

      if (trainingRows?.length) {
        referenceBlocks.push(
          "[過去の教師データ]\n" +
            trainingRows.map((r: any) => `ジャンル:${r.genre} / 商品:${r.item_name} / 信頼度:${r.confidence}% / 概要:${r.output_text}`).join("\n")
        );
      }
    } catch (e) {
      console.error("リファレンス取得エラー", e);
    }

    const referenceText = referenceBlocks.join("\n\n");

    // ===== モード別プロンプト切替（ここが原価削減の本体）=====
    let modePrompt = "";
    if (assess_mode === "bundle") {
      modePrompt = PROMPT_BUNDLE;
    } else {
      modePrompt = listing_mode === "auction" ? PROMPT_NORMAL_AUCTION : PROMPT_NORMAL_FLEA;
    }

    // ★ NEW: ユーザー補助入力があればプロンプトに追記
    const content: any[] = [
      { type: "input_text", text: SYSTEM_PROMPT_BASE },
      { type: "input_text", text: modePrompt },

      // user evidence
      evidenceText ? { type: "input_text", text: evidenceText } : null,

      referenceText
        ? { type: "input_text", text: referenceText + "\n---\n上記の参考情報のうち画像に最も近いものを優先的に活用してください。" }
        : null,

      ...images.map((u) => ({ type: "input_image", image_url: u })),
    ].filter(Boolean);

    // ===== OpenAI リクエスト =====
    const aiRes: any = await callOpenAIWithRetry(openai, {
      model: "gpt-4.1",
      temperature: 0.2,
      max_output_tokens: assess_mode === "bundle" ? 1200 : 1600,
      input: [{ role: "user", content }],
    });

    const first = aiRes.output?.[0]?.content?.[0];
    const rawText: string = first?.text ?? "";

    if (!rawText) {
      return NextResponse.json({ ok: false, error: "AI出力が空です。" }, { status: 500 });
    }

    // ===== JSONパースの安定化処理 =====
    const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("JSON parse error:", e, rawText);
      return NextResponse.json({ ok: false, error: "AI出力のJSON解析に失敗しました。" }, { status: 500 });
    }

    // output_text の最低保証
    const output_text_raw = typeof parsed.output_text === "string" ? parsed.output_text : String(rawText);
    let output_text = output_text_raw;
    if (!output_text.includes("【想定相場】") && assess_mode !== "bundle") {
      const sep = output_text.endsWith("\n") ? "" : "\n";
      output_text = output_text + sep + "【想定相場】不明（データ不足）";
    }

    const item_name: string | null = typeof parsed.item_name === "string" ? parsed.item_name.trim() : null;
    const confidence: number | null = typeof parsed.confidence === "number" ? parsed.confidence : null;
    const genre: string | null = typeof parsed.genre === "string" ? parsed.genre.trim() : null;

    // ===== モード別で生成物を分ける（nullで返す）=====
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

    // ===== ここで usage_events を加算（成功時のみ）=====
    await insertUsageEventSplit({
      user_id,
      units,
      assess_mode,
      listing_mode: assess_mode === "bundle" ? null : listing_mode,
      allow_overage,
    });

    // ===== 最新の利用数を返す（UI即更新用）=====
    const updatedUsage = await getMonthlyUsageUnits(user_id);

    // appraisals 保存（既存維持）
    try {
      await supabase.from("appraisals").insert([
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
          // ※列が無い場合はエラーになるので保存先を変える必要あり
          // ここでは列追加が未確定なので触らない
        },
      ]);
    } catch (e) {
      console.error("appraisals 保存中の例外:", e);
    }

    // training_items 保存（既存維持）
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
          auction_title,
          listing_mode: assess_mode === "bundle" ? "flea" : listing_mode,
          model: "gpt-4.1",
          source: "kanteno-web",
          confidence,
          is_trainable: isTrainable,
          raw_request: {
            image_urls: images,
            listing_mode,
            assess_mode,
            user_evidence: userEvidence, // ★ NEW
          },
          raw_response: aiRes,
        },
      ]);
    } catch (e) {
      console.error("training_items 保存中の例外:", e);
    }

    // assessment_jobs 保存（既存維持）
    try {
      await supabase.from("assessment_jobs").insert([
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
            user_evidence: userEvidence, // ★ NEW（列追加なしでJSON内に）
          },
          error_message: null,
        },
      ]);
    } catch (e) {
      console.error("assessment_jobs 保存中の例外:", e);
    }

    return NextResponse.json(
      {
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
        // ★ NEW: UIで「入力した補助情報」を保持できるよう返す（互換壊さない）
        user_evidence: userEvidence,
        usage: {
          used_units: updatedUsage.used,
          limit_units: MONTHLY_LIMIT_UNITS,
          overage_units: updatedUsage.over,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("assess error", e);

    const status = e?.status ?? e?.response?.status;
    if (status === 429) {
      return NextResponse.json({ ok: false, error: "AI側のレート制限に達しています。少し時間をおいて再度お試しください。" }, { status: 429 });
    }

    return NextResponse.json({ ok: false, error: e?.message ?? "査定中にエラーが発生しました。" }, { status: 500 });
  }
}
