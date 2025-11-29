// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// 今は何もしないミドルウェア
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

// どのパスにもマッチさせない
export const config = {
  matcher: [],
};
