// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadForm from "./components/UploadForm";
import { supabase } from "../lib/supabase";

type AuthStatus = "checking" | "ok";

export default function Page() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");

  // 画面マウント時に「ログイン済みか」をチェック
  useEffect(() => {
    // ブラウザだけで動かす
    if (typeof window === "undefined") return;

    const loggedIn = window.localStorage.getItem("kanteno_logged_in");

    if (!loggedIn) {
      // ログインしていない → /login に飛ばす
      router.replace("/login");
      return;
    }

    // ログイン済み
    setStatus("ok");
  }, [router]);

  // チェック中はなにも出さない（チラ見え防止）
  if (status !== "ok") {
    return (
      <main style={{ padding: 16 }}>
        <p>ログイン画面へ移動中です...</p>
      </main>
    );
  }

  // ログアウト処理
  const handleLogoutClick = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kanteno_logged_in");
    }
    await supabase.auth.signOut().catch(() => {});
    router.push("/login");
  };

  return (
    <main style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>査定する</h2>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            id="version-badge"
            style={{
              fontSize: 12,
              background: "#eef2ff",
              color: "#3730a3",
              padding: "4px 8px",
              borderRadius: 999,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            }}
          >
            v?
          </span>

          <button
            type="button"
            onClick={handleLogoutClick}
            style={{
              fontSize: 12,
              padding: "4px 10px",
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

      {/* バージョン表示（元々のまま） */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (async function(){
              try{
                const r = await fetch('/api/version');
                const j = await r.json();
                var el = document.getElementById('version-badge');
                if (el) {
                  el.textContent = (j.ok ? j.version : 'v?');
                }
              }catch(e){}
            })();
          `,
        }}
      />
    </main>
  );
}
