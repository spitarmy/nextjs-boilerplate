// app/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // ここから /login にクライアント側でも飛ばす
    router.replace("/login");
  }, [router]);

  return (
    <main style={{ padding: 32 }}>
      <h1>Redirecting...</h1>
      <p>/login に移動中です。</p>
    </main>
  );
}
