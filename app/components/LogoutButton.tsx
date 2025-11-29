// app/components/LogoutButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "../../lib/supabase"; // ※ login/page.tsx と同じパスに合わせてください

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Supabase セッションを破棄
      await supabase.auth.signOut().catch(() => {});

      // ローカルのログインフラグも削除
      if (typeof window !== "undefined") {
        localStorage.removeItem("kanteno_logged_in");
      }

      // ログイン画面へ
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "#fff",
        fontSize: 12,
        cursor: loading ? "default" : "pointer",
        marginLeft: 8,
      }}
    >
      {loading ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
