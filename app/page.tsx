// app/page.tsx
"use client";
export const dynamic = "force-dynamic";


export default function RootPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>これはテストページです</h1>
      <p>/app/page.tsx が反映されています。</p>
      <a href="/login">ログインページへ</a>
    </main>
  );
}
