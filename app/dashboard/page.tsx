// app/dashboard/page.tsx

async function getTable(table: string) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { records: [], error: "Missing env vars", table };
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=20&sort[0][field]=created_at&sort[0][direction]=desc`,
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
  // these names are from your schema dump
  const content = await getTable("Content");
  const automations = await getTable("Automation_Log");
  const leads = await getTable("Leads");
  const introducers = await getTable("Introducers");

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
      <p style={{ marginBottom: "1.5rem" }}>
        Live Airtable snapshot (Content, Automation_Log, Leads, Introducers)
      </p>

      {/* top metrics */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Content</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {content.records.length}
          </h2>
          {content.error && (
            <p style={{ fontSize: "0.65rem", color: "#b91c1c" }}>{content.error}</p>
          )}
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Automation logs</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {automations.records.length}
          </h2>
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Leads</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {leads.records.length}
          </h2>
        </div>
        <div style={{ background: "white", padding: "1rem", borderRadius: "0.75rem", flex: 1 }}>
          <p>Introducers</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {introducers.records.length}
          </h2>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        {/* AUTOMATIONS */}
        <div style={{ flex: 1.5, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Automation_Log</h3>
          {automations.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Automation_Log”.
            </p>
          )}
          {automations.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div
                key={row.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  padding: "0.4rem 0",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                }}
              >
                <div>
                  <p style={{ fontWeight: 500 }}>
                    {f.action || f.details || "Automation run"}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                    {f.platform || ""} {f.run_at ? `• ${f.run_at}` : ""}
                  </p>
                </div>
                {f.success === false && (
                  <span
                    style={{
                      background: "#fee2e2",
                      color: "#b91c1c",
                      fontSize: "0.6rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "9999px",
                      height: "fit-content",
                    }}
                  >
                    failed
                  </span>
                )}
                {f.success === true && (
                  <span
                    style={{
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: "0.6rem",
                      padding: "0.2rem 0.5rem",
                      borderRadius: "9999px",
                      height: "fit-content",
                    }}
                  >
                    ok
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Content</h3>
          {content.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Content”.
            </p>
          )}
          {content.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div key={row.id} style={{ marginBottom: "0.5rem" }}>
                <p style={{ fontWeight: 500 }}>
                  {f.title || "(no title)"}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {Array.isArray(f.platform) ? f.platform.join(", ") : f.platform || ""}
                  {f.status ? ` • ${f.status}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {/* INTRODUCERS */}
        <div style={{ flex: 1, background: "white", padding: "1rem", borderRadius: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Introducers</h3>
          {introducers.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows found in “Introducers”.
            </p>
          )}
          {introducers.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div key={row.id} style={{ marginBottom: "0.5rem" }}>
                <p style={{ fontWeight: 500 }}>
                  {f.name || "Unnamed introducer"}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {f.social_handle || ""}
                  {f.tier ? ` • ${f.tier}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* LEADS LIST */}
      <div
        style={{
          marginTop: "1rem",
          background: "white",
          padding: "1rem",
          borderRadius: "0.75rem",
        }}
      >
        <h3 style={{ marginBottom: "0.5rem" }}>Leads</h3>
        {leads.records.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
            No rows found in “Leads”.
          </p>
        )}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {leads.records.map((row: any) => {
            const f = row.fields || {};
            return (
              <div
                key={row.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.75rem",
                  padding: "0.5rem 0.75rem",
                  minWidth: "180px",
                }}
              >
                <p style={{ fontWeight: 500 }}>{f.Name || "Lead"}</p>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {f.platform || f.source || ""}
                </p>
                {f.status && (
                  <p style={{ fontSize: "0.7rem" }}>Status: {f.status}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
