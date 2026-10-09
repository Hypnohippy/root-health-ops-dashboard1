import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { appendConversation } from "@/lib/linkedinConversation.server";
export const POST=withTenantRoute(async(req,tenant)=>{
 try {return NextResponse.json({success:true,...await appendConversation(tenant.organisationId,tenant.userId,await req.json())});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Conversation logging failed."},{status:409});}
},{write:true});
