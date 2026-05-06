import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export default async function GrowthPipelinePage() {
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*")
    .order("replied_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main style={page}>
        <h1>💼 Growth Pipeline</h1>
        <p style={{ color: "#fca5a5" }}>Error: {error.message}</p>
      </main>
    );
  }

  const warm = data?.filter((t: any) => t.reply_status === "warm_lead") || [];
  const calls = data?.filter((t: any) => t.reply_status === "call_booked") || [];
  const replied = data?.filter((t: any) => t.reply_status === "replied") || [];
  const noReply = data?.filter((t: any) => !t.reply_status || t.reply_status === "no_reply") || [];
  const notInterested = data?.filter((t: any) => t.reply_status === "not_interested") || [];
const recentReplies =
  data?.filter((t: any) => {
    if (!t.replied_at) return false;
    const diff = Date.now() - new Date(t.replied_at).getTime();
    return diff < 1000 * 60 * 60 * 48; // last 48h
  }) || [];

const hotLeads = [...warm, ...calls, ...recentReplies];
  return (
    <main style={page}>
      <h1 style={title}>💼 Growth Pipeline</h1>

      <p style={subtitle}>
        Track replies, warm leads and booked calls from your LinkedIn outreach.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>🎯 Follow-Ups</a>{" "}
        <a href="/dashboard/growth/tracker" style={button}>📊 Tracker</a>
      </div>

      <div style={statsGrid}>
        <Stat label="Warm Leads" value={warm.length} />
        <Stat label="Calls Booked" value={calls.length} />
        <Stat label="Replied" value={replied.length} />
        <Stat label="No Reply" value={noReply.length} />
      </div>
      <PipelineSection title="🔥 Hot Leads (Focus Today)" targets={hotLeads} />
      <PipelineSection title="🔥 Warm Leads" targets={warm} />
      <PipelineSection title="📅 Calls Booked" targets={calls} />
      <PipelineSection title="💬 Replied" targets={replied} />
      <PipelineSection title="⏳ No Reply Yet" targets={noReply} />
      <PipelineSection title="🚫 Not Interested" targets={notInterested} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statCard}>
      <div style={statValue}>{value}</div>
      <div style={statLabel}>{label}</div>
    </div>
  );
}

function PipelineSection({ title, targets }: { title: string; targets: any[] }) {
  return (
    <section style={section}>
      <h2>{title}</h2>

      {targets.length === 0 ? (
        <p style={muted}>Nothing here yet.</p>
      ) : (
        targets.map((target: any) => (
          <article key={target.id} style={card}>
            <h3 style={{ margin: 0 }}>{target.target_name}</h3>

            <p style={muted}>
              {target.role_title || "Role not added"} · {target.company || "Company not added"}
            </p>

            <p style={stage}>Stage: {target.stage || "connection"}</p>

            {target.linkedin_url && (
              <p>
                <a href={target.linkedin_url} target="_blank" style={link}>
                  Open LinkedIn profile
                </a>
              </p>
            )}

            {target.reply_notes && (
              <>
                <h4 style={smallTitle}>Reply Notes</h4>
                <p style={text}>{target.reply_notes}</p>
              </>
            )}

            {target.replied_at && (
              <p style={date}>
                Reply updated: {new Date(target.replied_at).toLocaleString("en-GB")}
              </p>
            )}
          </article>
        ))
      )}
    </section>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  color: "#ffffff",
  background: "#020617",
  minHeight: "100vh",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
};

const button: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "#0f172a",
  color: "#ffffff",
  border: "1px solid #334155",
  textDecoration: "none",
  fontWeight: 700,
};

const statsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  marginTop: 22,
};

const statCard: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 14,
  padding: 16,
};

const statValue: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
};

const statLabel: React.CSSProperties = {
  color: "#94a3b8",
};

const section: React.CSSProperties = {
  marginTop: 24,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 18,
};

const card: React.CSSProperties = {
  marginTop: 14,
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 14,
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const stage: React.CSSProperties = {
  color: "#facc15",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#93c5fd",
};

const smallTitle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 6,
};

const text: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const date: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};
