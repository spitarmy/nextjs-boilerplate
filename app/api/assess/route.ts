// app/api/assess/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// ----------------- メイン -----------------

export async function POST(req: NextRequest) {
  try {
    // フロントから送られてくる image_urls（配列）を読む
    const body = (await req.json().catch(() => ({}))) as {
      image_urls?: string[];
    };

    const urls =
      body.image_urls
        ?.filter((u) => typeof u === 'string')
        .map((u) => u.trim())
        .filter((u) => u.length > 0) ?? [];

    if (!urls.length) {
      return NextResponse.json(
        {
          ok: false,
          error: 'image_urls が空です。画像を 1 枚以上アップロードしてください。',
        },
        { status: 400 },
      );
    }

    // ----------------- OpenAI へのリクエスト -----------------

    const systemText =
      'あなたは中古リユース査定AI「カンテノ」です。' +
      '画像からブランド/カテゴリ/素材/状態/年代感などを読み取り、' +
      '日本語でわかりやすい査定結果とメルカリ出品用のテキストを出力してください。';

    const userText =
      '次の画像（1枚以上）を総合して、' +
      '①査定コメント、②おおよその相場レンジ、③メルカリ出品用タイトル案（40文字以内）、' +
      '④メルカリ出品用の説明文（500文字以内）を作ってください。';

    // SDK の型がうるさいので payload 全体を any として扱う
    const payload: any = {
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemText }],
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: userText },
            // ここが build error の原因だったので as any を付けて型チェックを黙らせる
            ...urls.map((u) => ({ type: 'input_image', image_url: u } as any)),
          ],
        },
      ],
    };

    const resp: any = await client.responses.create(payload as any);

    // ----------------- テキスト取り出し -----------------

    // 最新 SDK だと output_text が生えているのでまずはそこを優先
    let rawText: string =
      resp.output_text ??
      (resp.output?.[0]?.content
        ?.map((c: any) => c?.text ?? c?.output_text ?? '')
        .join('') ??
        '');

    if (typeof rawText !== 'string') rawText = String(rawText ?? '');

    // ざっくりパース：専用フォーマットは使わず、AI にある程度任せる
    // 「タイトル:」「説明:」のような区切りがあればそれを利用する
    let mercariTitle = '';
    let mercariDescription = '';

    const titleMatch = rawText.match(/タイトル[:：]\s*(.+)/);
    if (titleMatch) {
      mercariTitle = titleMatch[1].trim().slice(0, 40);
    }

    const descMatch = rawText.match(/説明文?[:：]\s*([\s\S]+)/);
    if (descMatch) {
      mercariDescription = descMatch[1].trim().slice(0, 500);
    }

    // もしうまく切り出せなかった場合は、全文からそれっぽく切る
    if (!mercariTitle) {
      mercariTitle = rawText.replace(/\s+/g, ' ').slice(0, 40);
    }
    if (!mercariDescription) {
      mercariDescription = rawText.trim().slice(0, 500);
    }

    return NextResponse.json({
      ok: true,
      output_text: rawText,
      mercari_title: mercariTitle,
      mercari_description: mercariDescription,
    });
  } catch (err: any) {
    console.error('assess error', err);

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
