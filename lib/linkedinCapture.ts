import { createHash } from "node:crypto";
import { parseLinkedInAcceptanceEmail, type LinkedInContact } from "./linkedinConnectionDiscovery";
import { verifiedLinkedInProfile } from "./linkedinCaptureProfile";
export { verifiedLinkedInProfile, connectionNote } from "./linkedinCaptureProfile";

// A profile is an identity, never proof of acceptance or permission to message.
export function linkedinRecommendationId(profile: string) {
  const url = verifiedLinkedInProfile(profile);
  if (!url) throw Error("A direct LinkedIn profile is required.");
  return `linkedin-recommendation-${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;
}
function text(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}
export function parseLinkedInRecommendations(input: { subject: string; sender: string; html: string; gmailMessageId: string; discoveredAt: string }) {
  if (!/^[^@<>\s]+@(?:e\.)?linkedin\.com$/i.test(input.sender.match(/<([^<>]+)>/)?.[1] || input.sender.trim())) return [];
  // A digest with explicit acceptance evidence always stays in Responses.
  if (parseLinkedInAcceptanceEmail(input) || /accepted your invitation/i.test(input.subject) || /You have\s+\d+\s+new connections/i.test(text(input.html))) return [];
  if (!/(?:someone at .+ you may know|people you may know|connections, experience, and more|network recommendations|popular in your network)/i.test(input.subject)) return [];
  const footer = input.html.search(/This email was intended for|Unsubscribe|Manage your email|LinkedIn Corporation/i);
  const html = footer < 0 ? input.html : input.html.slice(0, footer);
  const anchors = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set<string>();
  return anchors.flatMap((anchor, index) => {
    const profileUrl = verifiedLinkedInProfile(anchor[1].replace(/&amp;/g, "&"));
    const name = text(anchor[2]);
    if (!profileUrl || !name || /^(?:connect|follow|view profile|linkedin|message)$/i.test(name) || seen.has(profileUrl)) return [];
    seen.add(profileUrl);
    const end = (anchor.index || 0) + anchor[0].length;
    const next = anchors.slice(index + 1).find(a => verifiedLinkedInProfile(a[1].replace(/&amp;/g, "&")) !== profileUrl && verifiedLinkedInProfile(a[1].replace(/&amp;/g, "&")));
    const headline = text(html.slice(end, next?.index ?? html.length)).split(/\b(?:Connect|Follow|View profile|mutual connections?)\b/i)[0].trim().slice(0, 500);
    const company = headline.match(/\bat\s+([^|·]+)/i)?.[1]?.trim() || "";
    return [{ name, headline, company, profileUrl, messageUrl: null, mutualConnections: null } satisfies LinkedInContact];
  });
}
export function validateManualCapture(value: Record<string, unknown>, now = new Date()) {
  const profileUrl = typeof value.profile_url === "string" ? verifiedLinkedInProfile(value.profile_url) : null;
  if (!profileUrl || value.acceptance_confirmed !== true || value.source !== "manual_iphone_share") throw Error("Confirm this person accepted your connection and supply their direct LinkedIn profile.");
  const capturedAt = typeof value.captured_at === "string" ? new Date(value.captured_at) : new Date(NaN);
  if (!Number.isFinite(capturedAt.getTime()) || capturedAt.getTime() > now.getTime() + 300000) throw Error("A valid capture timestamp is required.");
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 300) : "";
  return { profileUrl, capturedAt: capturedAt.toISOString(), name };
}
