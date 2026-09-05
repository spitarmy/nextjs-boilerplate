import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabaseServer";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("purchase_ledger")
    .select("*")
    .eq("user_id", user.id)
    .order("purchase_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // 重複チェック用ヘルパー
  const checkDuplicate = async (item_name: string, purchase_date: string, purchase_price: number) => {
    const { data } = await supabaseAdmin
      .from("purchase_ledger")
      .select("id")
      .eq("user_id", user.id)
      .eq("item_name", item_name)
      .eq("purchase_date", purchase_date)
      .eq("purchase_price", purchase_price)
      .limit(1);
    return (data && data.length > 0);
  };

  if (body.batch && Array.isArray(body.items)) {
    const {
      seller_name,
      seller_address,
      seller_age,
      seller_occupation,
      id_verification,
      transaction_type = '買受け',
      items
    } = body;
    
    // 重複を除外
    const rowsToInsert = [];
    const skipped = [];
    for (const item of items) {
      const date = item.purchase_date || new Date().toISOString().split('T')[0];
      const isDup = await checkDuplicate(item.item_name, date, item.purchase_price);
      if (isDup) {
        skipped.push(item.item_name);
      } else {
        rowsToInsert.push({
          user_id: user.id,
          seller_name,
          seller_address,
          seller_age,
          seller_occupation,
          id_verification,
          transaction_type,
          item_name: item.item_name,
          item_description: item.item_description,
          quantity: item.quantity,
          purchase_price: item.purchase_price,
          purchase_date: date,
          appraisal_id: item.appraisal_id || null,
        });
      }
    }

    if (rowsToInsert.length === 0) {
      return NextResponse.json({ data: [], skipped, message: "全て登録済みです" });
    }
    
    const { data, error } = await supabaseAdmin
      .from("purchase_ledger")
      .insert(rowsToInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data, skipped });
  }

  const { 
    appraisal_id, 
    item_name, 
    item_description, 
    quantity, 
    purchase_price, 
    seller_name, 
    seller_address, 
    seller_age,
    seller_occupation,
    id_verification,
    transaction_type = '買受け',
    purchase_date
  } = body;

  const date = purchase_date || new Date().toISOString().split('T')[0];

  // 重複チェック
  const isDup = await checkDuplicate(item_name, date, purchase_price);
  if (isDup) {
    return NextResponse.json({ error: "同じ品目・日付・金額の台帳記録が既に存在します", duplicate: true }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("purchase_ledger")
    .insert([{
      user_id: user.id,
      appraisal_id,
      item_name,
      item_description,
      quantity,
      purchase_price,
      purchase_date: date,
      seller_name,
      seller_address,
      seller_age,
      seller_occupation,
      id_verification,
      transaction_type
    }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function DELETE(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("purchase_ledger")
    .delete()
    .match({ id, user_id: user.id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
