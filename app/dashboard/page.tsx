// app/dashboard/page.tsx

// 1) small helper to get one table
async function getAirtable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  // if env vars not set, return empty so we don't crash
  if (!baseId || !apiKey) {
    console.log("Airtable env vars missing");
    return [];
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=10`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.log("Airtable error:", await res.text());
    return [];
  }

  const data = await res.json();
  return data.records || [];
}

// 2) page component
export default async function DashboardPage() {
  // change "Content" to your real table name if needed
  const content = await getAirtable("Content");

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background: "#f1f5f9",
        color: "#0f172a",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: "bold",
          marginBottom: "1rem",
        }}
      >
        Root Health Dashboard
      </h1>
      <p style={{ marginBottom: "1.5rem" }}>
        Airtable test connection
      </p>

      <div
        style={{
          background: "white",
          padding: "1rem",
          borderRadius: "0.75rem",
          maxWidth: "320px",
        }}
      >
        <p style={{ marginBottom: "0.5rem" }}>
          Rows in <strong>Content</strong>:
        </p>
        <p style={{ fontSize: "2rem", fontWeight: "bold" }}>
          {content.length}
        </p>
        {content.length === 0 && (
          <p style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Either the table is empty or env vars are missing.
          </p>
        )}
      </div>
    </div>
  );
}
