// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadForm from "./components/UploadForm";
import { supabase } from "../lib/supabase"; // app 直下 → lib/supabase.ts

type AuthStatus = "checking" | "need_login" | "ok";

export default function Page() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");

  // 画面マウント時にログイン状態をチェック
  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        // セッション無し → /login へ飛ばす
        setStatus("need_login");
        router.push("/login");
        return;
      }

      // セッションあり → 画面表示してOK
      setStatus("ok");
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kanteno_session_id");
    }
    router.push("/login");
  };

  // デバッグ表示用：状態ごとに文言を変える
  if (status === "checking") {
    return (
      <main style={{ padding: 16 }}>
        <h1>DEBUG LOGIN: checking...</h1>
        <p>ログイン状態を確認しています...</p>
      </main>
    );
  }

  if (status === "need_login") {
    // ほぼ一瞬で /login に飛ぶはずだが、
    // 万が一 push が走らなかった時に一応メッセージを出す
    return (
      <main style={{ padding: 16 }}>
        <h1>DEBUG LOGIN: need_login</h1>
        <p>ログインページへ移動中です...</p>
      </main>
    );
  }

  // ここに来ている = ログイン済み
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ fontSize: 14, color: "#16a34a", marginTop: 0 }}>
        DEBUG LOGIN: ok（ログイン済み）
      </h1>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 8,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>査定する</h2>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            id="version-badge"
            style={{
              fontSize: 12,
              background: "#eef2ff",
              color: "#3730a3",
              padding: "4px 8px",
              borderRadius: 999,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            v?
          </span>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>
      </div>

      <UploadForm />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (async function(){
              try{
                const r = await fetch('/api/version');
                const j = await r.json();
                document.getElementById('version-badge').textContent =
                  (j.ok ? j.version : 'v?');
              }catch(e){ /* noop */ }
            })();
          `,
        }}
      />
    </main>
  );
}
