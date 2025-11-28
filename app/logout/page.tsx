// app/logout/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error(e);
      }

      if (typeof window !== "undefined") {
        window.localStorage.removeItem("kanteno_logged_in");
      }

      router.replace("/login");
    };

    run();
  }, [router]);

  return (
    <main style={{ padding: 16 }}>
      <p>ログアウト中です…</p>
    </main>
  );
}
