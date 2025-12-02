// app/layout.tsx
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "カンテノ｜Webカンテノ査定",
  description: "画像から真贋・相場・メルカリ出品文を自動生成する査定AIシステム",
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
            "radial-gradient(circle at top, #f9fafb 0, #eef2ff 35%, #e5e7eb 100%)",
          color: "#111827",
          fontFamily:
            'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* 全体ラッパー */}
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ヘッダー（明るい＆フラット） */}
          <header
            style={{
              backgroundColor: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              boxShadow: "0 4px 12px rgba(15,23,42,0.04)",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            <div
              style={{
                maxWidth: 1040,
                margin: "0 auto",
                padding: "10px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              {/* 左：ロゴ＋サービス名 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
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
                      width: "80%",
                      height: "80%",
                      objectFit: "contain",
                    }}
                  />
                </div>
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
                      color: "#6b7280",
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                    }}
                  >
                    KANTEI × KNOW
                  </div>
                </div>
              </div>

              {/* 右：サブタイトル */}
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  letterSpacing: "0.08em",
                  textAlign: "right",
                  whiteSpace: "nowrap",
                }}
              >
                Webカンテノ｜査定AIコンソール
              </div>
            </div>
          </header>

          {/* コンテンツエリア（明るい背景） */}
          <main
            style={{
              flex: 1,
              padding: "28px 16px 40px",
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
