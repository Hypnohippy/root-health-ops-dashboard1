import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function daysSince(date: string | null) {
  if (!date) return 999;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function isDue(target: any) {
  const days = daysSince(target.last_action_at);

  if (target.stage === "connection") return true;
  if (target.stage === "day3_dm") return days >= 3;
  if (target.stage === "day10_insight") return days >= 7;
  if (target.stage === "day17_followup") return days >= 7;

  return false;
}

function firstName(name: string) {
  return name.split(" ")[0];
}

function getMessage(target: any) {
  const name = firstName(target.target_name || "there");

  if (target.stage === "connection") {
    return `Hi ${name}, I noticed your work in ${target.role_title || "HR / wellbeing"}. I’ve been speaking with HR leaders about what actually gets used beyond EAPs. Would be good to connect.`;
  }

  if (target.stage === "day3_dm") {
    return `Thanks for connecting, ${name}. Quick question — what parts of your current wellbeing setup actually get used, and where does it fall short?`;
  }

  if (target.stage === "day10_insight") {
    return `Hi ${name}, one thing I keep seeing is support exists, but people only use it once things escalate. Do you see that in your organisation?`;
  }

  if (target.stage === "day17_followup") {
    return `Just wanted to follow up, ${name}. Curious how you're seeing engagement with wellbeing support in practice.`;
  }

  return "";
}

function nextStage(stage: string) {
  if (stage === "connection") return "day3_dm";
  if (stage === "day3_dm") return "day10_insight";
  if (stage === "day10_insight") return "day17_followup";
  return "parked";
}

function qualityLabel(value: string | null) {
  if (value === "valid") return "Valid lead ✅";
  if (value === "fake_or_invalid") return "Fake / invalid ❌";
  if (value === "company_profile") return "Company profile 🏢";
  if (value === "research_needed") return "Research needed 🔎";
  if (value === "not_relevant") return "Not relevant 🚫";
  return "Unreviewed";
}

export default async function FollowUpsPage() {
  const { data } = await supabaseAdmin
    .from("growth_targets")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const targets = data || [];
  const due = targets.filter(isDue);

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
      lead_quality: "unreviewed",
    });

    revalidatePath("/dashboard/growth/followups");
  }

  async function advanceTarget(id: string, stage: string) {
    "use server";

    await supabaseAdmin
      .from("growth_targets")
      .update({
        stage: nextStage(stage),
        last_action_at: new Date().toISOString(),
      })
      .eq("id", id);

    revalidatePath("/dashboard/growth/followups");
  }

  async function updateLeadQuality(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const lead_quality = String(formData.get("lead_quality") || "unreviewed");
    const lead_quality_notes = String(formData.get("lead_quality_notes") || "");

    if (!id) return;

    await supabaseAdmin
      .from("growth_targets")
      .update({
        lead_quality,
        lead_quality_notes,
      })
      .eq("id", id);

    revalidatePath("/dashboard/growth/followups");
  }

  return (
    <main style={page}>
      <h1 style={title}>🎯 Follow-Up Engine</h1>

      <p style={subtitle}>
        Add targets, review lead quality, and move valid prospects through the LinkedIn outreach sequence.
      </p>

      <div style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>
          ← Cockpit
        </a>{" "}
        <a href="/dashboard/growth/import" style={button}>
          📥 Import
        </a>{" "}
        <a href="/dashboard/growth/pipeline" style={button}>
          💼 Pipeline
        </a>
      </div>

      <section style={card}>
        <h2>Add Target</h2>

        <form action={addTarget}>
          <input name="target_name" placeholder="Name" required style={input} />
          <input name="company" placeholder="Company" style={input} />
          <input name="role_title" placeholder="Role" style={input} />
          <input name="linkedin_url" placeholder="LinkedIn URL" style={input} />
          <textarea name="notes" placeholder="Notes" style={textarea} />

          <button style={greenButton}>Add Target</button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Due Today</h2>

        {due.length === 0 ? (
          <p style={muted}>No follow-ups due today.</p>
        ) : (
          due.map((t: any) => (
            <article key={t.id} style={card}>
              <h3 style={{ marginBottom: 4 }}>{t.target_name}</h3>

              <p style={muted}>
                {t.role_title || "Role not added"} · {t.company || "Company not added"}
              </p>

              <p style={stage}>Stage: {t.stage}</p>

              <p style={quality}>
                Lead quality: {qualityLabel(t.lead_quality)}
              </p>

              {t.linkedin_url && (
                <p>
                  <a href={t.linkedin_url} target="_blank" style={link}>
                    Open LinkedIn profile
                  </a>
                </p>
              )}

              {t.notes && (
                <>
                  <h4 style={smallTitle}>Imported Notes</h4>
                  <p style={text}>{t.notes}</p>
                </>
              )}

              <div style={qualityBox}>
                <h4 style={{ marginTop: 0 }}>Lead Quality Controls</h4>

                <form action={updateLeadQuality}>
                  <input type="hidden" name="id" value={t.id} />

                  <select
                    name="lead_quality"
                    defaultValue={t.lead_quality || "unreviewed"}
                    style={select}
                  >
                    <option value="unreviewed">Unreviewed</option>
                    <option value="valid">Valid lead</option>
                    <option value="fake_or_invalid">Fake / invalid</option>
                    <option value="company_profile">Company profile</option>
                    <option value="research_needed">Research needed</option>
                    <option value="not_relevant">Not relevant</option>
                  </select>

                  <textarea
                    name="lead_quality_notes"
                    defaultValue={t.lead_quality_notes || ""}
                    placeholder="Notes e.g. company page, need to find HR Director, profile not found..."
                    style={textarea}
                  />

                  <button style={blueButton}>Save Lead Quality</button>
                </form>
              </div>

              {(t.lead_quality === "valid" || t.lead_quality === "unreviewed" || !t.lead_quality) && (
                <>
                  <h4 style={smallTitle}>Suggested Message</h4>
                  <div style={msg}>{getMessage(t)}</div>

                  <form action={advanceTarget.bind(null, t.id, t.stage)}>
                    <button style={greenButton}>Mark Sent / Move Next</button>
                  </form>
                </>
              )}

              {t.lead_quality === "company_profile" && (
                <div style={warningBox}>
                  This looks like a company page. Research the right person: HR Director, People Lead, L&amp;D Manager, Wellbeing Lead or EAP owner.
                </div>
              )}

              {t.lead_quality === "research_needed" && (
                <div style={warningBox}>
                  Research needed before messaging. Find the right decision-maker before moving this into outreach.
                </div>
              )}

              {(t.lead_quality === "fake_or_invalid" || t.lead_quality === "not_relevant") && (
                <div style={badBox}>
                  Do not message this lead.
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}

const page: React.CSSProperties = {
  padding: 24,
  color: "#fff",
  background: "#020617",
  minHeight: "100vh",
};

const title: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
};

const subtitle: React.CSSProperties = {
  color: "#cbd5e1",
  marginTop: 8,
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "8px 12px",
  background: "#0f172a",
  color: "#fff",
  border: "1px solid #334155",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 16,
  marginTop: 14,
};

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
};

const textarea: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
  minHeight: 80,
};

const select: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#020617",
  color: "#ffffff",
  border: "1px solid #334155",
};

const greenButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  background: "#22c55e",
  color: "#020617",
  borderRadius: 8,
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const blueButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  background: "#38bdf8",
  color: "#020617",
  borderRadius: 8,
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
};

const stage: React.CSSProperties = {
  color: "#facc15",
  fontWeight: 700,
};

const quality: React.CSSProperties = {
  color: "#86efac",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#93c5fd",
};

const smallTitle: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 6,
};

const text: React.CSSProperties = {
  color: "#e5e7eb",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const qualityBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  background: "#020617",
  border: "1px solid #334155",
};

const msg: React.CSSProperties = {
  marginTop: 10,
  background: "#020617",
  padding: 12,
  borderRadius: 8,
  border: "1px solid #334155",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const warningBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 8,
  background: "#422006",
  color: "#fde68a",
  border: "1px solid #92400e",
};

const badBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 8,
  background: "#450a0a",
  color: "#fecaca",
  border: "1px solid #991b1b",
};
