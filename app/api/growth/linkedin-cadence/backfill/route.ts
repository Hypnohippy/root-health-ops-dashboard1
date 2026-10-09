import { withTenantRoute } from "@/lib/tenantRoute.server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLinkedInCadenceReport } from "@/lib/linkedinCadenceReport.server";
export const GET=withTenantRoute(async (_req,tenant)=> {
 const report=await readLinkedInCadenceReport(tenant.organisationId);
 const {projected,repairs,...summary}=report; void projected;
 return NextResponse.json({...summary,rowsNeedingBackfill:repairs.length},{headers:{"Cache-Control":"private, no-store"}});
},{write:false});
export const POST=withTenantRoute(async (req,tenant)=> {
 const body=await req.json(); if(body.confirm!=="apply_evidence_only_backfill") return NextResponse.json({error:"Explicit backfill confirmation required."},{status:400});
 const report=await readLinkedInCadenceReport(tenant.organisationId);
 const result=await supabaseAdmin.rpc("backfill_linkedin_cadence",{p_organisation_id:tenant.organisationId,p_expected_revision:report.revision,p_repairs:report.repairs});
 if(result.error) return NextResponse.json({error:"Backfill not confirmed. Refresh dry run before retrying."},{status:409});
 return NextResponse.json({applied:result.data?.applied,counts:report.counts,excluded:report.excluded});
},{write:true});
