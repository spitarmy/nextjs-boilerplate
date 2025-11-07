// app/api/reindex/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/embeddings";

// （任意）Node実行を明示
export const runtime = "nodejs";

// Service Role キーでサーバーサイドの Supabase クライアントを作成
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ←さっき Vercel に追加したやつ
);

export async function GET() {
  try {
    // まだ embedding が無いレコードを取得（バッチで20件ずつ）
    const { data: rows, error: fetchError } = await supabase
      .from("kb_refs")
      .select("*")
      .is("embedding", null)
      .limit(20);

    if (fetchError) throw fetchError;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ message: "✅ 全レコードに embedding 済みです。" });
    }

    // 埋め込み用にテキストをまとめ → OpenAI で embedding 生成
    const updates = await Promise.all(
      rows.map(async (row) => {
        const text = [
          row.brand_or_author,
          row.model_or_series,
          row.item_type,
          row.material,
          row.hallmark,
          row.period,
          row.region,
          row.tags,
          row.desc_short,
          row.desc_long,
        ]
          .filter(Boolean)
          .join(" / ");

        const embedding = await embedText(text);

        return { id: row.id, embedding };
      })
    );

    // まとめて upsert
    const { error: updateError } = await supabase.from("kb_refs").upsert(updates);
    if (updateError) throw updateError;

    return NextResponse.json({
      message: `✅ ${updates.length} 件の embedding を更新しました。`,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
