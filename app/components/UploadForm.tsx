// app/components/UploadForm.tsx
'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  output_text?: string;
  mercari_title?: string;
  mercari_body?: string;
  error?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTitle('');
    setBody('');

    if (!files || files.length === 0) {
      setError('画像が選択されていません。');
      return;
    }

    try {
      setLoading(true);

      // FileList → data URL の配列に変換
      const dataUrls: string[] = await Promise.all(
        Array.from(files).map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = (err) => reject(err);
              reader.readAsDataURL(file);
            })
        )
      );

      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_data_urls: dataUrls }),
      });

      const text = await res.text();
      console.log('status', res.status);
      console.log('raw', text);

      let json: AssessResponse;
      try {
        json = JSON.parse(text);
      } catch (e) {
        setError('サーバーからの応答が不正でした。');
        return;
      }

      if (!res.ok || !json.ok) {
        setError(json.error ?? '査定に失敗しました。');
        return;
      }

      setTitle(json.mercari_title ?? '');
      setBody(json.mercari_body ?? json.output_text ?? '');
    } catch (e: any) {
      console.error(e);
      setError('通信エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 8 }}>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => setFiles(e.target.files)}
        />
      </div>

      <button type="submit" disabled={loading}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {error && (
        <p style={{ color: 'red', marginTop: 16 }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <h3>メルカリ用タイトル</h3>
        <p>{title || '【仮】カンテノ自動査定'}</p>

        <h3>メルカリ用説明文</h3>
        <p>
          {body ||
            '一時的なエラーにより詳細を表示できませんでした。時計を変えて再度お試しください。'}
        </p>
      </div>
    </form>
  );
}
