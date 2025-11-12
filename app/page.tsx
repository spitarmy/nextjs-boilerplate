// /app/page.tsx
import UploadForm from './components/UploadForm';

export default function Page() {
  return (
    <main style={{ padding: 16 }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h1 style={{margin:0,fontSize:18}}>カンテノ Web 査定</h1>
        <span style={{fontSize:12,background:'#eef2ff',color:'#3730a3',padding:'4px 8px',borderRadius:999}}>
          UI v6 / API v6
        </span>
      </div>
      <UploadForm />
    </main>
  );
}
