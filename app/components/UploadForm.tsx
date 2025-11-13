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

  // File -> data URL (base64) に変換するヘルパー
  function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result); // "data:image/jpeg;base64,...."
        } else {
          reject(new Error('failed to read file'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('file read error'));
      reader.readAsDataURL(file);
    });
  }

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

  async function onAssess() {
    try {
      setErrorMsg(null);
      setResult(null);

      if (files.length === 0) {
        setErrorMsg('画像を選択してください。');
        return;
      }

      setLoading(true);

      // ここで全部 base64(data URL) にする
      const dataUrls = await Promise.all(files.map(fileToDataUrl));

      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_urls: dataUrls, // ← /api/assess 側はここを読む
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
        err?.message ?? '査定処理でエラーが発生しました。時間をおいて再度お試しください。'
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
