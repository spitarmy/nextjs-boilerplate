'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ClientStatus() {
  const [status, setStatus] = useState('Checking...');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(() => setStatus('✅ Supabase reachable'))
      .catch((err) => setStatus(`❌ ${err?.message ?? 'Failed'}`));
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Connection Test</h1>
      <p>{status}</p>
    </main>
  );
}
