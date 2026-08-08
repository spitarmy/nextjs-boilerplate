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

  // 購入フォーム用state
  const [purchaseTarget, setPurchaseTarget] = useState<string | null>(null); // appraisal.id
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [idVerification, setIdVerification] = useState("");
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

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

  const handlePurchaseSubmit = async (appraisal: Appraisal) => {
    if (!purchasePrice || isNaN(Number(purchasePrice))) {
      alert("買取金額を入力してください");
      return;
    }
    setPurchaseLoading(true);
    try {
      const res = await fetch("/api/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appraisal_id: appraisal.id,
          item_name: appraisal.item_name || appraisal.mercari_title || "不明",
          item_description: (appraisal.output_text || "").slice(0, 200),
          purchase_price: Number(purchasePrice),
          seller_name: sellerName || null,
          seller_address: sellerAddress || null,
          id_verification: idVerification || null,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setPurchaseSuccess(appraisal.id);
        setPurchaseTarget(null);
        setPurchasePrice("");
        setSellerName("");
        setSellerAddress("");
        setIdVerification("");
      } else {
        alert("登録に失敗しました: " + (json.error || "不明なエラー"));
      }
    } catch (e: any) {
      alert("エラー: " + (e?.message || "通信エラー"));
    } finally {
      setPurchaseLoading(false);
    }
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
        
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {userPlan === "pro" && (
            <a
              href="/ledger"
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#4f46e5",
                textDecoration: "none",
                background: "#e0e7ff",
                padding: "8px 12px",
                borderRadius: 6,
              }}
            >
              📋 古物台帳
            </a>
          )}
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
              🔒 CSV・台帳はPRO限定
            </span>
          )}
        </div>
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
                  marginBottom: 8,
                }}
              >
                {a.output_text}
              </div>
            )}

            {/* 購入ボタン（プロプランのみ） */}
            {userPlan === "pro" && (
              <>
                {purchaseSuccess === a.id ? (
                  <div style={{ fontSize: 13, color: "#059669", fontWeight: 600, padding: "6px 0" }}>
                    ✅ 古物台帳に登録しました
                  </div>
                ) : purchaseTarget === a.id ? (
                  <div style={{
                    background: "#f0fdf4",
                    border: "1px solid #86efac",
                    borderRadius: 8,
                    padding: 12,
                    marginTop: 4,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#166534" }}>
                      📦 購入情報を入力
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>買取金額（円）*</label>
                        <input
                          type="number"
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          placeholder="例: 50000"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>相手方氏名</label>
                        <input
                          type="text"
                          value={sellerName}
                          onChange={(e) => setSellerName(e.target.value)}
                          placeholder="任意"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>相手方住所</label>
                        <input
                          type="text"
                          value={sellerAddress}
                          onChange={(e) => setSellerAddress(e.target.value)}
                          placeholder="任意"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>本人確認方法</label>
                        <select
                          value={idVerification}
                          onChange={(e) => setIdVerification(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #d1d5db",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          <option value="">選択してください</option>
                          <option value="免許証">免許証</option>
                          <option value="パスポート">パスポート</option>
                          <option value="マイナンバーカード">マイナンバーカード</option>
                          <option value="保険証">保険証</option>
                          <option value="その他">その他</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          onClick={() => handlePurchaseSubmit(a)}
                          disabled={purchaseLoading}
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#fff",
                            background: purchaseLoading ? "#9ca3af" : "linear-gradient(to right, #059669, #10b981)",
                            border: "none",
                            padding: "8px 16px",
                            borderRadius: 6,
                            cursor: purchaseLoading ? "default" : "pointer",
                          }}
                        >
                          {purchaseLoading ? "登録中..." : "台帳に登録"}
                        </button>
                        <button
                          onClick={() => { setPurchaseTarget(null); setPurchasePrice(""); setSellerName(""); setSellerAddress(""); setIdVerification(""); }}
                          style={{
                            fontSize: 13,
                            color: "#6b7280",
                            background: "transparent",
                            border: "1px solid #d1d5db",
                            padding: "8px 16px",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setPurchaseTarget(a.id)}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#059669",
                      background: "transparent",
                      border: "1px solid #86efac",
                      padding: "6px 12px",
                      borderRadius: 6,
                      cursor: "pointer",
                      marginTop: 4,
                    }}
                  >
                    📦 この商品を購入する
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
