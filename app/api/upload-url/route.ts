// app/api/upload-url/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// 画像アップロード用のダミーURLを返すエンドポイント
// ※今はまずエラーを消すために、「ちゃんとした https://... の文字列」を返すだけにしています。
//   後で本番用のストレージ連携（Supabase や Vercel Blob 等）に差し替え可能です。
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const filename = body?.filename as string | undefined;

    if (!filename || typeof filename !== "string") {
      return NextResponse.json(
        { ok: false, error: "filename が送られてきていません。" },
        { status: 400 }
      );
    }

    // ファイル名から seed を作って、毎回同じダミー画像 URL を返す
    const seed =
      filename.replace(/\.[^.]+$/, "") || "risai-upload-placeholder";
    const url = `https://picsum.photos/seed/${encodeURIComponent(
      seed
    )}/512`;

    return NextResponse.json(
      {
        ok: true,
        url, // ← フロント側はこの url を image_urls に詰める
      },
      { status: 200 }
    );
  } catch (e: any) {
    console.error("upload-url error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "upload-url で予期せぬエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
