"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  created_at: string;
};

export default function AdminPlansPage() {
  const [me, setMe] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null); // user_id being changed

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data.user?.id ?? null);
    })();
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/plans");
      const json = await res.json();
      if (res.status === 403) {
        setErrorMsg("管理者のみ閲覧できます（403）");
        return;
      }
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error ?? "failed");
      } else {
        setUsers(json.users ?? []);
      }
    } catch {
      setErrorMsg("network error");
    } finally {
      setLoading(false);
    }
  };

  const changePlan = async (userId: string, newPlan: "light" | "pro") => {
    setChanging(userId);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, plan: newPlan }),
      });
      const json = await res.json();
      if (json?.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, plan: newPlan } : u))
        );
      } else {
        alert(`変更に失敗しました: ${json?.error ?? "unknown"}`);
      }
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setChanging(null);
    }
  };

  const blocked = !!errorMsg && errorMsg.includes("管理者");

  return (
    <div style={{ padding: 18, color: "#0f172a", maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>管理：プラン管理</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin/usage" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none" }}>← 利用状況</a>
          <button
            onClick={fetchUsers}
            disabled={loading}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              background: "linear-gradient(to right, #2563eb, #4f46e5)",
              color: "white",
              fontWeight: 700,
              fontSize: 12,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "更新中…" : "更新"}
          </button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "#475569", marginBottom: 12 }}>
        ログインID: {me ?? "未ログイン"}
      </div>

      {errorMsg && (
        <div style={{
          padding: 12, borderRadius: 12, background: "rgba(127,29,29,0.08)",
          border: "1px solid rgba(248,113,113,0.5)", color: "#7f1d1d", marginBottom: 12, fontSize: 13,
        }}>
          {errorMsg}
        </div>
      )}

      {!blocked && (
        <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid rgba(148,163,184,0.5)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ background: "rgba(226,232,240,0.75)" }}>
                {["ユーザー名", "メール", "現在のプラン", "操作", "登録日"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, color: "#334155" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid rgba(148,163,184,0.35)" }}>
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600 }}>
                    {u.name || "（未設定）"}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: "#475569" }}>
                    {u.email || "-"}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{
                      backgroundColor: u.plan === "pro" ? "rgba(147,51,234,0.15)" : "rgba(37,99,235,0.15)",
                      color: u.plan === "pro" ? "#7c3aed" : "#2563eb",
                      padding: "3px 10px",
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {u.plan === "pro" ? "PRO" : "LIGHT"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    {u.plan === "pro" ? (
                      <button
                        onClick={() => changePlan(u.id, "light")}
                        disabled={changing === u.id}
                        style={{
                          padding: "4px 12px", borderRadius: 6, border: "1px solid #d1d5db",
                          background: "#fff", color: "#2563eb", fontSize: 11, fontWeight: 700,
                          cursor: changing === u.id ? "default" : "pointer",
                        }}
                      >
                        {changing === u.id ? "変更中..." : "→ ライトに変更"}
                      </button>
                    ) : (
                      <button
                        onClick={() => changePlan(u.id, "pro")}
                        disabled={changing === u.id}
                        style={{
                          padding: "4px 12px", borderRadius: 6, border: "none",
                          background: "linear-gradient(to right, #7c3aed, #6d28d9)", color: "#fff",
                          fontSize: 11, fontWeight: 700, cursor: changing === u.id ? "default" : "pointer",
                        }}
                      >
                        {changing === u.id ? "変更中..." : "→ プロに変更"}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: "#64748b" }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("ja-JP") : "-"}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 14, fontSize: 12, color: "#64748b" }}>
                    ユーザーがいません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
