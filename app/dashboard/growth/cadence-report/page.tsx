import { requireOrganisation } from "@/lib/tenantAuth";
import { readLinkedInCadenceReport } from "@/lib/linkedinCadenceReport.server";
export const dynamic = "force-dynamic";
export default async function Report({searchParams}:{searchParams:Promise<{organisationId?:string}>}) {
 const {organisationId}=await requireOrganisation((await searchParams).organisationId,false);
 const report=await readLinkedInCadenceReport(organisationId);
 return <main className="p-6"><h1>LinkedIn cadence migration — read-only dry run</h1><p>Organisation: {organisationId}. As of: {report.asOf}. No database changes or sends.</p><h2>Contacts moving to each stage</h2><pre>{JSON.stringify(report.moves,null,2)}</pre><h2>Eligible contacts by current stage</h2><pre>{JSON.stringify(report.counts,null,2)}</pre><h2>Excluded contacts (one primary reason each)</h2><pre>{JSON.stringify(report.excluded,null,2)}</pre><p>Rows needing one-time backfill: {report.repairs.length}</p></main>;
}
