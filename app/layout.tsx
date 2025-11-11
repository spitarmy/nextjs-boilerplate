'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type AssessResponse = {
  ok: boolean; error?: string;
  output_text?: string; mercari_title?: string; mercari_description?: string;
  price?: { min: number; mid: number; max: number };
  condition_grade?: string; confidence?: number;
  meta?: { category: string; brand: string; title_guess: string; material: string; period: string; };
  reasons?: string; must_shoot_more?: string[];
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    setFiles(list);
    setResult(null); setErrorMsg(null);
    setPreviewUrl(list.length ? URL.createObjectURL(list[0]) : null);
  }

  async function compressImage(file: File, maxSide = 1600, q = 0.85): Promise<Blob> {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', q));
    return blob;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length) return;

    setLoading(true); setResult(null); setErrorMsg(null);

    try {
      const imageUrls: string[] = [];

      for (const f of files) {
        const blob = await compressImage(f);

        const up = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name.replace(/\.\w+$/, '') + '.jpg' })
        }).then(r => r.json());

        if (!up.ok) throw new Error(up.message || '署名URL取得エラー');

        const { error } = await supabase
          .storage.from(up.bucket)
          .uploadToSignedUrl(up.path, up.token, blob, { contentType: 'image/jpeg', upsert: false });

        if (error) throw error;
        imageUrls.push(up.publicUrl);
      }

      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_urls: imageUrls })
      });
      const json = (await res.json()) as AssessResponse;
      if (!res.ok || !json.ok) throw new Error(json.error || '査定エラー');

      setResult(json);
    } catch (e: any) {
      setErrorMsg(e?.message || '通信エラー');
      setResult({
        ok: false,
        output_text: '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description: '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。'
      });
    } finally {
      setLoading(false);
    }
  }

  function copyText(s: string) { navigator.clipboard.writeText(s); }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <div>
        <input type="file" multiple accept="image/*" onChange={onPickFile} />
        {!!files.length && <div style={{ fontSize: 12, marginTop: 4 }}>{files.length}枚</div>}
      </div>

      {previewUrl && <img src={previewUrl} alt="preview" style={{ maxWidth: 320, borderRadius: 6 }} />}

      <button type="submit" disabled={loading || !files.length}>{loading ? '査定中…' : '査定する'}</button>

      {errorMsg && <div style={{ color: 'crimson' }}>Error: {errorMsg}</div>}

      {result?.output_text && (
        <pre style={{ whiteSpace: 'pre-wrap', background: '#fafafa', border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
          {result.output_text}
        </pre>
      )}

      {result?.mercari_title && (
        <div>
          <strong>メルカリ用タイトル</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code>{result.mercari_title}</code>
            <button type="button" onClick={() => copyText(result.mercari_title!)}>コピー</button>
          </div>
        </div>
      )}

      {result?.mercari_description && (
        <div>
          <strong>メルカリ用説明文</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <textarea value={result.mercari_description} readOnly rows={8} style={{ width: '100%' }} />
            <button type="button" onClick={() => copyText(result.mercari_description!)}>コピー</button>
          </div>
        </div>
      )}
    </form>
  );
}
