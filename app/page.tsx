// app/page.tsx
'use client'

import React from 'react'

export default function Page() {
  const [file, setFile] = React.useState<File | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<string>('')

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      alert('写真を選んでください')
      return
    }
    setLoading(true)
    setResult('')
    try {
      const fd = new FormData()
      fd.append('file', file)

      const res = await fetch('/api/assess', {
        method: 'POST',
        body: fd,
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'エラー')
      setResult(data.result)
    } catch (err: any) {
      setResult(`⚠️ ${err?.message ?? '失敗しました'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 20, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>カンテノ Web 査定（仮）</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        スマホのカメラ／写真から1枚アップロードしてAI査定します。
      </p>

      <form onSubmit={onSubmit} style={{
        border: '1px solid #eee', padding: 16, borderRadius: 12, marginBottom: 24
      }}>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div style={{ marginTop: 12 }}>
          <button
            type="submit"
            disabled={loading || !file}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #111',
              background: '#111',
              color: '#fff',
              opacity: loading || !file ? 0.6 : 1
            }}
          >
            {loading ? '解析中…' : 'AIで査定する'}
          </button>
        </div>
      </form>

      {result && (
        <section style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 16, borderRadius: 12 }}>
          {result}
        </section>
      )}
    </main>
  )
}
