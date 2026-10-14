import { supabaseAdmin } from "@/lib/supabaseAdmin";
/** Every page is tenant scoped; callers supply a unique deterministic order for composite-key tables. */
export async function readTenantHistory(table: string, org: string, select="*", order:readonly string[]=["id"]) {
 if(!order.length||order.some(column=>!/^[a-z_][a-z0-9_]*$/i.test(column)))throw Error("A deterministic history ordering is required.");
 const rows: Record<string,unknown>[]=[];
 for(let offset=0;;offset+=500) {
  let query=supabaseAdmin.from(table).select(select).eq("organisation_id",org);
  for(const column of order)query=query.order(column);
  const {data,error}=await query.range(offset,offset+499);if(error)throw error;
  rows.push(...((data || []) as unknown as Record<string,unknown>[]));if(!data || data.length<500)return rows;
 }
}
