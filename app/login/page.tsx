// app/login/page.tsx の一部

return (
  <main style={{ padding: 32 }}>
    <div
      style={{
        maxWidth: 420,
        margin: "40px auto",
        padding: "32px 28px",
        borderRadius: 12,
        border: "1px solid #eee",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
        background: "#fff",
      }}
    >
      {/* ここ ↓ を変更 */}
      <h1
        style={{
          fontSize: 24,
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        カンテの ログイン
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "#64748b",
          marginBottom: 24,
        }}
      >
        管理者から発行されたアカウントでログインしてください。
      </p>
      {/* 以下そのまま */}
