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
  const { data, error: checkErr } = await supabaseAdmin
    .from("purchase_ledger")
    .select("id")
    .limit(1);

  if (!checkErr) {
    return NextResponse.json({ ok: true, message: "purchase_ledger テーブルは既に存在します", rows: data?.length ?? 0 });
  }

  // テーブルが存在しない場合 → Supabase Management APIでSQL実行を試行
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // URLからproject refを抽出 (e.g. https://xxxxx.supabase.co → xxxxx)
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
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
  `;

  try {
    // Supabase SQL API endpoint (service_role key で認証)
    const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ name: "exec_sql", args: { query: sql } }),
    });

    if (sqlRes.ok) {
      return NextResponse.json({ ok: true, message: "テーブル作成成功" });
    }

    // RPCが使えない場合は手動SQL実行の案内を返す
    return NextResponse.json({
      ok: false,
      error: "自動テーブル作成ができませんでした",
      manual_sql: sql.trim(),
      instructions: "Supabase SQL Editor で上記SQLを実行してください",
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "migration error",
      manual_sql: sql.trim(),
      instructions: "Supabase SQL Editor で上記SQLを実行してください",
    });
  }
}
