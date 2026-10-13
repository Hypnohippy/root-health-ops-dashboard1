import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { buildContactLifecycle } from "@/lib/contactLifecycle";
import { searchQuery,matchesSearch } from "@/lib/opsSearch";
export const GET=withTenantRoute(async(req,tenant)=>{
 const p=new URL(req.url).searchParams,q=searchQuery(p.get("q")),page=Number(p.get("page")||0);if(!Number.isInteger(page)||page<0)return NextResponse.json({error:"Invalid page."},{status:400});
 const input=await readLifecycleInput(tenant.organisationId),rows=[...input.inbox_items,...input.growth_targets,...input.acquisition_items];
 const contacts=buildContactLifecycle(tenant.organisationId,input).filter(contact=>contact.channel==="linkedin"||contact.identity.startsWith("linkedin:")).filter(contact=>matchesSearch({person:contact.name,company:contact.company,linkedin_identity:contact.identity},q,contact.records.flatMap(ref=>{const row=rows.find(row=>row.id===ref.id);return row?JSON.stringify(Object.fromEntries(["author_name","target_name","company","email","linkedin_identity","linkedin_url","notes","evidence"].map(key=>[key,row[key]]))):"";}).join(" ")));
 return NextResponse.json({total:contacts.length,items:contacts.slice(page*25,page*25+25).map(contact=>({...contact,destination:contact.actionRecord.table==="inbox_items"?`/dashboard/responses?organisationId=${tenant.organisationId}&itemId=${contact.actionRecord.id}`:contact.actionRecord.table==="growth_targets"?`/dashboard/growth/pipeline?organisationId=${tenant.organisationId}&targetId=${contact.actionRecord.id}`:`/dashboard/growth/acquisition?organisationId=${tenant.organisationId}&itemId=${contact.actionRecord.id}`}))},{headers:{"Cache-Control":"private, no-store"}});
},{write:false});
