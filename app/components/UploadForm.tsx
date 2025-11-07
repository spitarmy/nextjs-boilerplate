'use client';

import React, { useState } from 'react';

type AppraisalJSON = {
  item_title: string;
  maker_or_brand?: string;
  category?: string;
  confidence: number;
  authenticity_risk: '低' | '中' | '高';
  condition_rank: 'S' | 'A' | 'B' | 'C' | 'J';
  purchase_range_jpy: { min: number; max: number };
  market_range_jpy?: { min: number; max: number };
  hallmarks_to_check?: string[];
  description: string;
  caution: string[];
  used_kb_refs?: number;
};

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<AppraisalJSON | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setResult(null);

    if (!file) {
      setErrorMsg('画像ファイルを選択してください');
      return;
    }

    try {
      setLoading(true);

      // 1) 一時URLを作るためにブラウザでbase64化（今の構成に合わせて簡易に）
      const b64 = await file.arrayBuffer().then((ab) => {
        const bytes = new Uint8Array(ab);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      });
      const mime = file.type || 'image/jpeg';
      const dataUrl = `data:${mime};base64,${b64}`;

      // 2) API へ投げる
      const res = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_url: dataUrl })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'API error');

      setResult(json.result as AppraisalJSON);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>写真でカンテノ 査定</h1>
      <p style={{ color: '#444', marginBottom: 16 }}>
        スマホから撮影 or 画像を選択 → 「査定する」を押すだけ。
      </p>

      <form onSubmit={onSubmit} style={{ marginBottom: 24 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ marginLeft: 12, padding: '6px 14px' }}
        >
          {loading ? '解析中…' : '査定する'}
        </button>
      </form>

      {errorMsg && (
        <div style={{ color: '#b00020', marginBottom: 16 }}>■ エラー: {errorMsg}</div>
      )}

      {result && (
        <div
          style={{
            border: '1px solid #ddd',
            borderRadius: 8,
            padding: 16,
            background: '#fff'
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 18 }}>{result.item_title}</h2>
          <p style={{ margin: '4px 0' }}>
            <b>カテゴリ:</b> {result.category || '-'}　<b>ブランド/作家:</b>{' '}
            {result.maker_or_brand || '-'}
          </p>
          <p style={{ margin: '4px 0' }}>
            <b>真贋リスク:</b> {result.authenticity_risk}　<b>状態ランク:</b>{' '}
            {result.condition_rank}　<b>信頼度:</b>{' '}
            {(result.confidence * 100).toFixed(0)}%
          </p>

          <p style={{ margin: '4px 0' }}>
            <b>仕入れ上限目安:</b>{' '}
            {result.purchase_range_jpy.min.toLocaleString()}〜
            {result.purchase_range_jpy.max.toLocaleString()} 円
          </p>

          {result.market_range_jpy && (
            <p style={{ margin: '4px 0' }}>
              <b>市場売価想定:</b>{' '}
              {result.market_range_jpy.min.toLocaleString()}〜
              {result.market_range_jpy.max.toLocaleString()} 円
            </p>
          )}

          {result.hallmarks_to_check?.length ? (
            <p style={{ margin: '4px 0' }}>
              <b>要チェック刻印/特徴:</b> {result.hallmarks_to_check.join(' / ')}
            </p>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <b>商品概要（コピペ用）</b>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: '#f7f7f7',
                padding: 12,
                borderRadius: 6,
                marginTop: 6
              }}
            >
{result.description}
            </pre>
          </div>

          {result.caution?.length ? (
            <div style={{ marginTop: 8 }}>
              <b>注意点</b>
              <ul style={{ marginTop: 6 }}>
                {result.caution.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p style={{ color: '#666', marginTop: 8 }}>
            参照した教師データ件数: {result.used_kb_refs ?? 0}
          </p>
        </div>
      )}
    </div>
  );
}
