'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function CantenoLandingPage() {
  const [activeModel, setActiveModel] = useState<'model1' | 'model2' | 'model3'>('model1');
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    company: '',
    name: '',
    email: '',
    phone: '',
    industry: '買取・リユース業',
    inquiryType: '1営業日無料体験を希望',
    message: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
  };

  return (
    <div className="bg-[#FAF8F5] text-[#2B2724] font-sans overflow-x-hidden selection:bg-[#E88E2D] selection:text-white">
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-50 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#EAE3D9] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#1A1816] via-[#38332E] to-[#E88E2D] flex items-center justify-center text-white shadow-md">
              <svg className="w-6 h-6 text-[#F9C378]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black tracking-wider text-[#1A1816]">カンテノ</span>
                <span className="text-xs font-semibold tracking-widest text-[#9C8F80]">KANTEI × KNOW</span>
              </div>
              <p className="text-[10px] text-[#A6998A] font-medium leading-none">買取現場で生まれた査定AI</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-bold text-[#544D45]">
            <a href="#pain" className="hover:text-[#E88E2D] transition-colors">お悩み</a>
            <a href="#advantage" className="hover:text-[#E88E2D] transition-colors">独自の強み</a>
            <a href="#roi" className="hover:text-[#E88E2D] transition-colors">導入効果(ROI)</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs sm:text-sm font-bold text-[#544D45] hover:text-[#1A1816] px-3 py-2 transition-colors"
            >
              ログイン
            </Link>
            <a
              href="#contact"
              className="bg-gradient-to-r from-[#E88E2D] to-[#D97818] text-white text-xs sm:text-sm font-bold px-4 sm:px-6 py-2.5 rounded-full shadow-lg shadow-[#E88E2D]/20 hover:brightness-105 active:scale-95 transition-all"
            >
              無料体験を申し込む
            </a>
          </div>
        </div>
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full pointer-events-none opacity-40">
          <div className="absolute top-10 left-10 w-96 h-96 bg-[#FBE5CE] rounded-full blur-3xl" />
          <div className="absolute top-40 right-10 w-80 h-80 bg-[#E8DDCF] rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F3ECE0] border border-[#E4D8C8] text-[#8C5E28] text-xs sm:text-sm font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-[#E88E2D] animate-pulse" />
              株式会社ゼノベイト 開発提供 ／ リユース・買取・整理業向け
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-[#1A1816] leading-[1.25] sm:leading-[1.2] tracking-tight">
              その品物、<br className="sm:hidden" />
              <span className="bg-gradient-to-r from-[#E88E2D] via-[#D97818] to-[#994708] bg-clip-text text-transparent underline decoration-[#FBE5CE] decoration-wavy decoration-4">
                調べるだけで時間
              </span>
              がかかっていませんか。
            </h1>

            <p className="mt-6 text-base sm:text-xl text-[#5C534A] leading-relaxed max-w-2xl mx-auto font-medium">
              写真1枚から、<strong className="text-[#1A1816]">型番特定・市場相場・真贋参考情報・出品文</strong>をAIが瞬時に生成。
              職人技に頼っていた「目利き」をデジタル化し、現場の利益と回転率を劇的に最大化します。
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="#contact"
                className="w-full sm:w-auto bg-[#1A1816] hover:bg-[#2C2723] text-white text-base sm:text-lg font-bold px-8 py-4 rounded-xl shadow-xl shadow-black/10 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-0.5"
              >
                <span>まずは1営業日の無料体験を試す</span>
                <svg className="w-5 h-5 text-[#E88E2D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </a>
              <a
                href="#pain"
                className="w-full sm:w-auto bg-white border-2 border-[#DCD0C0] hover:border-[#E88E2D] text-[#3D3730] text-base font-bold px-8 py-4 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <span>機能と導入効果を見る</span>
              </a>
            </div>

            <p className="mt-4 text-xs text-[#8A7E72]">
              ※AIだけで正式な真贋を確定するものではありません。担当者の最終判断を高速化・支援するツールです。
            </p>
          </div>

          {/* Hero ビジュアル / UI プレビュー */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="relative rounded-2xl bg-gradient-to-b from-[#312B26] to-[#1A1816] p-4 sm:p-8 shadow-2xl border border-[#4F463E]">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#4F463E]/60 text-xs text-[#C8BDAF] font-mono">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
                  <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
                  <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
                </div>
                <span className="ml-2">カンテノ AI査定コンソール | KANTEI × KNOW</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="bg-[#24201D] rounded-xl p-5 border border-[#3E3730] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#E88E2D]/20 text-[#F9A84D]">STEP 1</span>
                      <span className="text-[11px] text-[#A6998A]">写真アップロード</span>
                    </div>
                    <h3 className="text-white font-bold text-base mb-2">商品全体・刻印の撮影</h3>
                    <p className="text-xs text-[#A6998A] leading-relaxed">
                      ブランド名や型番の手入力は一切不要。スマホカメラで撮影した写真を選択するだけ。
                    </p>
                  </div>
                  <div className="mt-4 p-3.5 rounded-lg bg-[#1A1816] border border-dashed border-[#544B41] text-center text-xs text-[#B5A898]">
                    📷 画像3枚アップロード完了<br />
                    <span className="text-[10px] text-[#7A6F62]">(全体 / ロゴ刻印 / アウトソール)</span>
                  </div>
                </div>

                <div className="bg-[#24201D] rounded-xl p-5 border border-[#E88E2D]/40 ring-2 ring-[#E88E2D]/20 flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-[#E88E2D]/10 rounded-bl-full pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#E88E2D] text-white">STEP 2</span>
                      <span className="text-[11px] text-[#F9A84D]">リアルタイムAI判定</span>
                    </div>
                    <h3 className="text-white font-bold text-base mb-2">真贋の根拠 & 実売相場</h3>
                    <div className="space-y-2 text-xs">
                      <div className="bg-[#1A1816] p-2.5 rounded border border-[#3E3730]">
                        <span className="text-[#A6998A] text-[10px]">推定市場相場：</span>
                        <p className="text-[#F9C378] font-bold text-sm">¥18,000 〜 ¥25,000</p>
                      </div>
                      <div className="bg-[#1A1816] p-2.5 rounded border border-[#3E3730]">
                        <span className="text-[#A6998A] text-[10px]">真贋ポイント：</span>
                        <p className="text-[#E0D8CE] text-[11px] leading-tight">フォントの刻印深度、縫製のピッチが正規品の基準と合致。</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#24201D] rounded-xl p-5 border border-[#3E3730] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-[#E88E2D]/20 text-[#F9A84D]">STEP 3</span>
                      <span className="text-[11px] text-[#A6998A]">出品自動化</span>
                    </div>
                    <h3 className="text-white font-bold text-base mb-2">タイトル＆説明文を生成</h3>
                    <p className="text-xs text-[#A6998A] leading-relaxed mb-3">
                      SEOに最適化された商品タイトルと詳細なコンディション説明文を自動生成。ワンクリックでコピー。
                    </p>
                  </div>
                  <div className="bg-[#1A1816] p-3 rounded-lg border border-[#3E3730]">
                    <div className="flex justify-between items-center text-[10px] text-[#7A6F62] mb-1">
                      <span>メルカリ・ヤフオク等に即コピペ</span>
                      <span className="text-[#E88E2D] font-bold">Copy OK</span>
                    </div>
                    <p className="text-[10px] text-[#C8BDAF] font-mono line-clamp-2">
                      【極美品】エルメス スエード切替 ポインテッドトゥ パンプス 38.5 付属品完備
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PAIN POINTS SECTION ===== */}
      <section id="pain" className="py-20 bg-[#F4EDE2] border-y border-[#E8DCCF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold tracking-widest text-[#A8641C] uppercase">PAIN POINTS</span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1A1816] mt-2">
              「目利きの不在」が招く、巨大な機会損失。<br />
              こんな<span className="text-[#C4381C] underline decoration-[#F5C4BA]">“見えない損”</span>をしていませんか？
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-[#DFD4C4] shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#EAE3D9]">
                <div className="w-12 h-12 rounded-xl bg-[#FDF0E1] text-[#D97818] flex items-center justify-center font-bold text-lg">
                  01
                </div>
                <div>
                  <span className="text-xs font-bold text-[#9C8F80]">CASE 01</span>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1A1816]">リユース事業者・買取専門店 様</h3>
                </div>
              </div>

              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">真贋への迷いと失注</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      「偽物かもしれない…」と不安になり預かり対応でお客様を待たせる。リスク回避の安すぎる査定で他社相見積もりに負けてしまう。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">教育期間の長期化と属人化</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      新人にブランド知識や相場感覚を教えるのに数ヶ月〜数年かかり、即戦力化できずベテランの手が空かない。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">手作業による業務パンク</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      型番調べ、相場検索、出品文章の手作業作成に追われ、取扱件数と回転率が頭打ちになっている。
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-[#DFD4C4] shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[#EAE3D9]">
                <div className="w-12 h-12 rounded-xl bg-[#F0F5ED] text-[#427A3C] flex items-center justify-center font-bold text-lg">
                  02
                </div>
                <div>
                  <span className="text-xs font-bold text-[#9C8F80]">CASE 02</span>
                  <h3 className="text-lg sm:text-xl font-bold text-[#1A1816]">引越し・解体・遺品整理・回収業者 様</h3>
                </div>
              </div>

              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">知識不足による価値の廃棄</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      現場で価値が判断できず、ネットで売れるはずのブランド品やヴィンテージ雑貨を処分費用を払って捨ててしまっている。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">専門業者への外注による利益流出</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      「高そうだけど分からない」からと他社を呼び、本来自社が得られたはずの買取利益を流出させている。
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBEAE7] text-[#C4381C] flex items-center justify-center shrink-0 mt-0.5 text-xs font-black">✕</div>
                  <div>
                    <strong className="text-[#1A1816] text-sm block">その場で追加提案ができない</strong>
                    <p className="text-xs text-[#6B6156] mt-0.5 leading-relaxed">
                      現場で査定額が出せないため、お客様へ「買取による作業費用の相殺」などの強力な相見積もり対策提案が打てない。
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== ADVANTAGE SECTION ===== */}
      <section id="advantage" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold tracking-widest text-[#E88E2D] uppercase">OUR ADVANTAGE</span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1A1816] mt-2">
              現場を知り尽くした「眼」と「実売データ」の融合。<br />
              <span className="text-[#8C5E28]">IT専業企業には真似できない、カンテノ独自の優位性。</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl p-8 border border-[#EAE3D9] shadow-md flex flex-col justify-between group hover:border-[#E88E2D] transition-all">
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#FDF0E1] text-[#D97818] flex items-center justify-center mb-6 text-xl font-black">
                  01
                </div>
                <span className="text-xs font-bold text-[#A8641C]">「開発者」＝「ユーザー」である強み</span>
                <h3 className="text-xl font-bold text-[#1A1816] mt-1 mb-4">現場起点のDNA</h3>
                <p className="text-sm text-[#5C534A] leading-relaxed">
                  私たちは単なるITベンダーではなく、買取・遺品整理の最前線で戦ってきた実業家です。
                  現場の暗黙知・独特な商習慣・真贋の微妙なニュアンスを肌感覚で理解しているからこそ、現場で本当に使えるUI/UXと判定ロジックを構築しています。
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#F2ECE4] text-xs font-bold text-[#8C5E28]">
                机上の空論ではない、現場専用設計
              </div>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-[#EAE3D9] shadow-md flex flex-col justify-between group hover:border-[#E88E2D] transition-all">
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#FDF0E1] text-[#D97818] flex items-center justify-center mb-6 text-xl font-black">
                  02
                </div>
                <span className="text-xs font-bold text-[#A8641C]">AIに「職人の視点」を移植</span>
                <h3 className="text-xl font-bold text-[#1A1816] mt-1 mb-4">専門鑑定士による教師データ</h3>
                <p className="text-sm text-[#5C534A] leading-relaxed">
                  自社のベテラン鑑定士が実際に手に取り鑑定した<strong className="text-[#1A1816]">3,000件以上の商品</strong>について、「どこを見て真贋を判断したか」という微細な判断ポイントを手入力でタグ付け・徹底学習。熟練の鑑定士がAIの中に常駐している状態を再現。
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#F2ECE4] text-xs font-bold text-[#8C5E28]">
                3,000件以上の手作業アノテーション
              </div>
            </div>

            <div className="bg-white rounded-2xl p-8 border border-[#EAE3D9] shadow-md flex flex-col justify-between group hover:border-[#E88E2D] transition-all">
              <div>
                <div className="w-12 h-12 rounded-xl bg-[#FDF0E1] text-[#D97818] flex items-center justify-center mb-6 text-xl font-black">
                  03
                </div>
                <span className="text-xs font-bold text-[#A8641C]">「出品額」ではなく「成約額」を握る</span>
                <h3 className="text-xl font-bold text-[#1A1816] mt-1 mb-4">独自の「実売」データベース</h3>
                <p className="text-sm text-[#5C534A] leading-relaxed">
                  ネット上の「売り希望価格（相場）」だけでなく、「実際にいくらで売れたか（着地点）」という生きた成約データを保有。
                  赤字リスクを極限まで抑えながら、他社に負けない攻めの買取価格提示を可能にします。
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#F2ECE4] text-xs font-bold text-[#8C5E28]">
                着地点データによる高精度な粗利計算
              </div>
            </div>
          </div>

          <div className="mt-12 bg-gradient-to-r from-[#1A1816] to-[#36302B] rounded-2xl p-6 sm:p-8 text-center text-white shadow-xl">
            <h3 className="text-lg sm:text-2xl font-black mb-2">
              質の高い独自データ × 現場オペレーションへの深い理解
            </h3>
            <p className="text-xs sm:text-sm text-[#D6CBC0]">
              ＝ カンテノが他社ツールと一線を画す、圧倒的な成約率と査定精度
            </p>
          </div>
        </div>
      </section>

      {/* ===== ROI SIMULATION SECTION ===== */}
      <section id="roi" className="py-20 bg-[#F4EDE2] border-y border-[#E8DCCF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="text-xs font-bold tracking-widest text-[#A8641C] uppercase">ROI SIMULATION</span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1A1816] mt-2">
              「機会損失」の穴を塞ぎ、利益率を劇的に改善。<br />
              <span className="text-[#D97818]">月間コストはたった1〜2回の取引で回収可能。</span>
            </h2>
          </div>

          <div className="flex justify-center gap-2 sm:gap-4 mb-8">
            <button
              onClick={() => setActiveModel('model1')}
              className={`px-4 sm:px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                activeModel === 'model1'
                  ? 'bg-[#1A1816] text-white shadow-md'
                  : 'bg-white text-[#5C534A] hover:bg-[#FAF8F5]'
              }`}
            >
              モデル① 買取専門店
            </button>
            <button
              onClick={() => setActiveModel('model2')}
              className={`px-4 sm:px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                activeModel === 'model2'
                  ? 'bg-[#1A1816] text-white shadow-md'
                  : 'bg-white text-[#5C534A] hover:bg-[#FAF8F5]'
              }`}
            >
              モデル② 遺品整理業
            </button>
            <button
              onClick={() => setActiveModel('model3')}
              className={`px-4 sm:px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                activeModel === 'model3'
                  ? 'bg-[#1A1816] text-white shadow-md'
                  : 'bg-white text-[#5C534A] hover:bg-[#FAF8F5]'
              }`}
            >
              モデル③ 業務効率改善
            </button>
          </div>

          {activeModel === 'model1' && (
            <div className="bg-white rounded-2xl p-6 sm:p-10 border border-[#DFD4C4] shadow-lg">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-block px-3 py-1 bg-[#FDF0E1] text-[#D97818] font-bold text-xs rounded-full">
                    京都府宇治市 駅前エリア 買取専門店 実績モデル
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#1A1816]">
                    迷いによる断り・安値提示を防止し、査定単価と成約率をダブル改善
                  </h3>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE3D9]">
                      <span className="text-xs text-[#8A7E72] block">Before（導入前）</span>
                      <p className="text-xs sm:text-sm text-[#474039] mt-1">
                        骨董や特定商品の価値に自信が持てず、「分からないから断る」や安値提示で相見積もり失注。
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-[#F0F5ED] border border-[#D5E5CE]">
                      <span className="text-xs text-[#427A3C] font-bold block">After（カンテノ導入後）</span>
                      <p className="text-xs sm:text-sm text-[#274723] mt-1">
                        AIが型番・相場・真贋を即答。自信を持って適正価格を提示でき、1査定あたりの利益が3.5万円UP。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-gradient-to-br from-[#FAF8F5] to-[#F5ECE0] rounded-2xl p-6 border border-[#E4D8C8]">
                  <h4 className="text-xs font-bold text-[#8A7E72] uppercase tracking-wider mb-4">月間収支シミュレーション</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">月間査定件数</span>
                      <span className="font-bold text-[#1A1816]">40 件</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">1査定あたり利益増加</span>
                      <span className="font-bold text-[#2E7D32]">＋ 3.5 万円</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2">
                      <span className="font-bold text-[#1A1816]">月間粗利の増加見込み</span>
                      <span className="text-2xl sm:text-3xl font-black text-[#D97818]">＋約145 万円</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8A7E72] mt-3 text-right">※非成約分の成約化 ＋ 1査定あたりの粗利改善分</p>
                </div>
              </div>
            </div>
          )}

          {activeModel === 'model2' && (
            <div className="bg-white rounded-2xl p-6 sm:p-10 border border-[#DFD4C4] shadow-lg">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-block px-3 py-1 bg-[#FDF0E1] text-[#D97818] font-bold text-xs rounded-full">
                    京都市拠点 関西一円 4人体制 遺品整理業者 実績モデル
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#1A1816]">
                    処分費を払って捨てていた「売れる品」を全て抽出し、買取相殺で成約
                  </h3>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE3D9]">
                      <span className="text-xs text-[#8A7E72] block">Before（導入前）</span>
                      <p className="text-xs sm:text-sm text-[#474039] mt-1">
                        現場で価値判断できず有料処分。綺麗な家電のみ持ち込むも二束三文や返品リスクで労力倒れ。
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-[#F0F5ED] border border-[#D5E5CE]">
                      <span className="text-xs text-[#427A3C] font-bold block">After（カンテノ導入後）</span>
                      <p className="text-xs sm:text-sm text-[#274723] mt-1">
                        価値ある品をすべて可視化。処分費削減に加え、1件あたり17.5万円の大幅な粗利増を達成。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-gradient-to-br from-[#FAF8F5] to-[#F5ECE0] rounded-2xl p-6 border border-[#E4D8C8]">
                  <h4 className="text-xs font-bold text-[#8A7E72] uppercase tracking-wider mb-4">月間収支シミュレーション</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">月間現場件数</span>
                      <span className="font-bold text-[#1A1816]">10 件</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">1件あたり粗利増加額</span>
                      <span className="font-bold text-[#2E7D32]">＋ 17.5 万円</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2">
                      <span className="font-bold text-[#1A1816]">月間粗利の増加見込み</span>
                      <span className="text-2xl sm:text-3xl font-black text-[#D97818]">＋約200 万円</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8A7E72] mt-3 text-right">※処分費削減分 ＋ 買取相殺による成約率向上</p>
                </div>
              </div>
            </div>
          )}

          {activeModel === 'model3' && (
            <div className="bg-white rounded-2xl p-6 sm:p-10 border border-[#DFD4C4] shadow-lg">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-block px-3 py-1 bg-[#FDF0E1] text-[#D97818] font-bold text-xs rounded-full">
                    ECサイト専任スタッフ・出品代行モデル
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#1A1816]">
                    相場検索から出品文作成まで、1品あたり所要時間を5分の1へ短縮
                  </h3>
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EAE3D9]">
                      <span className="text-xs text-[#8A7E72] block">Before（導入前）</span>
                      <p className="text-xs sm:text-sm text-[#474039] mt-1">
                        1品の出品に25分。ライン名特定やSEO対策、商品説明文の打ち込みに膨大な時間と労力。
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-[#F0F5ED] border border-[#D5E5CE]">
                      <span className="text-xs text-[#427A3C] font-bold block">After（カンテノ導入後）</span>
                      <p className="text-xs sm:text-sm text-[#274723] mt-1">
                        画像解析で1品5分へ。未経験スタッフでも初日から即戦力化し、月間66時間の作業時間を削減。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-5 bg-gradient-to-br from-[#FAF8F5] to-[#F5ECE0] rounded-2xl p-6 border border-[#E4D8C8]">
                  <h4 className="text-xs font-bold text-[#8A7E72] uppercase tracking-wider mb-4">月間効率化シミュレーション</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">1出品あたりの所要時間</span>
                      <span className="font-bold text-[#1A1816]">25分 → <strong className="text-[#D97818]">5分</strong></span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-[#E4D8C8]">
                      <span className="text-[#5C534A]">月間出品作業の短縮時間</span>
                      <span className="font-bold text-[#2E7D32]">66 時間短縮</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-2">
                      <span className="font-bold text-[#1A1816]">月間人件費削減効果</span>
                      <span className="text-2xl sm:text-3xl font-black text-[#D97818]">約 10 万円/人</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#8A7E72] mt-3 text-right">※時給1,500円換算（出品数10件/日の場合）</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>



      {/* ===== FOUNDER MISSION SECTION ===== */}
      <section className="py-20 bg-[#25211D] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold tracking-widest text-[#E88E2D] uppercase">MISSION & TRUST</span>
            <h2 className="text-2xl sm:text-4xl font-black mt-2">
              膨大な時間をかけて掴んだ「正解」を、<br />
              すべての現場へ再分配する。
            </h2>
            <p className="text-sm text-[#B5A898] mt-2">〜 私たちの「10年の苦労」をあなたの「1秒」に変えるために 〜</p>
          </div>

          <div className="bg-[#1A1816] p-8 sm:p-12 rounded-3xl border border-[#3E3730] shadow-2xl leading-relaxed text-sm text-[#D6CBC0] space-y-4">
            <p>
              私たちの原点は、数え切れないほどの「失敗」です。創業当初、知識不足から偽物を掴まされ、価値ある品をゴミとして捨ててしまい、多くの利益と信用を失いました。
            </p>
            <p>
              その悔しさから、私たちは狂ったようにリユースを研究しました。来る日も来る日も市場に通い、数万件の相場データを叩き込み、3,000件以上の商品を自らの目で鑑定し、真贋の定義を言語化し続けました。
            </p>
            <p>
              膨大な時間とコストをかけ、私たちはようやく「プロの眼」を手に入れました。しかし、そこで気づいたのです。<br />
              <strong className="text-white">「この苦労を、これからの参入者全員が繰り返す必要があるのか？」</strong>と。
            </p>
            <p>
              属人化した知識は、業界の成長を止めてしまいます。私たちが血の滲むような思いで蓄積した「知識」と「データ」。これを独占するのではなく、テクノロジーの力で「再分配」することこそが、業界全体の底上げになると確信しました。
            </p>
            <p className="pt-2 text-white font-medium">
              私たちが10年かけて培った目利きを、カンテノなら1秒で提供できる。もう、私たちと同じ失敗をする必要はありません。知識の格差をなくし、正直者が正しく稼げるインフラを作る。それが、カンテノの使命です。
            </p>

            <div className="pt-6 border-t border-[#3E3730] flex flex-col sm:flex-row items-end justify-between gap-4">
              <div>
                <span className="text-xs text-[#8A7E72] block">開発・運営</span>
                <span className="text-base font-bold text-white">株式会社ゼノベイト</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-[#8A7E72] block">代表取締役</span>
                <span className="text-lg font-bold text-[#F9C378]">勝賀野 太郎</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== CONTACT & LEAD FORM ===== */}
      <section id="contact" className="py-20 bg-[#FAF8F5]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="text-xs font-bold tracking-widest text-[#E88E2D] uppercase">CONTACT & DEMO</span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1A1816] mt-2">
              実際の商品で、使えるか確かめてください。
            </h2>
            <p className="text-sm text-[#6B6156] mt-3 max-w-xl mx-auto">
              まずは20〜30分ほど、貴社で扱われている商品や家財の画像を使い、どのような情報を確認できるかご案内します。今すぐ導入を決める必要はありません。
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-[#EAE3D9] shadow-xl">
            {formSubmitted ? (
              <div className="text-center py-12 space-y-4">
                <div className="w-16 h-16 bg-[#F0F5ED] text-[#2E7D32] rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                  ✓
                </div>
                <h3 className="text-2xl font-bold text-[#1A1816]">お問い合わせを受け付けました</h3>
                <p className="text-sm text-[#6B6156] max-w-md mx-auto">
                  担当者（勝賀野）より、1営業日以内に無料体験のご案内・ログイン情報をご連絡いたします。
                </p>
                <button
                  onClick={() => setFormSubmitted(false)}
                  className="mt-6 text-xs text-[#E88E2D] font-bold underline"
                >
                  フォームを再送信する
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">
                      貴社名 / 屋号 <span className="text-[#C4381C]">*</span>
                    </label>
                    <input
                      type="text"
                      name="company"
                      required
                      value={formData.company}
                      onChange={handleInputChange}
                      placeholder="例：株式会社ゼノベイト"
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">
                      お名前 <span className="text-[#C4381C]">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="例：山田 太郎"
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">
                      メールアドレス <span className="text-[#C4381C]">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="例：info@example.com"
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">
                      お電話番号 <span className="text-[#C4381C]">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="例：075-600-2665"
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">主な業種</label>
                    <select
                      name="industry"
                      value={formData.industry}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    >
                      <option value="買取・リユース業">買取・リユース業</option>
                      <option value="不用品回収・遺品整理業">不用品回収・遺品整理業</option>
                      <option value="中古品EC・ネット販売">中古品EC・ネット販売</option>
                      <option value="空き家・解体・不動産業">空き家・解体・不動産業</option>
                      <option value="その他">その他</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#3D3730] mb-2">ご希望の項目</label>
                    <select
                      name="inquiryType"
                      value={formData.inquiryType}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                    >
                      <option value="1営業日無料体験を希望">1営業日無料体験を希望</option>
                      <option value="オンラインでのデモ・説明希望">オンラインでのデモ・説明希望</option>
                      <option value="資料請求・ご相談">資料請求・ご相談</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#3D3730] mb-2">
                    ご質問・現在のお悩み（任意）
                  </label>
                  <textarea
                    name="message"
                    rows={4}
                    value={formData.message}
                    onChange={handleInputChange}
                    placeholder="例：遺品整理の現場で使えるか試したい、月間の査定件数は約30件ほど、など"
                    className="w-full px-4 py-3 rounded-xl border border-[#DCD0C0] text-sm focus:outline-none focus:ring-2 focus:ring-[#E88E2D] bg-[#FAF8F5]"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-[#E88E2D] to-[#D97818] text-white text-base sm:text-lg font-bold py-4 rounded-xl shadow-xl shadow-[#E88E2D]/20 hover:brightness-105 active:scale-[0.99] transition-all"
                >
                  無料で体験アカウントを申し込む（最短即日発行）
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-[#1A1816] text-[#A6998A] py-12 border-t border-[#3E3730]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-8 border-b border-[#2C2723]">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl font-black text-white">カンテノ</span>
                <span className="text-xs text-[#7A6F62]">KANTEI × KNOW</span>
              </div>
              <p className="text-xs leading-relaxed text-[#7A6F62]">
                買取現場で生まれたAI真贋・相場査定支援ツール
              </p>
            </div>

            <div className="text-xs space-y-1">
              <strong className="text-white block mb-2">運営会社・販売店</strong>
              <p className="text-[#A6998A]">株式会社ゼノベイト</p>
              <p className="text-[#7A6F62]">〒612-8252 京都市伏見区横大路一本木24-9</p>
              <p className="text-[#7A6F62]">電話番号（FAX）：075-600-2665</p>
              <p className="text-[#7A6F62]">メールアドレス：zennobate@outlook.jp</p>
            </div>

            <div className="text-xs text-left md:text-right">
              <Link href="/login" className="text-[#E88E2D] hover:underline font-bold block mb-2">
                加盟店・ユーザーログイン画面 →
              </Link>
              <p className="text-[11px] text-[#6B6156]">
                ※本ツールは査定業務の補助を目的としており、真贋を法的に保証するものではありません。
              </p>
            </div>
          </div>

          <div className="pt-8 text-center text-xs text-[#5C534A] space-y-3">
            <div className="flex justify-center gap-5 flex-wrap">
              <a href="/terms" className="text-[#7A6F62] hover:text-[#E88E2D] transition">利用規約</a>
              <a href="/privacy" className="text-[#7A6F62] hover:text-[#E88E2D] transition">プライバシーポリシー</a>
              <a href="/tokushoho" className="text-[#7A6F62] hover:text-[#E88E2D] transition">特定商取引法に基づく表記</a>
            </div>
            <p>© {new Date().getFullYear()} ZENNOBATE COMPANY. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
