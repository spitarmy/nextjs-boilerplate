'use client';

import React, { useState } from 'react';

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
  price?: { min: number; mid: number; max: number };
  condition_grade?: string;
  confidence?: number;
  meta?: {
    category: string; brand: string; title_guess: string; material: string; period: string;
  };
  reasons?: string;
  must_shoot_more?: string[];
  raw_model_json?: any;
  detail?: any;  // サーバが返すデバッグ
  debug?: any;   // サーバが返すデバッグ
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setResult(null);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;

    setLoading(true);
    setResult(null);

    try {
      const fd = new FormData();
      files.forEach((f, i) => fd.append(`file_${i + 1}`, f, f.name));

      const res = await fetch('/api/assess', { method: 'POST', body: fd });

      // まず生で受けてからJSON化（万一のHTML/テキストも拾う）
      const text = await res.text();
      let json: AssessResponse;
      try { json = JSON.parse(text); } catch { json = { ok: false, error: 'non-json', output_text: text } as any; }

      if (!res.ok || !json.ok) {
        // サーバの detail/debug を見やすくする
        setResult({
          ok: false,
          error: json.error || '査定エラー',
          output_text: json.output_text,
          mercari_title: json.mercari_title,
          mercari_description: json.mercari_description,
          detail: (json as any).detail,
          debug: (json as any).debug,
        });
        return;
      }
      setResult(json);
    } catch (err: any) {
      setResult({
        ok: false,
        error: err?.message || '通信エラー',
        output_text: '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description: '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。',
      });
    } finally {
      setLoading(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s || '');
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 16, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <input type="file" accept="image/*" multiple onChange={onPickFile} />
        {previews.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {previews.map((src, i) => (
              <img key={i} src={src} alt={`preview-${i}`} style={{ width: '100%', borderRadius: 6 }} />
            ))}
          </div>
        )}
      </div>

      <button type="submit" disabled={loading || files.length === 0} style={{ padding: '8px 14px' }}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {result && (
        <div style={{ borderTop: '1px solid #eee', paddingTop: 12 }}>
          {result.ok ? (
            <>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{result.output_text}</pre>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>メルカリ用タイトル</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{result.mercari_title}</span>
                  <button type="button" onClick={() => copyText(result.mercari_title || '')}>コピー</button>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>メルカリ用説明文</div>
                <textarea readOnly value={result.mercari_description || ''} style={{ width: '100%', height: 160 }} />
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#b00020', fontWeight: 600, marginBottom: 8 }}>
                Error: {result.error || 'unknown'}
              </div>
              <div style={{ color: '#666', marginBottom: 12 }}>
                {result.output_text ||
                  '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。'}
              </div>

              {/* デバッグ（サーバの detail/debug を丸見え表示） */}
              {(result.detail || result.debug) && (
                <details open style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
                  <summary>デバッグ詳細</summary>
                  <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify({ detail: result.detail, debug: result.debug }, null, 2)}
                  </pre>
                </details>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>メルカリ用タイトル</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span>{result.mercari_title || '【仮】カンテノ自動査定'}</span>
                  <button type="button" onClick={() => copyText(result.mercari_title || '【仮】カンテノ自動査定')}>コピー</button>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700 }}>メルカリ用説明文</div>
                <textarea
                  readOnly
                  value={result.mercari_description || '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。'}
                  style={{ width: '100%', height: 160 }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
}
