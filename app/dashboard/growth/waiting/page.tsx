import { OpsIntelligenceCard, OpsSurface } from "../../components/visual/OpsSurface";
import { OverviewIcon, RelationshipAvatar } from "../relationships/components/RelationshipOverviewVisuals";
import "./waiting.css";
import { growthFollowUpDueAt } from "@/lib/growthOutreach";
import { requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function nextDueDate(target: Parameters<typeof growthFollowUpDueAt>[0]) {
  const due = growthFollowUpDueAt(target); return due ? new Date(due).toLocaleString("en-GB") : "Confirmed first-send evidence required";
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
      <div className="growth-waiting" style={page}>
        <h1><OverviewIcon kind="clock"/>Waiting</h1>
        <p style={{ color: "#9b3545" }}>Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="growth-waiting" style={page}>
      <header className="waiting-header"><div><p className="waiting-eyebrow">Growth Operations Centre · Waiting</p><h1 style={title}><OverviewIcon kind="clock"/>Waiting / Recently Sent</h1>

      <p style={subtitle}>
        People you have already contacted who are not necessarily due again yet.
      </p>

      </div><span className="waiting-view-chip">Recorded activity · active targets</span></header>
      <section className="waiting-intelligence" aria-label="Waiting briefing"><OpsIntelligenceCard title="Where we are now" tone="blue"><p>{data?.length || 0} records with a last action</p><p>Active targets, ordered by their recorded last action.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What happened last" tone="violet"><p>{data?.[0]?.last_action_at ? new Date(data[0].last_action_at).toLocaleString("en-GB") : "Not established"}</p><p>Latest recorded action in this view · not an inferred send.</p></OpsIntelligenceCard><OpsIntelligenceCard title="What to do next" tone="green"><p>Review the next due date and reply status</p><p>Existing cadence evidence determines timing. No automatic action here.</p></OpsIntelligenceCard></section>
      <section className="waiting-metrics" aria-label="Recorded view counts">{[["person",data?.length || 0,"Active records with activity"],["contact",data?.filter(t=>t.linkedin_url).length || 0,"Recorded LinkedIn routes"],["opportunity",new Set(data?.map(t=>t.stage) || []).size,"Recorded stages"],["won","Not established","Commercial value"]].map(([icon,value,label])=><OpsSurface key={String(label)}><OverviewIcon kind={String(icon)}/><div><strong>{value}</strong><span>{label}</span></div></OpsSurface>)}</section>
      <div className="waiting-evidence"><OpsSurface><h2><OverviewIcon kind="opportunity"/>Recorded stage distribution</h2><div className="waiting-stage-bars">{Array.from(new Set<string>(data?.map(t=>String(t.stage || "Not established")) || [])).map(stageName=><div key={stageName}><span>{stageName.replaceAll("_"," ")}</span><i><b style={{width:`${(data?.filter(t=>String(t.stage || "Not established")===stageName).length || 0)/Math.max(data?.length || 0,1)*100}%`}}/></i><strong>{data?.filter(t=>String(t.stage || "Not established")===stageName).length || 0}</strong></div>)}{!data?.length&&<p>No recorded stages to chart.</p>}</div><small>Current returned records only · no historical trend inferred.</small></OpsSurface><OpsSurface className="waiting-guidance"><h2><OverviewIcon kind="task"/>Timing stays evidence-led</h2><p>A recorded last action does not establish an external send date. Where evidence is missing, the existing due-date control remains explicit.</p><span>Potential &amp; expected value<strong>Not established</strong></span></OpsSurface></div>
      <div className="waiting-shortcuts" style={{ marginTop: 16 }}>
        <a href="/dashboard/growth" style={button}>← Cockpit</a>{" "}
        <a href="/dashboard/growth/followups" style={button}>👥 Leads</a>{" "}
        <a href="/dashboard/growth/pipeline" style={button}>💼 Pipeline</a>
      </div>

      {!data || data.length === 0 ? (
        <section className="waiting-empty"><OverviewIcon kind="clock"/><h2>No recently contacted leads yet.</h2><p>Recorded activity will appear here when returned by the existing Waiting query.</p></section>
      ) : (
        <section className="waiting-records" aria-label="Recently active targets" style={{ marginTop: 22 }}>
          {data.map((target: any) => (
            <article key={target.id} className="waiting-record" style={card}>
              <div className="waiting-identity"><RelationshipAvatar name={target.target_name || "Unknown"} kind="person"/><div>
              <h2 style={{ marginBottom: 4 }}>{target.target_name}</h2>

              <p style={muted}>
                {target.role_title || "Role not added"} · {target.company || "Company not added"}
              </p>

              </div></div><div className="waiting-status"><p style={stage}>Current stage: {target.stage}</p><p style={muted}>Reply status: {target.reply_status || "no_reply"}</p></div>
              <div className="waiting-dates">

              <p style={green}>
                Last action: {new Date(target.last_action_at).toLocaleString("en-GB")}
              </p>

              <p style={next}>
                Next due: {nextDueDate(target)}
              </p>

              </div>

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
    </div>
  );
}

const page: React.CSSProperties = {
  padding: 0,
  color: "#12213e",
  background: "#f3f7ff",
  minHeight: "100%",
};

const title: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
};

const subtitle: React.CSSProperties = {
  color: "#53627b",
};

const button: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 10,
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  marginTop: 14,
  background: "#ffffff",
  border: "1px solid #d4ddec",
  borderRadius: 12,
  padding: 16,
};

const muted: React.CSSProperties = {
  color: "#53627b",
};

const stage: React.CSSProperties = {
  color: "#6033a5",
  fontWeight: 700,
};

const green: React.CSSProperties = {
  color: "#087a50",
  fontWeight: 700,
};

const next: React.CSSProperties = {
  color: "#164f98",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#164f98",
};
