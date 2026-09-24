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
  { id:"facebook",name:"Facebook",group:"Social & Content",description:"Publish Page content and manage imported comments from one workspace.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=facebook",disconnectable:true,capabilities:{Publish:"available","Pull responses":"available",Reply:"available"}},
  { id:"instagram",name:"Instagram",group:"Social & Content",description:"Publish through a linked professional account and manage imported comments.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=instagram",disconnectable:true,capabilities:{Publish:"limited","Pull responses":"available",Reply:"available"},note:"Publishing is available, with stricter image and media requirements."},
  { id:"linkedin",name:"LinkedIn",group:"Social & Content",description:"Publish professional content and pull supported post comments into Responses.",statusMode:"connection",connectPath:"/api/oauth/linkedin/start",disconnectable:true,capabilities:{Publish:"available","Pull responses":"available",Reply:"unavailable"}},
  { id:"threads",name:"Threads",group:"Social & Content",description:"Publish text and supported media through the connected Threads account.",statusMode:"connection",connectPath:"/api/social/connect/start?provider=threads",disconnectable:true,capabilities:{Publish:"available","Pull responses":"unavailable",Reply:"unavailable"}},
  { id:"tiktok",name:"TikTok",group:"Social & Content",description:"Video publishing is prepared but remains gated by TikTok production approval.",statusMode:"provider_approval",capabilities:{Publish:"limited","Pull responses":"unavailable",Reply:"unavailable"},note:"Awaiting provider approval / production access."},
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
