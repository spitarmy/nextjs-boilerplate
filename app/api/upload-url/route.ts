// app/api/upload-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🔴 ここが Supabase の URL とサービスロールキー
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 🔴 実際に存在するバケット名に合わせる（uploads と書いてあったやつ）
const BUCKET = 'uploads';

// サーバー用の Supabase クライアント
const supabase = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY)
  : null;

export async function POST(req: NextRequest) {
  try {
    if (!supabase) {
      console.error('Supabase client not initialized');
      return NextResponse.json(
        { ok: false, message: 'Supabase の設定エラーです' },
        { status: 500 }
      );
    }

    // { filename: "IMG_4729.jpg" } を受け取る
    const body = await req.json().catch(() => null);
    const filename = body?.filename;
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'filename が不正です' },
        { status: 400 }
      );
    }

    // 保存先パスを決める（バケット内のフォルダ＋ランダム名）
    const safeName = filename.replace(/[^\w.-]+/g, '_');
    const objectPath =
      `web/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

    // 署名付きアップロードURLを発行
    const { data, error } = await (supabase as any)
      .storage
      .from(BUCKET)
      .createSignedUploadUrl(objectPath);

    if (error || !data) {
      console.error('createSignedUploadUrl error', error);
      return NextResponse.json(
        { ok: false, message: '署名付きURLの作成に失敗しました' },
        { status: 500 }
      );
    }

    // フロントが必要とする情報を返す
    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      path: data.path as string,
      token: data.token as string,
      publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`,
    });
  } catch (e: any) {
    console.error('upload-url route error', e);
    return NextResponse.json(
      { ok: false, message: 'upload-url 内部エラー' },
      { status: 500 }
    );
  }
}
