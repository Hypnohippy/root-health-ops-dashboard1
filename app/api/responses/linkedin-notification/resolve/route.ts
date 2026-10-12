import {NextResponse} from "next/server";
import {withTenantRoute} from "@/lib/tenantRoute.server";
import {resolveLinkedInNotification} from "@/lib/linkedinMessageNotification.server";
export const POST=withTenantRoute(async(req,tenant)=> {
  try { return NextResponse.json({success:true,...await resolveLinkedInNotification(tenant.organisationId,tenant.userId,await req.json())}); }
  catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "Reply was not marked handled."},{status:409}); }
},{write:true});
