'use client';

import React from 'react';
import { createClient } from '@supabase/supabase-js';
import type { ChangeEvent, FormEvent } from 'react';

// Supabase クライアント（クライアント側用）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 画像をアップして public URL を返す
async function uploadToSupabase(file: File): Promise<string> {
  // バケットは "uploads"
  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  const filePath = `mobile/${fileName}`;

  const { error } = await supabase.storage.from('uploads').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;

  const { data } = supabase.storage.from('uploads').getPublicUrl(filePath);
  if (!data?.publicUrl) throw new Error('Failed to get public URL');
  return data.publicUrl;
}

export default function UploadForm() {
  const [file, setFile] = React.useState<File | null>(null);
  const [status, setStatus] = React.useState<string>('');
  const [result, setResult] = React.useState<string>('');

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setStatus('画像を選択してください');
      return;
    }
    try {
      setStatus('画像をアップロード中...');
      const publicUrl = await uploadToSupabase(file);

      setStatus('AIで査定中...');
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: publicUrl })
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error: ${res.status} ${t}`);
      }
      const data = await res.json();
      setResult(data.assessment || '結果なし');
      setStatus('完了');
    } catch (err: any) {
      setStatus(`エラー: ${err?.message || err}`);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ padding: 16, maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>写真でカンテノ査定</h1>
      <p style={{ marginBottom: 8 }}>
        スマホから撮影 or 画像を選択 → 「査定する」を押すだけ。
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onChange}
        style={{ margin: '12px 0' }}
      />

      <div>
        <button
          type="submit"
          disabled={!file}
          style={{
            padding: '10px 16px',
            borderRadius: 6,
            border: '1px solid #ddd',
            cursor: file ? 'pointer' : 'not-allowed'
          }}
        >
          査定する
        </button>
      </div>

      {status && <p style={{ marginTop: 12 }}>🛈 {status}</p>}
      {result && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>査定結果</div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{result}</pre>
        </div>
      )}
    </form>
  );
}
