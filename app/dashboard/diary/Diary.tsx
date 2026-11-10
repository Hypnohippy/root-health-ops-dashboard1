"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { diaryDay, diaryGroups, diaryLabel, diaryMonth, diaryShift, diaryWeek, type DiaryAppointment, type DiaryItem, type DiarySnapshot } from "@/lib/diary";
import { appointmentDateKey } from "@/lib/diaryAppointments";
import AppointmentForm from "./AppointmentForm";
import "./diary.css";

type Snapshot = DiarySnapshot & { appointments?: DiaryAppointment[] };
type Prefill = { id?: string; person?: string; company?: string | null };
type AgendaEntry = { kind: "ops"; item: DiaryItem } | { kind: "appointment"; appointment: DiaryAppointment };
const active = (appointment: DiaryAppointment) => appointment.status !== "cancelled";
function appointmentTime(appointment: DiaryAppointment) {
  if (appointment.allDay) return appointment.startDate === appointment.endDate ? "All day" : `All day · ${appointment.startDate}`;
  if (!appointment.startsAt || !appointment.endsAt) return "Time not recorded";
  const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: appointment.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return `${fmt(appointment.startsAt)}–${fmt(appointment.endsAt)} · ${appointment.timezone}`;
}
function appointmentSortTime(appointment: DiaryAppointment) { return appointment.allDay ? `${appointment.startDate || ""}T00:00:00Z` : appointment.startsAt || "9999"; }
function Agenda({ entries, onEdit, onCancel, emptyLabel }: { entries: AgendaEntry[]; onEdit: (appointment: DiaryAppointment) => void; onCancel: (appointment: DiaryAppointment) => void; emptyLabel: string }) {
  if (!entries.length) return <p className="diary-empty">{emptyLabel}</p>;
  return <ul className="diary-items">{entries.map(entry => entry.kind === "ops" ? <li key={`ops:${entry.item.id}`} className="diary-operational-item"><a href={entry.item.href}>
    <span className="diary-kind">{entry.item.type} · {entry.item.workspace}</span><strong>{entry.item.title}</strong>{entry.item.company && <span>{entry.item.company}</span>}
    <time dateTime={entry.item.at || undefined}>{diaryLabel(entry.item.at, !entry.item.dateOnly)} · UK time</time><span>{entry.item.action}</span>
    <span className="diary-status">{entry.item.status} · Actionable: {entry.item.actionable ? "Yes" : "No"}{entry.item.suppressionReason ? ` · ${entry.item.suppressionReason}` : ""} → Open record</span>{entry.item.navigationReason && <small>{entry.item.navigationReason}</small>}
  </a></li> : <li key={`appointment:${entry.appointment.id}`} className={`diary-appointment diary-appointment-${entry.appointment.status}`}>
    <article><span className="diary-kind">Appointment · {entry.appointment.source === "relationship" ? "Relationship" : "Ops"}</span>
      <time className="diary-appointment-time" dateTime={entry.appointment.startsAt || entry.appointment.startDate || undefined}>{appointmentTime(entry.appointment)}</time>
      <strong className="diary-appointment-title">{entry.appointment.title}</strong>{entry.appointment.relationship && <span>{entry.appointment.relationship.person}{entry.appointment.relationship.company ? ` · ${entry.appointment.relationship.company}` : ""}</span>}
      {entry.appointment.location && <span>{entry.appointment.location}</span>}{entry.appointment.meetingUrl && <a href={entry.appointment.meetingUrl} target="_blank" rel="noreferrer">Open meeting link</a>}
      {entry.appointment.relationship && <a href={entry.appointment.relationship.href}>Open relationship</a>}
      <span className="diary-status">{entry.appointment.status[0].toUpperCase() + entry.appointment.status.slice(1)} · Revision {entry.appointment.revision}</span>
      {entry.appointment.status !== "completed" && entry.appointment.status !== "cancelled" && <div className="diary-appointment-actions"><button type="button" onClick={() => onEdit(entry.appointment)}>Edit / reschedule</button><button type="button" onClick={() => onCancel(entry.appointment)}>Cancel appointment</button></div>}
    </article>
  </li>)}</ul>;
}
type LaneGroup = { heading: string; entries: AgendaEntry[] };
function AppointmentWorkLanes({ appointmentGroups, workGroups, onEdit, onCancel, className }: {
  appointmentGroups: LaneGroup[]; workGroups: LaneGroup[];
  onEdit: (appointment: DiaryAppointment) => void; onCancel: (appointment: DiaryAppointment) => void;
  className?: string;
}) {
  const appointmentCount = appointmentGroups.reduce((count, group) => count + group.entries.length, 0);
  const workCount = workGroups.reduce((count, group) => count + group.entries.length, 0);
  return <div className={className || "diary-lanes"}>
    <section className="diary-lane diary-lane-appointments" aria-labelledby="diary-appointments-heading">
      <p className="diary-lane-kicker">Primary</p><h2 id="diary-appointments-heading">Appointments <small>{appointmentCount}</small></h2>
      {appointmentGroups.map((group, index) => <div className="diary-lane-group" key={`appointments:${index}`}>
        {group.heading && <h3>{group.heading} <small>{group.entries.length}</small></h3>}
        <Agenda entries={group.entries} onEdit={onEdit} onCancel={onCancel} emptyLabel="No appointments scheduled." />
      </div>)}
    </section>
    <section className="diary-lane diary-lane-operational-work" aria-labelledby="diary-operational-heading">
      <p className="diary-lane-kicker">Secondary</p><h2 id="diary-operational-heading">Operational work <small>{workCount}</small></h2>
      {workGroups.map((group, index) => <div className="diary-lane-group" key={`work:${index}`}>
        {group.heading && <h3>{group.heading} <small>{group.entries.length}</small></h3>}
        <Agenda entries={group.entries} onEdit={onEdit} onCancel={onCancel} emptyLabel="No operational work." />
      </div>)}
    </section>
  </div>;
}

