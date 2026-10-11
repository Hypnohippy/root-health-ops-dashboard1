import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request, type RequestOptions } from "node:https";
import { createHash } from "node:crypto";
import type { PersonalSignalItem } from "@/lib/personalSignal";
import { personalRedditSource } from "@/lib/personalOpportunityPolicy";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";

export type PersonalSourceHealth = { accessibility: "accessible" | "unavailable"; evidence: "verified" | "unverified"; checkedAt: string; message: string };
type Address = { address: string; family: number };
type Reply = { status: number; location?: string; body: string };
export function publicSourceAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(address === "168.63.129.16" || a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2 || b === 88) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  // Only global-unicast IPv6; exclude transition, documentation and special use.
  const subnet = Number.parseInt(address.split(":")[1] || "", 16);
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2002:|^3fff:/i.test(address) && !(/^2001:/i.test(address) && (subnet <= 0x1ff || subnet === 0xdb8));
}
export function safePersonalSourceUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port || host === "localhost" || !host.includes(".") && !isIP(host) || /(?:^|\.)(?:local|internal|localhost)$/.test(host) || /vertex|grounding|googleusercontent/i.test(host) || isIP(host) && !publicSourceAddress(host)) throw Error("Unsafe or unresolved source.");
  return url;
}
async function resolveSource(host: string): Promise<Address[]> {
  return lookup(host.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
}
/** Pin the already validated DNS address to the TLS request. No second lookup,
 * credentials, cookies, automatic redirects or unlimited response buffering. */
async function getSource(url: URL, address: Address): Promise<Reply> {
  return new Promise((resolve, reject) => {
    // Node supports autoSelectFamily through net.connect; older HTTPS type
    // declarations omit it. Keep the single prevalidated address pinned.
    const options: RequestOptions & { autoSelectFamily: boolean } = { method: "GET", autoSelectFamily: false, headers: { "User-Agent": "RootOps-SourceCheck/1.0", "Accept-Encoding": "identity" }, lookup: (_host, _options, cb) => cb(null, address.address, address.family) };
    const req = request(url, options, res => {
      let bytes = 0; const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 262144) { req.destroy(Error("Source response limit.")); return; } chunks.push(chunk); });
      res.on("end", () => resolve({ status: res.statusCode || 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(Error("Source timeout.")), 2500);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
}
const normalise = (text: string) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export async function inspectPersonalSource(item: PersonalSignalItem, deps = { resolve: resolveSource, get: getSource }): Promise<PersonalSourceHealth> {
  const checkedAt = new Date().toISOString();
  const unavailable: PersonalSourceHealth = { accessibility: "unavailable", evidence: "unverified", checkedAt, message: "Source unavailable — research again" };
  if (item.source_engine !== "root_health_personal" || personalRedditSource(item)) return unavailable;
  try {
    let url = safePersonalSourceUrl(item.source_url || ""); const original = url;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = await Promise.race([deps.resolve(url.hostname), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(Error("DNS timeout.")), 1500); timer.unref?.(); })]);
      if (!addresses.length || addresses.some(a => !publicSourceAddress(a.address))) return unavailable;
      const reply = await deps.get(url, addresses[0]);
      if ([301, 302, 303, 307, 308].includes(reply.status)) {
        if (!reply.location || redirects === 3) return unavailable;
        url = safePersonalSourceUrl(new URL(reply.location, url).href);
        // A redirect to an unrelated site or homepage cannot replace evidence.
        if (url.hostname.replace(/^www\./, "") !== original.hostname.replace(/^www\./, "") || url.pathname === "/" && original.pathname !== "/") return unavailable;
        continue;
      }
      if (reply.status !== 200) return unavailable;
      const m = item.metadata || {};
      const expected = item.record_type === "partner_opportunity" ? m.email : m.original_post || m.post_text || item.evidence;
      const verified = typeof expected === "string" && expected.trim().length > 5 && normalise(reply.body).includes(normalise(expected));
      return { accessibility: "accessible", evidence: verified ? "verified" : "unverified", checkedAt, message: verified ? "Source accessible · evidence checked" : "Source accessible · actionable evidence not verified — research again" };
    }
  } catch { /* Failure is visible and never converted into verified evidence. */ }
  return unavailable;
}
// Ephemeral observations only: no Production schema or record writes. Tenant,
// source and exact evidence are all part of the key; changes invalidate the cache.
const cache = new Map<string, { until: number; value: Promise<PersonalSourceHealth> }>();
export function checkPersonalSource(organisationId: string, item: PersonalSignalItem) {
  const key = createHash("sha256").update(JSON.stringify([organisationId, item.source_url, item.metadata, item.evidence])).digest("hex");
  const prior = cache.get(key); if (prior && prior.until > Date.now()) return prior.value;
  if (cache.size >= 1000) cache.clear();
  const value = inspectPersonalSource(item); cache.set(key, { until: Date.now() + 300000, value }); return value;
}
export async function requirePersonalSource(organisationId: string, item: PersonalSignalItem) {
  if (item.source_engine !== "root_health_personal") return;
  const health = await checkPersonalSource(organisationId, item);
  if (health.accessibility !== "accessible" || health.evidence !== "verified") throw new AcquisitionWorkflowError(health.message, 409);
}
