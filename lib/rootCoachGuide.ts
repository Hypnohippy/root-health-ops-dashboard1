// Navigation and explanations only. This catalogue never fetches data or executes actions.
export const guideDestinations = {
  diary: { label: "Diary", path: "/dashboard/diary" },
  home: { label: "Home", path: "/dashboard" },
  founder: { label: "Founder", path: "/dashboard/founder-intelligence" },
  acquisition: { label: "Acquisition", path: "/dashboard/growth/acquisition" },
  responses: { label: "Responses", path: "/dashboard/responses" },
  linkedin: { label: "LinkedIn Outreach", path: "/dashboard/responses/linkedin" },
  campaigns: { label: "Campaign Studio", path: "/dashboard/sequences" },
  publishing: { label: "Publishing", path: "/dashboard/publishing" },
  scheduled: { label: "Scheduled posts", path: "/dashboard/scheduled" },
  approvals: { label: "Approvals", path: "/dashboard/approvals" },
  stories: { label: "Stories", path: "/dashboard/stories/new" },
  growth: { label: "Today’s Growth", path: "/dashboard/growth" },
  relationships: { label: "Relationships", path: "/dashboard/growth/relationships" },
  resources: { label: "Resources", path: "/dashboard/resources" },
  connect: { label: "Connect", path: "/dashboard/connect" },
} as const;
export type GuideDestination = keyof typeof guideDestinations;
export type GuideWorkspace = { key: GuideDestination; title: string; explanation: string; next: string; destinations: readonly GuideDestination[]; questions: readonly string[] };
const catalogue: readonly GuideWorkspace[] = [
  { key: "diary", title: "Diary", explanation: "Diary reads dated follow-ups, recorded calls and open relationship tasks from existing Ops sources using UK dates.", next: "Switch Today, Week or Month and open the exact source to review the work. Diary does not change lifecycle state or sync external calendars.", destinations: ["diary", "relationships", "responses"], questions: ["What have I got today?", "What is overdue?", "Where do I find my diary?"] },
  { key: "home", title: "Home", explanation: "Home is your operational front door: what has been handled, what is in hand, what needs a person and what is blocked.", next: "Use Home’s recorded groups to review the work that needs you. Ask Root does not rank opportunities or calculate a second priority list.", destinations: ["home", "responses", "acquisition"], questions: ["What should I do next?", "Where are my replies?", "What is Acquisition?"] },
  { key: "founder", title: "Founder", explanation: "Founder holds protected research, saved records, sources and explicitly recorded activity. It is separate from operational outreach.", next: "Search stored research or reopen a saved record. Recording activity and promoting research remain explicit actions in Founder.", destinations: ["founder", "relationships"], questions: ["What does this page do?", "Where do I find Relationships?", "What is Acquisition?"] },
  { key: "acquisition", title: "Acquisition", explanation: "Acquisition brings opportunities and their source evidence together. Personal, audience intelligence, partner and commercial lanes retain their existing distinctions.", next: "Review the source, qualification and recorded next action before choosing an opportunity. Ask Root cannot qualify, dismiss or contact anyone for you.", destinations: ["acquisition", "relationships"], questions: ["What is Acquisition?", "What should I do next?", "Where do I find Relationships?"] },
  { key: "responses", title: "Responses", explanation: "Responses shows recorded replies and conversation history. Needs reply, waiting and handled states come from the existing lifecycle.", next: "Open the conversation and check its current action. Use the existing filters to include handled history; LinkedIn Outreach is a separate destination.", destinations: ["responses", "linkedin", "relationships"], questions: ["Where are my replies?", "Where is LinkedIn Outreach?", "What does this page do?"] },
  { key: "linkedin", title: "LinkedIn Outreach", explanation: "LinkedIn Outreach presents eligible connection messages and follow-ups. Fresh, catch-up and follow-up queues use existing relationship evidence and safety rules.", next: "Review the selected contact and existing draft in the Console. Messages are sent manually in LinkedIn. Ask Root can suggest an unsent draft for review; only the existing Console confirmation records a send.", destinations: ["linkedin", "responses", "relationships"], questions: ["What does this page do?", "Where are my replies?", "Where do I find Relationships?"] },
  { key: "campaigns", title: "Campaigns", explanation: "Campaign Studio holds campaign plans, ideas and assets. Its existing Root Coach suggestions guide the next step for each campaign.", next: "Open Campaign Studio to create or review a campaign, then use its existing planning and review controls. Opening the page does not create a campaign.", destinations: ["campaigns", "resources", "publishing"], questions: ["How do I create a campaign?", "What should I do next?", "Where do I publish something?"] },
  { key: "publishing", title: "Publishing", explanation: "Publishing is the existing composer for channel selection, content, assets and explicit publishing or approval controls. Drafts and approvals are not proof of delivery.", next: "Review content and channels in Publishing. Scheduled posts and pending approvals have their own existing views; Ask Root cannot publish or approve them.", destinations: ["publishing", "scheduled", "approvals"], questions: ["Where do I publish something?", "Where are my scheduled posts?", "Where are approvals?"] },
  { key: "scheduled", title: "Scheduled posts", explanation: "Scheduled shows recorded posts and their schedule/status. A scheduled time does not establish successful publication.", next: "Review the recorded status and time in Scheduled. Editing or publishing stays in that workflow.", destinations: ["scheduled", "publishing", "approvals"], questions: ["What does this page do?", "Where do I publish something?", "Where are approvals?"] },
  { key: "approvals", title: "Approvals", explanation: "Approvals holds content awaiting review and its recorded approval state. Approval does not mean a post has been published.", next: "Read the content and recorded state in Approvals. Only its existing explicit controls can approve, reject or publish.", destinations: ["approvals", "publishing", "scheduled"], questions: ["What does this page do?", "Where are my scheduled posts?", "Where do I publish something?"] },
  { key: "stories", title: "Stories", explanation: "Stories develops content drafts using the existing creator and draft locker. Generated content still needs review.", next: "Use the existing Stories controls when you are ready to create or review a draft. Ask Root does not generate content or clear drafts.", destinations: ["stories", "publishing", "scheduled"], questions: ["What does this page do?", "Where do I publish something?", "Where are my scheduled posts?"] },
  { key: "growth", title: "Growth", explanation: "Growth brings Today, Targets, Waiting, Pipeline, Import, Tracker, Cadence and Relationships together. Existing recorded state determines what is due.", next: "Use Today’s existing plan and due-work views, or open Relationships for a person’s history. Ask Root does not change cadence or generate a plan.", destinations: ["growth", "relationships", "responses"], questions: ["What should I do next?", "Where do I find Relationships?", "Where are my replies?"] },
  { key: "relationships", title: "Relationships", explanation: "Relationships brings existing person/company evidence and communication history into one read-only view. Opening a relationship does not create a workspace record.", next: "Search for an existing person or company and review their recorded history. Notes, tasks and value saves remain explicit actions in the relationship.", destinations: ["relationships", "responses", "growth"], questions: ["What does this page do?", "Where are my replies?", "What should I do next?"] },
  { key: "resources", title: "Resources", explanation: "Resources contains saved material, starter templates and the existing creator, reader and download tools.", next: "Reopen a saved resource or inspect a template. Generation, saving, artwork requests and downloads remain explicit actions in Resources.", destinations: ["resources", "campaigns", "publishing"], questions: ["What does this page do?", "How do I create a campaign?", "Where do I publish something?"] },
  { key: "connect", title: "Connect", explanation: "Connect explains recorded account connections, available capabilities, limitations and setup steps. A connected account is not proof that every platform action is supported.", next: "Open the relevant channel card to see its recorded status and next step. Ask Root cannot connect, disconnect, test or refresh an account.", destinations: ["connect"], questions: ["Where do I connect accounts?", "What does this page do?", "What should I do next?"] },
];

