// lib/supabase.ts
// クライアントサイド用（ブラウザ）
// ※ APIルートではlib/supabaseServer.tsを使うこと
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
