// app/api/upload-url/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// サーバー側用の Supabase クライアント（サービスロールキー）
const supabase = createClient(supabaseUrl, serviceKey);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/upload-url
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const filename = body?.filename;

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { ok: false, message: 'filename が指定されていません。' },
        { status: 400 }
      );
    }

    const bucket = 'uploads';                    // ← バケット名
    const path = `mobile/${Date.now()}-${filename}`; // ← mobile フォルダ配下に保存

    // 署名付きアップロード URL を発行
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error('createSignedUploadUrl error', error);
      return NextResponse.json(
        { ok: false, message: '署名付き URL の発行に失敗しました。' },
        { status: 500 }
      );
    }

    // 公開アクセス用 URL（public バケット前提）
    const publicUrl =
      supabaseUrl.replace(/\/$/, '') +
      `/storage/v1/object/public/${bucket}/${path}`;

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl,
    });
  } catch (e: any) {
    console.error('upload-url route error', e);
    return NextResponse.json(
      { ok: false, message: e?.message || 'サーバーエラー' },
      { status: 500 }
    );
  }
}
