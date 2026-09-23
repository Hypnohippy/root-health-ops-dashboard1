import { requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export default async function GrowthTrackerPage({ searchParams }: { searchParams: Promise<{ organisationId?: string }> }) {
  const { organisationId } = await requireOrganisation((await searchParams).organisationId, false);
  const { data } = await supabaseAdmin
    .from("growth_plans")
    .select("*").eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(50);

  async function markUsed(id: string) {
    "use server";
    const verified = await requireOrganisation(organisationId);

    await supabaseAdmin
      .from("growth_plans")
      .update({ used: true })
      .eq("id", id).eq("organisation_id", verified.organisationId);

    revalidatePath("/dashboard/growth/tracker");
  }

  return (
    <main style={page}>
      <h1 style={title}>📊 Growth Tracker</h1>

      <a href="/dashboard/growth" style={button}>
        ← Back
      </a>

      <div style={{ marginTop: 24 }}>
        {data?.map((plan: any) => (
          <article key={plan.id} style={card}>
            <p style={date}>
              {new Date(plan.created_at).toLocaleString("en-GB")}
            </p>

            <Status used={plan.used} />

            {!plan.used && (
              <form action={markUsed.bind(null, plan.id)}>
                <button style={useBtn}>Mark as Used</button>
              </form>
            )}

            <h2 style={cardTitle}>Post</h2>
            <p style={text}>{plan.linkedin_post}</p>

            <h2 style={cardTitle}>DM</h2>
            <p style={text}>{plan.dm_message}</p>

            <h2 style={cardTitle}>Follow Up</h2>
            <p style={text}>{plan.follow_up_message}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

function Status({ used }: { used: boolean }) {
  return (
    <p style={{ color: used ? "#22c55e" : "#facc15" }}>
      {used ? "Used ✅" : "Not used yet"}
    </p>
  );
}

const page = {
  padding: 24,
  color: "#fff",
  background: "#020617",
  minHeight: "100vh",
};

const title = { fontSize: 28, fontWeight: 700 };

const button = {
  display: "inline-block",
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fff",
  color: "#000",
  textDecoration: "none",
};

const card = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const date = { color: "#94a3b8" };

const cardTitle = { marginTop: 12 };

const text = { whiteSpace: "pre-wrap" };

const useBtn = {
  marginTop: 10,
  padding: "6px 10px",
  borderRadius: 6,
  background: "#22c55e",
  color: "#000",
  cursor: "pointer",
};
