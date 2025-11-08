'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

type AssessResult = {
  output_text?: string;
  [k: string]: any;
};

// ========= 2-2 圧縮ヘルパー（そのままコピペ） =========
async function compressImage(file: File) {
  const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };

  try {
    // browser-image-compression は File を返す
    const compressed = await imageCompression(file, options);

    // ← バッククォートで囲むのが重要（ここがエラー原因でした）
    console.log(
      `圧縮前: ${(file.size / 1024 / 1024).toFixed(2)}MB → 圧縮後: ${(compressed.size / 1024 / 1024).toFixed(2)}MB`
    );

    // HEIC/HEIF などは拡張子だけ jpg にそろえる（中身は compressed のまま）
    const base = (file.name || 'image').replace(/\.(heic|HEIC|heif|HEIF)$/,'');
    const name = `${base}.jpg`;

    // compressed は Blob/File なのでそのまま File として包み直す
    return new File([compressed], name, {
      type: compressed.type || 'image/jpeg',
      lastModified: Date.now(),
    });

  } catch (e) {
    console.warn('圧縮失敗。元画像を使用します:', e);
    return file;
  }
}
// =====================================================
// env を拾う（！必ず NEXT_PUBLIC_ 付き）
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 画像をブラウザで圧縮（1.2MB / 長辺1600px 目安）
async function compressImage(file: File): Promise<File> {
  const options = { maxSizeMB: 1.2, maxWidthOrHeight: 1600, useWebWorker: true, initialQuality: 0.8 };
  try {
    const compressed = await imageCompression(file, options);
    console.log(
      圧縮前: ${(file.size/1024/1024).toFixed(2)}MB → 圧縮後: ${(compressed.size/1024/1024).toFixed(2)}MB
    ); // ← バッククォート ` を使用
    return compressed as File;
  } catch (e) {
    console.warn('圧縮に失敗: 元画像を使用します', e);
    return file;
  }
}

// Supabase Storage にアップロードして 公開URL を返す
async function uploadToSupabase(file: File): Promise<string> {
  const ext = (file.type?.split('/')[1] || 'jpg');
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `uploads/${fileName}`;                 // ← bucket=uploads 前提（あなたの設定どおり）

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(filePath)}`, {
    method: 'POST',                                       // 既存オブジェクトがあれば上書き
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });

  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    throw new Error(`Supabase upload failed: ${res.status} ${t}`);
  }

  // 公開URL（uploads バケットを public にしてある前提）
  return `${SUPABASE_URL}/storage/v1/object/public/${filePath}`;
}

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

  // ========= 2-3 送信前に圧縮を挟む “場所” はここ =========
  // onSubmit の最初で file を compressedFile に置き換えます。
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

      // ★★★ ここが 2-3 のコア ★★★
      const compressedFile = await compressImage(file);
      // 以降、必ず compressedFile を使う
      // =================================

      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const filePath = `mobile/${fileName}`;

      // ① 3MB超なら圧縮 → ② Supabase アップロード → ③ 公開URL取得
const useFile = file.size > 3 * 1024 * 1024 ? await compressImage(file) : file;
const imageUrl = await uploadToSupabase(useFile);
      // 画像URLを /api/assess に渡して AI 推論
      const resp = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: publicUrl }),
      });
      if (!resp.ok) {
        const t = await resp.text().catch(()=>'');
        throw new Error(`API error: ${resp.status} ${t}`);
      }

      const json = await resp.json();
      setResult(json);
      setDone(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }
  // =====================================================

  return (
    <form onSubmit={onSubmit}>
      <p>写真でカンテノ / 査定</p>
      <input type="file" accept="image/*" onChange={onChange} />
      <button disabled={loading} type="submit">
        {loading ? '査定中…' : '査定する'}
      </button>

      {errorMsg && <p style={{color:'crimson'}}>⚠️ {errorMsg}</p>}
      {done && <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(result, null, 2)}</pre>}
    </form>
  );
}
