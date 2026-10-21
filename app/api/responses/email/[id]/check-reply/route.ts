import { NextResponse } from "next/server";
import { requireOrganisation, accessErrorResponse } from "@/lib/tenantAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { prepareManualCompletion } from "@/lib/manualCompletion.server";
import { verifiedExternalReply } from "@/lib/emailReplyEvidence";
import { uuid } from "@/lib/growthIngestion.server";
export async function POST(req: Request, {params}: {params: Promise<{id:string}>}) {
 try {
  const {id}=await params, body=await req.json();
  if(!uuid.test(id)||!uuid.test(body.key||""))return NextResponse.json({error:"Invalid response check."},{status:400});
  const {organisationId,userId}=await requireOrganisation(body.organisationId,true);
  const plan=await prepareManualCompletion(organisationId,"inbox_items",id);
  const item=plan.row;
  if(item.platform!=="email")return NextResponse.json({error:"Email response unavailable."},{status:404});
  if(!plan.allowed)return NextResponse.json({error:plan.reason},{status:409});
  const thread=item.email_thread_id||item.email_sent_thread_id;
  if(!thread)return NextResponse.json({verified:false,message:"Cannot verify the external reply yet. No recorded email thread is available. Use Verify manual takeover if you have verified the actual send."});
  // Bounded fail-closed read; exceeding the bound never produces a partial-history decision.
  const {data,error}=await supabaseAdmin.from("email_conversation_messages").select("organisation_id,gmail_thread_id,gmail_message_id,direction,recipient_email,body,sent_at,source").eq("organisation_id",organisationId).eq("gmail_thread_id",thread).order("sent_at",{ascending:false}).limit(101);
  if(error)throw error;
  const evidence=data && data.length<=100 ? verifiedExternalReply(item,data) : null;
  if(!evidence)return NextResponse.json({verified:false,message:"Cannot verify a newer external reply in the recorded email history yet. Nothing was marked handled. Use Verify manual takeover only after verifying the actual send."});
  // Reuse revision-checked, delivery-guarded manual completion. No send and no identity repair.
  const {data:result,error:writeError}=await supabaseAdmin.rpc("record_manual_completion",{
   p_organisation_id:organisationId,p_actor:userId,p_table:"inbox_items",p_id:id,p_revision:plan.revision,p_key:body.key,
   p_completed_at:String(evidence.sent_at),p_evidence:`Stored email message ${evidence.gmail_message_id}; thread ${thread}`,
   p_patch:{...plan.patch,last_replied_at:String(evidence.sent_at),last_reply_text:String(evidence.body)}
  });
  if(writeError)throw writeError;
  return NextResponse.json({verified:true,message:"Newer recorded outbound verified. Response handled; no email sent by Ops.",result});
 } catch(error) {
  return accessErrorResponse(error)||NextResponse.json({error:"Reply verification could not be confirmed. Refresh current state; nothing was sent."},{status:409});
 }
}
