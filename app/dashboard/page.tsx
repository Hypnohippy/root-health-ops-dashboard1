// app/dashboard/page.tsx
// this version asks Airtable: "what tables do you have in this base?"

async function getSchema() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { error: "Missing env vars", tables: [] };
  }

  const res = await fetch(
    `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return { error: text, tables: [] };
  }

  const data = await res.json();
  return { error: null, tables: data.tables || [] };
}

export default async function DashboardPage() {
  const schema = await getSchema();

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background: "#f1f5f9",
        color: "#0f172a",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
        Root Health Dashboard – Airtable tables
      </h1>
      <p style={{ marginBottom: "1rem" }}>
        Showing what Airtable says is in base <code>{process.env.AIRTABLE_BASE_ID}</code>
      </p>

      {schema.error && (
        <pre
          style={{
            background: "#fee2e2",
            color: "#b91c1c",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            whiteSpace: "pre-wrap",
            marginBottom: "1rem",
          }}
        >
          {schema.error}
        </pre>
      )}

      {schema.tables.length === 0 && !schema.error && (
        <p>No tables found in this base.</p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        {schema.tables.map((table: any) => (
          <div
            key={table.id}
            style={{
              background: "white",
              padding: "1rem",
              borderRadius: "0.75rem",
              minWidth: "240px",
            }}
          >
            <h2 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              {table.name}
            </h2>
            <p style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "0.5rem" }}>
              {table.fields.length} fields
            </p>
            <ul style={{ fontSize: "0.75rem", lineHeight: 1.3 }}>
              {table.fields.map((field: any) => (
                <li key={field.id}>
                  {field.name}{" "}
                  <span style={{ color: "#94a3b8" }}>({field.type})</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
