'use client';

import React, { useState } from 'react';

// 画像を Supabase にアップロードして公開URLを作るヘルパー
async function uploadToSupabase(file: File) {
  // 環境変数（Vercel の Project → Settings → Environment Variables で設定済み想定）
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // ファイル名（衝突しにくいように時刻＋乱数）
  const ext = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `mobile/${fileName}`; // uploads バケット直下の mobile/ 配下に保存

  // Supabase Storage REST で直接アップロード
  // 事前に：Storage → bucket 名が "uploads"、RLSポリシーで public READ & INSERT を許可済みであること
  const uploadRes = await fetch(
    `${url}/storage/v1/object/uploads/${encodeURIComponent(filePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'x-upsert': 'true',
        'Content-Type': file.type || 'application/octet-stream'
      },
      body: file
    }
  );

  if (!uploadRes.ok) {
    const t = await uploadRes.text().catch(() => '');
    throw new Error(`Storage upload failed: ${uploadRes.status} ${t}`);
  }

  // 公開URL（uploads バケットが Public であること前提）
  const publicUrl = `${url}/storage/v1/object/public/uploads/${encodeURIComponent(
    filePath
  )}`;
  return publicUrl;
}

type AssessResult = {
  summary: string;
  search_query: string;
  matches: {
    id: string;
    source_file: string | null;
    category: string | null;
    subcategory: string | null;
    brand_or_author: string | null;
    model_or_series: string | null;
    workshop_or_kilin: string | null;
    item_type: string | null;
    material: string | null;
    hallmark: string | null;
    period: string | null;
    region: string | null;
    tags: string | null;
    desc_short: string | null;
    desc_long: string | null;
    price_low_high: string | null;
    refs: string | null;
    hallmark_or_font: string | null;
    notes: string | null;
    score: number | null;
  }[];
};

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<AssessResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setDone(false);
    setResult(null);

    try {
      if (!file) {
        setErrorMsg('画像ファイルを選んでください。');
        return;
      }
      setLoading(true);

      // 1) 画像を Supabase にアップ → 公開URL取得
      const imageUrl = await uploadToSupabase(file);

      // 2) 画像URLを API に渡して解析＆ナレッジ検索
      const resp = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: imageUrl })
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        throw new Error(`API error: ${resp.status} ${t}`);
      }

      const json = (await resp.json()) as AssessResult;
      setResult(json);
      setDone(true);
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>写真でカンテノ / 査定</h2>
      <p>スマホから撮影 or 画像を選択 →「査定する」を押すだけ。</p>

      <label style={{ display: 'block', marginBottom: 8 }}>
        ファイルを選択{' '}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? '解析中…' : '査定する'}
      </button>

      {errorMsg && (
        <p style={{ color: 'crimson', marginTop: 12 }}>⚠ エラー: {errorMsg}</p>
      )}

      {done && <p style={{ color: 'green', marginTop: 8 }}>✅ 完了</p>}

      {/* ここから結果表示 */}
      {result && (
        <section style={{ marginTop: 16, padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>査定結果（要約）</h3>
          <p>{result.summary}</p>

          <h4>検索キーワード</h4>
          <p>{result.search_query}</p>

          <h4>参考データ（ナレッジ照合 上位）</h4>
          <ul style={{ paddingLeft: 18 }}>
            {result.matches.map((m) => (
              <li key={m.id} style={{ marginBottom: 10 }}>
                <div>
                  <b>
                    {m.brand_or_author ?? '-'} / {m.model_or_series ?? '-'} / {m.item_type ?? '-'}
                  </b>
                </div>
                <div>{m.desc_short || m.desc_long || ''}</div>
                <div style={{ fontSize: 12, color: '#666' }}>
                  スコア: {m.score?.toFixed?.(2) ?? '-'} ｜ 出典: {m.source_file ?? '-'}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </form>
  );
}
