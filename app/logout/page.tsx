// app/logout/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      // Supabase のセッションを削除
      await supabase.auth.signOut();

      // 同時ログイン制御用のローカルストレージも一応消す
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("kanteno_session_id");
      }

      router.push("/login");
    };

    run();
  }, [router]);

  return (
    <main style={{ padding: 24 }}>
      <p>ログアウトしています...</p>
    </main>
  );
}
