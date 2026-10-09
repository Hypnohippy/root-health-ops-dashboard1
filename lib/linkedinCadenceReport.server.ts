import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { readLifecycleInput } from "@/lib/lifecycleSnapshot.server";
import { planLinkedInCadenceBackfill } from "@/lib/linkedinCadenceBackfill";
async function revision(org:string) {const {data,error}=await supabaseAdmin.from("lifecycle_revisions").select("revision").eq("organisation_id",org).maybeSingle();if(error) throw error;return String(data?.revision || 0);}
export async function readLinkedInCadenceReport(org:string) {
 for(let attempt=0;attempt<3;attempt++) {const before=await revision(org),input=await readLifecycleInput(org,false);if(before===await revision(org)) return {...planLinkedInCadenceBackfill(org,input),revision:before};}
 throw Error("Lifecycle changed during dry run. Retry to obtain consistent counts.");
}
