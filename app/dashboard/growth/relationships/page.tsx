import { requireOrganisation } from "@/lib/tenantAuth";
import { relationshipContext,listRelationships } from "@/lib/relationshipWorkspace.server";
import RelationshipsList from "./components/RelationshipsList";
export const dynamic="force-dynamic";
export default async function RelationshipsPage({searchParams}:{searchParams:Promise<{organisationId?:string}>}) {const p=await searchParams,tenant=await requireOrganisation(p.organisationId,false);return <RelationshipsList organisationId={tenant.organisationId} initial={listRelationships(await relationshipContext(tenant),"","active",0)}/>;}
