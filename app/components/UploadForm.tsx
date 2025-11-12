// /app/components/UploadForm.tsx
'use client';

import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type AssessRes = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessRes | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const flist = Array.from(e.target.files || []);
    setFiles(flist);
    setPreview(flist[0] ? URL.createObjectURL(flist[0]) : null);
    setResult(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!files.length || loading) return;

    setLoading(true);
    setResult(null);

    try {
      // 1) Supabaseへアップロード（公開URLを取得）
      const urls: string[] = [];
      for (const f of files) {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `mobile/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('uploads').upload(path, f, {
          contentType: f.type || 'image/jpeg',
          upsert: false,
        });
        if (error) throw new Error('アップロード失敗: ' + error.message);

        const { data } = supabase.storage.from('uploads').getPublicUrl(path);
        if (!data?.publicUrl) throw new Error('公開URL取得エラー');
        urls.push(data.publicUrl);
      }

      // 2) 査定APIへ
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_urls: urls }),
      });

      const json = (await res.json()) as AssessRes & { detail?: any; debug?: any };
      setResult(json);

      // 画面に分かりやすく出す（ネットワークタブが苦手でもOK）
      if (!json.ok) {
        console.log('[assess error detail]', json.detail ?? json);
      }
    } catch (e: any) {
      setResult({
        ok: false,
        error:
          e?.message ||
          '通信エラー',
        output_text:
          '査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。',
        mercari_title: '【仮】カンテノ自動査定',
        mercari_description:
          '一時的なエラーにより詳細を生成できませんでした。時間を空けて再度お試しください。',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
      <input type="file" accept="image/*" multiple onChange={onPick} />
      {preview && (
        <img src={preview} alt="preview" style={{ maxWidth: 320, borderRadius: 6 }} />
      )}
      <button type="submit" disabled={loading || files.length === 0}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {/* 結果表示 */}
      {result && (
        <div style={{ marginTop: 8 }}>
          {result.ok ? (
            <>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{result.output_text}</pre>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600 }}>メルカリ用タイトル</div>
                <div>{result.mercari_title}</div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>メルカリ用説明文</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{result.mercari_description}</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#b91c1c', marginBottom: 6 }}>
                Error: {result.error || '不明なエラー'}
              </div>
              <div style={{ color: '#374151' }}>
                査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。
              </div>
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                <div style={{ fontWeight: 600 }}>メルカリ用タイトル</div>
                <div>{result.mercari_title}</div>
                <div style={{ fontWeight: 600, marginTop: 6 }}>メルカリ用説明文</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {result.mercari_description}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
}
