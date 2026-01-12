import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET: ?user_id=xxx で取得
 * POST: { user_id, allow_training } で更新
 *
 * 注意：
 * - 現状のあなたの構成は「サーバー側で service role ではなく通常 supabase client」を使ってそうなので
 *   RLSが緩いと誰でも更新できる危険がある。
 * - ここではまず動く形（あなたの既存 /api/usage と同系統）で提示。
 * - 本番は RLS + サーバー側で auth 検証（推奨）。
 */

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get("user_id");

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id,allow_training")
      .eq("id", user_id)
      .maybeSingle();

    if (error) {
      console.error("profiles select error", error);
      return NextResponse.json({ ok: false, error: "設定の取得に失敗しました。" }, { status: 500 });
    }

    // profilesが無い場合は default false 扱い
    const allow_training = Boolean(data?.allow_training);

    return NextResponse.json({ ok: true, settings: { allow_training } }, { status: 200 });
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

    const user_id =
      typeof body.user_id === "string" && body.user_id.trim().length > 0 ? body.user_id.trim() : null;

    const allow_training = Boolean(body.allow_training);

    if (!user_id) {
      return NextResponse.json({ ok: false, error: "user_id がありません。" }, { status: 400 });
    }

    // profiles 行がなければ upsert で作る
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
