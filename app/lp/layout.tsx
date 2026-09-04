import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'カンテノ（KANTEI × KNOW）| 買取現場で生まれたAI真贋・相場査定ツール',
  description: '商品画像1枚から、商品情報・市場相場・真贋参考情報・出品文を瞬時にAI生成。リユース店、不用品回収・遺品整理業、EC事業者の「目利き」と出品業務を劇的に効率化します。1営業日無料体験受付中。',
  keywords: ['カンテノ', 'AI査定', '真贋判定', 'リユースAI', '相場査定', '遺品整理', '買取', '出品文自動生成', 'ゼノベイト'],
  openGraph: {
    title: 'カンテノ（KANTEI × KNOW）| AI真贋・相場査定ツール',
    description: 'その品物、調べるだけで時間がかかっていませんか？写真1枚から査定・相場・真贋・出品文章を即座に特定。',
    type: 'website',
    locale: 'ja_JP',
  },
};

export default function LpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#FAF8F5] text-[#2D2926] antialiased selection:bg-[#E89234] selection:text-white font-sans">{children}</div>;
}
