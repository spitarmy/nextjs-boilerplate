"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Row = {
  user_id: string;
  used_units: number;
  overage_units: number;
  normal_units: number;
  bundle_units: number;
  flea_units: number;
  auction_units: number;
  events: number;
  last_used_at: string | null;
};

function isAdmin(userId: string | null): boolean {
  // フロント側は「完全な防御」ではない（ENVが露出しないため）
  // なのでページでは「APIで403ならブロック表示」するのが本命。
  // ここはUI用の補助として、ログイン状態の表示だけに使う。
  return !!userId;
}

export default function AdminUsagePage() {
  const [me, setMe] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"used" | "overage" | "last">("used");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data.user?.id ?? null);
    })();
  }, []);

  const fetchRows = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/usage");
      const json = await res.json();

      // ★ 管理者以外はここで完全にブロック（データは取得できない）
      if (res.status === 403) {
        setRows([]);
        setErrorMsg("管理者のみ閲覧できます（403）");
        return;
      }

      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error ?? "failed");
        setRows([]);
      } else {
        setRows(json.rows ?? []);
      }
    } catch {
      setErrorMsg("network error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    let r = rows;
    if (key) r = r.filter((x) => x.user_id.toLowerCase().includes(key));
    if (sortKey === "used") r = [...r].sort((a, b) => b.used_units - a.used_units);
    if (sortKey === "overage") r = [...r].sort((a, b) => b.overage_units - a.overage_units);
    if (sortKey === "last") r = [...r].sort((a, b) => (b.last_used_at ?? "").localeCompare(a.last_used_at ?? ""));
    return r;
  }, [rows, q, sortKey]);

  // ★ 管理者以外は表そのものを出さない（403メッセージだけ）
  const blocked = !!errorMsg && errorMsg.includes("管理者");

  return (
    <div style={{ padding: 18, color: "#0f172a" }}>
      <h1 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 800 }}>管理：今月の利用状況</h1>
      <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
        ログインID: {me ?? "未ログイン"}
      </div>

      {errorMsg && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "rgba(127,29,29,0.08)",
            border: "1px solid rgba(248,113,113,0.5)",
            color: "#7f1d1d",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {errorMsg}
        </div>
      )}

      {!blocked && (
        <>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="user_idで検索（部分一致）"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.6)",
                minWidth: 320,
                outline: "none",
              }}
            />

            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(148,163,184,0.6)",
                outline: "none",
              }}
            >
              <option value="used">並び替え：使用数</option>
              <option value="overage">並び替え：超過分</option>
              <option value="last">並び替え：最終利用</option>
            </select>

            <button
              onClick={fetchRows}
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "none",
                background: "linear-gradient(to right, #2563eb, #4f46e5)",
                color: "white",
                fontWeight: 800,
                cursor: loading ? "default" : "pointer",
              }}
            >
              {loading ? "更新中…" : "更新"}
            </button>
          </div>

          <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid rgba(148,163,184,0.5)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "rgba(226,232,240,0.75)" }}>
                  {[
                    "user_id",
                    "使用数",
                    "超過分",
                    "通常",
                    "まとめ(0.5)",
                    "フリマ",
                    "オークション",
                    "イベント数",
                    "最終利用",
                  ].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#334155" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.user_id} style={{ borderTop: "1px solid rgba(148,163,184,0.35)" }}>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                      {r.user_id}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 800 }}>{r.used_units}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13, color: r.overage_units > 0 ? "#b91c1c" : "#0f172a", fontWeight: 800 }}>
                      {r.overage_units}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.normal_units}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.bundle_units}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.flea_units}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.auction_units}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12 }}>{r.events}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: "#475569" }}>{r.last_used_at ?? "-"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 14, fontSize: 12, color: "#64748b" }}>
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
            ・使用数は usage_events の units 合計（まとめ査定は 0.5）
            <br />
            ・超過分は is_overage=true の units 合計
          </div>
        </>
      )}
    </div>
  );
}
