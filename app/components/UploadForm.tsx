// /app/components/UploadForm.tsx
'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  error?: string;
  detail?: any;
  debug?: any;
  price?: { min: number; mid: number; max: number };
  condition_grade?: string;
  confidence?: number;
  meta?: { category: string; brand: string; title_guess: string; material: string; period: string };
  reasons?: string;
  must_shoot_more?: string[];
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setResult(null);
    setPreviewUrl(list.length ? URL.createObjectURL(list[0]) : null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || loading) return;

    setLoading(true);
    setResult(null);
    setShowDebug(false);

    try {
      // 直接 multipart/form-data で /api/assess に送る（旧 upload-url は使わない）
      const fd = new FormData();
      files.forEach((f, i) => fd.append(`file_${i + 1}`, f));

      const res = await fetch('/api/assess', { method: 'POST', body: fd });
      const json = (await res.json()) as AssessResponse;

      if (!res.ok || !json.ok) {
        // サーバは必ず error/detail/debug を返すのでUIで見られるように保持
        setResult(json);
        setShowDebug(true);
        throw new Error(json.error || '査定エラー');
      }

      setResult(json);
    } catch (err) {
      // 送信レベルの失敗でもフォールバック文面を表示
      setResult((prev) => prev ?? {
        ok: false,
        error: 'client_error',
        output_text: '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description: '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。'
      });
    } finally {
      setLoading(false);
    }
  }

  function copy(s?: string) {
    if (!s) return;
    navigator.clipboard.writeText(s);
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <div>
        <input type="file" multiple accept="image/*" onChange={onPickFile} />
        {files.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>選択: {files.length}枚</div>}
      </div>

      {previewUrl && (
        <img src={previewUrl} alt="preview" style={{ maxWidth: 320, borderRadius: 6 }} />
      )}

      <button type="submit" disabled={loading || files.length === 0} style={{ padding: '6px 12px' }}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {/* 結果表示 */}
      {result && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          {result.output_text ? (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#111' }}>
{result.output_text}
            </pre>
          ) : (
            <div style={{ color: '#b91c1c' }}>
              Error: {result.error || 'Unknown'}
            </div>
          )}

          {/* メルカリ用 */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600 }}>メルカリ用タイトル</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{ background: '#f9fafb', padding: '4px 6px', borderRadius: 4 }}>
                {result.mercari_title || '（なし）'}
              </code>
              <button type="button" onClick={() => copy(result.mercari_title)}>コピー</button>
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>メルカリ用説明文</div>
            <textarea
              readOnly
              value={result.mercari_description || ''}
              rows={6}
              style={{ width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
            <div><button type="button" onClick={() => copy(result.mercari_description)}>コピー</button></div>
          </div>

          {/* デバッグ詳細 */}
          {result.ok === false && (
            <details open={showDebug} style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer' }}>デバッグ詳細を開く</summary>
              <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#374151' }}>
{JSON.stringify({ error: result.error, detail: result.detail, debug: result.debug }, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
