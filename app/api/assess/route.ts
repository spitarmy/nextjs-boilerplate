// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ユーザー指定の状態グレード係数（中央値を作る）
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
  authenticity_risk?: string; // 真贋リスクの要点
  missing_parts?: string;
  defect_notes?: string;
  must_shoot_more?: string[]; // 追撮指示
  // モデルに出させる基準価格（市場相場の素の基準）
  base_price_jpy?: number; // 例: 12000 （税・手数料控除前）
  condition_grade?: 'A' | 'B' | 'C' | 'D' | 'E';
  confidence?: number; // 0-100
  reasons?: string; // 箇条書き可（改行含む）
};

function toInt(n: unknown, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : fallback;
}

function bandFromMid(mid: number, confidence: number) {
  // 確信度でレンジの広さを調整（60%未満は±20%、それ以外は±10%）
  const w = confidence < 60 ? 0.2 : 0.1;
  const min = Math.max(0, Math.floor(mid * (1 - w)));
  const max = Math.max(min, Math.ceil(mid * (1 + w)));
  return { min, max };
}

async function fileToDataUrl(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

export async function POST(req: NextRequest) {
  try {
    // 1) 画像入力の取り出し（multipart or JSON）
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
      imageUrl = await fileToDataUrl(file); // data: URL として OpenAI に渡す
    } else {
      // JSON: { image_url: string }
      const json = (await req.json().catch(() => ({}))) as {
        image_url?: string;
      };
      imageUrl = json.image_url?.trim();
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'image_url または 画像ファイルが必要です。' },
        { status: 400 }
      );
    }

    // 2) OpenAI への問い合わせ（画像＋テキスト）
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            [
              'あなたは中古リユース査定AI「カンテノ」。',
              'タスク: 画像1枚から分かる範囲で商品を同定し、日本語で JSON を**厳密に**返す。',
              '注意: テキスト以外は出力しない（コードブロックも不可）。',
              'フィールド:',
              '- category, brand, title_guess, material, period',
              '- authenticity_risk（真贋上の要注意点の要約）',
              '- missing_parts（欠品が疑われる場合は記載）',
              '- defect_notes（傷/汚れ/日焼け/サビ等の気づき）',
              '- must_shoot_more: string[]（追撮すべき部位: 刻印/ラベル/裏面/シリアル 等）',
              '- base_price_jpy: number（国内中古相場のおおよその基準価格。メルカリ/ヤフオク/フリマ/古物市の相場水準を前提）',
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
              text:
                [
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
    // 3) JSON パース（壊れていたら最低限でフォールバック）
    let parsed: ModelJson;
    try {
      // 先頭・末尾に余計な説明が入った場合を考慮して波括弧抽出も試みる
      const m = raw.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : raw) as ModelJson;
    } catch {
      parsed = {};
    }

    // 4) 価格レンジ計算（指定の倍率を反映）
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
      parsed.defect_notes ? 状態メモ: ${parsed.defect_notes} : undefined,
      parsed.missing_parts ? 欠品の懸念: ${parsed.missing_parts} : undefined,
      parsed.authenticity_risk ? 真贋リスク: ${parsed.authenticity_risk} : undefined,
      `状態グレード: ${grade}（係数 ${coef}）`,
      `概算価格帯: ¥${min.toLocaleString()} 〜 ¥${max.toLocaleString()}（中央値 ¥${mid.toLocaleString()}）`,
      `確信度: ${toInt(parsed.confidence, 0)}%`,
      parsed.reasons ? 根拠:\n${parsed.reasons} : undefined,
      parsed.must_shoot_more && parsed.must_shoot_more.length
        ? 追撮推奨: ${parsed.must_shoot_more.join(' / ')}
        : undefined,
    ].filter(Boolean) as string[];

    const output_text = lines.join('\n');

    // 6) API レスポンス（既存互換 + 構造化）
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
      raw_model_json: parsed, // デバッグ/将来用
    });
  } catch (err: any) {
    const msg =
      typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
