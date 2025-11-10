// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// 状態グレード係数（中央値に掛ける）
const GRADE_COEF: Record<string, number> = {
  A: 0.90,
  B: 0.70,
  C: 0.60,
  D: 0.50,
  E: 0.30,
};

type ModelJson = {
  category?: string;
  brand?: string;
  title_guess?: string;
  material?: string;
  period?: string;
  authenticity_risk?: string;
  missing_parts?: string;
  defect_notes?: string;
  must_shoot_more?: string[];
  base_price_jpy?: number;
  condition_grade?: 'A' | 'B' | 'C' | 'D' | 'E';
  confidence?: number;
  reasons?: string;
};

function toInt(n: unknown, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : fallback;
}

function bandFromMid(mid: number, confidence: number) {
  const w = confidence < 60 ? 0.2 : 0.1; // 確信度で幅調整
  const min = Math.max(0, Math.floor(mid * (1 - w)));
  const max = Math.max(min, Math.ceil(mid * (1 + w)));
  return { min, max };
}

// Edge でも動く ArrayBuffer -> base64
function abToBase64(buf: ArrayBuffer) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // @ts-ignore - btoa は Edge Runtime で利用可
  return btoa(s);
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = abToBase64(buf);
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

export async function POST(req: NextRequest) {
  try {
    // 1) 画像入力の取り出し（multipart または JSON）
    const contentType = req.headers.get('content-type') || '';
    let imageUrl: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file =
        (form.get('file') as File | null) ||
        (form.get('image') as File | null) ||
        null;
      if (!file) {
        return NextResponse.json(
          { error: '画像ファイルが見つかりません（file または image キー）。' },
          { status: 400 }
        );
      }
      imageUrl = await fileToDataUrl(file); // data:URL として渡す
    } else {
      const json = (await req.json().catch(() => ({}))) as { image_url?: string };
      imageUrl = json.image_url?.trim();
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'image_url または 画像ファイルが必要です。' },
        { status: 400 }
      );
    }

    // 2) OpenAI へ問い合わせ（画像＋テキスト）
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'あなたは中古リユース査定AI「カンテノ」。',
            'タスク: 画像1枚から分かる範囲で商品を同定し、日本語で JSON を**厳密に**返す。',
            '注意: テキスト以外は出力しない（コードブロックも不可）。',
            'フィールド:',
            '- category, brand, title_guess, material, period',
            '- authenticity_risk（真贋上の要注意点の要約）',
            '- missing_parts（欠品が疑われる場合は記載）',
            '- defect_notes（傷/汚れ/日焼け/サビ等の気づき）',
            '- must_shoot_more: string[]（追撮すべき部位: 刻印/ラベル/裏面/シリアル 等）',
            '- base_price_jpy: number（国内中古相場の基準価格。メルカリ/ヤフオク/フリマ/古物市の水準を想定）',
            '- condition_grade: "A"|"B"|"C"|"D"|"E"（A良〜E悪）',
            '- confidence: number（0-100）',
            '- reasons: string（根拠・注意点を簡潔に。箇条書き改行可）',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                '画像を見て上記フォーマットの JSON だけを出力してください。',
                '相場の基準は国内（メルカリ/ヤフオク/フリマ/古物市）を想定。',
                '足りない視点があれば must_shoot_more に追加してください。',
              ].join('\n'),
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';

    // 3) JSON パース（壊れていたらフォールバック）
    let parsed: ModelJson;
    try {
      const m = raw.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : raw) as ModelJson;
    } catch {
      parsed = {};
    }

    // 4) 価格レンジ計算（提案の倍率を反映）
    const base = toInt(parsed.base_price_jpy, 0);
    const grade = (parsed.condition_grade || 'C').toUpperCase() as keyof typeof GRADE_COEF;
    const coef = GRADE_COEF[grade] ?? GRADE_COEF.C;
    const mid = Math.max(0, Math.round(base * coef));
    const { min, max } = bandFromMid(mid, toInt(parsed.confidence, 0));

    // 5) ユーザー向け整形テキスト
const lines: string[] = [
  `推定カテゴリ: ${parsed.category ?? ''}`,
  `推定ブランド: ${parsed.brand ?? ''}`,
  `推定名称/型: ${parsed.title_guess ?? ''}`,
  `素材/技法: ${parsed.material ?? ''}`,
  `年代: ${parsed.period ?? ''}`,
  parsed.defect_notes ? `状態メモ: ${parsed.defect_notes}` : undefined,
  parsed.missing_parts ? `欠品の懸念: ${parsed.missing_parts}` : undefined,
  parsed.authenticity_risk ? `真贋リスク: ${parsed.authenticity_risk}` : undefined,
  `状態グレード: ${grade}（係数 ${coef}）`,
  `概算価格帯: ¥${min.toLocaleString()} 〜 ¥${max.toLocaleString()}（中央値 ¥${mid.toLocaleString()}）`,
  `確信度: ${toInt(parsed.confidence, 0)}%`,
  parsed.reasons ? `根拠:\n${parsed.reasons}` : undefined,
  parsed.must_shoot_more && parsed.must_shoot_more.length
    ? `追撮推奨: ${parsed.must_shoot_more.join(' / ')}`
    : undefined,
].filter((v): v is string => Boolean(v));

const output_text = lines.join('\n');
    // 5.1) メルカリ出品用テキスト生成（40/500制限）
function cleanupSpaces(s: string) {
  return s.replace(/\s+/g, ' ').trim();
}

const mercariTitleRaw = [
  parsed.brand ?? '',
  parsed.title_guess ?? '',
  parsed.material ?? '',
  parsed.period ?? '',
].filter(Boolean).join(' ');

const mercariTitle = cleanupSpaces(mercariTitleRaw).slice(0, 40);

const descParts = [
  '【商品説明】',
  `カテゴリ: ${parsed.category ?? '不明'}`,
  `ブランド: ${parsed.brand ?? '不明'}`,
  parsed.title_guess ? 名称/型: ${parsed.title_guess} : '',
  `素材・技法: ${parsed.material ?? ''}`,
  `年代: ${parsed.period ?? ''}`,
  `状態: ${((parsed.condition_grade || 'C') as string).toUpperCase()}（${parsed.defect_notes || '大きなダメージなし'}）`,
  `参考査定: ¥${min.toLocaleString()}〜¥${max.toLocaleString()}（目安）`,
  parsed.reasons ? 【根拠】${parsed.reasons} : '',
  parsed.missing_parts ? 【欠品】${parsed.missing_parts} : '',
  parsed.authenticity_risk ? 【真贋メモ】${parsed.authenticity_risk} : '',
  parsed.must_shoot_more && parsed.must_shoot_more.length
    ? 【追加推奨カット】${parsed.must_shoot_more.join(' / ')}
    : '',
  '※本テキストはAIによる自動生成の参考情報です。'
].filter(Boolean).join('\n');

const mercariDescription = descParts.slice(0, 500);

    // 6) レスポンス
    return NextResponse.json({
      ok: true,
      price: { min, mid, max },
      condition_grade: grade,
      confidence: toInt(parsed.confidence, 0),
      meta: {
        category: parsed.category ?? '',
        brand: parsed.brand ?? '',
        title_guess: parsed.title_guess ?? '',
        material: parsed.material ?? '',
        period: parsed.period ?? '',
      },
      reasons: parsed.reasons ?? '',
      must_shoot_more: parsed.must_shoot_more ?? [],
      output_text,
      raw_model_json: parsed,
    });
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
