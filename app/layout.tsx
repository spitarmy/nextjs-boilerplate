// app/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "kante-no",
  description: "kante-no app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
