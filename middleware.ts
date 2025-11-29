// middleware.ts（プロジェクト直下に新規作成）

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. ルート "/" に来た人は必ず /login に飛ばす
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 2. 将来ここで、「ログインしてない人は /login へ」など
  //    課金状態や同時ログイン数チェックも入れられる
  return NextResponse.next();
}

// この middleware をどのパスに適用するか
export const config = {
  matcher: ["/", "/assess/:path*"], // 必要なら他のパスも足して OK
};
