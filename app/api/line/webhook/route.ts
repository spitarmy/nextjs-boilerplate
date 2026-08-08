// app/api/line/webhook/route.ts
// LINE Messaging API Webhook エンドポイント
// ユーザーが画像を送信 → カンテノ査定 → 結果を返信
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60; // 査定に時間がかかるため

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!;
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!;

// ===== 署名検証 =====
function verifySignature(body: string, signature: string): boolean {
  const hash = crypto
    .createHmac("SHA256", LINE_CHANNEL_SECRET)
    .update(body)
    .digest("base64");
  return hash === signature;
}

// ===== LINE API: テキスト返信 =====
async function replyMessage(replyToken: string, text: string) {
  // LINEの制限: テキストメッセージは5000文字まで
  const truncated = text.length > 4900 ? text.slice(0, 4900) + "\n\n…（省略）" : text;
  
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: truncated }],
    }),
  });
}

// ===== LINE API: 画像取得 =====
async function getImageContent(messageId: string): Promise<Buffer> {
  const token = LINE_CHANNEL_ACCESS_TOKEN;
  console.log(`[LINE_WEBHOOK] getImageContent id=${messageId} token_len=${token?.length ?? 0} token_start=${token?.slice(0, 10) ?? "EMPTY"}`);
  
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(`[LINE_WEBHOOK] 画像取得失敗: status=${res.status} body=${errorBody.slice(0, 200)}`);
    throw new Error(`画像取得失敗: ${res.status} ${errorBody.slice(0, 100)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ===== 画像をSupabase Storageにアップロード =====
async function uploadToStorage(buffer: Buffer, filename: string): Promise<string> {
  const path = `line/${Date.now()}_${filename}`;
  const { error } = await supabaseAdmin.storage
    .from("images")
    .upload(path, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw new Error(`ストレージアップロード失敗: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}

// ===== 簡易査定（LINE用 — 軽量版） =====
async function assessImage(imageUrl: string): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const prompt = [
    "あなたは骨董・ブランド・和物・雑貨など幅広い商品を査定するプロの鑑定士AIです。",
    "以下の画像を見て、簡潔に査定結果を返してください。",
    "",
    "【出力フォーマット（テキストのみ、JSON不要）】",
    "🏷️ 商品名: （推定される商品名）",
    "🔍 真贋: （本物の可能性が高い / 要確認 / 偽物の可能性）",
    "📊 状態: （S/A/B/C/D で評価 + 簡単な説明）",
    "💰 想定相場: ◯◯,◯◯◯〜◯◯,◯◯◯円（◯◯基準）",
    "📝 コメント: （1〜2行の補足）",
    "",
    "※ JSONやコードブロックは使わないこと。上記フォーマットのテキストのみ出力。",
    "※ 想定相場は中古市場（メルカリ・ヤフオク等）の実売価格を基準にする。",
    "※ 不明な場合は正直に「判定困難」と書く。",
  ].join("\n");

  const res: any = await openai.responses.create({
    model: "gpt-4.1-mini", // LINE用は速度重視でmini
    temperature: 0.2,
    max_output_tokens: 500,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: imageUrl, detail: "auto" },
        ],
      },
    ],
  });

  const text = res.output?.[0]?.content?.[0]?.text ?? "";
  return text || "査定結果を生成できませんでした。";
}

// ===== Webhook POST ハンドラ =====
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature") ?? "";

  // 署名検証
  if (!verifySignature(body, signature)) {
    console.error("[LINE_WEBHOOK] 署名検証失敗");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = JSON.parse(body);
  const events = parsed.events ?? [];

  // 各イベントを処理（非同期でバックグラウンド実行）
  for (const event of events) {
    if (event.type !== "message") continue;

    const replyToken = event.replyToken;

    // テキストメッセージ
    if (event.message.type === "text") {
      const userText = event.message.text.trim();

      if (userText === "使い方" || userText === "ヘルプ" || userText === "help") {
        await replyMessage(replyToken, [
          "📸 カンテノ古物総合鑑定士の使い方",
          "",
          "商品の写真を送るだけ！",
          "AIが自動で査定して結果をお返しします。",
          "",
          "【対応ジャンル】",
          "・ブランドバッグ、財布",
          "・ジュエリー、貴金属",
          "・腕時計",
          "・和物（掛軸、茶道具、陶磁器）",
          "・金工、漆器（鉄瓶、銀瓶）",
          "・おもちゃ、フィギュア",
          "・家電、カメラ",
          "",
          "📱 より詳細な査定はWebアプリへ：",
          "https://nextjs-boilerplate-rho-three-51.vercel.app",
        ].join("\n"));
      } else {
        await replyMessage(replyToken, [
          "📸 査定したい商品の写真を送ってください！",
          "",
          "写真を受け取り次第、AIが査定します。",
          "「使い方」と送ると詳しい説明が見れます。",
        ].join("\n"));
      }
      continue;
    }

    // 画像メッセージ
    if (event.message.type === "image") {
      try {
        // 1. 画像をLINEサーバーからダウンロード
        const imageBuffer = await getImageContent(event.message.id);

        // 2. Supabase Storageにアップロード
        const imageUrl = await uploadToStorage(imageBuffer, `${event.message.id}.jpg`);

        // 3. AI査定
        const result = await assessImage(imageUrl);

        // 4. 結果を返信
        await replyMessage(replyToken, [
          "🔎 査定結果",
          "━━━━━━━━━━━━",
          result,
          "━━━━━━━━━━━━",
          "",
          "📱 詳細査定・出品文生成はWebアプリへ：",
          "https://nextjs-boilerplate-rho-three-51.vercel.app",
        ].join("\n"));
      } catch (e: any) {
        console.error("[LINE_WEBHOOK] 査定エラー:", e);
        await replyMessage(replyToken, "⚠️ 査定中にエラーが発生しました。もう一度お試しください。");
      }
      continue;
    }

    // その他のメッセージ
    await replyMessage(replyToken, "📸 商品の写真を送ってください！AIが査定します。");
  }

  return NextResponse.json({ ok: true });
}
