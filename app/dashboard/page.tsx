// app/dashboard/page.tsx

async function getAirtable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { records: [], error: "Missing env vars", table };
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=10&sort[0][field]=created_time&sort[0][direction]=desc`,
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
  // use your real table names
  const content = await getAirtable("Content");
  const automations = await getAirtable("Automations Log");
  const introducers = await getAirtable("Introducers");

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
      <p style={{ marginBottom: "1.5rem" }}>Live Airtable snapshot</p>

      {/* top counts */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Content rows</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{content.records.length}</h2>
          {content.error && (
            <p style={{ fontSize: "0.6rem", color: "#b91c1c" }}>Table: {content.table}</p>
          )}
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Automation runs</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{automations.records.length}</h2>
          {automations.error && (
            <p style={{ fontSize: "0.6rem", color: "#b91c1c" }}>Table: {automations.table}</p>
          )}
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Introducers</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{introducers.records.length}</h2>
          {introducers.error && (
            <p style={{ fontSize: "0.6rem", color: "#b91c1c" }}>Table: {introducers.table}</p>
          )}
        </div>
      </div>

      {/* latest automations */}
      <div style={{ display: "flex", gap: "1rem" }}>
        <div style={{ flex: 2, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Automations Log</h3>
          {automations.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found or table name is different (“Automations Log”?)
            </p>
          )}
          {automations.records.map((row: any) => (
            <div
              key={row.id}
              style={{ borderBottom: "1px solid #e2e8f0", padding: "0.5rem 0" }}
            >
              <p style={{ fontWeight: 500 }}>
                {row.fields.action || row.fields.details || "Automation event"}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                {row.fields.platform || ""} {row.fields.run_at ? `• ${row.fields.run_at}` : ""}
              </p>
            </div>
          ))}
        </div>

        {/* recent content */}
        <div style={{ flex: 1, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Recent Content</h3>
          {content.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Content”.
            </p>
          )}
          {content.records.map((row: any) => (
            <div key={row.id} style={{ marginBottom: "0.5rem" }}>
              <p style={{ fontWeight: 500 }}>
                {row.fields.Title ||
                  row.fields.test ||
                  row.fields["test 1"] ||
                  "Content item"}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                {row.fields.Platform || row.fields.platform || ""}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* introducers */}
      <div
        style={{
          marginTop: "1rem",
          background: "white",
          padding: "1rem",
          borderRadius: "0.75rem",
        }}
      >
        <h3 style={{ marginBottom: "0.5rem" }}>Introducers</h3>
        {introducers.records.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
            No rows found in “Introducers”.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {introducers.records.map((row: any) => (
            <div
              key={row.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "0.75rem",
                padding: "0.5rem 0.75rem",
                minWidth: "180px",
              }}
            >
              <p style={{ fontWeight: 500 }}>
                {row.fields.name || row.fields.Name || "No name"}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                {row.fields["social handle"] || row.fields.email || ""}
              </p>
              <p style={{ fontSize: "0.7rem" }}>
                Leads: <strong>{row.fields.leads_referred ?? 0}</strong>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
