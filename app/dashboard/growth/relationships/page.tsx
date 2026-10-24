import { requireOrganisation } from "@/lib/tenantAuth";
import { relationshipContext } from "@/lib/relationshipWorkspace.server";
import { listPrimaryRelationships } from "@/lib/relationshipDiscovery.server";
import RelationshipsList from "./components/RelationshipsList";
export const dynamic="force-dynamic";
export default async function RelationshipsPage({searchParams}:{searchParams:Promise<{organisationId?:string}>}) {const p=await searchParams,tenant=await requireOrganisation(p.organisationId,false);return <><div className="mx-auto max-w-7xl px-4 pt-4 md:px-8"><a className="inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900" href={`/dashboard/growth/relationships/review?organisationId=${encodeURIComponent(tenant.organisationId)}`}>Reviewed identity &amp; research decisions</a></div><RelationshipsList organisationId={tenant.organisationId} initial={await listPrimaryRelationships(await relationshipContext(tenant),"","active",0)}/></>;}
