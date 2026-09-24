import { timingSafeEqual } from "node:crypto";

type EngineEndpoint = { organisation_id: string; source_engine: string; url: string; secret: string };
export type ApprovedEmailInstruction = {
  organisation_id: string; response_item_id: string; send_request_id: string;
  source_engine: string; gmail_thread_id: string | null; gmail_message_id: string | null;
  in_reply_to: string | null; recipient: string; subject: string; approved_body: string;
  idempotency_key: string;
};

function endpoints(): EngineEndpoint[] {
  let value: unknown;
  try { value = JSON.parse(process.env.B2B_ENGINE_ENDPOINTS || "[]"); } catch { throw new Error("B2B engine dispatch is not configured."); }
  if (!Array.isArray(value)) throw new Error("B2B engine dispatch is not configured.");
  return value.filter((entry): entry is EngineEndpoint => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.organisation_id !== "string" || typeof e.source_engine !== "string" || typeof e.url !== "string" || typeof e.secret !== "string" || e.secret.length < 32) return false;
    try { return new URL(e.url).protocol === "https:"; } catch { return false; }
  });
}

export function engineEndpoint(organisationId: string, sourceEngine: string) {
  const endpoint = endpoints().find(e => e.organisation_id.toLowerCase() === organisationId.toLowerCase() && e.source_engine === sourceEngine);
  if (!endpoint) throw new Error("B2B engine dispatch is not configured for this organisation and source.");
  return endpoint;
}

export async function dispatchApprovedEmail(instruction: ApprovedEmailInstruction) {
  const endpoint = engineEndpoint(instruction.organisation_id, instruction.source_engine);
  const response = await fetch(endpoint.url, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${endpoint.secret}` },
    body: JSON.stringify({ ...instruction, engine_secret: endpoint.secret }), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || data.accepted !== true) throw new Error("The B2B engine did not accept the approved email.");
  const returned = typeof data.idempotency_key === "string" ? Buffer.from(data.idempotency_key) : Buffer.alloc(0);
  const expected = Buffer.from(instruction.idempotency_key);
  if (returned.length && (returned.length !== expected.length || !timingSafeEqual(returned, expected))) throw new Error("The B2B engine returned an invalid acknowledgement.");
  return data;
}
