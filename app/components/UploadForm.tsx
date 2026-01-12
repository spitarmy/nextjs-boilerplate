"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type ListingMode = "flea" | "auction";
type AssessMode = "normal" | "bundle"; // まとめ査定=0.5件消費

type BundlePickup = {
  item_name: string;
  notes?: string;
  price_hint?: string; // 例: "2,000〜4,000円前後"
};

type UserEvidence = {
  free_text?: string;

  brand_or_maker?: string;
  model_or_title?: string;
  material?: string;
  size?: string;
  era?: string;
  author_or_artist?: string;
  signature_text?: string;
  seal_text?: string;
  accessories?: string;
  purchase_source?: string;

  certificate?: {
    issuer?: string;
    report_no?: string;
    details?: string;
  };
};

type AssessResponse = {
  ok: boolean;

  // 共通
  output_text?: string;
  listing_mode?: ListingMode;
  assess_mode?: AssessMode;
  confidence?: number | null;
  genre?: string | null;
  item_name?: string | null;

  // 通常（フリマ/オークション）
  mercari_title?: string | null;
  mercari_description?: string | null;
  auction_title?: string | null;

  // まとめ査定（ピックアップ）
  bundle_pickups?: BundlePickup[] | null;

  // NEW
  user_evidence?: UserEvidence | null;

  // 利用数関連
  usage?: {
    used_units: number;
    limit_units: number;
    overage_units: number;
  };

  // 超過関連
  over_limit?: boolean;
  required_overage_fee_yen?: number;

  error?: string;
};

// ★ 5枚
const MAX_FILES = 5;

// 元画像の容量制限（目安）
const MAX_ORIGINAL_SIZE_PER_FILE = 10 * 1024 * 1024; // 10MB/枚
const MAX_ORIGINAL_TOTAL_SIZE = 25 * 1024 * 1024; // 合計25MB（元画像の目安）

// ★ 5枚対応で安定させるため軽量化
const MAX_LONG_SIDE = 720;
const JPEG_QUALITY = 0.65;

// ★ dataURL合計が大きいと /api/assess 送信で落ちやすいので事前ガード
const MAX_TOTAL_DATAURL_BYTES = 6 * 1024 * 1024; // 6MB目安（安全側）

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  let { width, height } = img;
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  URL.revokeObjectURL(url);
  return dataUrl;
}

