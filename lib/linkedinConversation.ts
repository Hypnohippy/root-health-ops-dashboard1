export const LINKEDIN_CONVERSATION_SOURCE = "manually reconciled from LinkedIn conversation";
export function validateConversationMessage(body: Record<string, unknown>, now = Date.now()) {
 if (!/^[0-9a-f-]{36}$/i.test(String(body.key || "")) || !["inbound", "outbound"].includes(String(body.direction)) || typeof body.message !== "string" || !body.message.trim() || body.message.length > 50000 || body.confirmed !== true || typeof body.dateKnown !== "boolean") throw Error("Confirm the direction, exact message and whether its actual date is known.");
 let messageAt: string | null = null;
 if (body.dateKnown) {
  if (typeof body.messageAt !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(body.messageAt) || typeof body.timezone !== "string") throw Error("Provide the actual message date and timezone.");
  try {new Intl.DateTimeFormat("en", {timeZone: body.timezone}).format();} catch {throw Error("Invalid timezone.");}
  const at=Date.parse(body.messageAt); if (!Number.isFinite(at) || at>now) throw Error("Message date must be valid and not in the future.");
  messageAt=new Date(at).toISOString();
 }
 return { direction: String(body.direction), message: body.message, messageAt, dateStatus: messageAt ? "verified" : "unknown", timezone: messageAt ? String(body.timezone) : null, precision: messageAt ? body.timeKnown === false ? "date" : "time" : "unknown", source: LINKEDIN_CONVERSATION_SOURCE };
}
export function chronologicalMessages(rows: Record<string, unknown>[]) {
 // Unknown dates have their own audit section; confirmation time never pretends to be external time.
 const sort = (a: Record<string,unknown>, b: Record<string,unknown>) => String(a.message_at || a.confirmed_at).localeCompare(String(b.message_at || b.confirmed_at)) || String(a.id).localeCompare(String(b.id));
 return { dated: rows.filter(r=>r.message_at).sort(sort), undated: rows.filter(r=>!r.message_at).sort(sort) };
}

export function validateConversationHistory(body: Record<string,unknown>,now=Date.now()) {
 if(!/^[0-9a-f-]{36}$/i.test(String(body.key||""))||typeof body.message!=="string"||!body.message.trim()||body.message.length>500000||typeof body.containsInboundReply!=="boolean")throw Error("Paste the full conversation and confirm whether it contains an inbound reply.");
 let earliestOutboundAt:string|null=null;
 if(body.earliestOutboundAt){
  if(body.earliestOutboundConfirmed!==true)throw Error("Explicitly confirm the earliest outbound date.");
  const details=validateConversationMessage({...body,direction:"outbound",dateKnown:true,messageAt:body.earliestOutboundAt,confirmed:true,message:"Date confirmation"},now);
  earliestOutboundAt=details.messageAt;
 }
 return {message:body.message,containsInboundReply:body.containsInboundReply,earliestOutboundAt,timezone:earliestOutboundAt?String(body.timezone):null,precision:earliestOutboundAt?body.timeKnown===false?"date":"time":"unknown",source:LINKEDIN_CONVERSATION_SOURCE};
}
