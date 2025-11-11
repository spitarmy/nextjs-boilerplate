// /app/api/upload-url/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge' // 軽い処理なのでEdgeでOK

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY! // Server専用

export async function POST(req: Request) {
  try {
    const { filename, contentType } = await req.json()
    if (!filename || !contentType) {
      return NextResponse.json({ ok:false, message:'bad request' }, { status:400 })
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })
    const bucket = 'assessment_uploads'
    const objectPath = user/${Date.now()}_${encodeURIComponent(filename)}

    const { data, error } = await supa.storage.from(bucket).createSignedUploadUrl(objectPath)
    if (error) throw error

    // 公開バケット前提：すぐ見れるURLを返す
    const publicUrl = ${SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}

    return NextResponse.json({ ok:true, signedUrl: data.signedUrl, publicUrl })
  } catch (e:any) {
    return NextResponse.json({ ok:false, message: e?.message ?? 'server error' }, { status:500 })
  }
}
