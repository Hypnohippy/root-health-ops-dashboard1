import { lifecycleLinkedInIdentity, type LifecycleRow } from "@/lib/contactLifecycle";

export type LinkedInMessageNotification = { gmailMessageId: string; receivedAt: string; identity: string; profileUrl: string; messageUrl: string; subject: string; source: "linkedin_message_notification" };
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Email notification evidence only: no message body, sentiment or inferred intent. */
export function parseLinkedInMessageNotification(body: Record<string, unknown>, now = Date.now()): LinkedInMessageNotification | null {
  const sender = str(body.sender).match(/<([^<>]+)>/)?.[1] || str(body.sender);
  const subject = str(body.subject), html = str(body.html), gmailMessageId = str(body.gmail_message_id);
  const receivedAt = str(body.received_at);
  if (!/^messaging-digest-noreply@(?:e\.)?linkedin\.com$/i.test(sender) || !/^.{1,200} just messaged you[.!]?$/i.test(subject) ||
      !/\b(?:1|one) new message awaits your response\b/i.test(html.replace(/<[^>]*>/g, " ")) ||
      !/^[a-f0-9]{8,32}$/i.test(gmailMessageId) || !Number.isFinite(Date.parse(receivedAt)) || Date.parse(receivedAt) > now + 300000 || html.length > 200000) return null;
  const urls = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => m[1].replace(/&amp;/g, "&"));
  const profiles = new Set<string>(), messageUrls = new Set<string>();
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || !/^(?:www\.|[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname)) continue;
      const identity = lifecycleLinkedInIdentity(value);
      if (identity) profiles.add(identity);
      if (/^\/(?:comm\/)?messaging\/thread\/[^/]+\/?$/i.test(url.pathname)) messageUrls.add(`https://www.linkedin.com${url.pathname.replace(/^\/comm\//, "/")}`);
    } catch { /* Untrusted/non-direct links are never resolved. */ }
  }
  if (profiles.size !== 1 || messageUrls.size !== 1) return null;
  const messageUrl=[...messageUrls][0];
  const identity = [...profiles][0];
  return { gmailMessageId, receivedAt: new Date(receivedAt).toISOString(), identity, profileUrl: `https://${identity}`, messageUrl, subject, source: "linkedin_message_notification" };
}

export function notificationPatch(row: LifecycleRow, notification: LinkedInMessageNotification) {
  const raw = obj(row.raw);
  const history = Array.isArray(raw.linkedin_message_notifications) ? raw.linkedin_message_notifications as LinkedInMessageNotification[] : [];
  if (history.some(item => item.gmailMessageId === notification.gmailMessageId)) return null;
  // Bound growth; fail explicitly rather than silently discard receipt history.
  if (history.length >= 1000) throw Error("Notification evidence limit reached; manual review required.");
  const latest = [...history, notification].sort((a,b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0];
  // Do not rewrite lifecycle/send fields: deployed receipt-preservation triggers
  // intentionally retain them. The notification projects a new unresolved event.
  return { raw: { ...raw, linkedin_message_notifications: [...history, notification] },
    linkedin_conversation_active: true, linkedin_message_url: latest.messageUrl };
}
