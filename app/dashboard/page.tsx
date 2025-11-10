// app/dashboard/page.tsx

async function getAirtable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { records: [], error: "Missing env vars", table };
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
    const text = await res.text();
    return { records: [], error: text, table };
  }

  const data = await res.json();
  return { records: data.records || [], error: null, table };
}

export default async function DashboardPage() {
  // using the tables you said were in the base
  const table1 = await getAirtable("Table 1");
  const leads = await getAirtable("Leads");
  const leadConvos = await getAirtable("Lead conversations");

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
        Root Health Dashboard
      </h1>
      <p style={{ marginBottom: "1.5rem" }}>Live Airtable snapshot (GPT base)</p>

      {/* top counts */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Table 1 rows</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{table1.records.length}</h2>
          {table1.error && (
            <p style={{ fontSize: "0.65rem", color: "#b91c1c" }}>Table: {table1.table}</p>
          )}
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Leads</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{leads.records.length}</h2>
          {leads.error && (
            <p style={{ fontSize: "0.65rem", color: "#b91c1c" }}>Table: {leads.table}</p>
          )}
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Lead conversations</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{leadConvos.records.length}</h2>
          {leadConvos.error && (
            <p style={{ fontSize: "0.65rem", color: "#b91c1c" }}>Table: {leadConvos.table}</p>
          )}
        </div>
      </div>

      {/* show latest rows from Table 1 */}
      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 2, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Table 1 (raw rows)</h3>
          {table1.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Table 1”.
            </p>
          )}
          {table1.records.map((row: any) => (
            <pre
              key={row.id}
              style={{
                background: "#e2e8f0",
                padding: "0.5rem",
                borderRadius: "0.5rem",
                marginBottom: "0.5rem",
                fontSize: "0.7rem",
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(row.fields, null, 2)}
            </pre>
          ))}
        </div>

        {/* leads list */}
        <div style={{ flex: 1, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Leads</h3>
          {leads.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Leads”.
            </p>
          )}
          {leads.records.map((row: any) => (
            <div key={row.id} style={{ marginBottom: "0.5rem" }}>
              <p style={{ fontWeight: 500 }}>
                {row.fields.Name || row.fields.name || "Lead"}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                {row.fields.Email || row.fields.email || ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
