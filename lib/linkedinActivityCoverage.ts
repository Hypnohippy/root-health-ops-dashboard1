export type LinkedInCoverageClass = "A" | "B" | "C";

export type LinkedInActivityCapability = {
  event: string;
  label: string;
  classification: LinkedInCoverageClass;
  availableWithCurrentAccess: boolean;
  requiredAccess: string | null;
  supportedData: string;
  fallback: string;
};

export const LINKEDIN_CURRENT_SCOPES = ["openid", "profile", "email", "w_member_social"] as const;

export const linkedinActivityCapabilities: LinkedInActivityCapability[] = [
  {
    event: "accepted_connection_invitations",
    label: "Accepted connection invitations",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "LinkedIn Invitations API partner approval",
    supportedData: "Approved partners can query sent invitations by ACCEPTED state.",
    fallback: "Continue the person-level Gmail acceptance intake and its bounded backfill.",
  },
  {
    event: "accepted_follow_invitations",
    label: "Accepted follow or follower invitations",
    classification: "C",
    availableWithCurrentAccess: false,
    requiredAccess: null,
    supportedData: "LinkedIn documents follower analytics, not a supported invitation-state feed for profile follows.",
    fallback: "Use confirmed LinkedIn notification email when available; otherwise provide manual capture in Ops.",
  },
  {
    event: "new_followers",
    label: "New followers",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "Community Management API and r_member_profileAnalytics",
    supportedData: "The supported member endpoint returns follower counts over time, not follower identities.",
    fallback: "Use aggregate follower changes after approval; do not create contact records without an identity source.",
  },
  {
    event: "profile_follows",
    label: "Profile follows",
    classification: "C",
    availableWithCurrentAccess: false,
    requiredAccess: null,
    supportedData: "No supported API provides a member-level feed identifying who followed a personal profile.",
    fallback: "Retain manual capture or confirmed notification-email intake only.",
  },
  {
    event: "direct_messages",
    label: "Direct messages",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "Restricted LinkedIn communications or compliance partner approval",
    supportedData: "Messages are not exposed by the app's open consumer scopes.",
    fallback: "Keep Copy and Open LinkedIn for human-reviewed messages; never scrape or auto-send.",
  },
  {
    event: "comments_replies",
    label: "Comments and replies",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "Community Management API read permissions",
    supportedData: "Reading member or organization social actions requires approved read scopes; w_member_social is write-only for this purpose.",
    fallback: "Keep the existing manual refresh honest and use notification email/manual capture until approval is granted.",
  },
  {
    event: "connection_requests_received",
    label: "Connection requests received",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "LinkedIn Invitations API partner approval",
    supportedData: "Approved partners can retrieve invitations received by the authenticated member.",
    fallback: "Use supported LinkedIn invitation emails where present or manual capture.",
  },
  {
    event: "reactions",
    label: "Commercially useful reactions",
    classification: "B",
    availableWithCurrentAccess: false,
    requiredAccess: "Community Management API read permissions",
    supportedData: "Reaction reads require approved member or organization social-feed permissions.",
    fallback: "Do not create reaction opportunities from unverified push notifications or scraped pages.",
  },
];

export function linkedinActivityCoverageSummary() {
  return {
    currentScopes: [...LINKEDIN_CURRENT_SCOPES],
    hasRelationshipEventCoverage: linkedinActivityCapabilities.some(item => item.availableWithCurrentAccess),
    capabilities: linkedinActivityCapabilities,
    acceptedInvitationReconciliation: {
      availableWithCurrentAccess: false,
      classification: "B" as const,
      endpoint: "GET /v2/invitations?q=inviter&states=ACCEPTED",
      requiredAccess: "LinkedIn Invitations API partner approval",
    },
  };
}
