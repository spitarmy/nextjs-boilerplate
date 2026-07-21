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
  const [userPlan, setUserPlan] = useState<"light" | "pro">("light");

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

    // プラン取得
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data.user?.id;
        if (!uid) return;
        const res = await fetch(`/api/usage?user_id=${encodeURIComponent(uid)}`);
        const json = await res.json();
        if (json?.plan) setUserPlan(json.plan);
      } catch { /* ignore */ }
    })();
  }, []);

  const downloadCSV = () => {
    if (items.length === 0) return;
    
    // ヘッダー
    const header = ["日時", "ジャンル", "型名", "信頼度(%)", "タイトル", "査定コメント"].join(",");
    
    // データ行
    const rows = items.map(a => {
      const date = new Date(a.created_at).toLocaleString("ja-JP");
      const genre = `"${a.genre || ""}"`;
      const item_name = `"${a.item_name || ""}"`;
      const confidence = a.confidence || "";
      const title = `"${(a.mercari_title || "").replace(/"/g, '""')}"`;
      const output = `"${(a.output_text || "").replace(/"/g, '""')}"`;
      
      return [date, genre, item_name, confidence, title, output].join(",");
    });

    const csvContent = [header, ...rows].join("\n");
    // BOM付きUTF-8
    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `査定履歴_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="/assess"
            style={{
              fontSize: 18,
              textDecoration: "none",
              color: "#4b5563",
              background: "#f3f4f6",
              padding: "4px 8px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32
            }}
            title="査定画面に戻る"
          >
            ←
          </a>
          <h1 style={{ fontSize: 20, margin: 0 }}>査定履歴</h1>
        </div>
        
        {userPlan === "pro" ? (
          <button
            onClick={downloadCSV}
            disabled={items.length === 0}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              backgroundColor: items.length === 0 ? "#9ca3af" : "#10b981",
              border: "none",
              padding: "8px 16px",
              borderRadius: 6,
              cursor: items.length === 0 ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6
            }}
          >
            📥 CSV出力
          </button>
        ) : (
          <span style={{
            fontSize: 11,
            color: "#9ca3af",
            background: "#f3f4f6",
            padding: "6px 12px",
            borderRadius: 6,
          }}>
            🔒 CSV出力はPRO限定
          </span>
        )}
      </div>

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
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8
              }}
            >
              <span>ジャンル: {a.genre ?? "不明"}</span>
              <span>／</span>
              <span>型名: {a.item_name ?? "不明"}</span>
              <span>／</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                信頼度: 
                {a.confidence != null ? (
                  <span style={{
                    backgroundColor: a.confidence >= 80 ? "#dcfce7" : a.confidence >= 60 ? "#fef08a" : "#fee2e2",
                    color: a.confidence >= 80 ? "#166534" : a.confidence >= 60 ? "#854d0e" : "#991b1b",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontWeight: 700,
                    fontSize: 11
                  }}>
                    {a.confidence >= 80 ? "🟢高" : a.confidence >= 60 ? "🟡中" : "🔴低"} ({a.confidence}%)
                  </span>
                ) : (
                  "不明"
                )}
              </span>
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
