// app/api/auth/after-signup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, email, name } = body as {
      userId: string;
      email: string;
      name?: string;
    };

    if (!userId || !email) {
      return NextResponse.json(
        { ok: false, error: "userId または email が不足しています。" },
        { status: 400 }
      );
    }

    // 1) tenants を作成（初期 seats_limit = 1）
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: name || email,
        owner_user_id: userId,
        seats_limit: 1,
      })
      .select("*")
      .single();

    if (tenantError || !tenant) {
      console.error("create tenant error", tenantError);
      return NextResponse.json(
        { ok: false, error: "テナントの作成に失敗しました。" },
        { status: 500 }
      );
    }

    // 2) profiles を作成
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: userId,
        email,
        name: name || null,
        tenant_id: tenant.id,
        role: "owner",
      });

    if (profileError) {
      console.error("create profile error", profileError);
      return NextResponse.json(
        { ok: false, error: "プロフィールの作成に失敗しました。" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error("after-signup error", e);
    return NextResponse.json(
      { ok: false, error: "after-signup でエラーが発生しました。" },
      { status: 500 }
    );
  }
}
