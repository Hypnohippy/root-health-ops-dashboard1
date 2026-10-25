import { requireOrganisation } from "@/lib/tenantAuth";
import { readDiary } from "@/lib/diary.server";
import Diary from "./Diary";
export const dynamic = "force-dynamic";
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ organisationId?: string; view?: string; date?: string }> }) {
  const params = await searchParams, tenant = await requireOrganisation(params.organisationId, false);
  const selection = new URLSearchParams({ view: params.view || "Today", date: params.date || "" }).toString();
  return <Diary key={tenant.organisationId} organisationId={tenant.organisationId} initial={await readDiary(tenant)} initialSearch={selection} />;
}
