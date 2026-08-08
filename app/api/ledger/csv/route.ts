import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabaseServer";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("purchase_ledger")
    .select("*")
    .eq("user_id", user.id)
    .order("purchase_date", { ascending: false });

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  const headers = ["取引年月日", "品目", "特徴", "数量", "買取金額(円)", "相手方氏名", "相手方住所", "本人確認方法"];
  
  const rows = data?.map(row => [
    row.purchase_date,
    `"${(row.item_name || "").replace(/"/g, '""')}"`,
    `"${(row.item_description || "").replace(/"/g, '""')}"`,
    row.quantity,
    row.purchase_price,
    `"${(row.seller_name || "").replace(/"/g, '""')}"`,
    `"${(row.seller_address || "").replace(/"/g, '""')}"`,
    `"${(row.id_verification || "").replace(/"/g, '""')}"`
  ]) || [];

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  const bom = "\uFEFF";
  
  const date = new Date().toISOString().split("T")[0];
  const filename = `古物台帳_${date}.csv`;

  return new NextResponse(bom + csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
