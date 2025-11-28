// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadForm from "./components/UploadForm";

type AuthStatus = "checking" | "ok";

export default function Page() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    // ブラウザ以外では何もしない
    if (typeof window === "undefined") return;

    // 強制的に localStorage をチェック
    const loggedIn = window.localStorage.getItem("kanteno_logged_in");

    if (!loggedIn) {
      // 未ログインなら必ず /login に飛ばす
      window.location.href = "/login";
      return;
    }

    // ログイン済み
    setStatus("ok");
  }, []);

  // チェック中は真っ白に見えないように簡単な表示
  if (status !== "ok") {
    return (
      <main style={{ padding: 16 }}>
        <p>ログイン状態を確認中です…</p>
      </main>
    );
  }

  // ここまで来たら査定画面を表示
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

        {/* ここにログアウトボタン */}
        <a
          href="/logout"
          style={{
            fontSize: 12,
            textDecoration: "underline",
            cursor: "pointer",
          }}
        >
          ログアウト
        </a>
      </div>

      <UploadForm />

      {/* バージョンバッジ（必要なら残す） */}
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
