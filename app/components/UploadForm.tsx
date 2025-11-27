"use client";

import React, { useState } from "react";

type AssessResponse = {
  ok: boolean;
  error?: string;
  output_text?: string;
  mercari_title?: string;
  mercari_description?: string;
  confidence?: number | null;
};

export default function UploadForm() {
  // 最大3枚の画像
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [outputText, setOutputText] = useState("");
  const [mercariTitle, setMercariTitle] = useState("");
  const [mercariDescription, setMercariDescription] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);

  // ------ 画像選択 ------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const selected = Array.from(files).slice(0, 3); // 最大3枚
    setImageFiles(selected);

    // preview作成
    const readers = selected.map((file) => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((previewUrls) => {
      setImagePreviews(previewUrls);
    });

    setError(null);
  };

  // ------ 査定 ------
  const handleAssess = async () => {
    if (imagePreviews.length === 0) {
      setError("画像を選択してください。");
      return;
    }

    setLoading(true);
    setError(null);
    setOutputText("");
    setMercariTitle("");
    setMercariDescription("");
    setConfidence(null);

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: imagePreviews, // ← ３枚まとめて投げる
        }),
      });

      const json: AssessResponse = await res.json();

      if (!json.ok) {
        setError(json.error ?? "査定でエラーが発生しました。");
        return;
      }

      setOutputText(json.output_text ?? "");
      setMercariTitle(json.mercari_title ?? "");
      setMercariDescription(json.mercari_description ?? "");
      setConfidence(
        typeof json.confidence === "number" ? json.confidence : null
      );
    } catch (err) {
      console.error(err);
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 画像アップロード */}
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        disabled={loading}
      />

      {/* プレビュー（3枚） */}
      {imagePreviews.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {imagePreviews.map((src, idx) => (
            <img
              key={idx}
              src={src}
              alt={`preview-${idx}`}
              style={{ width: 120, borderRadius: 8 }}
            />
          ))}
        </div>
      )}

      {/* 査定ボタン */}
      <button
        type="button"
        onClick={handleAssess}
        disabled={loading}
        style={{
          padding: "10px 18px",
          background: "#2563eb",
          color: "#fff",
          borderRadius: 8,
          border: "none",
          cursor: "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "査定中..." : "査定する"}
      </button>

      {/* エラー */}
      {error && <p style={{ color: "red", fontSize: 12 }}>{error}</p>}

      {/* 結果：社内向けコメント */}
      {outputText && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>査定コメント（社内用）</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{outputText}</p>

          {/* 真贋％ */}
          {confidence !== null && (
            <p
              style={{
                marginTop: 8,
                fontWeight: "bold",
                color:
                  confidence >= 80
                    ? "#15803d"
                    : confidence >= 60
                    ? "#ca8a04"
                    : "#b91c1c",
              }}
            >
              真贋信頼度：{confidence}%
            </p>
          )}
        </div>
      )}

      {/* メルカリ用タイトル */}
      {mercariTitle && (
        <div>
          <h3>メルカリ用タイトル</h3>
          <p
            style={{
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "#fff",
            }}
          >
            {mercariTitle}
          </p>
        </div>
      )}

      {/* メルカリ用説明文 */}
      {mercariDescription && (
        <div>
          <h3>メルカリ用説明文</h3>
          <textarea
            readOnly
            rows={10}
            value={mercariDescription}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 13,
            }}
          />
        </div>
      )}
    </div>
  );
}