function cleanStr(s: string): string | undefined {
  const t = (s ?? "").trim();
  return t.length ? t : undefined;
}

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  // 出力モード（フリマ / オークション）
  const [listingMode, setListingMode] = useState<ListingMode>("flea");

  // 査定モード（通常 / まとめ）
  const [assessMode, setAssessMode] = useState<AssessMode>("normal");

  // 月次利用数
  const [usage, setUsage] = useState<{ used_units: number; limit_units: number; overage_units: number } | null>(null);

  // 超過で続行するフラグ（ボタンで true にして再送）
  const [allowOverage, setAllowOverage] = useState(false);

  // 画面幅に応じてレイアウト切り替え（スマホは1カラム）
  const [isMobile, setIsMobile] = useState(false);

  // ★ NEW: ユーザー補助入力（全ジャンル共通）
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [userEvidence, setUserEvidence] = useState<UserEvidence>({
    free_text: "",
    brand_or_maker: "",
    model_or_title: "",
    material: "",
    size: "",
    era: "",
    author_or_artist: "",
    signature_text: "",
    seal_text: "",
    accessories: "",
    purchase_source: "",
    certificate: {
      issuer: "",
      report_no: "",
      details: "",
    },
  });

  const isFlea = listingMode === "flea";
  const isAuction = listingMode === "auction";

  const usagePercent = useMemo(() => {
    if (!usage) return 0;
    const p = (usage.used_units / usage.limit_units) * 100;
    return Math.max(0, Math.min(100, p));
  }, [usage]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        await refreshUsage(id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const refreshUsage = async (uid: string) => {
    try {
      const res = await fetch(`/api/usage?user_id=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (res.ok && json?.ok) {
        setUsage(json.usage);
      }
    } catch {
      // 無視
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const limited = selected.slice(0, MAX_FILES);

    setFiles(limited);
    setResult(null);
    setErrorMsg(null);
    setAllowOverage(false);

    if (selected.length > MAX_FILES) {
      setErrorMsg(`画像は最大 ${MAX_FILES} 枚までです。最初の ${MAX_FILES} 枚だけ使用します。`);
    }
  };

  const copyToClipboard = async (text: string | null | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  const buildEvidencePayload = (): UserEvidence | null => {
    const ev: UserEvidence = {
      free_text: cleanStr(userEvidence.free_text ?? ""),
      brand_or_maker: cleanStr(userEvidence.brand_or_maker ?? ""),
      model_or_title: cleanStr(userEvidence.model_or_title ?? ""),
      material: cleanStr(userEvidence.material ?? ""),
      size: cleanStr(userEvidence.size ?? ""),
      era: cleanStr(userEvidence.era ?? ""),
      author_or_artist: cleanStr(userEvidence.author_or_artist ?? ""),
      signature_text: cleanStr(userEvidence.signature_text ?? ""),
      seal_text: cleanStr(userEvidence.seal_text ?? ""),
      accessories: cleanStr(userEvidence.accessories ?? ""),
      purchase_source: cleanStr(userEvidence.purchase_source ?? ""),
      certificate: {
        issuer: cleanStr(userEvidence.certificate?.issuer ?? ""),
        report_no: cleanStr(userEvidence.certificate?.report_no ?? ""),
        details: cleanStr(userEvidence.certificate?.details ?? ""),
      },
    };

    const hasAny =
      Object.values(ev).some((v) => typeof v === "string" && v.length > 0) ||
      (ev.certificate && Object.values(ev.certificate).some((v) => typeof v === "string" && v.length > 0));

    return hasAny ? ev : null;
  };

  const submitInternal = async (overage: boolean) => {
    setErrorMsg(null);
    setResult(null);

    if (!files.length) {
      setErrorMsg("画像を少なくとも1枚選択してください。");
      return;
    }
    if (files.length > MAX_FILES) {
      setErrorMsg(`画像は最大 ${MAX_FILES} 枚までです。`);
      return;
    }

    // 元画像の容量チェック（目安）
    let totalSize = 0;
    for (const f of files) {
      totalSize += f.size;
      if (f.size > MAX_ORIGINAL_SIZE_PER_FILE) {
        setErrorMsg("元の画像ファイルの容量が大きすぎます（10MB超）。解像度を下げてからお試しください。");
        return;
      }
    }
    if (totalSize > MAX_ORIGINAL_TOTAL_SIZE) {
      setErrorMsg("画像の合計容量が大きすぎます（25MB超）。枚数を減らすか解像度を下げてください。");
      return;
    }

    setLoading(true);

    try {
      const imageUrls: string[] = [];
      let totalDataBytes = 0;

      for (const file of files) {
        const dataUrl = await fileToCompressedDataUrl(file);
        totalDataBytes += estimateDataUrlBytes(dataUrl);
        if (totalDataBytes > MAX_TOTAL_DATAURL_BYTES) {
          setErrorMsg("画像データが大きすぎて送信時にエラーになる可能性があります。画像を減らすか、不要背景をトリミングして再度お試しください。");
          setLoading(false);
          return;
        }
        imageUrls.push(dataUrl);
      }

      const evPayload = buildEvidencePayload();

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: imageUrls,
          user_id: userId,
          listing_mode: listingMode,
          assess_mode: assessMode,
          allow_overage: overage,
          user_evidence: evPayload, // ★ NEW
        }),
      });

      const json: AssessResponse = await res.json();

      // 利用数UI更新
      if (json?.usage) setUsage(json.usage);
      else if (userId) await refreshUsage(userId);

      if (res.status === 402 && json?.over_limit) {
        setResult(json);
        setErrorMsg(json.error || "今月の上限に達しました。超過で続行する場合は下のボタンを押してください。");
        setAllowOverage(true);
        return;
      }

      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || "査定に失敗しました。時間をおいて再度お試しください。");
      } else {
        setResult(json);
        setAllowOverage(false);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("通信エラーが発生しました。ネットワーク環境を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitInternal(false);
  };

  return (
    <div
      style={{
        display: isMobile ? "block" : "grid",
        gridTemplateColumns: isMobile ? undefined : "minmax(0, 1.05fr) minmax(0, 1.25fr)",
        gap: isMobile ? 20 : 24,
        alignItems: "flex-start",
      }}
    >
      {/* 左側 */}
      <section
        style={{
          background: "radial-gradient(circle at top left, rgba(31,41,55,0.3), rgba(15,23,42,0.98))",
          borderRadius: isMobile ? 18 : 20,
          padding: isMobile ? 18 : 24,
          border: "1px solid rgba(15,23,42,0.9)",
          boxShadow: "0 18px 45px rgba(15,23,42,0.7)",
          color: "#e5e7eb",
        }}
      >
        <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, margin: "0 0 6px" }}>査定する</h2>

        {/* 月次利用数 */}
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            backgroundColor: "rgba(2,6,23,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>今月の利用数</div>
            <div style={{ fontSize: 12, color: "#cbd5f5" }}>
              {usage ? `${usage.used_units} / ${usage.limit_units}` : "読み込み中…"}
            </div>
          </div>
          <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(148,163,184,0.25)", overflow: "hidden" }}>
            <div style={{ width: `${usagePercent}%`, height: "100%", background: "linear-gradient(to right, rgba(37,99,235,0.7), rgba(79,70,229,0.7))" }} />
          </div>
          {usage && usage.overage_units > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#fca5a5" }}>
              超過分: {usage.overage_units} 件（※月末請求対象）
            </div>
          )}
        </div>

        <p style={{ fontSize: 12, color: "#d1d5db", margin: "0 0 14px", lineHeight: 1.7 }}>
          最大 {MAX_FILES} 枚までアップロードできます。画像は長辺{MAX_LONG_SIDE}pxに自動圧縮されます。
        </p>

        {/* 査定モード（通常 / まとめ） */}
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            backgroundColor: "rgba(2,6,23,0.55)",
          }}
        >
          <div style={{ fontSize: 12, color: "#e5e7eb", marginBottom: 8, fontWeight: 600 }}>査定モード</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setAssessMode("normal")}
              style={{
                flex: 1,
                padding: "9px 10px",
                borderRadius: 999,
                border: assessMode === "normal" ? "1px solid rgba(99,102,241,0.9)" : "1px solid rgba(148,163,184,0.35)",
                background: assessMode === "normal" ? "linear-gradient(to right, rgba(37,99,235,0.35), rgba(79,70,229,0.35))" : "rgba(2,6,23,0.35)",
                color: "#e5e7eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              通常査定（1件）
            </button>

            <button
              type="button"
              onClick={() => setAssessMode("bundle")}
              style={{
                flex: 1,
                padding: "9px 10px",
                borderRadius: 999,
                border: assessMode === "bundle" ? "1px solid rgba(99,102,241,0.9)" : "1px solid rgba(148,163,184,0.35)",
                background: assessMode === "bundle" ? "linear-gradient(to right, rgba(37,99,235,0.35), rgba(79,70,229,0.35))" : "rgba(2,6,23,0.35)",
                color: "#e5e7eb",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              まとめ査定（0.5件）
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
            ※まとめ査定は「写真内の値が付きそうな数点」をピックアップして返します（タイトル生成なし）。
          </div>
        </div>

        {/* 出力モード（通常査定のときだけ） */}
        {assessMode === "normal" && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 14,
              border: "1px solid rgba(148,163,184,0.35)",
              backgroundColor: "rgba(2,6,23,0.55)",
            }}
          >
            <div style={{ fontSize: 12, color: "#e5e7eb", marginBottom: 8, fontWeight: 600 }}>出力モード</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setListingMode("flea")}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 999,
                  border: listingMode === "flea" ? "1px solid rgba(99,102,241,0.9)" : "1px solid rgba(148,163,184,0.35)",
                  background: listingMode === "flea" ? "linear-gradient(to right, rgba(37,99,235,0.35), rgba(79,70,229,0.35))" : "rgba(2,6,23,0.35)",
                  color: "#e5e7eb",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                フリマ向け
              </button>

              <button
                type="button"
                onClick={() => setListingMode("auction")}
                style={{
                  flex: 1,
                  padding: "9px 10px",
                  borderRadius: 999,
                  border: listingMode === "auction" ? "1px solid rgba(99,102,241,0.9)" : "1px solid rgba(148,163,184,0.35)",
                  background: listingMode === "auction" ? "linear-gradient(to right, rgba(37,99,235,0.35), rgba(79,70,229,0.35))" : "rgba(2,6,23,0.35)",
                  color: "#e5e7eb",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                オークション向け
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
              ※モードに応じて必要なものだけ生成します（トークン節約）。
            </div>
          </div>
        )}

        {/* ★ NEW: 補助情報入力（全ジャンル共通） */}
        <div
          style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            backgroundColor: "rgba(2,6,23,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 700 }}>補助情報（任意）</div>
            <button
              type="button"
              onClick={() => setEvidenceOpen((v) => !v)}
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.5)",
                background: "rgba(2,6,23,0.25)",
                color: "#e5e7eb",
                cursor: "pointer",
              }}
            >
              {evidenceOpen ? "折りたたむ" : "開く"}
            </button>
          </div>

          <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
            ※わかる範囲でOK。入力すると、作者/落款/型番/相場の精度が上がります（上書きではなく根拠として使用）。
          </div>

          {evidenceOpen && (
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <textarea
                value={userEvidence.free_text ?? ""}
                onChange={(e) => setUserEvidence((p) => ({ ...p, free_text: e.target.value }))}
                placeholder="自由入力（例：箱書あり、読める文字、購入店、鑑定書あり、特徴など）"
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(55,65,81,0.9)",
                  fontSize: 12,
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  resize: "vertical",
                }}
              />

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <input
                  value={userEvidence.brand_or_maker ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, brand_or_maker: e.target.value }))}
                  placeholder="ブランド/メーカー（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.model_or_title ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, model_or_title: e.target.value }))}
                  placeholder="型番/商品名（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.material ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, material: e.target.value }))}
                  placeholder="素材（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.size ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, size: e.target.value }))}
                  placeholder="サイズ（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.era ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, era: e.target.value }))}
                  placeholder="時代/年代（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.author_or_artist ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, author_or_artist: e.target.value }))}
                  placeholder="作家/作者（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.signature_text ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, signature_text: e.target.value }))}
                  placeholder="署名/銘（読めた文字）例：『大観』など"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.seal_text ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, seal_text: e.target.value }))}
                  placeholder="印文（読めた文字）例：『〇〇印』など"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.accessories ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, accessories: e.target.value }))}
                  placeholder="付属品（箱/栞/鑑定書/保証書など）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.purchase_source ?? ""}
                  onChange={(e) => setUserEvidence((p) => ({ ...p, purchase_source: e.target.value }))}
                  placeholder="入手経路（任意）例：百貨店、骨董市、譲渡など"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
              </div>

              <div style={{ marginTop: 4, fontSize: 11, color: "#cbd5f5", fontWeight: 700 }}>
                証明/鑑定書（任意）
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <input
                  value={userEvidence.certificate?.issuer ?? ""}
                  onChange={(e) =>
                    setUserEvidence((p) => ({
                      ...p,
                      certificate: { ...(p.certificate ?? {}), issuer: e.target.value },
                    }))
                  }
                  placeholder="発行元（例：GIA/中央宝石/AGT など）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <input
                  value={userEvidence.certificate?.report_no ?? ""}
                  onChange={(e) =>
                    setUserEvidence((p) => ({
                      ...p,
                      certificate: { ...(p.certificate ?? {}), report_no: e.target.value },
                    }))
                  }
                  placeholder="番号（任意）"
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                  }}
                />
                <textarea
                  value={userEvidence.certificate?.details ?? ""}
                  onChange={(e) =>
                    setUserEvidence((p) => ({
                      ...p,
                      certificate: { ...(p.certificate ?? {}), details: e.target.value },
                    }))
                  }
                  placeholder="詳細（例：4C、寸法、グレーディングなど）"
                  rows={2}
                  style={{
                    gridColumn: isMobile ? "auto" : "1 / -1",
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(55,65,81,0.9)",
                    fontSize: 12,
                    backgroundColor: "#020617",
                    color: "#e5e7eb",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: "block", fontSize: 13, marginBottom: 8, color: "#f9fafb" }}>
            商品画像（1〜{MAX_FILES} 枚）
          </label>

          <div
            style={{
              marginBottom: 10,
              padding: 14,
              borderRadius: 14,
              border: "1px dashed rgba(148,163,184,0.7)",
              backgroundColor: "rgba(15,23,42,0.96)",
            }}
          >
            <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ fontSize: 13, color: "#e5e7eb" }} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 1.6 }}>
              ・1枚あたり最大10MB・合計25MBまで（元画像の目安）
              <br />
              ・送信エラー回避のため、背景はなるべくトリミングしてください。
            </div>
          </div>

          {files.length > 0 && (
            <ul style={{ fontSize: 12, margin: "0 0 12px", paddingLeft: 18, color: "#e5e7eb" }}>
              {files.map((f, i) => (
                <li key={i}>
                  {f.name}（{Math.round(f.size / 1024)} KB）
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            disabled={loading || files.length === 0}
            style={{
              width: "100%",
              padding: "11px 16px",
              borderRadius: 999,
              border: "none",
              background: loading || files.length === 0 ? "linear-gradient(to right, #4b5563, #6b7280)" : "linear-gradient(to right, #2563eb, #4f46e5)",
              color: "#f9fafb",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading || files.length === 0 ? "default" : "pointer",
              opacity: loading ? 0.9 : 1,
              boxShadow: "0 14px 35px rgba(37,99,235,0.45), 0 0 0 1px rgba(148,163,184,0.4)",
            }}
          >
            {loading ? "AIが査定しています…" : "AI査定を開始する"}
          </button>

          {/* 超過で続行 */}
          {allowOverage && (
            <button
              type="button"
              onClick={() => submitInternal(true)}
              disabled={loading}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid rgba(248,113,113,0.75)",
                background: "rgba(127,29,29,0.25)",
                color: "#fecaca",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "default" : "pointer",
              }}
            >
              超過で続行（1件50円・月末請求）
            </button>
          )}
        </form>

        {errorMsg && (
          <div
            style={{
              marginTop: 14,
              padding: 10,
              borderRadius: 10,
              background: "rgba(127,29,29,0.2)",
              border: "1px solid rgba(248,113,113,0.6)",
              color: "#fecaca",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {errorMsg}
          </div>
        )}
      </section>

      {/* 右側：結果 */}
      <section
        style={{
          marginTop: isMobile ? 16 : 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {!result && (
          <div
            style={{
              borderRadius: 16,
              padding: isMobile ? 14 : 16,
              border: "1px dashed rgba(148,163,184,0.55)",
              background: "linear-gradient(135deg, rgba(248,250,252,0.95), rgba(226,232,240,0.95))",
              color: "#4b5563",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            右側には査定結果が表示されます。画像をアップロードして「AI査定を開始する」を押すと、
            <br />
            <br />
            ・真贋コメント（根拠付き）
            <br />
            ・想定相場（控えめレンジ）
            <br />
            ・（通常査定のみ）出品用タイトル／説明文
            <br />
            が自動生成されます。
          </div>
        )}

        {result && result.ok && (
          <div style={{ display: "grid", gap: 14 }}>
            {/* 査定コメント */}
            <section
              style={{
                padding: isMobile ? 14 : 16,
                borderRadius: 16,
                background: "radial-gradient(circle at top left, rgba(30,64,175,0.15), #0f172a)",
                border: "1px solid rgba(129,140,248,0.4)",
                color: "#e5e7eb",
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>査定コメント</h3>
              <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7 }}>{result.output_text}</p>
              <div style={{ marginTop: 8, fontSize: 11, color: "#cbd5f5" }}>
                信頼度: {typeof result.confidence === "number" ? `${result.confidence}%` : "不明"}
                {"　"}ジャンル: {result.genre ?? "不明"}
                {"　"}型名: {result.item_name ?? "不明"}
                {"　"}モード: {result.assess_mode === "bundle" ? "まとめ査定" : isAuction ? "オークション" : "フリマ"}
              </div>
            </section>

            {/* NEW: ユーザー補助入力の表示（控えめに） */}
            {result.user_evidence && (
              <section
                style={{
                  padding: isMobile ? 14 : 16,
                  borderRadius: 16,
                  background: "#0b1120",
                  border: "1px solid rgba(55,65,81,0.9)",
                  color: "#e5e7eb",
                }}
              >
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>補助情報（入力内容）</h3>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6, color: "#cbd5f5" }}>
                  {JSON.stringify(result.user_evidence, null, 2)}
                </pre>
              </section>
            )}

            {/* まとめ査定：ピックアップ */}
            {result.assess_mode === "bundle" && Array.isArray(result.bundle_pickups) && (
              <section
                style={{
                  padding: isMobile ? 14 : 16,
                  borderRadius: 16,
                  background: "#0b1120",
                  border: "1px solid rgba(55,65,81,0.9)",
                  color: "#e5e7eb",
                }}
              >
                <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700 }}>ピックアップ査定（数点）</h3>
                <div style={{ display: "grid", gap: 10 }}>
                  {result.bundle_pickups.map((p, idx) => (
                    <div key={idx} style={{ padding: 10, borderRadius: 12, border: "1px solid rgba(148,163,184,0.25)", background: "rgba(2,6,23,0.35)" }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.item_name}</div>
                      {p.price_hint && <div style={{ marginTop: 4, fontSize: 12, color: "#cbd5f5" }}>目安: {p.price_hint}</div>}
                      {p.notes && <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>{p.notes}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 通常査定：タブで表示切替 */}
            {result.assess_mode !== "bundle" && (
              <>
                {isFlea && (
                  <>
                    {/* フリマ用タイトル */}
                    <section
                      style={{
                        padding: isMobile ? 14 : 16,
                        borderRadius: 16,
                        background: "#0b1120",
                        border: "1px solid rgba(55,65,81,0.9)",
                        color: "#e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>フリマ用タイトル</h3>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(result.mercari_title)}
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(148,163,184,0.7)",
                            background: "linear-gradient(to right, #020617, #020617)",
                            color: "#e5e7eb",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          コピー
                        </button>
                      </div>
                      <input
                        readOnly
                        value={result.mercari_title ?? ""}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(55,65,81,0.9)",
                          fontSize: 13,
                          backgroundColor: "#020617",
                          color: "#e5e7eb",
                        }}
                      />
                    </section>

                    {/* フリマ用説明文 */}
                    <section
                      style={{
                        padding: isMobile ? 14 : 16,
                        borderRadius: 16,
                        background: "#0b1120",
                        border: "1px solid rgba(55,65,81,0.9)",
                        color: "#e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>フリマ用説明文</h3>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(result.mercari_description)}
                          style={{
                            fontSize: 11,
                            padding: "4px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(148,163,184,0.7)",
                            background: "linear-gradient(to right, #020617, #020617)",
                            color: "#e5e7eb",
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          コピー
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={result.mercari_description ?? ""}
                        rows={isMobile ? 6 : 8}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(55,65,81,0.9)",
                          fontSize: 13,
                          backgroundColor: "#020617",
                          color: "#e5e7eb",
                          resize: "vertical",
                        }}
                      />
                    </section>
                  </>
                )}

                {isAuction && (
                  <section
                    style={{
                      padding: isMobile ? 14 : 16,
                      borderRadius: 16,
                      background: "#0b1120",
                      border: "1px solid rgba(55,65,81,0.9)",
                      color: "#e5e7eb",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>オークション用タイトル</h3>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(result.auction_title)}
                        style={{
                          fontSize: 11,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.7)",
                          background: "linear-gradient(to right, #020617, #020617)",
                          color: "#e5e7eb",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        コピー
                      </button>
                    </div>
                    <input
                      readOnly
                      value={result.auction_title ?? ""}
                      placeholder="（生成されます）"
                      style={{
                        width: "100%",
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(55,65,81,0.9)",
                        fontSize: 13,
                        backgroundColor: "#020617",
                        color: "#e5e7eb",
                      }}
                    />
                    <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                      ※半角は0.5文字相当としてカウントし、上限内に収まるよう自動調整しています。
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
