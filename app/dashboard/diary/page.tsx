import { requireOrganisation } from "@/lib/tenantAuth";
import { readDiary } from "@/lib/diary.server";
import Diary from "./Diary";
export const dynamic = "force-dynamic";
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ organisationId?: string; relationshipId?: string; relationshipSearch?: string; company?: string; createAppointment?: string }> }) {
  const params = await searchParams, tenant = await requireOrganisation(params.organisationId, false);
  return <Diary key={`${tenant.organisationId}:${params.relationshipId || ""}:${params.createAppointment || ""}`} organisationId={tenant.organisationId} initial={await readDiary(tenant)} openCreate={params.createAppointment === "1"} prefill={{...(params.relationshipId?{id:params.relationshipId}:{}),...(params.relationshipSearch?{person:params.relationshipSearch}:{}),...(params.company?{company:params.company}:{})}} />;
}
