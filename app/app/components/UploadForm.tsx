// app/components/UploadForm.tsx
'use client';

import React from 'react';
import { supabase } from '@/lib/supabase';

type AppraiseResponse = {
  verdict: string;
  confidence: number;
  summary: string;
  suggestedPrice?: number;
};

export default function UploadForm() {
  const [file, setFile] = React.useState<File | null>(null);
  const [status, setStatus] = React.useState<string>('');
  const [result, setResult] = React.useState<AppraiseResponse | null>(null);

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResult(null);
    setStatus(f ? 選択: ${f.name} : '');
  };

  const handleUploadAndAppraise = async () => {
    try {
      if (!file) {
        setStatus('画像を選択してください');
        return;
      }
      setStatus('アップロード中…');

      // 1) Supabase Storage へアップ
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `mobile/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('uploads')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      // 2) 公開URL取得
      const { data: pub } = supabase.storage.from('uploads').getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      setStatus('AIで査定中…');

      // 3) 自前API呼び出し
      const res = await fetch('/api/appraise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`API error: ${t}`);
      }
      const json = (await res.json()) as AppraiseResponse;
      setResult(json);
      setStatus('完了');
    } catch (e: any) {
      setStatus(`エラー: ${e.message || e}`);
    }
  };

  return (
    <section style={{ padding: 16, maxWidth: 640 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        写真からかんたん査定（ベータ）
      </h2>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onSelect}
        style={{ marginBottom: 12 }}
      />

      <button
        onClick={handleUploadAndAppraise}
        style={{
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid #ddd',
          background: 'black',
          color: 'white',
          fontWeight: 600,
        }}
      >
        アップロードして査定する
      </button>

      <p style={{ marginTop: 10 }}>{status}</p>

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px solid #eee',
            borderRadius: 8,
            background: '#fafafa',
          }}
        >
          <div><b>判定</b>: {result.verdict}（信頼度 {result.confidence}%）</div>
          {typeof result.suggestedPrice === 'number' && (
            <div><b>概算価格</b>: ¥{result.suggestedPrice.toLocaleString()}</div>
          )}
          <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{result.summary}</div>
        </div>
      )}
    </section>
  );
}
