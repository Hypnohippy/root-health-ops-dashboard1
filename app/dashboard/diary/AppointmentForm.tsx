"use client";
import { useEffect, useState, type FormEvent } from "react";
import { addDateDays, isoToLocalDateTime } from "@/lib/diaryAppointments";
import type { DiaryAppointment } from "@/lib/diary";

type RelationshipOption = { id: string; person: string; company: string | null; locator: string };
type Values = {
  title: string; startDate: string; startTime: string; endDate: string; endTime: string; allDay: boolean;
  timezone: string; relationshipId: string; relationshipSearch: string; location: string; meetingUrl: string; notes: string;
  status: "tentative" | "confirmed" | "completed"; syncToGoogle: boolean; googleMeetEnabled: boolean;
  inviteAttendee: boolean; googleCalendarAttendeeEmail: string;
};
function valuesFrom(appointment: DiaryAppointment | null, date: string, pref: { id?: string; person?: string; company?: string | null }): Values {
  if (!appointment) return { title: pref.person ? `${pref.person} appointment` : "", startDate: date, startTime: "10:00", endDate: date, endTime: "10:30", allDay: false, timezone: "Europe/London", relationshipId: pref.id || "", relationshipSearch: pref.person || "", location: "", meetingUrl: "", notes: "", status: "tentative", syncToGoogle: false, googleMeetEnabled: false, inviteAttendee: false, googleCalendarAttendeeEmail: "" };
  const start = appointment.allDay ? { date: appointment.startDate || date, time: "" } : isoToLocalDateTime(appointment.startsAt!, appointment.timezone);
  const end = appointment.allDay ? { date: appointment.endDate ? addDateDays(appointment.endDate, -1) : start.date, time: "" } : isoToLocalDateTime(appointment.endsAt!, appointment.timezone);
  return { title: appointment.title, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, allDay: appointment.allDay, timezone: appointment.timezone, relationshipId: appointment.relationship?.id || "", relationshipSearch: appointment.relationship?.person || "", location: appointment.location || "", meetingUrl: appointment.meetingUrl || "", notes: appointment.notes || "", status: appointment.status === "cancelled" ? "tentative" : appointment.status, syncToGoogle: appointment.googleCalendarSyncEnabled === true, googleMeetEnabled: appointment.googleMeetEnabled === true, inviteAttendee: !!appointment.googleCalendarAttendeeEmail, googleCalendarAttendeeEmail: appointment.googleCalendarAttendeeEmail || "" };
}