export default function Diary({ organisationId, initial, openCreate = false, prefill = {} }: { organisationId: string; initial: Snapshot; openCreate?: boolean; prefill?: Prefill }) {
  const [snapshot, setSnapshot] = useState(initial), [view, setView] = useState<"Today" | "Week" | "Month">("Today"), [day, setDay] = useState(initial.today), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(openCreate), [editing, setEditing] = useState<DiaryAppointment | null>(null);
  const appointments = useMemo(() => snapshot.appointments || [], [snapshot.appointments]), groups = diaryGroups(snapshot, view === "Today" ? snapshot.today : day);
  const refresh = useCallback(async () => {
    setLoading(true); setNotice("");
    try { const response = await fetch(`/api/diary?organisationId=${encodeURIComponent(organisationId)}`, { cache: "no-store" }); if (!response.ok) throw Error(); setSnapshot(await response.json()); }
    catch { setNotice("Diary could not refresh. The previous snapshot remains visible; reopen the source to check current state."); }
    finally { setLoading(false); }
  }, [organisationId]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const appointmentsForDate = (date: string): AgendaEntry[] => appointments
    .filter(appointment => active(appointment) && appointmentDateKey({ all_day: appointment.allDay, starts_at: appointment.startsAt, start_date: appointment.startDate, timezone: appointment.timezone }) === date)
    .sort((a, b) => appointmentSortTime(a).localeCompare(appointmentSortTime(b)))
    .map(appointment => ({ kind: "appointment", appointment }));
  const workForDate = (date: string): AgendaEntry[] => snapshot.items
    .filter(item => diaryDay(item.at) === date).sort((a, b) => (a.at || "9999").localeCompare(b.at || "9999"))
    .map(item => ({ kind: "ops", item }));
  const monthDays = useMemo(() => diaryMonth(day), [day]);

  async function save(values: Record<string, unknown>) {
    const url = editing ? `/api/diary/appointments/${encodeURIComponent(editing.id)}?organisationId=${encodeURIComponent(organisationId)}` : `/api/diary/appointments?organisationId=${encodeURIComponent(organisationId)}`;
    const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, ...(editing ? { revision: editing.revision } : {}) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Appointment could not be saved.");
    setFormOpen(false); setEditing(null); setNotice(editing ? "Appointment updated." : "Appointment created."); await refresh();
  }
  async function cancel(appointment: DiaryAppointment) {
    if (!window.confirm(`Cancel “${appointment.title}”? The appointment will remain in history.`)) return;
    const response = await fetch(`/api/diary/appointments/${encodeURIComponent(appointment.id)}?organisationId=${encodeURIComponent(organisationId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", revision: appointment.revision }) });
    const result = await response.json(); if (!response.ok) { setNotice(result.error || "Appointment could not be cancelled."); return; }
    setNotice("Appointment cancelled and retained in history."); await refresh();
  }
  function edit(appointment: DiaryAppointment) { setEditing(appointment); setFormOpen(true); }
  function closeForm() { setFormOpen(false); setEditing(null); }
  const appointmentList = (items: DiaryAppointment[]): AgendaEntry[] => [...items]
    .sort((a, b) => appointmentSortTime(a).localeCompare(appointmentSortTime(b)))
    .map(appointment => ({ kind: "appointment", appointment }));
  const workList = (items: DiaryItem[]): AgendaEntry[] => [...items]
    .sort((a, b) => (a.at || "9999").localeCompare(b.at || "9999"))
    .map(item => ({ kind: "ops", item }));
  const todayReviewAppointments = appointments.filter(a => (a.status === "tentative" || a.status === "confirmed") && appointmentDateKey({ all_day: a.allDay, starts_at: a.startsAt, start_date: a.startDate, timezone: a.timezone }) < snapshot.today);
  const todayAppointments = appointmentsForDate(snapshot.today);
  const upcomingAppointments = appointmentList(appointments.filter(a => (a.status === "tentative" || a.status === "confirmed") && appointmentDateKey({ all_day: a.allDay, starts_at: a.startsAt, start_date: a.startDate, timezone: a.timezone }) > snapshot.today).slice(0, 12));
  const weekDates = view === "Week" ? diaryWeek(day) : [];
  const selectedDate = appointmentsForDate(day);
  return <main className="diary-root"><header><p className="diary-eyebrow">YOUR DATED OPS WORK</p><h1>Diary</h1><p>Appointments alongside canonical meetings, follow-ups, tasks, waiting and manual history. Each keeps its own source.</p><p className="diary-updated">Europe/London · Updated {diaryLabel(snapshot.asOf, true)}</p></header>
    <div className="diary-toolbar"><div role="group" aria-label="Diary view">{(["Today", "Week", "Month"] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); if (v === "Today") setDay(snapshot.today); }}>{v}</button>)}</div><div className="diary-primary-actions"><button onClick={() => { setEditing(null); setFormOpen(true); }} type="button">+ Add appointment</button><button onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div></div>
    {notice && <p role="status" className="diary-notice">{notice}</p>}
    {snapshot.summary && <p className="diary-empty">{snapshot.summary.actionableFollowups} actionable follow-ups · {snapshot.summary.futureFollowups} future follow-ups · {snapshot.summary.repliesNeedingResponse} replies need attention · {snapshot.summary.suppressedFollowups} suppressed follow-ups</p>}
    {formOpen && <div className="diary-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={editing ? "Edit appointment" : "Add appointment"}><AppointmentForm organisationId={organisationId} appointment={editing} date={editing ? appointmentDateKey({ all_day: editing.allDay, starts_at: editing.startsAt, start_date: editing.startDate, timezone: editing.timezone }) || day : day} prefill={editing?.relationship ? { id: editing.relationship.id, person: editing.relationship.person, company: editing.relationship.company } : prefill} onCancel={closeForm} onSave={save}/></section></div>}
    {view !== "Today" && <div className="diary-dates"><button aria-label="Previous period" onClick={() => setDay(diaryShift(day, view === "Week" ? -7 : -new Date(day + "T12:00:00Z").getUTCDate()))}>←</button><label>Period containing date <input type="date" value={day} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }} /></label><button aria-label="Next period" onClick={() => setDay(view === "Week" ? diaryShift(day, 7) : diaryShift(monthDays.at(-1)!, 1))}>→</button></div>}
    {view === "Today" && <AppointmentWorkLanes
      className="diary-lanes diary-today"
      appointmentGroups={[
        ...(todayReviewAppointments.length ? [{ heading: "Past appointments to review", entries: appointmentList(todayReviewAppointments) }] : []),
        { heading: "Today", entries: todayAppointments },
        { heading: "Upcoming", entries: upcomingAppointments },
      ]}
      workGroups={[
        { heading: "Overdue", entries: workList(groups.overdue) },
        { heading: "Today", entries: workList(snapshot.items.filter(item => diaryDay(item.at) === snapshot.today)) },
        { heading: "Upcoming", entries: workList(groups.upcoming) },
      ]}
      onEdit={edit} onCancel={cancel}/ >}
    {view === "Week" && <AppointmentWorkLanes
      appointmentGroups={weekDates.map(date => ({ heading: diaryLabel(date), entries: appointmentsForDate(date) }))}
      workGroups={weekDates.map(date => ({ heading: diaryLabel(date), entries: workForDate(date) }))}
      onEdit={edit} onCancel={cancel}/ >}
    {view === "Month" && <><h2>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(day + "T12:00:00Z"))}</h2><div className="diary-month" role="group" aria-label="Choose a diary date">{monthDays.map(date => { const appointmentCount = appointments.filter(a => a.status !== "cancelled" && appointmentDateKey({ all_day: a.allDay, starts_at: a.startsAt, start_date: a.startDate, timezone: a.timezone }) === date).length; const workCount = snapshot.items.filter(item => diaryDay(item.at) === date).length; return <button key={date} aria-pressed={date === day} aria-label={`${diaryLabel(date)}: ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"}, ${workCount} operational item${workCount === 1 ? "" : "s"}`} onClick={() => setDay(date)}><strong>{Number(date.slice(-2))}</strong><span className="diary-month-counts"><span><b>{appointmentCount}</b> apt</span><span><b>{workCount}</b> work</span></span></button>; })}</div><h2 className="diary-selected-date">{diaryLabel(day)}</h2><AppointmentWorkLanes appointmentGroups={[{ heading: "Appointments", entries: selectedDate }]} workGroups={[{ heading: "Operational work", entries: workForDate(day) }]} onEdit={edit} onCancel={cancel}/></>}
    {appointments.some(a => a.status === "cancelled") && <details className="diary-cancelled"><summary>Cancelled appointments ({appointments.filter(a => a.status === "cancelled").length})</summary><Agenda entries={appointmentList(appointments.filter(a => a.status === "cancelled"))} onEdit={() => undefined} onCancel={() => undefined} emptyLabel="No cancelled appointments."/></details>}
    {!!groups.undated.length && <details><summary>Undated dependencies / manual history ({groups.undated.length})</summary><Agenda entries={workList(groups.undated)} onEdit={edit} onCancel={cancel} emptyLabel="No undated operational work."/></details>}
    <footer>Appointments are separate from existing Ops work; neither source is rewritten. Appointment dates are user-entered, and cancellation preserves history. No external calendar sync or invitations are enabled.</footer>
  </main>;
}
