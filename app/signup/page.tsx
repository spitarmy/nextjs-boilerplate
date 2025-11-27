// app/signup/page.tsx
"use client";

import { FormEvent, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(""); // 招待コード
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      // 1️⃣ 招待コードが正しいかチェック
      const { data: invite, error: inviteError } = await supabase
        .from("signup_invites")
        .select("id, max_uses, used_count")
        .eq("code", inviteCode)
        .single();

      if (inviteError || !invite) {
        setError("招待コードが正しくありません。");
        setLoading(false);
        return;
      }

      // 回数オーバーしてないか
      if (invite.used_count >= invite.max_uses) {
        setError("この招待コードはすでに使用されています。");
        setLoading(false);
        return;
      }

      // 2️⃣ Supabase Auth でユーザー作成
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError || !data.user) {
        setError(signUpError?.message ?? "サインアップに失敗しました。");
        setLoading(false);
        return;
      }

      // 3️⃣ テナント & プロフィール作成 (さっき作った /api/auth/after-signup を呼ぶ)
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

      // 4️⃣ 招待コードの使用回数を +1
      await supabase
        .from("signup_invites")
        .update({ used_count: invite.used_count + 1 })
        .eq("id", invite.id);

      setMessage("登録が完了しました。ログインページからログインしてください。");
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

        <input
          type="text"
          placeholder="招待コード"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
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
