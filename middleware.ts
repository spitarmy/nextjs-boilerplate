import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッションをリフレッシュ（期限切れトークンの自動更新）
  const { data: { user } } = await supabase.auth.getUser();

  // ===== 24時間セッション有効期限チェック =====
  const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24時間
  const LOGIN_TS_COOKIE = "kanteno_login_ts";
  const { pathname } = request.nextUrl;

  if (user) {
    const loginTs = request.cookies.get(LOGIN_TS_COOKIE)?.value;
    const now = Date.now();

    if (!loginTs) {
      // ログイン時刻が未記録 → 現在時刻を記録
      supabaseResponse.cookies.set(LOGIN_TS_COOKIE, String(now), {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24, // 24時間
      });
    } else if (now - Number(loginTs) > SESSION_MAX_AGE_MS) {
      // 24時間経過 → セッション強制失効
      await supabase.auth.signOut();
      // ログイン時刻クッキーも削除
      supabaseResponse.cookies.set(LOGIN_TS_COOKIE, "", {
        path: "/",
        maxAge: 0,
      });

      // APIリクエストの場合は401を返す
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { ok: false, error: "セッションの有効期限が切れました。再度ログインしてください。" },
          { status: 401 }
        );
      }
      // ページリクエストの場合はログインページへリダイレクト
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("expired", "1");
      return NextResponse.redirect(loginUrl);
    }
  }

  // APIルートの認証チェック（/api/auth/* と /api/upload-url は除外）
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/upload-url") &&
    !pathname.startsWith("/api/assess/worker") && // workerは独自認証
    !pathname.startsWith("/api/keepalive") && // cronは認証不要
    !pathname.startsWith("/api/admin/migrate") // ワンタイム移行（トークン認証）
  ) {
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "認証が必要です。再ログインしてください。" },
        { status: 401 }
      );
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // 静的ファイル・画像・favicon以外の全パスに適用
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
