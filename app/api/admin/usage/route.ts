import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../lib/supabase";

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

export async function GET(req: NextRequest) {
  try {
    // 1) ログインユーザー取得（cookieセッション前提）
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    }

    const viewerId = authData.user?.id ?? null;
    if (!isAdmin(viewerId)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // 2) 今月の usage_events を引く
    const from = startOfMonthISO();

    const { data, error } = await supabase
      .from("usage_events")
      .select("user_id, units, is_overage, assess_mode, listing_mode, created_at")
      .gte("created_at", from)
      .limit(200000);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // 3) user_id ごとに集計
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
      const uid = r.user_id as string | null;
      if (!uid) continue;

      const units = Number(r.units ?? 0);
      const over = Boolean(r.is_overage);
      const assess_mode = (r.assess_mode ?? "normal") as string;
      const listing_mode = (r.listing_mode ?? "") as string;
      const created = typeof r.created_at === "string" ? r.created_at : null;

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

    const rows = Array.from(map.values())
      .map((r) => ({
        ...r,
        used_units: Number(r.used_units.toFixed(1)),
        overage_units: Number(r.overage_units.toFixed(1)),
        normal_units: Number(r.normal_units.toFixed(1)),
        bundle_units: Number(r.bundle_units.toFixed(1)),
        flea_units: Number(r.flea_units.toFixed(1)),
        auction_units: Number(r.auction_units.toFixed(1)),
      }))
      .sort((a, b) => b.used_units - a.used_units);

    return NextResponse.json({ ok: true, rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "admin usage error" }, { status: 500 });
  }
}
