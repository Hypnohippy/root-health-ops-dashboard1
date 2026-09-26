"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { controlGroups, type ControlGroup, type ControlItem, type HomeControl } from "@/lib/homeControl";

const labels: Record<ControlGroup, { title: string; note: string; tone: string }> = {
  done: { title: "Done / recently handled", note: "Confirmed activity in the last 7 days", tone: "border-emerald-400/25 bg-emerald-400/10" },
  in_hand: { title: "In hand / scheduled", note: "Waiting, parked or a recorded next step", tone: "border-sky-400/25 bg-sky-400/10" },
  human: { title: "Needs human", note: "Judgement, approval or relationship work", tone: "border-violet-400/25 bg-violet-400/10" },
  blocked: { title: "Blocked / fallback", note: "A failed step or connection needs help", tone: "border-amber-400/25 bg-amber-400/10" },
};
const when = (value: string | null) => value ? new Date(value).toLocaleString() : "Not recorded";

export function ControlRecord({ item, expanded = false }: { item: ControlItem; expanded?: boolean }) {
  return <details open={expanded || undefined} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
    <summary className="cursor-pointer list-none space-y-2 focus:outline-none focus:ring-2 focus:ring-emerald-400">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-white">{item.name}</span><span className="text-xs text-slate-400">{item.channel} · {item.operationalState.replaceAll("_", " ")}</span></div>
      <p className="text-sm text-slate-200">{item.group === "done" ? item.handled : item.nextAction}</p>
      <p className="text-xs text-slate-400">{item.owner}{item.nextDueDate ? ` · Due ${when(item.nextDueDate)}` : ""} · View evidence and next step ↓</p>
    </summary>
    <div className="mt-4 space-y-4 border-t border-white/10 pt-4 text-sm text-slate-300">
      {item.humanReason && <p className={item.humanReason === "automation_failed" ? "text-amber-200" : "text-violet-200"}>{item.humanReason === "automation_failed" ? "Human needed because automation or delivery is blocked" : "Human needed by design"}</p>}
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-xs text-slate-500">Lifecycle stage</dt><dd>{item.stage.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-xs text-slate-500">What happened / what Ops recorded</dt><dd>{item.handled}</dd></div>
        <div><dt className="text-xs text-slate-500">Why</dt><dd>{item.why}</dd></div>
        <div><dt className="text-xs text-slate-500">Last action</dt><dd>{item.lastAction} · {when(item.lastActionAt)}</dd></div>
        <div><dt className="text-xs text-slate-500">Next action</dt><dd>{item.nextAction}{item.nextDueDate ? ` · ${when(item.nextDueDate)}` : " · No due date recorded"}</dd></div>
        <div><dt className="text-xs text-slate-500">Owner</dt><dd>{item.owner}</dd></div>
        <div><dt className="text-xs text-slate-500">Source</dt><dd>{item.source} · {item.channel}</dd></div>
      </dl>
      {item.fallback && <section aria-label="Manual fallback" className="space-y-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
        <h3 className="font-semibold text-amber-100">Manual fallback</h3><p><b>Intended:</b> {item.fallback.intended}</p><p><b>Already completed:</b> {item.fallback.completed}</p><p><b>Remaining:</b> {item.fallback.remaining}</p>
      </section>}
      {item.prepared && <details className="rounded-xl border border-white/10 p-3"><summary className="cursor-pointer">Prepared message / action preview</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm">{item.prepared}</pre><p className="mt-2 text-xs text-slate-500">Preview only. Review the current full draft and approval in the source workflow.</p></details>}
      <details><summary className="cursor-pointer text-slate-300">History / source evidence ({item.evidence.length})</summary><ul className="mt-2 space-y-2 break-words text-xs text-slate-400">{item.evidence.map((e, i) => <li key={i}><b>{e.label}</b><br />{e.value}</li>)}</ul></details>
      <Link href={item.workflowHref} className="inline-flex rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 font-semibold text-emerald-200">{item.fallback?.option || "Open existing workflow"} →</Link>
    </div>
  </details>;
}

export default function ControlOverview({ control }: { control: HomeControl }) {
  const [group, setGroup] = useState<ControlGroup | null>(null), [selected, setSelected] = useState<string | null>(null), [page, setPage] = useState(0);
  useEffect(() => {
    const read = () => { const params = new URLSearchParams(window.location.search), next = params.get("group"); setGroup(controlGroups.includes(next as ControlGroup) ? next as ControlGroup : null); setSelected(params.get("item")); setPage(0); };
    read(); window.addEventListener("popstate", read); return () => window.removeEventListener("popstate", read);
  }, []);
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, href: string, next: ControlGroup, item?: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); window.history.pushState(null, "", href); setGroup(next); setSelected(item || null); setPage(0);
  };
  const filtered = control.items.filter(item => item.group === (group || "human"));
  const chosen = selected ? filtered.find(item => item.id === selected) : null;
  const visible = selected ? chosen ? [chosen] : [] : group ? filtered.slice(page * 8, page * 8 + 8) : filtered.slice(0, 3);
  return <>
    <section aria-label="Operational control" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{control.groups.map(summary => <a key={summary.key} href={summary.href} onClick={event => navigate(event, summary.href, summary.key)} aria-current={group === summary.key ? "true" : undefined} className={`rounded-2xl border p-5 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${labels[summary.key].tone}`}>
      <h2 className="text-sm font-semibold text-white">{labels[summary.key].title}</h2><p className="mt-2 text-4xl font-semibold">{summary.count}</p><p className="mt-2 text-xs text-slate-300">{labels[summary.key].note}</p><p className="mt-4 text-xs font-semibold text-emerald-200">View actual records →</p>
    </a>)}</section>
    <p className="text-xs text-slate-400">Updated {when(control.generatedAt)}. Current work is grouped once per contact. Recent activity can overlap current work; these numbers are not added together. Schedules show recorded intent, not guaranteed execution.</p>
    <section aria-label="Operational records" className="space-y-3 rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-400/5 to-sky-400/5 p-5">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{group ? labels[group].title : "Your next decisions"}</h2>{chosen && <a className="text-sm text-emerald-200" href={control.groups.find(g => g.key === group)!.href} onClick={event => navigate(event, control.groups.find(g => g.key === group)!.href, group!)}>All records</a>}</div>
      {!visible.length && <p className="text-sm text-slate-300">{selected ? "This record is no longer in this group. Open a summary above to see the current records." : group === "blocked" ? "No blocked steps recorded in the available data." : group === "done" ? "No confirmed activity recorded in the last seven days." : group === "in_hand" ? "No waiting or scheduled work recorded." : "No human decisions are currently identified in the available records."}</p>}
      {visible.map(item => <div key={item.id}><ControlRecord item={item} expanded={!!chosen} /><a className="mt-1 inline-block text-xs text-slate-500 hover:text-emerald-200" href={item.href} onClick={event => navigate(event, item.href, item.group, item.id)}>Link to this record</a></div>)}
      {!group && filtered.length > 3 && <a href={control.groups.find(g => g.key === "human")!.href} onClick={event => navigate(event, control.groups.find(g => g.key === "human")!.href, "human")} className="inline-block text-sm font-semibold text-emerald-200">View all {filtered.length} human decisions →</a>}
      {group && !chosen && filtered.length > 8 && <div className="flex items-center gap-3 text-sm"><button disabled={!page} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-40">Previous</button><span>{page * 8 + 1}–{Math.min((page + 1) * 8, filtered.length)} of {filtered.length}</span><button disabled={(page + 1) * 8 >= filtered.length} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-white/15 px-3 py-2 disabled:opacity-40">Next</button></div>}
    </section>
  </>;
}
