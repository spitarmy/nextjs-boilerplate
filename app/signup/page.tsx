// app/signup/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase"; // パス注意：プロジェクト構造に合わせて

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError || !data.user) {
        setError(signUpError?.message ?? "サインアップに失敗しました。");
        setLoading(false);
        return;
      }

      // テナント & プロフィール作成
      const res = await fetch("/api/auth/after-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          email,
          name,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "内部登録に失敗しました。");
        setLoading(false);
        return;
      }

      setMessage("登録が完了しました。ログインしてください。");
    } catch (err: any) {
      console.error(err);
      setError("予期せぬエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 400, margin: "0 auto" }}>
      <h2>新規登録</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          type="text"
          placeholder="お名前（店舗名でもOK）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
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
          {loading ? "登録中..." : "登録する"}
        </button>

        {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}
        {message && <p style={{ color: "green", fontSize: 12 }}>{message}</p>}
      </form>
    </main>
  );
}