export default function AppointmentForm({ organisationId, appointment, date, prefill, calendarConnected, onCancel, onSave }: {
  organisationId: string; appointment: DiaryAppointment | null; date: string;
  prefill: { id?: string; person?: string; company?: string | null };
  calendarConnected: boolean;
  onCancel: () => void; onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState(() => valuesFrom(appointment, date, prefill));
  const [options, setOptions] = useState<RelationshipOption[]>([]), [verifiedEmails, setVerifiedEmails] = useState<string[]>([]), [searching, setSearching] = useState(false), [error, setError] = useState(""), [saving, setSaving] = useState(false), [emailEdited, setEmailEdited] = useState(false), [confirmAttendeeChange, setConfirmAttendeeChange] = useState(false);
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
  useEffect(() => {
    if (!values.relationshipId) { setVerifiedEmails([]); return; }
    let active = true;
    void fetch(`/api/diary/relationships?organisationId=${encodeURIComponent(organisationId)}&relationshipId=${encodeURIComponent(values.relationshipId)}`, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(result => {
        if (!active) return;
        const emails = Array.isArray(result.verifiedEmails) ? result.verifiedEmails.filter((email: unknown) => typeof email === "string") : [];
        setVerifiedEmails(emails);
        if (emails.length === 1 && !emailEdited) setValues(current => ({ ...current, googleCalendarAttendeeEmail: emails[0] }));
        if (emails.length !== 1 && !emailEdited) setValues(current => ({ ...current, googleCalendarAttendeeEmail: "" }));
      }).catch(() => { if (active) setVerifiedEmails([]); });
    return () => { active = false; };
  }, [organisationId, values.relationshipId, emailEdited]);
  const set = (key: keyof Values, value: string | boolean) => setValues(current => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setSaving(true);
    try {
      if (attendeeChanged && !confirmAttendeeChange) throw new Error("Confirm the attendee change before saving the appointment.");
      await onSave({ ...values, relationshipId: values.relationshipId || null });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Appointment could not be saved."); }
    finally { setSaving(false); }
  }
  const nextAttendee = values.inviteAttendee ? values.googleCalendarAttendeeEmail.trim().toLowerCase() : null;
  const previousAttendee = appointment?.googleCalendarAttendeeEmail?.trim().toLowerCase() || null;
  const attendeeChanged = !!appointment && nextAttendee !== previousAttendee;
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
    <label>Relationship (optional)<input value={values.relationshipSearch} onChange={e => { setVerifiedEmails([]); setValues(current => ({ ...current, relationshipSearch: e.target.value, relationshipId: "", ...(!emailEdited ? { googleCalendarAttendeeEmail: "" } : {}) })); }} placeholder="Search verified people or companies" aria-autocomplete="list" />
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
    {calendarConnected && <label className="diary-checkbox"><input type="checkbox" checked={values.syncToGoogle} disabled={appointment?.googleCalendarSyncEnabled === true} onChange={e => set("syncToGoogle", e.target.checked)} />Sync to Google Calendar{appointment?.googleCalendarSyncEnabled ? " · linked mirror stays enabled" : ""}</label>}
    {calendarConnected && <>
      <label className="diary-checkbox"><input type="checkbox" checked={values.googleMeetEnabled} onChange={e => set("googleMeetEnabled", e.target.checked)} />Add Google Meet</label>
      <p>Google creates the Meet link on the same Root-owned Calendar event. The link appears after Google confirms it.</p>
      <label className="diary-checkbox"><input type="checkbox" checked={values.inviteAttendee} onChange={e => set("inviteAttendee", e.target.checked)} />Invite attendee by Google Calendar</label>
      <label>Attendee email<input type="email" maxLength={320} value={values.googleCalendarAttendeeEmail} onChange={e => { setEmailEdited(true); setConfirmAttendeeChange(false); set("googleCalendarAttendeeEmail", e.target.value); }} placeholder="name@example.com" autoComplete="email" />
        {verifiedEmails.length === 1 && <small>One verified relationship email is shown. It will not be invited unless you check Invite attendee.</small>}
        {verifiedEmails.length > 1 && <><small>Several verified emails are available. Choose one explicitly or enter a different address.</small><select aria-label="Choose verified attendee email" value={verifiedEmails.includes(values.googleCalendarAttendeeEmail) ? values.googleCalendarAttendeeEmail : ""} onChange={e => { setEmailEdited(true); setConfirmAttendeeChange(false); set("googleCalendarAttendeeEmail", e.target.value); }}><option value="">Choose a verified email</option>{verifiedEmails.map(email => <option key={email} value={email}>{email}</option>)}</select></>}
        {appointment && attendeeChanged && <label className="diary-checkbox"><input type="checkbox" checked={confirmAttendeeChange} onChange={e => setConfirmAttendeeChange(e.target.checked)} />I confirm this attendee change and understand Google Calendar will notify the guest.</label>}
      </label>
      {(values.googleMeetEnabled || values.inviteAttendee) && <small>Saving these options creates or updates the same Root-owned Google Calendar event. An invitation is sent only when Invite attendee is checked.</small>}
    </>}
    {!calendarConnected && appointment?.googleCalendarSyncEnabled && <p>Google Calendar sync is enabled for this appointment. Reconnect Calendar to resume syncing.</p>}
    <div className="diary-form-actions"><button type="button" onClick={onCancel}>Close</button><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save appointment"}</button></div>
  </form>;
}
