import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfMonthISO(d = new Date()): string {
  const dt = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  return dt.toISOString();
}

function isAdmin(userId: string | null): boolean {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  const admins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return !!userId && admins.includes(userId);
}

export async function GET() {
  try {
    // cookieセッション前提：ログインユーザー取得
    let viewerId: string | null = null;
    try {
      const supabaseAuth = createSupabaseServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      viewerId = user?.id ?? null;
    } catch { /* fallback */ }

    if (!isAdmin(viewerId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const from = startOfMonthISO();

    const { data, error } = await supabaseAdmin
      .from("usage_events")
      .select("user_id, units, is_overage, assess_mode, listing_mode, created_at")
      .gte("created_at", from)
      .limit(200000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const map = new Map<
      string,
      {
        user_id: string;
        used_units: number;
        overage_units: number;
        normal_units: number;
        bundle_units: number;
        flea_units: number;
        auction_units: number;
        events: number;
        last_used_at: string | null;
      }
    >();

    for (const r of data ?? []) {
      const uid = (r as any).user_id as string | null;
      if (!uid) continue;

      const units = Number((r as any).units ?? 0);
      const over = Boolean((r as any).is_overage);
      const assess_mode = ((r as any).assess_mode ?? "normal") as string;
      const listing_mode = ((r as any).listing_mode ?? "") as string;
      const created = typeof (r as any).created_at === "string" ? (r as any).created_at : null;

      if (!map.has(uid)) {
        map.set(uid, {
          user_id: uid,
          used_units: 0,
          overage_units: 0,
          normal_units: 0,
          bundle_units: 0,
          flea_units: 0,
          auction_units: 0,
          events: 0,
          last_used_at: null,
        });
      }

      const row = map.get(uid)!;
      row.used_units += units;
      if (over) row.overage_units += units;

      if (assess_mode === "bundle") row.bundle_units += units;
      else row.normal_units += units;

      if (listing_mode === "flea") row.flea_units += units;
      if (listing_mode === "auction") row.auction_units += units;

      row.events += 1;

      if (!row.last_used_at || (created && created > row.last_used_at)) {
        row.last_used_at = created;
      }
    }

    const rows = Array.from(map.values()).sort((a, b) => b.used_units - a.used_units);

    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "admin usage error" }, { status: 500 });
  }
}
