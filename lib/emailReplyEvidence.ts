type Row = Record<string, unknown>;
const at = (v: unknown) => typeof v === "string" ? Date.parse(v) : NaN;
/** Stored individual messages only. Quoted text never establishes an outbound. */
export function verifiedExternalReply(item: Row, messages: Row[], now = Date.now()) {
 const thread=item.email_thread_id || item.email_sent_thread_id;
 const scoped=messages.filter(m=>m.organisation_id===item.organisation_id && m.gmail_thread_id===thread && ["gmail_engine","ops"].includes(String(m.source)) && m.gmail_message_id && Number.isFinite(at(m.sent_at)) && at(m.sent_at)<=now);
 const inbound=scoped.find(m=>m.direction==="inbound" && m.gmail_message_id===item.email_message_id);
 if(!inbound)return null;
 const latestInbound=Math.max(at(inbound.sent_at),...scoped.filter(m=>m.direction==="inbound").map(m=>at(m.sent_at)));
 const sender=String(item.sender_email||"").trim().toLowerCase();
 if(!sender || !sender.includes("@"))return null;
 return scoped.filter(m=>m.direction==="outbound" && at(m.sent_at)>latestInbound && typeof m.body==="string" && m.body.trim() && String(m.recipient_email||"").toLowerCase().split(/[;,]/).some(part=>part.trim()===sender || part.match(/<([^<>]+)>/)?.[1]===sender)).sort((a,b)=>at(b.sent_at)-at(a.sent_at))[0] || null;
}
