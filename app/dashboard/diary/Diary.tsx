"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diaryDay, diaryGroups, diaryLabel, diaryMonth, diaryShift, diaryWeek, type DiaryAppointment, type DiaryGoogleCalendarEvent, type DiaryItem, type DiarySnapshot } from "@/lib/diary";
import { appointmentDateKey } from "@/lib/diaryAppointments";
import AppointmentForm from "./AppointmentForm";
import "./diary.css";

type Prefill = { id?: string; person?: string; company?: string | null };
type Snapshot = DiarySnapshot & { appointments?: DiaryAppointment[]; googleCalendarEvents?: DiaryGoogleCalendarEvent[]; googleCalendar?: { connected: boolean; email: string | null; unavailable: boolean } };
type AgendaEntry = { kind: "ops"; item: DiaryItem } | { kind: "appointment"; appointment: DiaryAppointment } | { kind: "google"; event: DiaryGoogleCalendarEvent };
const active = (appointment: DiaryAppointment) => appointment.status !== "cancelled";
function appointmentTime(appointment: DiaryAppointment) {
  if (appointment.allDay) return appointment.startDate === appointment.endDate ? "All day" : `All day · ${appointment.startDate}`;
  if (!appointment.startsAt || !appointment.endsAt) return "Time not recorded";
  const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: appointment.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return `${fmt(appointment.startsAt)}–${fmt(appointment.endsAt)} · ${appointment.timezone}`;
}
function appointmentDateLabel(allDay: boolean, startDate: string | null, startsAt: string | null, timezone: string) {
  const date = appointmentDateKey({ all_day: allDay, starts_at: startsAt, start_date: startDate, timezone });
  if (!date) return null;
  const label = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return { date, label };
}
function appointmentSortTime(appointment: DiaryAppointment) { return appointment.allDay ? `${appointment.startDate || ""}T00:00:00Z` : appointment.startsAt || "9999"; }
function googleDateKey(event: DiaryGoogleCalendarEvent) { return appointmentDateKey({ all_day: event.allDay, starts_at: event.startsAt, start_date: event.startDate, timezone: event.timezone }); }
function googleSortTime(event: DiaryGoogleCalendarEvent) { return event.allDay ? `${event.startDate || ""}T00:00:00Z` : event.startsAt || "9999"; }
function eventTime(event: DiaryGoogleCalendarEvent) {
  if (event.allDay) return "All day";
  if (!event.startsAt || !event.endsAt) return "Time not recorded";
  const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: event.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return `${fmt(event.startsAt)}–${fmt(event.endsAt)} · ${event.timezone}`;
}
function Agenda({ entries, onEdit, onCancel, onRetry, emptyLabel, showAppointmentDate = false }: { entries: AgendaEntry[]; onEdit: (appointment: DiaryAppointment) => void; onCancel: (appointment: DiaryAppointment) => void; onRetry?: (appointment: DiaryAppointment) => void; emptyLabel: string; showAppointmentDate?: boolean }) {
  if (!entries.length) return <p className="diary-empty">{emptyLabel}</p>;
  return <ul className="diary-items">{entries.map(entry => entry.kind === "ops" ? <li key={`ops:${entry.item.id}`} className="diary-operational-item"><a href={entry.item.href}>
    <span className="diary-kind">{entry.item.type} · {entry.item.workspace}</span><strong>{entry.item.title}</strong>{entry.item.company && <span>{entry.item.company}</span>}
    <time dateTime={entry.item.at || undefined}>{diaryLabel(entry.item.at, !entry.item.dateOnly)} · UK time</time><span>{entry.item.action}</span>
    <span className="diary-status">{entry.item.status} · Actionable: {entry.item.actionable ? "Yes" : "No"}{entry.item.suppressionReason ? ` · ${entry.item.suppressionReason}` : ""} → Open record</span>{entry.item.navigationReason && <small>{entry.item.navigationReason}</small>}
  </a></li> : entry.kind === "appointment" ? <li key={`appointment:${entry.appointment.id}`} className={`diary-appointment diary-appointment-${entry.appointment.status}`}>
    <article><span className="diary-kind">Appointment · {entry.appointment.source === "relationship" ? "Relationship" : "Ops"}</span>
      {showAppointmentDate && (() => { const date = appointmentDateLabel(entry.appointment.allDay, entry.appointment.startDate, entry.appointment.startsAt, entry.appointment.timezone); return date && <time className="diary-appointment-date" dateTime={date.date}>{date.label}</time>; })()}
      <time className="diary-appointment-time" dateTime={entry.appointment.startsAt || entry.appointment.startDate || undefined}>{appointmentTime(entry.appointment)}</time>
      <strong className="diary-appointment-title">{entry.appointment.title}</strong>{entry.appointment.relationship && <span>{entry.appointment.relationship.person}{entry.appointment.relationship.company ? ` · ${entry.appointment.relationship.company}` : ""}</span>}
      {entry.appointment.location && <span>{entry.appointment.location}</span>}{entry.appointment.meetingUrl && <a href={entry.appointment.meetingUrl} target="_blank" rel="noreferrer">Open meeting link</a>}
      {entry.appointment.relationship && <a href={entry.appointment.relationship.href}>Open relationship</a>}
      <span className="diary-status">{entry.appointment.status[0].toUpperCase() + entry.appointment.status.slice(1)} · Revision {entry.appointment.revision}</span>
      {entry.appointment.googleCalendarSyncEnabled && <span className="diary-status">Google Calendar · {entry.appointment.googleCalendarSyncPending ? "Sync pending" : entry.appointment.googleCalendarSyncedAt ? "Synced" : "Sync enabled"}</span>}
      {entry.appointment.googleCalendarSyncPending && entry.appointment.status !== "cancelled" && <button type="button" onClick={() => onRetry?.(entry.appointment)}>Retry Google Calendar sync</button>}
      {entry.appointment.status !== "completed" && entry.appointment.status !== "cancelled" && <div className="diary-appointment-actions"><button type="button" onClick={() => onEdit(entry.appointment)}>Edit / reschedule</button><button type="button" onClick={() => onCancel(entry.appointment)}>Cancel appointment</button></div>}
    </article>
  </li> : <li key={`google:${entry.event.id}`} className="diary-appointment diary-google-calendar-event">
    <article><span className="diary-kind">Google Calendar · Read only</span>{showAppointmentDate && (() => { const date = appointmentDateLabel(entry.event.allDay, entry.event.startDate, entry.event.startsAt, entry.event.timezone); return date && <time className="diary-appointment-date" dateTime={date.date}>{date.label}</time>; })()}<time className="diary-appointment-time" dateTime={entry.event.startsAt || entry.event.startDate || undefined}>{eventTime(entry.event)}</time>
      <strong className="diary-appointment-title">{entry.event.title}</strong>{entry.event.location && <span>{entry.event.location}</span>}{entry.event.meetingUrl && <a href={entry.event.meetingUrl} target="_blank" rel="noreferrer">Open meeting link</a>}
      <span className="diary-status">Google Calendar event</span></article>
  </li>)}</ul>;
}
type LaneGroup = { heading: string; entries: AgendaEntry[]; showAppointmentDate?: boolean };
function AppointmentWorkLanes({ appointmentGroups, workGroups, onEdit, onCancel, onRetry, className }: {
  appointmentGroups: LaneGroup[]; workGroups: LaneGroup[];
  onEdit: (appointment: DiaryAppointment) => void; onCancel: (appointment: DiaryAppointment) => void; onRetry?: (appointment: DiaryAppointment) => void;
  className?: string;
}) {
  const appointmentCount = appointmentGroups.reduce((count, group) => count + group.entries.length, 0);
  const workCount = workGroups.reduce((count, group) => count + group.entries.length, 0);
  return <div className={className || "diary-lanes"}>
    <section className="diary-lane diary-lane-appointments" aria-labelledby="diary-appointments-heading">
      <p className="diary-lane-kicker">Primary</p><h2 id="diary-appointments-heading">Appointments <small>{appointmentCount}</small></h2>
      {appointmentGroups.map((group, index) => <div className="diary-lane-group" key={`appointments:${index}`}>
        {group.heading && <h3>{group.heading} <small>{group.entries.length}</small></h3>}
        <Agenda entries={group.entries} onEdit={onEdit} onCancel={onCancel} onRetry={onRetry} emptyLabel="No appointments scheduled." showAppointmentDate={group.showAppointmentDate} />
      </div>)}
    </section>
    <section className="diary-lane diary-lane-operational-work" aria-labelledby="diary-operational-heading">
      <p className="diary-lane-kicker">Secondary</p><h2 id="diary-operational-heading">Operational work <small>{workCount}</small></h2>
      {workGroups.map((group, index) => <div className="diary-lane-group" key={`work:${index}`}>
        {group.heading && <h3>{group.heading} <small>{group.entries.length}</small></h3>}
        <Agenda entries={group.entries} onEdit={onEdit} onCancel={onCancel} onRetry={onRetry} emptyLabel="No operational work." />
      </div>)}
    </section>
  </div>;
}

