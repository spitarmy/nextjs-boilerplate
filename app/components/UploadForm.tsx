'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_body?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // 画像選択
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files);

    setFiles(arr);
    setPreviewUrls(arr.map((f) => URL.createObjectURL(f)));
  };

  // DataURL に変換する helper
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string); // data:image/jpeg;base64,....
      };
      reader.onerror = () => reject(new Error('failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // 送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTitle('');
    setBody('');

    if (files.length === 0) {
      setError('画像を選択してください。');
      return;
    }

    setLoading(true);
    try {
      // ① ファイル→DataURL
      const dataUrls = await Promise.all(files.map(fileToDataUrl));

      // ② /api/assess に直接送る
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data_urls: dataUrls }),
      });

      const json = (await res.json()) as AssessResponse;

      if (!res.ok || !json.ok) {
        setError(
          json.error ||
            '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。'
        );
        return;
      }

      setTitle(json.mercari_title || '【仮】カンテノ自動査定');
      setBody(
        json.mercari_body ||
          json.output_text ||
          '査定結果の取得に成功しました。'
      );
    } catch (e) {
      console.error(e);
      setError('予期しないエラーが発生しました。時間を空けて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
        />
      </div>

      {/* プレビュー表示（1枚でも複数枚でもOK） */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        {previewUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            style={{ maxWidth: 240, maxHeight: 240, objectFit: 'contain' }}
          />
        ))}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {error && (
        <p style={{ color: 'red', marginTop: 12 }}>
          Error: {error}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>メルカリ用タイトル</strong>
          <div>
            <input
              type="text"
              value={title}
              readOnly
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div>
          <strong>メルカリ用説明文</strong>
          <div>
            <textarea
              value={body}
              readOnly
              rows={8}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
