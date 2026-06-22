"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type ListingMode = "flea" | "auction";
type AssessMode = "normal" | "bundle"; // まとめ査定=0.5件消費

type BundlePickup = {
  item_name: string;
  notes?: string;
  price_hint?: string; // 例: "2,000〜4,000円前後"
};

type UserHints = {
  known_title?: string;
  known_author?: string;
  known_signature?: string;
  known_seal?: string;
  known_model?: string;
  known_material?: string;
  certificate_text?: string;
  notes?: string;
};

type AssessResponse = {
  ok: boolean;

  output_text?: string;
  listing_mode?: ListingMode;
  assess_mode?: AssessMode;
  confidence?: number | null;
  genre?: string | null;
  item_name?: string | null;

  mercari_title?: string | null;
  mercari_description?: string | null;
  auction_title?: string | null;

  bundle_pickups?: BundlePickup[] | null;

  usage?: {
    used_units: number;
    limit_units: number;
    overage_units: number;
  };

  over_limit?: boolean;
  required_overage_fee_yen?: number;

  settings?: {
    allow_training?: boolean;
  };

  error?: string;
};

// ★ 5枚
const MAX_FILES = 5;

// 元画像の容量制限（目安）
const MAX_ORIGINAL_SIZE_PER_FILE = 10 * 1024 * 1024; // 10MB/枚
const MAX_ORIGINAL_TOTAL_SIZE = 25 * 1024 * 1024; // 合計25MB（元画像の目安）

// ★ 精度重視（ロゴ・刻印・落款などの細部認識を確保）
const MAX_LONG_SIDE = 1280;
const JPEG_QUALITY = 0.80;

// ★ dataURL合計ガード（高解像度化に合わせて引き上げ）
const MAX_TOTAL_DATAURL_BYTES = 15 * 1024 * 1024; // 15MB目安

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

