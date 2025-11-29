// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const loggedIn = window.localStorage.getItem("kanteno_logged_in");

    if (loggedIn === "true") {
      // ログイン済みなら査定ページへ
      router.replace("/assess");
    } else {
      // 未ログインならログインページへ
      router.replace("/login");
    }
  }, [router]);

  return (
    <main style={{ padding: 32 }}>
      <p>ページへ移動中です…</p>
    </main>
  );
}
