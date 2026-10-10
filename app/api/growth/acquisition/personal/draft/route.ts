import { NextResponse } from "next/server";
import { withTenantRoute } from "@/lib/tenantRoute.server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { personalSignal } from "@/lib/personalSignal";
import { publicReplyRules, safePublicDraft } from "@/lib/socialCommentOpportunity";
import { uuid } from "@/lib/growthIngestion.server";

export const POST = withTenantRoute(async (req, tenant) => {
  const body = await req.json();
  if (!uuid.test(body.itemId || "")) return NextResponse.json({ error: "Invalid opportunity." }, { status: 400 });
  const read = async () => {
    const { data, error } = await supabaseAdmin.from("acquisition_items").select("*").eq("organisation_id", tenant.organisationId).eq("id", body.itemId).maybeSingle();
    if (error) throw error; return data;
  };
  const item = await read(), signal = item && personalSignal(item);
  if (!signal || !["new", "reviewing", "accepted"].includes(item.status) || item.metadata?.test === true) return NextResponse.json({ error: "This opportunity cannot prepare a public response." }, { status: 409 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Response generation is unavailable. You can still type a response." }, { status: 503 });
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(25000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: "gpt-4.1-mini", messages: [...tenant.messages, { role: "system", content: publicReplyRules }, { role: "user", content: JSON.stringify({ original: signal.original, context: signal.context }) }], max_tokens: 600 }) });
  if (!response.ok) return NextResponse.json({ error: "Response generation failed. Your text has been retained." }, { status: 503 });
  const result = await response.json(), draft = result.choices?.[0]?.message?.content;
  if (typeof draft !== "string" || !safePublicDraft(draft)) return NextResponse.json({ error: "No safe response returned. Review or type your own response." }, { status: 503 });
  if (JSON.stringify(await read()) !== JSON.stringify(item)) return NextResponse.json({ error: "The opportunity changed. Refresh before continuing." }, { status: 409 });
  return NextResponse.json({ draft });
}, { generation: true, write: true });
