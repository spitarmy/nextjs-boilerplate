// middleware.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 何もしないで、そのまま次の処理へ進ませる
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

// （config が書いてあっても消してOK / 残っていても動きは同じです）
