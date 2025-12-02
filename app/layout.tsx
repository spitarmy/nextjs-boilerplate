// app/layout.tsx
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "カンテノ｜Webカンテノ査定",
  description: "画像から真贋＋相場＋出品文を生成する査定AIシステム",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#020617", // ほぼ黒のダークネイビー
          color: "#e5e7eb", // 明るめグレー
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* 共通ヘッダー */}
          <header
            style={{
              borderBottom: "1px solid rgba(148,163,184,0.25)",
              background:
                "linear-gradient(to right, rgba(15,23,42,0.9), rgba(15,23,42,0.98))",
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                maxWidth: 1040,
                margin: "0 auto",
                padding: "14px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <img
                  src="/kanteno-logo.png"
                  alt="カンテノ ロゴ"
                  style={{
                    width: 40,
                    height: 40,
                    objectFit: "contain",
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                    }}
                  >
                    カンテノ
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}
                  >
                    KANTEI × KNOW
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  letterSpacing: "0.08em",
                }}
              >
                Webカンテノ｜査定AIコンソール
              </div>
            </div>
          </header>

          {/* コンテンツエリア */}
          <main
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              padding: "32px 16px 40px",
            }}
          >
            <div style={{ width: "100%", maxWidth: 1040 }}>{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
