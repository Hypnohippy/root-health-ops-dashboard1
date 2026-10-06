import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { readPartnerConversation } from "@/lib/partnerConversation.server";
import { partnerReplyInstructions } from "@/lib/partnerConversation";
import { uuid } from "@/lib/growthIngestion.server";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
export const GET = withTenantRoute(async (req, tenant) => {
  const id = new URL(req.url).searchParams.get("itemId") || "";
  if (!uuid.test(id)) return json({ error: "Invalid partner." }, 400);
  return json(await readPartnerConversation(tenant.organisationId, id));
}, { generation: false, write: false });

export const POST = withTenantRoute(async (req, tenant) => {
  const body = await req.json();
  if (!uuid.test(body.itemId || "")) return json({ error: "Invalid partner." }, 400);
  const conversation = await readPartnerConversation(tenant.organisationId, body.itemId);
  if (!conversation.canGenerate) return json({ error: conversation.reason }, 409);
  if (JSON.stringify(conversation.context).length > 120000) return json({ error: "This conversation is too large for a safe draft. Review it in Responses." }, 409);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "AI drafting is not configured." }, 503);
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "gpt-4.1-mini", messages: [...tenant.messages, { role: "system", content: partnerReplyInstructions }, { role: "user", content: JSON.stringify(conversation.context) }], response_format: { type: "json_object" }, max_tokens: 1800, temperature: 0.4 }) });
  if (!response.ok) return json({ error: "Unable to generate a partner reply." }, 503);
  const result = await response.json();
  let draft;
  try { draft = JSON.parse(result.choices?.[0]?.message?.content || ""); } catch { return json({ error: "No valid draft returned." }, 503); }
  if (typeof draft.summary !== "string" || typeof draft.draft !== "string" || !draft.summary.trim() || !draft.draft.trim() || draft.summary.length > 12000 || draft.draft.length > 20000) return json({ error: "No valid draft returned." }, 503);
  const latest = await readPartnerConversation(tenant.organisationId, body.itemId);
  if (JSON.stringify(latest) !== JSON.stringify(conversation)) return json({ error: "Conversation changed. Refresh before generating again." }, 409);
  return json({ summary: draft.summary, draft: draft.draft, responseId: conversation.responseId });
}, { generation: true, write: true });
