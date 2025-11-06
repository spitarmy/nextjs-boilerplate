// app/api/assess/route.ts
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Vercel で Node ランタイムを使う
export const runtime = 'nodejs'

const SYSTEM_PROMPT = `
あなたは美術品・骨董・ブランド品の査定アシスタントです。
与えられた写真から以下を日本語で簡潔に出力してください:
1) 推定カテゴリ/素材/年代感（不確実なら推定でOK）
2) 目立つ状態（キズ/汚れ/破れ/欠け/色ヤケ等）
3) 真贋の注意点（ロゴ/縫製/刻印/釉薬/作行/箱書など確認ポイント）
4) 国内中古相場のざっくりレンジ（完品/並品/難ありの3段階）
5) 仕入れ上限目安（安全マージン込み）
※ 写真1枚では断定しない。確度を「高/中/低」で添える。価格は概算レンジ（円）。
`

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '画像ファイルが見つかりません' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const base64 = buf.toString('base64')
    const mime = file.type || 'image/jpeg'

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'この写真のアイテムを査定してください。' },
            { type: 'image_url', image_url: { url: data:${mime};base64,${base64} } }
          ]
        }
      ]
    })

    const text = completion.choices?.[0]?.message?.content ?? '解析結果を取得できませんでした。'
    return NextResponse.json({ result: text })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: サーバーエラー: ${e?.message ?? 'unknown'} }, { status: 500 })
  }
}
