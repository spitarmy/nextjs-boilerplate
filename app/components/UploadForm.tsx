'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  price?: { min: number; mid: number; max: number };
  condition_grade?: string;
  confidence?: number;
  meta?: {
    category: string;
    brand: string;
    title_guess: string;
    material: string;
    period: string;
  };
  reasons?: string;
  must_shoot_more?: string[];
  // 追加: メルカリ用
  mercari_title?: string;
  mercari_description?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [copied, setCopied] = useState<'title' | 'desc' | ''>('');

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const fList = Array.from(e.target.files || []);
    setFiles(fList);
    setResult(null);
    setCopied('');
    if (fList.length > 0) {
      setPreviewUrl(URL.createObjectURL(fList[0]));
    } else {
      setPreviewUrl(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;
    setLoading(true);
    setResult(null);
    setCopied('');

    try {
      const fd = new FormData();
      files.forEach((f, i) => fd.append(`file_${i + 1}`, f));

      const res = await fetch('/api/assess', {
        method: 'POST',
        body: fd,
      });

      const json = (await res.json()) as AssessResponse;
      setResult(json);
    } catch (err) {
      setResult({ ok: false, error: '通信エラー' });
    } finally {
      setLoading(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s).then(() => {
      // UI側でどちらをコピーしたか示すための状態は外から指定
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <div>
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={onPickFile}
        />
        {files.length > 0 && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            選択: {files.length}枚
          </div>
        )}
      </div>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="preview"
          style={{ maxWidth: 320, borderRadius: 6 }}
        />
      )}

      <button type="submit" disabled={loading || files.length === 0}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {result && (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>
          {!result.ok && <div style={{ color: 'crimson' }}>Error: {result.error}</div>}

          {result.ok && (
            <>
              <h3 style={{ margin: '12px 0 6px' }}>査定する</h3>
              <div>{result.output_text}</div>

              {/* メルカリ用コピペ */}
              {(result.mercari_title || result.mercari_description) && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ margin: '12px 0 6px' }}>メルカリ用（コピペ）</h3>

                  {result.mercari_title && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>タイトル（40字内）</div>
                      <div
                        style={{
                          background: '#f7f7f7',
                          padding: 8,
                          borderRadius: 6,
                          wordBreak: 'break-all',
                        }}
                      >
                        {result.mercari_title}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          copyText(result.mercari_title!);
                          setCopied('title');
                        }}
                        style={{ marginTop: 6 }}
                      >
                        タイトルをコピー
                      </button>
                      {copied === 'title' && (
                        <span style={{ marginLeft: 8, color: 'seagreen' }}>
                          コピーしました
                        </span>
                      )}
                    </div>
                  )}

                  {result.mercari_description && (
                    <div>
                      <div style={{ fontWeight: 600 }}>商品説明（500字内）</div>
                      <div
                        style={{
                          background: '#f7f7f7',
                          padding: 8,
                          borderRadius: 6,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {result.mercari_description}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          copyText(result.mercari_description!);
                          setCopied('desc');
                        }}
                        style={{ marginTop: 6 }}
                      >
                        説明文をコピー
                      </button>
                      {copied === 'desc' && (
                        <span style={{ marginLeft: 8, color: 'seagreen' }}>
                          コピーしました
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
