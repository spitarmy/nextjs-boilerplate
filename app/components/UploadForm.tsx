'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

// ---- ENV (NEXT_PUBLIC を必ず設定) ----
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const BUCKET = 'uploads';

// 画像を圧縮して JPEG の File を返す
async function compressImage(file: File): Promise<File> {
  const opts = {
    maxSizeMB: 1.2,          // 目安: 1.2MB
    maxWidthOrHeight: 1600,  // 長辺 1600px
    useWebWorker: true,
    initialQuality: 0.8,
  } as const;

  try {
    const blob = (await imageCompression(file, opts)) as Blob;
    // .heic 等は jpg にリネーム
    const base = (file.name || 'image').replace(/\.(heic|heif|HEIC|HEIF)$/i, '');
    const outName = `${base}.jpg`;
    return new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    // 圧縮失敗時は元画像を返す
    console.warn('compress fallback', e);
    return file;
  }
}

// Supabase にアップロードして public URL を返す
async function uploadToSupabase(file: File): Promise<string> {
  const ext = (file.type?.split('/')?.[1] ?? 'jpg').toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  // バケット名とファイル名を / で結合。fileName のみ encode
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(fileName)}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase upload failed: ${res.status} ${t}`);
  }

  // バケットが public の前提
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(fileName)}`;
}

type AssessResult = {
  output_text?: string;
  [k: string]: any;
};

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);

  // ファイル選択
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setErrorMsg(null);
    setResult(null);
  }

  // 送信
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);

    if (!file) {
      setErrorMsg('画像ファイルを選んでください。');
      return;
    }

    setLoading(true);
    try {
      // 圧縮
      const compressedFile = await compressImage(file);

      // Supabase へアップロード → 公開URL
      const publicUrl = await uploadToSupabase(compressedFile);

      // /api/assess へ送信
      const resp = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: publicUrl }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`API error: ${resp.status} ${t}`);
      }

      const json = (await resp.json()) as AssessResult;
      setResult(json);
    } catch (err: any) {
      setErrorMsg(err?.message ?? '処理に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p>写真でカンテノ / 査定</p>
      <input type="file" accept="image/*" onChange={onChange} />
      <button type="submit" disabled={loading}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {errorMsg && <p style={{ color: 'crimson' }}>⚠️ {errorMsg}</p>}
      {result && (
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </form>
  );
}
