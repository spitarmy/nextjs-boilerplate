// app/login/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isExpired = searchParams.get("expired") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    isExpired ? "セッションの有効期限が切れました。再度ログインしてください。" : null
  );

  // すでにログイン済みならトップではなく /assess へ
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loggedIn = window.localStorage.getItem("kanteno_logged_in");
    if (loggedIn === "true") {
      router.replace("/assess");
    }
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("supabase login error", error);
        setError(error.message || "ログインに失敗しました");
        return;
      }

      if (!data.session) {
        // まれにセッションが返らないケース用
        setError("セッションを開始できませんでした");
        return;
      }

      // ログインフラグをローカル保存
      if (typeof window !== "undefined") {
        window.localStorage.setItem("kanteno_logged_in", "true");
      }

      // ログインに成功したので査定ページへ
      router.replace("/assess");
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
        backgroundColor: "#f5f5f5",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: "#fff",
          padding: 32,
          borderRadius: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          カンテノ ログイン
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 24 }}>
          管理者から発行されたアカウントでログインしてください。
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{ display: "block", fontSize: 13, marginBottom: 4 }}
            htmlFor="email"
          >
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              marginBottom: 16,
              fontSize: 14,
            }}
          />

          <label
            style={{ display: "block", fontSize: 13, marginBottom: 4 }}
            htmlFor="password"
          >
            パスワード
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              marginBottom: 16,
              fontSize: 14,
            }}
          />

          {error && (
            <p style={{ color: "crimson", fontSize: 12, marginBottom: 12 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 999,
              border: "none",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              backgroundColor: loading ? "#7aa7ff" : "#2563eb",
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "ログイン中…" : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
