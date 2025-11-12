'use client';
import React, { useState } from 'react';

type AssessRes = {
  ok: boolean;
  error?: string;
  detail?: any;
  debug?: any;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
};

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<AssessRes | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRes(null);
    setLoading(true);
    try {
      const fd = new FormData();
      files.forEach((f, i) => fd.append(`file_${i+1}`, f));
      const r = await fetch('/api/assess', { method: 'POST', body: fd });
      const j = await r.json() as AssessRes;
      if (!r.ok) throw j;
      setRes(j);
    } catch (err: any) {
      setRes(typeof err === 'object' ? err : { ok:false, error:String(err) });
    } finally {
      setLoading(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = Array.from(e.target.files || []);
    setFiles(fl);
    setPreview(fl[0] ? URL.createObjectURL(fl[0]) : null);
  }

  return (
    <form onSubmit={onSubmit} style={{ display:'grid', gap:12 }}>
      <input type="file" multiple accept="image/*" onChange={onPick}/>
      {preview && <img src={preview} alt="preview" style={{maxWidth:320,borderRadius:6}}/>}
      <button type="submit" disabled={loading || files.length===0}>
        {loading ? '査定中…' : '査定する'}
      </button>

      {res && !res.ok && (
        <div style={{color:'#b91c1c'}}>
          <p><b>Error:</b> {res.error || 'unknown'}</p>
          <p style={{color:'#374151'}}>査定処理でエラーが発生しました。画像サイズまたは通信環境をご確認ください。</p>
          {(res.detail || res.debug) && (
            <details>
              <summary>デバッグ詳細を開く</summary>
              <pre style={{whiteSpace:'pre-wrap',fontSize:12,background:'#f9fafb',padding:8,borderRadius:6}}>
                {JSON.stringify({ detail: res.detail, debug: res.debug }, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {res && res.ok && (
        <>
          <h3>メルカリ用タイトル</h3>
          <div>{res.mercari_title}</div>
          <h3>メルカリ用説明文</h3>
          <pre style={{whiteSpace:'pre-wrap'}}>{res.mercari_description}</pre>
        </>
      )}
    </form>
  );
}
