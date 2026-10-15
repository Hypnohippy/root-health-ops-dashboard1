import { OpsIntelligenceCard, OpsSurface } from "../../components/visual/OpsSurface";
import { OverviewIcon } from "../relationships/components/RelationshipOverviewVisuals";
import "./tracker.css";
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
    <div className="growth-tracker" style={page}>
      <header className="tracker-header"><div><p className="tracker-eyebrow">Growth Operations Centre · Tracker</p>
      <h1 style={title}><OverviewIcon kind="task"/>Growth Tracker</h1><p>Revisit your saved plans and their recorded usage status.</p></div><span className="tracker-view-chip">Latest 50 saved plans</span></header>
      <section className="tracker-intelligence" aria-label="Tracker briefing"><OpsIntelligenceCard title="Where we are now" tone="blue"><p>{data?.length || 0} plans in this view</p><p>The latest saved plans, ordered by creation date.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What is recorded" tone="violet"><p>{data?.filter(plan=>plan.used).length || 0} marked used</p><p>The used flag records an operator action, not proof of publishing or sending.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What to do next" tone="green"><p>Review the plan and update its usage status</p><p>Mark as Used remains an explicit action. Nothing is sent from Tracker.</p></OpsIntelligenceCard></section>
      <section className="tracker-metrics" aria-label="Current Tracker view counts">{[["research",data?.length || 0,"Saved plans in this view"],["check",data?.filter(plan=>plan.used).length || 0,"Marked used"],["task",data?.filter(plan=>!plan.used).length || 0,"Not used yet"],["opportunity","Not established","Performance outcome"]].map(([icon,value,label])=><OpsSurface key={String(label)}><OverviewIcon kind={String(icon)}/><div><strong>{value}</strong><span>{label}</span></div></OpsSurface>)}</section>
      <div className="tracker-evidence"><OpsSurface><h2><OverviewIcon kind="opportunity"/>Recorded plan status</h2><div className="tracker-status-bars">{[["Marked used",data?.filter(plan=>plan.used).length || 0],["Not used yet",data?.filter(plan=>!plan.used).length || 0]].map(([label,count])=><div key={String(label)}><span>{label}</span><i><b style={{width:`${Number(count)/Math.max(data?.length || 0,1)*100}%`}}/></i><strong>{count}</strong></div>)}</div><small>Counts for up to 50 returned plans · no performance or conversion inferred.</small></OpsSurface><OpsSurface className="tracker-outcome"><h2><OverviewIcon kind="won"/>Results &amp; impact</h2><strong>Not established</strong><p>This view does not load publishing, response, conversion or revenue evidence.</p><div aria-hidden="true"><span/><span/><span/></div></OpsSurface></div>

      <a href="/dashboard/growth" style={button}>
        ← Back
      </a>

      <section className="tracker-records" aria-label="Saved growth plans" style={{ marginTop: 24 }}>
        {!data?.length && <div className="tracker-empty"><OverviewIcon kind="research"/><h2>No saved plans available in this view</h2><p>Return to Today to generate and review a plan. No activity or outcome is inferred here.</p></div>}
        {data?.map((plan: any) => (
          <article key={plan.id} className="tracker-plan" style={card}><header className="tracker-plan-header"><div><h2><OverviewIcon kind="research"/>Saved growth plan</h2>
            <p style={date}>
              {new Date(plan.created_at).toLocaleString("en-GB")}
            </p>

            </div><div className="tracker-plan-actions"><Status used={plan.used} />

            {!plan.used && (
              <form action={markUsed.bind(null, plan.id)}>
                <button style={useBtn}>Mark as Used</button>
              </form>
            )}

            </div></header><div className="tracker-plan-content"><section className="tracker-post"><h2 style={cardTitle}><OverviewIcon kind="research"/>Post</h2>
            <p style={text}>{plan.linkedin_post || "Not established"}</p></section>

            <section className="tracker-message"><h2 style={cardTitle}><OverviewIcon kind="contact"/>DM</h2>
            <p style={text}>{plan.dm_message || "Not established"}</p></section>

            <section className="tracker-followup"><h2 style={cardTitle}><OverviewIcon kind="conversation"/>Follow Up</h2>
            <p style={text}>{plan.follow_up_message || "Not established"}</p></section></div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Status({ used }: { used: boolean }) {
  return (
    <p className="tracker-status" data-used={Boolean(used)} style={{ color: used ? "#087a50" : "#6033a5" }}>
      {used ? "Used ✅" : "Not used yet"}
    </p>
  );
}

const page = {
  padding: 0,
  color: "#12213e",
  background: "#f3f7ff",
  minHeight: "100%",
};

const title = { fontSize: 28, fontWeight: 700 };

const button = {
  display: "inline-block",
  marginTop: 16,
  padding: "10px 14px",
  borderRadius: 10,
  background: "#fff",
  color: "#12213e",
  textDecoration: "none",
};

const card = {
  background: "#ffffff",
  border: "1px solid #d4ddec",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const date = { color: "#53627b" };

const cardTitle = { marginTop: 12 };

const text = { whiteSpace: "pre-wrap" };

const useBtn = {
  marginTop: 10,
  padding: "6px 10px",
  borderRadius: 6,
  background: "#087a50",
  color: "#ffffff",
  cursor: "pointer",
};
