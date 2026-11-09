import type {SalesPlaybook,ScriptNavigation} from './meetingAdaptiveCoach';
import type {PracticeKnowledgeItem,PracticeKnowledgePack} from './meetingPracticeKnowledge';

export type PracticeBuyerClassification='normal_response'|'objection'|'direct_question'|'clear_acceptance'|'not_ready'|'clear_rejection';
export type PracticeBuyerSellerPromptContext=
 |{kind:'uploaded_playbook_wording';id:string;section:string;text:string}
 |{kind:'verified_seller_turn';id:'verified-seller-turn';section:string;text:string};

/** Resolve buyer-generation context without treating a local Knowledge ID as playbook authority. */
export function resolvePracticeBuyerSellerPromptContext(input:{playbook:SalesPlaybook;activeWordingId:string;currentScriptStepId:string;sellerTurnText:string}):PracticeBuyerSellerPromptContext|null{
 const id=input.activeWordingId,step=input.playbook.scriptSteps.find(item=>item.id===id),branch=input.playbook.objectionBranches.find(item=>item.id===id),currentStep=input.playbook.scriptSteps.find(item=>item.id===input.currentScriptStepId),claimIndex=/^claim-([1-9]\d*)$/.exec(id),claim=claimIndex?input.playbook.approvedClaims[Number(claimIndex[1])-1]:undefined,section=branch?'objections':step?.section||currentStep?.section;
 if(section&&(step||branch))return {kind:'uploaded_playbook_wording',id,section,text:branch?.response||step!.text};
 if(claim&&section)return {kind:'uploaded_playbook_wording',id,section,text:claim};
 // Knowledge is prepared from a user-provided local source and is not available as server-side playbook content.
 // The seller transcript is already server-attested, so it is safe buyer context without calling it approved wording.
 if(/^knowledge:[a-z0-9._:-]{1,160}$/i.test(id)&&currentStep&&input.sellerTurnText.trim())return {kind:'verified_seller_turn',id:'verified-seller-turn',section:currentStep.section,text:input.sellerTurnText.trim()};
 return null;
}
export type PracticeTerminalOutcome='interested_follow_up'|'not_ready'|'declined';
export type PracticeTerminalPhase='active'|'close_pending'|'practice_complete'|'rejected'|'recoverable_failure';

/** Only an explicitly designated soft-close final step completes the seller's script. */
export function isPracticeSoftCloseTerminalStep(step:{id:string;section:string}|null|undefined,steps:SalesPlaybook['scriptSteps']):boolean{
 if(!step||!steps.length||step.section!=='soft_close')return false;
 return steps.at(-1)?.id===step.id;
}

