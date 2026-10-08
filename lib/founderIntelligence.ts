export const founderIntelligenceLanes = ["ops_distribution","health_referral","ops_user_channel","open_intelligence"] as const;
export type FounderIntelligenceLane = typeof founderIntelligenceLanes[number];
export type FounderSource = { url:string; title:string; sourceType:"official"|"reputable"|"other"; publishedAt:string|null };
export type FounderContact = { name:string; role:string; why:string; confidence:"high"|"medium"|"low"; directEmail:string|null; emailStatus:"verified"|"not_found"; linkedinUrl:string|null; officialContactUrl:string|null; publicPhone:string|null; location:string|null; sourceUrls:string[] };
export type FounderDiscoveryItem = { name:string; website:string|null; country:string|null; fitScore:number; why:string; audience:string; partnershipMechanism:string; evidenceSummary:string; sourceUrls:string[] };
export type FounderDeepResearch = {
  name:string; website:string|null; lane:FounderIntelligenceLane; score:number; strategicFitScore:number; channelReadinessScore:number; evidenceConfidence:"high"|"medium"|"low";
  strategicFit:string; audienceFit:string; channelReadiness:string; entityNotes:string[];
  memberSuccessDependencyScore:number; memberSuccessValue:string;
  valueExchange:{theyGive:string[];weGive:string[];moneyFlow:string[];successMeasures:string[]};
  economicModels:string[]; currentSignals:string[]; risks:string[]; recommendedApproach:string; contactRoles:string[]; contacts:FounderContact[]; questions:string[];
  sourceUrls:string[]; publicSources:FounderSource[];
};
export function founderLaneLabel(lane:FounderIntelligenceLane){return ({ops_distribution:"Ops distribution partners",health_referral:"Root Health referrers",ops_user_channel:"Ops user channels",open_intelligence:"Open company intelligence"} as const)[lane];}
export function parseFounderLane(value:unknown):FounderIntelligenceLane{const lane=String(value||"");if(!founderIntelligenceLanes.includes(lane as FounderIntelligenceLane))throw Error("Choose a valid Founder Intelligence lane.");return lane as FounderIntelligenceLane;}
export function cleanFounderQuery(value:unknown,max=1800){const q=typeof value==="string"?value.trim():"";if(!q)throw Error("Describe what you want to find.");if(q.length>max)throw Error("Search request is too long.");return q;}
