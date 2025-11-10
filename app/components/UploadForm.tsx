'use client';

import React, { useState } from 'react';

type ApiResponse = {
  ok: boolean;
  output_text?: string;
  mercari?: {
    title?: string;
    description?: string;
  };
  error?: string;
};

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resultText, setResultText] = useState<string>('');
  const [mTitle, setMTitle] = useState<string>('');       // 40字
  const [mDesc, setMDesc] = useState<string>('');         // 500字
  const [copied, setCopied] = useState<string>('');

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResultText('');
    setMTitle('');
    setMDesc('');
    setCopied('');
    if (f) setPreviewUrl(URL.createObjectURL(f));
    else setPreviewUrl(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setResultText('');
    setMTitle('');
    setMDesc('');
    setCopied('');

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/assess', { method: 'POST', body: fd });
      const json = (await res.json()) as ApiResponse;

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      setResultText(json.output_text || '');

      // ← ここで API の mercari を受け取って UI に反映
      const t = (json.mercari?.title || '').slice(0, 40);
      const d = (json.mercari?.description || '').slice(0, 500);
      setMTitle(t);
      setMDesc(d);
    } catch (err: any) {
      setResultText(`エラー: ${err?.message || 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(`${label} をコピーしました`);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('コピーに失敗しました');
      setTimeout(() => setCopied(''), 1500);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
      <div>
        <label>ファイルを選択</label><br />
        <input type="file" accept="image/*" onChange={onPickFile} />
      </div>

      {previewUrl && (
        <img
          src={previewUrl}
          alt="preview"
          style={{ maxWidth: 360, border: '1px solid #ddd', borderRadius: 8 }}
        />
      )}

      <button type="submit" disabled={!file || loading}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {/* 査定テキスト */}
      {!!resultText && (
        <div>
          <h3 style={{ margin: '16px 0 6px' }}>査定文</h3>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#f7f7f8',
              border: '1px solid #eee',
              padding: 12,
              borderRadius: 8,
            }}
          >
            {resultText}
          </pre>
        </div>
      )}

      {/* メルカリ用コピペ */}
      {(mTitle || mDesc) && (
        <div style={{ marginTop: 8 }}>
          <h3 style={{ margin: '16px 0 6px' }}>メルカリ用コピペ</h3>

          <div style={{ marginBottom: 8 }}>
            <label>
              タイトル（40字以内）{' '}
              <small>{mTitle.length}/40</small>
            </label>
            <textarea
              value={mTitle}
              readOnly
              rows={2}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button type="button" onClick={() => copy(mTitle, 'タイトル')}>
              タイトルをコピー
            </button>
          </div>

          <div>
            <label>
              商品説明（500字以内）{' '}
              <small>{mDesc.length}/500</small>
            </label>
            <textarea
              value={mDesc}
              readOnly
              rows={8}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <button type="button" onClick={() => copy(mDesc, '商品説明')}>
              商品説明をコピー
            </button>
          </div>

          {copied && <div style={{ color: '#0a7', marginTop: 6 }}>{copied}</div>}
        </div>
      )}
    </form>
  );
}
