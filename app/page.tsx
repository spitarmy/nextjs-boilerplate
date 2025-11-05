'use client';
import { createClient } from '@supabase/supabase-js';
import React from 'react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Home() {
  const [status, setStatus] = React.useState('Checking connection...');

  React.useEffect(() => {
    supabase.auth
      .getSession()
      .then(() => setStatus('✅ Supabase connection successful!'))
      .catch((err) => setStatus(`❌ Connection failed: ${err.message}`));
  }, []);

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <h1>Connection Test</h1>
      <p>{status}</p>
    </main>
  );
}
