// app/page.tsx
import UploadForm from './components/UploadForm';

export default function Page() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        Connection Test
      </h1>
      <p>✅ Supabase client loaded</p>

      <div style={{ height: 24 }} />

      <UploadForm />
    </main>
  );
}
