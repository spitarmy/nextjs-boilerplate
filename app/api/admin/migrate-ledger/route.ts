import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (token !== "kanteno-ledger-migrate-2026") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // まずテーブルが既に存在するか確認
  const { error: checkErr } = await supabaseAdmin
    .from("purchase_ledger")
    .select("id")
    .limit(1);

  if (!checkErr) {
    return NextResponse.json({ ok: true, message: "purchase_ledger テーブルは既に存在します" });
  }

  // テーブルが存在しない → Supabase SQL HTTP APIで作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const sql = `
CREATE TABLE IF NOT EXISTS purchase_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  appraisal_id UUID,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  item_name TEXT NOT NULL,
  item_description TEXT,
  quantity INTEGER DEFAULT 1,
  purchase_price INTEGER NOT NULL,
  seller_name TEXT,
  seller_address TEXT,
  id_verification TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE purchase_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "service_role_all" ON purchase_ledger FOR ALL USING (true) WITH CHECK (true);
  `;

  const results: string[] = [];

  // 方法1: Supabase SQL API (/pg/query) を試行
  try {
    const pgRes = await fetch(`${supabaseUrl}/pg/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (pgRes.ok) {
      results.push("pg/query: テーブル作成成功");
      return NextResponse.json({ ok: true, results });
    }
    const pgText = await pgRes.text();
    results.push(`pg/query: ${pgRes.status} - ${pgText.slice(0, 200)}`);
  } catch (e: any) {
    results.push(`pg/query: error - ${e?.message}`);
  }

  // 方法2: Supabase REST SQL endpoint を試行
  try {
    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (sqlRes.ok) {
      results.push("rpc/exec_sql: テーブル作成成功");
      return NextResponse.json({ ok: true, results });
    }
    const sqlText = await sqlRes.text();
    results.push(`rpc/exec_sql: ${sqlRes.status} - ${sqlText.slice(0, 200)}`);
  } catch (e: any) {
    results.push(`rpc/exec_sql: error - ${e?.message}`);
  }

  // 方法3: Supabase Management API を試行
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
  try {
    const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    if (mgmtRes.ok) {
      results.push("management API: テーブル作成成功");
      return NextResponse.json({ ok: true, results });
    }
    const mgmtText = await mgmtRes.text();
    results.push(`management API: ${mgmtRes.status} - ${mgmtText.slice(0, 200)}`);
  } catch (e: any) {
    results.push(`management API: error - ${e?.message}`);
  }

  return NextResponse.json({
    ok: false,
    error: "自動テーブル作成ができませんでした",
    attempts: results,
    manual_sql: sql.trim(),
  });
}
