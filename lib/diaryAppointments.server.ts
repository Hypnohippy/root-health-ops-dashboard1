import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { listRelationships, relationshipContext } from "@/lib/relationshipWorkspace.server";
import { parseAppointmentValues } from "@/lib/diaryAppointments";
import { readOperationalIntelligence } from "@/lib/operationalIntelligence.server";

export type DiaryAppointmentRow = {
  id: string; organisation_id: string; owner_user_id: string; relationship_id: string | null;
  title: string; starts_at: string | null; ends_at: string | null; start_date: string | null; end_date: string | null;
  timezone: string; all_day: boolean; location: string | null; meeting_url: string | null; notes: string | null;
  status: "tentative" | "confirmed" | "completed" | "cancelled"; source: "ops_manual" | "relationship";
  revision: number; created_at: string; updated_at: string; cancelled_at: string | null;
  google_calendar_sync_enabled?: boolean; google_calendar_id?: string | null; google_calendar_event_id?: string | null;
  google_calendar_etag?: string | null; google_calendar_synced_at?: string | null;
  google_calendar_sync_pending?: boolean;
};

export class DiaryAppointmentError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function readDiaryAppointments(organisationId: string): Promise<DiaryAppointmentRow[]> {
  const { data, error } = await supabaseAdmin.from("appointments").select("*")
    .eq("organisation_id", organisationId).order("all_day", { ascending: false })
    .order("starts_at", { ascending: true, nullsFirst: false }).order("start_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true }).limit(500);
  if (error) throw error;
  return (data || []) as DiaryAppointmentRow[];
}

export async function searchDiaryRelationships(tenant: RelationshipTenant, query: unknown) {
  const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (q.length < 2) return [];
  const ctx = await relationshipContext(tenant);
  const result = listRelationships(ctx, q, "active", 0);
  return result.items.filter(item => item.locator.startsWith("workspace_") && !item.conflict)
    .map(item => ({ id: item.locator.slice("workspace_".length), person: item.name, company: item.company, locator: item.locator }))
    .slice(0, 10);
}

function errorFromRpc(error: unknown): DiaryAppointmentError {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("appointment_revision_conflict")) return new DiaryAppointmentError("This appointment changed elsewhere. Refresh and review the saved version before editing again.", 409);
  if (message.includes("appointment_not_found")) return new DiaryAppointmentError("Appointment not found in this organisation.", 404);
  if (message.includes("appointment_relationship_unavailable")) return new DiaryAppointmentError("Choose a verified relationship in this organisation.", 400);
  if (message.includes("appointment_not_editable")) return new DiaryAppointmentError("Completed or cancelled appointments cannot be changed.", 409);
  if (message.includes("appointment_status_transition_invalid")) return new DiaryAppointmentError("A tentative appointment cannot be marked completed before it is confirmed.", 400);
  if (message.includes("appointment_actor_not_authorized")) return new DiaryAppointmentError("You no longer have permission to manage appointments in this organisation.", 403);
  return new DiaryAppointmentError("Appointment could not be saved. Refresh the Diary and try again.", 409);
}

export async function saveDiaryAppointment(tenant: RelationshipTenant, action: "create" | "update" | "cancel", input: Record<string, unknown>) {
  const id = typeof input.id === "string" ? input.id : null;
  const revision = Number.isSafeInteger(input.revision) && Number(input.revision) > 0 ? Number(input.revision) : null;
  if (action !== "create" && (!id || !revision)) throw new DiaryAppointmentError("Refresh the appointment before saving; its revision is missing.", 400);

  let values: ReturnType<typeof parseAppointmentValues> | null = null;
  if (action !== "cancel") {
    try { values = parseAppointmentValues(input); }
    catch (error) { throw new DiaryAppointmentError(error instanceof Error ? error.message : "Appointment details are invalid.", 400); }
    if (values.relationshipId) {
      try {
        const verified = await readOperationalIntelligence(tenant, `workspace_${values.relationshipId}`);
        if (!verified.workspace || verified.workspace.id !== values.relationshipId || verified.intelligence.identity.humanReviewRequired) throw new Error();
      } catch {
        throw new DiaryAppointmentError("Choose an exact, verified relationship available in this organisation.", 400);
      }
    }
  }

  const { data, error } = await supabaseAdmin.rpc("save_appointment", {
    p_org: tenant.organisationId, p_actor: tenant.userId, p_action: action, p_id: id,
    p_revision: revision, p_relationship_id: values?.relationshipId ?? null,
    p_title: values?.title ?? null, p_starts_at: values?.startsAt ?? null, p_ends_at: values?.endsAt ?? null,
    p_start_date: values?.startDate ?? null, p_end_date: values?.endDate ?? null,
    p_timezone: values?.timezone ?? null, p_all_day: values?.allDay ?? null,
    p_location: values?.location ?? null, p_meeting_url: values?.meetingUrl ?? null,
    p_notes: values?.notes ?? null, p_status: values?.status ?? null,
  });
  if (error) throw errorFromRpc(error);
  const row = (Array.isArray(data) ? data[0] : data) as DiaryAppointmentRow | null;
  if (!row?.id || row.organisation_id !== tenant.organisationId) throw new DiaryAppointmentError("Appointment save could not be verified. Refresh before continuing.", 409);
  return row;
}
