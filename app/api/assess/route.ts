// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// 状態グレード係数（中央値に掛ける）
const GRADE_COEF: Record<string, number> = {
  A: 0.9,
  B: 0.7,
  C: 0.6,
  D: 0.5,
  E: 0.3,
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
  const w = confidence < 60 ? 0.2 : 0.1;
  const min = Math.max(0, Math.floor(mid * (1 - w)));
  const max = Math.max(min, Math.ceil(mid * (1 + w)));
  return { min, max };
}

// Edge 用 ArrayBuffer -> base64
function abToBase64(buf: ArrayBuffer) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  // @ts-ignore Edge では btoa 可
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
    // 1) 画像入力（multipart: 複数 / JSON: image_url 単体）
    const contentType = req.headers.get('content-type') || '';
    let imageUrls: string[] = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const files = Array.from(form.values()).filter((v) => v instanceof File) as File[];
      if (!files.length) {
        return NextResponse.json({ ok: false, error: '画像ファイルが見つかりません' }, { status: 400 });
      }
      for (const f of files) imageUrls.push(await fileToDataUrl(f));
    } else {
      const json = (await req.json().catch(() => ({}))) as { image_url?: string };
      const u = (json.image_url || '').trim();
      if (!u) {
        return NextResponse.json({ ok: false, error: 'image_url または 画像ファイルが必要です。' }, { status: 400 });
      }
      imageUrls = [u];
    }

    // 2) OpenAI へ問い合わせ（画像マルチ）
    const userText = [
      'これらの画像を総合して上記フォーマットの JSON だけを出力してください。',
      '相場は国内フリマ/オークション/古物市を前提。',
      '足りない視点は must_shoot_more に列挙してください。',
    ].join('\n');

    // ★ 型ずれ対策：content 配列を any として渡す（実行時仕様には合致）
    const userContent: any = [
      { type: 'text', text: userText },
      ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            'あなたは中古リユース査定AI「カンテノ」。',
            '画像(1枚以上)を総合判断し、日本語で JSON を厳密に返す。テキスト以外は出力しない。',
            'フィールド:',
            '- category, brand, title_guess, material, period',
            '- authenticity_risk（真贋上の要注意点の要約）',
            '- missing_parts（欠品が疑われる場合は記載）',
            '- defect_notes（傷/汚れ/サビ/色ヤケ等）',
            '- must_shoot_more: string[]（追撮すべき部位: 刻印/ラベル/裏面/シリアル 等）',
            '- base_price_jpy: number（国内中古相場の基準価格。メルカリ/ヤフオク/フリマ/古物市の水準を想定）',
            '- condition_grade: "A"|"B"|"C"|"D"|"E"',
            '- confidence: number（0-100）',
            '- reasons: string（根拠を簡潔に。箇条書き可）',
          ].join('\n'),
        },
        { role: 'user', content: userContent } as any,
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? '';

    // 3) JSON パース
    let parsed: ModelJson;
    try {
      const m = raw.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : raw) as ModelJson;
    } catch {
      parsed = {};
    }

    // 4) 価格レンジ計算
    const base = toInt(parsed.base_price_jpy, 0);
    const grade = ((parsed.condition_grade || 'C') as string).toUpperCase() as keyof typeof GRADE_COEF;
    const coef = GRADE_COEF[grade] ?? GRADE_COEF.C;
    const mid = Math.max(0, Math.round(base * coef));
    const { min, max } = bandFromMid(mid, toInt(parsed.confidence, 0));

    // 5) 画面表示用テキスト（push 方式）
    const lines: string[] = [];
    lines.push('査定する', '');
    lines.push(`推定カテゴリ: ${parsed.category ?? ''}`);
    lines.push(`推定ブランド: ${parsed.brand ?? ''}`);
    lines.push(`推定名称/型: ${parsed.title_guess ?? ''}`);
    lines.push(`素材/技法: ${parsed.material ?? ''}`);
    lines.push(`年代: ${parsed.period ?? ''}`);
    if (parsed.defect_notes) lines.push(`状態メモ: ${parsed.defect_notes}`);
    if (parsed.missing_parts) lines.push(`欠品の懸念: ${parsed.missing_parts}`);
    if (parsed.authenticity_risk) lines.push(`真贋リスク: ${parsed.authenticity_risk}`);
    lines.push(`状態グレード: ${grade}（係数 ${coef}）`);
    lines.push(`概算価格帯: ¥${min.toLocaleString()} 〜 ¥${max.toLocaleString()}（中央値 ¥${mid.toLocaleString()}）`);
    lines.push(`確信度: ${toInt(parsed.confidence, 0)}%`);
    if (parsed.reasons) lines.push(`根拠:\n${parsed.reasons}`);
    if (parsed.must_shoot_more && parsed.must_shoot_more.length) {
      lines.push(`追撮推奨: ${parsed.must_shoot_more.join(' / ')}`);
    }
    const output_text = lines.join('\n');

    // 5.1) メルカリ用（40/500）
    function cleanupSpaces(s: string) {
      return s.replace(/\s+/g, ' ').trim();
    }
    const mercariTitleRaw = cleanupSpaces(
      [parsed.brand ?? '', parsed.title_guess ?? '', parsed.material ?? '', parsed.period ?? '']
        .filter(Boolean)
        .join(' ')
    );
    const mercariTitle = mercariTitleRaw.slice(0, 40);

    const descParts: string[] = [];
    descParts.push('【商品説明】');
    descParts.push(`カテゴリ: ${parsed.category ?? '不明'}`);
    descParts.push(`ブランド: ${parsed.brand ?? '不明'}`);
    descParts.push(`型番・名称: ${parsed.title_guess ?? ''}`);
    descParts.push(`素材・技法: ${parsed.material ?? ''}`);
    descParts.push(`年代: ${parsed.period ?? ''}`);
    descParts.push(
      `状態: ${((parsed.condition_grade || 'C') as string).toUpperCase()}（${parsed.defect_notes || '大きなダメージなし'}）`
    );
    descParts.push(`参考価格帯: ¥${min.toLocaleString()}〜¥${max.toLocaleString()}（目安）`);
    if (parsed.reasons) descParts.push(`【根拠】${parsed.reasons}`);
    if (parsed.missing_parts) descParts.push(`【欠品】${parsed.missing_parts}`);
    if (parsed.authenticity_risk) descParts.push(`【真贋メモ】${parsed.authenticity_risk}`);
    if (parsed.must_shoot_more && parsed.must_shoot_more.length) {
      descParts.push(`【追加推奨カット】${parsed.must_shoot_more.join(' / ')}`);
    }
    descParts.push('※本テキストはAIによる自動生成の参考情報です。');
    const mercariDescription = descParts.join('\n').slice(0, 500);

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
      mercari_title: mercariTitle,
      mercari_description: mercariDescription,
      raw_model_json: parsed,
    });
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
