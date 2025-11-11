// /app/api/upload-url/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Server only

export async function POST(req: Request) {
  try {
    const { filename } = await req.json();
    if (!filename) return NextResponse.json({ ok: false, message: 'filename required' }, { status: 400 });

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const bucket = 'uploads'; // ← あなたのバケット名（Public）
    const path = `mobile/${Date.now()}_${encodeURIComponent(filename)}`;

    const { data, error } = await supa.storage.from(bucket).createSignedUploadUrl(path);
    if (error) throw error;

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

    return NextResponse.json({ ok: true, bucket, path, token: data.token, publicUrl });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'server error' }, { status: 500 });
  }
}
