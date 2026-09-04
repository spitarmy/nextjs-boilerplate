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
    
    const rowsToInsert = items.map((item: any) => ({
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
      purchase_date: item.purchase_date || new Date().toISOString().split('T')[0],
      appraisal_id: item.appraisal_id || null,
    }));
    
    const { data, error } = await supabaseAdmin
      .from("purchase_ledger")
      .insert(rowsToInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
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
    transaction_type = '買受け'
  } = body;

  const { data, error } = await supabaseAdmin
    .from("purchase_ledger")
    .insert([{
      user_id: user.id,
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
