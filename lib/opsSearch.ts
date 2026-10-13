export const searchFields = ["person_name","person","company","entity","author_name","author_handle","target_name","role_title","email","sender_email","recipient_email","linkedin_identity","linkedin_url","source_engine","source_record_id","source_url","evidence","reason","signal","suggested_action","text","post_text","linkedin_recorded_reply_text","email_subject","platform","notes","name","domain","website","lane","geography","discovery_context","research_snapshot","research_versions","sources","contacts","draft_subject","draft_body"] as const;
export function searchQuery(value: unknown) { const q=typeof value==="string" ? value.trim().normalize("NFKC").toLowerCase() : ""; if(q.length>200) throw Error("Search must be 200 characters or fewer."); return q; }
export function matchesSearch(row: Record<string,unknown>, query: string, extra="") {
 if(!query)return true;
 const meta=(row.metadata || {}) as Record<string,unknown>;
 const values=[...searchFields.map(key=>row[key]),...["email","linkedin_url","profile_url","headline","buyer_role","public_contact_route","founder_intelligence"].map(key=>meta[key]),extra];
 const hay=values.map(value=>typeof value==="string" ? value : value ? JSON.stringify(value) : "").join(" ").normalize("NFKC").toLowerCase();
 return query.split(/\s+/).every(term=>hay.includes(term));
}