export default function Diary({ organisationId, initial, openCreate = false, prefill = {} }: { organisationId: string; initial: Snapshot; openCreate?: boolean; prefill?: Prefill }) {
  const [snapshot, setSnapshot] = useState(initial), [view, setView] = useState<"Today" | "Week" | "Month">("Today"), [day, setDay] = useState(initial.today), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(openCreate), [editing, setEditing] = useState<DiaryAppointment | null>(null);
  const appointments = useMemo(() => snapshot.appointments || [], [snapshot.appointments]), calendarEvents = snapshot.googleCalendarEvents || [], calendar = snapshot.googleCalendar || { connected: false, email: null, unavailable: false }, groups = diaryGroups(snapshot, view === "Today" ? snapshot.today : day);
  const refresh = useCallback(async () => {
    setLoading(true); setNotice("");
    const dates = view === "Today" ? { from: snapshot.today, to: diaryShift(snapshot.today, 31) } : view === "Week" ? (() => { const days = diaryWeek(day); return { from: days[0], to: diaryShift(days[6], 1) }; })() : { from: diaryMonth(day)[0], to: diaryShift(diaryMonth(day).at(-1)!, 1) };
    try { const response = await fetch(`/api/diary?organisationId=${encodeURIComponent(organisationId)}&from=${dates.from}&to=${dates.to}`, { cache: "no-store" }); if (!response.ok) throw Error(); const incoming = await response.json(); setSnapshot(current => ({ ...incoming, appointments: incoming.appointments ?? current.appointments, googleCalendarEvents: incoming.googleCalendarEvents ?? current.googleCalendarEvents, googleCalendar: incoming.googleCalendar ?? current.googleCalendar })); }
    catch { setNotice("Diary could not refresh. The previous snapshot remains visible; reopen the source to check current state."); }
    finally { setLoading(false); }
  }, [organisationId, view, day, snapshot.today]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("pageshow", refresh); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const lastRequestedRange = useRef(`${view}:${day}`);
  useEffect(() => { const key = `${view}:${day}`; if (lastRequestedRange.current === key) return; lastRequestedRange.current = key; void refresh(); }, [view, day, refresh]);
  const appointmentsForDate = (date: string): AgendaEntry[] => [
    ...appointments.filter(appointment => active(appointment) && appointmentDateKey({ all_day: appointment.allDay, starts_at: appointment.startsAt, start_date: appointment.startDate, timezone: appointment.timezone }) === date).map(appointment => ({ kind: "appointment" as const, appointment })),
    ...calendarEvents.filter(event => googleDateKey(event) === date).map(event => ({ kind: "google" as const, event })),
  ].sort((a, b) => (a.kind === "google" ? googleSortTime(a.event) : appointmentSortTime(a.appointment)).localeCompare(b.kind === "google" ? googleSortTime(b.event) : appointmentSortTime(b.appointment)));
  const workForDate = (date: string): AgendaEntry[] => snapshot.items
    .filter(item => diaryDay(item.at) === date).sort((a, b) => (a.at || "9999").localeCompare(b.at || "9999"))
    .map(item => ({ kind: "ops", item }));
  const monthDays = useMemo(() => diaryMonth(day), [day]);

  async function save(values: Record<string, unknown>) {
    const url = editing ? `/api/diary/appointments/${encodeURIComponent(editing.id)}?organisationId=${encodeURIComponent(organisationId)}` : `/api/diary/appointments?organisationId=${encodeURIComponent(organisationId)}`;
    const response = await fetch(url, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, ...(editing ? { revision: editing.revision } : {}) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Appointment could not be saved.");
    setFormOpen(false); setEditing(null); setNotice(result.calendarSyncWarning || (editing ? "Appointment updated." : "Appointment created.")); await refresh();
  }
  async function cancel(appointment: DiaryAppointment) {
    const mirrorNotice = appointment.googleCalendarMirrored ? " Its Root-owned Google Calendar event will also be cancelled." : "";
    if (!window.confirm(`Cancel “${appointment.title}”?${mirrorNotice} The appointment will remain in history.`)) return;
    const response = await fetch(`/api/diary/appointments/${encodeURIComponent(appointment.id)}?organisationId=${encodeURIComponent(organisationId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", revision: appointment.revision }) });
    const result = await response.json(); if (!response.ok) { setNotice(result.error || "Appointment could not be cancelled."); return; }
    setNotice(result.calendarSyncWarning || "Appointment cancelled and retained in history."); await refresh();
  }
  async function retryGoogleSync(appointment: DiaryAppointment) {
    const response = await fetch(`/api/diary/appointments/${encodeURIComponent(appointment.id)}/google-sync?organisationId=${encodeURIComponent(organisationId)}`, { method: "POST" });
    const result = await response.json(); setNotice(response.ok ? "Google Calendar sync completed." : result.error || "Google Calendar sync remains pending."); await refresh();
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
  const upcomingAppointments: AgendaEntry[] = [
    ...appointments.filter(a => (a.status === "tentative" || a.status === "confirmed") && appointmentDateKey({ all_day: a.allDay, starts_at: a.startsAt, start_date: a.startDate, timezone: a.timezone }) > snapshot.today).map(appointment => ({ kind: "appointment" as const, appointment })),
    ...calendarEvents.filter(event => googleDateKey(event) > snapshot.today).map(event => ({ kind: "google" as const, event })),
  ].sort((a,b)=>(a.kind === "google" ? googleSortTime(a.event) : appointmentSortTime(a.appointment)).localeCompare(b.kind === "google" ? googleSortTime(b.event) : appointmentSortTime(b.appointment))).slice(0,12);
  const weekDates = view === "Week" ? diaryWeek(day) : [];
  const selectedDate = appointmentsForDate(day);
  return <main className="diary-root"><header><p className="diary-eyebrow">YOUR DATED OPS WORK</p><h1>Diary</h1><p>Appointments alongside canonical meetings, follow-ups, tasks, waiting and manual history. Each keeps its own source.</p><p className="diary-updated">Europe/London · Updated {diaryLabel(snapshot.asOf, true)}</p><p className="diary-calendar-state"><strong>Google Calendar</strong> · {calendar.connected ? `Connected${calendar.email ? ` as ${calendar.email}` : ""}` : "Not connected"}{!calendar.connected && <a href={`/api/diary/calendar/connect?organisationId=${encodeURIComponent(organisationId)}`}>Connect Google Calendar</a>}</p>{calendar.unavailable && <p className="diary-notice" role="status">Google Calendar could not be refreshed. Root appointments and operational work remain available.</p>}</header>
    <div className="diary-toolbar"><div role="group" aria-label="Diary view">{(["Today", "Week", "Month"] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); if (v === "Today") setDay(snapshot.today); }}>{v}</button>)}</div><div className="diary-primary-actions"><button onClick={() => { setEditing(null); setFormOpen(true); }} type="button">+ Add appointment</button><button onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div></div>
    {notice && <p role="status" className="diary-notice">{notice}</p>}
    {snapshot.summary && <p className="diary-empty">{snapshot.summary.actionableFollowups} actionable follow-ups · {snapshot.summary.futureFollowups} future follow-ups · {snapshot.summary.repliesNeedingResponse} replies need attention · {snapshot.summary.suppressedFollowups} suppressed follow-ups</p>}
    {formOpen && <div className="diary-dialog-backdrop"><section role="dialog" aria-modal="true" aria-label={editing ? "Edit appointment" : "Add appointment"}><AppointmentForm organisationId={organisationId} appointment={editing} date={editing ? appointmentDateKey({ all_day: editing.allDay, starts_at: editing.startsAt, start_date: editing.startDate, timezone: editing.timezone }) || day : day} prefill={editing?.relationship ? { id: editing.relationship.id, person: editing.relationship.person, company: editing.relationship.company } : prefill} calendarConnected={calendar.connected} onCancel={closeForm} onSave={save}/></section></div>}
    {view !== "Today" && <div className="diary-dates"><button aria-label="Previous period" onClick={() => setDay(diaryShift(day, view === "Week" ? -7 : -new Date(day + "T12:00:00Z").getUTCDate()))}>←</button><label>Period containing date <input type="date" value={day} onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDay(e.target.value); }} /></label><button aria-label="Next period" onClick={() => setDay(view === "Week" ? diaryShift(day, 7) : diaryShift(monthDays.at(-1)!, 1))}>→</button></div>}
    {view === "Today" && <AppointmentWorkLanes
      className="diary-lanes diary-today"
      appointmentGroups={[
        ...(todayReviewAppointments.length ? [{ heading: "Past appointments to review", entries: appointmentList(todayReviewAppointments) }] : []),
        { heading: "Today", entries: todayAppointments },
        { heading: "Upcoming", entries: upcomingAppointments, showAppointmentDate: true },
      ]}
      workGroups={[
        { heading: "Overdue", entries: workList(groups.overdue) },
        { heading: "Today", entries: workList(snapshot.items.filter(item => diaryDay(item.at) === snapshot.today)) },
        { heading: "Upcoming", entries: workList(groups.upcoming) },
      ]}
      onEdit={edit} onCancel={cancel} onRetry={retryGoogleSync}/ >}
    {view === "Week" && <AppointmentWorkLanes
      appointmentGroups={weekDates.map(date => ({ heading: diaryLabel(date), entries: appointmentsForDate(date) }))}
      workGroups={weekDates.map(date => ({ heading: diaryLabel(date), entries: workForDate(date) }))}
      onEdit={edit} onCancel={cancel} onRetry={retryGoogleSync}/ >}
    {view === "Month" && <><h2>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(day + "T12:00:00Z"))}</h2><div className="diary-month" role="group" aria-label="Choose a diary date">{monthDays.map(date => { const appointmentCount = appointments.filter(a => a.status !== "cancelled" && appointmentDateKey({ all_day: a.allDay, starts_at: a.startsAt, start_date: a.startDate, timezone: a.timezone }) === date).length + calendarEvents.filter(event => googleDateKey(event) === date).length; const workCount = snapshot.items.filter(item => diaryDay(item.at) === date).length; return <button key={date} aria-pressed={date === day} aria-label={`${diaryLabel(date)}: ${appointmentCount} appointment${appointmentCount === 1 ? "" : "s"}, ${workCount} operational item${workCount === 1 ? "" : "s"}`} onClick={() => setDay(date)}><strong>{Number(date.slice(-2))}</strong><span className="diary-month-counts"><span><b>{appointmentCount}</b> apt</span><span><b>{workCount}</b> work</span></span></button>; })}</div><h2 className="diary-selected-date">{diaryLabel(day)}</h2><AppointmentWorkLanes appointmentGroups={[{ heading: "Appointments", entries: selectedDate }]} workGroups={[{ heading: "Operational work", entries: workForDate(day) }]} onEdit={edit} onCancel={cancel} onRetry={retryGoogleSync}/></>}
    {appointments.some(a => a.status === "cancelled") && <details className="diary-cancelled"><summary>Cancelled appointments ({appointments.filter(a => a.status === "cancelled").length})</summary><Agenda entries={appointmentList(appointments.filter(a => a.status === "cancelled"))} onEdit={() => undefined} onCancel={() => undefined} emptyLabel="No cancelled appointments."/></details>}
    {!!groups.undated.length && <details><summary>Undated dependencies / manual history ({groups.undated.length})</summary><Agenda entries={workList(groups.undated)} onEdit={edit} onCancel={cancel} emptyLabel="No undated operational work."/></details>}
    <footer>Google-native events are read-only projections; Root appointments remain authoritative. Only appointments explicitly marked for Calendar sync create a Root-owned Google event. No attendees are invited automatically.</footer>
  </main>;
}
