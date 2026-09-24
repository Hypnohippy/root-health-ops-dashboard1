import { timingSafeEqual } from "node:crypto";

export const recordTypes = ["b2b_lead", "personal_opportunity", "partner_opportunity", "social_opportunity"] as const;
export const ingestionStatuses = ["new", "reviewing", "accepted", "dismissed"] as const;
export const statuses = ["new", "reviewing", "accepted", "actioned", "engaged", "converted", "nurture", "lost", "dismissed"] as const;
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class IngestionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Credential = { organisation_id: string; secret: string; source_engines: string[] };
export function authorizeIngestion(header: string | null, organisationId: string, engines: string[]) {
  let keys: Credential[];
  try {
    keys = JSON.parse(process.env.GROWTH_INGESTION_KEYS || "[]");
    if (!Array.isArray(keys) || !keys.length || keys.some(k => !uuid.test(k.organisation_id) || typeof k.secret !== "string" || k.secret.length < 32 || !Array.isArray(k.source_engines) || !k.source_engines.length || k.source_engines.some(e => typeof e !== "string"))) throw Error();
  } catch { throw new IngestionError("Ingestion is not configured.", 503); }
  const supplied = Buffer.from(header?.startsWith("Bearer ") ? header.slice(7) : "");
  const key = keys.find(k => {
    const expected = Buffer.from(k.secret);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied) && k.organisation_id.toLowerCase() === organisationId;
  });
  if (!key || engines.some(e => !key.source_engines.includes(e))) throw new IngestionError("Invalid ingestion credentials or scope.", 403);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IngestionError("Expected an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new IngestionError(`Invalid ${field}.`);
  return value.trim() || null;
}
export function parseIngestion(value: unknown) {
  const body = object(value);
  if (typeof body.organisation_id !== "string" || !uuid.test(body.organisation_id)) throw new IngestionError("Explicit organisation_id is required.");
  const organisationId = body.organisation_id.toLowerCase();
  if (!Array.isArray(body.records) || !body.records.length || body.records.length > 100) throw new IngestionError("Supply 1–100 records.");
  const records = body.records.map(value => {
    const r = object(value);
    if (r.organisation_id !== undefined) throw new IngestionError("Use the batch organisation_id only.");
    if (!recordTypes.includes(r.record_type as typeof recordTypes[number])) throw new IngestionError("Invalid record_type.");
    const status = r.status ?? "new";
    if (!ingestionStatuses.includes(status as typeof ingestionStatuses[number])) throw new IngestionError("Invalid status.");
    const sourceUrl = text(r.source_url, "source_url", 2048);
    if (sourceUrl) {
      try { const url = new URL(sourceUrl); if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error(); }
      catch { throw new IngestionError("source_url must be an HTTP(S) URL without credentials."); }
    }
    const metadata = r.metadata === undefined ? {} : object(r.metadata);
    if (JSON.stringify(metadata).length > 16000) throw new IngestionError("metadata is too large.");
    return {
      organisation_id: organisationId,
      source_engine: text(r.source_engine, "source_engine", 100, true)!,
      source_record_id: text(r.source_record_id, "source_record_id", 250, true)!,
      record_type: r.record_type as string, source_url: sourceUrl,
      evidence: text(r.evidence, "evidence", 8000),
      entity: text(r.entity, "entity", 500), person: text(r.person, "person", 500), company: text(r.company, "company", 500),
      reason: text(r.reason, "reason", 4000), signal: text(r.signal, "signal", 4000),
      suggested_action: text(r.suggested_action, "suggested_action", 4000), status: status as string, metadata,
    };
  });
  return { organisationId, records };
}
export async function readIngestionBody(req: Request) {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new IngestionError("Use application/json.", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new IngestionError("Missing body.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 262144) { await reader.cancel(); throw new IngestionError("Payload too large.", 413); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) { if (error instanceof IngestionError) throw error; throw new IngestionError("Invalid JSON."); }
  finally { reader.releaseLock(); }
}
