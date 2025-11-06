'use client'
import React from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Page() {
  const [status, setStatus] = React.useState('Checking...')

  React.useEffect(() => {
    supabase.auth
      .getSession()
      .then(() => setStatus('✅ Supabase client loaded'))
      .catch((err) => setStatus(`❌ ${err?.message || 'Error'}`))
  }, [])

  return (
    <main style={{ padding: 40 }}>
      <h1>Connection Test</h1>
      <p>{status}</p>
    </main>
  )
}
