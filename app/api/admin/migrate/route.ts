// ワンタイム移行API: planカラム追加 + 既存ユーザーをproに設定
// 実行後は削除してください
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_SECRET = "kanteno-plan-migrate-2026";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (token !== MIGRATION_SECRET) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 403 });
  }

  const results: string[] = [];

  try {
    // 1) planカラムを追加（既にあればスキップ）
    const { error: alterErr } = await supabaseAdmin.rpc("exec_sql", {
      query: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'light'"
    }).maybeSingle();

    // rpcが使えない場合はsupabaseAdmin直接で試す
    if (alterErr) {
      results.push(`ALTER via rpc failed: ${alterErr.message}, trying direct approach...`);
      
      // 直接profilesテーブルの構造を確認
      const { data: checkData, error: checkErr } = await supabaseAdmin
        .from("profiles")
        .select("id, plan")
        .limit(1);

      if (checkErr && checkErr.message.includes("plan")) {
        results.push("plan column does not exist yet - needs manual SQL execution");
        return NextResponse.json({ 
          ok: false, 
          results,
          manual_sql: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'light'; UPDATE profiles SET plan = 'pro';",
          error: "planカラムがまだ存在しません。Supabase SQL Editorで上のSQLを実行してください。"
        });
      } else if (checkErr) {
        results.push(`Check error: ${checkErr.message}`);
      } else {
        results.push("plan column already exists!");
        
        // 2) 既存ユーザーをproに更新
        const { data: updateData, error: updateErr } = await supabaseAdmin
          .from("profiles")
          .update({ plan: "pro" })
          .neq("plan", "pro");

        if (updateErr) {
          results.push(`Update error: ${updateErr.message}`);
        } else {
          results.push("All existing users updated to pro plan!");
        }
      }
    } else {
      results.push("ALTER TABLE succeeded via rpc");

      // 2) 既存ユーザーをproに更新
      const { error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update({ plan: "pro" })
        .neq("plan", "pro");

      if (updateErr) {
        results.push(`Update error: ${updateErr.message}`);
      } else {
        results.push("All existing users updated to pro plan!");
      }
    }

    // 3) 結果確認
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, name, plan")
      .limit(50);

    return NextResponse.json({ 
      ok: true, 
      results, 
      profiles: profiles ?? [],
      profileErr: profileErr?.message ?? null
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "migration error", results }, { status: 500 });
  }
}
