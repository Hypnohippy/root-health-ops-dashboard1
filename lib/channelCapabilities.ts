export type ChannelGroup = "Social & Content" | "Conversations & Community" | "Local & Search" | "Business Systems";
export type ChannelCapability = "Publish" | "Pull responses" | "Reply" | "Lead discovery" | "Direct outreach" | "Analytics";
export type CapabilityState = "available" | "limited" | "unavailable" | "planned";
export type ChannelStatusMode = "connection" | "provider_approval" | "available_soon" | "managed_setup";

export type ChannelDefinition = {
  id: string; name: string; group: ChannelGroup; description: string;
  statusMode: ChannelStatusMode; connectPath?: string; disconnectable?: boolean;
  capabilities: Partial<Record<ChannelCapability, CapabilityState>>;
  note?: string;
};

export const channelGroups: ChannelGroup[] = ["Social & Content", "Conversations & Community", "Local & Search", "Business Systems"];
export const capabilityLabels: ChannelCapability[] = ["Publish", "Pull responses", "Reply", "Lead discovery", "Direct outreach", "Analytics"];

export const channelCatalog: ChannelDefinition[] = [
  { id:"facebook",name:"Facebook",group:"Social & Content",description:"Page publishing and comments require separate verified permissions.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=facebook",disconnectable:true,capabilities:{Publish:"limited","Pull responses":"limited",Reply:"limited"}},
  { id:"instagram",name:"Instagram",group:"Social & Content",description:"Use a linked professional account; publishing and comments need separate permissions.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=instagram",disconnectable:true,capabilities:{Publish:"limited","Pull responses":"limited",Reply:"limited"},note:"Professional account, media requirements and granted permissions must be verified."},
  { id:"linkedin",name:"LinkedIn",group:"Social & Content",description:"Member publishing is implemented; response reading is disabled by the current access gate.",statusMode:"connection",connectPath:"/api/oauth/linkedin/start",disconnectable:true,capabilities:{Publish:"limited","Pull responses":"unavailable",Reply:"unavailable"}},
  { id:"threads",name:"Threads",group:"Social & Content",description:"Publish text and supported media through the connected Threads account.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=threads",disconnectable:true,capabilities:{Publish:"available","Pull responses":"unavailable",Reply:"unavailable"}},
  { id:"tiktok",name:"TikTok",group:"Social & Content",description:"Upload a video draft to TikTok; the creator completes publishing in TikTok.",statusMode:"provider_approval",connectPath:"/api/oauth/tiktok/start",disconnectable:true,capabilities:{Publish:"limited","Pull responses":"unavailable",Reply:"unavailable"},note:"Upload permission and provider approval are unverified. Inbox delivery is not publication."},
  { id:"youtube",name:"YouTube",group:"Social & Content",description:"Plan a future connection for video publishing, comments and channel insights.",statusMode:"available_soon",capabilities:{Publish:"planned","Pull responses":"planned",Reply:"planned",Analytics:"planned"}},
  { id:"x",name:"X / Twitter",group:"Social & Content",description:"A future channel for publishing and monitoring public conversations.",statusMode:"available_soon",capabilities:{Publish:"planned","Pull responses":"planned",Reply:"planned"}},
  { id:"bluesky",name:"Bluesky",group:"Social & Content",description:"A future text-first publishing and community channel.",statusMode:"available_soon",capabilities:{Publish:"planned","Pull responses":"planned",Reply:"planned"}},
  { id:"pinterest",name:"Pinterest",group:"Social & Content",description:"A future visual discovery and publishing channel.",statusMode:"available_soon",capabilities:{Publish:"planned",Analytics:"planned"}},
  { id:"email",name:"Email / B2B Gmail",group:"Conversations & Community",description:"Bring outreach replies into Ops, edit the proposed response and approve Gmail delivery.",statusMode:"managed_setup",capabilities:{"Pull responses":"available",Reply:"available","Lead discovery":"available","Direct outreach":"available"},note:"Human approval is required before every reply sent from Ops."},
  { id:"whatsapp",name:"WhatsApp Business",group:"Conversations & Community",description:"A future channel for opted-in customer conversations and follow-up.",statusMode:"available_soon",capabilities:{"Pull responses":"planned",Reply:"planned","Direct outreach":"planned"}},
  { id:"reddit",name:"Reddit",group:"Conversations & Community",description:"A future community listening and response channel.",statusMode:"available_soon",capabilities:{"Pull responses":"planned",Reply:"planned","Lead discovery":"planned"}},
  { id:"google",name:"Google Business Profile",group:"Local & Search",description:"Store the business connection while verified posting and response workflows are completed.",statusMode:"connection",connectPath:"/api/oauth/google/start",disconnectable:true,capabilities:{Publish:"unavailable","Pull responses":"unavailable",Reply:"unavailable",Analytics:"planned"},note:"A stored connection does not currently enable publishing in Ops."},
  { id:"crm",name:"CRM & webhooks",group:"Business Systems",description:"Connect lead and opportunity data to the Acquisition Queue without manual re-entry.",statusMode:"available_soon",capabilities:{"Lead discovery":"limited","Direct outreach":"planned",Analytics:"planned"},note:"Secure ingestion exists for managed pipelines; self-service setup is still to come."},
  { id:"website",name:"Website forms & enquiries",group:"Business Systems",description:"A future connection for routing website enquiries into the right Ops workflow.",statusMode:"available_soon",capabilities:{"Pull responses":"planned","Lead discovery":"planned"}},
  { id:"calendar",name:"Calendars & booking",group:"Business Systems",description:"A future connection for meeting handoff, follow-up and conversion context.",statusMode:"available_soon",capabilities:{"Direct outreach":"planned",Analytics:"planned"}},
  { id:"outlook",name:"Microsoft / Outlook email",group:"Business Systems",description:"A future managed email option for organisations using Microsoft 365.",statusMode:"available_soon",capabilities:{"Pull responses":"planned",Reply:"planned","Direct outreach":"planned"}},
];

