import { supabaseAdmin } from "@/lib/supabaseAdmin";
/** Every page is tenant scoped; no first-page cap or silent partial results. */
export async function readTenantHistory(table: string, org: string, select="*") {
 const rows: Record<string,unknown>[]=[];
 for(let offset=0;;offset+=500) {const {data,error}=await supabaseAdmin.from(table).select(select).eq("organisation_id",org).order("id").range(offset,offset+499);if(error)throw error;rows.push(...((data || []) as unknown as Record<string,unknown>[]));if(!data || data.length<500)return rows;}
}
