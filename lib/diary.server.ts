import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { founderAllowed, type RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { buildDiary, diaryDay, diaryLabel, diaryShift, type DiarySnapshot } from "@/lib/diary";
import type { GuideAnswer } from "@/lib/rootCoachGuide";

/** Called only after existing membership authorization, by both Diary and Ask Root. */
export async function readDiary(tenant: RelationshipTenant): Promise<DiarySnapshot> {
  const org = tenant.organisationId;
  const [input, tasks, workspaces, canFounder] = await Promise.all([readLifecycleInput(org), readTenantHistory("relationship_tasks", org, "id,organisation_id,workspace_id,task,founder_only,due_at,status"), readTenantHistory("relationship_workspaces", org, "id,organisation_id,founder_only"), founderAllowed(org)]);
  // Fail closed for protected tasks/workspaces rather than expose private research text.
  return buildDiary(org, input, tasks.filter(t => canFounder || !t.founder_only), workspaces.filter(w => canFounder || !w.founder_only));
}
export async function diaryAnswer(tenant: RelationshipTenant, intent: NonNullable<ReturnType<typeof import("./diary").diaryQuestion>>): Promise<GuideAnswer> {
  const link = { id: "diary" as const, label: "Diary", href: `/dashboard/diary?organisationId=${encodeURIComponent(tenant.organisationId)}` };
  if (intent === "where") return { workspace: "Diary", message: "Open Diary in the primary navigation for Today, Week and Month. It reads existing dated Ops work; it does not sync an external calendar or create appointments from messages.", destinations: [link] };
  const snapshot = await readDiary(tenant), day = intent === "tomorrow" ? diaryShift(snapshot.today, 1) : snapshot.today;
  const items = snapshot.items.filter(i => typeof intent === "object" ? i.type === "Call" && diaryDay(i.at) >= snapshot.today && (` ${i.title.toLocaleLowerCase().replace(/\s+/g, " ")} `).includes(` ${intent.person.toLocaleLowerCase().replace(/\s+/g, " ")} `) : intent === "overdue" ? i.actionable && diaryDay(i.at) < day : intent === "week" ? diaryDay(i.at) >= day && diaryDay(i.at) < diaryShift(day, 7) : diaryDay(i.at) === day);
  const message = items.length ? `${items.length} recorded ${items.length === 1 ? "item" : "items"}${typeof intent === "object" ? " matching that name (not an identity confirmation)" : ` for ${intent}`} (Europe/London):\n${items.slice(0, 12).map(i => `• ${diaryLabel(i.at, !i.dateOnly)} — ${i.title}: ${i.type}; ${i.action}.`).join("\n")}${items.length > 12 ? "\nOpen Diary for the full list." : ""}` : typeof intent === "object" ? "No upcoming structured call/meeting matching that name is recorded in the available Diary sources. Conversation text alone does not establish an appointment." : `No recorded dated items ${intent === "overdue" ? "remain overdue" : `for ${intent}`} in the available Diary sources.`;
  return { workspace: "Diary", message, destinations: [link] };
}
