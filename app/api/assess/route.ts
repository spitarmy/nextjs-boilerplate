// app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

const toInt = (n: unknown, fallback = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v) : fallback;
};

function bandFromMid(mid: number, confidence: number) {
  const w = confidence < 60 ? 0.2 : 0.1;
  const min = Math.max(0, Math.floor(mid * (1 - w)));
  const max = Math.max(min, Math.ceil(mid * (1 + w)));
  return { min, max };
}

export async function POST(req: NextRequest) {
  try {
    // ① フロントから来る image_urls / image_url を拾う
    const { image_url, image_urls } = (await req.json().catch(() => ({}))) as {
      image_url?: string;
      image_urls?: string[];
    };

    const urls = (image_urls && image_urls.length
      ? image_urls
      : image_url
      ? [image_url]
      : []
    ).filter(
      (u): u is string =>
        typeof u === 'string' && u.trim().length > 0 && /^https?:\/\//i.test(u),
    );

    if (!urls.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'image_urls（配列）または image_url（単体）の HTTPS URL が必要です。',
        },
        { status: 400 },
      );
    }

    // ② OpenAI Responses API 呼び出し（画像URLをそのまま渡す）
    const userText = [
      'これらの画像を総合して、下記フォーマットの JSON のみを日本語で出力してください。',
      '',
      'フィールド:',
      '- category, brand, title_guess, material, period',
      '- authenticity_risk, missing_parts, defect_notes',
      '- must_shoot_more: string[]',
      '- base_price_jpy: number',
      '- condition_grade: "A"|"B"|"C"|"D"|"E"',
      '- confidence: number（0-100）',
      '- reasons: string',
      '',
      '相場は国内フリマ/オークション/古物市場を前提にしてください。',
    ].join('\n');

    const imageParts = urls.map(
      (u) =>
        ({
          type: 'input_image',
          image_url: { url: u },
        } as any),
    );

    const payload = {
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'あなたは中古リユース査定AI「カンテノ」です。' +
                '与えられた画像（1枚以上）を総合判断し、日本語の JSON を厳密に1つだけ出力してください。' +
                '説明文や余計なテキストは一切書かず、JSON のみを返してください。',
            },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: userText },
            ...imageParts,
          ] as any,
        },
      ],
    } as any;

    let resp: any;
    try {
      resp = await client.responses.create(payload);
    } catch (e: any) {
      const detail = e?.response?.data ?? e?.message ?? String(e);
      return NextResponse.json(
        {
          ok: false,
          error: 'openai_error',
          detail,
          debug: {
            urls,
          },
        },
        { status: 500 },
      );
    }

    // ③ テキスト取り出し
    const rawText: string =
      resp.output_text ??
      (resp.output &&
        Array.isArray(resp.output) &&
        resp.output
          .flatMap((o: any) => o?.content ?? [])
          .map((c: any) =>
            c?.type === 'output_text' ? c.text : c?.text ?? '',
          )
          .join('')) ??
      '';

    // ④ JSON パース
    let parsed: ModelJson = {};
    try {
      const m = rawText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(m ? m[0] : rawText) as ModelJson;
    } catch {
      parsed = {};
    }

    // ⑤ 価格レンジ計算
    const base = toInt(parsed.base_price_jpy, 0);
    const gradeKey = ((parsed.condition_grade || 'C') as string).toUpperCase() as keyof typeof GRADE_COEF;
    const coef = GRADE_COEF[gradeKey] ?? GRADE_COEF.C;

    const mid = Math.max(0, Math.round(base * coef));
    const { min, max } = bandFromMid(mid, toInt(parsed.confidence, 0));

    // ⑥ 表示用テキスト組み立て
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
    lines.push(`状態グレード: ${gradeKey}（係数 ${coef}）`);
    lines.push(
      `概算価格帯: ¥${min.toLocaleString()} 〜 ¥${max.toLocaleString()}（中央値 ¥${mid.toLocaleString()}）`,
    );
    lines.push(`確信度: ${toInt(parsed.confidence, 0)}%`);
    if (parsed.reasons) lines.push(`根拠:\n${parsed.reasons}`);
    if (parsed.must_shoot_more?.length)
      lines.push(`追撮推奨: ${parsed.must_shoot_more.join(' / ')}`);

    const output_text = lines.join('\n');

    // ⑦ メルカリ用タイトル・説明文
    const cleanup = (s: string) => s.replace(/\s+/g, ' ').trim();

    const mercari_title = cleanup(
      [
        parsed.brand ?? '',
        parsed.title_guess ?? '',
        parsed.material ?? '',
        parsed.period ?? '',
      ]
        .filter(Boolean)
        .join(' '),
    ).slice(0, 40);

    const desc: string[] = [];
    desc.push('【商品説明】');
    desc.push(`カテゴリ: ${parsed.category ?? '不明'}`);
    desc.push(`ブランド: ${parsed.brand ?? '不明'}`);
    desc.push(`型番・名称: ${parsed.title_guess ?? ''}`);
    desc.push(`素材・技法: ${parsed.material ?? ''}`);
    desc.push(`年代: ${parsed.period ?? ''}`);
    desc.push(`状態: ${gradeKey}（${parsed.defect_notes || '大きなダメージなし'}）`);
    desc.push(
      `参考価格帯: ¥${min.toLocaleString()}〜¥${max.toLocaleString()}（目安）`,
    );
    if (parsed.reasons) desc.push(`【根拠】${parsed.reasons}`);
    if (parsed.missing_parts) desc.push(`【欠品】${parsed.missing_parts}`);
    if (parsed.authenticity_risk)
      desc.push(`【真贋メモ】${parsed.authenticity_risk}`);
    if (parsed.must_shoot_more?.length)
      desc.push(`【追加推奨カット】${parsed.must_shoot_more.join(' / ')}`);
    desc.push(
      '※本テキストはAIによる自動生成の参考情報です。最終的なご判断はご自身でお願いいたします。',
    );

    const mercari_description = desc.join('\n').slice(0, 500);

    return NextResponse.json({
      ok: true,
      price: { min, mid, max },
      condition_grade: gradeKey,
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
      mercari_title,
      mercari_description,
      raw_model_json: parsed,
      debug: {
        urls,
      },
    });
  } catch (err: any) {
    const msg =
      typeof err?.message === 'string'
        ? err.message
        : 'Unknown server error';
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        output_text:
          '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description:
          '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。',
      },
      { status: 500 },
    );
  }
}
