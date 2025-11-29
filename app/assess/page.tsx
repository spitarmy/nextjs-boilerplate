// app/assess/page.tsx
"use client";

import UploadForm from "../components/UploadForm";
import LogoutButton from "../components/LogoutButton"; // ← 追加

export default function AssessPage() {
  return (
    <main style={{ padding: 16, maxWidth: 800, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>査定する</h2>

        {/* 右側：バージョン + ログアウト */}
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
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
            }}
          >
            v?
          </span>

          {/* ログアウトボタン */}
          <LogoutButton />
        </div>
      </div>

      <p
        style={{
          fontSize: 12,
          color: "#4b5563",
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        ※ 最大 <b>3枚</b> までアップロードできます。長辺 1024px 程度・JPEG 推奨。
        <br />
        ※ 画像が大きすぎると「FUNCTION_PAYLOAD_TOO_LARGE（413）」エラーになります。
      </p>

      <UploadForm />

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (async function(){
              try{
                const r = await fetch('/api/version');
                const j = await r.json();
                var el = document.getElementById('version-badge');
                if (!el) return;
                el.textContent = j.ok && j.version ? j.version : 'v?';
              }catch(e){}
            })();
          `,
        }}
      />
    </main>
  );
}
