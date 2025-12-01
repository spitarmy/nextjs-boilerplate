// app/components/UploadForm.tsx
"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type AssessResponse = {
  ok: boolean;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
  confidence?: number | null;
  genre?: string | null;
  item_name?: string | null;
  error?: string;
};

const MAX_FILES = 3;

// 元画像の容量制限（かなりゆるめ）
const MAX_ORIGINAL_SIZE_PER_FILE = 10 * 1024 * 1024; // 10MB/枚
const MAX_ORIGINAL_TOTAL_SIZE = 25 * 1024 * 1024;    // 3枚合計 25MB

// 圧縮後の長辺ピクセル
const MAX_LONG_SIDE = 800;

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

  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  URL.revokeObjectURL(url);
  return dataUrl;
}

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
    })();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const limited = selected.slice(0, MAX_FILES);
    setFiles(limited);
    setResult(null);
    setErrorMsg(null);
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

    // 元画像の容量チェック
    let totalSize = 0;
    for (const f of files) {
      totalSize += f.size;

      if (f.size > MAX_ORIGINAL_SIZE_PER_FILE) {
        setErrorMsg(
          "元の画像ファイルの容量が大きすぎます（10MB超）。解像度を下げてからお試しください。"
        );
        return;
      }
    }

    if (totalSize > MAX_ORIGINAL_TOTAL_SIZE) {
      setErrorMsg(
        "画像の合計容量が大きすぎます（25MB超）。枚数を減らすか解像度を下げてください。"
      );
      return;
    }

    setLoading(true);

    try {
      // 画像を圧縮して dataURL に変換
      const imageUrls: string[] = [];
      for (const file of files) {
        const dataUrl = await fileToCompressedDataUrl(file);
        imageUrls.push(dataUrl);
      }

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_urls: imageUrls, user_id: userId }),
      });

      const json: AssessResponse = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(
          json.error || "査定に失敗しました。時間をおいて再度お試しください。"
        );
      } else {
        setResult(json);
      }
    } catch (err: any) {
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

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
          />
        </div>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 12 }}>
          ※ 最大 {MAX_FILES} 枚まで選択可能。長辺 800px に圧縮して送信します。
        </div>

        {files.length > 0 && (
          <ul style={{ fontSize: 12, marginBottom: 12 }}>
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
            padding: "12px 16px",
            borderRadius: 999,
            border: "none",
            background: "#2563eb",
            color: "#fff",
            fontSize: 16,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "AI査定中..." : "AI査定開始"}
        </button>
      </form>

      {errorMsg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 14,
          }}
        >
          {errorMsg}
        </div>
      )}

      {result && result.ok && (
        <div style={{ marginTop: 24, display: "grid", gap: 16 }}>
          {/* 査定コメント */}
          <section
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>査定コメント</h3>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>
              {result.output_text}
            </p>
            <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
              信頼度:{" "}
              {typeof result.confidence === "number"
                ? `${result.confidence}%`
                : "不明"}
              {"　"}
              ジャンル: {result.genre ?? "不明"}
              {"　"}
              型名: {result.item_name ?? "不明"}
            </div>
          </section>

          {/* メルカリ用タイトル */}
          <section
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>メルカリ用タイトル</h3>
              <button
                type="button"
                onClick={() => copyToClipboard(result.mercari_title)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
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
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </section>

          {/* メルカリ用説明文 */}
          <section
            style={{
              padding: 16,
              borderRadius: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>メルカリ用説明文</h3>
              <button
                type="button"
                onClick={() => copyToClipboard(result.mercari_description)}
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                コピー
              </button>
            </div>
            <textarea
              readOnly
              value={result.mercari_description ?? ""}
              rows={8}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
                resize: "vertical",
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
