// app/components/UploadForm.tsx
"use client";

import React, { useState, FormEvent, ChangeEvent } from "react";

type AssessResponse = {
  ok?: boolean;
  output_text?: string;            // ここに ```json ...``` が入ってくることがある
  mercari_title?: string;
  mercari_description?: string;
  confidence?: number;
  genre?: string;
  item_name?: string;
  error?: string;
  [key: string]: any;
};

const MAX_FILES = 3;
const MAX_FILE_SIZE_MB = 1.1;
const MAX_TOTAL_SIZE_MB = 2.8;

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * ```json\n{ ... }\n``` みたいな文字列から JSON オブジェクトを取り出す
 */
function parseEmbeddedJson(raw?: string): any | null {
  if (!raw) return null;
  try {
    // 最初の { と最後の } を探して、その間だけを JSON としてパース
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const jsonText = raw.slice(start, end + 1);
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/**
 * ```json や ``` などコードフェンスを軽く取り除く
 */
function stripCodeFence(text: string): string {
  if (!text) return "";
  let t = text.trim();
  if (t.startsWith("```")) {
    // 最初の改行まで飛ばす
    const firstNewline = t.indexOf("\n");
    if (firstNewline !== -1) {
      t = t.slice(firstNewline + 1);
    }
  }
  if (t.endsWith("```")) {
    t = t.slice(0, t.lastIndexOf("```"));
  }
  return t.trim();
}

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setResult(null);
    setRawJson(null);

    const list = Array.from(e.target.files ?? []);
    const selected = list.slice(0, MAX_FILES);
    setFiles(selected);

    const urls = selected.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);

    if (selected.length) {
      const perErrors: string[] = [];
      let totalSize = 0;
      selected.forEach((f) => {
        const mb = f.size / (1024 * 1024);
        totalSize += mb;
        if (mb > MAX_FILE_SIZE_MB) {
          perErrors.push(`${f.name}: 約 ${mb.toFixed(2)}MB`);
        }
      });
      if (perErrors.length) {
        setError(
          `画像が大きすぎる可能性があります：\n` +
            perErrors.join("\n") +
            `\n\n長辺を縮小してから再アップロードしてください。`
        );
      } else if (totalSize > MAX_TOTAL_SIZE_MB) {
        setError(
          `3枚合計のサイズが大きめです（約 ${totalSize.toFixed(
            2
          )}MB）。413エラーが出る場合は、画像を少し小さくしてください。`
        );
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setRawJson(null);

    if (!files.length) {
      setError("画像ファイルを選択してください。");
      return;
    }

    setLoading(true);
    try {
      const dataUrls: string[] = [];
      for (const f of files) {
        dataUrls.push(await fileToDataUrl(f));
      }

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: dataUrls }),
      });

      if (!res.ok) {
        if (res.status === 413) {
          setError(
            "画像データが大きすぎます（413）。画像サイズを小さくするか、枚数を減らして再アップしてください。"
          );
        } else {
          const text = await res.text();
          setError(
            `サーバーエラーが発生しました（${res.status}）。\n${text}`.slice(
              0,
              400
            )
          );
        }
        return;
      }

      const json: AssessResponse = await res.json();
      setResult(json);
      setRawJson(JSON.stringify(json, null, 2));

      if (json.error && !json.ok) {
        setError(json.error);
      }
    } catch (err) {
      console.error(err);
      setError("ネットワークエラーが発生しました。時間をおいて再試行してください。");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      alert("コピーしました。");
    } catch {
      alert("コピーに失敗しました。テキストを選択してコピーしてください。");
    }
  };

  const prettyOutput = (text?: string) => (text ?? "").replace(/\\n/g, "\n");

  // ====== ここから「表示用データの整形」 ======

  const embedded = parseEmbeddedJson(result?.output_text);

  const commentText: string | undefined =
    embedded?.output_text ??
    embedded?.comment ??
    (result?.output_text ? stripCodeFence(result.output_text) : undefined);

  const mercariTitle: string | undefined =
    embedded?.mercari_title ?? result?.mercari_title;

  const mercariDescription: string | undefined =
    embedded?.mercari_description ?? result?.mercari_description;

  const confidence: number | undefined =
    typeof embedded?.confidence === "number"
      ? embedded.confidence
      : result?.confidence;

  const genre: string | undefined = embedded?.genre ?? result?.genre;
  const itemName: string | undefined = embedded?.item_name ?? result?.item_name;

  // =========================================

  return (
    <form onSubmit={handleSubmit}>
      {/* ファイル選択 */}
      <div
        style={{
          border: "1px dashed #cbd5e1",
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
          background: "#f8fafc",
        }}
      >
        <label
          style={{
            display: "block",
            fontSize: 13,
            marginBottom: 8,
            fontWeight: 500,
          }}
        >
          画像ファイルを選択（最大 {MAX_FILES} 枚）
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          style={{ marginBottom: 8 }}
        />
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
          ・スマホ写真はそのままだとサイズが大きいことがあります。
          <br />
          ・長辺 1024px 程度に縮小すると 413 エラーが出にくくなります。
        </div>
      </div>

      {/* プレビュー */}
      {previewUrls.length > 0 && (
        <div
          style={{
            marginBottom: 16,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #e5e7eb",
          }}
        >
          {previewUrls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`プレビュー${i + 1}`}
              style={{
                width: "100%",
                height: "auto",
                display: "block",
                maxHeight: 300,
                objectFit: "contain",
                background: "#000",
                borderBottom:
                  i === previewUrls.length - 1
                    ? "none"
                    : "1px solid #e5e7eb",
              }}
            />
          ))}
        </div>
      )}

      {/* ボタン */}
      <button
        type="submit"
        disabled={!files.length || loading}
        style={{
          width: "100%",
          padding: "14px 0",
          borderRadius: 999,
          border: "none",
          background: loading ? "#60a5fa" : "#2563eb",
          color: "#fff",
          fontWeight: 600,
          fontSize: 15,
          cursor: !files.length || loading ? "not-allowed" : "pointer",
          boxShadow: "0 4px 12px rgba(37, 99, 235, 0.35)",
          marginBottom: 16,
        }}
      >
        {loading ? "AI査定中…" : "AI査定開始"}
      </button>

      {/* エラー */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 8,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 13,
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {/* 結果 */}
      {result && !error && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 査定コメント */}
          {commentText && (
            <section
              style={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: 16,
                background: "#ffffff",
              }}
            >
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                査定コメント
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {prettyOutput(commentText)}
              </p>

              <div
                style={{
                  marginTop: 10,
                  fontSize: 11,
                  color: "#6b7280",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                {typeof confidence === "number" && (
                  <span>信頼度：{confidence}%</span>
                )}
                {genre && <span>ジャンル：{genre}</span>}
                {itemName && <span>推定名：{itemName}</span>}
              </div>
            </section>
          )}

          {/* メルカリ用タイトル */}
          {mercariTitle && (
            <section
              style={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: 16,
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  メルカリ用タイトル
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(mercariTitle)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                    cursor: "pointer",
                  }}
                >
                  コピー
                </button>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {mercariTitle}
              </p>
            </section>
          )}

          {/* メルカリ用説明文 */}
          {mercariDescription && (
            <section
              style={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                padding: 16,
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 6,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  メルカリ用説明文
                </h3>
                <button
                  type="button"
                  onClick={() => copyToClipboard(mercariDescription)}
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid #d1d5db",
                    background: "#f9fafb",
                    cursor: "pointer",
                  }}
                >
                  コピー
                </button>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                }}
              >
                {prettyOutput(mercariDescription)}
              </p>
            </section>
          )}

          {/* デバッグ用 JSON（折りたたみ） */}
          {rawJson && (
            <details
              style={{
                marginTop: 8,
                borderRadius: 8,
                border: "1px dashed #e5e7eb",
                padding: 8,
                background: "#f9fafb",
              }}
            >
              <summary style={{ fontSize: 12, cursor: "pointer" }}>
                デバッグ用の生 JSON を表示
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  whiteSpace: "pre-wrap",
                  overflowX: "auto",
                }}
              >
                {rawJson}
              </pre>
            </details>
          )}
        </div>
      )}
    </form>
  );
}
