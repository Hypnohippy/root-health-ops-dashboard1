import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export default async function GrowthTrackerPage() {
  const { data, error } = await supabaseAdmin
    .from("growth_plans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return (
      <main style={page}>
        <h1>📊 Growth Tracker</h1>
        <p style={{ color: "#fca5a5" }}>Error: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <h1 style={title}>📊 Growth Tracker</h1>

      <p style={subtitle}>
        Your saved Daily Growth Engine plans.
      </p>

      <a href="/dashboard/growth" style={button}>
        ← Back to Daily Growth Engine
      </a>

      <div style={{ marginTop: 24 }}>
        {!data || data.length === 0 ? (
          <p>No saved growth plans yet.</p>
        ) : (
          data.map((plan: any) => (
            <article key={plan.id} style={card}>
              <p style={date}>
                {new Date(plan.created_at).toLocaleString("en-GB")}
              </p>

              <h2 style={cardTitle}>LinkedIn Post</h2>
              <p style={text}>{plan.linkedin_post}</p>

              <h2 style={cardTitle}>Connection Messages</h2>
              <ol>
                {(plan.connection_messages || []).map((msg: string, i: number) => (
                  <li key={i} style={listItem}>{msg}</li>
                ))}
              </ol>

              <h2 style={cardTitle}>DM Message</h2>
              <p style={text}>{plan.dm_message}</p>

              <h2 style={cardTitle}>Follow Up</h2>
              <p style={text}>{plan.follow_up_message}</p>

              {plan.seo_article && (
                <>
                  <h2 style={cardTitle}>SEO Article</h2>
                  <p style={text}>
                    <strong>{plan.seo_article.title}</strong>
                  </p>

                  {Array.isArray(plan.seo_article.outline) && (
                    <ul>
                      {plan.seo_article.outline.map((item: string, i: number) => (
                        <li key={i} style={listItem}>{item}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </article>
          ))
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  color: "#ffffff",
  background: "#020617",
  minHeight: "100vh",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
};

const subtitle: React.CSSProperties = {
  marginTop: 8,
  color: "#cbd5e1",
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#020617",
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 18,
  marginBottom: 20,
};

const date: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};

const cardTitle: React.CSSProperties = {
  fontSize: 18,
  marginTop: 18,
  marginBottom: 8,
};

const text: React.CSSProperties = {
  color: "#e5e7eb",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const listItem: React.CSSProperties = {
  marginBottom: 8,
  color: "#e5e7eb",
  lineHeight: 1.5,
};
