import { requireOrganisation } from "@/lib/tenantAuth";
import { getRelationship } from "@/lib/relationshipWorkspace.server";
import RelationshipDetail from "../components/RelationshipDetail";
export const dynamic="force-dynamic";
export default async function RelationshipPage({params,searchParams}:{params:Promise<{relationshipId:string}>;searchParams:Promise<{organisationId?:string}>}) {
 const [p,q]=await Promise.all([params,searchParams]),tenant=await requireOrganisation(q.organisationId,false);
 let data:Awaited<ReturnType<typeof getRelationship>>|null=null,error="";
 try{data=await getRelationship(tenant,p.relationshipId);}catch(e){error=e instanceof Error?e.message:"Unable to resolve this relationship safely.";}
 if(!data)return <main className="p-8"><h1 className="text-2xl">Relationship unavailable</h1><p role="alert" className="my-4">{error}</p><a className="underline" href={`/dashboard/growth/relationships?organisationId=${tenant.organisationId}`}>Find a relationship</a></main>;
 return <RelationshipDetail key={p.relationshipId} organisationId={tenant.organisationId} locator={p.relationshipId} initial={data}/>;
}
