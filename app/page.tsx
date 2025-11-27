// app/page.tsx
import UploadForm from "./components/UploadForm";
import ProtectedPageWrapper from "./ProtectedPageWrapper";

export default function Page() {
  return (
    <ProtectedPageWrapper>
      <main style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18 }}>査定する</h2>
          <span
            id="version-badge"
            style={{
              fontSize: 12,
              background: "#eef2ff",
              color: "#3730a3",
              padding: "4px 8px",
              borderRadius: 999,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            v?
          </span>
        </div>

        <UploadForm />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (async function(){
                try{
                  const r = await fetch('/api/version');
                  const j = await r.json();
                  document.getElementById('version-badge').textContent =
                    (j.ok ? j.version : 'v?');
                }catch(e){ /* noop */ }
              })();
            `,
          }}
        />
      </main>
    </ProtectedPageWrapper>
  );
}
