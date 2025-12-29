// app/components/UploadForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type ListingMode = "flea" | "auction";

type AssessResponse = {
  ok: boolean;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
  auction_title?: string;
  listing_mode?: ListingMode;
  confidence?: number | null;
  genre?: string | null;
  item_name?: string | null;
  junk_mode?: boolean;
  error?: string;
};

// ★ 5枚
const MAX_FILES = 5;

// 元画像の容量制限（目安）
const MAX_ORIGINAL_SIZE_PER_FILE = 10 * 1024 * 1024; // 10MB/枚
const MAX_ORIGINAL_TOTAL_SIZE = 25 * 1024 * 1024; // 合計25MB（元画像の目安）

// 軽量化
const MAX_LONG_SIDE = 720;
const JPEG_QUALITY = 0.65;

// dataURL合計が大きいと送信で落ちやすいので事前ガード
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

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // 出力モード
  const [listingMode, setListingMode] = useState<ListingMode>("flea");

  // ★ ジャンクモード
  const [junkMode, setJunkMode] = useState(false);

  // 画面幅
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const limited = selected.slice(0, MAX_FILES);
    setFiles(limited);
    setResult(null);
    setErrorMsg(null);

    if (selected.length > MAX_FILES) {
      setErrorMsg(`画像は最大 ${MAX_FILES} 枚までです。最初の ${MAX_FILES} 枚だけ使用します。`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          setErrorMsg(
            "画像データが大きすぎて送信時にエラーになる可能性があります。画像を減らすか、不要な背景をトリミングして再度お試しください。"
          );
          setLoading(false);
          return;
        }

        imageUrls.push(dataUrl);
      }

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: imageUrls,
          user_id: userId,
          listing_mode: listingMode,
          junk_mode: junkMode, // ★追加
        }),
      });

      const json: AssessResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(json.error || "査定に失敗しました。時間をおいて再度お試しください。");
      } else {
        setResult(json);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("通信エラーが発生しました。ネットワーク環境を確認してください。");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("コピーしました");
    } catch {
      alert("コピーに失敗しました。手動で選択してコピーしてください。");
    }
  };

  const isFlea = listingMode === "flea";
  const isAuction = listingMode === "auction";

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
        <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, margin: "0 0 4px" }}>査定する</h2>
        <p style={{ fontSize: 12, color: "#d1d5db", margin: "0 0 14px", lineHeight: 1.7 }}>
          最大 {MAX_FILES} 枚までアップロードできます。画像は長辺{MAX_LONG_SIDE}pxに自動圧縮され、
          真贋・相場・出品用タイトル／説明文まで生成します（選んだモードのみ生成してトークン節約）。
        </p>

        {/* 出力モード */}
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

          {/* ★ ジャンクモード */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px solid rgba(148,163,184,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 700 }}>ジャンクモード</div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
                動作未確認・現状渡し前提で「ジャンク実売レンジ」を優先して提示します。
              </div>
            </div>

            <button
              type="button"
              onClick={() => setJunkMode((v) => !v)}
              style={{
                minWidth: 92,
                padding: "8px 12px",
                borderRadius: 999,
                border: junkMode ? "1px solid rgba(245,158,11,0.9)" : "1px solid rgba(148,163,184,0.35)",
                background: junkMode ? "linear-gradient(to right, rgba(245,158,11,0.28), rgba(217,119,6,0.28))" : "rgba(2,6,23,0.35)",
                color: "#e5e7eb",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {junkMode ? "ON" : "OFF"}
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", lineHeight: 1.6 }}>
            ※出力内にサイト名は明記しません。オークション向けはタイトルが検索重視になります。
          </div>
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
              ・送信エラー回避のため、背景をなるべくトリミングしてください。
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
            }}
          >
            {errorMsg}
          </div>
        )}
      </section>

      {/* 右側 */}
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
            ・想定相場（控えめレンジ／ジャンク時は実売レンジ優先）
            <br />
            ・出品用タイトル／説明文（選択したモードのみ）
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>査定コメント</h3>
                {(result.junk_mode || junkMode) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(245,158,11,0.55)",
                      background: "rgba(245,158,11,0.12)",
                      color: "#fde68a",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ジャンク
                  </span>
                )}
              </div>

              <p style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.7, marginTop: 8 }}>{result.output_text}</p>

              <div style={{ marginTop: 8, fontSize: 11, color: "#cbd5f5" }}>
                信頼度: {typeof result.confidence === "number" ? `${result.confidence}%` : "不明"}
                {"　"}ジャンル: {result.genre ?? "不明"}
                {"　"}型名: {result.item_name ?? "不明"}
                {"　"}モード: {isAuction ? "オークション" : "フリマ"}
              </div>
            </section>

            {/* フリマ用（タブがフリマのときだけ表示） */}
            {isFlea && (
              <>
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
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>フリマ用タイトル</h3>
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
                    placeholder="（フリマ向けのときに生成されます）"
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
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>フリマ用説明文</h3>
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
                    placeholder="（フリマ向けのときに生成されます）"
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

            {/* オークション用（タブがオークションのときだけ表示） */}
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
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>オークション用タイトル</h3>
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
                  placeholder="（オークション向けのときに生成されます）"
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
          </div>
        )}
      </section>
    </div>
  );
}
