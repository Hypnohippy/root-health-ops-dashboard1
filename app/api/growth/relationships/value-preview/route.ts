import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { calculateValue } from "@/lib/relationshipValue";
export const POST=withTenantRoute(async(req)=>{try{const body=await req.json();return NextResponse.json({calculation:calculateValue(body.input)},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Calculation unavailable."},{status:400});}},{write:false});
