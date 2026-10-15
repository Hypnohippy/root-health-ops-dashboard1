import { OpsIntelligenceCard, OpsSurface } from "../../components/visual/OpsSurface";
import { OverviewIcon, RelationshipAvatar } from "../relationships/components/RelationshipOverviewVisuals";
import "./targets.css";
import { readDueGrowthTargets } from "@/lib/growthDue.server";
import { outreachStages } from "@/lib/growthOutreach";
import { requireOrganisation } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function qualityLabel(value: string | null) {
  if (value === "valid") return "Valid lead ✅";
  if (value === "fake_or_invalid") return "Fake / invalid ❌";
  if (value === "company_profile") return "Company profile 🏢";
  if (value === "research_needed") return "Research needed 🔎";
  if (value === "not_relevant") return "Not relevant 🚫";
  return "Unreviewed";
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ organisationId?: string; stage?: string }> }) {
  const params = await searchParams;
  const { organisationId } = await requireOrganisation(params.organisationId, false);
  const requestedStage = (outreachStages as readonly string[]).includes(params.stage || "") ? params.stage : null;
  const targets = await readDueGrowthTargets(organisationId);
  const due = requestedStage ? targets.filter(target=>target.stage===requestedStage) : targets;

  async function addTarget(formData: FormData) {
    "use server";
    const verified = await requireOrganisation(organisationId);

    await supabaseAdmin.from("growth_targets").insert({
      organisation_id: verified.organisationId,
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

  async function updateLeadQuality(formData: FormData) {
    "use server";
    const verified = await requireOrganisation(organisationId);

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
      .eq("id", id).eq("organisation_id", verified.organisationId);

    revalidatePath("/dashboard/growth/followups");
  }

  return (
    <div className="growth-targets" style={page}>
      <header className="targets-header"><div><p className="targets-eyebrow">Growth Operations Centre · Targets</p>
      <h1 style={title}><OverviewIcon kind="person"/>Targets</h1>

      <p style={subtitle}>
        Add targets, review lead quality, and move valid prospects through the LinkedIn outreach sequence.
      </p>

      </div><span className="targets-view-chip">{requestedStage ? `Stage: ${requestedStage.replaceAll("_", " ")}` : "All currently due stages"}</span></header>
      <section className="targets-intelligence" aria-label="Targets briefing"><OpsIntelligenceCard title="Where we are now" tone="blue"><p>{due.length} targets in this due view</p><p>Existing eligibility and stage rules determine this queue.</p></OpsIntelligenceCard><OpsIntelligenceCard title="Review before outreach" tone="violet"><p>{due.filter(t => t.lead_quality === "valid").length} marked valid · {due.filter(t => !t.lead_quality || t.lead_quality === "unreviewed").length} unreviewed</p><p>Recorded quality only; no fit score inferred.</p></OpsIntelligenceCard><OpsIntelligenceCard title="Your next move" tone="green"><p>Review context, then use LinkedIn outreach</p><p>Messaging remains an explicit, separate manual action.</p></OpsIntelligenceCard></section>
      <section className="targets-metrics" aria-label="Current view metrics">{[["person",due.length,"Due in this view"],["research",due.filter(t=>t.linkedin_url).length,"Recorded LinkedIn routes"],["task",due.filter(t=>t.lead_quality === "research_needed").length,"Research needed"],["won","Not established","Commercial value"]].map(([icon,value,label])=><OpsSurface key={String(label)}><OverviewIcon kind={String(icon)}/><div><strong>{value}</strong><span>{label}</span></div></OpsSurface>)}</section>
      <div className="targets-evidence"><OpsSurface><h2><OverviewIcon kind="opportunity"/>Recorded stages · current view</h2><div className="targets-stage-bars">{Array.from(new Set<string>(due.map(t=>String(t.stage || "Not established")))).map(stageName=><div key={stageName}><span>{stageName.replaceAll("_"," ")}</span><i><b style={{width:`${due.filter(t=>t.stage===stageName).length/Math.max(due.length,1)*100}%`}}/></i><strong>{due.filter(t=>t.stage===stageName).length}</strong></div>)}{due.length===0&&<p>No due targets to chart.</p>}</div><small>Counts reflect this filtered due queue, not the full relationship history.</small></OpsSurface><OpsSurface className="targets-value"><h2><OverviewIcon kind="won"/>Potential &amp; expected value</h2><strong>Not established</strong><p>This queue does not load commercial assessments.</p><span className="targets-value-outline" aria-hidden="true">▥ ▥ ▥</span></OpsSurface></div>
      <div className="targets-shortcuts" style={{ marginTop: 16 }}>
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

      <div className="targets-workspace"><aside className="targets-add"><section style={card}>
        <h2><OverviewIcon kind="person"/>Add target</h2><p className="targets-form-hint">Record a person and their known professional context.</p>

        <form action={addTarget}>
          <input name="target_name" placeholder="Name" required style={input} />
          <input name="company" placeholder="Company" style={input} />
          <input name="role_title" placeholder="Role" style={input} />
          <input name="linkedin_url" placeholder="LinkedIn URL" style={input} />
          <textarea name="notes" placeholder="Notes" style={textarea} />

          <button style={greenButton}>Add Target</button>
        </form>
      </section>

      </aside><section className="targets-queue" style={{ marginTop: 24 }}>
        <h2>{requestedStage === "connection" ? "Outreach ready" : "Outreach Queue"}</h2>

        {due.length === 0 ? (
          <div className="targets-empty"><OverviewIcon kind="check"/><h3>No follow-ups due today</h3><p>The existing due-target rules returned no contacts for this view.</p></div>
        ) : (
          due.map((t: any) => (
            <article key={t.id} className="target-opportunity" style={card}>
              <div className="target-identity"><RelationshipAvatar name={t.target_name || "Unknown"} kind="person"/><div>
              <h3 style={{ marginBottom: 4 }}>{t.target_name}</h3>

              <p style={muted}>
                {t.role_title || "Role not added"} · {t.company || "Company not added"}
              </p>

              </div></div><div className="target-chips"><p style={stage}>Stage: {t.stage}</p>

              <p style={quality}>
                Lead quality: {qualityLabel(t.lead_quality)}
              </p></div><div className="target-context"><span>Owner<strong>Not established</strong></span><span>Last activity<strong>Not established in this view</strong></span><span>Next step<strong>Review recorded context</strong></span></div>

              {t.linkedin_url && (
                <p>
                  <a href={t.linkedin_url} target="_blank" style={link}>
                    Open LinkedIn profile
                  </a>
                </p>
              )}

              {t.notes && (
                <>
                  <details className="target-source-notes"><summary style={smallTitle}>Imported notes · source context</summary>
                  <p style={text}>{t.notes}</p></details>
                </>
              )}

              <div style={qualityBox}>
                <h4 style={{ marginTop: 0 }}><OverviewIcon kind="task"/>Lead quality review</h4>

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
                  <a href={`/dashboard/responses/linkedin?organisationId=${encodeURIComponent(organisationId)}&view=followups`} style={greenButton}>Review message and confirm actual send in LinkedIn outreach</a>
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
      </div>
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
  fontSize: 28,
  fontWeight: 700,
};

const subtitle: React.CSSProperties = {
  color: "#53627b",
  marginTop: 8,
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: 8,
  padding: "8px 12px",
  background: "#ffffff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  borderRadius: 8,
  textDecoration: "none",
  fontWeight: 700,
};

const card: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d4ddec",
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
  background: "#f3f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const textarea: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#f3f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
  minHeight: 80,
};

const select: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 10,
  padding: 10,
  borderRadius: 8,
  background: "#f3f7ff",
  color: "#12213e",
  border: "1px solid #d4ddec",
};

const greenButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  background: "#087a50",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const blueButton: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  background: "#165db5",
  color: "#ffffff",
  borderRadius: 8,
  border: "none",
  fontWeight: 800,
  cursor: "pointer",
};

const muted: React.CSSProperties = {
  color: "#53627b",
};

const stage: React.CSSProperties = {
  color: "#6033a5",
  fontWeight: 700,
};

const quality: React.CSSProperties = {
  color: "#087a50",
  fontWeight: 700,
};

const link: React.CSSProperties = {
  color: "#164f98",
};

const smallTitle: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 6,
};

const text: React.CSSProperties = {
  color: "#334965",
  whiteSpace: "pre-wrap",
  lineHeight: 1.6,
};

const qualityBox: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 12,
  background: "#f3f7ff",
  border: "1px solid #d4ddec",
};

const warningBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 8,
  background: "#fff7df",
  color: "#785519",
  border: "1px solid #92400e",
};

const badBox: React.CSSProperties = {
  marginTop: 14,
  padding: 12,
  borderRadius: 8,
  background: "#fff0f0",
  color: "#8e2733",
  border: "1px solid #991b1b",
};
