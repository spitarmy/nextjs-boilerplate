// app/api/assess/enqueue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "JSON形式のリクエストを送ってください。" },
        { status: 400 }
      );
    }

    // user_id（あれば）
    const user_id: string | null =
      typeof (body as any).user_id === "string" &&
      (body as any).user_id.trim().length > 0
        ? (body as any).user_id
        : null;

    // 画像URLを抽出（/api/assess と同じルール）
    const raw = (body as any).image_urls ?? (body as any).images ?? null;
    let images: string[] = [];

    if (Array.isArray(raw)) {
      images = raw
        .map((v: any) => {
          if (typeof v === "string") return v;
          if (v?.url) return v.url;
          if (v?.image_url) return v.image_url;
          if (v?.src) return v.src;
          return null;
        })
        .filter((s): s is string => !!s);
    }

    if (!images.length) {
      return NextResponse.json(
        { ok: false, error: "画像データがありません。" },
        { status: 400 }
      );
    }

    // assessment_jobs に「pending ジョブ」として登録
    const { data, error } = await supabaseAdmin
      .from("assessment_jobs")
      .insert({
        user_id,
        image_urls: images,
        status: "pending", // ここから worker が処理していく想定
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("assessment_jobs insert error", error);
      return NextResponse.json(
        { ok: false, error: "査定ジョブの登録に失敗しました。" },
        { status: 500 }
      );
    }

    // フロント用には job_id だけ返す
    return NextResponse.json(
      {
        ok: true,
        job_id: data.id,
      },
      { status: 202 } // 受理したけど処理中、の意味
    );
  } catch (e: any) {
    console.error("enqueue error", e);
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "査定ジョブ登録中にエラーが発生しました。",
      },
      { status: 500 }
    );
  }
}
