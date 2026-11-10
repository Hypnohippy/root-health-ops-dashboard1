"use client";
import { useEffect, useState, type FormEvent } from "react";
import { addDateDays, isoToLocalDateTime } from "@/lib/diaryAppointments";
import type { DiaryAppointment } from "@/lib/diary";

type RelationshipOption = { id: string; person: string; company: string | null; locator: string };
type Values = {
  title: string; startDate: string; startTime: string; endDate: string; endTime: string; allDay: boolean;
  timezone: string; relationshipId: string; relationshipSearch: string; location: string; meetingUrl: string; notes: string;
  status: "tentative" | "confirmed" | "completed";
};
function valuesFrom(appointment: DiaryAppointment | null, date: string, pref: { id?: string; person?: string; company?: string | null }): Values {
  if (!appointment) return { title: pref.person ? `${pref.person} appointment` : "", startDate: date, startTime: "10:00", endDate: date, endTime: "10:30", allDay: false, timezone: "Europe/London", relationshipId: pref.id || "", relationshipSearch: pref.person || "", location: "", meetingUrl: "", notes: "", status: "tentative" };
  const start = appointment.allDay ? { date: appointment.startDate || date, time: "" } : isoToLocalDateTime(appointment.startsAt!, appointment.timezone);
  const end = appointment.allDay ? { date: appointment.endDate ? addDateDays(appointment.endDate, -1) : start.date, time: "" } : isoToLocalDateTime(appointment.endsAt!, appointment.timezone);
  return { title: appointment.title, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, allDay: appointment.allDay, timezone: appointment.timezone, relationshipId: appointment.relationship?.id || "", relationshipSearch: appointment.relationship?.person || "", location: appointment.location || "", meetingUrl: appointment.meetingUrl || "", notes: appointment.notes || "", status: appointment.status === "cancelled" ? "tentative" : appointment.status };
}

export default function AppointmentForm({ organisationId, appointment, date, prefill, onCancel, onSave }: {
  organisationId: string; appointment: DiaryAppointment | null; date: string;
  prefill: { id?: string; person?: string; company?: string | null };
  onCancel: () => void; onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState(() => valuesFrom(appointment, date, prefill));
  const [options, setOptions] = useState<RelationshipOption[]>([]), [searching, setSearching] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => {
    const query = values.relationshipSearch.trim();
    if (query.length < 2) { setOptions([]); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(`/api/diary/relationships?organisationId=${encodeURIComponent(organisationId)}&q=${encodeURIComponent(query)}`, { cache: "no-store" })
        .then(async response => { if (!response.ok) throw new Error("Relationship search is unavailable."); return response.json(); })
        .then(result => { if (active) setOptions(Array.isArray(result.relationships) ? result.relationships : []); })
        .catch(() => { if (active) setOptions([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [organisationId, values.relationshipSearch]);
  const set = (key: keyof Values, value: string | boolean) => setValues(current => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      await onSave({ ...values, relationshipId: values.relationshipId || null });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Appointment could not be saved."); }
    finally { setSaving(false); }
  }
  return <form className="diary-appointment-form" onSubmit={submit} aria-label={appointment ? "Edit appointment" : "Add appointment"}>
    <h2>{appointment ? "Edit appointment" : "Add appointment"}</h2>
    {error && <p role="alert">{error}</p>}
    <label>Title<input required maxLength={200} value={values.title} onChange={e => set("title", e.target.value)} /></label>
    <label className="diary-checkbox"><input type="checkbox" checked={values.allDay} onChange={e => set("allDay", e.target.checked)} />All day</label>
    <div className="diary-form-grid"><label>Start date<input type="date" required value={values.startDate} onChange={e => setValues(current => ({ ...current, startDate: e.target.value, ...(!current.allDay && current.endDate === current.startDate ? { endDate: e.target.value } : {}) }))} /></label>
      {values.allDay ? <label>End date (inclusive)<input type="date" required min={values.startDate} value={values.endDate} onChange={e => set("endDate", e.target.value)} /></label> : <>
        <label>Start time<input type="time" required value={values.startTime} onChange={e => set("startTime", e.target.value)} /></label>
        <label>End date<input type="date" required value={values.endDate} onChange={e => set("endDate", e.target.value)} /></label>
        <label>End time<input type="time" required value={values.endTime} onChange={e => set("endTime", e.target.value)} /></label>
      </>}
    </div>
    {!values.allDay && <label>Time zone<input required maxLength={64} value={values.timezone} onChange={e => set("timezone", e.target.value)} placeholder="Europe/London" /></label>}
    <label>Relationship (optional)<input value={values.relationshipSearch} onChange={e => { setValues(current => ({ ...current, relationshipSearch: e.target.value, relationshipId: "" })); }} placeholder="Search verified people or companies" aria-autocomplete="list" />
      {searching && <small>Searching…</small>}
      {values.relationshipId && <span className="diary-selected-relationship">{prefill.company ? `${values.relationshipSearch} · ${prefill.company}` : `${values.relationshipSearch} selected`}</span>}
      {options.length > 0 && !values.relationshipId && <ul role="listbox" aria-label="Verified relationships">{options.map(option => <li key={option.id}><button type="button" role="option" aria-selected="false" onClick={() => setValues(current => ({ ...current, relationshipId: option.id, relationshipSearch: option.person }))}>{option.person}{option.company ? ` · ${option.company}` : ""}</button></li>)}</ul>}
      {values.relationshipSearch.length >= 2 && !searching && !values.relationshipId && options.length === 0 && <small>No verified relationship match; save this appointment unlinked or refine the search.</small>}
      {appointment?.relationship && <a href={appointment.relationship.href}>Open linked relationship</a>}
    </label>
    <label>Location<input maxLength={500} value={values.location} onChange={e => set("location", e.target.value)} /></label>
    <label>Meeting link<input type="url" maxLength={2048} value={values.meetingUrl} onChange={e => set("meetingUrl", e.target.value)} placeholder="https://…" /></label>
    <label>Notes<textarea maxLength={10000} rows={3} value={values.notes} onChange={e => set("notes", e.target.value)} /></label>
    <label>Status<select value={values.status} onChange={e => set("status", e.target.value)}><option value="tentative">Tentative</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option></select></label>
    <div className="diary-form-actions"><button type="button" onClick={onCancel}>Close</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save appointment"}</button></div>
  </form>;
}
