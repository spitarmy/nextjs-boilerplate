// /app/page.tsx
import UploadForm from './components/UploadForm';

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      {/* 見出し部分（ここを追加） */}
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        画像を選んで「査定する」を押してください
      </h1>
      <p style={{ color: '#6b7280', marginBottom: 20 }}>
        複数枚OK。自動でタイトル・説明文まで作成します。
      </p>

      {/* ここが実際のアップロードフォーム */}
      <UploadForm />
    </main>
  );
}
