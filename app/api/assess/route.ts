// /app/api/assess/route.ts
export const runtime = 'edge';

import OpenAI from 'openai';

type Price = { currency: 'JPY'; min: number; max: number; reason?: string };
type AssessJSON = {
  title?: string;
  brand?: string;
  material?: string;
  item_type?: string;
  era?: string;
  condition?: string;
  authenticity_confidence?: number; // 0.0 - 1.0
  price_estimate?: Price;
  notes?: string[];
};

export async function POST(req: Request) {
  try {
    const { image_url } = await req.json().catch(() => ({}));
    if (!image_url || typeof image_url !== 'string') {
      return new Response('missing image_url', { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    if (!process.env.OPENAI_API_KEY) {
      return new Response('missing OPENAI_API_KEY', { status: 500 });
    }

    const system =
      'あなたは中古リユース査定の専門アシスタント「カンテノ」です。' +
      '画像からアイテムを分析し、日本語で、JSONのみを返します。' +
      '価格は日本の中古相場（ヤフオク/メルカリ/ラクマ等の一般的レンジ）を仮定し税込想定の円建て(JPY)。' +
      '写真で確定できない場合は「推定」を明記し、レンジを広めに。' +
      '真贋は断定せず、confidence(0-1)で表現。';

    const user =
      '次のJSONスキーマで必ず返答してください（余計な文字なしで1つのJSONだけ）。\n' +
      JSON.stringify(
        {
          title: '短いタイトル',
          brand: 'ブランド名 or 不明',
          material: '主素材の推定',
          item_type: '品目（例：長財布/ショルダー/化粧ポーチ 等）',
          era: '年代/世代の推定（例：2000年代前半 等）',
          condition:
            '外観の総合評価（例：使用感中/角スレ小/金具小傷 など具体）',
          authenticity_confidence:
            '0.0〜1.0で真贋自信度（画像のみの推定であること）',
          price_estimate: {
            currency: 'JPY',
            min: '数値(下限)',
            max: '数値(上限)',
            reason: 'レンジ根拠の要点（状態・流通の一般傾向）'
          },
          notes: [
            '不足写真（型番/刻印/シリアル/縫製/金具/内装全体/付属品）',
            '買取提示時の注意点 など'
          ]
        },
        null,
        2
      );

    const prompt =
      'この画像の中古リユース査定をJSONで。価格は円建てレンジ。' +
      'レンジは控えめ（安全側）。写真で確証が薄い点は「推定」と明記。';

    const resp = await openai.responses.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: system }]
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: user + '\n\n' + prompt },
            { type: 'input_image', image_url }
          ]
        }
      ],
      temperature: 0.2,
      max_output_tokens: 800
    });

    const text = resp.output_text || '{}';
    const json = JSON.parse(text) as AssessJSON;

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
