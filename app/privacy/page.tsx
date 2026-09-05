import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb", color: "#111827", padding: "2rem" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "#ffffff", padding: "2rem", borderRadius: "0.5rem", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}>
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/assess" style={{ display: "inline-flex", alignItems: "center", color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}>
            ← 査定画面に戻る
          </Link>
        </div>
        
        <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "1rem" }}>
          プライバシーポリシー
        </h1>
        
        <div style={{ marginBottom: "2rem", fontSize: "0.875rem", color: "#6b7280" }}>
          改定日: 2026年9月5日
        </div>

        <div style={{ lineHeight: 1.7 }}>
          <p style={{ marginBottom: "2rem" }}>
            株式会社ゼノベイト（以下「当社」といいます。）は、AIを活用した真贋判定・相場査定支援ツール「カンテノ」（以下「本サービス」といいます。）における、ユーザーの個人情報および関連データの取扱いについて、以下のとおりプライバシーポリシー（以下「本ポリシー」といいます。）を定めます。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            1. 個人情報の定義および収集する情報
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本ポリシーにおいて、個人情報とは個人情報の保護に関する法律に規定される生存する個人に関する情報を指します。<br />
            当社は、本サービスの提供にあたり、以下の情報を収集します。<br />
            ・メールアドレス<br />
            ・パスワードハッシュ（暗号化されたパスワード）<br />
            ・本サービスの利用データ（アクセスログ等）
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            2. 利用目的
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、収集した情報を以下の目的で利用します。<br />
            ・本サービスの提供および維持のため<br />
            ・ユーザーのアカウント管理および認証のため<br />
            ・本サービスの改善、新機能の開発のため<br />
            ・ユーザーからのお問い合わせ対応のため
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            3. 教師データの取扱い
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、ユーザーの同意（オプトイン）に基づき、本サービスに入力された査定結果（商品画像、AI出力等のデータ）を、AIの品質向上およびサービス改善を目的とした教師データとして利用することがあります。<br />
            ・教師データとして利用する情報には、個人を特定できる情報は含まれません。<br />
            ・ユーザーは、当社所定の設定画面より、いつでもこの同意を撤回することができます。<br />
            ・本利用は、著作権法第30条の4（情報解析のための複製等）に基づくAI学習目的での利用を含みます。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            4. 第三者提供
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、原則としてユーザーの同意を得ることなく、個人情報を第三者に提供しません。ただし、法令に基づく場合など、個人情報保護法その他の法令で認められる場合を除きます。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            5. データの保存・セキュリティ
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、ユーザーのデータを安全に管理するため、Supabaseを利用したデータ管理、SSL暗号化通信の導入、適切なアクセス制御の実施など、必要なセキュリティ対策を講じています。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            6. Cookie（クッキー）の使用
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本サービスでは、セッション管理や利便性向上のため、Cookieを使用しています。ブラウザの設定によりCookieを無効にすることは可能ですが、その場合、本サービスの一部機能が正常に動作しない可能性があります。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            7. お問い合わせ
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本ポリシーに関するお問い合わせは、以下の窓口までお願いいたします。<br />
            Email: pavsolution@gmail.com
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            8. 改定
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、必要に応じて本ポリシーを改定することがあります。重要な変更がある場合には、本サービス内で通知します。
          </p>

          <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#4b5563" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>運営会社情報</p>
            <p>会社名: 株式会社ゼノベイト</p>
            <p>代表者: 勝賀野太郎</p>
            <p>サービス名: カンテノ（KANTEI × KNOW）</p>
          </div>
        </div>
      </div>
    </div>
  );
}
