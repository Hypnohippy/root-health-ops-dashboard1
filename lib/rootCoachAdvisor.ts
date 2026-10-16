export const advisorIntents = ["assess_reply", "summarise_relationship", "identify_commitments", "recommend_next_step", "draft_response"] as const;
export type AdvisorIntent = typeof advisorIntents[number];
export type AdvisorRequest = { organisationId: string; relationshipLocator: string; intent: AdvisorIntent; question: string; checkLatestEmail: boolean; selectedThreadId?: string };
export type AdvisorEvidence = { id: string; origin: "ops_stored" | "live_gmail"; kind: string; channel: string; text: string; at: string | null; recordedAt: string | null; source: string; direction?: string; gmailMessageId?: string; gmailThreadId?: string; truncated?: boolean };
export type AdvisorPacket = { organisationId: string; locator: string; name: string; stage: string; nextAction: string | null; canDraft: boolean; evidence: AdvisorEvidence[]; limitations: string[]; asOf: string };
export type AdvisorClaim = { text: string; evidenceIds: string[] };
export type AdvisorAnswer = { mode: "advisor"; relationshipLocator: string; facts: AdvisorClaim[]; interpretations: AdvisorClaim[]; recommendations: AdvisorClaim[]; commitments: AdvisorClaim[]; draft: string | null; limitations: string[]; evidence: AdvisorEvidence[]; asOf: string };
export function advisorRequest(body: Record<string, unknown>): AdvisorRequest {
  const allowed = ["organisationId", "relationshipLocator", "intent", "question", "checkLatestEmail", "selectedThreadId"];
  if (Object.keys(body).some(k => !allowed.includes(k))) throw Error("Advice accepts a relationship and question, not supplied conversation or identity data.");
  if (typeof body.organisationId !== "string" || typeof body.relationshipLocator !== "string" || !/^(inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36}$/i.test(body.relationshipLocator)) throw Error("Open an existing relationship first.");
  if (!advisorIntents.includes(body.intent as AdvisorIntent) || typeof body.question !== "string" || !body.question.trim() || body.question.length > 1000) throw Error("Choose an advice type and a question of up to 1,000 characters.");
  if (body.checkLatestEmail !== undefined && typeof body.checkLatestEmail !== "boolean") throw Error("Confirm whether to check current email.");
  if (body.selectedThreadId !== undefined && (typeof body.selectedThreadId !== "string" || !/^[a-f0-9]{1,64}$/i.test(body.selectedThreadId) || body.checkLatestEmail !== true)) throw Error("Choose a valid email thread for an explicit mailbox check.");
  return { organisationId: body.organisationId, relationshipLocator: body.relationshipLocator, intent: body.intent as AdvisorIntent, question: body.question.trim(), checkLatestEmail: body.checkLatestEmail === true, ...(body.selectedThreadId ? { selectedThreadId: String(body.selectedThreadId) } : {}) };
}
export function boundAdvisorEvidence(items: AdvisorEvidence[], maxEntries = 80, maxChars = 48000) {
  const result: AdvisorEvidence[] = [], seen = new Set<string>(); let remaining = maxChars, partial = false;
  const ordered = [...items].sort((a, b) => String(b.at || b.recordedAt || "").localeCompare(String(a.at || a.recordedAt || "")));
  for (const item of ordered) {
    if (seen.has(item.id)) continue; seen.add(item.id);
    if (result.length >= maxEntries || remaining <= 0) { partial = true; continue; }
    const text = item.text.slice(0, Math.min(12000, remaining)); remaining -= text.length;
    const truncated = text.length !== item.text.length; partial ||= truncated;
    result.push({ ...item, text, ...(truncated ? { truncated: true } : {}) });
  }
  return { evidence: result, partial };
}
export function validateAdvisorAnswer(value: unknown, packet: AdvisorPacket): AdvisorAnswer {
  if (!value || typeof value !== "object") throw Error("Advice could not be verified. Open the source evidence.");
  const raw = value as Record<string, unknown>, ids = new Set(packet.evidence.map(e => e.id));
  const claims = (key: string): AdvisorClaim[] => {
    if (!Array.isArray(raw[key]) || raw[key].length > 10) throw Error("Invalid advice structure.");
    return raw[key].map((v: unknown) => {
      if (!v || typeof v !== "object") throw Error("Invalid advice evidence.");
      const claim = v as Record<string, unknown>;
      if (typeof claim.text !== "string" || !claim.text.trim() || claim.text.length > 3000 || !Array.isArray(claim.evidenceIds) || !claim.evidenceIds.length || claim.evidenceIds.some(id => typeof id !== "string" || !ids.has(id))) throw Error("Advice cited unavailable evidence.");
      return { text: claim.text, evidenceIds: claim.evidenceIds as string[] };
    });
  };
  if (raw.draft != null && (typeof raw.draft !== "string" || raw.draft.length > 6000)) throw Error("Invalid draft.");
  const limitations = Array.isArray(raw.limitations) ? raw.limitations.filter((v): v is string => typeof v === "string" && v.length <= 1000).slice(0, 10) : [];
  const cited = (claim: AdvisorClaim) => packet.evidence.filter(e => claim.evidenceIds.includes(e.id));
  let withheldDate = false;
  const facts = claims("facts").filter(claim => {
    const dates = claim.text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
    const supported = dates.every(date => cited(claim).some(e => e.at?.slice(0, 10) === date || e.text.includes(date)));
    if (!supported) withheldDate = true;
    return supported;
  }).map(claim => {
    const evidence = cited(claim);
    const prefix = evidence.every(e => e.direction === "snapshot" && !e.at) ? "Undated stored snapshot: " : evidence.some(e => /^Manually recorded /i.test(e.kind)) ? "Manual record: " : "";
    return { ...claim, text: prefix + claim.text };
  });
  if (withheldDate) limitations.push("A dated factual claim was withheld because its cited evidence did not establish that date. Recording time is not message time.");
  return { mode: "advisor", relationshipLocator: packet.locator, facts, interpretations: claims("interpretations"), recommendations: claims("recommendations"), commitments: claims("commitments"), draft: packet.canDraft ? (raw.draft as string | null) || null : null, limitations: [...new Set([...packet.limitations, ...limitations])], evidence: packet.evidence, asOf: packet.asOf };
}
