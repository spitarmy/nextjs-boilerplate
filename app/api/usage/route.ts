import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MONTHLY_LIMIT_UNITS = 1500;

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

    const from = startOfMonthISO();

    const { data, error } = await supabase
      .from("usage_events")
      .select("units,is_overage,created_at")
      .eq("user_id", user_id)
      .gte("created_at", from)
      .limit(5000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let used = 0;
    let over = 0;
    for (const r of data ?? []) {
      const u = Number(r.units ?? 0);
      used += u;
      if (r.is_overage) over += u;
    }

    return NextResponse.json(
      {
        ok: true,
        usage: {
          used_units: Number(used.toFixed(1)),
          limit_units: MONTHLY_LIMIT_UNITS,
          overage_units: Number(over.toFixed(1)),
        },
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "usage error" }, { status: 500 });
  }
}
