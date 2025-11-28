// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadForm from "./components/UploadForm";
import { supabase } from "../lib/supabase"; // ← app 直下 → lib/supabase.ts の想定

type AuthStatus = "checking" | "need_login" | "ok";

export default function Page() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");

  //----------------------------------
  // マウント時にログイン状態をチェック
  //----------------------------------
  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      // セッション無し or エラー → /login へ
      if (error || !data.session) {
        setStatus("need_login");
        router.push("/login");
        return;
      }

      // ログイン済み
      setStatus("ok");
    };

    checkAuth();
  }, [router]);

  //----------------------------------
  // ログイン確認中はアップロード画面を出さない
  //----------------------------------
  if (status !== "ok") {
    return (
      <main style={{ padding: 16 }}>
        <p>ログイン画面へ移動中です...</p>
      </main>
    );
  }

  //----------------------------------
  // ここから先は「ログイン済みユーザーだけ」が見える
  //----------------------------------
  const handleLogoutClick = async () => {
    await supabase.auth.signOut();
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

      {/* バージョン表示のためのスクリプト（元のまま） */}
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
              }catch(e){ /* noop */ }
            })();
          `,
        }}
      />
    </main>
  );
}
