// app/components/UploadForm.tsx
"use client";

import React, { FormEvent, useState } from "react";

// 画像をクライアント側でリサイズして dataURL を返す関数
async function resizeImage(
  file: File,
  maxSize = 1024,
  quality = 0.7
): Promise<string> {
  // 画像ファイルを dataURL として読み込む
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  // Image に読み込んでキャンバスで縮小
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = (err) => reject(err);
    image.src = dataUrl;
  });

  let { width, height } = img;

  // 長辺が maxSize を超える場合のみ縮小
  if (width > height && width > maxSize) {
    height = (height * maxSize) / width;
    width = maxSize;
  } else if (height > width && height > maxSize) {
    width = (width * maxSize) / height;
    height = maxSize;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not available");

  ctx.drawImage(img, 0, 0, width, height);

  // JPEG で圧縮（quality 0.7 くらいならかなり軽くなる）
  const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
  return compressedDataUrl;
}

export default function UploadForm() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(Array.from(e.target.files));
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (files.length === 0) {
      setError("画像ファイルを選択してください。");
      return;
    }

    try {
      setLoading(true);

      // ⚠️ ここで全画像をリサイズ＆圧縮する
      const resizedImages = await Promise.all(
        files.map((file) => resizeImage(file, 1024, 0.7))
      );

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // 以前と同じ形： images: string[]（dataURL の配列）
        body: JSON.stringify({
          images: resizedImages,
        }),
      });

      if (res.status === 413) {
        setError(
          "画像の合計サイズが大きすぎます。枚数を減らすか、もっと小さい画像でお試しください。"
        );
        return;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("API error:", res.status, text);
        setError(`査定に失敗しました。（${res.status}）`);
        return;
      }

      const json = await res.json().catch(() => null);
      setResult(JSON.stringify(json, null, 2));
    } catch (err: any) {
      console.error(err);
      setError("通信中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
      <div>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
        />
        <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          ※ 最大 3 枚程度まで推奨。長辺 1024px・JPEG 圧縮でサーバーに送信します。
        </p>
      </div>

      {files.length > 0 && (
        <ul style={{ fontSize: 12, paddingLeft: 16 }}>
          {files.map((f) => (
            <li key={f.name}>
              {f.name} ({Math.round(f.size / 1024)} KB)
            </li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={loading || files.length === 0}
        style={{
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 999,
          padding: "10px 24px",
          fontSize: 14,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "査定中..." : "AI査定開始"}
      </button>

      {error && (
        <div style={{ color: "crimson", fontSize: 13, whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}

      {result && (
        <pre
          style={{
            marginTop: 8,
            padding: 8,
            background: "#f9fafb",
            borderRadius: 8,
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {result}
        </pre>
      )}
    </form>
  );
}
