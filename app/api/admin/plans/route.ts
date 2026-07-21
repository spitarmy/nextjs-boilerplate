import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(userId: string | null): boolean {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  const admins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return !!userId && admins.includes(userId);
}

// GET: 全ユーザーのプラン一覧
export async function GET() {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });

    if (!isAdmin(authData.user?.id ?? null)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, plan, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, users: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}

// POST: プラン変更
export async function POST(req: NextRequest) {
  try {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });

    if (!isAdmin(authData.user?.id ?? null)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });

    const targetUserId = typeof body.user_id === "string" ? body.user_id.trim() : null;
    const newPlan = body.plan === "pro" ? "pro" : body.plan === "light" ? "light" : null;

    if (!targetUserId || !newPlan) {
      return NextResponse.json({ ok: false, error: "user_id と plan (light|pro) が必要です。" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plan: newPlan })
      .eq("id", targetUserId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, user_id: targetUserId, plan: newPlan });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}
