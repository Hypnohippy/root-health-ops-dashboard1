import { lifecycleLinkedInIdentity, type LifecycleRow } from "@/lib/contactLifecycle";

export type LinkedInMessageNotification = { gmailMessageId: string; eventKey?: string; receivedAt: string; identity: string; profileUrl: string; messageUrl: string; subject: string; source: "linkedin_message_notification" };
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};

/** Email notification evidence only: no message body, sentiment or inferred intent. */
export function parseLinkedInMessageNotification(body: Record<string, unknown>, now = Date.now()): LinkedInMessageNotification | null {
  const sender = str(body.sender).match(/<([^<>]+)>/)?.[1] || str(body.sender);
  const subject = str(body.subject), html = str(body.html), gmailMessageId = str(body.gmail_message_id);
  const receivedAt = str(body.received_at);
  if (!/^messaging-digest-noreply@(?:e\.)?linkedin\.com$/i.test(sender) || !/^.{1,200} just messaged you[.!]?$/i.test(subject) ||
      !/(?<![\w.+-])(?:(?:1|one) new message awaits|(?:[2-9]|[1-9]\d+) new messages await) your response\b/i.test(html.replace(/<[^>]*>/g, " ")) ||
      !/^[a-f0-9]{8,32}$/i.test(gmailMessageId) || !Number.isFinite(Date.parse(receivedAt)) || Date.parse(receivedAt) > now + 300000 || html.length > 200000) return null;
  return eventFromHtml(html, { gmailMessageId, receivedAt: new Date(receivedAt).toISOString(), subject });
}

export function isLinkedInMessageSubject(subject: string) {
  return /^.{1,200} just messaged you[.!]?$/i.test(subject) || /^.{1,200} and .{1,200} sent new messages[.!]?$/i.test(subject);
}
export function notificationEventKey(notification: LinkedInMessageNotification) {
  const identity = lifecycleLinkedInIdentity(notification.identity) || notification.identity;
  const url = new URL(notification.messageUrl);
  const thread = `https://www.linkedin.com${url.pathname.replace(/^\/comm\//, "/").replace(/\/$/, "")}`;
  return JSON.stringify([notification.gmailMessageId, identity, thread]);
}
function eventFromHtml(html: string, base: { gmailMessageId: string; receivedAt: string; subject: string }) {
  const profiles = new Set<string>(), messageUrls = new Set<string>();
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const value = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1]?.replace(/&amp;/g, "&");
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || !/^(?:www\.|[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname)) continue;
      const identity = lifecycleLinkedInIdentity(value);
      if (identity) profiles.add(identity);
      if (/^\/(?:comm\/)?messaging\/thread\/[^/]+\/?$/i.test(url.pathname)) {
        // Any extra thread makes the block ambiguous, even if its label differs.
        messageUrls.add(`https://www.linkedin.com${url.pathname.replace(/^\/comm\//, "/").replace(/\/$/, "")}`);
        if (!/^view messages?$/i.test(match[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())) return null;
      }
    } catch { /* Never resolve redirects or non-direct links. */ }
  }
  if (profiles.size !== 1 || messageUrls.size !== 1) return null;
  const identity = [...profiles][0], messageUrl = [...messageUrls][0];
  const event: LinkedInMessageNotification = { ...base, identity, profileUrl: `https://${identity}`, messageUrl, source: "linkedin_message_notification" };
  event.eventKey = notificationEventKey(event);
  return event;
}

/** Bounded structural HTML scan. No execution, remote fetch or name/order inference.
 * Only self-contained repeated row/card units are eligible. Unsupported markup
 * fails closed rather than associating links from different message blocks.
 */
