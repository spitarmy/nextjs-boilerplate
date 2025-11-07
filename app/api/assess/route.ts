// app/api/assess/route.ts
export const runtime = 'nodejs';

import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ---- 環境変数（Vercel の Project Settings > Environment Variables で設定済みのはず）
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 画像からカテゴリ/キーワードを抽出（軽量＆高精度）
async function extractHints(imageUrl: string) {
  const prompt =
    'この画像のアイテムについて、日本語で 1)想定カテゴリ(例: ブランド/茶道具/陶磁器/書画/金工/和装など), 2)主要キーワード(ブランド名/作家名/型番/素材/技法/意匠などを可能な範囲で), 3)外観特徴を最小限で要約して返して。出力はJSONで: {"category":"…","keywords":["…","…","…"]} のみ。';
  const r = await openai.responses.create({
    model: 'gpt-4o-mini',
    input: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'input_image', image_url: imageUrl }
        ]
      }
    ],
    temperature: 0.2
  });

  // 文字だけ抽出
  const text = r.output_text ?? '{}';
  try {
    const obj = JSON.parse(text);
    const category = String(obj.category ?? '').trim();
    const keywords: string[] = Array.isArray(obj.keywords) ? obj.keywords : [];
    return { category, keywords };
  } catch {
    return { category: '', keywords: [] };
  }
}

// Supabase から教師データを検索（カテゴリ＋キーワードで粗くマッチ）
async function searchKbRefs(category: string, keywords: string[]) {
  // nullガード
  const kw = (keywords || []).filter(Boolean).slice(0, 5);

  // 1) カテゴリで粗く絞る
  let query = supabase.from('kb_refs').select(
    `
      id,
      category,
      maker_or_brand,
      model_or_series,
      item_type,
      material,
      hallmark_or_kakihan,
      period_or_era,
      region,
      typical_price_low,
      typical_price_high,
      notes
    `
  );

  if (category) {
    query = query.ilike('category', `%${category}%`);
  }

  // 2) キーワードで “OR ILIKE” をかける（主要列を横断）
  // （SupabaseのPostgresでは OR ILIKE を多列に並べて擬似的に横断検索）
  for (const k of kw) {
    query = query.or(
      [
        `maker_or_brand.ilike.%${k}%`,
        `model_or_series.ilike.%${k}%`,
        `item_type.ilike.%${k}%`,
        `material.ilike.%${k}%`,
        `notes.ilike.%${k}%`,
        `hallmark_or_kakihan.ilike.%${k}%`,
        `region.ilike.%${k}%`,
        period_or_era.ilike.%${k}%
      ].join(',')
    );
  }

  const { data, error } = await query.limit(8);
  if (error) throw error;
  return data ?? [];
}

// OpenAIへ渡す「教師データ要約テキスト」を組み立て
function buildKbContext(rows: any[]) {
  if (!rows?.length) return '該当する教師データは見つかりませんでした。';

  // 価格は「目安」扱いで渡す
  return rows
    .map((r, i) => {
      const price =
        r.typical_price_low && r.typical_price_high
          ? 相場目安: ${r.typical_price_low}〜${r.typical_price_high}円
          : '相場目安: 情報不足';
      const hall =
        r.hallmark_or_kakihan ? 刻印/落款: ${r.hallmark_or_kakihan} : '';
      return [
        `#${i + 1}`,
        `カテゴリ: ${r.category ?? '-'}`,
        `ブランド/作家: ${r.maker_or_brand ?? '-'}`,
        `型番/シリーズ: ${r.model_or_series ?? '-'}`,
        `品目: ${r.item_type ?? '-'}`,
        `素材/技法: ${r.material ?? '-'}`,
        `時代/制作時期: ${r.period_or_era ?? '-'}`,
        `産地/地域: ${r.region ?? '-'}`,
        hall,
        price,
        補足: ${r.notes ?? '-'}
      ]
        .filter(Boolean)
        .join(' / ');
    })
    .join('\n');
}

// 査定JSONの型（フロント側で扱いやすい形）
type AppraisalJSON = {
  item_title: string; // 商品タイトル（例: ルイ・ヴィトン モノグラム○○）
  maker_or_brand?: string;
  category?: string;
  confidence: number; // 0..1
  authenticity_risk: '低' | '中' | '高';
  condition_rank: 'S' | 'A' | 'B' | 'C' | 'J';
  purchase_range_jpy: { min: number; max: number }; // 仕入れ上限目安
  market_range_jpy?: { min: number; max: number }; // 市場売価の想定
  hallmarks_to_check?: string[]; // 確認すべき刻印/特徴
  description: string; // 商品概要（そのまま説明文にコピペ可）
  caution: string[]; // 注意点
  used_kb_refs?: number; // 教師データ件数
};

export async function POST(req: NextRequest) {
  try {
    const { image_url } = (await req.json()) as { image_url?: string };
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), {
        status: 400
      });
    }

    // 1) 画像からカテゴリ/キーワードを抽出
    const { category, keywords } = await extractHints(image_url);

    // 2) 教師データ検索
    const kbRows = await searchKbRefs(category, keywords);
    const kbContext = buildKbContext(kbRows);

    // 3) OpenAI へ最終査定プロンプト
    const system =
      'あなたは骨董・ブランド・工芸・和装・美術の査定士です。教師データを参考にしつつ、画像の特徴も踏まえて日本語で簡潔に、かつ実務で使える査定出力(JSON)だけを返してください。数値は根拠がある範囲でレンジ提示。曖昧なら素直に曖昧と記す。';
    const userInstr =
      '下記の画像と、参考用の教師データ要約を見て、仕様のJSONスキーマに沿って査定してください。';

    const schemaHint =
      'スキーマ: {"item_title":"","maker_or_brand":"","category":"","confidence":0.0,"authenticity_risk":"低|中|高","condition_rank":"S|A|B|C|J","purchase_range_jpy":{"min":0,"max":0},"market_range_jpy":{"min":0,"max":0},"hallmarks_to_check":["…"],"description":"","caution":["…"],"used_kb_refs":0}';

    const r = await openai.responses.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [{ type: 'text', text: system }]
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userInstr },
            { type: 'text', text: schemaHint },
            { type: 'text', text: '【教師データ要約】\n' + kbContext },
            { type: 'text', text: '【画像】' },
            { type: 'input_image', image_url }
          ]
        }
      ]
    });

    // テキスト抽出 → JSON 化
    const text = r.output_text ?? '{}';
    let json: AppraisalJSON;
    try {
      json = JSON.parse(text) as AppraisalJSON;
    } catch {
      // 失敗時は最低限の形で返す
      json = {
        item_title: 'AI解析結果（要再確認）',
        confidence: 0.4,
        authenticity_risk: '中',
        condition_rank: 'B',
        purchase_range_jpy: { min: 0, max: 0 },
        description: '解析に失敗しました。もう一度撮影条件を変えてお試しください。',
        caution: ['画像解像度・光の映り込み・ピントを改善'],
        used_kb_refs: kbRows.length
      };
    }

    // 教師データ件数だけは確実にセット
    json.used_kb_refs = kbRows.length;

    // 4) 必要なら Supabase にログを保存（任意）
    await supabase.from('appraisals').insert({
      image_url,
      brand_guess: json.maker_or_brand ?? null,
      confidence: json.confidence ?? null,
      notes_text: json.description ?? null
    });

    return new Response(JSON.stringify({ ok: true, result: json }), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message ?? 'unexpected error'
      }),
      { status: 500 }
    );
  }
}
