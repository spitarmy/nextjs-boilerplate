// lib/search.ts
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type KBRow = {
  id: string;
  source_file: string | null;
  category: string | null;
  subcategory: string | null;
  brand_or_author: string | null;
  model_or_series: string | null;
  workshop_or_kilin: string | null;
  item_type: string | null;
  material: string | null;
  hallmark: string | null;
  period: string | null;
  region: string | null;
  tags: string | null;
  desc_short: string | null;
  desc_long: string | null;
  price_low_high: string | null;
  refs: string | null;
  hallmark_or_font: string | null;
  notes: string | null;
  score: number | null;
};

export async function kbSearchRaw(q: string, limit = 8) {
  const { data, error } = await supabase
    .rpc('kb_refs_search', { q, match_count: limit });

  if (error) throw error;
  return data as KBRow[];
}

/** まず素直に検索 → 弱ければAIで検索語を整えて再検索 */
export async function kbSearchSmart(initialQuery: string, limit = 8) {
  // 1) 直検索
  let results = await kbSearchRaw(initialQuery, limit);
  if (results?.length && (results[0].score ?? 0) >= 0.35) {
    return { query: initialQuery, results };
  }

  // 2) 検索語をAIで整える（余計な文章は不要・キーワード列挙）
  const prompt = [
    '以下の説明文から、ブランド名/アイテム種別/型やシリーズ/素材/年代など、',
    'データベース検索に有利な日本語キーワードを10語以内で列挙してください。',
    '無い情報は書かない。出力はスペース区切りの1行のみ。'
  ].join('');

  const completion = await openai.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "text", text: initialQuery }
      ]}
    ]
  });

  const text = (completion.output_text ?? initialQuery).trim();
  results = await kbSearchRaw(text, limit);
  return { query: text, results };
}
