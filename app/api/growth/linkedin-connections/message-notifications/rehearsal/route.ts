import {NextResponse} from "next/server";
import {withTenantRoute} from "@/lib/tenantRoute.server";
import {readLifecycleInput} from "@/lib/lifecycleSnapshot.server";
import {lifecycleLinkedInIdentity} from "@/lib/contactLifecycle";
import {responseLifecycleMap,responseAttention} from "@/lib/responseLifecycle";
import {parseLinkedInMessageNotification,notificationPatch} from "@/lib/linkedinMessageNotification";
/** Preview-only rehearsal. This route contains no write, ingestion or provider call. */
export const POST=withTenantRoute(async(req,tenant)=> {
  if(process.env.VERCEL_ENV!=="preview") return NextResponse.json({error:"Read-only rehearsal is available only in Preview."},{status:404});
  const body=await req.json();
  const notification=parseLinkedInMessageNotification(body);
  if(!notification) return NextResponse.json({error:"Unverified or ambiguous notification."},{status:400});
  const input=await readLifecycleInput(tenant.organisationId,false);
  const matches=input.inbox_items.filter(row=>row.platform==="linkedin" && (lifecycleLinkedInIdentity(row.linkedin_identity)||lifecycleLinkedInIdentity(row.permalink))===notification.identity);
  if(matches.length!==1) return NextResponse.json({error:"One existing canonical relationship is required."},{status:409});
  const row=matches[0];Object.assign(row,notificationPatch(row,notification) || {});
  // This flag is only in the in-memory projection; no Production data changes.
  for(const target of input.growth_targets) if((lifecycleLinkedInIdentity(target.linkedin_identity)||lifecycleLinkedInIdentity(target.linkedin_url))===notification.identity) target.linkedin_conversation_active=true;
  const lifecycle=responseLifecycleMap(tenant.organisationId,input).get(row.id);
  const attention=responseAttention(tenant.organisationId,input);
  return NextResponse.json({success:true,readOnly:true,item:{id:row.id,authorName:row.author_name,profileUrl:notification.profileUrl,messageUrl:notification.messageUrl,lifecycle},attention},{headers:{"Cache-Control":"private, no-store"}});
},{write:false});
