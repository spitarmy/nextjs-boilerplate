// components/UploadForm.tsx
'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);

  // 画像を選択したとき
  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
    setResult(null);
    setErrorMsg(null);

    if (list.length > 0) {
      // 1枚目だけプレビュー表示
      setPreviewUrl(URL.createObjectURL(list[0]));
    } else {
      setPreviewUrl(null);
    }
  }

  // 1ファイルを Supabase にアップロードして publicUrl を返す
  async function uploadToSupabase(file: File): Promise<string> {
    // ① まず /api/upload-url から signed URL をもらう
    const urlRes = await fetch('/api/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name }),
    });

    const urlJson = await urlRes.json();

    if (!urlRes.ok || !urlJson.ok) {
      throw new Error(urlJson.message ?? '署名付きURLの取得に失敗しました');
    }

    const uploadUrl: string = urlJson.uploadUrl;
    const publicUrl: string = urlJson.publicUrl;

    if (!uploadUrl || !publicUrl) {
      throw new Error('uploadUrl または publicUrl が取得できませんでした');
    }

    // ② 署名付きURLに対して PUT で画像本体を送る
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });

    if (!putRes.ok) {
      throw new Error(`画像アップロードに失敗しました (status ${putRes.status})`);
    }

    // ③ /api/assess に渡すのは publicUrl
    return publicUrl;
  }

  // 「査定する」ボタン押下
  async function onAssess() {
    try {
      setErrorMsg(null);
      setResult(null);

      if (files.length === 0) {
        setErrorMsg('画像を選択してください。');
        return;
      }

      setLoading(true);

      // ★ ここが方法Bの心臓部：
      // すべての画像を Supabase にアップロード → 公開URLの配列を取得
      const imageUrls = await Promise.all(files.map(uploadToSupabase));

      // その URL 配列を /api/assess に投げる
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_urls: imageUrls,
        }),
      });

      const json = (await res.json()) as AssessResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP error ${res.status}`);
      }

      setResult(json);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err?.message ??
          '査定処理でエラーが発生しました。時間をおいて再度お試しください。'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onPickFile}
        />
      </div>

      {previewUrl && (
        <div style={{ marginBottom: 16 }}>
          <img
            src={previewUrl}
            alt="preview"
            style={{ maxWidth: 300, height: 'auto' }}
          />
        </div>
      )}

      <button onClick={onAssess} disabled={loading || files.length === 0}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {errorMsg && (
        <p style={{ color: 'red', marginTop: 16 }}>
          Error: {errorMsg}
        </p>
      )}

      {result && result.ok && (
        <div style={{ marginTop: 24 }}>
          <h3>メルカリ用タイトル</h3>
          <p>{result.mercari_title ?? '（未生成）'}</p>

          <h3>メルカリ用説明文</h3>
          <p>{result.mercari_description ?? result.output_text ?? '（未生成）'}</p>
        </div>
      )}
    </main>
  );
}
