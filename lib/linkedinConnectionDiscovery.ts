import { createHash } from "node:crypto";

export type LinkedInContact = {
  name: string;
  headline: string;
  company: string;
  profileUrl: string;
  messageUrl: string | null;
  mutualConnections: number | null;
};
export type LinkedInAcceptance = {
  accepted: LinkedInContact;
  acceptedConnections: LinkedInContact[];
  suggestions: LinkedInContact[];
  gmailMessageId: string;
  discoveredAt: string;
  sourceFormat: "individual" | "digest";
};
export type BuyerTargeting = {
  audience?: string;
  priorityServices?: string[];
  customerProblems?: string[];
  geography?: string;
};
export type LinkedInCandidateRecord = {
  record_type: "personal_opportunity";
  source_engine: "linkedin_connection_network";
  source_record_id: string;
  source_url: string;
  person: string;
  company: string | null;
  signal: string;
  suggested_action: string;
  metadata: Record<string, unknown>;
};

function plainText(html: string) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
}
export function canonicalLinkedInAcceptanceProfile(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase().replace(/^\/comm\/in\//, "/in/").replace(/\/$/, "");
    return `${host}${path}`;
  } catch { return value.trim().toLowerCase().split(/[?#]/)[0].replace(/^https?:\/\/(?:www\.)?/, "").replace(/^linkedin\.com\/comm\/in\//, "linkedin.com/in/").replace(/\/$/, ""); }
}
function companyFromHeadline(headline: string) { return headline.match(/\bat\s+([^|·,]+)/i)?.[1]?.trim() || ""; }
function links(html: string) {
  return [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({ url: match[1].replace(/&amp;/g, "&"), label: plainText(match[2]), index: match.index || 0, end: (match.index || 0) + match[0].length }));
}
function followingText(html: string, end: number, next: number) {
  return plainText(html.slice(end, next)).replace(/^(View profile|Message)\s*/i, "").split(/(?:View profile|\bConnect\b|\bFollow\b)/i)[0].trim().slice(0, 300);
}
function contact(name: string, headline: string, profileUrl: string, messageUrl: string | null, mutualConnections: number | null): LinkedInContact {
  return { name: name.trim(), headline, company: companyFromHeadline(headline), profileUrl, messageUrl, mutualConnections };
}

export function parseLinkedInAcceptanceEmail(input: { subject: string; sender: string; html: string; gmailMessageId: string; discoveredAt?: string }): LinkedInAcceptance | null {
  if (!/@(?:e\.)?linkedin\.com\b/i.test(input.sender)) return null;
  const individual = /accepted your invitation/i.test(input.subject);
  const digestMatch = plainText(input.html).match(/You have\s+(\d+)\s+new connections?\b/i);
  const digest = Boolean(digestMatch && /\bconnections?(?:,|\b)/i.test(input.subject));
  if (!individual && !digest) return null;
  const marker = input.html.search(/Suggestions from [\s\S]{0,120}?network/i);
  const footer = input.html.search(/(?:<footer\b|Unsubscribe|Manage your email|Help Center|LinkedIn Corporation|Privacy Policy)/i);
  const end = Math.min(...[marker, footer, input.html.length].filter(value => value >= 0));
  const digestStart = digest ? input.html.search(/You have[\s\S]{0,40}?new connections?/i) : 0;
  const acceptedHtml = input.html.slice(Math.max(0, digestStart), end);
  const acceptedLinks = links(acceptedHtml);
  const profileLinks = acceptedLinks.filter(item => /linkedin\.com\/(?:comm\/)?in\//i.test(item.url));
  const seenAccepted = new Set<string>();
  const acceptedConnections = profileLinks.flatMap((profile, index) => {
    const identity = canonicalLinkedInAcceptanceProfile(profile.url);
    if (!identity || seenAccepted.has(identity)) return [];
    const name = profile.label.replace(/^(?:View\s+)?profile\s*(?:of)?\s*/i, "").trim();
    if (!name || /^(?:linkedin|view profile|profile)$/i.test(name)) return [];
    seenAccepted.add(identity);
    const nextProfile = profileLinks[index + 1]?.index || acceptedHtml.length;
    const message = acceptedLinks.find(link => link.index > profile.end && link.index < nextProfile && /linkedin\.com\/(?:messaging|comm\/messaging)/i.test(link.url));
    const headline = followingText(acceptedHtml, profile.end, message?.index || nextProfile);
    return [contact(name, headline, profile.url, message?.url || null, null)];
  });
  if (individual) {
    const acceptedName = input.subject.replace(/\s+accepted your invitation.*$/i, "").trim();
    if (!acceptedName || !acceptedConnections.length) return null;
    acceptedConnections.splice(1);
    acceptedConnections[0] = { ...acceptedConnections[0], name: acceptedName };
  }
  if (!acceptedConnections.length) return null;

  const suggestionSource = marker >= 0 ? input.html.slice(marker) : "";
  const suggestionFooter = suggestionSource.search(/(?:<footer\b|Unsubscribe|Manage your email|Help Center|LinkedIn Corporation|Privacy Policy)/i);
  const suggestionHtml = suggestionFooter >= 0 ? suggestionSource.slice(0, suggestionFooter) : suggestionSource;
  const suggestionLinks = links(suggestionHtml).filter((item) => /linkedin\.com\/(?:comm\/)?in\//i.test(item.url));
  const seen = new Set<string>();
  const suggestions = suggestionLinks.flatMap((item, index) => {
    const key = canonicalLinkedInAcceptanceProfile(item.url);
    if (seen.has(key)) return [];
    seen.add(key);
    const next = suggestionLinks[index + 1]?.index || suggestionHtml.length;
    const context = followingText(suggestionHtml, item.end, next);
    const mutual = context.match(/(\d+)\s+mutual connection/i);
    return [contact(item.label, context, item.url, null, mutual ? Number(mutual[1]) : null)];
  });
  return { accepted: acceptedConnections[0], acceptedConnections, suggestions: digest ? [] : suggestions, gmailMessageId: input.gmailMessageId, discoveredAt: input.discoveredAt || new Date().toISOString(), sourceFormat: digest ? "digest" : "individual" };
}

export function linkedinAcceptanceSourceRecordId(profileUrl: string) {
  return `linkedin-acceptance-${createHash("sha256").update(canonicalLinkedInAcceptanceProfile(profileUrl)).digest("hex").slice(0, 32)}`;
}

export function linkedinNetworkSourceRecordId(acceptedProfileUrl: string, suggestedProfileUrl: string) {
  const digest = createHash("sha256").update([canonicalLinkedInAcceptanceProfile(acceptedProfileUrl), canonicalLinkedInAcceptanceProfile(suggestedProfileUrl)].join("|")).digest("hex").slice(0, 32);
  return `linkedin-network-${digest}`;
}

const relevantRoles = /\b(?:chief people officer|people director|people partner|hrbp|human resources|\bhr\b|people & culture|people and culture|learning and development|\bl&d\b|wellbeing|\beap\b|director of nursing|managing director|chief executive|\bceo\b)\b/i;
export function qualifiesForBuyerTargeting(candidate: LinkedInContact, targeting: BuyerTargeting) {
  const candidateText = `${candidate.headline} ${candidate.company}`.toLowerCase();
  const profileTerms = [targeting.audience, targeting.geography, ...(targeting.priorityServices || []), ...(targeting.customerProblems || [])].filter(Boolean).flatMap((value) => String(value).toLowerCase().split(/[,;/|]/)).map((value) => value.trim()).filter((value) => value.length >= 3);
  const matches = profileTerms.filter((term) => candidateText.includes(term));
  return { relevant: relevantRoles.test(candidateText) || matches.length > 0, matches };
}

export function uniqueLinkedInSuggestions(acceptance: LinkedInAcceptance, existingSourceIds: Set<string>, knownProfileUrls: Set<string>) {
  return acceptance.suggestions.filter((candidate) => !existingSourceIds.has(linkedinNetworkSourceRecordId(acceptance.accepted.profileUrl, candidate.profileUrl)) && !knownProfileUrls.has(canonicalLinkedInAcceptanceProfile(candidate.profileUrl)));
}

export function acceptedConnectionDraft(contact: LinkedInContact) {
  const firstName = contact.name.split(/\s+/)[0];
  const context = contact.headline ? `Your work as ${contact.headline}` : "Your work";
  return `Hi ${firstName} — ${context} caught my attention. I’d be interested to hear what is most important in your remit at the moment.`;
}

export function buildLinkedInCandidateRecord(acceptance: LinkedInAcceptance, candidate: LinkedInContact): LinkedInCandidateRecord {
  const mutual = candidate.mutualConnections === null ? "mutual connection count unavailable" : `${candidate.mutualConnections} mutual connection${candidate.mutualConnections === 1 ? "" : "s"}`;
  return {
    record_type: "personal_opportunity",
    source_engine: "linkedin_connection_network",
    source_record_id: linkedinNetworkSourceRecordId(acceptance.accepted.profileUrl, candidate.profileUrl),
    source_url: candidate.profileUrl,
    person: candidate.name,
    company: candidate.company || null,
    signal: `Suggested via ${acceptance.accepted.name} → ${candidate.name}, ${candidate.headline} → ${mutual}`,
    suggested_action: "Review the profile and decide whether to connect or nurture.",
    metadata: {
      source_type: "linkedin_connection_network",
      accepted_connection_name: acceptance.accepted.name,
      accepted_profile_url: acceptance.accepted.profileUrl,
      suggested_person_name: candidate.name,
      headline: candidate.headline,
      company: candidate.company || null,
      profile_url: candidate.profileUrl,
      mutual_connection_count: candidate.mutualConnections,
      source_gmail_message_id: acceptance.gmailMessageId,
      discovered_at: acceptance.discoveredAt,
    },
  };
}
