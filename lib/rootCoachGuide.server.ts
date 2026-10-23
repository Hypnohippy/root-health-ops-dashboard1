import { diaryQuestion } from "@/lib/diary";
import { diaryAnswer } from "@/lib/diary.server";
import { opsCoachContextAnswer, opsQuestionSubject, pageHelpQuestion, contextFollowup, parseOpsContext } from "@/lib/opsCoachContext.server";
import { relationshipCoachAnswer, relationshipGuideLocator, relationshipCandidateName, relationshipQuestionCandidates, relationshipIntent, blockedRelationshipAction } from "@/lib/relationshipCoach.server";
import type { RelationshipTenant } from "@/lib/relationshipWorkspace.server";
import { guideAnswer, type GuideAnswer } from "@/lib/rootCoachGuide";
import { requireFounderIntelligence } from "@/lib/founderIntelligenceAuth.server";

export async function rootCoachGuidance(body: Record<string, unknown>, tenant: RelationshipTenant, reason?: (question: string, evidence: string, intent: ReturnType<typeof relationshipIntent>) => Promise<string>): Promise<GuideAnswer> {
  const allowed = new Set(["mode", "organisationId", "organisation_id", "route", "question", "relationshipRoute", "context", "draftOnly"]);
  if (Object.keys(body).some(key => !allowed.has(key))) throw Error("Guidance accepts only a workspace route and a question.");
  if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 600) throw Error("Invalid question.");
  if (blockedRelationshipAction(body.question)) return {workspace:"Read-only boundary",message:"No action taken. I can explain, interpret, prepare or suggest a draft for review, but cannot send, save, schedule or change records.",destinations:[]};
  if(body.draftOnly!==undefined && typeof body.draftOnly!=="boolean")throw Error("Invalid draft context.");
  const diaryIntent=diaryQuestion(body.question);
  if(diaryIntent || body.route==="/dashboard/diary")return diaryAnswer(tenant,diaryIntent||"overview",body.question,reason);
  const context=parseOpsContext(body.context);
  const explicit=opsQuestionSubject(body.question) || relationshipCandidateName(body.question);
  const pageHelp=pageHelpQuestion(body.question);
  const draftState=body.draftOnly===true && !explicit && !pageHelp && /saved|did.*(?:record|send|save)|already sent/i.test(body.question);
  const draftMessage=/saved|save/i.test(body.question)?"This Ask Root draft has not been saved by this workflow. It remains text for review. I cannot establish whether you separately saved a copy elsewhere.":"This Ask Root draft was not sent or recorded as a send by this workflow. A generated draft does not establish an external send. Review the linked stored receipts/history for any separately recorded message.";
  const hint=body.relationshipRoute===undefined?null:relationshipGuideLocator(body.relationshipRoute);
  if(body.relationshipRoute!==undefined&&!hint)throw Error("Invalid relationship context.");
  let locator = pageHelp ? null : relationshipGuideLocator(body.route) || (!explicit && hint && contextFollowup(body.question) ? hint : null);
  if(locator && !pageHelp) {
    const {grounding,...selected}=await relationshipCoachAnswer(tenant,locator,body.question);
    const subject=explicit?.toLowerCase().replace(/\b(?:today|yesterday|now)\b/g,"").replace(/^i last (?:email|emailed)\s+/i,"").trim();
    const label=selected.workspace.replace(/^Relationship: /,"").toLowerCase();
    // Subject labels only determine whether to keep the explicit selection; never join identities.
    if(!subject || subject.split(/\s+/).every(term=>label.split(/\s+/).includes(term))) {
      if(draftState)return {...selected,draftOnly:true,message:draftMessage};
      if(reason)try{return {...selected,message:await reason(body.question,grounding||selected.message,relationshipIntent(body.question))+"\n\nRecorded grounding:\n"+selected.message};}catch{return {...selected,message:selected.message+"\n\nAdvice is temporarily unavailable. No draft was sent or saved."};}
      return selected;
    }
  }
  if(explicit && !pageHelp) {
    const matches=await relationshipQuestionCandidates(tenant,explicit.replace(/\s+(?:today|yesterday|now)$/i,""));
    if(matches.locator) {
      const {grounding,...selected}=await relationshipCoachAnswer(tenant,matches.locator,body.question);
      if(reason)try{return {...selected,message:await reason(body.question,grounding||selected.message,relationshipIntent(body.question))+"\n\nRecorded grounding:\n"+selected.message};}catch{return {...selected,message:selected.message+"\n\nAdvice is temporarily unavailable. No draft was sent or saved."};}
      return selected;
    }
    if(matches.choices.length)return {workspace:"Choose a relationship",message:"Choose the recorded relationship you mean. I have not established a unique safe identity. These source associations remain unresolved; no identities have been merged.",relationshipChoices:matches.choices,destinations:[]};
  }
  // Explicit subjects always outrank the current page or a previous conversation.
  const contextual=(!locator || explicit || context) && !pageHelp ? await opsCoachContextAnswer(tenant,body.question,explicit?null:contextFollowup(body.question)?context:null,explicit,body.route) : null;
  if(contextual?.context?.kind==="source") {
    const prefix=({inbox_items:"inbox",growth_targets:"target",acquisition_items:"acquisition"} as const)[contextual.context.table];
    const {grounding,...canonical}=await relationshipCoachAnswer(tenant,`${prefix}_${contextual.context.id}`,body.question);
    const selected={...canonical,context:contextual.context};
    if(draftState)return {...selected,draftOnly:true,message:draftMessage};
    if(reason)try{return {...selected,message:await reason(body.question,grounding||selected.message,relationshipIntent(body.question))+"\n\nRecorded grounding:\n"+selected.message};}catch{return {...selected,message:selected.message+"\n\nAdvice is temporarily unavailable. No draft was sent or saved."};}
    return selected;
  }
  if(contextual) {
    const {grounding,stateSummary,...answer}=contextual;
    if(draftState)return {...answer,draftOnly:true,message:draftMessage};
    const intent=/draft/i.test(body.question)?"draft":/what should|what do I do|reply|respond|next/i.test(body.question)?"advice":"factual";
    if(intent!=="factual" && reason)try{return {...answer,draftOnly:true,message:(stateSummary?stateSummary+"\n\n":"")+(await reason(body.question,grounding||answer.message,intent)).replace(/^Recommendation \(for review\): /,"").replace(/\n\nEvidence-based reasoning: /g,"\n\n").replace(/\n\nInterpretation — not recorded fact: /g,"\n\nPossible interpretation: ").replace(/\n\nUncertainty \/ questions to check: /g,"\n\nTo confirm: ")+"\n\nOpen the linked records to review the recorded evidence. Drafts remain unsent."};}catch{return {...answer,message:answer.message+"\n\nAdvice is temporarily unavailable. No draft was sent or saved."};}
    return answer;
  }
  const name=pageHelp?null:explicit;
  if(name)locator=null;
  const candidates = !locator && name ? await relationshipQuestionCandidates(tenant,name) : null;
  if(candidates)locator=candidates.locator;
  const intent=relationshipIntent(body.question);
  // A global follow-up may retain a previously selected exact locator; it is
  // re-authorized and re-checked against Truth on every request, never trusted.
  if(!pageHelp&&!locator&&!name&&hint&&(intent!=="factual"||/this relationship|our history|latest interaction|emailed (?:him|her|them)|what is uncertain|saved|record|due|where.*(?:it|this)/i.test(body.question)))locator=hint;
  if (!locator && (name || intent!=="factual"))return {workspace:"Choose a relationship",message:"I could not establish one unique safe relationship for this question. Open Relationships and choose the correct record; I will not guess from a name, company or domain.",destinations:[{id:"relationships",label:"Relationships",href:`/dashboard/growth/relationships?organisationId=${encodeURIComponent(tenant.organisationId)}`}],...(candidates?.choices.length?{relationshipChoices:candidates.choices,message:"I found possible tenant-owned records, but have not established a unique identity. Choose the relationship record you mean; opening it does not confirm or merge identity."}:{})};
  if (locator) {
    const {grounding,...answer}=await relationshipCoachAnswer(tenant,locator,body.question);
    if(draftState)return {...answer,draftOnly:true,message:draftMessage};
    if (reason || intent!=="factual") {
      if (!reason) return {...answer,message:answer.message+"\n\nAdvice is unavailable. No draft was sent or saved."};
      try { const advice=await reason(body.question,grounding||answer.message,intent);return {...answer,draftOnly:intent==="draft"||intent==="advice",message:advice+"\n\nRecorded grounding:\n"+answer.message}; }
      catch { return {...answer,message:answer.message+"\n\nAdvice is temporarily unavailable. Please review the linked evidence; no draft was sent or saved."}; }
    }
    return answer;
  }
  if (!pageHelp && typeof body.route === "string" && body.route.startsWith("/dashboard/growth/relationships/")) throw Error("Relationship unavailable.");
  let founderAllowed = false;
  try { await requireFounderIntelligence(tenant.organisationId); founderAllowed = true; }
  catch { /* Unavailable permission evidence never exposes a protected destination. */ }
  // No page HTML, conversation text, user-provided URLs, counts or operational tools.
  // Generic workspace fallback follows the contextual evidence paths above.
  return guideAnswer(body.route, body.question, tenant.organisationId, founderAllowed);
}
