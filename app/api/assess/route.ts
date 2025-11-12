// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Buffer } from 'node:buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// 係数
const GRADE_COEF: Record<string, number> = { A:0.9, B:0.7, C:0.6, D:0.5, E:0.3 };

// 型
type ModelJson = {
  category?: string; brand?: string; title_guess?: string; material?: string; period?: string;
  authenticity_risk?: string; missing_parts?: string; defect_notes?: string;
  must_shoot_more?: string[]; base_price_jpy?: number;
  condition_grade?: 'A'|'B'|'C'|'D'|'E'; confidence?: number; reasons?: string;
};

// 便利関数
const toInt = (n: unknown, fb=0)=> Number.isFinite(Number(n)) ? Math.round(Number(n)) : fb;
const bandFromMid = (mid:number, conf:number)=>{ const w=conf<60?0.2:0.1; const min=Math.max(0,Math.floor(mid*(1-w))); const max=Math.max(min,Math.ceil(mid*(1+w))); return {min,max}; };

function normalizeMediaType(ct: string | null): 'image/jpeg'|'image/png'|'image/webp'|'image/gif' {
  const raw = (ct||'').toLowerCase().split(';')[0].trim();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (raw === 'image/jpeg') return 'image/jpeg';
  if (raw === 'image/png')  return 'image/png';
  if (raw === 'image/webp') return 'image/webp';
  if (raw === 'image/gif')  return 'image/gif';
  return 'image/jpeg';
}

// File → dataURL
async function fileToDataUrl(f: File): Promise<string> {
  const buf = Buffer.from(await f.arrayBuffer());
  const b64 = buf.toString('base64');
  const media = normalizeMediaType(f.type || 'image/jpeg');
  return `data:${media};base64,${b64}`;
}

// http(s) → dataURL（JSONで URL が来た時用）
async function urlToDataUrl(u: string): Promise<string> {
  const safe = encodeURI(u.trim().replace(/^http:\/\//i, 'https://'));
  const res = await fetch(safe);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${safe}`);
  const media = normalizeMediaType(res.headers.get('content-type'));
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString('base64');
  return `data:${media};base64,${b64}`;
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') || '';
    let dataUrls: string[] = [];

    // 1) 入力受け取り（multipart or JSON）
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData();
      const files = Array.from(form.values()).filter((v): v is File => v instanceof File);
      if (!files.length) return NextResponse.json({ ok:false, error:'画像ファイルが見つかりません。' }, { status:400 });
      dataUrls = await Promise.all(files.map(fileToDataUrl));
    } else {
      const { image_url, image_urls } = (await req.json().catch(()=>({}))) as { image_url?: string; image_urls?: string[] };
      const urls = (image_urls?.length ? image_urls : (image_url ? [image_url] : []))
        .filter((u): u is string => typeof u === 'string' && u.trim().length>0);
      if (!urls.length) return NextResponse.json({ ok:false, error:'image_urls（配列）または multipart の画像ファイルを送ってください。' }, { status:400 });
      dataUrls = await Promise.all(urls.map(urlToDataUrl));
    }

    // 2) Chat Completions（Vision）に data URL を渡す
    const userText =
      'これらの画像を総合して、下記フィールドだけの JSON を厳密に出力してください。\n' +
      'フィールド:\n' +
      '- category, brand, title_guess, material, period\n' +
      '- authenticity_risk, missing_parts, defect_notes\n' +
      '- must_shoot_more: string[]\n' +
      '- base_price_jpy: number\n' +
      '- condition_grade: "A"|"B"|"C"|"D"|"E"\n' +
      '- confidence: number（0-100）\n' +
      '- reasons: string\n' +
      'テキスト以外は出力しないこと。';

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'あなたは中古リユース査定AI「カンテノ」。日本語で厳密なJSONだけを返す。' },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          ...dataUrls.map((u) => ({ type: 'image_url', image_url: { url: u } }) as any),
        ],
      },
    ];

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '';

    // 3) パース
    let parsed: ModelJson;
    try {
      const m = raw.match(/\{[\s\S]*\}$/);
      parsed = JSON.parse(m ? m[0] : raw) as ModelJson;
    } catch {
      // ここで失敗しても原因を返す
      return NextResponse.json({ ok:false, error:'model_output_parse_error', detail:{ raw } }, { status:500 });
    }

    // 4) 価格レンジ
    const base = toInt(parsed.base_price_jpy, 0);
    const grade = ((parsed.condition_grade || 'C') as string).toUpperCase() as keyof typeof GRADE_COEF;
    const coef = GRADE_COEF[grade] ?? GRADE_COEF.C;
    const mid = Math.max(0, Math.round(base * coef));
    const { min, max } = bandFromMid(mid, toInt(parsed.confidence, 0));

    // 5) 表示用
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

    // 6) メルカリ用
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

    // 7) 返却
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
      mercari_title,
      mercari_description,
      raw_model_json: parsed,
    });

  } catch (err:any) {
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ ok:false, error: msg }, { status:500 });
  }
}
