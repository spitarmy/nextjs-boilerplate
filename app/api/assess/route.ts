// app/api/upload-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🔴 Supabase の URL と service role key（すでに設定済みのはず）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// 🔴 Storage のバケット名（Supabase 側と必ず同じに）
// いま使っているバケット名が "uploads" ならこのままでOK
const BUCKET = 'uploads';

// サーバー用の Supabase クライアント（service key 利用）
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
    const filename = body?.filename as string | undefined;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'filename が不正です' },
        { status: 400 }
      );
    }

    // 保存先パスを決める（バケット内のフォルダ＋ランダム名）
    const safeName = filename.replace(/[^\w.-]+/g, '_');
    const objectPath =
      `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;

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

    // フロントが PUT するときに使う URL（signedUrl）と、
    // /api/assess に渡す公開URL（publicUrl）を返す
    return NextResponse.json({
      ok: true,
      bucket: BUCKET,
      path: data.path as string,
      token: data.token as string,
      uploadUrl: data.signedUrl as string,
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
