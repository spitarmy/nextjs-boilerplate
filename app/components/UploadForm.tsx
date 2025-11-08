'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

type AssessResult = {
  output_text?: string;
  [k: string]: any;
};

// ===== Supabase 環境変数（Vercelに設定済みであること）=====
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ===== 画像圧縮（安定版）=====
async function compressImage(file: File): Promise<File> {
  const options = { maxSizeMB: 1.2, maxWidthOrHeight: 1600, useWebWorker: true, initialQuality: 0.82 };
  try {
    const compressedBlob = (await imageCompression(file, options)) as Blob;

    // 拡張子を jpg に統一（.heic 等でも表示互換を担保）
    const baseName = (file.name || 'image')
      .replace(/\.(heic|heif|HEIC|HEIF)$/i, '')
      .replace(/\.[^.]+$/, '');
    const outName = `${baseName}.jpg`;

    return new File([compressedBlob], outName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (e) {
    // 失敗時は元ファイルをそのまま返す（フォールバック）
    return file;
  }
}

// ===== Supabase へアップロードして公開URLを返す =====
async function uploadToSupabase(file: File): Promise<string> {
  // 拡張子
  const extFromType = file.type?.split('/')?.[1];
  const extSafe = (extFromType || file.name.split('.').pop() || 'jpg').toLowerCase();

  // ランダムな安全ファイル名
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extSafe}`;

  // セグメントを分けてパス化（encode はファイル名のみに適用）
  const objectPath = `uploads/mobile/${encodeURIComponent(fileName)}`;

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${objectPath}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true', // 同名なら上書き
    },
    body: file,
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Supabase upload failed: ${res.status} ${t}`);
  }

  // バケット uploads が public である前提
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/uploads/mobile/${encodeURIComponent(fileName)}`;
  return publicUrl;
}

// ===== 画面本体 =====
export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResult | null>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setDone(false);
    setErrorMsg(null);
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setDone(false);
    setErrorMsg(null);
    setResult(null);

    try {
      if (!file) {
        setErrorMsg('画像ファイルを選んでください。');
        setLoading(false);
        return;
      }

      // 1) 圧縮
      const compressed = await compressImage(file);

      // 2) アップロード→公開URL
      const publicUrl = await uploadToSupabase(compressed);

      // 3) /api/assess に画像URLを渡して AI 推論
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

      <div style={{ marginTop: 10 }}>
        <button type="submit" disabled={loading || !file}>
          {loading ? '査定中…' : '査定する'}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: 'crimson', marginTop: 12 }}>
          ⚠️ {errorMsg}
        </p>
      )}

      {done && result?.output_text && (
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, marginTop: 12 }}>
          {result.output_text}
        </div>
      )}
    </form>
  );
}