export function parseLinkedInMessageNotifications(body: Record<string, unknown>, now = Date.now()) {
  const singleSubject = /^.{1,200} just messaged you[.!]?$/i.test(str(body.subject));
  if (singleSubject) {
    const event = parseLinkedInMessageNotification(body, now);
    return { events: event ? [event] : [], rejectedBlocks: event ? 0 : 1 };
  }
  // Aggregate subjects validate only the envelope, never identify recipients.
  const subject = str(body.subject);
  const html = str(body.html).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  if (!isLinkedInMessageSubject(subject) || !parseEnvelope(body, now)) return { events: [], rejectedBlocks: 1 };
  type Node = { tag: string; start: number; end: number; parent: Node | null; children: Node[] };
  const root: Node = { tag: "root", start: 0, end: html.length, parent: null, children: [] };
  const stack = [root];
  const voids = new Set(["area","base","br","col","embed","hr","img","input","link","meta","param","source","track","wbr"]);
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    if (!token[1]) continue;
    const tag = token[1].toLowerCase();
    if (tag === "script" || tag === "style") return { events: [], rejectedBlocks: 1 };
    if (token[0].startsWith("</")) {
      if (stack.length === 1 || stack.at(-1)!.tag !== tag) return { events: [], rejectedBlocks: 1 };
      stack.pop()!.end = token.index! + token[0].length;
    } else if (!voids.has(tag) && !token[0].endsWith("/>")) {
      if (stack.length > 80) return { events: [], rejectedBlocks: 1 };
      const parent = stack.at(-1)!;
      const node: Node = { tag, start: token.index!, end: 0, parent, children: [] };
      parent.children.push(node); stack.push(node);
    }
  }
  if (stack.length !== 1) return { events: [], rejectedBlocks: 1 };
  const events: LinkedInMessageNotification[] = []; let rejectedBlocks = 0;
  const base = { gmailMessageId: str(body.gmail_message_id), receivedAt: new Date(str(body.received_at)).toISOString(), subject };
  const containerTags = new Set(["tr", "li", "article", "section", "div"]);
  const fragment = (node: Node) => html.slice(node.start, node.end);
  const relevant = (node: Node) => /href\s*=\s*["'][^"']*(?:\/messaging\/thread\/|linkedin\.com\/(?:comm\/)?in\/)/i.test(fragment(node));
  const groups = (node: Node) => {
    const byTag = new Map<string, Node[]>();
    for (const child of node.children) {
      if (!containerTags.has(child.tag) || !relevant(child)) continue;
      byTag.set(child.tag, [...(byTag.get(child.tag) || []), child]);
    }
    return [...byTag.values()].filter(children => children.length >= 2);
  };
  const hasTable = (node: Node): boolean => node.tag === "table" || node.children.some(hasTable);
  const ambiguousNesting = (node: Node): boolean => groups(node).some(children =>
    // Nested full cards or separately wrapped partial cards cannot be merged.
    // Bare profile/action layout rows are permitted inside one message card.
    children.filter(child => eventFromHtml(fragment(child), base)).length > 1 ||
    children.every(child => child.tag !== "tr" || child.children.some(hasTable))) || node.children.some(ambiguousNesting);
  const processContainer = (container: Node) => {
    const event = eventFromHtml(fragment(container), base);
    if (!event || ambiguousNesting(container)) { rejectedBlocks++; return; }
    // Descend only within this established repeated-container boundary to find
    // the smallest subtree containing the pair, including sibling layout rows.
    let smallest = container;
    for (;;) {
      const complete = smallest.children.filter(child => eventFromHtml(fragment(child), base));
      if (complete.length !== 1) break;
      smallest = complete[0];
    }
    events.push(eventFromHtml(fragment(smallest), base)!);
  };
  const scan = (node: Node) => {
    if (!relevant(node)) return;
    const repeated = groups(node);
    if (repeated.length) {
      // Establish the outer repeated message boundaries BEFORE descending into
      // their internal table rows. Never salvage an invalid card via its siblings.
      repeated.flat().forEach(processContainer);
      // Relevant unmatched sibling structures are unsupported, not silently paired.
      rejectedBlocks += node.children.filter(child => relevant(child) && !repeated.flat().includes(child)).length;
      return;
    }
    node.children.forEach(scan);
  };
  scan(root);
  const unique = [...new Map(events.map(event => [notificationEventKey(event), event])).values()];
  // One thread must not be attributed to two identities across separate cards.
  const ambiguous = new Set(unique.filter(event => unique.some(other => other.messageUrl === event.messageUrl && other.identity !== event.identity)).map(event => event.messageUrl));
  return { events: unique.filter(event => !ambiguous.has(event.messageUrl)), rejectedBlocks: rejectedBlocks + unique.filter(event => ambiguous.has(event.messageUrl)).length };
}
function parseEnvelope(body: Record<string, unknown>, now: number) {
  const sender = str(body.sender).match(/<([^<>]+)>/)?.[1] || str(body.sender);
  return /^messaging-digest-noreply@(?:e\.)?linkedin\.com$/i.test(sender) &&
    /(?<![\w.+-])(?:(?:1|one) new message awaits|(?:[2-9]|[1-9]\d+) new messages await) your response\b/i.test(str(body.html).replace(/<[^>]*>/g, " ")) &&
    /^[a-f0-9]{8,32}$/i.test(str(body.gmail_message_id)) && Number.isFinite(Date.parse(str(body.received_at))) && Date.parse(str(body.received_at)) <= now + 300000 && str(body.html).length <= 200000;
}

export function notificationPatch(row: LifecycleRow, notification: LinkedInMessageNotification) {
  const raw = obj(row.raw);
  const history = Array.isArray(raw.linkedin_message_notifications) ? raw.linkedin_message_notifications as LinkedInMessageNotification[] : [];
  if (history.some(item => notificationEventKey(item) === notificationEventKey(notification))) return null;
  // Bound growth; fail explicitly rather than silently discard receipt history.
  if (history.length >= 1000) throw Error("Notification evidence limit reached; manual review required.");
  const latest = [...history, notification].sort((a,b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0];
  // Do not rewrite lifecycle/send fields: deployed receipt-preservation triggers
  // intentionally retain them. The notification projects a new unresolved event.
  return { raw: { ...raw, linkedin_message_notifications: [...history, notification] },
    linkedin_conversation_active: true, linkedin_message_url: latest.messageUrl };
}
