// app/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase"; // ★ UploadForm.tsx と同じ import パス

type Appraisal = {
  id: string;
  created_at: string;
  mercari_title: string | null;
  output_text: string | null;
  confidence: number | null;
  genre: string | null;
  item_name: string | null;
};

export default function HistoryPage() {
  const [items, setItems] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setErrorMsg(null);

      const { data, error } = await supabase
        .from("appraisals")
        .select(
          "id, created_at, mercari_title, output_text, confidence, genre, item_name"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error(error);
        setErrorMsg("査定履歴の取得に失敗しました。");
      } else {
        setItems((data as Appraisal[]) ?? []);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>査定履歴</h1>

      {loading && <p>読み込み中...</p>}

      {errorMsg && (
        <p style={{ color: "#b91c1c", fontSize: 14, marginBottom: 12 }}>
          {errorMsg}
        </p>
      )}

      {!loading && !errorMsg && items.length === 0 && (
        <p style={{ fontSize: 14 }}>まだ査定履歴がありません。</p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((a) => (
          <div
            key={a.id}
            style={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              padding: 12,
              background: "#f9fafb",
            }}
          >
            {/* 日付 */}
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>
                {new Date(a.created_at).toLocaleString("ja-JP", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>

            {/* タイトル */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {a.mercari_title || "（タイトル未設定）"}
            </div>

            {/* ジャンル／型名／信頼度 */}
            <div
              style={{
                fontSize: 12,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              ジャンル: {a.genre ?? "不明"} ／ 型名: {a.item_name ?? "不明"} ／
              信頼度: {a.confidence != null ? `${a.confidence}%` : "不明"}
            </div>

            {/* 査定コメント */}
            {a.output_text && (
              <div
                style={{
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {a.output_text}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
