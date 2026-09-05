// app/tokushoho/page.tsx
import React from "react";

export default function TokushohoPage() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", lineHeight: 1.8 }}>
      <a href="/assess" style={{ color: "#6366f1", textDecoration: "none", fontSize: 14 }}>← 査定画面に戻る</a>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 20, marginBottom: 8 }}>特定商取引法に基づく表記</h1>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 32 }}>最終更新日: 2026年9月5日</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {[
            ["事業者名", "株式会社ゼノベイト"],
            ["代表者", "勝賀野太郎"],
            ["所在地", "京都府京都市伏見区深草西浦町6丁目24-9"],
            ["連絡先", "メール: pavsolution@gmail.com\n※お問い合わせはメールにてお願いいたします"],
            ["販売価格", "各プランの料金は、サービス内のご案内または営業担当者よりご説明いたします"],
            ["支払方法", "銀行振込、クレジットカード決済（対応予定）"],
            ["支払時期", "月額プラン：毎月のご利用開始日に請求\n年間一括プラン：契約開始時に一括請求"],
            ["サービス提供時期", "お申し込み手続き完了後、アカウント発行をもって即時ご利用いただけます"],
            ["キャンセル・解約", "月額プラン：翌月末での解約が可能です\n年間一括プラン：契約期間中の中途解約による返金はいたしかねます\n※無料トライアル期間中のキャンセルについては費用は発生しません"],
            ["動作環境", "インターネット接続環境およびモダンブラウザ（Chrome、Safari、Edge等の最新版）"],
            ["免責事項", "本サービスのAI査定結果は参考情報であり、真贋判定・価格査定の最終判断はお客様ご自身の責任において行ってください。AI査定結果に基づく損害について、当社は一切の責任を負いません。"],
          ].map(([label, value], i) => (
            <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{
                padding: "14px 16px",
                textAlign: "left",
                verticalAlign: "top",
                backgroundColor: "#f9fafb",
                width: "30%",
                fontWeight: 600,
                fontSize: 13,
              }}>
                {label}
              </th>
              <td style={{
                padding: "14px 16px",
                whiteSpace: "pre-line",
                fontSize: 13,
                color: "#374151",
              }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
