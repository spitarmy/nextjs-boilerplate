// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadForm from "./components/UploadForm";
import { supabase } from "../lib/supabase"; // ← app から見て 1階層上の lib

export default function Page() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // 画面表示前に「ログインしてるか？」をチェック
  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        // セッションなし → /login に飛ばす
        router.push("/login");
        return;
      }

      // セッションあり → 画面表示OK
      setChecking(false);
    };

    checkAuth();
  }, [router]);

  // ログアウト処理（ヘッダーのボタンから呼ぶ）
  const handleLogout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("kanteno_session_id");
    }
    router.push("/login");
  };

  if (checking) {
    // ログイン確認中
    return (
      <main style={{ padding: 16 }}>
        <p>ログイン状態を確認しています...</p>
      </main>
    );
  }

  // ここから先が、今までの査定画面
  return (
    <main style={{ padding: 16 }}>
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
        // 画面読み込み時に /api/version を叩いてバッジに反映
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
