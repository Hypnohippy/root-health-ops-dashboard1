/** External send evidence is independent of the Ops confirmation clock. */
export const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const nonempty = (v: unknown) => typeof v === "string" && !!v.trim();
export function validSendReceipt(value: unknown) {
  const r = record(value);
  return [r.key, r.actor, r.evidence, r.message].every(nonempty);
}
export function externalSentAt(value: unknown, now = Date.now()): string | null {
  const r = record(value);
  if (!validSendReceipt(r) || r.historical_send_date_status !== "verified" || !nonempty(r.sent_at)) return null;
  const at = Date.parse(String(r.sent_at));
  const confirmed = Date.parse(String(r.confirmed_at || r.completed_at));
  return Number.isFinite(confirmed) && confirmed <= now && Number.isFinite(at) && at <= confirmed && at <= now ? String(r.sent_at) : null;
}
export function sendReceipts(value: unknown) {
  const r = record(value);
  return [...(Array.isArray(r.history) ? r.history.map(record) : []), r].filter(validSendReceipt);
}
export function firstSendEvidence(value: unknown, now = Date.now()) {
  const receipts = sendReceipts(value);
  if (record(value).historical_send_date_status === "unknown") return { receipt: receipts.at(-1), sentAt: null, status: "unknown" };
  // A correction supersedes the original confirmation; never resurrect its timestamp.
  const corrections = receipts.filter(r => r.correction_type === "first_send_classification");
  const first = corrections.at(-1) || receipts.find(r => r.stage === "connection") || receipts.find(r => !r.stage);
  if (!first && receipts.length) return { receipt: receipts[0], sentAt: null, status: "unverified" };
  return { receipt: first, sentAt: externalSentAt(first, now), status: first?.historical_send_date_status === "unknown" ? "unknown" : externalSentAt(first, now) ? "verified" : receipts.length ? "unverified" : "none" };
}
export type SendChoice = "now" | "today" | "historical" | "unknown" | "conversation";
export function validateSendInput(body: Record<string, unknown>, now = Date.now()) {
  if (body.confirmed !== true || !nonempty(body.message) || String(body.message).length > 50000 || !/^[0-9a-f-]{36}$/i.test(String(body.key || ""))) throw Error("Confirm the exact LinkedIn message and send details.");
  const choice = body.sendChoice as SendChoice;
  if (!["now", "today", "historical", "unknown", "conversation"].includes(choice)) throw Error("Choose how this message was sent.");
  const conversation = choice === "conversation";
  if (conversation && typeof body.dateKnown !== "boolean") throw Error("Confirm whether the earliest outbound send date is known.");
  const unknown = choice === "unknown" || conversation && body.dateKnown === false;
  if (conversation && !unknown && body.earliestOutboundConfirmed !== true) throw Error("Explicitly confirm the earliest outbound send date from LinkedIn history.");
  const confirmedAt = new Date(now).toISOString();
  let sentAt: string | null = null;
  if (choice === "now") {
    const at = body.completedAt === undefined ? now : Date.parse(String(body.completedAt));
    if (!Number.isFinite(at) || at > now) throw Error("The send time must be valid and cannot be in the future.");
    sentAt = new Date(at).toISOString();
  }
  else if (!unknown) {
    if (!nonempty(body.sentAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(String(body.sentAt)) || !nonempty(body.timezone)) throw Error("Provide the actual LinkedIn send date and timezone.");
    try { new Intl.DateTimeFormat("en", { timeZone: String(body.timezone) }).format(); } catch { throw Error("Choose a valid timezone."); }
    const at = Date.parse(String(body.sentAt));
    if (!Number.isFinite(at) || at > now) throw Error("The actual send date must be valid and cannot be in the future.");
    sentAt = new Date(at).toISOString();
  }
  return { sentAt, confirmedAt, message: String(body.message), choice, timezone: choice === "now" ? "UTC" : String(body.timezone || ""), contentKind: conversation ? "conversation_history_pasted" : "single_outbound_message", earliestOutboundConfirmed: conversation && !unknown, precision: unknown ? "unknown" : body.timeKnown === false ? "date" : "time", status: unknown ? "unknown" : "verified", source: choice === "now" ? "Manually confirmed LinkedIn send" : "Manually reconciled from LinkedIn history" };
}
/** Date-only evidence uses the start of the selected local day, explicitly labelled date precision. */
export function localSendDate(date: string, time: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time || "00:00")) throw Error("Enter a valid date and time.");
  const local = `${date}T${time || "00:00"}:00`;
  const desired = Date.parse(local + "Z");
  const formatter = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let guess = desired;
  for (let i = 0; i < 3; i++) guess += desired - Date.parse(formatter.format(new Date(guess)).replace(" ", "T") + "Z");
  if (formatter.format(new Date(guess)).replace(" ", "T") !== local) throw Error("That local time does not exist in this timezone. Check the date/time.");
  return new Date(guess).toISOString();
}

export function cadenceEvidence(row: object,now=Date.now()) {
 const fields=record(row);
 const original=firstSendEvidence(fields.manual_completion,now);
 if(original.status==="verified")return original;
 const anchor=firstSendEvidence(fields.linkedin_cadence_anchor,now);
 return anchor.status==="verified"?anchor:original;
}
