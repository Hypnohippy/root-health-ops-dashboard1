import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { AccessError, requireOrganisation } from "@/lib/tenantAuth";

const TTL = 10 * 60 * 1000;
function secret() {
  const value = process.env.OAUTH_STATE_SECRET?.trim();
  if (!value || value.length < 32) throw new AccessError("OAUTH_STATE_SECRET must contain at least 32 characters.", 503);
  return value;
}
function signature(body: string) {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}
function cookieName(provider: string) { return `oauth_${provider}_nonce`; }

export async function createOAuthState(provider: string, requested?: unknown) {
  const { organisationId, userId } = await requireOrganisation(requested);
  const nonce = randomBytes(32).toString("base64url");
  const body = Buffer.from(JSON.stringify({ provider, organisationId, userId, nonce, issuedAt: Date.now() })).toString("base64url");
  const state = `${body}.${signature(body)}`;
  (await cookies()).set(cookieName(provider), nonce, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: TTL / 1000,
  });
  return state;
}

export async function consumeOAuthState(provider: string, raw: string | null) {
  const parts = (raw || "").split(".");
  if (parts.length !== 2) throw new AccessError("Invalid OAuth state.");
  const expected = Buffer.from(signature(parts[0]));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new AccessError("Invalid OAuth state.");
  let state;
  try { state = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new AccessError("Invalid OAuth state."); }
  const jar = await cookies();
  if (state.provider !== provider || typeof state.issuedAt !== "number" ||
      Date.now() - state.issuedAt > TTL || state.issuedAt > Date.now() ||
      !state.nonce || jar.get(cookieName(provider))?.value !== state.nonce ||
      typeof state.organisationId !== "string" || !state.organisationId) {
    throw new AccessError("OAuth state expired or does not match this browser.");
  }
  jar.delete(cookieName(provider));
  const membership = await requireOrganisation(state.organisationId);
  if (membership.userId !== state.userId) throw new AccessError("OAuth user changed. Please reconnect.");
  return membership;
}
