import {NextResponse} from 'next/server';
import {withTenantRoute} from '@/lib/tenantRoute.server';
import {mutateDiaryEntry} from '@/lib/diaryEntries.server';
const mutate=withTenantRoute(async(req,tenant)=>NextResponse.json(await mutateDiaryEntry(tenant,req.method,await req.json())),{write:true});
export const POST=mutate,PATCH=mutate,DELETE=mutate;
