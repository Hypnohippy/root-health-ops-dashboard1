"use client";

import React, { useEffect, useState } from "react";
import { tenantFetch } from "@/lib/tenantFetch";
import { factFields, missingBriefInformation, requestFact, type BriefRecommendation, type SolutionBrief } from "@/lib/solutionBrief";
import "./solution-briefs.css";

const fields: [keyof BriefRecommendation, string][] = [
  ["understoodNeed", "Understood need"], ["intervention", "Recommended intervention"],
  ["audience", "Audience for this presentation"], ["outcomes", "Intended outcomes"],
  ["format", "Suggested delivery format"], ["sessions", "Number of sessions"],
  ["duration", "Duration"], ["constraints", "Delivery constraints"],
  ["resources", "Supporting resources / recommendation"], ["measurement", "Measurement approach"],
];
export default function SolutionBriefPage() {
  const [brief, setBrief] = useState<SolutionBrief | null>(null);
  const [recommendation, setRecommendation] = useState<BriefRecommendation | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  async function load() {
    setError(""); setLoading(true);
    try {
      const query = new URLSearchParams(window.location.search);
      if (!query.get("id") && !query.get("requestId")) throw Error("Open a request to prepare its Solution Brief.");
      const response = await tenantFetch(`/api/solution-briefs?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to load brief.");
      setBrief(data.brief); setRecommendation(data.brief?.recommendation || null); setDirty(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load brief."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function act(action: "create" | "save" | "approve" | "generate") {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const query = new URLSearchParams(window.location.search);
      const response = await tenantFetch("/api/solution-briefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: brief?.id, requestId: query.get("requestId"), organisationId: brief?.organisation_id || query.get("organisationId") || undefined, version: brief?.version, recommendation }) });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Unable to complete this step.");
      if (data.resourceId) {
        await load();
        setNotice("Presentation saved. Open it in Resources to review and edit.");
      } else { setBrief(data.brief); setRecommendation(data.brief.recommendation); setDirty(false); setNotice(action === "approve" ? "Brief approved. No quote or client message has been sent." : "Reviewed draft saved."); }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to complete this step."); }
    finally { setBusy(false); }
  }
  const orgQuery = brief ? `organisationId=${encodeURIComponent(brief.organisation_id)}` : "";
  const resourceHref = `/dashboard/resources?${orgQuery}&resourceId=${brief?.presentation_resource_id || ""}`;
  return <main className="solution-workspace">
    <header className="solution-header"><div><p className="solution-eyebrow">RESOURCES / SOLUTION BRIEF</p><h1>From request to a clear plan.</h1><p>Review the need, shape the recommendation, then create one linked presentation.</p></div><a href={`/dashboard/proposal-requests${orgQuery ? `?${orgQuery}` : ""}`}>All training requests ↗</a></header>
    {error && <div role="alert" className="solution-error">{error} <button onClick={() => void load()} disabled={busy}>Reload brief</button></div>}
    {notice && <div role="status" className="solution-notice">{notice}</div>}
    {loading ? <p role="status">Loading Solution Brief…</p> : !brief ? <section className="solution-panel"><h2>Prepare a reviewed draft</h2><p>Root will separate submitted facts from proposed interpretation. The original request stays unchanged.</p><button className="solution-primary" disabled={busy} onClick={() => void act("create")}>{busy ? "Preparing…" : "Prepare Solution Brief"}</button></section> : <>
      <div className="solution-progress"><span className="solution-chip">{dirty ? "Unsaved review" : brief.status === "approved" ? "Approved brief" : "Draft · review needed"}</span><span>Version {brief.version}</span><span>Internal workspace</span><span>No client send</span></div>
      <div className="solution-grid">
        <section className="solution-panel solution-facts"><p className="solution-eyebrow">01 / RECORDED REQUEST</p><h2>What they asked for</h2><p className="solution-caption">Submitted evidence. Editing your recommendation does not change these facts.</p>{!brief.source_snapshot.submission_payload && <p className="solution-caption">Legacy request: the original raw submission was not retained. Recorded fields may include intake defaults; verify them during review.</p>}<dl>{factFields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{requestFact(brief.source_snapshot, key) || "Not provided"}</dd></div>)}</dl><a href={`/dashboard/proposal-requests?${orgQuery}#request-${brief.source_request_id}`}>Open originating request ↗</a><details><summary>Source and ownership</summary><p>Workspace organisation: {brief.organisation_id}</p><p>Request: {brief.source_request_id}</p><p>Brief: {brief.id}</p><pre>{JSON.stringify(brief.source_snapshot, null, 2)}</pre></details></section>
        <section className="solution-panel solution-review"><p className="solution-eyebrow">02 / REVIEWED INTERPRETATION</p><h2>What Root recommends</h2><p className="solution-caption">Proposed defaults, not additional client facts. Edit before approving. Unrecorded details remain missing in the source evidence.</p><div className="solution-fields">{fields.map(([key, label]) => <label key={key} className={key === "sessions" || key === "duration" ? "solution-short" : ""}><span>{label}</span>{key === "sessions" ? <input type="number" min="1" max="24" value={recommendation?.sessions || 1} disabled={busy || !!brief.presentation_resource_id} onChange={e => { setRecommendation(r => r ? { ...r, sessions: Number(e.target.value) } : r); setDirty(true); }} /> : <textarea rows={["understoodNeed", "outcomes", "measurement"].includes(key) ? 3 : 2} value={String(recommendation?.[key] ?? "")} disabled={busy || !!brief.presentation_resource_id} onChange={e => { setRecommendation(r => r ? { ...r, [key]: e.target.value } : r); setDirty(true); }} />}</label>)}</div></section>
        <section className="solution-panel"><p className="solution-eyebrow">03 / CLARIFY</p><h2>What is missing</h2><p className="solution-caption">These details were missing or left uncertain in the submitted request. Recommendations do not fill them as facts.</p><ul className="solution-missing">{missingBriefInformation(brief.source_snapshot).map(label => <li key={label}>{label}</li>)}</ul><p>Confirm the audience, outcomes, format and duration in the recommendation before approval.</p></section>
        <section className="solution-panel"><p className="solution-eyebrow">04 / SELECTED OUTPUT</p><h2>What will be created</h2><div className="solution-output"><span aria-hidden="true">▤</span><div><strong>One editable presentation</strong><p>Hero, section divider, framework, evidence plan, exercise, reflection and summary.</p></div></div><p>Audience slides and private presenter guidance stay in one source resource. Supporting materials remain recommendations for later work.</p>{brief.presentation_resource_id && <a className="solution-open" href={resourceHref}>Open created presentation ↗</a>}</section>
        <section className="solution-panel solution-commercial"><p className="solution-eyebrow">05 / HUMAN REVIEW</p><h2>Commercial recommendation</h2><p>No approved pricing rules are configured for this workflow. Budget clues are evidence, not an approved quote.</p><label><span>Internal pricing / quote guidance</span><textarea rows={3} value={recommendation?.commercial || ""} disabled={busy || !!brief.presentation_resource_id} onChange={e => { setRecommendation(r => r ? { ...r, commercial: e.target.value } : r); setDirty(true); }} /></label><small>Human-reviewed and unsent. Brief approval does not approve a price or create a client quote.</small></section>
      </div>
      <footer className="solution-actions"><div><strong>{brief.presentation_resource_id ? "Presentation linked" : dirty ? "Review changes before creating" : brief.status === "approved" ? "Ready to create" : "Your review comes first"}</strong><small>{busy ? "Working… Please keep this page open." : "Saved source evidence · manual approval · no client send"}</small></div><div>{brief.presentation_resource_id ? <a className="solution-primary" href={resourceHref}>Open in Resources ↗</a> : <><button disabled={busy} onClick={() => void act("save")}>Save reviewed draft</button><button disabled={busy || (!dirty && brief.status === "approved")} onClick={() => void act("approve")}>Approve brief</button><button className="solution-primary" disabled={busy || dirty || brief.status !== "approved"} onClick={() => void act("generate")}>{busy ? "Working…" : "Create presentation · uses AI allowance"}</button></>}</div></footer>
    </>}
  </main>;
}
