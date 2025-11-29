// app/page.tsx
"use client";

import { useEffect } from "react";

export default function Page() {
  useEffect(() => {
    // ブラウザで開かれた瞬間に /login に飛ばす
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, []);

  // ここが見えたら「新しいコードは読み込まれている」証拠
  return (
    <main style={{ padding: 32 }}>
      <h1>DEBUG: / から /login にリダイレクト中…</h1>
      <p>この画面が見えるなら、新しい app/page.tsx が効いています。</p>
    </main>
  );
}
