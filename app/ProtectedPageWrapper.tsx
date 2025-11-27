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
      // 現在のセッション取得（ユーザーがログインしているか）
      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        // セッションなし → /login に飛ばす
        router.push("/login");
        return;
      }

      // セッションあり → 子供（査定画面）を表示してOK
      setChecking(false);
    };

    checkAuth();
  }, [router]);

  if (checking) {
    // チェック中に一瞬だけ表示される
    return (
      <main style={{ padding: 24 }}>
        <p>ログイン状態を確認しています...</p>
      </main>
    );
  }

  return <>{children}</>;
}
