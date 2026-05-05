import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function daysSince(date: string | null) {
  if (!date) return 999;
  const diff = Date.now() - new Date(date).getTime();
  return diff / (1000 * 60 * 60 * 24);
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
  const name = firstName(target.target_name);

  if (target.stage === "connection") {
    return `Hi ${name}, I noticed your work in ${target.role_title}. I’ve been speaking with HR leaders about what actually gets used beyond EAPs. Would be good to connect.`;
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

export default async function FollowUpsPage() {
  const { data } = await supabaseAdmin
    .from("growth_targets")
    .select("*")
    .eq("status", "active");

  const due = data?.filter(isDue) || [];

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

  return (
    <main style={page}>
      <h1 style={title}>🎯 Today’s Follow-Ups</h1>

      <p style={subtitle}>
        Only showing people you should message today.
      </p>

      <a href="/dashboard/growth" style={button}>
        ← Back
      </a>

      <div style={{ marginTop: 24 }}>
        {due.length === 0 ? (
          <p>No follow-ups due today.</p>
        ) : (
          due.map((t: any) => (
            <article key={t.id} style={card}>
              <h2>{t.target_name}</h2>
              <p style={muted}>{t.role_title} · {t.company}</p>

              <p style={stage}>Stage: {t.stage}</p>

              <div style={msg}>
                {getMessage(t)}
              </div>

              <form action={advanceTarget.bind(null, t.id, t.stage)}>
                <button style={btn}>
                  Mark Sent
                </button>
              </form>
            </article>
          ))
        )}
      </div>
    </main>
  );
}

const page = {
  padding: 24,
  color: "#fff",
  background: "#020617",
  minHeight: "100vh",
};

const title = { fontSize: 28, fontWeight: 700 };
const subtitle = { color: "#cbd5e1" };

const button = {
  display: "inline-block",
  marginTop: 12,
  padding: "8px 12px",
  background: "#fff",
  color: "#000",
  borderRadius: 8,
};

const card = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
};

const muted = { color: "#94a3b8" };
const stage = { color: "#facc15" };

const msg = {
  marginTop: 10,
  background: "#020617",
  padding: 10,
  borderRadius: 8,
};

const btn = {
  marginTop: 10,
  padding: "6px 10px",
  background: "#22c55e",
  color: "#000",
  borderRadius: 6,
};
