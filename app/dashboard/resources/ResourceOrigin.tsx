"use client";
import React, { useEffect, useState } from "react";
import { requestFact, type SolutionBrief } from "@/lib/solutionBrief";

export default function ResourceOrigin({ resource, organisationId }: { resource: { id: string; source_solution_brief_id?: string | null }; organisationId: string }) {
  const [brief, setBrief] = useState<SolutionBrief | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!resource.source_solution_brief_id) return;
    fetch(`/api/solution-briefs?id=${encodeURIComponent(resource.source_solution_brief_id)}&organisationId=${encodeURIComponent(organisationId)}`, { cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.brief) throw Error("Unable to load source brief.");
      if (active) { setBrief(data.brief); setError(""); }
    }).catch(() => { if (active) setError("Source brief unavailable. Reload to retry."); });
    return () => { active = false; };
  }, [resource.source_solution_brief_id, organisationId]);
  if (!resource.source_solution_brief_id) return null;
  const query = `organisationId=${encodeURIComponent(organisationId)}`;
  return <aside className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"><strong>Created from an approved Solution Brief</strong><p>Workspace organisation: {organisationId}</p><p>Client: {brief ? requestFact(brief.source_snapshot, "client_organisation") || "Not recorded in the request" : "Loading source…"}</p><a className="underline" href={`/dashboard/solution-briefs?id=${resource.source_solution_brief_id}&${query}`}>Open approved brief ↗</a>{brief && <p><a className="underline" href={`/dashboard/proposal-requests?${query}#request-${brief.source_request_id}`}>Open originating request ↗</a></p>}{error && <p role="alert">{error}</p>}</aside>;
}
