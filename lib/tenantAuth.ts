import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export class AccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

// Match the connection-management roles already used by /api/social-accounts.
export function isWriteRole(role: unknown) {
  return ["owner", "admin", "manager"].includes(String(role || "").toLowerCase());
}

export async function requireOrganisation(requested?: unknown, write = true) {
  const userId = await getCurrentUserId();
  if (!userId) throw new AccessError("Not signed in.", 401);
  const id = typeof requested === "string" ? requested.trim() : "";
  let query = supabaseAdmin.from("organisation_members")
    .select("organisation_id, role").eq("user_id", userId);
  if (id) query = query.eq("organisation_id", id);
  const { data, error } = await query.limit(2);
  if (error) throw new AccessError("Unable to verify organisation membership.", 503);
  if (!data?.length) throw new AccessError("Not a member of this organisation.");
  if (data.length !== 1) throw new AccessError("Select an organisation explicitly.", 400);
  if (write && !isWriteRole(data[0].role)) throw new AccessError("Insufficient organisation role.");
  return { organisationId: String(data[0].organisation_id), userId };
}

export function accessErrorResponse(error: unknown) {
  return error instanceof AccessError
    ? NextResponse.json({ success: false, error: error.message }, { status: error.status })
    : null;
}

export function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// Only the dispatcher and its publishing delegates may use service authorization.
export async function requirePublishingOrganisation(req: Request, requested: unknown) {
  if (isCronAuthorized(req)) {
    if (typeof requested !== "string" || !requested.trim()) {
      throw new AccessError("Service publishing requires an explicit organisation.", 400);
    }
    return { organisationId: requested.trim(), userId: null };
  }
  return requireOrganisation(requested);
}

export function publishingHeaders(req: Request) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isCronAuthorized(req)) headers.Authorization = req.headers.get("authorization")!;
  else if (req.headers.get("cookie")) headers.Cookie = req.headers.get("cookie")!;
  return headers;
}

export async function requireLegacyFacebookOrganisation() {
  const id = process.env.LEGACY_FACEBOOK_ORGANISATION_ID?.trim();
  if (!id) throw new AccessError("Legacy Facebook webhook requires an explicit owning organisation.", 503);
  return requireOrganisation(id);
}

export async function requireOwnedRecord(table: "growth_experiments" | "campaigns" | "sequences", id: string | null | undefined, organisationId: string) {
  if (!id) return;
  const { data, error } = await supabaseAdmin.from(table).select("id")
    .eq("id", id).eq("organisation_id", organisationId).maybeSingle();
  if (error || !data) throw new AccessError("Related record does not belong to this organisation.");
}
