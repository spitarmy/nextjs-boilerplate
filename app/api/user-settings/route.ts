import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ★ サーバーサイドでuser_idを取得するヘルパー
async function getAuthUserId(fallbackId?: string | null): Promise<string | null> {
  try {
    const supabaseAuth = createSupabaseServerClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (user?.id) return user.id;
  } catch { /* fallback */ }
  return fallbackId ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = await getAuthUserId(searchParams.get("user_id"));

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,allow_training,plan")
      .eq("id", user_id)
      .maybeSingle();

    if (error) {
      console.error("profiles select error", error);
      return NextResponse.json({ ok: false, error: "設定の取得に失敗しました。" }, { status: 500 });
    }

    const allow_training = Boolean(data?.allow_training);
    const plan = data?.plan === "pro" ? "pro" : "light";
    return NextResponse.json({ ok: true, settings: { allow_training, plan } }, { status: 200 });
  } catch (e: any) {
    console.error("user-settings GET error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "エラーが発生しました。" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "JSON形式のリクエストを送ってください。" }, { status: 400 });
    }

    const bodyUserId =
      typeof body.user_id === "string" && body.user_id.trim().length > 0 ? body.user_id.trim() : null;
    const user_id = await getAuthUserId(bodyUserId);

    const allow_training = Boolean(body.allow_training);

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    const { error } = await supabase
      .from("profiles")
      .upsert([{ id: user_id, allow_training }], { onConflict: "id" });

    if (error) {
      console.error("profiles upsert error", error);
      return NextResponse.json({ ok: false, error: "設定の更新に失敗しました。" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: { allow_training } }, { status: 200 });
  } catch (e: any) {
    console.error("user-settings POST error", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "エラーが発生しました。" }, { status: 500 });
  }
}
