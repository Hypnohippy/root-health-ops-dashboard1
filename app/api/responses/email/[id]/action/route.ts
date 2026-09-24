import { NextResponse } from "next/server";
import { requireOrganisation,accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uuid } from "@/lib/growthIngestion.server";
import { planEmailResponseAction } from "@/lib/emailResponse";
const actions=["mark_no_reply","set_follow_up","nurture","closed_lost","engaged","converted"];
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const id=(await params).id;const body=await req.json().catch(()=>({}));
    if(!uuid.test(id)||!uuid.test(body.organisationId||"")||!uuid.test(body.idempotencyKey||"")||!actions.includes(body.action))return NextResponse.json({error:"Invalid email response action."},{status:400});
    const {organisationId,userId}=await requireOrganisation(body.organisationId,true);
    const {data:item,error:readError}=await supabaseAdmin.from("inbox_items").select("id, response_state").eq("id",id).eq("organisation_id",organisationId).eq("platform","email").maybeSingle();
    if(readError)throw readError;if(!item)return NextResponse.json({error:"Email response not found."},{status:404});
    let plan;try{plan=planEmailResponseAction(item.response_state||"needs_reply",body.action);}catch{return NextResponse.json({error:"Action is not allowed from the current state."},{status:409});}
    let followUpAt:null|string=null;if(body.action==="set_follow_up"){const d=new Date(body.followUpAt);if(!body.followUpAt||Number.isNaN(d.valueOf()))return NextResponse.json({error:"Choose a valid follow-up date."},{status:400});followUpAt=d.toISOString();}
    const note=typeof body.note==="string"?body.note.trim().slice(0,2000):null;
    const {data,error}=await supabaseAdmin.rpc("apply_email_response_action",{p_organisation_id:organisationId,p_item_id:id,p_actor_user_id:userId,p_action:body.action,p_new_state:plan.newState,p_status:plan.status,p_follow_up_at:followUpAt,p_note:note||null,p_idempotency_key:body.idempotencyKey});
    if(error)throw error;return NextResponse.json({success:true,item:data?.[0]});
  }catch(error){return accessErrorResponse(error)||NextResponse.json({error:"Unable to update email response."},{status:503});}
}
