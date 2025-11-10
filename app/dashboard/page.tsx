// app/dashboard/page.tsx

import ContentForm from "./ContentForm";

// helper to fetch a table with optional sort
async function getTable(
  table: string,
  sortField?: string,
  direction: "asc" | "desc" = "desc"
) {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !apiKey) {
    return { records: [], error: "Missing env vars", table };
  }

  const baseUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  const url = sortField
    ? `${baseUrl}?maxRecords=30&sort[0][field]=${encodeURIComponent(
        sortField
      )}&sort[0][direction]=${direction}`
    : `${baseUrl}?maxRecords=30`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    return { records: [], error: text, table };
  }

  const data = await res.json();
  return { records: data.records || [], error: null, table };
}

export default async function DashboardPage() {
  // your real tables
  const content = await getTable("Content", "Created Time");          // for publishing
  const leadConvos = await getTable("Lead_Conversations", "created_at"); // for replies
  const automations = await getTable("Automation_Log", "run_at");     // for Make checks

  // 1) content queue = not posted
  const contentQueue = content.records.filter((r: any) => {
    const f = r.fields || {};
    return f.status !== "posted" && f.status !== "Published";
  });

  // 2) reply queue = conversations that aren't done
  const replyQueue = leadConvos.records.filter((r: any) => {
    const f = r.fields || {};
    // you can tweak this condition later
    return f.status !== "done" && f.status !== "replied";
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background: "#0f172a0d",
        color: "#0f172a",
        fontFamily: "system-ui, sans-serif",
      }}
    >

      <ContentForm />

      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "1rem" }}>
        Root Health Ops
      </h1>
      <p style={{ marginBottom: "1.5rem" }}>
        Things to post, people to reply to, what Make actually did.
      </p>

      {/* top counters */}
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "white", borderRadius: "0.75rem", padding: "1rem", flex: 1 }}>
          <p>Content to post</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{contentQueue.length}</h2>
        </div>
        <div style={{ background: "white", borderRadius: "0.75rem", padding: "1rem", flex: 1 }}>
          <p>Replies needed</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{replyQueue.length}</h2>
        </div>
        <div style={{ background: "white", borderRadius: "0.75rem", padding: "1rem", flex: 1 }}>
          <p>Recent automations</p>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{automations.records.length}</h2>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem" }}>
        {/* CONTENT QUEUE */}
        <div style={{ flex: 1, background: "white", borderRadius: "0.75rem", padding: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Content to post</h3>
          {contentQueue.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              Nothing to post. Add rows in Airtable → Content.
            </p>
          )}
          {contentQueue.map((row: any) => {
            const f = row.fields || {};
            return (
              <div
                key={row.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  padding: "0.4rem 0",
                }}
              >
                <p style={{ fontWeight: 500 }}>
                  {f.title || f.test || f.test2 || "Untitled content"}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {Array.isArray(f.platform) ? f.platform.join(", ") : f.platform || "No platform"}
                  {f.status ? ` • ${f.status}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {/* REPLY QUEUE */}
        <div style={{ flex: 1, background: "white", borderRadius: "0.75rem", padding: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Replies needed</h3>
          {replyQueue.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No conversations need replies.
            </p>
          )}
          {replyQueue.map((row: any) => {
            const f = row.fields || {};
            return (
              <div
                key={row.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  padding: "0.4rem 0",
                }}
              >
                <p style={{ fontWeight: 500 }}>
                  {f.message_body ? f.message_body.slice(0, 80) : "Conversation"}
                  {f.message_body && f.message_body.length > 80 ? "..." : ""}
                </p>
                <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                  {f.platform || ""} {f.direction ? `• ${f.direction}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {/* AUTOMATIONS */}
        <div style={{ flex: 1, background: "white", borderRadius: "0.75rem", padding: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Latest automations</h3>
          {automations.records.length === 0 && (
            <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
              No rows in Automation_Log yet.
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
                  gap: "0.5rem",
                }}
              >
                <div>
                  <p style={{ fontWeight: 500 }}>
                    {f.action || "Automation run"}
                  </p>
                  <p style={{ fontSize: "0.7rem", color: "#94a3b8" }}>
                    {f.platform || ""}
                  </p>
                </div>
                {f.success === false ? (
                    <span
                      style={{
                        background: "#fee2e2",
                        color: "#b91c1c",
                        fontSize: "0.6rem",
                        padding: "0.1rem 0.5rem",
                        borderRadius: "9999px",
                        height: "fit-content",
                      }}
                    >
                      failed
                    </span>
                  ) : (
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#166534",
                        fontSize: "0.6rem",
                        padding: "0.1rem 0.5rem",
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
      </div>
    </div>
  );
}
