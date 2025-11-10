// app/dashboard/page.tsx

async function getAirtable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { records: [], error: "Missing env vars", table };
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=20`,
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

      {/* counts */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Table 1 rows</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{table1.records.length}</h2>
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Leads</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{leads.records.length}</h2>
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Lead conversations</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{leadConvos.records.length}</h2>
          {leadConvos.records.length === 0 && (
            <p style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
              Table exists, no conversations yet.
            </p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        {/* TABLE 1 with field names shown */}
        <div style={{ flex: 2, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Table 1</h3>
          {table1.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>No rows found in “Table 1”.</p>
          )}
          {table1.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div
                key={row.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  padding: "0.5rem 0",
                  marginBottom: "0.5rem",
                }}
              >
                {/* show all fields so we can see exact names */}
                <p style={{ fontWeight: 600, marginBottom: "0.25rem" }}>
                  {f["A Name"] ||
                    f["A name"] ||
                    f["Name"] ||
                    "(no A Name field found)"}
                </p>
                {f.Assignee && (
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                    Assignee: {f.Assignee}
                  </p>
                )}
                {f.Status && (
                  <p style={{ fontSize: "0.7rem" }}>Status: {f.Status}</p>
                )}

                {/* debug: show full field keys */}
                <details style={{ marginTop: "0.25rem" }}>
                  <summary style={{ fontSize: "0.65rem", cursor: "pointer" }}>
                    show fields
                  </summary>
                  <pre
                    style={{
                      background: "#e2e8f0",
                      padding: "0.4rem",
                      borderRadius: "0.4rem",
                      fontSize: "0.65rem",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(f, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })}
        </div>

        {/* LEADS */}
        <div style={{ flex: 1, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Leads</h3>
          {leads.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>No rows found in “Leads”.</p>
          )}
          {leads.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div key={row.id} style={{ marginBottom: "0.5rem" }}>
                <p style={{ fontWeight: 500 }}>{f.Name || f.name || "Lead"}</p>
                {(f.Email || f.email) && (
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                    {f.Email || f.email}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
