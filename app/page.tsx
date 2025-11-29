// app/page.tsx
"use client";

// 既にある /app/login/page.tsx をそのまま再利用する
import LoginPage from "./login/page";

export default function RootPage() {
  return <LoginPage />;
}
