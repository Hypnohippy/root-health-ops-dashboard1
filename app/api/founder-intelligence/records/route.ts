import { NextResponse } from "next/server";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";
import { accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readTenantHistory } from "@/lib/opsSearch.server";
import { matchesSearch,searchQuery } from "@/lib/opsSearch";
import { founderRecord,saveFounderRecord,founderState } from "@/lib/founderMemory.server";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req:Request) {try {
 const p=new URL(req.url).searchParams,tenant=await requireFounderIntelligence(p.get("organisationId")),id=p.get("recordId");
 if(id) {const record=await founderRecord(tenant.organisationId,id),events=(await readTenantHistory("founder_activity_events",tenant.organisationId)).filter(event=>event.research_record_id===id).sort((a,b)=>String(a.occurred_at||a.recorded_at).localeCompare(String(b.occurred_at||b.recorded_at)));
 const gmail=events.some(e=>e.gmail_message_id)?await readTenantHistory("email_conversation_messages",tenant.organisationId):[];
 return json({record,events:events.map(event=>({...event,linked_evidence:gmail.find(m=>m.gmail_message_id===event.gmail_message_id&&m.gmail_thread_id===event.gmail_thread_id)||null})),currentState:await founderState(tenant.organisationId,record)});}
 const q=searchQuery(p.get("q")),view=p.get("view")||"Recent",page=Number(p.get("page")||0);if(!Number.isInteger(page)||page<0)throw Error("Invalid page.");
 const history=q?await readTenantHistory("founder_activity_events",tenant.organisationId):[];
 const rows=(await readTenantHistory("founder_research_records",tenant.organisationId)).filter(row=>
 (view!=="Saved"||row.saved) && (view!=="Companies"||row.entity_kind==="company") && (view!=="People"||row.entity_kind==="person") && (view!=="Partners"||["personal_partners","workplace_introducers","ops_distribution","health_referral","ops_user_channel"].includes(String(row.lane))) && (view!=="Sent to Acquisition"||row.linked_acquisition_item_id) && matchesSearch(row,q,history.filter(event=>event.research_record_id===row.id).map(event=>[event.route,event.subject,event.message].filter(Boolean).join(" ")).join(" "))).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))||String(a.id).localeCompare(String(b.id)));
 return json({records:rows.slice(page*25,page*25+25),total:rows.length,page});
 }catch(error){return accessErrorResponse(error)||json({error:"Founder memory could not be loaded. Apply the reviewed local migration before enabling storage."},503);}}
export async function POST(req:Request) {try {const body=await req.json(),tenant=await requireFounderIntelligence(body.organisationId);return json({record:await saveFounderRecord(tenant.organisationId,tenant.userId,body)});}catch(error){return accessErrorResponse(error)||json({error:error instanceof Error?error.message:"Research was not saved."},400);}}
export async function PATCH(req:Request) {try {const body=await req.json(),tenant=await requireFounderIntelligence(body.organisationId),record=await founderRecord(tenant.organisationId,String(body.recordId));
 if(body.updatedAt!==record.updated_at)throw Error("Stored research changed; reopen before saving.");
 const patch:Record<string,unknown>={updated_at:new Date().toISOString()};if(typeof body.saved==="boolean")patch.saved=body.saved;
 for(const key of ["draft_subject","draft_body"])if(typeof body[key]==="string"&&body[key].length<=50000)patch[key]=body[key];
 const {data,error}=await supabaseAdmin.from("founder_research_records").update(patch).eq("organisation_id",tenant.organisationId).eq("id",record.id).eq("updated_at",record.updated_at).select("*").maybeSingle();if(error||!data)throw Error("Research changed; save was not confirmed.");return json({record:data});
 }catch(error){return accessErrorResponse(error)||json({error:error instanceof Error?error.message:"Save failed."},409);}}
