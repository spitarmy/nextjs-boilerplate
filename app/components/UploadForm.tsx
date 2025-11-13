"use client";

import React, { useState } from "react";

type AssessResponse = {
  ok: boolean;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
  error?: string;
};

export default function UploadForm() {
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [mercariTitle, setMercariTitle] = useState("");
  const [mercariDescription, setMercariDescription] = useState("");

  // 画像選択時：File → data URL(base64) に変換
  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      setPreviewUrls([]);
      return;
    }

    // 枚数はとりあえず最大3枚まで
    const maxFiles = 3;
    const selected = Array.from(files).slice(0, maxFiles);

    const readAsDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file); // ← ここで data:image/jpeg;base64,... 形式にする
      });

    try {
      const dataUrls = await Promise.all(selected.map(readAsDataUrl));
      setPreviewUrls(dataUrls);
      setError("");
    } catch (err) {
      console.error(err);
      setError("画像の読み込み中にエラーが発生しました。");
    }
  };

  // 「査定する」ボタン押下
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("");
    setError("");

    if (previewUrls.length === 0) {
      setError("画像を選択してください。");
      return;
    }

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: previewUrls, // data URL の配列をそのまま渡す
        }),
      });

      const data: AssessResponse = await res.json();

      if (!res.ok || !data.ok) {
        console.error("assess error", data);
        setError(data.error ?? "査定処理中にエラーが発生しました。");
        return;
      }

      setStatus("査定が完了しました。");

      setMercariTitle(
        data.mercari_title && data.mercari_title.trim() !== ""
          ? data.mercari_title
          : "【仮】カンテノ自動査定"
      );

      setMercariDescription(
        data.mercari_description && data.mercari_description.trim() !== ""
          ? data.mercari_description
          : data.output_text ?? ""
      );
    } catch (err) {
      console.error(err);
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ padding: 16 }}>
      {/* 画像選択 */}
      <div>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesSelected}
        />
      </div>

      {/* プレビュー */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {previewUrls.map((url, idx) => (
          <img
            key={idx}
            src={url}
            alt={`preview-${idx}`}
            style={{
              maxWidth: 240,
              maxHeight: 240,
              objectFit: "contain",
              border: "1px solid #ddd",
            }}
          />
        ))}
      </div>

      {/* ボタン */}
      <div style={{ marginTop: 16 }}>
        <button type="submit">査定する</button>
      </div>

      {/* ステータス／エラー表示 */}
      {status && (
        <p style={{ color: "green", marginTop: 8 }}>
          {status}
        </p>
      )}
      {error && (
        <p style={{ color: "red", marginTop: 8 }}>
          Error: {error}
        </p>
      )}

      {/* メルカリ用 出力 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <strong>メルカリ用タイトル</strong>
          <div>
            {mercariTitle || "【仮】カンテノ自動査定"}
          </div>
        </div>

        <div>
          <strong>メルカリ用説明文</strong>
          <div style={{ whiteSpace: "pre-wrap" }}>
            {mercariDescription ||
              "一時的なエラーにより査定結果を表示できませんでした。時間をおいて再度お試しください。"}
          </div>
        </div>
      </div>
    </form>
  );
}
