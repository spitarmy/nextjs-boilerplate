import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UserPlan = "light" | "pro";
const PLAN_LIMITS: Record<UserPlan, number | null> = {
  light: 100,
  pro: null,
};

function startOfMonthISO(d = new Date()): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return dt.toISOString();
}

export async function GET(req: NextRequest) {
  try {
    // ★ サーバーサイド認証
    let user_id: string | null = null;
    try {
      const supabaseAuth = createSupabaseServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      user_id = user?.id ?? null;
    } catch { /* fallback */ }

    // フォールバック: クエリパラメータ（認証が効かない場合用）
    if (!user_id) {
      const url = new URL(req.url);
      user_id = url.searchParams.get("user_id");
    }

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    // プランを取得
    let plan: UserPlan = "light";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan")
        .eq("id", user_id)
        .maybeSingle();
      if (profile?.plan === "pro") plan = "pro";
    } catch { /* default to light */ }

    const planLimit = PLAN_LIMITS[plan];

    const from = startOfMonthISO();

    const { data, error } = await supabaseAdmin
      .from("usage_events")
      .select("units,is_overage,created_at")
      .eq("user_id", user_id)
      .gte("created_at", from)
      .limit(5000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let used = 0;
    for (const r of data ?? []) {
      used += Number(r.units ?? 0);
    }

    return NextResponse.json(
      {
        ok: true,
        plan,
        usage: {
          used_units: Number(used.toFixed(1)),
          limit_units: planLimit,
          overage_units: 0,
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "usage error" }, { status: 500 });
  }
}