const rejection=/\b(not interested|no thanks|no thank you|decline|stop contacting|do not contact|don't contact|not for us|we won't proceed|we will not proceed)\b/i;
const questionLead=/\b(what|how|why|where|when|who|which|can you|could you|would you|does it|do you|is it|are there|tell me|explain)\b/i;
const objection=/\b(not sure|unsure|concern(?:ed)?|worried|no capacity|no budget|not a priority|too expensive|too much|won't work|doesn't fit|not fit|problem with|issue with)\b/i;
const materialObjection=/\b(no capacity|no budget|not a priority|too expensive|too much|won't work|doesn't fit|not fit|problem with|issue with|concern(?:ed)? about|worried about|we have concerns? about|our concern is|we (?:do not|don't) have (?:the )?(?:capacity|budget|time|resources|headcount)|(?:can't|cannot) (?:adopt|implement|use|consider|fund|commit|proceed))\b/i;
const acceptance=/\b(yes|sounds good|that works|works for me|let's (?:do|schedule|book|set up)|i'm interested|i am interested|happy to|i'd be open|i would be open|agree|go ahead|ready to)\b/i;
const notReady=/\b(not ready|need (?:some )?time|need to think|think about it|not yet|maybe later|unsure|a bit unsure|still deciding|no time right now|too busy right now)\b/i;

/** Classifies only the already role-validated synthetic buyer utterance. A direct question is not an objection by default. */
export function classifyPracticeBuyerTurn(text:string):PracticeBuyerClassification{
 const value=text.trim();
 if(!value)return 'normal_response';
 if(rejection.test(value))return 'clear_rejection';
 // A concrete commercial objection takes precedence even when the buyer phrases it as a question.
 if(materialObjection.test(value))return 'objection';
 if(value.includes('?')&&questionLead.test(value)||/\b(tell me more|can you explain|could you explain|i'd like to know|i would like to know)\b/i.test(value))return 'direct_question';
 if(objection.test(value))return 'objection';
 if(acceptance.test(value))return 'clear_acceptance';
 if(notReady.test(value))return 'not_ready';
 return 'normal_response';
}

const stopWords=new Set(['what','when','where','which','who','whom','whose','why','how','does','did','doing','would','could','should','can','will','the','and','for','from','with','that','this','they','them','you','your','our','their','about','into','usually','specifically','exactly','kind','look','looking','like','mean','much','many','some','tell','please','company','companies','organisation','organisations','organization','organizations','every','result','results','people','team','teams','practice','recommend','recommendations','solution','solutions']);
function normalizeToken(token:string){return token.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ies$/,'y').replace(/s$/,'').replace(/ing$/,'').replace(/ed$/,'');}
function tokens(value:string){return value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!stopWords.has(token));}
export const PRACTICE_QUESTION_INTENTS=['gap_categories','solution_capability','product_capabilities','product_mechanism','employee_proposition','employer_proposition','reporting_visibility','privacy_transparency','data_collection','actionable_recommendations','organisation_adaptation','pricing','signup_process','commitment','comparison','follow_up_detail','outcome_evidence','general'] as const;
export type PracticeQuestionIntent=typeof PRACTICE_QUESTION_INTENTS[number];
function hasPracticeBuyerQuestion(text:string){const value=text.trim();return value.includes('?')||/^(?:what|how|why|where|when|who|which|can you|could you|would you|do you|does|is|are|tell me|explain|show me|give me)\b/i.test(value);}
function questionIntent(question:string,context=''):PracticeQuestionIntent{
 if(!hasPracticeBuyerQuestion(question))return 'general';
 if(/\b(?:case stud(?:y|ies)|success stor(?:y|ies)|proof|evidence|outcomes?|guaranteed results?)\b/i.test(question))return 'outcome_evidence';
 if(/\b(?:different from|compared with|compare with|already have|currently use|existing system)\b/i.test(question))return 'comparison';
  if(/\b(?:privacy|private|anonymous|anonymity|transparent|transparency|individual data|personal information)\b/i.test(question)&&/\b(?:organisation|organisational|organization|organizational|employer|hr|leadership|insight|visibility|see|data)\b/i.test(question))return 'privacy_transparency';
 if(/\b(?:recommendations?|actions?|act on|take action|specific action|what should .* do|how .* lead to .* action|turn .* into action|interventions?)\b/i.test(question))return 'actionable_recommendations';
 if(/\b(?:collect|gather|source of|where .* data|continuous data|participation|check.in|assessment|measure engagement)\b/i.test(question)&&/\b(?:data|insight|evidence|tools?|features?|engagement|participation|measure|continuous)\b/i.test(question))return 'data_collection';
 if(/\b(?:different organisations?|different organizations?|organisation.specific|organization.specific|adapt|tailor|relevant for different|vary by organisation|vary by organization|different organisational needs|different organizational needs)\b/i.test(question))return 'organisation_adaptation';
 if(/\b(?:how much|price|pricing|cost|costs)\b/i.test(question))return 'pricing';
 if(/\b(?:commit|commitment|committed|contract|12[ -]?month|twelve months?|for a year|annual term|cancellation)\b/i.test(question))return 'commitment';
 if(/\b(?:sign up|signup|join|membership application|apply for membership|onboard)\b/i.test(question))return 'signup_process';
 if(/\b(?:what information|what data|what insights?)\b/i.test(question)&&/\b(?:organisation|organization|employer|hr|leadership)\b/i.test(question)&&/\b(?:see|receive|get|access)\b/i.test(question))return 'reporting_visibility';
 if(/\b(?:employee|employees|staff|workforce)\b/i.test(question)&&/\b(?:get|receive|included|access|experience|provided)\b/i.test(question))return 'employee_proposition';
 if(/\b(?:employer|organisation|organization|leadership|hr)\b/i.test(question)&&/\b(?:get|receive|included|provide|gain|benefit)\b/i.test(question))return 'employer_proposition';
 if(/\b(features?|tools?|capabilit(?:y|ies)|offer)\b/i.test(question)&&( /\boffer\b/i.test(question)||/\b(clearer view|clearer picture|organisations?|organizations?|workforce|support)\b/i.test(question)))return 'product_capabilities';
  if(/\b(solutions?|recommend(?:ation|ations)?|interventions?|treatments?|prescribe|address|resolve|deal with)\b/i.test(question))return 'solution_capability';
 if(/\b(follow[ -]?up|next step|next meeting|conversation|appointment)\b/i.test(question))return 'follow_up_detail';
 if(/\bhow\b/i.test(question)&&/\b(?:work|works|operate|operates|actually work)\b/i.test(question))return 'product_mechanism';
 if(/\b(how does|how do|how would|how exactly|what does .* do|what is .* designed to|how .* work)\b/i.test(question))return 'product_mechanism';
  const gapTopic=/\b(gaps?|pressure|bottlenecks?|absence|burnout|stress|manager strain|engagement|wellbeing issues?|well-being issues?|underused support|existing support)\b/i.test(question);
  const asksForAreas=/\b(?:what|which)\s+(?:kinds?|types?|sorts?|areas?|examples?)\b|\bwhat exactly (?:are you )?looking for\b|\bwhere (?:do you|would you|does it) (?:usually )?(?:see|find|show)\b/i.test(question);
  const contextualGap=/\b(gaps?|pressure|absence|burnout|stress|manager strain|engagement|underused support|existing support)\b/i.test(context);
  if(gapTopic||asksForAreas&&contextualGap||/\b(gaps?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction)\b/i.test(question)&&/\b(kind|type|example|what|which|mean|specifically)\b/i.test(question))return 'gap_categories';
 return 'general';
}

/** Add one concise, grounded seller control move to supported answers only. */
export function practiceQuestionControlMove(intent:PracticeQuestionIntent,section:string,question:string):string|null{
 if(/\b(?:eap|employee assistance|existing (?:wellbeing|wellness|support) provider)\b/i.test(question))return 'If it complemented your existing EAP, would there be value in exploring how the two could work together?';
 if(section==='positioning')return 'Would that address the gap you described?';
 if(section==='objections')return 'If we can address that concern, would you be comfortable exploring a next step?';
 if(section==='soft_close')return 'Would a short follow-up to decide whether it is worth exploring be useful?';
 if(intent==='pricing')return 'Does that give you enough to judge whether the range is realistic for your organisation?';
 if(intent==='product_capabilities'||intent==='reporting_visibility'||intent==='employer_proposition')return 'Would that kind of organisational visibility be useful to explore further?';
 if(intent==='privacy_transparency')return 'Would that balance between individual privacy and useful organisational insight fit what you need?';
 if(intent==='data_collection')return 'Would that evidence base help answer the questions you need to resolve?';
 if(intent==='actionable_recommendations')return 'Would that kind of evidence-led action be useful for the issue you described?';
 if(intent==='organisation_adaptation')return 'Would that way of adapting to your organisation’s context be relevant?';
 if(intent==='employee_proposition')return 'Would that sort of support be relevant to the employees you have in mind?';
 if(intent==='commitment'||intent==='signup_process')return 'Would it help to talk through how that could work for your organisation?';
 if(intent==='product_mechanism'||intent==='solution_capability')return 'Does that answer how it works, or is there one part you would like me to clarify?';
 if(intent==='comparison')return 'Would it be useful to explore how that could fit alongside what you already have?';
 if(intent==='gap_categories')return 'Which of those areas is most relevant to what you are seeing?';
 if(intent==='follow_up_detail')return 'Would that be a useful focus for the next conversation?';
 return null;
}
function gapConcepts(sentence:string):string[]{
 const concepts:string[]=[];
 if(/\babsence\b/i.test(sentence))concepts.push('absence');
 if(/\bburnout\b/i.test(sentence))concepts.push('burnout');
 if(/\bstress\b/i.test(sentence))concepts.push('stress');
 if(/\bmanager strain\b/i.test(sentence))concepts.push('manager strain');
 if(/\bengagement\b/i.test(sentence))concepts.push('engagement');
 if(/\b(?:effectiveness|effective use|underused|underutili[sz]ed|underutili[sz]ation|utili[sz]ation|usage)\b.{0,50}\b(?:existing )?(?:support|resources?)\b|\b(?:existing )?(?:support|resources?)\b.{0,50}\b(?:underused|underutili[sz]ed|underutili[sz]ation|utili[sz]ation|usage|effectiveness)\b/i.test(sentence))concepts.push('use or effectiveness of existing support');
 return concepts;
}
function genericGapListConcepts(sentence:string):string[]{
 const match=sentence.match(/\b(?:gaps?|pressure areas?|bottlenecks?|issues?|challenges?|problems?|barriers?|friction points?)\b.{0,80}\b(?:include|including|such as|for example|range from|can be|may include|are|show up in)\b\s+(.+?)(?:[.!?]|$)/i)||sentence.match(/\b(?:things like|examples include|areas such as)\b\s+(.+?)(?:[.!?]|$)/i);
 if(!match)return [];
 return [...new Set(match[1].split(/,|\s+(?:and|or)\s+/i).map(value=>value.trim().replace(/^(?:the|a|an)\s+/i,'').replace(/\s+/g,' ')).filter(value=>tokens(value).length>0&&tokens(value).length<=4))].slice(0,6);
}
function questionAnswerConcepts(sentence:string):string[]{const known=gapConcepts(sentence);return known.length?known:genericGapListConcepts(sentence);}
function exactAnswerRelevance(intent:PracticeQuestionIntent,sentence:string,question:string):number{
 const text=sentence.toLowerCase();
 if(intent==='outcome_evidence')return /\b(?:case stud(?:y|ies)|success stor(?:y|ies)|proven example|approved evidence|measured outcomes?|reduced (?:staff )?(?:absence|burnout)|improved engagement|absence reduction|burnout reduction)\b/i.test(text)?12:0;
 if(intent==='privacy_transparency'){const privacy=/\b(?:privacy|private|anonymous|anonymity|individual employee data|personal information|without seeing individual)\b/i.test(text),visibility=/\b(?:organisation|organization|leadership|employer|hr|insight|transparency|workforce direction|evidence depth|confidence signals)\b/i.test(text);return privacy&&visibility?12:0;}
 if(intent==='data_collection'){const method=/\b(?:assessments?|check-ins?|participation|baseline|evidence base|tracks?|repeated|employees join|contributing|support activity|survey|measure)\b/i.test(text),data=/\b(?:data|evidence|insight|workforce|engagement|organisation|organization|employee)\b/i.test(text);return method&&data?11:0;}
 if(intent==='actionable_recommendations'){const action=/\b(?:recommendations?|proportionate responses?|action|interventions?|what should we do|next actions?)\b/i.test(text),grounding=/\b(?:evidence|measured facts|outcomes?|before and after|business context|strongest current|uncertain|measure)\b/i.test(text);return action&&grounding?12:0;}
 if(intent==='organisation_adaptation'){const context=/\b(?:organisational context|organizational context|business context|workforce|organisation|organization|teams?|participation|needs?)\b/i.test(text),learning=/\b(?:adapt|reflect|relevant|evidence|confidence|context|learning|different|proportionate|as .* develop)\b/i.test(text);return context&&learning?11:0;}
 if(intent==='comparison')return 0;
 if(intent==='gap_categories'){
    const concepts=questionAnswerConcepts(sentence),literalAnswer=/\b(?:gaps?|pressure areas?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction points?)\b.{0,80}\b(?:include|including|such as|for example|range from|can be|may include|are)\b/i.test(text);
   return literalAnswer&&concepts.length>=2?8+concepts.length:0;
 }
 if(intent==='solution_capability'){
  const capabilitySignals=[/\b(designed|helps?|enables?|supports?|provides?|gives?)\b/i,/\b(continu(?:ous|ously)|day to day|daily|regularly|over time)\b/i,/\b(understand|identify|clearer view|show|reveal)\b/i,/\b(survey|surveys|one.off|initiative|initiatives)\b/i,/\b(employee|organisation|organization|support|wellbeing|well-being)\b/i];
  const count=capabilitySignals.filter(pattern=>pattern.test(text)).length;
  return count>=4?count+4:0;
 }
 if(intent==='product_capabilities'){
  const protectedTerms=[...(question.match(/\bMicrosoft Teams\b/ig)||[]),...(question.match(/\b(?:integrations?|guarantees?|guaranteed results?)\b/ig)||[]),...(question.match(/\b\d+(?:\.\d+)?\s*%/g)||[])];if(protectedTerms.some(term=>!text.toLowerCase().includes(term.toLowerCase())))return 0;
  const capabilitySignals=[/\b(features?|reporting_data)\b/i,/\b(root intelligence|organisation insights|organization insights|ask root|executive reviews)\b/i, /\b(evidence|insights|reporting|measures|participation|workforce direction|clearer picture|clearer view)\b/i, /\b(organisation|organization|leadership|hr|employee|workforce)\b/i];
  const count=capabilitySignals.filter(pattern=>pattern.test(text)).length;
  return count>=3?count+5:0;
 }
 if(intent==='employee_proposition')return /\b(every employee receives|personal root experience|assessments|check-ins|mind|journal|practical interventions|voice coach|employees join privately)\b/i.test(text)?10:0;
 if(intent==='employer_proposition'){
  const employerValue=[/\b(leadership|organisation|organization|employer|hr|board|workforce)\b/i,/\b(receives|support|clearer view|insights?|reporting|decisions|evidence|recommendations|question(?:s)? root|test assumptions)\b/i];
  const count=employerValue.filter(pattern=>pattern.test(text)).length;return count===2?8:0;
 }
 if(intent==='reporting_visibility')return /\b(anonymous participation|evidence depth|workforce direction|business context|confidence signals|without seeing individual employee data|board-ready organisational reporting)\b/i.test(text)?10:0;
 if(intent==='pricing')return /(?:£\s?\d[\d,]*(?:\.\d{2})?|bespoke)/i.test(text)&&/\b(?:per month|monthly|membership begins from)\b/i.test(text)?10:0;
 if(intent==='signup_process')return /\b(?:complete the direct membership application|confirm membership|approved application|authorised administrator|secure invitation)\b/i.test(text)?9:0;
 if(intent==='commitment')return /\b(?:12-month|12 month|twelve.month|for a year|normally agreed)\b/i.test(text)?10:0;
 if(intent==='product_mechanism'){
  if(/from application to organisation learning|organisation establishes the membership|employees then join root privately|workforce reach, baseline depth|become more useful as participation, continuity/i.test(text))return 9;
  const mechanismSignals=[/\b(how it works|designed to|helps? .* understand|gives? .* view|gives? employees?|day to day|continuously)\b/i,/\b(show|walk through|understand|identify|support|survey|day to day|continuously)\b/i];
  return mechanismSignals.filter(pattern=>pattern.test(text)).length===2?7:0;
 }
 if(intent==='follow_up_detail'){
  const followUpSignals=[/\b(follow[ -]?up|next step|conversation|appointment|meeting)\b/i,/\b(short|show|walk through|decide|explor|useful)\b/i];
  return followUpSignals.every(pattern=>pattern.test(text))?7:0;
 }
 const questionTerms=new Set(tokens(question)),sentenceTerms=new Set(tokens(sentence));
 const overlap=[...questionTerms].filter(term=>sentenceTerms.has(term)).length;
 const newInformation=[...sentenceTerms].filter(term=>!questionTerms.has(term)).length;
 return overlap>=2&&newInformation>=3?overlap+Math.min(newInformation,4):0;
}
export function classifyPracticeQuestionIntent(question:string):PracticeQuestionIntent{return questionIntent(question);}
export function rankPracticeKnowledgeFacts(question:string,items:PracticeKnowledgePack['items']){
 const intent=questionIntent(question),ranked=items.map(item=>{const text=`${item.sourceSection} ${item.category} ${item.statement}`,packagingOnly=/\b(?:bronze|silver|gold|packages?)\b/i.test(text)&&/\b(?:tier|version|hide.*intelligence|membership package)\b/i.test(text),rawExactAnswerScore=exactAnswerRelevance(intent,text,question),exactAnswerScore=packagingOnly&&intent!=='pricing'&&intent!=='commitment'?0:rawExactAnswerScore,questionWords=new Set(tokens(question)),factWords=new Set(tokens(text)),overlap=packagingOnly&&intent!=='pricing'&&intent!=='commitment'?0:[...questionWords].filter(token=>factWords.has(token)).length,categoryBoost=intent==='privacy_transparency'&&item.category==='reporting_data'?3:intent==='actionable_recommendations'&&item.category==='features'?2:intent==='data_collection'&&['reporting_data','how_it_works','employee_experience','evidence_proof'].includes(item.category)?2:intent==='organisation_adaptation'&&['reporting_data','evidence_proof','how_it_works'].includes(item.category)?2:0,score=exactAnswerScore+categoryBoost+Math.min(overlap,3);return {item,score,exactAnswerScore,overlap};}).filter(candidate=>candidate.score>0).sort((a,b)=>b.score-a.score||a.item.knowledgeId.localeCompare(b.item.knowledgeId));
 return {intent,candidates:ranked};
}export type PracticeCommercialTurnAnswerMode='grounded_answer'|'grounded_reframe'|'direct_factual_response'|'objection_response'|'canonical_prompt';
export type PracticeCommercialTurnAction='stay'|'advance'|'advance_to'|'close';
export type PracticeCommercialObjectiveAssessment='not_covered'|'partially_covered'|'covered';
export type PracticeCommercialTurnDecision={
 buyerIntent:PracticeQuestionIntent;buyerQuestionSummary:string;answerMode:PracticeCommercialTurnAnswerMode;
 groundedKnowledgeIds:string[];sellerAnswer:string;sellerControlMove:string;
 currentObjective:{stepId:string;assessment:PracticeCommercialObjectiveAssessment};
 coveredObjectives:Array<{stepId:string;evidenceTurnIds:string[]}>;
 canonicalAction:PracticeCommercialTurnAction;canonicalTargetStepId:string|null;
 detourAction:'none'|'answer_and_return'|'close_and_return';detourTargetId:string|null;
 answersBuyerQuestion:boolean;supportedBySelectedFacts:boolean;irrelevantFactIds:string[];unsupportedClaimRisk:'none'|'low'|'high';confidence:number;
 provenance:{sourceType:'user_provided_local_file'|'safe_fallback';knowledgeIds:string[];sourceSections:string[];snapshotVersion:string|null;urlFetched:false};
};
export type PracticeFinalizedTurnReference={id:string;role:'seller'|'buyer';text:string;finalized:true;integrity:'complete'};

/** Validate a single server-proposed decision against the exact finalized conversation and uploaded playbook. */
export function validatePracticeCommercialTurnDecision(input:{value:unknown;playbook:SalesPlaybook;currentStepId:string;buyerText:string;turns:PracticeFinalizedTurnReference[];items:PracticeKnowledgePack['items'];snapshotVersion:string|null}):{decision:PracticeCommercialTurnDecision|null;reason:string}{
 const value=input.value&&typeof input.value==='object'&&!Array.isArray(input.value)?input.value as Record<string,unknown>:{};
 const steps=input.playbook.scriptSteps,currentIndex=steps.findIndex(step=>step.id===input.currentStepId),current=steps[currentIndex],expectedIntent=questionIntent(input.buyerText),intent=value.buyerIntent,summary=typeof value.buyerQuestionSummary==='string'?value.buyerQuestionSummary.trim():'',answerMode=value.answerMode,answer=typeof value.sellerAnswer==='string'?value.sellerAnswer.trim():'',control=typeof value.sellerControlMove==='string'?value.sellerControlMove.trim():'',confidence=typeof value.confidence==='number'&&Number.isFinite(value.confidence)?value.confidence:-1;
 const allowedKnowledge=new Map(rankPracticeKnowledgeFacts(input.buyerText,input.items).candidates.filter(candidate=>candidate.score>0).map(candidate=>[candidate.item.knowledgeId,candidate.item]));
 const rawIds=Array.isArray(value.groundedKnowledgeIds)?value.groundedKnowledgeIds:[],ids=rawIds.filter((id):id is string=>typeof id==='string'),uniqueIds=[...new Set(ids)],facts=uniqueIds.map(id=>allowedKnowledge.get(id));
 const rawIrrelevant=Array.isArray(value.irrelevantFactIds)?value.irrelevantFactIds:[],irrelevant=rawIrrelevant.filter((id):id is string=>typeof id==='string');
 const currentObjective=value.currentObjective&&typeof value.currentObjective==='object'&&!Array.isArray(value.currentObjective)?value.currentObjective as Record<string,unknown>:{};
 const assessment=currentObjective.assessment,action=value.canonicalAction,target=typeof value.canonicalTargetStepId==='string'?value.canonicalTargetStepId:null;
 const detourAction=value.detourAction,detourTarget=typeof value.detourTargetId==='string'?value.detourTargetId:null;
 const turnIds=new Set(input.turns.filter(turn=>turn.finalized&&turn.integrity==='complete').map(turn=>turn.id));
 const rawCovered=Array.isArray(value.coveredObjectives)?value.coveredObjectives:[];
 const covered=rawCovered.flatMap(entry=>{if(!entry||typeof entry!=='object'||Array.isArray(entry))return [];const row=entry as Record<string,unknown>,stepId=typeof row.stepId==='string'?row.stepId:'',evidenceTurnIds=Array.isArray(row.evidenceTurnIds)?row.evidenceTurnIds.filter((id):id is string=>typeof id==='string'):[];if(!steps.some(step=>step.id===stepId)||!evidenceTurnIds.length||new Set(evidenceTurnIds).size!==evidenceTurnIds.length||evidenceTurnIds.some(id=>!turnIds.has(id)))return [];return [{stepId,evidenceTurnIds}];});
 const coverageByStep=new Map(covered.map(item=>[item.stepId,item]));
 const allowedIntent=(PRACTICE_QUESTION_INTENTS as readonly string[]).includes(String(intent));
 const factsValid=Array.isArray(value.groundedKnowledgeIds)&&ids.length===rawIds.length&&ids.length===uniqueIds.length&&facts.length===uniqueIds.length&&facts.every(Boolean)&&Array.isArray(value.irrelevantFactIds)&&irrelevant.length===rawIrrelevant.length&&irrelevant.length===0;
 const answerFieldsValid=typeof value.answersBuyerQuestion==='boolean'&&typeof value.supportedBySelectedFacts==='boolean'&&Array.isArray(value.irrelevantFactIds)&&['none','low','high'].includes(String(value.unsupportedClaimRisk));
 const answerModeValid=(['grounded_answer','grounded_reframe','direct_factual_response','objection_response','canonical_prompt'] as string[]).includes(String(answerMode));
 const buyerClassification=classifyPracticeBuyerTurn(input.buyerText),expectsQuestion=hasPracticeBuyerQuestion(input.buyerText),expectsObjection=buyerClassification==='objection',expectsAnswer=expectsQuestion||expectsObjection;
 const branches=new Set(input.playbook.objectionBranches.map(branch=>branch.id));
 const objectionBranch=detourTarget?input.playbook.objectionBranches.find(branch=>branch.id===detourTarget):undefined;
 // Semantic relevance is the structured model's explicit judgement. The application
 // mechanically restricts citations to ranked, request-supplied facts and rejects
 // unknown/irrelevant IDs, unsupported-risk flags, empty answers, and illegal routes.
 const factPolicy=answerMode==='canonical_prompt'?(!expectsAnswer&&uniqueIds.length===0&&answer.length===0&&control.length===0&&value.answersBuyerQuestion===false&&value.supportedBySelectedFacts===false&&value.unsupportedClaimRisk==='none'):answerMode==='grounded_reframe'?(expectsAnswer&&!expectsObjection&&uniqueIds.length===0&&value.answersBuyerQuestion===true&&value.supportedBySelectedFacts===false&&value.unsupportedClaimRisk==='none'&&answer.length>=8):answerMode==='objection_response'?(expectsObjection&&!!objectionBranch&&answer===objectionBranch.response&&uniqueIds.length===0&&value.answersBuyerQuestion===true&&value.supportedBySelectedFacts===false&&value.unsupportedClaimRisk==='none'&&detourAction==='answer_and_return'):expectsQuestion&&!expectsObjection&&['grounded_answer','direct_factual_response'].includes(String(answerMode))&&value.answersBuyerQuestion===true&&uniqueIds.length>0&&value.supportedBySelectedFacts===true&&value.unsupportedClaimRisk==='none'&&answer.length>=8;
 const currentCoverage=coverageByStep.get(input.currentStepId),assessmentValid=['not_covered','partially_covered','covered'].includes(String(assessment))&&(assessment!=='covered'||!!currentCoverage);
 const controlValid=answerMode==='canonical_prompt'?control.length===0:control.length>=8&&control.length<=300;
 let navigationReason='valid';
 if(!current||currentIndex<0)navigationReason='current_step_missing';
 else if(action==='stay'){if(target!==null)navigationReason='stay_has_target';}
 else if(action==='advance'){if(target!==null&&target!==steps[currentIndex+1]?.id)navigationReason='advance_target_not_next';else if(!steps[currentIndex+1])navigationReason='no_next_step';else if(assessment!=='covered'||!currentCoverage)navigationReason='current_objective_not_evidence_covered';}
 else if(action==='advance_to'){const targetIndex=steps.findIndex(step=>step.id===target);if(targetIndex<=currentIndex)navigationReason='target_not_forward';else if(assessment!=='covered'||!currentCoverage)navigationReason='current_objective_not_evidence_covered';else if(steps.slice(currentIndex+1,targetIndex).some(step=>!coverageByStep.has(step.id)))navigationReason='skipped_objective_not_evidence_covered';}
 else if(action==='close'){if(target!==null)navigationReason='close_has_target';else if(!isPracticeSoftCloseTerminalStep(current,steps))navigationReason='close_not_terminal';}
 else navigationReason='canonical_action_invalid';
 const detourValid=detourAction==='none'?detourTarget===null:(expectsObjection&&answerMode==='objection_response'&&detourAction==='answer_and_return'&&!!detourTarget&&branches.has(detourTarget)&&action==='stay');
 const valid=allowedIntent&&intent===expectedIntent&&summary.length>=3&&summary.length<=240&&answerModeValid&&factsValid&&factPolicy&&answerFieldsValid&&value.unsupportedClaimRisk!=='high'&&assessmentValid&&currentObjective.stepId===input.currentStepId&&Array.isArray(value.coveredObjectives)&&covered.length===rawCovered.length&&coverageByStep.size===covered.length&&['stay','advance','advance_to','close'].includes(String(action))&&navigationReason==='valid'&&detourValid&&controlValid&&confidence>=0.55&&confidence<=1;
 if(!valid)return {decision:null,reason:!allowedIntent?'buyer_intent_invalid':!current?'current_step_missing':!factsValid?'knowledge_reference_invalid':!answerModeValid||!factPolicy||!answerFieldsValid||value.unsupportedClaimRisk==='high'?'answer_grounding_invalid':!assessmentValid||covered.length!==rawCovered.length?'objective_evidence_invalid':navigationReason!=='valid'?navigationReason:!detourValid?'detour_reference_invalid':!controlValid?'seller_control_move_invalid':confidence<0.55||confidence>1?'confidence_out_of_range':'decision_shape_invalid'};
 const sourceSections=[...new Set((facts as PracticeKnowledgeItem[]).map(item=>item.sourceSection))];
 const decision:PracticeCommercialTurnDecision={buyerIntent:intent as PracticeQuestionIntent,buyerQuestionSummary:summary,answerMode:answerMode as PracticeCommercialTurnAnswerMode,groundedKnowledgeIds:uniqueIds,sellerAnswer:answer,sellerControlMove:control,currentObjective:{stepId:input.currentStepId,assessment:assessment as PracticeCommercialObjectiveAssessment},coveredObjectives:covered,canonicalAction:action as PracticeCommercialTurnAction,canonicalTargetStepId:target,detourAction:detourAction as PracticeCommercialTurnDecision['detourAction'],detourTargetId:detourTarget,answersBuyerQuestion:value.answersBuyerQuestion as boolean,supportedBySelectedFacts:value.supportedBySelectedFacts as boolean,irrelevantFactIds:irrelevant,unsupportedClaimRisk:value.unsupportedClaimRisk as PracticeCommercialTurnDecision['unsupportedClaimRisk'],confidence,provenance:{sourceType:uniqueIds.length?'user_provided_local_file':'safe_fallback',knowledgeIds:uniqueIds,sourceSections,snapshotVersion:input.snapshotVersion,urlFetched:false}};
 return {decision,reason:'validated'};
}

/** Application-owned, single-use state application for an already validated turn decision. */
export function applyPracticeCommercialTurnDecision(input:{navigation:ScriptNavigation;playbook:SalesPlaybook;decision:PracticeCommercialTurnDecision;sequence:number}):{navigation:ScriptNavigation|null;reason:string}{
 const {navigation,playbook,decision}=input,canonicalId=navigation.activeAdaptiveRoute&&navigation.resumeScriptStepId?navigation.resumeScriptStepId:navigation.scriptStepId||navigation.currentScriptStepId,index=playbook.scriptSteps.findIndex(step=>step.id===canonicalId),current=playbook.scriptSteps[index];
 if(!current||decision.currentObjective.stepId!==canonicalId)return {navigation:null,reason:'canonical_cursor_changed'};
 if(decision.canonicalAction==='close')return isPracticeSoftCloseTerminalStep(current,playbook.scriptSteps)?{navigation:{...navigation,routeDirection:'stay',staySilent:false,currentScriptStepStatus:'answered',currentScriptStepComplete:true,sequence:input.sequence},reason:'terminal_close'}:{navigation:null,reason:'close_not_terminal'};
 if(decision.canonicalAction==='stay'){
  const branch=decision.detourTargetId?playbook.objectionBranches.find(item=>item.id===decision.detourTargetId):null;
  if(decision.detourAction!=='none'&&!branch)return {navigation:null,reason:'detour_reference_invalid'};
  const next:ScriptNavigation={...navigation,currentScriptSection:current.section,recommendedScriptSection:current.section,previousScriptSection:current.section,previousScriptStepId:current.id,routeDirection:branch?'branch_to_objection':'stay',routeReason:'Validated Practice commercial decision; canonical cursor remains application-owned.',currentScriptStepId:current.id,scriptStepId:current.id,visibleScriptText:current.text,staySilent:false,currentScriptStepStatus:'answered',currentScriptStepComplete:decision.currentObjective.assessment==='covered',approvedScriptBranchId:branch?.id||null,activeAdaptiveRoute:!!branch,resumeScriptSection:branch?current.section:null,resumeScriptStepId:branch?current.id:null,sequence:input.sequence};
  return {navigation:next,reason:branch?'objection_detour':'hold_current_objective'};
 }
 const targetIndex=decision.canonicalAction==='advance'?index+1:playbook.scriptSteps.findIndex(step=>step.id===decision.canonicalTargetStepId);
 if(targetIndex<=index||targetIndex>=playbook.scriptSteps.length)return {navigation:null,reason:'target_not_forward'};
 if(decision.canonicalAction==='advance_to'&&playbook.scriptSteps.slice(index+1,targetIndex).some(step=>!decision.coveredObjectives.some(item=>item.stepId===step.id)))return {navigation:null,reason:'skipped_objective_not_evidence_covered'};
 const target=playbook.scriptSteps[targetIndex],next=playbook.scriptSteps[targetIndex+1]||null;
 return {navigation:{...navigation,currentScriptSection:target.section,previousScriptSection:current.section,previousScriptStepId:current.id,recommendedScriptSection:target.section,routeDirection:decision.canonicalAction==='advance'?'advance':'jump_forward',routeReason:'Validated Practice commercial decision selected a forward, playbook-defined objective.',currentScriptStepId:target.id,scriptStepId:target.id,visibleScriptText:target.text,staySilent:false,currentScriptStepStatus:'not_started',currentScriptStepWasSpoken:false,currentScriptStepComplete:false,nextSequentialScriptStepId:next?.id||null,approvedScriptBranchId:null,approvedScriptClaimId:null,adaptiveOverride:false,activeAdaptiveRoute:false,resumeScriptSection:null,resumeScriptStepId:null,deliveryEvidenceSequence:null,sequence:input.sequence},reason:decision.canonicalAction};
}

export const PRACTICE_BUYER_RESPONSE_INSTRUCTIONS='When the seller asks a direct control question, answer that question first and do not introduce a new product question. If the seller has acknowledged a limitation and reframed an unsupported request into a bounded commercial question, respond to that control question first; do not repeat or paraphrase the same request for case studies, outcomes, benefits, engagement improvements, or proof unless the seller has not addressed the concern. Otherwise respond to what the seller said; ask at most one relevant question only when you have a genuine unresolved concern or need clarification. Do not ask a new product question after every seller turn. Usually respond in 1–2 natural sentences and 12–28 spoken words; a brief acknowledgement may be shorter. Keep the buyer realistic and do not move the script.';

export type PracticeBuyerOutputAssessment={accepted:boolean;validatorId:'practice_buyer_hard_contract';rejectionReason:'empty_output'|'text_too_long'|'role_mismatch'|null;wordCount:number;sentenceCount:number;hadQuestion:boolean;hadBuyerResponse:boolean;outputShapeValid:boolean;hardBoundary:string|null;retryEligible:boolean;qualityNotes:string[]};

/** Structural/safety contract only. Conversation length and style are scored, never used to discard a usable buyer turn. */
export function assessPracticeBuyerOutput(text:unknown,explicitScenarioNeed=false):PracticeBuyerOutputAssessment{
 const value=typeof text==='string'?text.trim():'',wordCount=value?value.split(/\s+/).filter(Boolean).length:0,sentenceCount=value?value.split(/(?<=[.!?])\s+/).filter(Boolean).length:0,hadQuestion=value.includes('?'),roleMismatch=/^(?:seller|assistant|system|root|coach)\s*[:\-]/i.test(value);
 let rejectionReason:PracticeBuyerOutputAssessment['rejectionReason']=null;
 if(!value)rejectionReason='empty_output';else if(value.length>1200)rejectionReason='text_too_long';else if(roleMismatch)rejectionReason='role_mismatch';
 const qualityNotes:string[]=[];
 if(!explicitScenarioNeed&&(wordCount<5||wordCount>28))qualityNotes.push('word_count_outside_target');
 if(sentenceCount>2)qualityNotes.push('sentence_count_above_target');
 if((value.match(/\?/g)||[]).length>1)qualityNotes.push('multiple_questions');
 return {accepted:rejectionReason===null,validatorId:'practice_buyer_hard_contract',rejectionReason,wordCount,sentenceCount,hadQuestion,hadBuyerResponse:!!value&&!roleMismatch,outputShapeValid:typeof text==='string',hardBoundary:rejectionReason,retryEligible:rejectionReason!==null,qualityNotes};
}

export function practiceBuyerResponseWithinDefaultBudget(text:string,explicitScenarioNeed=false){
 return assessPracticeBuyerOutput(text,explicitScenarioNeed).accepted;
}

export function summarizePracticeLatency(events:Array<{turnOrder?:number;latencyStage?:string;at?:number}>){
 const perTurn=new Map<number,Record<string,number>>();for(const event of events){if(!Number.isInteger(event.turnOrder)||typeof event.latencyStage!=='string'||!Number.isFinite(event.at))continue;const marks=perTurn.get(event.turnOrder as number)||{};marks[event.latencyStage]=event.at as number;perTurn.set(event.turnOrder as number,marks);}
 const pairs:{key:string;from:string;to:string}[]=[
  {key:'speechToEndpointMs',from:'last_seller_speech_activity',to:'silence_threshold_reached'},
  {key:'endpointToSettleCompleteMs',from:'silence_threshold_reached',to:'settle_window_completed'},
  {key:'settleToFinalPacketMs',from:'settle_window_completed',to:'final_required_packet_available'},
  {key:'finalPacketToSellerTurnMs',from:'final_required_packet_available',to:'seller_turn_assembled'},
  {key:'sellerValidationMs',from:'seller_turn_assembled',to:'seller_integrity_validated'},
  {key:'sellerToBuyerGenerationMs',from:'seller_integrity_validated',to:'buyer_generation_started'},
  {key:'buyerGenerationMs',from:'buyer_generation_started',to:'buyer_generation_completed'},
  {key:'buyerTextToAudioStartMs',from:'buyer_turn_finalized',to:'buyer_audio_started'},
  {key:'buyerAudioPlaybackMs',from:'buyer_audio_started',to:'buyer_audio_completed'},
  {key:'buyerEndToHandoverCompleteMs',from:'buyer_audio_completed',to:'practice_handover_complete'},
  {key:'buyerEndToNextWordingVisibleMs',from:'buyer_audio_completed',to:'next_wording_first_visible'},
  {key:'buyerEndToListeningMs',from:'buyer_audio_completed',to:'seller_listening_resumed'}
 ];
 const quantile=(values:number[],p:number)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);if(p===0.5&&sorted.length%2===0)return (sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];};
 return Object.fromEntries(pairs.map(pair=>{const values=[...perTurn.values()].filter(marks=>Number.isFinite(marks[pair.from])&&Number.isFinite(marks[pair.to])).map(marks=>Math.max(0,marks[pair.to]-marks[pair.from]));return [pair.key,{sampleCount:values.length,medianMs:quantile(values,0.5),p95Ms:quantile(values,0.95)}];}));
}

export function practiceTerminalOutcome(classification:PracticeBuyerClassification):PracticeTerminalOutcome|null{
 if(classification==='clear_acceptance')return 'interested_follow_up';
 if(classification==='clear_rejection')return 'declined';
 if(classification==='not_ready')return 'not_ready';
 return null;
}

export function practiceTerminalOutcomeLabel(outcome:PracticeTerminalOutcome){
 return outcome==='interested_follow_up'?'Practice complete — buyer interested in follow-up.':outcome==='declined'?'Practice complete — buyer declined.':'Practice complete — buyer not ready.';
}
