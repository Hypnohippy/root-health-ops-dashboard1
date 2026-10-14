import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { appendConversation, conversationSnapshot } from "@/lib/linkedinConversation.server";
export const POST=withTenantRoute(async(req,tenant)=>{
 try {return NextResponse.json({success:true,...await appendConversation(tenant.organisationId,tenant.userId,await req.json())});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Conversation logging failed."},{status:409});}
},{write:true});

// Evidence-only read: resolve the tenant's canonical lifecycle contact, never create one.
export const GET=withTenantRoute(async(req,tenant)=>{
 const contactId=new URL(req.url).searchParams.get("contactId");
 if(!contactId)return NextResponse.json({success:false,error:"Select a LinkedIn contact."},{status:400});
 const state=await conversationSnapshot(tenant.organisationId,contactId);
 if(!state.contact)return NextResponse.json({success:false,error:"LinkedIn contact not found."},{status:404});
 if(!state.schemaAvailable)return NextResponse.json({success:false,error:"LinkedIn conversation storage is unavailable."},{status:503});
 return NextResponse.json({success:true,contactId:state.contact.contactId,messages:state.messages},{headers:{"Cache-Control":"private, no-store"}});
},{write:false});
