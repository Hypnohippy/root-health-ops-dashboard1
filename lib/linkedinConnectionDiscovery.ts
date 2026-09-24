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
  suggestions: LinkedInContact[];
  gmailMessageId: string;
  discoveredAt: string;
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
function canonicalProfile(url: string) { return url.split(/[?#]/)[0].replace(/\/$/, "").toLowerCase(); }
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
  if (!/accepted your invitation/i.test(input.subject) || !/@(?:e\.)?linkedin\.com\b/i.test(input.sender)) return null;
  const acceptedName = input.subject.replace(/\s+accepted your invitation.*$/i, "").trim();
  if (!acceptedName) return null;
  const marker = input.html.search(/Suggestions from [\s\S]{0,120}?network/i);
  const acceptedHtml = marker >= 0 ? input.html.slice(0, marker) : input.html;
  const acceptedLinks = links(acceptedHtml);
  const profile = acceptedLinks.find((item) => /linkedin\.com\/(?:comm\/)?in\//i.test(item.url));
  if (!profile) return null;
  const messageUrl = acceptedLinks.find((item) => /linkedin\.com\/(?:messaging|comm\/messaging)/i.test(item.url))?.url || null;
  const acceptedHeadline = followingText(acceptedHtml, profile.end, acceptedLinks.find((item) => item.index > profile.end)?.index || acceptedHtml.length);

  const suggestionSource = marker >= 0 ? input.html.slice(marker) : "";
  const footer = suggestionSource.search(/(?:<footer\b|Unsubscribe|Manage your email|Help Center|LinkedIn Corporation|Privacy Policy)/i);
  const suggestionHtml = footer >= 0 ? suggestionSource.slice(0, footer) : suggestionSource;
  const suggestionLinks = links(suggestionHtml).filter((item) => /linkedin\.com\/(?:comm\/)?in\//i.test(item.url));
  const seen = new Set<string>();
  const suggestions = suggestionLinks.flatMap((item, index) => {
    const key = canonicalProfile(item.url);
    if (seen.has(key)) return [];
    seen.add(key);
    const next = suggestionLinks[index + 1]?.index || suggestionHtml.length;
    const context = followingText(suggestionHtml, item.end, next);
    const mutual = context.match(/(\d+)\s+mutual connection/i);
    return [contact(item.label, context, item.url, null, mutual ? Number(mutual[1]) : null)];
  });
  return { accepted: contact(acceptedName, acceptedHeadline, profile.url, messageUrl, null), suggestions, gmailMessageId: input.gmailMessageId, discoveredAt: input.discoveredAt || new Date().toISOString() };
}

export function linkedinNetworkSourceRecordId(acceptedProfileUrl: string, suggestedProfileUrl: string) {
  const digest = createHash("sha256").update([canonicalProfile(acceptedProfileUrl), canonicalProfile(suggestedProfileUrl)].join("|")).digest("hex").slice(0, 32);
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
  return acceptance.suggestions.filter((candidate) => !existingSourceIds.has(linkedinNetworkSourceRecordId(acceptance.accepted.profileUrl, candidate.profileUrl)) && !knownProfileUrls.has(canonicalProfile(candidate.profileUrl)));
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
