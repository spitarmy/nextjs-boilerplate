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

  plan?: string;

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
const MAX_LONG_SIDE_DEFAULT = 1024;
const MAX_LONG_SIDE_MANY = 768; // 4枚以上の場合は小さくして速度改善
const JPEG_QUALITY = 0.80;
function getMaxLongSide(fileCount: number): number {
  return fileCount >= 4 ? MAX_LONG_SIDE_MANY : MAX_LONG_SIDE_DEFAULT;
}

// ★ 画像を圧縮してBlobとして返す
async function fileToCompressedBlob(file: File, maxLongSide: number = MAX_LONG_SIDE_DEFAULT): Promise<Blob> {
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
  const scale = Math.min(1, maxLongSide / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(url);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

// ★ 署名URL方式: 画像をSupabase Storageに直接アップロードし、publicURLを返す
async function uploadImageToStorage(file: File, maxLongSide: number = MAX_LONG_SIDE_DEFAULT): Promise<string> {
  // 1. 画像を圧縮
  const blob = await fileToCompressedBlob(file, maxLongSide);

  // 2. 署名付きURLを取得
  const filename = file.name || "image.jpg";
  const urlRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  const urlData = await urlRes.json();
  if (!urlData.ok) throw new Error(urlData.message || "署名URL取得失敗");

  // 3. Supabase Storageに直接アップロード
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const uploadEndpoint = `${supabaseUrl}/storage/v1/object/${urlData.bucket}/${urlData.path}`;
  const uploadRes = await fetch(uploadEndpoint, {
    method: "PUT",
    headers: {
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
      Authorization: `Bearer ${urlData.token}`,
    },
    body: blob,
  });

  if (!uploadRes.ok) {
    throw new Error(`アップロード失敗: ${uploadRes.status}`);
  }

  // 4. publicURLを返す
  return urlData.publicUrl;
}

// ★ data URL方式（フォールバック用）
async function fileToCompressedDataUrl(file: File, maxLongSide: number = MAX_LONG_SIDE_DEFAULT): Promise<string> {
  const blob = await fileToCompressedBlob(file, maxLongSide);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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

  const [usage, setUsage] = useState<{ used_units: number; limit_units: number | null; overage_units: number } | null>(null);

  const [userPlan, setUserPlan] = useState<"light" | "pro">("light");

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

  // ★ 追加写真で再査定
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [additionalLoading, setAdditionalLoading] = useState(false);
  const additionalPickerRef = useRef<HTMLInputElement | null>(null);

  // ★ モバイルで「写真選択」「その場で撮影」を出すための hidden input
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const isFlea = listingMode === "flea";
  const isAuction = listingMode === "auction";

  const usagePercent = useMemo(() => {
    if (!usage || usage.limit_units === null) return 0; // プロプランは無制限
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
      if (res.ok && json?.ok) {
        setUsage(json.usage);
        if (json.plan) setUserPlan(json.plan);
      }
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
  };

  const removeOne = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
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

  const submitInternal = async () => {
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
    setProgressStage("画像をアップロード中...");

    try {
      const imageUrls: string[] = [];

      const maxSide = getMaxLongSide(files.length);

      for (let i = 0; i < files.length; i++) {
        setProgressStage(`画像をアップロード中... (${i + 1}/${files.length})`);
        try {
          // 署名URL方式でアップロード
          const publicUrl = await uploadImageToStorage(files[i], maxSide);
          imageUrls.push(publicUrl);
        } catch (uploadErr) {
          // フォールバック: 署名URL失敗時はdata URLで送信
          console.warn("署名URLアップロード失敗、data URLで代替:", uploadErr);
          const dataUrl = await fileToCompressedDataUrl(files[i], maxSide);
          imageUrls.push(dataUrl);
        }
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
          user_hints: Object.keys(userHints).length ? userHints : null,
        }),
      });

      // 認証エラー → ログインページへ
      if (res.status === 401) {
        window.localStorage.removeItem("kanteno_logged_in");
        window.location.href = "/login?expired=1";
        return;
      }

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
              } else if (eventType === "error") {
                const json = data as AssessResponse;
                if (json?.usage) setUsage(json.usage);
                if (json?.over_limit) {
                  setResult(json);
                  setErrorMsg(json.error || "今月の上限に達しました。プロプランへのアップグレードをご検討ください。");
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
          setErrorMsg(json.error || "今月の上限に達しました。プロプランへのアップグレードをご検討ください。");
          return;
        }

        if (!res.ok || !json.ok) {
          setErrorMsg(json.error || "査定に失敗しました。時間をおいて再度お試しください。");
        } else {
          setResult(json);
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
    await submitInternal();
  };

  // ★ 追加写真で再査定
  const submitAdditionalPhotos = async () => {
    if (!additionalFiles.length || !result) return;

    setErrorMsg(null);
    setAdditionalLoading(true);
    setProgressStage("追加写真を圧縮中...");

    try {
      // 元の画像を署名URLでアップロード
      const originalUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgressStage(`元画像をアップロード中... (${i + 1}/${files.length})`);
        try {
          const publicUrl = await uploadImageToStorage(files[i]);
          originalUrls.push(publicUrl);
        } catch {
          const dataUrl = await fileToCompressedDataUrl(files[i]);
          originalUrls.push(dataUrl);
        }
      }

      // 追加写真をアップロード
      const additionalUrls: string[] = [];
      for (let i = 0; i < additionalFiles.length; i++) {
        setProgressStage(`追加写真をアップロード中... (${i + 1}/${additionalFiles.length})`);
        try {
          const publicUrl = await uploadImageToStorage(additionalFiles[i]);
          additionalUrls.push(publicUrl);
        } catch {
          const dataUrl = await fileToCompressedDataUrl(additionalFiles[i]);
          additionalUrls.push(dataUrl);
        }
      }

      const allImageUrls = [...originalUrls, ...additionalUrls];

      // ヒントを構築
      const userHints: UserHints = {};
      (Object.keys(hints) as (keyof UserHints)[]).forEach((k) => {
        const v = (hints[k] ?? "").toString().trim();
        if (v) userHints[k] = v;
      });

      // 前回の査定結果をnotesに追加（AIに前回のコンテキストを伝える）
      const prevContext = [
        `【前回の査定結果（追加写真による再査定）】`,
        `前回の判定: 信頼度 ${result.confidence ?? "不明"}%`,
        `前回のジャンル: ${result.genre ?? "不明"}`,
        `前回の型名: ${result.item_name ?? "不明"}`,
        `前回のコメント抜粋: ${(result.output_text ?? "").slice(0, 300)}`,
        ``,
        `上記は前回の査定結果です。今回は追加写真（${additionalFiles.length}枚）が追加されています。`,
        `前回「要追加写真」と判定された部位を重点的に確認し、より確度の高い判定を行ってください。`,
      ].join("\n");

      const mergedHints = {
        ...userHints,
        notes: userHints.notes
          ? `${userHints.notes}\n\n${prevContext}`
          : prevContext,
      };

      setProgressStage("サーバーに送信中...");

      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_urls: allImageUrls,
          user_id: userId,
          listing_mode: listingMode,
          assess_mode: assessMode,
          user_hints: mergedHints,
        }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() || "";

          for (const block of events) {
            if (!block.trim()) continue;
            const lines = block.split("\n");
            let eventType = "";
            let eventData = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim();
              else if (line.startsWith("data: ")) eventData = line.slice(6);
            }
            if (!eventType || !eventData) continue;
            try {
              const data = JSON.parse(eventData);
              if (eventType === "progress") {
                setProgressStage(data.message || "再査定中...");
              } else if (eventType === "result") {
                const json = data as AssessResponse;
                if (json?.usage) setUsage(json.usage);
                setResult(json);
                setAdditionalFiles([]);
              } else if (eventType === "error") {
                const json = data as AssessResponse;
                if (json?.usage) setUsage(json.usage);
                setErrorMsg(json.error || "再査定に失敗しました。");
              }
            } catch { /* ignore */ }
          }
        }
      } else {
        const json: AssessResponse = await res.json();
        if (json?.usage) setUsage(json.usage);
        if (json.ok) {
          setResult(json);
          setAdditionalFiles([]);
        } else {
          setErrorMsg(json.error || "再査定に失敗しました。");
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("通信エラーが発生しました。");
    } finally {
      setAdditionalLoading(false);
      setProgressStage(null);
    }
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

        {/* 月次利用数 + プラン */}
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
            <div style={{ fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{
                backgroundColor: userPlan === "pro" ? "rgba(147,51,234,0.25)" : "rgba(37,99,235,0.25)",
                color: userPlan === "pro" ? "#c4b5fd" : "#93c5fd",
                padding: "2px 8px",
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 700,
              }}>
                {userPlan === "pro" ? "PRO" : "LIGHT"}
              </span>
              今月の利用数
            </div>
            <div style={{ fontSize: 12, color: "#cbd5f5" }}>
              {usage
                ? userPlan === "pro"
                  ? `${usage.used_units} 件（使い放題）`
                  : `${usage.used_units} / ${usage.limit_units}`
                : "読み込み中…"}
            </div>
          </div>
          {userPlan === "light" && (
            <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "rgba(148,163,184,0.25)", overflow: "hidden" }}>
              <div style={{ width: `${usagePercent}%`, height: "100%", background: usagePercent >= 90 ? "linear-gradient(to right, #ef4444, #dc2626)" : "linear-gradient(to right, rgba(37,99,235,0.7), rgba(79,70,229,0.7))" }} />
            </div>
          )}
          {userPlan === "light" && usage && usage.limit_units !== null && usage.used_units >= usage.limit_units && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#fca5a5" }}>
              ⚠️ 今月の上限に達しました。プロプランへのアップグレードをご検討ください。
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
          最大 {MAX_FILES} 枚までアップロードできます。画像は自動圧縮されます。
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
            {loading ? "処理中..." : "AI査定を開始する"}
          </button>



          {/* ★ AI思考プロセス可視化UI */}
          {loading && (
            <div style={{ marginTop: 16, padding: 16, background: "rgba(248, 250, 252, 0.05)", borderRadius: 12, border: "1px solid rgba(226, 232, 240, 0.1)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#93c5fd", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", animation: "spin 2s linear infinite" }}>⚙️</span> AI思考プロセス
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, fontFamily: "monospace" }}>
                <div style={{ color: progressStage?.includes("アップロード") ? "#60a5fa" : "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
                  {progressStage?.includes("アップロード") ? <span style={{ animation: "pulse 1.5s infinite" }}>⏳ 画像を分析エンジンへ転送中...</span> : "✅ 転送完了"}
                </div>
                {(progressStage?.includes("ジャンル") || progressStage?.includes("リファレンス") || progressStage?.includes("査定") || progressStage?.includes("保存") || progressStage?.includes("生成")) && (
                  <div style={{ color: progressStage?.includes("ジャンル") ? "#60a5fa" : "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
                    {progressStage?.includes("ジャンル") ? <span style={{ animation: "pulse 1.5s infinite" }}>⏳ 一次AI: ジャンルと特徴を抽出中...</span> : "✅ 一次AI: 特徴抽出完了"}
                  </div>
                )}
                {(progressStage?.includes("リファレンス") || progressStage?.includes("査定") || progressStage?.includes("保存") || progressStage?.includes("生成")) && (
                  <div style={{ color: progressStage?.includes("リファレンス") ? "#60a5fa" : "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
                    {progressStage?.includes("リファレンス") ? <span style={{ animation: "pulse 1.5s infinite" }}>⏳ 自社データベースと照合中...</span> : "✅ データベース照合完了"}
                  </div>
                )}
                {(progressStage?.includes("査定") || progressStage?.includes("保存") || progressStage?.includes("生成")) && (
                  <div style={{ color: (progressStage?.includes("査定") || progressStage?.includes("生成")) ? "#60a5fa" : "#34d399", display: "flex", alignItems: "center", gap: 6 }}>
                    {(progressStage?.includes("査定") || progressStage?.includes("生成")) ? <span style={{ animation: "pulse 1.5s infinite" }}>⏳ 二次AI: 真贋判定・相場算定・文章生成中...</span> : "✅ 二次AI: 算定完了"}
                  </div>
                )}
              </div>
              <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
              `}</style>
            </div>
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
              <div style={{ marginTop: 8, fontSize: 12, color: "#cbd5f5", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  信頼度: 
                  {typeof result.confidence === "number" ? (
                    <span style={{
                      backgroundColor: result.confidence >= 80 ? "#dcfce7" : result.confidence >= 60 ? "#fef08a" : "#fee2e2",
                      color: result.confidence >= 80 ? "#166534" : result.confidence >= 60 ? "#854d0e" : "#991b1b",
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: 700,
                      fontSize: 11
                    }}>
                      {result.confidence >= 80 ? "🟢高" : result.confidence >= 60 ? "🟡中" : "🔴低"} ({result.confidence}%)
                    </span>
                  ) : "不明"}
                </span>
                <span>{"　"}ジャンル: {result.genre ?? "不明"}</span>
                <span>{"　"}型名: {result.item_name ?? "不明"}</span>
                <span>{"　"}モード: {result.assess_mode === "bundle" ? "まとめ査定" : isAuction ? "オークション" : "フリマ"}</span>
              </div>
            </section>

            {/* ★ 追加写真で再査定（信頼度60-79% = 要追加写真） */}
            {typeof result.confidence === "number" && result.confidence >= 60 && result.confidence < 80 && (
              <section
                style={{
                  padding: isMobile ? 14 : 16,
                  borderRadius: 16,
                  background: "radial-gradient(circle at top left, rgba(234,179,8,0.18), #0f172a)",
                  border: "1px solid rgba(234,179,8,0.5)",
                  color: "#e5e7eb",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>
                  📷 追加写真で再査定
                </h3>
                <p style={{ fontSize: 12, lineHeight: 1.7, margin: "0 0 12px", color: "#e2e8f0" }}>
                  真贋判定に追加の写真が必要です。査定コメントで指示された部位（刻印、内側、底面など）の写真を追加して再査定できます。
                </p>

                {/* 追加写真選択 */}
                <input
                  ref={additionalPickerRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files ?? []);
                    setAdditionalFiles((prev) => [...prev, ...newFiles].slice(0, 5));
                    e.target.value = "";
                  }}
                />

                <button
                  type="button"
                  onClick={() => additionalPickerRef.current?.click()}
                  disabled={additionalLoading}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px dashed rgba(234,179,8,0.6)",
                    background: "rgba(234,179,8,0.08)",
                    color: "#fbbf24",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: additionalLoading ? "default" : "pointer",
                    marginBottom: additionalFiles.length > 0 ? 10 : 0,
                  }}
                >
                  📎 追加写真を選択（最大5枚）
                </button>

                {/* 追加写真プレビュー */}
                {additionalFiles.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 6 }}>
                      追加写真: {additionalFiles.length}枚選択済み
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {additionalFiles.map((f, i) => (
                        <div
                          key={i}
                          style={{
                            position: "relative",
                            width: 56,
                            height: 56,
                            borderRadius: 8,
                            overflow: "hidden",
                            border: "1px solid rgba(234,179,8,0.4)",
                          }}
                        >
                          <img
                            src={URL.createObjectURL(f)}
                            alt={`追加${i + 1}`}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <button
                            type="button"
                            onClick={() => setAdditionalFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            style={{
                              position: "absolute",
                              top: 2,
                              right: 2,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              border: "none",
                              background: "rgba(0,0,0,0.7)",
                              color: "#fff",
                              fontSize: 10,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 再査定ボタン */}
                {additionalFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={submitAdditionalPhotos}
                    disabled={additionalLoading}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 12,
                      border: "none",
                      background: additionalLoading
                        ? "linear-gradient(to right, #92400e, #78350f)"
                        : "linear-gradient(to right, #d97706, #b45309)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: additionalLoading ? "default" : "pointer",
                      boxShadow: "0 4px 12px rgba(217,119,6,0.3)",
                    }}
                  >
                    {additionalLoading
                      ? (progressStage || "再査定中...")
                      : `📷 追加写真で再査定する（元${files.length}枚 + 追加${additionalFiles.length}枚）`}
                  </button>
                )}
              </section>
            )}

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
