import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function firstName(name: string) {
  return name.trim().split(" ")[0] || name;
}

function getMessage(target: any) {
  const name = firstName(target.target_name);
  const company = target.company || "your organisation";
  const role = target.role_title || "your role";

  if (target.stage === "connection") {
    return `Hi ${name}, I noticed your work around ${role} at ${company}. I’ve been speaking with HR and wellbeing leaders about what actually gets used beyond traditional EAP support. It would be good to connect.`;
  }

  if (target.stage === "day3_dm") {
    return `Thanks for connecting, ${name}. I’ve been asking HR leaders a simple question: what parts of your current wellbeing or EAP setup do people genuinely use — and where does it fall short?`;
  }

  if (target.stage === "day10_insight") {
    return `Hi ${name}, one thing I keep seeing is that support often exists, but people only reach for it once things have already escalated. Do you find that at ${company}, or is engagement stronger?`;
  }

  if (target.stage === "day17_followup") {
    return `Just wanted to gently follow up, ${name}. Curious how you’re seeing engagement with wellbeing support in practice at the moment.`;
  }

  return `Hi ${name}, keeping this one parked for now.`;
}

function nextStage(stage: string) {
  if (stage === "connection") return "day3_dm";
  if (stage === "day3_dm") return "day10_insight";
  if (stage === "day10_insight") return "day17_followup";
  return "parked";
}

export default async function FollowUpsPage() {
  const { data } = await supabaseAdmin
    .from("growth_targets")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  async function addTarget(formData: FormData) {
    "use server";

    await supabaseAdmin.from("growth_targets").insert({
      target_name: String(formData.get("target_name") || ""),
      company: String(formData.get("company") || ""),
      role_title: String(formData.get("role_title") || ""),
      linkedin_url: String(formData.get("linkedin_url") || ""),
      notes: String(formData.get("notes") || ""),
      stage: "connection",
      status: "active",
    });

    revalidatePath("/dashboard/growth/followups");
  }

  async function advanceTarget(id: string, currentStage: string) {
    "use server";

    await supabaseAdmin
      .from("growth_targets")
      .update({
        stage: nextStage(currentStage),
        last_action_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/dashboard/growth/followups");
  }

  async function parkTarget(id: string) {
    "use server";

    await supabaseAdmin
      .from("growth_targets")
      .update({
        status: "parked",
        stage: "parked",
        last_action_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/dashboard/growth/followups");
  }

  return (
    <main style={page}>
      <h1 style={title}>🎯 Follow-Up Engine</h1>

      <p style={subtitle}>
        Add LinkedIn targets, generate personalised messages, and move them through the outreach sequence.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Daily Growth Engine</a>{" "}
        <a href="/dashboard/growth/tracker" style={button}>📊 Tracker</a>
      </div>

      <section style={card}>
        <h2>Add Target</h2>

        <form action={addTarget}>
          <input name="target_name" placeholder="Name e.g. Sarah Jones" required style={input} />
          <input name="company" placeholder="Company e.g. Acme Ltd" style={input} />
          <input name="role_title" placeholder="Role e.g. HR Director" style={input} />
          <input name="linkedin_url" placeholder="LinkedIn URL optional" style={input} />
          <textarea name="notes" placeholder="Notes e.g. posted about burnout, hybrid work, EAPs" style={textarea} />

          <button style={greenButton}>Add Target</button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        {!data || data.length === 0 ? (
          <p>No targets yet.</p>
        ) : (
          data.map((target: any) => (
            <article key={target.id} style={card}>
              <p style={date}>
                Added: {new Date(target.created_at).toLocaleString("en-GB")}
              </p>

              <h2 style={cardTitle}>
                {target.target_name}
              </h2>

              <p style={muted}>
                {target.role_title || "Role not added"} · {target.company || "Company not added"}
              </p>

              <p style={stageBadge}>
                Stage: {target.stage}
              </p>

              {target.linkedin_url && (
                <p>
                  <a href={target.linkedin_url} target="_blank" style={link}>
                    Open LinkedIn profile
                  </a>
                </p>
              )}

              {target.notes && (
                <>
                  <h3 style={smallTitle}>Notes</h3>
                  <p style={text}>{target.notes}</p>
                </>
              )}

              <h3 style={smallTitle}>Suggested Message</h3>

              <div style={messageBox}>
                {getMessage(target)}
              </div>

              <form action={advanceTarget.bind(null, target.id, target.stage)} style={{ display: "inline-block" }}>
                <button style={greenButton}>
                  Mark Sent / Move Next
                </button>
              </form>

              <form action={parkTarget.bind(null, target.id)} style={{ display: "inline-block", marginLeft: 10 }}>
                <button style={darkButton}>
                  Park
                </button>
              </form>
            </article>
          ))
        )}
      </section>
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
  marginTop: 18,
};

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#020617",
  color: "#ffffff",
};

const textarea: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#020617",
  color: "#ffffff",
  minHeight: 80,
};

const greenButton: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 12px",
  borderRadius: 8,
  background: "#22c55e",
  color: "#020617",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const darkButton: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 12px",
  borderRadius: 8,
  background: "#334155",
  color: "#ffffff",
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

const date: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};

const cardTitle: React.CSSProperties = {
  fontSize: 22,
  marginTop: 8,
};

const muted: React.CSSProperties = {
  color: "#cbd5e1",
};

const stageBadge: React.CSSProperties = {
  color: "#facc15",
  fontWeight: 700,
};

const smallTitle: React.CSSProperties = {
  marginTop: 16,
  fontSize: 16,
};

const text: React.CSSProperties = {
  color: "#e5e7eb",
  whiteSpace: "pre-wrap",
};

const messageBox: React.CSSProperties = {
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: 14,
  color: "#ffffff",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const link: React.CSSProperties = {
  color: "#93c5fd",
};
