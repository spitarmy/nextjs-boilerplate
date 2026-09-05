import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f9fafb", color: "#111827", padding: "2rem" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "#ffffff", padding: "2rem", borderRadius: "0.5rem", boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)" }}>
        <div style={{ marginBottom: "2rem" }}>
          <Link href="/assess" style={{ display: "inline-flex", alignItems: "center", color: "#4f46e5", textDecoration: "none", fontWeight: 500 }}>
            <ArrowLeft style={{ width: "1rem", height: "1rem", marginRight: "0.5rem" }} />
            査定画面に戻る
          </Link>
        </div>
        
        <h1 style={{ fontSize: "1.875rem", fontWeight: 700, marginBottom: "1rem", borderBottom: "1px solid #e5e7eb", paddingBottom: "1rem" }}>
          利用規約
        </h1>
        
        <div style={{ marginBottom: "2rem", fontSize: "0.875rem", color: "#6b7280" }}>
          制定日: 2026年9月5日
        </div>

        <div style={{ lineHeight: 1.7 }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第1条（適用）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本利用規約（以下「本規約」といいます。）は、株式会社ゼノベイト（以下「当社」といいます。）が提供するAIを活用した真贋判定・相場査定支援ツール「カンテノ（KANTEI × KNOW）」（以下「本サービス」といいます。）の利用に関する条件を、本サービスを利用するお客様（以下「ユーザー」といいます。）と当社との間で定めるものです。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第2条（サービス内容）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本サービスは、ユーザーに対し、AIによる査定支援機能（真贋判定、相場査定、出品文生成、古物台帳管理等）を提供するものです。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第3条（免責事項）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            1. 本サービスが提供するAIによる査定結果（真贋判定、相場情報等を含む）は参考情報として提供されるものであり、その正確性、完全性、有用性を当社が保証するものではありません。<br />
            2. 最終的な真贋判定、価格決定、その他の取引に関する判断は、ユーザー自身の責任において行うものとします。<br />
            3. 当社は、本サービスの査定結果に基づいてユーザーまたは第三者が被ったいかなる損害（逸失利益、データの消失、その他の直接的または間接的な損害を含みます。）についても、一切の責任を負わないものとします。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第4条（アカウント）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            1. ユーザーは、本サービスの利用にあたり、正確な情報を提供してアカウントを登録するものとします。<br />
            2. ユーザーは、自己の責任においてアカウントのパスワード等を適切に管理するものとします。<br />
            3. ユーザーは、当社所定の手続きを行うことにより、いつでもアカウントを削除（退会）することができます。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第5条（料金・支払い）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            1. 本サービスの利用料金は、当社が別途定める料金プランに応じたものとします。<br />
            2. ユーザーは、当社が指定する支払方法及び条件に従い、利用料金を支払うものとします。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第6条（知的財産権）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本サービスに関する一切の知的財産権（著作権、特許権、商標権等を含みますがこれらに限られません。）は、当社または当社にライセンスを許諾している者に帰属します。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第7条（データの取扱い・教師データ）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            1. 当社は、ユーザーが同意した場合に限り、本サービスに入力された査定データ（商品画像や査定結果を含む）を、本サービス及びAIの品質向上を目的とした教師データとして利用することができるものとします。<br />
            2. ユーザーは、前項の同意をいつでも撤回することができます。<br />
            3. 本条に基づき当社が利用するデータは、個人情報を含まない商品画像および査定結果のみを対象とします。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第8条（禁止事項）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            ユーザーは、本サービスの利用にあたり、以下の行為を行ってはならないものとします。<br />
            (1) 不正アクセス、クラッキング等のサイバー攻撃<br />
            (2) 本サービスのシステムに対するリバースエンジニアリング、逆コンパイル等<br />
            (3) 法令、公序良俗に反する行為、またはそのおそれのある行為<br />
            (4) その他、当社が不適切と判断する行為
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第9条（サービスの変更・停止）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            当社は、ユーザーに事前の通知を行った上で、本サービスの内容を変更し、または提供を停止することができるものとします。ただし、緊急を要する場合は、事前の通知なく変更または停止することがあります。
          </p>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "2rem", marginBottom: "1rem", color: "#1f2937" }}>
            第10条（準拠法・管轄）
          </h2>
          <p style={{ marginBottom: "1rem" }}>
            本規約の解釈にあたっては、日本法を準拠法とします。本サービスに関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
          </p>

          <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid #e5e7eb", fontSize: "0.875rem", color: "#4b5563" }}>
            <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>運営会社情報</p>
            <p>会社名: 株式会社ゼノベイト</p>
            <p>代表者: 勝賀野太郎</p>
            <p>サービス名: カンテノ（KANTEI × KNOW）</p>
            <p>お問い合わせ: pavsolution@gmail.com</p>
          </div>
        </div>
      </div>
    </div>
  );
}
