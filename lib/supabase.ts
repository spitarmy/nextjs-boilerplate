// lib/supabase.ts
// クライアントサイド用（ブラウザ）— Cookie ベースでセッション管理
// ※ APIルートではlib/supabaseServer.tsを使うこと
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
