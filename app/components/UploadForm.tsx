'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

type AssessResult = {
  output_text?: string;
  [k: string]: any;
};

// ========= 2-2 圧縮ヘルパー（そのままコピペ） =========
async function compressImage(file: File) {
  const options = {
    maxSizeMB: 2,              // 最大 2MB まで
    maxWidthOrHeight: 1600,    // 長辺 1600px
    useWebWorker: true,
    maxIteration: 10,
    initialQuality: 0.85,
  } as const;

  try {
    const compressed = await imageCompression(file, options);

    console.log(
      圧縮前: ${(file.size / 1024 / 1024).toFixed(2)}MB → 圧縮後: ${(compressed.size / 1024 / 1024).toFixed(2)}MB
    );

    const blob = compressed instanceof Blob
      ? compressed
      : await fetch(compressed as any).then(r => r.blob());

    // HEIC 対策で拡張子を jpg に寄せる
    const name = file.name.replace(/\.(heic|HEIC)$/,'_conv.jpg');

    return new File([blob], name, {
      type: blob.type || 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch (e) {
    console.warn('圧縮失敗 → 元画像を使用します:', e);
    return file;
  }
}
// =====================================================

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

      // Supabase Storage に直接 PUT
      const up = await fetch(
        `${url}/storage/v1/object/uploads/${encodeURIComponent(filePath)}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${anon}`,
            'Content-Type': compressedFile.type || 'image/jpeg',
          },
          body: compressedFile,
        }
      );
      if (!up.ok) {
        const t = await up.text().catch(()=>'');
        throw new Error(`Upload failed: ${up.status} ${t}`);
      }

      const publicUrl =
        `${url}/storage/v1/object/public/uploads/${encodeURIComponent(filePath)}`;

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
