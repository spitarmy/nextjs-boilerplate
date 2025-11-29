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
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/");
      }
    };
    check();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // ログイン成功 → トップへ
    router.replace("/");
  };

  return (
    <main style={{ padding: 32 }}>
      <div
        style={{
          maxWidth: 420,
          margin: "40px auto",
          padding: "32px 28px",
          borderRadius: 12,
          border: "1px solid #eee",
          boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
          background: "#fff",
        }}
      >
        {/* ここを「カンテの ログイン」に変更済み */}
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          カンテノ ログイン
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#64748b",
            marginBottom: 24,
          }}
        >
          管理者から発行されたアカウントでログインしてください。
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "grid", gap: 16 }}
        >
          <label style={{ fontSize: 13 }}>
            メールアドレス
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
              }}
            />
          </label>

          <label style={{ fontSize: 13 }}>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
              }}
            />
          </label>

          {error && (
            <p
              style={{
                fontSize: 12,
                color: "#b91c1c",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px 0",
              borderRadius: 9999,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
