// app/login/page.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase"; // ← app/login から見て2階層上

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (signInError || !data.user) {
        setError(signInError?.message ?? "ログインに失敗しました。");
        setLoading(false);
        return;
      }

      const user = data.user;

      // profiles から tenant_id を取る
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.tenant_id) {
        console.error("profile error", profileError);
        setError("プロフィール情報の取得に失敗しました。");
        setLoading(false);
        return;
      }

      // 席数チェック付きでセッション登録
      const res = await fetch("/api/session/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: profile.tenant_id,
          userId: user.id,
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "ログイン可能枠を超えています。");
        setLoading(false);
        return;
      }

      setSessionId(json.sessionId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("kanteno_session_id", json.sessionId);
      }

      router.push("/");
    } catch (err: any) {
      console.error(err);
      setError("予期せぬエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  // 既存 sessionId を復元（ページ再読込用）
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("kanteno_session_id");
    if (stored) setSessionId(stored);
  }, []);

  // 定期 ping（60秒おき）
  useEffect(() => {
    if (!sessionId) return;
    const id = setInterval(() => {
      fetch("/api/session/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [sessionId]);

  return (
    <main style={{ padding: 24, maxWidth: 400, margin: "0 auto" }}>
      <h2>ログイン</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={loading}>
          {loading ? "ログイン中..." : "ログイン"}
        </button>

        {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
      </form>
    </main>
  );
}
