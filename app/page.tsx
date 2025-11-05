// app/page.tsx  ― サーバーコンポーネント（デフォルト）
import ClientStatus from '../components/ClientStatus';

export default function Page() {
  return <ClientStatus />;
}

export default function Home() {
  const [status, setStatus] = React.useState('Checking…');

  React.useEffect(() => {
    supabase.auth.getSession()
      .then(() => setStatus('✅ Supabase OK'))
      .catch((err) => setStatus(`❌ ${err?.message ?? 'Error'}`));
  }, []);

  return (
    <main style={{ padding: 40, textAlign: 'center' }}>
      <h1>Connection Test</h1>
      <p>{status}</p>
    </main>
  );
}