export function guideWorkspace(route: unknown): GuideWorkspace | null {
  if (typeof route !== "string" || route.length > 240 || !/^\/dashboard(?:\/[a-zA-Z0-9_-]+)*$/.test(route)) return null;
  const exact = Object.entries(guideDestinations).find(([, d]) => d.path === route);
  const key: GuideDestination | undefined = exact?.[0] as GuideDestination | undefined;
  if (key) return catalogue.find(w => w.key === key) || null;
  if (route.startsWith("/dashboard/growth/relationships/")) return catalogue.find(w => w.key === "relationships")!;
  if (route.startsWith("/dashboard/responses/linkedin/")) return catalogue.find(w => w.key === "linkedin")!;
  if (["/dashboard/growth/followups", "/dashboard/growth/waiting", "/dashboard/growth/pipeline", "/dashboard/growth/import", "/dashboard/growth/tracker", "/dashboard/growth/cadence-report"].includes(route)) return catalogue.find(w => w.key === "growth")!;
  if (route === "/dashboard/connect/threads-manual") return catalogue.find(w => w.key === "connect")!;
  return null;
}

export function guideDestination(id: unknown, organisationId: string, founderAllowed = false, relationshipRoute?: string): GuideLink | null {
  if (typeof id !== "string" || !Object.prototype.hasOwnProperty.call(guideDestinations, id) || (id === "founder" && !founderAllowed)) return null;
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(organisationId)) return null;
  const destination = guideDestinations[id as GuideDestination];
  const path = id === "relationships" && relationshipRoute && /^\/dashboard\/growth\/relationships\/(?:inbox|target|acquisition|founder|workspace)_[a-f0-9-]{36}$/i.test(relationshipRoute) ? relationshipRoute : destination.path;
  return { id: id as GuideDestination, label: destination.label, href: `${path}?organisationId=${encodeURIComponent(organisationId)}` };
}
export type GuideLink = {id:GuideDestination;label:string;href:string};
export type OpsCoachContext = {kind:"source";table:"inbox_items"|"growth_targets"|"acquisition_items";id:string} | {kind:"company";name:string} | {kind:"object";table:"resource_library"|"campaigns"|"sequences"|"scheduled_posts";id:string};
export type GuideAnswer = { draftOnly?: boolean; context?: OpsCoachContext; workspace: string; message: string; destinations: GuideLink[]; relationshipRoute?: string; relationshipChoices?: { label: string; route: string }[] };
// Only server-verified evidence may be passed here; client counts are never trusted by /api/coach.
export type GuideEvidence = { responseAttentionCount: number };
export function guideAnswer(route: unknown, question: unknown, organisationId: string, founderAllowed: boolean, evidence?: GuideEvidence): GuideAnswer {
  const workspace = guideWorkspace(route);
  if (typeof question !== "string" || !question.trim() || question.length > 600) throw Error("Ask a question of 1–600 characters.");
  const q = question.trim().toLowerCase();
  let ids: readonly GuideDestination[] = workspace?.destinations || ["home"];
  let message = workspace ? `${workspace.explanation} ${workspace.next}` : "I don’t have a verified guide for this page. Open Home to find the existing workspaces; I won’t guess which features are available here.";
  if (!workspace) return { workspace: "Unrecognized page", message, destinations: [guideDestination("home", organisationId)!].filter(Boolean) };
  if (workspace.key === "founder" && !founderAllowed) return { workspace: "Restricted workspace", message: "Founder access has not been confirmed for this workspace. Open Home to continue with your available work.", destinations: [guideDestination("home", organisationId)!].filter(Boolean) };
  if (/^(?:please\s+)?(?:send|publish|approve|reject|delete|dismiss|create|generate|connect|disconnect|schedule|change|update|mark|run|import)\b/.test(q)) {
    message = "I can explain the workflow and help you find it, but I cannot execute actions, generate outreach, send, publish, approve or change records. Use the existing workspace controls after your own review.";
  } else if (/diary/.test(q)) { message="Open Diary for Today, Week and Month: recorded dated follow-ups, calls and open tasks. External calendar sync and standalone entries are not available."; ids=["diary"];
  } else if (/what does (?:this )?status mean|what is follow.up due/.test(q)) {
    message="Follow-up due means the existing recorded cadence has reached a follow-up time. Needs reply means recorded inbound work needs review; waiting means no reply is currently due. A status or schedule does not prove delivery. Open the selected record for its actual state and evidence.";
  } else if (/presentation|saved resources|where.*resources/.test(q)) {
    message="Open Resources to reopen saved material or choose the existing presentation creator/template. Review the audience slides and private presenter guidance separately; creation and saving use the existing explicit Resources controls."; ids=["resources"];
  } else if (/founder/.test(q)) {
    message = founderAllowed ? "Founder is the protected research workspace. You can reopen stored research and review its sources and activity there." : "Founder is permission-restricted. Your access has not been confirmed, so I cannot offer that destination. Home shows the workspaces available to you.";
    ids = founderAllowed ? ["founder"] : ["home"];
  } else if (/linkedin.*outreach|outreach.*linkedin/.test(q)) {
    message = "LinkedIn Outreach is available from Responses. Its existing Fresh, Catch-up and follow-up views show eligible work; replies belong in Responses. Ask Root can suggest unsent wording for review; it never sends or confirms a message."; ids = ["linkedin", "responses"];
  } else if (/repl(?:y|ies)|responses/.test(q)) {
    const count = evidence?.responseAttentionCount;
    message = Number.isSafeInteger(count) && count! >= 0
      ? `You have ${count} ${count === 1 ? "reply needing" : "replies needing"} attention in the supplied verified Responses snapshot. Open Responses to check the current conversation and filters.`
      : "Open Responses to check current replies. A live attention count is not available to Ask Root. Needs reply shows unresolved work; All statuses also includes handled history.";
    ids = ["responses", "linkedin"];
  } else if (/relationship/.test(q)) { message = "Open Relationships in Growth to search existing people and companies and review their available history. Opening a record is read-only."; ids = ["relationships", "growth"]; }
  else if (/campaign/.test(q)) { message = "Open Campaign Studio, enter the campaign details and use Create a campaign there. Its existing suggestions guide planning and assets. I have not created or started anything."; ids = ["campaigns"]; }
  else if (/scheduled|schedule.*post/.test(q)) { message = "Open Scheduled posts to inspect the recorded schedule and status. Scheduled is not proof of publication; I have not changed any dates."; ids = ["scheduled", "publishing"]; }
  else if (/approval/.test(q)) { message = "Open Approvals to review pending content and recorded decisions. Approval and publication remain separate explicit actions."; ids = ["approvals", "publishing"]; }
  else if (/publish|posting|post something/.test(q)) { message = "Open Publishing to prepare content and review the selected channels. Use Scheduled posts or Approvals for those existing workflows. Ask Root cannot publish or approve anything."; ids = ["publishing", "scheduled", "approvals"]; }
  else if (/connect.*account|account.*connect|channel/.test(q)) { message = "Open Connect to review recorded accounts, capabilities and setup instructions. Connection status does not establish sending or publishing capability. I have not changed or tested any connection."; ids = ["connect"]; }
  else if (/acquisition|opportunit/.test(q)) { message = "Acquisition holds opportunities with source evidence and existing lane/status filters. Review the recorded qualification and next action there. I cannot rank your live queue without its verified evidence or qualify/contact anyone for you."; ids = ["acquisition", "relationships"]; }
  else if (!/what.*(?:page|mean|next|do)|explain|help/.test(q)) { message = `I can help explain ${workspace.title} and find existing features, but I don’t have a verified instruction for that question. ${workspace.explanation}`; }
  return { workspace: workspace.title, message, destinations: ids.map(id => guideDestination(id, organisationId, founderAllowed)).filter((d): d is GuideLink => d !== null) };
}

