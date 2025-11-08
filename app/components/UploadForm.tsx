'use client';

import React, { useState } from 'react';
import imageCompression from 'browser-image-compression';

// 画像を圧縮して File を返すヘルパー
async function compressImage(file: File) {
  // モバイル想定で現実的な設定（最大2MB・長辺1600px）
  const options = {
    maxSizeMB: 2,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    maxIteration: 10,
    initialQuality: 0.85,
  } as const;

  try {
    const compressed = await imageCompression(file, options);

    // デバッグログ（テンプレートリテラルのバッククォートを必ず閉じる！）
    console.log(
      圧縮前: ${(file.size / 1024 / 1024).toFixed(2)}MB → 圧縮後: ${(compressed.size / 1024 / 1024).toFixed(2)}MB
    );

    // File型を維持したいので File に包み直す
    const compressedBlob = compressed instanceof Blob ? compressed : await fetch(compressed as any).then(r => r.blob());
    const compressedFile = new File([compressedBlob], file.name.replace(/\.(heic|HEIC)$/,'_conv.jpg'), {
      type: compressedBlob.type || 'image/jpeg',
      lastModified: Date.now(),
    });

    return compressedFile;
  } catch (e) {
    console.warn('圧縮に失敗したので元画像を使用します:', e);
    return file; // 失敗時はそのまま
  }
}

/** Supabase Storage にアップロードして「公開URL」を返す */
async function uploadToSupabase(file: File): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('SupabaseのURL/Anonキーが未設定です');

  // 拡張子は元ファイルから拾う（なければjpg）
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  // あなたのプロジェクトでは uploads バケットを使っていたのでそのまま利用
  const filePath = `mobile/${fileName}`;
  const bucket = 'uploads';

  // Storage REST: POST /storage/v1/object/<bucket>/<path>
  const uploadRes = await fetch(
    `${url}/storage/v1/object/${bucket}/${encodeURIComponent(filePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    }
  );

  if (!uploadRes.ok) {
    const t = await uploadRes.text().catch(() => '');
    throw new Error(`Supabase upload error: ${uploadRes.status} ${t}`);
  }

  // 公開URL（バケットが public 前提）
  const publicUrl = `${url}/storage/v1/object/public/${bucket}/${filePath}`;
  return publicUrl;
}

type AssessResult = {
  ok: boolean;
  text?: string;
  error?: string;
};

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<AssessResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setDone(false);
    setResult(null);

    try {
      if (!file) {
        setErrorMsg('画像ファイルを選択してください。');
        return;
      }
      setLoading(true);

      // ① 画像を圧縮
      const compressed = await compressImage(file);

      // ② Supabaseへアップロード → 公開URL取得
      const imageUrl = await uploadToSupabase(compressed);

      // ③ APIへ判定依頼（/api/assess）
      const resp = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl }),
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`API error: ${resp.status} ${t}`);
      }

      const json = (await resp.json()) as AssessResult;
      setResult(json);
      setDone(true);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p>写真でカンテノ / 査定</p>
      <p>スマホから撮影 or 画像を選択 → 「査定する」を押すだけ。</p>

      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div style={{ marginTop: 12 }}>
        <button type="submit" disabled={loading}>
          {loading ? 'アップロード中…' : '査定する'}
        </button>
      </div>

      {errorMsg && (
        <p style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>⚠️ エラー：{errorMsg}</p>
      )}

      {done && result && (
        <div style={{ marginTop: 12 }}>
          <p>✔ 完了</p>
          {result.text && <pre style={{ whiteSpace: 'pre-wrap' }}>{result.text}</pre>}
        </div>
      )}
    </form>
  );
}
