import { requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function nextDueDate(target: any) {
  if (!target.last_action_at) return "Not contacted yet";

  const base = new Date(target.last_action_at);

  if (target.stage === "day3_dm") {
    base.setDate(base.getDate() + 3);
  } else if (target.stage === "day10_insight") {
    base.setDate(base.getDate() + 7);
  } else if (target.stage === "day17_followup") {
    base.setDate(base.getDate() + 7);
  } else {
    return "No next step";
  }

  return base.toLocaleString("en-GB");
}

export default async function WaitingPage({ searchParams }: { searchParams: Promise<{ organisationId?: string }> }) {
  const { organisationId } = await requireOrganisation((await searchParams).organisationId, false);
  const { data, error } = await supabaseAdmin
    .from("growth_targets")
    .select("*").eq("organisation_id", organisationId)
    .eq("status", "active")
    .not("last_action_at", "is", null)
    .order("last_action_at", { ascending: false });

  if (error) {
    return (
      <main style={page}>
        <h1>⏳ Waiting</h1>
        <p style={{ color: "#fca5a5" }}>Error: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={page}>
      <h1 style={title}>⏳ Waiting / Recently Sent</h1>

      <p style={subtitle}>
        People you have already contacted who are not necessarily due again yet.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>👥 Leads</a>{" "}
        <a href="/dashboard/growth/pipeline" style={button}>💼 Pipeline</a>
      </div>

      {!data || data.length === 0 ? (
        <p style={muted}>No recently contacted leads yet.</p>
      ) : (
        <section style={{ marginTop: 22 }}>
          {data.map((target: any) => (
            <article key={target.id} style={card}>
              <h2 style={{ marginBottom: 4 }}>{target.target_name}</h2>

              <p style={muted}>
                {target.role_title || "Role not added"} · {target.company || "Company not added"}
              </p>

              <p style={stage}>Current stage: {target.stage}</p>

              <p style={green}>
                Last action: {new Date(target.last_action_at).toLocaleString("en-GB")}
              </p>

              <p style={next}>
                Next due: {nextDueDate(target)}
              </p>

              <p style={muted}>
                Reply status: {target.reply_status || "no_reply"}
              </p>

              {target.linkedin_url && (
                <p>
                  <a href={target.linkedin_url} target="_blank" style={link}>
                    Open LinkedIn profile
                  </a>
                </p>
              )}
            </article>
          ))}
        </section>
      )}
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

const card: React.CSSProperties = {
  marginTop: 14,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 16,
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const stage: React.CSSProperties = {
  color: "#facc15",
  fontWeight: 700,
};

const green: React.CSSProperties = {
  color: "#86efac",
  fontWeight: 700,
};

const next: React.CSSProperties = {
  color: "#93c5fd",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#93c5fd",
};
