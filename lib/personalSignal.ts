import { safePublicDraft } from "@/lib/socialCommentOpportunity";
import { AcquisitionWorkflowError } from "@/lib/acquisitionWorkflow";
export type PersonalSignalItem = {source_engine:string;record_type:string;source_record_id?:string;source_url:string|null;status:string;metadata:Record<string,unknown>;reason?:string|null;signal?:string|null;engine_state?:{opportunity_type?:string|null}|null;evidence?:string|null;acquisition_item_events?:{action:string;created_at:string;previous_status?:string;new_status?:string;note?:string|null;outcome?:string|null}[]};
const exactText=(v:unknown)=>typeof v==="string"&&v.trim()?v:null;
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
function qualifiedDiscussion(item:PersonalSignalItem){
 if(item.source_engine!=="root_health_personal"||!["personal_opportunity","social_opportunity"].includes(item.record_type)||!item.source_record_id)return null;
 const m=item.metadata||{},s=object(m.engine_safety);
 if(s.public_context!==true||s.consumer_outreach!==false||s.health_targeting!==false||s.verified_direct_discussion!==true)return null;
 if(/search.?demand|article|blog|partner|referr/i.test(String(m.lane||"")+" "+String(m.opportunity_type||"")+" "+String(m.content_type||"")+" "+String(m.sheet_tab||"")+" "+String(item.engine_state?.opportunity_type||"")))return null;
 let url:URL;try{url=new URL(item.source_url||"");}catch{return null;}
 if(url.protocol!=="https:"||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase().replace(/^(www|m)\./,"");
 const platform=["reddit.com","old.reddit.com","new.reddit.com"].includes(host)&&/\/comments\/[^/]+/.test(url.pathname)?"Reddit":host==="facebook.com"&&(/\/(posts|videos|reel)\/[^/]+/.test(url.pathname)||(/\/(permalink|story)\.php$/.test(url.pathname)&&!!url.searchParams.get("story_fbid")))?"Facebook":host==="instagram.com"&&/^\/(p|reel)\/[^/]+/.test(url.pathname)?"Instagram":["threads.net","threads.com"].includes(host)&&/\/post\/[^/]+/.test(url.pathname)?"Threads":["x.com","twitter.com"].includes(host)&&/\/status\/[^/]+/.test(url.pathname)?"X":host==="linkedin.com"&&(/\/posts\/[^/]+|\/feed\/update\/urn:li:/.test(url.pathname))?"LinkedIn":host==="tiktok.com"&&/\/video\/[^/]+/.test(url.pathname)?"TikTok":null;
 const original=exactText(m.original_post)||exactText(m.post_text);
 const context=item.reason||item.signal||item.evidence||"";
 const theme=String(m.theme||item.signal||"");
 if(!platform||!original||/suicid|self[- ]harm|kill myself|end my life|immediate danger/i.test(original)||!/fatigue|exhaust|stress|burnout|sleep|switch off|overwhelm|focus|brain fog|motivation|recover|diet|routine|craving|run down|wellbeing/i.test(theme+" "+context+" "+original))return null;
 const reply=exactText(m.prepared_reply)||exactText(m.reply_draft)||(m.draft_kind==="public_reply"?exactText(m.prepared_draft):null);
 return {platform,theme:theme||"Personal wellbeing",context,original,reply:reply&&safePublicDraft(reply)?reply:null,url:url.href};
}
// Public availability is evidence, never permission to interact with a person.
export function personalSocialActionType(item:PersonalSignalItem){
 const evidence=qualifiedDiscussion(item);if(!evidence)return null;
 const m=item.metadata;
 if(evidence.platform==="Reddit"||m.action_type==="CONTENT_SIGNAL")return "CONTENT_SIGNAL";
 if(evidence.platform==="LinkedIn")return "PUBLIC_RESPONSE";
 return m.action_type==="PUBLIC_RESPONSE"&&m.public_engagement_surface_verified===true&&exactText(m.public_engagement_surface_evidence)?"PUBLIC_RESPONSE":"CONTENT_SIGNAL";
}
export function personalSignal(item:PersonalSignalItem){return personalSocialActionType(item)==="PUBLIC_RESPONSE"?qualifiedDiscussion(item):null;}
export function contentSignal(item:PersonalSignalItem){
 if(personalSocialActionType(item)!=="CONTENT_SIGNAL")return null;
 const evidence=qualifiedDiscussion(item)!;const m=item.metadata;
 return {...evidence,reply:null,angle:exactText(m.content_angle),assetType:exactText(m.content_asset_type),cta:exactText(m.content_cta),relevance:exactText(m.content_relevance)};
}
export function personalSocialActionAllowed(item:PersonalSignalItem,action:string){
 const content=item.source_engine==="root_health_personal"&&(item.metadata?.action_type==="CONTENT_SIGNAL"||personalSocialActionType(item)==="CONTENT_SIGNAL");
 return !content||!(["route_responses","prepare_outreach","route_outreach","mark_engaged","mark_converted",...personalSignalActions] as string[]).includes(action);
}
export const personalSignalActions=["personal_responded","personal_engaged","personal_capacity_check","personal_signup","personal_subscriber"] as const;
export function personalFunnel(item:PersonalSignalItem){
 if(item.status==="converted")return "Subscriber";
 if(["dismissed","lost","nurture"].includes(item.status))return item.status.charAt(0).toUpperCase()+item.status.slice(1);
 const events=item.acquisition_item_events||[];
 if(events.some(e=>e.action==="personal_signup"))return "Signup";
 if(events.some(e=>e.action==="personal_capacity_check"))return "Capacity Check";
 if(item.status==="engaged")return "Engaged";
 if(item.status==="actioned")return "Responded";
 return "Found";
}
export function planPersonalSignalAction(item:PersonalSignalItem,action:string,confirmed:unknown){
 if(!personalSignal(item))throw new AcquisitionWorkflowError("This record is not a verified Personal Signal.");
 if(confirmed!==true)throw new AcquisitionWorkflowError("Explicitly confirm the external action or milestone.");
 const allowed:Record<string,string[]>={personal_responded:["new","reviewing","accepted"],personal_engaged:["actioned"],personal_capacity_check:["engaged"],personal_signup:["engaged"],personal_subscriber:["engaged"]};
 if(!allowed[action])throw new AcquisitionWorkflowError("Unsupported Personal Signal action.");
 if(!allowed[action].includes(item.status))throw new AcquisitionWorkflowError("This action is not available from the current status.",409);
 const stage=personalFunnel(item);
 if(action==="personal_capacity_check"&&stage!=="Engaged"||action==="personal_signup"&&stage!=="Capacity Check"||action==="personal_subscriber"&&stage!=="Signup")throw new AcquisitionWorkflowError("Confirm the preceding funnel milestone first.",409);
 const nextStatus=action==="personal_responded"?"actioned":action==="personal_subscriber"?"converted":"engaged";
 const outcome=({personal_responded:"Responded",personal_engaged:"Engaged",personal_capacity_check:"Capacity Check",personal_signup:"Signup",personal_subscriber:"Subscriber"} as Record<string,string>)[action];
 return {action,nextStatus,outcome,destination:null,marksActioned:action==="personal_responded"};
}
