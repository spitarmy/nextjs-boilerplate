import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // user_idをクエリパラメータから取得（台帳ページから渡される）
    const url = new URL(req.url);
    const user_id = url.searchParams.get("user_id");

    if (!user_id) {
      return new NextResponse("user_idが必要です", { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("purchase_ledger")
      .select("*")
      .eq("user_id", user_id)
      .order("purchase_date", { ascending: false });

    if (error) {
      return new NextResponse(error.message, { status: 500 });
    }

    const headers = ["取引年月日", "取引区分", "品目", "特徴", "数量", "買取金額(円)", "相手方氏名", "相手方年齢", "相手方職業", "相手方住所", "本人確認方法"];
    
    const rows = (data ?? []).map((row: any) => [
      row.purchase_date || "",
      `"${(row.transaction_type || "買受け").replace(/"/g, '""')}"`,
      `"${(row.item_name || "").replace(/"/g, '""')}"`,
      `"${(row.item_description || "").replace(/"/g, '""')}"`,
      row.quantity ?? 1,
      row.purchase_price ?? 0,
      `"${(row.seller_name || "").replace(/"/g, '""')}"`,
      row.seller_age ?? "",
      `"${(row.seller_occupation || "").replace(/"/g, '""')}"`,
      `"${(row.seller_address || "").replace(/"/g, '""')}"`,
      `"${(row.id_verification || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.join(","))
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
  } catch (e: any) {
    return new NextResponse(e?.message || "CSV生成エラー", { status: 500 });
  }
}
