'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

type AssessResult = {
  output_text?: string;
  [k: string]: any;
};

// ============== 画像をブラウザで圧縮（~1.2MB / 長辺1600px 目安） ==============
async function compressImage(file: File): Promise<File> {
  const options = { maxSizeMB: 1.2, maxWidthOrHeight: 1600, useWebWorker: true, initialQuality: 0.8 };
  try {
    const compressedBlob = (await imageCompression(file, options)) as Blob;

    // 拡張子 .heic / .heif 等は jpg に変更（拡張子子だけ置き換え）
    const base = (file.name || 'image').replace(/\.(heic|heif|HEIC|HEIF)$/i, '').replace(/\.[^.]+$/, '');
    const outName = `${base}.jpg`;

    // Blob -> File（Content-Type は JPEG 固定）
    return new File([compressedBlob], outName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (e) {
    // 圧縮に失敗したら元画像をそのまま使う
    return file;
  }
}

// ============== Supabase にアップロードして 公開URL を返す ==============
// ← ここから置き換え（既存の uploadToSupabase 内 or その直前のPOST部分）
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const bucket = "uploads";

// 拡張子とファイル名
const ext = (file.type?.split("/")?.[1] ?? "jpg").toLowerCase();
const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

// ★ 重要：bucket と fileName を「別セグメント」に分ける（/ を encode しない）
const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURIComponent(fileName)}`;

const res = await fetch(uploadUrl, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SUPABASE_ANON}`,
    "Content-Type": file.type || "application/octet-stream",
    "x-upsert": "true",
  },
  body: file, // 圧縮後なら compressedFile を渡す
});

if (!res.ok) {
  const t = await res.text().catch(() => "");
  throw new Error(`Supabase upload failed: ${res.status} ${t}`);
}

// 公開URL（バケットが public の場合）
const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodeURIComponent(fileName)}`;

// ============== 画面本体 ==============
export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);
  const [loading, setLoading] = useState(false);

  // ファイル選択
  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setDone(false);
    setErrorMsg(null);
    setResult(null);
  }

  // 送信 → 圧縮 → Supabase → /api/assess
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setDone(false);
    setResult(null);
    setLoading(true);

    try {
      if (!file) {
        setErrorMsg('画像ファイルを選んでください。');
        setLoading(false);
        return;
      }

      // 1) まず圧縮
      const compressedFile = await compressImage(file);

      // 2) Supabase にアップロード（3MB超なら圧縮、のロジックは compressImage に集約済み）
      const publicUrl = await uploadToSupabase(compressedFile);

      // 3) 画像URLを API に渡して判定
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
      setDone(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p>写真でカンテノ / 査定</p>
      <input type="file" accept="image/*" onChange={onChange} />
      <button disabled={loading} type="submit">
        {loading ? '査定中…' : '査定する'}
      </button>

      {errorMsg && <p style={{ color: 'crimson' }}>⚠️ {errorMsg}</p>}
      {done && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>}
    </form>
  );
}
