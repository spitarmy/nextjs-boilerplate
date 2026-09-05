// app/layout.tsx
import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "カンテノ｜Webカンテノ査定",
  description: "画像から真贋・相場・フリマサイト出品文を自動生成する査定AIシステム",
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
          background:
            "radial-gradient(circle at top, #fafafa 0%, #eef2ff 35%, #e5e7eb 100%)",
          color: "#111827",
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
          {/* ==========================
              ヘッダー
            ========================== */}
          <header
            style={{
              backgroundColor: "#ffffffcc",
              backdropFilter: "blur(12px)",
              borderBottom: "1px solid #e5e7eb",
              position: "sticky",
              top: 0,
              zIndex: 20,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                maxWidth: 1040,
                margin: "0 auto",
                padding: "12px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              {/* 左：ロゴ＋テキスト */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {/* ロゴ枠 */}
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="/kanteno-logo.png"
                    alt="カンテノ ロゴ"
                    style={{
                      width: "85%",
                      height: "85%",
                      objectFit: "contain",
                    }}
                  />
                </div>

                {/* カンテノ */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                    }}
                  >
                    カンテノ
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6b7280",
                      letterSpacing: "0.18em",
                      marginTop: 1,
                    }}
                  >
                    KANTEI × KNOW
                  </span>
                </div>
              </div>

              {/* 右：サブタイトル（スマホ対応） */}
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                }}
              >
                Webカンテノ｜査定AIコンソール
              </div>
            </div>
          </header>

          {/* ==========================
              メインコンテンツ
            ========================== */}
          <main
            style={{
              flex: 1,
              padding: "24px 14px 40px",
            }}
          >
            <div
              style={{
                maxWidth: 1040,
                margin: "0 auto",
              }}
            >
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
