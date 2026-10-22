import { requireOrganisation } from "@/lib/tenantAuth";
import { readDiary } from "@/lib/diary.server";
import Diary from "./Diary";
export const dynamic = "force-dynamic";
export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ organisationId?: string }> }) {
  const params = await searchParams, tenant = await requireOrganisation(params.organisationId, false);
  return <Diary key={tenant.organisationId} organisationId={tenant.organisationId} initial={await readDiary(tenant)} />;
}
