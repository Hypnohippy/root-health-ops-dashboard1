import { requireOrganisation } from "@/lib/tenantAuth";
import { readLinkedInCadenceReport } from "@/lib/linkedinCadenceReport.server";
import { cadenceLabels, exclusionLabels } from "@/lib/linkedinCadenceBackfill";
import SendDateReview from "./SendDateReview";
export const dynamic = "force-dynamic";
export default async function Report({ searchParams }: { searchParams: Promise<{ organisationId?: string }> }) {
 const { organisationId } = await requireOrganisation((await searchParams).organisationId, false);
 const report = await readLinkedInCadenceReport(organisationId);
 return <main className="space-y-4 p-6"><h1 className="text-2xl font-semibold">LinkedIn cadence report</h1>
 <p>Read-only snapshot as of {report.asOf}. Loading this report makes no database changes or sends.</p>
 <h2 className="text-xl font-semibold">Verified send date — current cadence</h2>
 <table><tbody>{Object.entries(cadenceLabels).map(([key, label]) => <tr key={key}><th className="pr-8 text-left">{label}</th><td>{report.counts[key as keyof typeof report.counts]}</td></tr>)}</tbody></table>
 <h2 className="text-xl font-semibold">Contacts excluded from cadence timing</h2>
 <table><tbody>{Object.entries(exclusionLabels).filter(([key]) => report.excluded[key as keyof typeof report.excluded] || ["replies", "stronger_states", "historical_unknown", "actual_send_unverified"].includes(key)).map(([key, label]) => <tr key={key}><th className="pr-8 text-left">{label}</th><td>{report.excluded[key as keyof typeof report.excluded]}</td></tr>)}</tbody></table>
 <p>Legacy confirmation timestamps are not external send dates. Existing receipt evidence is preserved. No backfill has been run.</p>
 <SendDateReview items={report.review} organisationId={organisationId} revision={report.revision} />
 </main>;
}