export type CapabilityHealthState = "not_verified" | "not_implemented" | "provider_approval_required" | "reconnect_required" | "not_connected" | "manual_completion_required";
export type CapabilityAssessment = { state: CapabilityHealthState; reason: string };

/** Read-only assessment. Credentials and requested scopes are never evidence of granted capability. */
export function assessConnectionCapabilities(platform: string, credential: string) {
  const channel = channelCatalog.find(item => item.id === platform);
  const reconnectRequired = credential === "expired" || credential === "reconnect_required";
  const assess = (label: ChannelCapability): CapabilityAssessment => {
    const implemented = channel?.capabilities[label];
    if (!implemented || ["unavailable", "planned"].includes(implemented)) return {
      state: platform === "linkedin" && label === "Pull responses" ? "provider_approval_required" : "not_implemented",
      reason: platform === "linkedin" && label === "Pull responses" ? "Runtime access gate disables reading. Additional approved LinkedIn access and a code change are required; reconnecting alone will not enable it." : "No enabled adapter for this capability."
    };
    if (reconnectRequired) return { state: "reconnect_required", reason: "The saved credential is expired or requires reconnection." };
    if (credential !== "connected") return { state: "not_connected", reason: "No usable credential or engine configuration is recorded." };
    if (platform === "tiktok") return { state: "manual_completion_required", reason: "Upload permission/approval is unverified. The implemented flow delivers a draft; finish publishing in TikTok." };
    if (platform === "email") return { state: "not_verified", reason: "Engine configuration exists. Reachability, Gmail authorization and delivery are not verified. Human approval remains required." };
    if (["facebook", "instagram"].includes(platform) && ["Pull responses", "Reply"].includes(label)) return { state: "not_verified", reason: platform === "facebook" ? "Granted pages_read_user_content / pages_manage_engagement permissions are not recorded; current OAuth does not request them. Use the native platform until verified." : "Granted instagram_manage_comments permission is not recorded; current OAuth does not request it. Use Instagram until verified." };
    return { state: "not_verified", reason: "Adapter exists, but granted permissions, asset access and provider availability have not been verified." };
  };
  return {
    credentialStatus: platform === "email" && credential === "connected" ? "configuration_present" : credential === "connected" ? "credential_present" : credential,
    operationallyVerified: false,
    reconnectRequired,
    providerApproval: ["linkedin", "tiktok"].includes(platform) ? "required_for_extended_capabilities" : ["facebook", "instagram", "threads", "google"].includes(platform) ? "not_verified" : "not_applicable",
    manualFallback: platform === "email" ? "Review delivery in Gmail before completing manually; never repeat an uncertain send." : platform === "tiktok" ? "Open TikTok inbox to edit and publish the uploaded draft. Do not upload it again." : "Review the prepared draft and complete the action on the native platform when Ops capability is unavailable or unverified.",
    capabilities: Object.fromEntries(capabilityLabels.map(label => [label, assess(label)])) as Record<ChannelCapability, CapabilityAssessment>,
  };
}
export type ConnectionCapabilityHealth = ReturnType<typeof assessConnectionCapabilities>;
