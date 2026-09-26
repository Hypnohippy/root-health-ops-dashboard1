"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import ControlOverview from "./ControlOverview";
import type { HomeControl } from "@/lib/homeControl";

type Counts={newOpportunities:number;linkedInConnections:number;outreachReady:number;repliesNeedingResponse:number;followupsDue:number;waiting:number;warmOpportunities:number;meetingsOrConversions:number;contentApprovals:number;connectionProblems:number};
type AttentionCard={key:keyof Counts;label:string;why:string;href:string;tone:string};
const cards:AttentionCard[]=[
 {key:"repliesNeedingResponse",label:"Replies need you",why:"People are waiting for a human response.",href:"/dashboard/responses?status=needs_reply",tone:"violet"},
 {key:"linkedInConnections",label:"New LinkedIn connections",why:"Review the proposed first message.",href:"/dashboard/responses?platform=linkedin&kind=connection_accepted&status=unread",tone:"sky"},
 {key:"followupsDue",label:"Follow-ups due today",why:"Continue outreach while the conversation is current.",href:"/dashboard/growth?view=due",tone:"amber"},
 {key:"newOpportunities",label:"New opportunities",why:"Qualify, accept or dismiss new discoveries.",href:"/dashboard/growth/acquisition?status=new",tone:"emerald"},
 {key:"outreachReady",label:"Outreach ready",why:"Approved contacts are ready for their first action.",href:"/dashboard/growth/followups?stage=connection",tone:"cyan"},
 {key:"contentApprovals",label:"Posts awaiting approval",why:"Approve, edit or reject prepared content.",href:"/dashboard/approvals?state=pending",tone:"pink"},
 {key:"waiting",label:"Contacts waiting",why:"See contacted people and their next due date.",href:"/dashboard/growth/waiting",tone:"slate"},
 {key:"warmOpportunities",label:"Active opportunities",why:"Keep warm replies and live opportunities moving.",href:"/dashboard/growth/pipeline?view=warm",tone:"emerald"},
 {key:"meetingsOrConversions",label:"Meetings and conversions",why:"Review commercial outcomes and next steps.",href:"/dashboard/growth/pipeline?view=meetings",tone:"emerald"},
 {key:"connectionProblems",label:"Connections need attention",why:"Reconnect channels before work is interrupted.",href:"/dashboard/connect?section=attention",tone:"red"},
];
const tones:Record<string,string>={violet:"border-violet-400/25 bg-violet-400/10",sky:"border-sky-400/25 bg-sky-400/10",amber:"border-amber-400/25 bg-amber-400/10",emerald:"border-emerald-400/25 bg-emerald-400/10",cyan:"border-cyan-400/25 bg-cyan-400/10",pink:"border-pink-400/25 bg-pink-400/10",slate:"border-white/10 bg-white/5",red:"border-red-400/25 bg-red-400/10"};
export default function CommandCentre() {
  const [data, setData] = useState<{ counts: Counts; control: HomeControl; organisationId: string } | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setError(""); setData(null);
      try {
        const requested = new URLSearchParams(window.location.search).get("organisationId");
        const workspace = await fetch(`/api/org/current${requested ? `?organisationId=${encodeURIComponent(requested)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const w = await workspace.json();
        if (!workspace.ok || !w.organisationId) throw Error("Workspace unavailable");
        const res = await fetch(`/api/home/attention?organisationId=${encodeURIComponent(w.organisationId)}`, { cache: "no-store", signal: controller.signal });
        const result = await res.json();
        if (!res.ok || !result.control) throw Error("Operational data unavailable");
        if (!controller.signal.aborted) setData(result);
      } catch { if (!controller.signal.aborted) setError("Operational state could not be loaded. Counts are unavailable; refresh to try again."); }
    })();
    return () => controller.abort();
  }, [refresh]);
  const scoped = (href: string) => `${href}${href.includes("?") ? "&" : "?"}organisationId=${encodeURIComponent(data?.organisationId || "")}`;
  return <main className="mx-auto max-w-6xl space-y-7 text-white">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Today · Root Health Ops</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Your work, under control.</h1><p className="mt-2 max-w-3xl text-slate-300">What’s been handled, what’s in hand, and where a person makes the difference.</p></div><button onClick={() => setRefresh(n => n + 1)} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">Refresh state</button></header>
    {error && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-red-100">{error}</p>}
    {!data && !error && <p role="status" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-slate-300">Checking recorded activity and next steps…</p>}
    {data && <>
      <ControlOverview control={data.control} />
      <details className="rounded-3xl border border-white/10 bg-white/[0.02] p-5"><summary className="cursor-pointer font-semibold">Workspace views · existing cards and drill-downs</summary><p className="mb-4 mt-2 text-xs text-slate-400">Source-specific counts remain separate. Open a workspace for its full workflow.</p>
        <section aria-label="Needs attention" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(card => <Link key={card.key} href={scoped(card.href)} className={`group rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${tones[card.tone]}`}><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{card.label}</h2><p className="mt-1 text-sm text-slate-300">{card.why}</p></div><span className="min-w-10 rounded-full bg-black/25 px-3 py-1 text-center text-lg font-semibold">{data.counts[card.key]}</span></div><p className="mt-4 text-sm font-semibold text-emerald-200 group-hover:text-emerald-100">View items →</p></Link>)}</section>
      </details>
      <section className="flex flex-wrap gap-3 border-t border-white/10 pt-5"><Link className="rounded-xl bg-emerald-400 px-4 py-2 font-semibold text-slate-950" href={scoped("/dashboard/publishing")}>Create and publish</Link><Link className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-semibold" href={scoped("/dashboard/growth/acquisition")}>Open Acquisition</Link><Link className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-semibold" href={scoped("/dashboard/responses")}>Open Responses</Link></section>
      <p className="text-xs text-slate-500">Only persisted evidence is included. Reconciliation totals and live provider/credit availability are not recorded here; no monitoring or successful execution is assumed.</p>
    </>}
  </main>;
}
