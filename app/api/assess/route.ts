// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Buffer } from 'node:buffer';

export const runtime = 'nodejs';          // Buffer が使える
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// 状態グレード係数
const GRADE_COEF: Record<string, number> = { A: 0.9, B: 0.7, C: 0.6, D: 0.5, E: 0.3 };

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

// URL → dataURL（https化・エンコードしてから取得）
async function urlToDataUrl(u: string): Promise<string> {
  const safe = encodeURI(u.trim().replace(/^http:\/\//i, 'https://'));
  const res = await fetch(safe);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${safe}`);
  const ct = res.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  return `data:${ct};base64,${b64}`;
}

// dataURL → Responses API の image_data 形式へ
function dataUrlToPart(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) throw new Error('invalid data url');
  const media_type = m[1];
  const b64 = m[2];
  return { type: 'input_image', image_data: { b64, media_type } };
}

export async function POST(req: NextRequest) {
  try {
    // 1) 入力：image_urls（推奨） / 互換: image_url（単体）
    const { image_url, image_urls } = (await req.json().catch(() => ({}))) as {
      image_url?: string;
      image_urls?: string[];
    };
    const urls = (image_urls && image_urls.length ? image_urls : (image_url ? [image_url] : []))
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0);

    if (!urls.length) {
      return NextResponse.json(
        { ok: false, error: 'image_urls（配列）が必要です。互換で image_url 1件でも可。' },
        { status: 400 }
      );
    }

    // 2) 画像を dataURL 化 → image_data へ（OpenAI には常に image_data で渡す）
    const dataImages = await Promise.all(urls.map(urlToDataUrl));
    const imageParts = dataImages.map(dataUrlToPart);

    const userText = [
      'これらの画像を総合して上記フォーマットの JSON だけを出力してください。',
      '相場は国内フリマ/オークション/古物市を前提。',
      '足りない視点は must_shoot_more に列挙してください。'
    ].join('\n');

    // 3) OpenAI（Responses API）
    const resp = await client.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text:
                'あなたは中古リユース査定AI「カンテノ」。画像(1枚以上)を総合判断し、日本語で JSON を厳密に返す。テキスト以外は出力しない。\n' +
                'フィールド:\n' +
                '- category, brand, title_guess, material, period\n' +
                '- authenticity_risk, missing_parts, defect_notes\n' +
                '- must_shoot_more: string[]\n' +
                '- base_price_jpy: number\n' +
                '- condition_grade: "A"|"B"|"C"|"D"|"E"\n' +
                '- confidence: number（0-100）\n' +
                '- reasons: string'
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userText }, ...imageParts]
        }
      ]
    } as any);

    // 4) テキスト抽出
    const raw =
      (resp as any).output_text ??
      ((resp as any).output?.[0]?.content
        ?.map((c: any) => (c?.type === 'output_text' ? c.text : c?.text ?? ''))
        .join('')) ??
      '';

    // 5) JSON パース
    let parsed: ModelJson;
    try {
      const m = raw.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : raw) as ModelJson;
    } catch {
      parsed = {};
    }

    // 6) 価格レンジ
    const base = toInt(parsed.base_price_jpy, 0);
    const grade = ((parsed.condition_grade || 'C') as string).toUpperCase() as keyof typeof GRADE_COEF;
    const coef = GRADE_COEF[grade] ?? GRADE_COEF.C;
    const mid = Math.max(0, Math.round(base * coef));
    const { min, max } = bandFromMid(mid, toInt(parsed.confidence, 0));

    // 7) 画面表示用
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
    if (parsed.must_shoot_more?.length) lines.push(`追撮推奨: ${parsed.must_shoot_more.join(' / ')}`);
    const output_text = lines.join('\n');

    // 8) メルカリ用
    const cleanup = (s: string) => s.replace(/\s+/g, ' ').trim();
    const mercari_title = cleanup(
      [parsed.brand ?? '', parsed.title_guess ?? '', parsed.material ?? '', parsed.period ?? '']
        .filter(Boolean)
        .join(' ')
    ).slice(0, 40);

    const desc: string[] = [];
    desc.push('【商品説明】');
    desc.push(`カテゴリ: ${parsed.category ?? '不明'}`);
    desc.push(`ブランド: ${parsed.brand ?? '不明'}`);
    desc.push(`型番・名称: ${parsed.title_guess ?? ''}`);
    desc.push(`素材・技法: ${parsed.material ?? ''}`);
    desc.push(`年代: ${parsed.period ?? ''}`);
    desc.push(`状態: ${grade}（${parsed.defect_notes || '大きなダメージなし'}）`);
    desc.push(`参考価格帯: ¥${min.toLocaleString()}〜¥${max.toLocaleString()}（目安）`);
    if (parsed.reasons) desc.push(`【根拠】${parsed.reasons}`);
    if (parsed.missing_parts) desc.push(`【欠品】${parsed.missing_parts}`);
    if (parsed.authenticity_risk) desc.push(`【真贋メモ】${parsed.authenticity_risk}`);
    if (parsed.must_shoot_more?.length) desc.push(`【追加推奨カット】${parsed.must_shoot_more.join(' / ')}`);
    desc.push('※本テキストはAIによる自動生成の参考情報です。');
    const mercari_description = desc.join('\n').slice(0, 500);

    // 9) レスポンス
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
        period: parsed.period ?? ''
      },
      reasons: parsed.reasons ?? '',
      must_shoot_more: parsed.must_shoot_more ?? [],
      output_text,
      mercari_title,
      mercari_description,
      raw_model_json: parsed
    });
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        output_text:
          '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description:
          '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。'
      },
      { status: 500 }
    );
  }
}
