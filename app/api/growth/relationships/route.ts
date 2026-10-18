import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { relationshipContext } from "@/lib/relationshipWorkspace.server";
import { listPrimaryRelationships } from "@/lib/relationshipDiscovery.server";
export const GET=withTenantRoute(async(req,tenant)=>{const p=new URL(req.url).searchParams;return NextResponse.json(await listPrimaryRelationships(await relationshipContext(tenant),p.get("q"),p.get("view")||"active",Number(p.get("page")||0)),{headers:{"Cache-Control":"private, no-store"}});},{write:false});
