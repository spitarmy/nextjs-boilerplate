import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let user_id: string | null = null;
    try {
      const supabaseAuth = createSupabaseServerClient();
      const { data: { user } } = await supabaseAuth.auth.getUser();
      user_id = user?.id ?? null;
    } catch { /* fallback */ }

    if (!user_id) {
      const url = new URL(req.url);
      user_id = url.searchParams.get("user_id");
    }

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("appraisals")
      .select("id, created_at, mercari_title, output_text, confidence, genre, item_name, image_urls")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
