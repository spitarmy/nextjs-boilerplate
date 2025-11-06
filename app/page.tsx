'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Page() {
  const [rows, setRows] = useState<{ id: number; content: string }[]>([]);

  useEffect(() => {
    supabase.from('demo_messages').select('*').limit(5)
      .then(({ data, error }) => {
        if (!error && data) setRows(data);
      });
  }, []);

  return (
    <main style={{ padding: 40 }}>
      <h1>Connection Test</h1>
      <p>✅ Supabase client loaded</p>
      <h2 style={{ marginTop: 24 }}>DB rows</h2>
      <ul>
        {rows.map(r => <li key={r.id}>{r.content}</li>)}
      </ul>
    </main>
  );
}
