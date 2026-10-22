"use client";
import { useCallback, useEffect, useState } from "react";
import { diaryDay, diaryGroups, diaryLabel, diaryMonth, diaryShift, diaryWeek, type DiaryItem, type DiarySnapshot } from "@/lib/diary";
import "./diary.css";

function Items({ items }: { items: DiaryItem[] }) {
  return items.length ? <ul className="diary-items">{items.map(item => <li key={item.id}><a href={item.href}><span className="diary-kind">{item.type} · {item.workspace}</span><strong>{item.title}</strong>{item.company && <span>{item.company}</span>}<time dateTime={item.at}>{diaryLabel(item.at, !item.dateOnly)} · UK time</time><span>{item.action}</span><span className="diary-status">{item.status} → Open source</span></a></li>)}</ul> : <p className="diary-empty">No recorded dated work here.</p>;
}
export default function Diary({ organisationId, initial }: { organisationId: string; initial: DiarySnapshot }) {
  const [snapshot, setSnapshot] = useState(initial), [view, setView] = useState<"Today" | "Week" | "Month">("Today"), [day, setDay] = useState(initial.today), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false);
  const groups = diaryGroups(snapshot, view === "Today" ? snapshot.today : day);
  const refresh = useCallback(async () => {
    setLoading(true); setNotice("");
    try { const response = await fetch(`/api/diary?organisationId=${encodeURIComponent(organisationId)}`, { cache: "no-store" }); if (!response.ok) throw Error(); setSnapshot(await response.json()); }
    catch { setNotice("Diary could not refresh. The previous snapshot remains visible; reopen the source to check current state."); }
    finally { setLoading(false); }
  }, [organisationId]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  return <main className="diary-root"><header><p className="diary-eyebrow">YOUR DATED OPS WORK</p><h1>Diary</h1><p>One view of recorded commitments. Actions stay in their source workspace.</p><p className="diary-updated">Europe/London · Updated {diaryLabel(snapshot.asOf, true)}</p></header>
    <div className="diary-toolbar"><div role="group" aria-label="Diary view">{(["Today", "Week", "Month"] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); if (v === "Today") setDay(snapshot.today); }}>{v}</button>)}</div><button onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {notice && <p role="alert">{notice}</p>}
    {view !== "Today" && <div className="diary-dates"><button aria-label="Previous period" onClick={() => setDay(diaryShift(day, view === "Week" ? -7 : -new Date(day + "T12:00:00Z").getUTCDate()))}>←</button><label>Starting date <input type="date" value={day} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }} /></label><button aria-label="Next period" onClick={() => setDay(view === "Week" ? diaryShift(day, 7) : diaryShift(diaryMonth(day).at(-1)!, 1))}>→</button></div>}
    {view === "Today" && <div className="diary-today">{([ ["Overdue", groups.overdue], ["Today", groups.today], ["Upcoming", groups.upcoming] ] as const).map(([title, items]) => <section key={title}><h2>{title} <small>{items.length}</small></h2><Items items={items} /></section>)}</div>}
    {view === "Week" && <div className="diary-week">{diaryWeek(day).map(d => <section key={d}><h2>{diaryLabel(d)}</h2><Items items={snapshot.items.filter(i => diaryDay(i.at) === d)} /></section>)}</div>}
    {view === "Month" && <><h2>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(day + "T12:00:00Z"))}</h2><div className="diary-month" role="group" aria-label="Choose a diary date">{diaryMonth(day).map(d => { const count = snapshot.items.filter(i => diaryDay(i.at) === d).length; return <button key={d} aria-pressed={d === day} aria-label={`${diaryLabel(d)}: ${count} items`} onClick={() => setDay(d)}><strong>{Number(d.slice(-2))}</strong><span>{count || "·"}</span></button>; })}</div><section><h2>{diaryLabel(day)}</h2><Items items={snapshot.items.filter(i => diaryDay(i.at) === day)} /></section></>}
    <footer>Only structured dates are shown. Open a source to review or change it. Standalone diary entries and external calendar sync are not available.</footer>
  </main>;
}
