// app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type ReqBody = {
  image_url: string;
  mode?: 'questions' | 'assess';     // デフォルトは questions
  answers?: Record<string, string>;  // ユーザーが返した追加情報（任意）
};

const CONDITION_MULTIPLIER: Record<string, number> = {
  A: 0.90,
  B: 0.70,
  C: 0.60,
  D: 0.50,
  E: 0.30,
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReqBody;
    const imageUrl = body.image_url?.trim();
    const mode = body.mode ?? 'questions';

    if (!imageUrl) {
      return NextResponse.json({ error: 'image_url is required' }, { status: 400 });
    }

    if (mode === 'questions') {
      // 1) 不足カットや刻印・シリアル等の追撮指示を返す
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              [
                'あなたは中古リユース査定AI「カンテノ」です。',
                'まずは不足カット・判定根拠の収集を最短で行うための「追撮チェックリスト」を作成します。',
                '和洋骨董・ブランド・美術・家電を想定。中古実勢（メルカリ/ラクマ/Y!フリマ/ヤフオク）優先で後段の査定を行う前提。'
              ].join(' ')
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'この画像から査定に必須の追加カット/情報を、最大7項目まで日本語で出してください。' },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ]
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      // 期待JSON: { questions: string[], notes: string }
      const json = safeParseJSON(raw, { questions: [], notes: '' });

      // 既存互換のテキスト
      const output_text =
        ['【追加で欲しい写真/情報】', ...json.questions.map((q: string, i: number) => `${i + 1}. ${q}`)]
          .concat(json.notes ? [`\n補足: ${json.notes}`] : [])
          .join('\n');

      return NextResponse.json({ mode: 'questions', output_text, json });
    }

    // mode === 'assess'
    const answers = body.answers ?? {};
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'あなたは中古リユース査定AI「カンテノ」。',
            '真贋→相場→状態→希少性→付属の優先順位でロジックを組み、相場は「中古実勢（メルカリ/ラクマ/Y!フリマ/ヤフオク）」を基準に推定します。',
            '出力は JSON。brand/material/model/period/conditionGrade(A-E)/accessories/authenticityNotes/confidence(0-100)/',
            'baseMarketJPY(相場中心値)/coefficients{category,condition,accessory,demand,urgency}/',
            'priceRange{min,max,mid}/reasons を含めてください。'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            { type: 'text', text:
              [
                '次の制約で価格を計算してください。',
                '- conditionはA=0.90,B=0.70,C=0.60,D=0.50,E=0.30の倍率。',
                '- accessoriesは「フル揃い=1.10、欠品なし=1.00、一部欠品=0.95、欠品多い=0.90」を目安に選定。',
                '- demand(需要)は0.90〜1.10、urgency(早く売りたい度)は0.90〜1.10で合理的に設定。',
                '- category係数は1.00固定（必要あれば1.00±0.05の範囲で微調整可）。',
                '- 最終価格 mid = round(baseMarket * category * condition * accessory * demand * urgency)。',
                '- min/max は mid の ±10%（四捨五入）。',
                'answers(JSON)も参考にして良い: ' + JSON.stringify(answers)
              ].join('\n')
            },
            { type: 'image_url', image_url: { url: imageUrl } }
          ]
        }
      ]
    });

    const json = safeParseJSON(completion.choices[0]?.message?.content || '{}', {});
    // フェイルセーフ：最低限のフィールドを補完
    const conditionKey = (json.conditionGrade || 'C').toUpperCase();
    const conditionCoef = CONDITION_MULTIPLIER[conditionKey] ?? CONDITION_MULTIPLIER['C'];

    let mid = Number(json?.priceRange?.mid);
    if (!Number.isFinite(mid)) {
      const base = Math.round(Number(json.baseMarketJPY) || 0);
      const coef = Number(json?.coefficients?.category ?? 1)
        * Number(json?.coefficients?.accessory ?? 1)
        * Number(json?.coefficients?.demand ?? 1)
        * Number(json?.coefficients?.urgency ?? 1)
        * conditionCoef;
      mid = Math.round(base * (Number.isFinite(coef) ? coef : conditionCoef));
    }
    const min = Math.round(mid * 0.9);
    const max = Math.round(mid * 1.1);

    const output_text = [
      `【推定結果】 ${json.brand ?? ''} / ${json.model ?? ''}`,
      `材質・年代: ${json.material ?? ''} / ${json.period ?? ''}`,
      `状態: ${conditionKey}（係数${conditionCoef.toFixed(2)}） 付属: ${json.accessories ?? '-'}`,
      `真贋メモ: ${json.authenticityNotes ?? '-'}`,
      `概算価格帯: ￥${min.toLocaleString()} 〜 ￥${max.toLocaleString()}（中心 ￥${mid.toLocaleString()}）`,
      `確信度: ${Number(json.confidence ?? 0)}%`,
      json.reasons ? 根拠: ${json.reasons} : ''
    ].filter(Boolean).join('\n');

    const merged = {
      ...json,
      conditionGrade: conditionKey,
      coefficients: {
        category: Number(json?.coefficients?.category ?? 1),
        condition: conditionCoef,
        accessory: Number(json?.coefficients?.accessory ?? 1),
        demand: Number(json?.coefficients?.demand ?? 1),
        urgency: Number(json?.coefficients?.urgency ?? 1),
      },
      priceRange: { min, max, mid }
    };

    return NextResponse.json({ mode: 'assess', output_text, json: merged });
  } catch (err: any) {
    // フォールバック（テキスト）
    const msg = typeof err?.message === 'string' ? err.message : 'Unknown server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** JSON安全Parse */
function safeParseJSON<T>(text: string, fallback: T): T {
  try { return JSON.parse(text) as T; } catch { return fallback; }
}
