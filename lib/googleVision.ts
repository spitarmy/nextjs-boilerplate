// lib/googleVision.ts
// Google Cloud Vision API (Web Detection) を使って、
// 画像から世界中のWeb一致情報（商品名・キャラクター名・型番等）を特定する

export type GoogleLensResult = {
  bestGuessTitle: string | null;
  webEntities: string[];
  matchedPageTitles: string[];
  summaryHint: string;
};

export async function detectWebEntities(
  imageUrl: string,
  apiKey: string = process.env.GOOGLE_VISION_API_KEY || "AIzaSyANIzoE-aLAEXUb5lrGGeGFsH0VAZcdso0"
): Promise<GoogleLensResult | null> {
  if (!apiKey || !imageUrl) return null;

  try {
    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    // Base64 Data URL または 通常の画像URLを判定
    let imagePayload: any;
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1];
      if (!base64Data) return null;
      imagePayload = { content: base64Data };
    } else {
      imagePayload = { source: { imageUri: imageUrl } };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: imagePayload,
            features: [{ type: "WEB_DETECTION", maxResults: 10 }],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[GOOGLE_VISION] API error status=", res.status, errText);
      return null;
    }

    const data = await res.json();
    const webDetection = data?.responses?.[0]?.webDetection;
    if (!webDetection) return null;

    // 1. 最も確度の高いラベル・推測名
    const bestGuessLabels = (webDetection.bestGuessLabels || [])
      .map((l: any) => l.label)
      .filter(Boolean);
    const bestGuessTitle = bestGuessLabels.length > 0 ? bestGuessLabels[0] : null;

    // 2. Webエンティティ（スコア0.5以上の重要キーワード）
    const webEntities: string[] = (webDetection.webEntities || [])
      .filter((e: any) => e.description && (e.score === undefined || e.score > 0.4))
      .map((e: any) => e.description);

    // 3. 一致したWebページのタイトル（メルカリ、ヤフオク、Amazon、公式等）
    const matchedPageTitles: string[] = (webDetection.pagesWithMatchingImages || [])
      .map((p: any) => p.pageTitle)
      .filter(Boolean)
      .slice(0, 5);

    // 4. プロンプトに注入しやすい要約ヒントテキスト
    const hintsParts: string[] = [];
    if (bestGuessTitle) hintsParts.push(`最有力候補: 「${bestGuessTitle}」`);
    if (webEntities.length > 0) {
      hintsParts.push(`関連キーワード: ${webEntities.slice(0, 6).join(", ")}`);
    }
    if (matchedPageTitles.length > 0) {
      hintsParts.push(`類似出品・Webページ名: ${matchedPageTitles.slice(0, 3).join(" / ")}`);
    }

    return {
      bestGuessTitle,
      webEntities,
      matchedPageTitles,
      summaryHint: hintsParts.join("\n"),
    };
  } catch (err) {
    console.warn("[GOOGLE_VISION] Exception during web detection:", err);
    return null;
  }
}
