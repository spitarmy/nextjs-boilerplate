// /app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Buffer } from 'node:buffer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// --------- helpers ----------
function normalizeMediaType(ct: string | null) {
  const raw = (ct || '').toLowerCase().split(';')[0].trim();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (['image/jpeg','image/png','image/webp','image/gif'].includes(raw)) return raw;
  return 'image/jpeg';
}
async function urlToDataUrl(url: string) {
  const safe = encodeURI(url.trim().replace(/^http:\/\//i,'https://'));
  const res = await fetch(safe);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${safe}`);
  const media = normalizeMediaType(res.headers.get('content-type'));
  const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
  return `data:${media};base64,${b64}`;
}
// image_url (dataURL) で投げる
async function askOpenAI(dataUrls: string[]) {
  return client.responses.create({
    model: 'gpt-4o-mini',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'この画像を解析してください。' },
          ...dataUrls.map((d) => ({ type: 'input_image', image_url: { url: d } }))
        ]
      }
    ]
  });
}
// --------- POST: 本番 ----------
export async function POST(req: NextRequest) {
  try {
    const { image_urls } = (await req.json().catch(() => ({}))) as { image_urls?: string[] };
    if (!image_urls?.length) {
      return NextResponse.json({ ok:false, error:'no_image_urls' }, { status:400 });
    }
    const dataUrls = await Promise.all(image_urls.map(urlToDataUrl));
    const resp = await askOpenAI(dataUrls);
    return NextResponse.json({ ok:true, output: resp.output_text ?? '(no output)' });
  } catch (e:any) {
    // エラー内容を**必ず本文に含めて返す**
    const detail = e?.response?.data ?? e?.message ?? String(e);
    console.error('ASSESS_POST_ERROR', detail);
    return NextResponse.json({ ok:false, error:'server', detail }, { status:500 });
  }
}

// --------- GET: デモ & 自己診断 ----------
export async function GET() {
  try {
    // 512px のテスト画像（常に同じ）
    const testImg = 'https://picsum.photos/seed/risai/512';
    const dataUrl = await urlToDataUrl(testImg);
    const resp = await askOpenAI([dataUrl]);
    return NextResponse.json({
      ok:true,
      demo:true,
      version:'api-v6-response-dataurl+getdemo',
      output: resp.output_text ?? '(no output)'
    });
  } catch (e:any) {
    const detail = e?.response?.data ?? e?.message ?? String(e);
    console.error('ASSESS_GET_DEMO_ERROR', detail);
    return NextResponse.json({
      ok:false,
      demo:true,
      version:'api-v6-response-dataurl+getdemo',
      error:'server',
      detail
    }, { status:500 });
  }
}