// ★ 同一ファイル重複追加を軽減（完璧ではないが実用的）
function fileKey(f: File): string {
  // name/size/lastModified の組み合わせで「同じファイル」を弾く
  return `${f.name}::${f.size}::${f.lastModified}`;
}

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [listingMode, setListingMode] = useState<ListingMode>("flea");
  const [assessMode, setAssessMode] = useState<AssessMode>("normal");

  const [usage, setUsage] = useState<{ used_units: number; limit_units: number; overage_units: number } | null>(null);

  const [allowOverage, setAllowOverage] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  // ★ 学習提供設定
  const [allowTraining, setAllowTraining] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);

  // ★ ユーザー補助入力
  const [hints, setHints] = useState<UserHints>({
    known_title: "",
    known_author: "",
    known_signature: "",
    known_seal: "",
    known_model: "",
    known_material: "",
    certificate_text: "",
    notes: "",
  });

  // ★ モバイルで「写真選択」「その場で撮影」を出すための hidden input
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

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
        await refreshSettings(id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);

    const ua = navigator.userAgent || "";
    setIsAndroid(/Android/i.test(ua));

    return () => window.removeEventListener("resize", check);
  }, []);

  const refreshUsage = async (uid: string) => {
    try {
      const res = await fetch(`/api/usage?user_id=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (res.ok && json?.ok) setUsage(json.usage);
    } catch {
      // 無視
    }
  };

  const refreshSettings = async (uid: string) => {
    try {
      const res = await fetch(`/api/user-settings?user_id=${encodeURIComponent(uid)}`);
      const json = await res.json();
      if (res.ok && json?.ok) setAllowTraining(Boolean(json?.settings?.allow_training));
    } catch {
      // 無視
    }
  };

  const updateAllowTraining = async (next: boolean) => {
    if (!userId) return;
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, allow_training: next }),
      });
      const json = await res.json();
      if (res.ok && json?.ok) {
        setAllowTraining(Boolean(json?.settings?.allow_training));
      } else {
        alert(json?.error || "設定の更新に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setSettingsLoading(false);
    }
  };

  // ★ 追加（append）で反映する：既存 + 新規 -> 重複排除 -> 上限で切る
  const appendFiles = (selected: File[]) => {
    setFiles((prev) => {
      const prevMap = new Map<string, File>();
      for (const f of prev) prevMap.set(fileKey(f), f);

      for (const f of selected) {
        const key = fileKey(f);
        if (!prevMap.has(key)) prevMap.set(key, f);
      }

      const merged = Array.from(prevMap.values());

      // 上限を超えたら「先に入ってたもの優先」で後ろを切る
      const limited = merged.slice(0, MAX_FILES);

      // エラーメッセージ
      if (merged.length > MAX_FILES) {
        setErrorMsg(`画像は最大 ${MAX_FILES} 枚までです。先に追加された ${MAX_FILES} 枚のみ使用します。`);
      }

      return limited;
    });

    // 画像が変わったら結果はクリア
    setResult(null);
    setAllowOverage(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);

    // 追加方式
    appendFiles(selected);

    // 同じファイルを選び直せるようにリセット
    e.target.value = "";
  };

  const clearFiles = () => {
    setFiles([]);
    setResult(null);
    setErrorMsg(null);
    setAllowOverage(false);
  };

  const removeOne = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
    setAllowOverage(false);
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

  const submitInternal = async (overage: boolean) => {
    setErrorMsg(null);
    setResult(null);
    setProgressStage(null);

    if (!files.length) {
      setErrorMsg("画像を少なくとも1枚選択してください。");
      return;
    }
    if (files.length > MAX_FILES) {
      setErrorMsg(`画像は最大 ${MAX_FILES} 枚までです。`);
      return;
    }

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
    setProgressStage("画像を圧縮中...");

    try {
      const imageUrls: string[] = [];
      let totalDataBytes = 0;

      for (const file of files) {
        const dataUrl = await fileToCompressedDataUrl(file);
        totalDataBytes += estimateDataUrlBytes(dataUrl);
        if (totalDataBytes > MAX_TOTAL_DATAURL_BYTES) {
          setErrorMsg(
            "画像データが大きすぎて送信時にエラーになる可能性があります。画像を減らすか、不要背景をトリミングして再度お試しください。"
          );
          setLoading(false);
          setProgressStage(null);
          return;
        }
        imageUrls.push(dataUrl);
      }

      // ★ 空文字は送らない（API側でnull扱いしやすく）
      const userHints: UserHints = {};
      (Object.keys(hints) as (keyof UserHints)[]).forEach((k) => {
        const v = (hints[k] ?? "").toString().trim();
        if (v) userHints[k] = v;
      });

      setProgressStage("サーバーに送信中...");

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: imageUrls,
          user_id: userId,
          listing_mode: listingMode,
          assess_mode: assessMode,
          allow_overage: overage,
          user_hints: Object.keys(userHints).length ? userHints : null,
        }),
      });

      // SSE ストリーミング対応（text/event-stream の場合）
      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        // ストリームを読み取り
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSEイベントをパース（event: xxx\ndata: xxx\n\n）
          const events = buffer.split("\n\n");
          buffer = events.pop() || ""; // 最後の不完全なチャンクをバッファに残す

          for (const block of events) {
            if (!block.trim()) continue;

            const lines = block.split("\n");
            let eventType = "";
            let eventData = "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                eventData = line.slice(6);
              }
            }

            if (!eventType || !eventData) continue;

            try {
              const data = JSON.parse(eventData);

              if (eventType === "progress") {
                setProgressStage(data.message || "処理中...");
              } else if (eventType === "result") {
                const json = data as AssessResponse;
                if (json?.usage) setUsage(json.usage);
                setResult(json);
                setAllowOverage(false);
              } else if (eventType === "error") {
                const json = data as AssessResponse;
                if (json?.usage) setUsage(json.usage);
                if (json?.over_limit) {
                  setResult(json);
                  setErrorMsg(json.error || "今月の上限に達しました。超過で続行する場合は下のボタンを押してください。");
                  setAllowOverage(true);
                } else {
                  setErrorMsg(json.error || "査定に失敗しました。時間をおいて再度お試しください。");
                }
              } else if (eventType === "done") {
                // 完了
              }
            } catch {
              // JSONパース失敗は無視
            }
          }
        }
      } else {
        // フォールバック: 従来のJSONレスポンス（402エラー等）
        const json: AssessResponse = await res.json();

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
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("通信エラーが発生しました。ネットワーク環境を確認してください。");
    } finally {
      setLoading(false);
      setProgressStage(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitInternal(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(55,65,81,0.9)",
    fontSize: 13,
    backgroundColor: "#020617",
    color: "#e5e7eb",
  };

  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#e5e7eb", marginBottom: 6 };

  const ghostBtn: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.45)",
    background: "rgba(2,6,23,0.35)",
    color: "#e5e7eb",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const dangerBtn: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 999,
    border: "1px solid rgba(248,113,113,0.75)",
    background: "rgba(127,29,29,0.25)",
    color: "#fecaca",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
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

        {/* ★ 学習提供設定 */}
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            backgroundColor: "rgba(2,6,23,0.55)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#e5e7eb" }}>査定データを学習に利用</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
                ※ONにすると、あなたの査定結果をカンテノの教師データとして利用します（いつでも変更可）
              </div>
            </div>

            <button
              type="button"
              disabled={!userId || settingsLoading}
              onClick={() => updateAllowTraining(!allowTraining)}
              style={{
                minWidth: 86,
                padding: "8px 10px",
                borderRadius: 999,
                border: allowTraining ? "1px solid rgba(34,197,94,0.7)" : "1px solid rgba(148,163,184,0.45)",
                background: allowTraining ? "rgba(34,197,94,0.18)" : "rgba(2,6,23,0.35)",
                color: allowTraining ? "#bbf7d0" : "#e5e7eb",
                fontSize: 12,
                fontWeight: 900,
                cursor: !userId || settingsLoading ? "default" : "pointer",
                opacity: !userId ? 0.6 : 1,
              }}
            >
              {allowTraining ? "ON" : "OFF"}
            </button>
          </div>

          {!userId && <div style={{ marginTop: 8, fontSize: 11, color: "#fca5a5" }}>※ログインすると設定できます</div>}
        </div>

        {/* ★ ユーザー補助入力 */}
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 14,
            border: "1px solid rgba(148,163,184,0.35)",
            backgroundColor: "rgba(2,6,23,0.55)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "#e5e7eb", marginBottom: 8 }}>補助入力（読めた情報がある場合）</div>

          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div style={labelStyle}>作品/商品名（任意）</div>
              <input
                value={hints.known_title ?? ""}
                onChange={(e) => setHints((p) => ({ ...p, known_title: e.target.value }))}
                placeholder="例：山水図 掛軸 / CHANEL マトラッセ / 南部鉄瓶 など"
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle}>作者/作家名（任意）</div>
                <input
                  value={hints.known_author ?? ""}
                  onChange={(e) => setHints((p) => ({ ...p, known_author: e.target.value }))}
                  placeholder="例：横山大観 / 〇〇窯 / Cartier など"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>型番/品番（任意）</div>
                <input
                  value={hints.known_model ?? ""}
                  onChange={(e) => setHints((p) => ({ ...p, known_model: e.target.value }))}
                  placeholder="例：Ref.XXXX / 型番 / 品番"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div>
                <div style={labelStyle}>銘/署名（読めた文字）（任意）</div>
                <input
                  value={hints.known_signature ?? ""}
                  onChange={(e) => setHints((p) => ({ ...p, known_signature: e.target.value }))}
                  placeholder="例：『大観』/ 『清水六兵衛』/ 刻印文字など"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>落款・印文（任意）</div>
                <input
                  value={hints.known_seal ?? ""}
                  onChange={(e) => setHints((p) => ({ ...p, known_seal: e.target.value }))}
                  placeholder="例：朱印の文字 / 〇〇印 など"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <div style={labelStyle}>素材/金性など（任意）</div>
              <input
                value={hints.known_material ?? ""}
                onChange={(e) => setHints((p) => ({ ...p, known_material: e.target.value }))}
                placeholder="例：K18 / SV925 / 絹本 / 紙本 / 鉄 など"
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>鑑定書・保証書の記載（任意 / コピペ可）</div>
              <textarea
                value={hints.certificate_text ?? ""}
                onChange={(e) => setHints((p) => ({ ...p, certificate_text: e.target.value }))}
                placeholder="例：4C、鑑別書番号、作家名、箱書の文言など"
                rows={isMobile ? 3 : 4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div>
              <div style={labelStyle}>補足（任意）</div>
              <textarea
                value={hints.notes ?? ""}
                onChange={(e) => setHints((p) => ({ ...p, notes: e.target.value }))}
                placeholder="例：購入先、年代の心当たり、箱書あり、共箱、付属品、気になる点など"
                rows={isMobile ? 3 : 4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>

            <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
              ※ここに入れた情報はAIが最優先で参照します（ただし画像と矛盾する場合は注意喚起します）
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#d1d5db", margin: "0 0 14px", lineHeight: 1.7 }}>
          最大 {MAX_FILES} 枚までアップロードできます。画像は長辺{MAX_LONG_SIDE}pxに自動圧縮されます。
        </p>

        {/* 査定モード */}
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

        {/* 出力モード（通常査定のみ） */}
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
            {/* ▼ モバイルは「写真を選択」「その場で撮影」を明示（Android対応） */}
            {isMobile ? (
              <>
                {/* hidden inputs */}
                <input ref={pickerRef} type="file" accept="image/*" multiple onChange={handleFileChange} style={{ display: "none" }} />
                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  capture={isAndroid ? "environment" : undefined}
                  multiple
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => pickerRef.current?.click()} style={ghostBtn}>
                    写真を選択（追加）
                  </button>

                  <button type="button" onClick={() => cameraRef.current?.click()} style={ghostBtn}>
                    その場で撮影（追加）
                  </button>

                  {files.length > 0 && (
                    <button type="button" onClick={clearFiles} style={dangerBtn}>
                      全削除
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10, lineHeight: 1.6 }}>
                  ・撮影/選択するたびに「画像が追加」されます（最大{MAX_FILES}枚）
                  <br />
                  ・1枚あたり最大10MB・合計25MBまで（元画像の目安）
                  <br />
                  ・送信エラー回避のため、背景はなるべくトリミングしてください。
                </div>
              </>
            ) : (
              <>
                {/* ▼ PCは従来通り（追加方式） */}
                <input type="file" accept="image/*" multiple onChange={handleFileChange} style={{ fontSize: 13, color: "#e5e7eb" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  {files.length > 0 && (
                    <button type="button" onClick={clearFiles} style={dangerBtn}>
                      全削除
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8, lineHeight: 1.6 }}>
                  ・選択するたびに「画像が追加」されます（最大{MAX_FILES}枚）
                  <br />
                  ・1枚あたり最大10MB・合計25MBまで（元画像の目安）
                  <br />
                  ・送信エラー回避のため、背景はなるべくトリミングしてください。
                </div>
              </>
            )}
          </div>

          {files.length > 0 && (
            <div style={{ margin: "0 0 12px" }}>
              <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18, color: "#e5e7eb" }}>
                {files.map((f, i) => (
                  <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        {f.name}（{Math.round(f.size / 1024)} KB）
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOne(i)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(148,163,184,0.45)",
                          background: "rgba(2,6,23,0.35)",
                          color: "#e5e7eb",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
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
            {loading ? (progressStage || "AIが査定しています…") : "AI査定を開始する"}
          </button>

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
      <section style={{ marginTop: isMobile ? 16 : 0, display: "flex", flexDirection: "column", gap: 14 }}>
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

            {/* まとめ査定 */}
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
                    <div
                      key={idx}
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(148,163,184,0.25)",
                        background: "rgba(2,6,23,0.35)",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{p.item_name}</div>
                      {p.price_hint && <div style={{ marginTop: 4, fontSize: 12, color: "#cbd5f5" }}>目安: {p.price_hint}</div>}
                      {p.notes && <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>{p.notes}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 通常査定 */}
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
                      <input readOnly value={result.mercari_title ?? ""} style={inputStyle} />
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
                      <textarea readOnly value={result.mercari_description ?? ""} rows={isMobile ? 6 : 8} style={{ ...inputStyle, resize: "vertical" }} />
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
                    <input readOnly value={result.auction_title ?? ""} placeholder="（生成されます）" style={inputStyle} />
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
