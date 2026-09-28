import type { ConnectionHealth } from "@/lib/connectionUi";
export function connectionUrl(path: string, organisationId: string | null) {
  return organisationId ? `${path}${path.includes("?") ? "&" : "?"}organisationId=${encodeURIComponent(organisationId)}` : path;
}
async function request(url: string, options: RequestInit = {}) {
  const response = await fetch(url, { ...options, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false || !body) throw new Error(body?.error || "Unable to update the connection. Please try again.");
  return body;
}
export async function fetchConnectionHealth(organisationId: string | null): Promise<{ connections: ConnectionHealth[]; checkedAt: string | null }> {
  const body = await request(connectionUrl("/api/social/connection-health", organisationId));
  if (!Array.isArray(body.connections)) throw new Error("The connection check returned incomplete information. Please try again.");
  return { connections: body.connections, checkedAt: body.checkedAt || null };
}
export async function disconnectConnection(platform: string, organisationId: string | null) {
  await request(connectionUrl("/api/social-accounts", organisationId), {
    method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }),
  });
}
