export const founderIntelligenceLanes = ["workplace_buyers","personal_partners","workplace_introducers","open_intelligence"] as const;
const legacyFounderLanes = ["ops_distribution","health_referral","ops_user_channel"] as const;
export type FounderIntelligenceLane = typeof founderIntelligenceLanes[number] | typeof legacyFounderLanes[number];
export const founderGeographies = ["UK","Europe","Global"] as const;
export type FounderGeography = typeof founderGeographies[number];
export type FounderSource = { url:string; title:string; sourceType:"official"|"reputable"|"other"; publishedAt:string|null };
export type FounderContact = { name:string; role:string; why:string; confidence:"high"|"medium"|"low"; rank:number; contactType:"primary"|"secondary"|"sponsor"|"specialist"; directEmail:string|null; emailStatus:"verified"|"not_found"; linkedinUrl:string|null; officialContactUrl:string|null; publicPhone:string|null; location:string|null; sourceUrls:string[] };
export type FounderOrganisationRoute = { generalEmail:string|null; publicPhone:string|null; officialContactUrl:string|null; note:string|null; sourceUrls:string[] };
export type FounderEmailDraft = { subject:string; body:string };
export type FounderDiscoveryItem = { name:string; website:string|null; country:string|null; operatingCountries?:string[]; geographyEvidence?:string; organisationType?:string; fitScore:number; why:string; audience:string; partnershipMechanism:string; evidenceSummary:string; sourceUrls:string[] };
export type FounderDeepResearch = {
  name:string; website:string|null; lane:FounderIntelligenceLane; geography?:FounderGeography; score:number; strategicFitScore?:number; channelReadinessScore?:number; evidenceConfidence:"high"|"medium"|"low";
  strategicFit:string; audienceFit:string; channelReadiness?:string; entityNotes:string[];
  memberSuccessDependencyScore?:number; memberSuccessValue?:string;
  organisationalFitScore?:number; buyerRelevanceScore?:number; timingEvidenceScore?:number;
  organisationalFit?:string; buyerRelevance?:string; timingEvidence?:string;
  audienceRelevanceScore?:number; distributionReachScore?:number; referralPracticalityScore?:number; trustBrandFitScore?:number; decisionMakerRouteScore?:number; activationLikelihoodScore?:number;
  employerClientAccessScore?:number; strategicComplementarityScore?:number; sectorReachScore?:number; conflictRiskScore?:number; introducerPotentialScore?:number;
  valueExchange:{theyGive:string[];weGive:string[];moneyFlow:string[];successMeasures:string[]};
  economicModels:string[]; currentSignals:string[]; risks:string[]; recommendedApproach:string; contactRoles:string[]; contacts:FounderContact[]; organisationRoute:FounderOrganisationRoute|null; questions:string[];
  sourceUrls:string[]; publicSources:FounderSource[];
};
export function founderLaneLabel(lane:FounderIntelligenceLane){return ({workplace_buyers:"Employer prospects",personal_partners:"Personal Root partners",workplace_introducers:"Workplace introducers",ops_distribution:"Ops distribution partners",health_referral:"Root Health referrers",ops_user_channel:"Ops user channels",open_intelligence:"Open intelligence"} as const)[lane];}
export function parseFounderLane(value:unknown):FounderIntelligenceLane{const lane=String(value||"");if(![...founderIntelligenceLanes,...legacyFounderLanes].includes(lane as FounderIntelligenceLane))throw Error("Choose a valid Founder Intelligence lane.");return lane as FounderIntelligenceLane;}
export function parseFounderGeography(value:unknown):FounderGeography{if(value===undefined||value===null||value==="")return "UK";if(!founderGeographies.includes(value as FounderGeography))throw Error("Choose UK, Europe or Global.");return value as FounderGeography;}
export function founderPromotionDefault(lane:FounderIntelligenceLane):"b2b_lead"|"partner_opportunity"|null{return lane==="workplace_buyers"?"b2b_lead":lane==="open_intelligence"?null:"partner_opportunity";}
export function founderStarterPrompt(lane:FounderIntelligenceLane){return ({workplace_buyers:"Find genuine employers with workforce pressure, frontline or shift exposure, and a credible HR/People/Wellbeing buyer route for Root Health.",personal_partners:"Find organisations with relevant audiences and practical routes to distribute the Personal Root app or Capacity Check.",workplace_introducers:"Find HR consultancies, OH/EAP providers, benefits advisers and other channels with genuine employer-client access that could introduce Root Health.",open_intelligence:"Research organisations that could create meaningful commercial opportunities for Root Health or Root Health Ops.",ops_distribution:"Find organisations that could distribute Root Health Ops to practitioners.",health_referral:"Find Root Health referral partners.",ops_user_channel:"Find scalable practitioner channels."} as const)[lane];}
export function founderResearchMetrics(r:FounderDeepResearch){
 const fields:readonly (readonly [keyof FounderDeepResearch,string])[]=r.lane==="workplace_buyers"?[["organisationalFitScore","Organisational Fit"],["buyerRelevanceScore","Buyer Relevance"],["timingEvidenceScore","Timing & Evidence"]]:r.lane==="personal_partners"?[["audienceRelevanceScore","Audience relevance"],["distributionReachScore","Distribution reach"],["referralPracticalityScore","Referral practicality"],["trustBrandFitScore","Trust / brand fit"],["decisionMakerRouteScore","Decision-maker route"],["activationLikelihoodScore","Activation potential"]]:r.lane==="workplace_introducers"?[["employerClientAccessScore","Employer-client access"],["channelReadinessScore","Channel readiness"],["strategicComplementarityScore","Strategic complementarity"],["sectorReachScore","Sector reach"],["conflictRiskScore","Conflict risk"],["introducerPotentialScore","Introducer potential"]]:[["strategicFitScore","Strategic Fit"],["channelReadinessScore","Channel Readiness"],...(r.memberSuccessDependencyScore!==undefined?[["memberSuccessDependencyScore","Member / Graduate Success Dependency"] as const]:[])];
 return fields.map(([key,label])=>({key,label,score:typeof r[key]==="number"?r[key] as number:null}));
}
export function cleanFounderQuery(value:unknown,max=1800){const q=typeof value==="string"?value.trim():"";if(!q)throw Error("Describe what you want to find.");if(q.length>max)throw Error("Search request is too long.");return q;}