/** Validate server-returned exact destinations again before rendering a link. */
export function guideAnswerDestination(destination: GuideLink, organisationId: string, founderAllowed: boolean, relationshipRoute?: string) {
 const fallback=guideDestination(destination.id,organisationId,founderAllowed,relationshipRoute);
 if(!fallback || typeof destination.href!=="string")return null;
 try {
  const url=new URL(destination.href,"https://ops.invalid");
  if(url.origin!=="https://ops.invalid" || url.searchParams.get("organisationId")!==organisationId || [...url.searchParams.keys()].some(k=>k!=="organisationId" && !(destination.id==="resources" && k==="resourceId")) || url.hash)return null;
  const resourceSelection=destination.id==="resources" && url.pathname==="/dashboard/resources" && /^[a-f0-9-]{36}$/i.test(url.searchParams.get("resourceId")||"");
  const exact=resourceSelection ||destination.id==="relationships" && /^\/dashboard\/growth\/relationships\/(?:inbox|target|acquisition|workspace)_[a-f0-9-]{36}$/i.test(url.pathname) || destination.id==="resources" && /^\/dashboard\/resources\/(?:present|presenter)\/[a-f0-9-]{36}$/i.test(url.pathname);
  return exact ? {...fallback,href:url.pathname+url.search,label:destination.label.slice(0,120)} : destination.href===fallback.href ? fallback : null;
 } catch {return null;}
}
