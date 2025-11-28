// app/login/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // すでにログイン済みなら / に戻す
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loggedIn = window.localStorage.getItem("kanteno_logged_in");
    if (loggedIn) {
      router.replace("/");
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message || "ログインに失敗しました。");
        setLoading(false);
        return;
      }

      // ログイン OK → フラグを立ててから / へ
      if (typeof window !== "undefined") {
        window.localStorage.setItem("kanteno_logged_in", "1");
      }

      router.replace("/");
    } catch (e: any) {
      setError(e?.message || "予期せぬエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 10px 25px rgba(0,0,0,0.04)",
          background: "#ffffff",
        }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>リサイくん ログイン</h1>
        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>
          管理者から発行されたアカウントでログインしてください。
        </p>

        <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          メールアドレス
        </label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
            marginBottom: 12,
          }}
        />

        <label style={{ fontSize: 12, display: "block", marginBottom: 4 }}>
          パスワード
        </label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
            marginBottom: 16,
          }}
        />

        {error && (
          <p style={{ color: "#b91c1c", fontSize: 12, marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 999,
            border: "none",
            background: loading ? "#9ca3af" : "#2563eb",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </main>
  );
}
