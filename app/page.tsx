'use client';
import React from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export default function Home() {
  const [status, setStatus] = React.useState('Checking…');

  React.useEffect(() => {
    supabase.auth.getSession()
      .then(() => setStatus('✅ Supabase OK'))
      .catch((err) => setStatus(`❌ ${err?.message ?? 'Error'}`));
  }, []);

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <h1>Connection Test</h1>
      <p>{status}</p>
    </main>
  );
}
