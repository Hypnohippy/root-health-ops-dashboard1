// app/dashboard/page.tsx
export default function DashboardPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f1f5f9",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "1rem",
          boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
          Root Health Dashboard
        </h1>
        <p>Dashboard connected! We’ll add Airtable data next.</p>
      </div>
    </div>
  );
}
