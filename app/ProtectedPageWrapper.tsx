// app/ProtectedPageWrapper.tsx
"use client";

import { useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type Props = {
  children: ReactNode;
};

export default function ProtectedPageWrapper({ children }: Props) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data, error } = await supabase.auth.getUser();

      // 1) エラー or ユーザーなし → /login に飛ばす
      if (error || !data.user) {
        router.push("/login");
        return;
      }

      // 2) ユーザーがいれば表示OK
      setChecking(false);
    };

    checkAuth();
  }, [router]);

  if (checking) {
    // ローディング中に一瞬だけ出す文言（なんでもOK）
    return (
      <main style={{ padding: 24 }}>
        <p>ログイン状態を確認しています...</p>
      </main>
    );
  }

  return <>{children}</>;
}
