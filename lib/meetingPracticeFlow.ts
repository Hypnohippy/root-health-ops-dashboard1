import type {SalesPlaybook,ScriptNavigation} from './meetingAdaptiveCoach';
import type {PracticeKnowledgePack} from './meetingPracticeKnowledge';

export type PracticeBuyerClassification='normal_response'|'objection'|'direct_question'|'clear_acceptance'|'not_ready'|'clear_rejection';
export type PracticeQuestionSource='playbook_step'|'approved_claim'|'prepared_knowledge'|'safe_fallback';
export type PracticeQuestionResolution='awaiting_seller'|'awaiting_buyer';
export type PracticeQuestionBridgeResolution='active'|'exhausted';
export type PracticeQuestionDecisionClassification='supported_question'|'unsupported_question'|'unsupported_evidence_request'|'direct_evidence_challenge';
export type PracticeQuestionEvidenceFamily='outcome_evidence';
export type PracticeQuestionAnswerHistoryEntry={
 question:string;
 answer:string;
 sourceType:PracticeQuestionSource;
 sourceId:string|null;
 sourceIds:string[];
 supportingText:string|null;
};
export type PracticeQuestionCandidateScore={sourceIds:string[];exactAnswerScore:number;relevantConceptScore:number;concepts:string[];rejectionReasons:string[]};
export type PracticeQuestionRetrievalDiagnostics={intent:string;candidateCount:number;candidateSourceIds:string[];candidateScores:PracticeQuestionCandidateScore[];selectedSourceIds:string[];selectedPath:'exact_approved_answer'|'relevant_approved_concept'|'multi_source_composition'|'prepared_knowledge'|'safe_fallback'|null;answerQuality:{answersQuestion:boolean;addsUsefulInformation:boolean;sourceBacked:boolean;distinctFromRecentWording:boolean;passed:boolean}|null;fallbackReason:string|null;knowledgeLookupAttempted?:boolean;knowledgeCandidateCount?:number;selectedKnowledgeIds?:string[];knowledgeAnswerPath?:string|null;knowledgeFallbackReason?:string|null;knowledgeSnapshotVersion?:string|null;knowledgeLookupDurationMs?:number};
export type PracticeQuestionBridge={
 id:string;
 bridgeId:string;
 currentScriptStepId:string;
 questionBridgeActive:true;
 suspendedScriptStepId:string;
 suspendedScriptSection?:string;
 originalQuestion:string;
 latestQuestion:string;
 answerHistory:PracticeQuestionAnswerHistoryEntry[];
 bridgeTurnCount:number;
 resolutionState:PracticeQuestionBridgeResolution;
 fallbackDelivered:boolean;
 questionSummary:string;
 approvedQuestionResponse:string;
 sellerControlQuestion:string|null;
 questionResolutionState:PracticeQuestionResolution;
 sourceType:PracticeQuestionSource;
 sourceId:string|null;
 sourceIds:string[];
 supportingText:string|null;
 recoveryRequired?:boolean;
 recoveryCount?:number;
 retrievalDiagnostics?:PracticeQuestionRetrievalDiagnostics;
 classification?:PracticeQuestionDecisionClassification;
 evidenceFamily?:PracticeQuestionEvidenceFamily|null;
 canonicalAction?:'resume_or_advance';
 detourAction?:'continue'|'close';
};

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
export type PracticeScriptCoverageStatus='not_covered'|'partially_covered'|'covered'|'explicitly_delivered';
export type PracticeScriptCoverageRecord={stepId:string;status:PracticeScriptCoverageStatus;sellerTurnId:string;sourceIds:string[];bridgeOrRouteId:string;reason:string;evidenceText:string;confidence:number};
export type PracticeTerminalOutcome='interested_follow_up'|'not_ready'|'declined';
export type PracticeTerminalPhase='active'|'close_pending'|'practice_complete'|'rejected'|'recoverable_failure';

/** Only an explicitly designated soft-close final step completes the seller's script. */
export function isPracticeSoftCloseTerminalStep(step:{id:string;section:string}|null|undefined,steps:SalesPlaybook['scriptSteps']):boolean{
 if(!step||!steps.length||step.section!=='soft_close')return false;
 return steps.at(-1)?.id===step.id;
}

const rejection=/\b(not interested|no thanks|no thank you|decline|stop contacting|do not contact|don't contact|not for us|we won't proceed|we will not proceed)\b/i;
const questionLead=/\b(what|how|why|where|when|who|which|can you|could you|would you|does it|do you|is it|are there|tell me|explain)\b/i;
const objection=/\b(not sure|unsure|concern(?:ed)?|worried|no capacity|no budget|not a priority|too expensive|too much|can't|cannot|won't work|doesn't fit|not fit|but we|however|problem with|issue with)\b/i;
const materialObjection=/\b(no capacity|no budget|not a priority|too expensive|too much|cannot|can't|won't work|doesn't fit|not fit|problem with|issue with|concern(?:ed)? about|worried about|we have concerns? about|our concern is|we (?:do not|don't) have (?:the )?(?:capacity|budget|time|resources|headcount))\b/i;
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

const directOutcomeEvidenceChallenge=/\b(?:do you (?:actually )?have|does root have|has root|have you got|is there|are there|has root demonstrably|did root|does it demonstrably)\b.{0,90}\b(?:case stud(?:y|ies)|success stor(?:y|ies)|proven examples?|evidence|proof|outcomes?|benefits?|trends?|reduc(?:e|ed|ing) (?:staff )?(?:absence|burnout)|improv(?:e|ed|ing) engagement)\b|\b(?:has root demonstrably|has root actually)\b.{0,60}\b(?:reduced|improved|increased|changed)\b/i;
const outcomeEvidenceTerms=/\b(case stud(?:y|ies)|success stor(?:y|ies)|examples?|proven examples?|proof|evidence|outcomes?|benefits?|trends?|engagement improvements?|reduc(?:e|ed|ing) (?:staff )?(?:absence|burnout)|absence reductions?|burnout reductions?|guarantee(?:d)? results?)\b/i;
const evidenceContextTerms=/\b(absence|burnout|engagement|wellbeing|well-being|workforce|organisation|organization|teams?|employees?|results?|impact|reduc(?:e|ed|ing)|improv(?:e|ed|ing)|success|root)\b/i;

/** Keeps requests for unapproved outcome proof in one bounded commercial family. */
export function classifyPracticeOutcomeEvidenceQuestion(question:string):{classification:'unsupported_evidence_request'|'direct_evidence_challenge';family:PracticeQuestionEvidenceFamily}|null{
 const text=question.trim();
 if(!text||!outcomeEvidenceTerms.test(text))return null;
 if(directOutcomeEvidenceChallenge.test(text)||/\b(?:guarantee(?:d)? results?|prove(?:n)? (?:that )?(?:it works|results?))\b/i.test(text))return {classification:'direct_evidence_challenge',family:'outcome_evidence'};
 if((evidenceContextTerms.test(text)||/\b(?:general|overall|broad|measurable|other organisations?|other organizations?)\b/i.test(text))&&(/\b(?:example|examples|story|stories|case|outcomes?|benefits?|trend|proof|evidence|result|results|impact|reduc|improv)\b/i.test(text)))return {classification:'unsupported_evidence_request',family:'outcome_evidence'};
 return null;
}

export function practiceUnsupportedEvidenceMove(section:string,question:string,classification:'unsupported_evidence_request'|'direct_evidence_challenge'):{groundedAnswer:string;sellerControlMove:string}{
 const direct=classification==='direct_evidence_challenge';
 const limitation=direct?'I don’t have an approved case study or outcome evidence in the prepared material that supports that claim. ':'';
 const moves:Record<string,{reframe:string;control:string}>={
  discovery:{reframe:'What I can show you is how the approved approach relates to the pressures you’ve described.',control:'Which of those pressures would matter most to improve first?'},
  positioning:{reframe:'What I can show you is how the support and visibility we’ve discussed could fit your organisation.',control:'Is that capability relevant enough to explore further?'},
  objections:{reframe:'What I can show you is how the approach would work alongside what you already have.',control:'If that addressed the concern, would it be worth moving to the next step?'},
  soft_close:{reframe:'What I can show you is how the approach could work in your environment.',control:'If that looks relevant, would a short follow-up be the sensible next step?'},
 };
 const selected=moves[section]||{reframe:'What I can do is relate the approved approach to the issue we’ve been discussing.',control:'Which part of that issue would be most useful to focus on next?'};
 return {groundedAnswer:`${limitation}${selected.reframe}`,sellerControlMove:selected.control};
}

/** An exhausted evidence detour closes on a semantically related re-ask instead of starting a new bridge. */
export function shouldClosePracticeQuestionDetour(bridge:PracticeQuestionBridge|null|undefined,buyerText:string):boolean{
 if(!bridge||bridge.resolutionState!=='exhausted'||!bridge.fallbackDelivered||bridge.questionResolutionState!=='awaiting_buyer')return false;
 if(bridge.evidenceFamily==='outcome_evidence')return classifyPracticeOutcomeEvidenceQuestion(buyerText)?.family==='outcome_evidence';
 return false;
}

const stopWords=new Set(['what','when','where','which','who','whom','whose','why','how','does','did','doing','would','could','should','can','will','the','and','for','from','with','that','this','they','them','you','your','our','their','about','into','usually','specifically','exactly','kind','look','looking','like','mean','much','many','some','tell','please','company','companies','organisation','organisations','organization','organizations','every','result','results','people','team','teams','practice','recommend','recommendations','solution','solutions']);
function normalizeToken(token:string){return token.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ies$/,'y').replace(/s$/,'').replace(/ing$/,'').replace(/ed$/,'');}
function tokens(value:string){return value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!stopWords.has(token));}
function sentenceList(source:string){return source.split(/(?<=[.!?])\s+/).map(value=>value.trim()).filter(Boolean);}
export type PracticeQuestionIntent='gap_categories'|'solution_capability'|'product_capabilities'|'product_mechanism'|'employee_proposition'|'employer_proposition'|'reporting_visibility'|'pricing'|'signup_process'|'commitment'|'comparison'|'follow_up_detail'|'outcome_evidence'|'general';
function questionIntent(question:string,context=''):PracticeQuestionIntent{
 if(classifyPracticeOutcomeEvidenceQuestion(question))return 'outcome_evidence';
 if(/\b(?:different from|compared with|compare with|already have|currently use|existing system)\b/i.test(question))return 'comparison';
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
 if(intent==='employee_proposition')return 'Would that sort of support be relevant to the employees you have in mind?';
 if(intent==='commitment'||intent==='signup_process')return 'Would it help to talk through how that could work for your organisation?';
 if(intent==='product_mechanism'||intent==='solution_capability')return 'Does that answer how it works, or is there one part you would like me to clarify?';
 if(intent==='comparison')return 'Would it be useful to explore how that could fit alongside what you already have?';
 if(intent==='gap_categories')return 'Which of those areas is most relevant to what you are seeing?';
 if(intent==='follow_up_detail')return 'Would that be a useful focus for the next conversation?';
 return null;
}
function naturalList(values:string[]){if(values.length<2)return values[0]||'';if(values.length===2)return `${values[0]} or ${values[1]}`;return `${values.slice(0,-1).join(', ')} or ${values.at(-1)}`;}
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
function relevantConceptRelevance(intent:PracticeQuestionIntent,sentence:string):number{
 if(intent==='gap_categories'){
  const concepts=questionAnswerConcepts(sentence),contextAnchor=/\b(pressure|gaps?|issues?|challenges?|problems?|bottlenecks?|absence|burnout|stress|manager strain|engagement|support|resources?)\b/i.test(sentence);
  return concepts.length>=2&&contextAnchor?4+concepts.length:0;
 }
 return 0;
}
function repetitionSimilarity(candidate:string,reference:string):number{
 const a=new Set(tokens(candidate)),b=new Set(tokens(reference));
 if(!a.size||!b.size)return 0;
 const overlap=[...a].filter(token=>b.has(token)).length;
 return overlap/Math.min(a.size,b.size);
}
function makesInformativeProgress(candidate:string,question:string){const candidateTokens=new Set(tokens(candidate)),questionTokens=new Set(tokens(question));const repeatsQuestion=questionTokens.size>=3&&repetitionSimilarity(candidate,question)>=0.72;return !repeatsQuestion&&[...candidateTokens].filter(token=>!questionTokens.has(token)).length>=3;}
function fallbackAnswerFor(intent:PracticeQuestionIntent,question:string,variant=0){
 if(/\bguarantee(?:d)? results?\b/i.test(question))return 'I don’t have approved information about guaranteed results in this playbook. Is there another detail you would like me to clarify?';
 if(/\bpricing|price|cost\b/i.test(question))return 'I don’t have approved pricing information in this playbook. Is there a supported part of the approach you would like me to explain?';
 if(/\bprescribe|treatments?\b/i.test(question))return 'I can’t recommend a treatment from the approved material. Is there another part you would like me to clarify?';
 if(intent==='gap_categories'){
  const subject=/\bbottlenecks?\b/i.test(question)?'those bottlenecks':/\bpressure\b/i.test(question)?'those pressure areas':/\bgaps?\b/i.test(question)?'those gaps':'those areas';
  return [`I don’t have an approved example of ${subject} to give you. Is there a particular area you want me to clarify?`,`I can’t support another example of ${subject} from the playbook. Which part should I clarify?`,`I don’t have another approved example of ${subject}. What specific area matters most to you?`][Math.min(variant,2)];
 }
 if(intent==='solution_capability')return 'I don’t have an approved recommendation for that. Which part of the approach would you like me to clarify?';
 if(intent==='comparison')return 'I can explain what the prepared source describes, but I don’t know what you already use, so I can’t make a grounded comparison. What would you like me to compare it with?';
 if(intent==='pricing')return 'I don’t have a source-backed price for that specific situation. What workforce size or membership option should I clarify?';
 if(intent==='signup_process')return 'I don’t have a source-backed signup step for that detail. What part of starting membership should I clarify?';
 if(intent==='commitment')return 'I don’t have a source-backed commitment term for that question. What term should I check?';
 if(intent==='product_capabilities')return 'I don’t want to overstate the available material. I can explain the features described in the prepared source, or note the specific detail that still needs checking.';
 if(intent==='product_mechanism')return 'I don’t have an approved explanation for that detail. Which part of how it works should I clarify?';
 if(intent==='follow_up_detail')return 'I don’t have an approved detail about that next step. What part of the follow-up should I clarify?';
 return 'I don’t have an approved answer to that specific question. What detail should I clarify?';
}
type PreparedKnowledgeFact={section:string;text:string;category?:string};
/** Turn selected source facts into concise seller wording while keeping the full evidence set attached to the bridge. */
function concisePreparedKnowledgeAnswer(intent:PracticeQuestionIntent,facts:PreparedKnowledgeFact[]):string|null{
 const all=facts.map(fact=>`${fact.section} ${fact.text}`).join(' ').toLowerCase();
 if(intent==='product_capabilities'&&/organisation insights/i.test(all)&&/ask root/i.test(all)&&/root intelligence/i.test(all))return 'Root combines private employee support with organisational insight. HR sees anonymous workforce signals, while leaders can use Root Intelligence, Organisation Insights, Ask Root and executive reviews.';
 if(intent==='employee_proposition'&&/employee wellbeing platform/i.test(facts.map(fact=>fact.section).join(' ')))return 'Employees receive assessments, check-ins, Mind, Journal, practical interventions and Voice Coach in Root’s personal wellbeing experience.';
 if(intent==='employer_proposition'&&/anonymous participation/i.test(all)&&/private support/i.test(all))return 'Employers get private employee support alongside organisational insight. HR sees anonymous workforce signals, and leadership can question findings and review board-ready reporting.';
 if(intent==='product_mechanism'&&/employees then join root privately/i.test(all)&&/workforce reach, baseline depth/i.test(all))return 'Employees join Root privately to build an anonymous evidence base. Root tracks workforce reach, baseline depth and repeated check-ins alongside organisational context, developing clearer insight as participation grows.';
 if(intent==='pricing'&&/£\s?695/i.test(all)&&/12-month basis/i.test(all))return 'Pricing starts at £695 per month for up to 50 employees and scales with workforce size; prices exclude VAT. Standard membership is normally 12 months, billed monthly, with enterprise arrangements handled directly.';
 if(intent==='signup_process'&&/direct membership application/i.test(all)&&/secure invitation/i.test(all))return 'Apply with the organisation, workforce size and authorised administrator. Once approved, standard membership connects to secure billing; the administrator is invited to set up Root and its first Organisation Learning Review.';
 if(intent==='commitment'&&/12-month basis/i.test(all))return 'Standard membership is normally agreed for 12 months and billed monthly. Arrangements for organisations with more than 1,000 employees are handled directly with Root.';
 if(intent==='reporting_visibility'&&/without seeing individual employee data/i.test(all))return 'HR sees anonymous participation, evidence depth, workforce direction, business context and confidence signals; individual employee data is not visible to HR.';
 return null;
}

export const MAX_PRACTICE_QUESTION_BRIDGE_TURNS=3;

/** Mark that the seller has delivered the current bridge answer; an exhausted fallback must not loop. */
export function markPracticeQuestionBridgeAnswerSubmitted(bridge:PracticeQuestionBridge):PracticeQuestionBridge{
 return {...bridge,questionResolutionState:'awaiting_buyer',resolutionState:bridge.resolutionState==='exhausted'?'exhausted':'active',fallbackDelivered:bridge.sourceType==='safe_fallback'||bridge.fallbackDelivered||bridge.bridgeTurnCount>=MAX_PRACTICE_QUESTION_BRIDGE_TURNS};
}

/** A delivered exhausted fallback closes the detour; later questions return to normal objection/navigation handling. */
export function canContinuePracticeQuestionBridge(bridge:PracticeQuestionBridge|null|undefined):boolean{
 return !bridge||bridge.resolutionState!=='exhausted'||!bridge.fallbackDelivered;
}

/** Keep an unsupported direct buyer question visible as a handoff instead of resuming unrelated script wording. */
export function createPracticeQuestionRecovery(bridge:PracticeQuestionBridge,question:string):PracticeQuestionBridge{
 const previousAnswer=bridge.questionResolutionState==='awaiting_buyer'?{question:bridge.latestQuestion,answer:bridge.approvedQuestionResponse,sourceType:bridge.sourceType,sourceId:bridge.sourceId,sourceIds:bridge.sourceIds,supportingText:bridge.supportingText}:null;
 const recoveryCount=(bridge.recoveryCount||0)+1;
 const intent=questionIntent(question,[bridge.originalQuestion,bridge.latestQuestion].join(' ')),evidence=classifyPracticeOutcomeEvidenceQuestion(question),move=evidence?practiceUnsupportedEvidenceMove(bridge.suspendedScriptSection||'unknown',question,evidence.classification):null;
 const originalFallback=fallbackAnswerFor(intent,question,recoveryCount),firstSentence=originalFallback.split(/(?<=[.!?])\s+/)[0],recoveryWording=move?.groundedAnswer||`${firstSentence} Let’s bring this back to the issue we’ve been discussing.`;
 return {...bridge,latestQuestion:question,questionSummary:question.slice(0,240),answerHistory:previousAnswer?[...bridge.answerHistory,previousAnswer]:bridge.answerHistory,questionBridgeActive:true,resolutionState:'exhausted',fallbackDelivered:true,recoveryRequired:true,recoveryCount,approvedQuestionResponse:recoveryWording,sellerControlQuestion:move?.sellerControlMove||practiceQuestionControlMove(intent,bridge.suspendedScriptSection||'unknown',question),questionResolutionState:'awaiting_seller',sourceType:'safe_fallback',sourceId:null,sourceIds:[],supportingText:null,classification:evidence?.classification||'unsupported_question',evidenceFamily:evidence?.family||null,canonicalAction:'resume_or_advance',detourAction:'close'};
}

const coverageStopWords=new Set(['about','after','again','also','and','are','around','because','been','being','between','but','can','could','does','doing','each','from','have','here','how','into','just','more','most','much','need','needs','our','over','same','some','such','than','that','the','their','them','then','there','these','they','this','those','through','what','when','where','which','while','who','will','with','would','your','you','for','its']);
function coverageTokens(value:string){return [...new Set(value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!coverageStopWords.has(token)))];}
function coverageOverlap(candidate:string,reference:string){const a=coverageTokens(candidate),b=new Set(coverageTokens(reference));return {matched:a.filter(token=>b.has(token)),candidateCount:a.length,referenceCount:b.size};}

/** Coverage requires an explicit approved source ID, source-text alignment, and seller transcript support. */
export function assessPracticeScriptCoverage(input:{step:{id:string;text:string};sourceIds:string[];supportingText:string|null;sellerTurn:{id:string;text:string};bridgeOrRouteId:string}):PracticeScriptCoverageRecord|null{
 if(!input.sourceIds.includes(input.step.id)||!input.supportingText)return null;
 const support=coverageTokens(input.supportingText),stepMatch=coverageOverlap(input.supportingText,input.step.text),sellerMatch=coverageOverlap(input.sellerTurn.text,input.supportingText);
 if(support.length<4||stepMatch.matched.length<4||stepMatch.matched.length/Math.max(1,support.length)<0.7||sellerMatch.matched.length<3)return null;
 const confidence=Number((sellerMatch.matched.length/Math.max(1,support.length)).toFixed(3));
 const status:PracticeScriptCoverageStatus=confidence>=0.9?'explicitly_delivered':confidence>=0.64?'covered':'partially_covered';
 return {stepId:input.step.id,status,sellerTurnId:input.sellerTurn.id,sourceIds:[...input.sourceIds],bridgeOrRouteId:input.bridgeOrRouteId,reason:'seller_turn_delivered_source_backed_script_objective',evidenceText:input.sellerTurn.text,confidence};
}

/** Assess only playbook steps explicitly identified as approved sources for the bridge response. */
export function assessPracticeBridgeCoverage(playbook:SalesPlaybook,bridge:PracticeQuestionBridge,sellerTurn:{id:string;text:string}):PracticeScriptCoverageRecord[]{
 if(bridge.sourceType==='safe_fallback'||!bridge.supportingText)return [];
 return playbook.scriptSteps.flatMap(step=>{const record=assessPracticeScriptCoverage({step,sourceIds:bridge.sourceIds,supportingText:bridge.supportingText,sellerTurn,bridgeOrRouteId:bridge.bridgeId});return record?[record]:[];});
}

/** Only an application-owned forward transition can skip a future step, and only with source-backed completed coverage. */
export function skipCoveredPracticeSteps(navigation:ScriptNavigation,playbook:SalesPlaybook,coverage:Record<string,PracticeScriptCoverageRecord>):{navigation:ScriptNavigation;skipped:PracticeScriptCoverageRecord[];allRemainingCovered:boolean}{
 if(navigation.routeDirection!=='advance'||navigation.activeAdaptiveRoute||navigation.approvedScriptBranchId)return {navigation,skipped:[],allRemainingCovered:false};
 let index=playbook.scriptSteps.findIndex(step=>step.id===navigation.scriptStepId);if(index<0)return {navigation,skipped:[],allRemainingCovered:false};
 const skipped:PracticeScriptCoverageRecord[]=[];
 while(index<playbook.scriptSteps.length){const step=playbook.scriptSteps[index],record=coverage[step.id];if(!record||!['covered','explicitly_delivered'].includes(record.status))break;skipped.push(record);index++;}
 if(!skipped.length)return {navigation,skipped,allRemainingCovered:false};
 if(index>=playbook.scriptSteps.length)return {navigation,skipped,allRemainingCovered:true};
 const target=playbook.scriptSteps[index],next=playbook.scriptSteps[index+1]||null;
 return {navigation:{...navigation,currentScriptSection:target.section,recommendedScriptSection:target.section,scriptStepId:target.id,currentScriptStepId:target.id,visibleScriptText:target.text,staySilent:false,currentScriptStepStatus:'not_started',currentScriptStepWasSpoken:false,currentScriptStepComplete:false,nextSequentialScriptStepId:next?.id||null,approvedScriptBranchId:null,activeAdaptiveRoute:false,adaptiveOverride:false,resumeScriptSection:null,resumeScriptStepId:null,routeReason:`Skip ${skipped.map(record=>record.stepId).join(', ')} because source-backed seller turns already covered those script objectives.`},skipped,allRemainingCovered:false};
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

/** Selects relevant exact source text from the whole uploaded playbook/approved-claim set. */
export function createPracticeQuestionBridge(input:{question:string;playbook:SalesPlaybook;currentScriptStepId:string;currentScriptSection?:string;existingBridge?:PracticeQuestionBridge|null;buyerTurnId:string;previousSellerText?:string|null;knowledgePack?:PracticeKnowledgePack|null}):PracticeQuestionBridge{
 const retrievalStartedAt=Date.now();
 const existing=input.existingBridge||null;
 const previousAnswer=existing?.questionResolutionState==='awaiting_buyer'?{question:existing.latestQuestion,answer:existing.approvedQuestionResponse,sourceType:existing.sourceType,sourceId:existing.sourceId,sourceIds:existing.sourceIds,supportingText:existing.supportingText}:null;
 const answerHistory=previousAnswer?[...(existing?.answerHistory||[]),previousAnswer]:[...(existing?.answerHistory||[])];
 const bridgeTurnCount=existing?existing.bridgeTurnCount+1:1;
 const bridgeId=existing?.bridgeId||`question-bridge-${input.buyerTurnId}`;
 const suspendedScriptStepId=existing?.suspendedScriptStepId||input.currentScriptStepId;
 const currentStep=input.playbook.scriptSteps.find(step=>step.id===suspendedScriptStepId),requestedSection=input.currentScriptSection;
 const suspendedScriptSection=existing?.suspendedScriptSection||(requestedSection&&['discovery','positioning','objections','soft_close'].includes(requestedSection)?requestedSection:currentStep?.section||'unknown');
 const base={
  id:bridgeId,bridgeId,currentScriptStepId:suspendedScriptStepId,questionBridgeActive:true as const,suspendedScriptStepId,suspendedScriptSection,
  originalQuestion:existing?.originalQuestion||input.question,latestQuestion:input.question,answerHistory,bridgeTurnCount,
  questionSummary:input.question.slice(0,240),questionResolutionState:'awaiting_seller' as const,recoveryRequired:false,sellerControlQuestion:null as string|null,
 };
 const intent=questionIntent(input.question,[existing?.originalQuestion||'',existing?.latestQuestion||'',input.playbook.scriptSteps.find(step=>step.id===suspendedScriptStepId)?.text||'',...input.playbook.scriptSteps.map(step=>step.text),...input.playbook.approvedClaims].join(' '));
 const safeFallback=(resolutionState:PracticeQuestionBridgeResolution='exhausted',retrievalDiagnostics:PracticeQuestionRetrievalDiagnostics):PracticeQuestionBridge=>{const evidence=classifyPracticeOutcomeEvidenceQuestion(input.question),move=evidence?practiceUnsupportedEvidenceMove(suspendedScriptSection,input.question,evidence.classification):null;return {...base,resolutionState,fallbackDelivered:false,approvedQuestionResponse:move?.groundedAnswer||(intent==='product_capabilities'?(input.knowledgePack?'I don’t want to overstate what the prepared source says. Let’s note that specific feature to verify after the conversation.':'I don’t want to guess about specific tools or features. Let’s note that detail to verify after the conversation.'):fallbackAnswerFor(intent,input.question)),sellerControlQuestion:move?.sellerControlMove||null,sourceType:'safe_fallback',sourceId:null,sourceIds:[],supportingText:null,retrievalDiagnostics,classification:evidence?.classification||'unsupported_question',evidenceFamily:evidence?.family||null,canonicalAction:'resume_or_advance',detourAction:'close'};};
 const sources=[
  ...input.playbook.scriptSteps.filter(step=>step.section!=='approved_claims').map(step=>({id:step.id,section:step.section,text:step.text,sourceType:'playbook_step' as const,priority:0})),
  ...input.playbook.approvedClaims.map((text,index)=>({id:`claim-${index+1}`,section:'approved_claims',text,sourceType:'approved_claim' as const,priority:0})),
  ...(input.knowledgePack?.items||[]).map(item=>({id:`knowledge:${item.knowledgeId}`,section:item.sourceSection,text:item.statement,sourceType:'prepared_knowledge' as const,priority:1,category:item.category})),
 ];
 const groupedSources=new Map<string,typeof sources>();
 for(const source of sources){const group=groupedSources.get(`${source.sourceType}:${source.section}`)||[];group.push(source);groupedSources.set(`${source.sourceType}:${source.section}`,group);}
  const candidates:{id:string;sourceIds:string[];text:string;sourceType:'playbook_step'|'approved_claim'|'prepared_knowledge';priority:number;section:string;category?:string}[]=[];
 for(const group of groupedSources.values()){
  const fragments=group.flatMap(source=>(source.sourceType==='prepared_knowledge'?[source.text]:sentenceList(source.text)).map(text=>({id:source.id,text,sourceType:source.sourceType,priority:source.priority,section:source.section,...('category' in source?{category:source.category}:{})})));
  for(let index=0;index<fragments.length;index++){
   const first=fragments[index];candidates.push({id:first.id,sourceIds:[first.id],text:first.text,sourceType:first.sourceType,priority:first.priority,section:first.section,...(first.category?{category:first.category}:{})});
   const second=fragments[index+1];
   if(second&&first.sourceType!=='prepared_knowledge'&&first.sourceType===second.sourceType&&first.priority===second.priority&&first.text!==second.text&&`${first.text} ${second.text}`.length<=480)candidates.push({id:first.id,sourceIds:[first.id,second.id],text:`${first.text} ${second.text}`,sourceType:first.sourceType,priority:first.priority,section:first.section,...(first.category?{category:first.category}:{})});
  }
 }
 const priorAnswers=answerHistory.map(entry=>entry.answer);
 const references=[{kind:'previous_seller_wording',text:input.previousSellerText||''},{kind:'current_step_wording',text:currentStep?.text||''},...priorAnswers.map(text=>({kind:'previous_bridge_answer',text}))].filter(item=>item.text);
 const knowledgeCandidates=candidates.filter(candidate=>candidate.sourceType==='prepared_knowledge'),diagnostics:PracticeQuestionRetrievalDiagnostics={intent,candidateCount:candidates.length,candidateSourceIds:[...new Set(candidates.flatMap(candidate=>candidate.sourceIds))],candidateScores:[],selectedSourceIds:[],selectedPath:null,answerQuality:null,fallbackReason:null,knowledgeLookupAttempted:!!input.knowledgePack,knowledgeCandidateCount:knowledgeCandidates.length,selectedKnowledgeIds:[],knowledgeAnswerPath:null,knowledgeFallbackReason:null,knowledgeSnapshotVersion:input.knowledgePack?.snapshotVersion||null};
  const evaluated=candidates.map(candidate=>{const concepts=questionAnswerConcepts(candidate.text),scoringText=`${candidate.section} ${candidate.category||''} ${candidate.text}`,exactAnswerScore=exactAnswerRelevance(intent,scoringText,input.question),relevantConceptScore=relevantConceptRelevance(intent,scoringText),rejectionReasons:string[]=[];for(const reference of references)if(repetitionSimilarity(candidate.text,reference.text)>=0.68)rejectionReasons.push(reference.kind);return {...candidate,concepts,exactAnswerScore,relevantConceptScore,rejectionReasons};});
 diagnostics.candidateScores=evaluated.map(candidate=>({sourceIds:candidate.sourceIds,exactAnswerScore:candidate.exactAnswerScore,relevantConceptScore:candidate.relevantConceptScore,concepts:candidate.concepts,rejectionReasons:[...candidate.rejectionReasons,...(candidate.exactAnswerScore===0&&candidate.relevantConceptScore===0?[candidate.concepts.length?'not_enough_relevant_concepts_for_single_source_answer':'no_relevant_approved_concept_match']:[])]}));
 if(existing?.resolutionState==='exhausted'&&existing.fallbackDelivered){diagnostics.candidateScores=diagnostics.candidateScores.map(candidate=>({...candidate,rejectionReasons:[...candidate.rejectionReasons,'previous_bridge_exhausted_no_nested_bridge']}));diagnostics.selectedPath='safe_fallback';diagnostics.fallbackReason='previous_bridge_exhausted_no_nested_bridge';diagnostics.knowledgeLookupDurationMs=Math.max(0,Date.now()-retrievalStartedAt);return {...safeFallback('exhausted',diagnostics),fallbackDelivered:true};}
 const sourceById=new Map(sources.map(source=>[source.id,source]));
 const composeGapAnswer=(concepts:string[])=>`Things like ${naturalList(concepts)} — areas where the pressure can show up.`;
 const validateAnswer=(answer:string,sourceIds:string[],supportedConcepts:string[])=>{
   const approvedSources=sourceIds.map(id=>sourceById.get(id)).filter(Boolean),supportedText=approvedSources.map(source=>source!.text).join(' '),answerConcepts=questionAnswerConcepts(answer),answersQuestion=intent==='gap_categories'?answerConcepts.length>=2:exactAnswerRelevance(intent,answer,input.question)>0||relevantConceptRelevance(intent,answer)>0,addsUsefulInformation=makesInformativeProgress(answer,input.question),sourceBacked=approvedSources.length===sourceIds.length&&supportedConcepts.every(concept=>questionAnswerConcepts(supportedText).includes(concept)||supportedText.toLowerCase().includes(concept.toLowerCase())),distinctFromRecentWording=!references.some(reference=>repetitionSimilarity(answer,reference.text)>=0.68),passed=answersQuestion&&addsUsefulInformation&&sourceBacked&&distinctFromRecentWording;
  return {answersQuestion,addsUsefulInformation,sourceBacked,distinctFromRecentWording,passed};
 };
 const eligible=evaluated.filter(candidate=>candidate.rejectionReasons.length===0);
 const trySelect=(items:typeof eligible,path:PracticeQuestionRetrievalDiagnostics['selectedPath'],answerFor:(candidate:typeof eligible[number])=>{answer:string;concepts:string[]}|null)=>{
  const ordered=[...items].sort((a,b)=>a.priority-b.priority||b.exactAnswerScore-a.exactAnswerScore||b.relevantConceptScore-a.relevantConceptScore);
  for(const candidate of ordered){const composed=answerFor(candidate);if(!composed)continue;const sourceIds=[...new Set(candidate.sourceIds)],quality=validateAnswer(composed.answer,sourceIds,composed.concepts);diagnostics.answerQuality=quality;if(!quality.passed){candidate.rejectionReasons.push(...Object.entries(quality).filter(([,ok])=>!ok).map(([key])=>`answer_quality_${key}_failed`));const score=diagnostics.candidateScores.find(row=>row.sourceIds.join('|')===candidate.sourceIds.join('|')&&row.exactAnswerScore===candidate.exactAnswerScore&&row.relevantConceptScore===candidate.relevantConceptScore);if(score)score.rejectionReasons=[...candidate.rejectionReasons];continue;}diagnostics.selectedPath=path;diagnostics.selectedSourceIds=sourceIds;return {candidate,answer:composed.answer,sourceIds,quality};}
  return null;
 };
 const tryKnowledgeComposition=(items:typeof eligible,path:PracticeQuestionRetrievalDiagnostics['selectedPath']='multi_source_composition',limit=4,includeSectionLabels=false)=>{
  const chosen=items.filter(candidate=>candidate.sourceType==='prepared_knowledge').filter((candidate,index,list)=>candidate.sourceIds.some(id=>!list.slice(0,index).some(previous=>previous.sourceIds.includes(id)))).slice(0,limit);
  if(chosen.length<2)return false;
  const answer=chosen.map(candidate=>includeSectionLabels?`${candidate.section}: ${candidate.text}`:candidate.text).join(' '),sourceIds=[...new Set(chosen.flatMap(candidate=>candidate.sourceIds))],concepts:string[]=[],quality=validateAnswer(answer,sourceIds,concepts);diagnostics.answerQuality=quality;
  if(!quality.passed){diagnostics.knowledgeFallbackReason='composition_failed_quality_gate';return false;}
  diagnostics.selectedPath=path;diagnostics.selectedSourceIds=sourceIds;diagnostics.selectedKnowledgeIds=sourceIds.map(id=>id.replace(/^knowledge:/,''));diagnostics.knowledgeAnswerPath=path;
  selected={candidate:{...chosen[0],sourceIds,text:answer,concepts,exactAnswerScore:chosen.reduce((sum,item)=>sum+item.exactAnswerScore,0),relevantConceptScore:0,rejectionReasons:[]},answer,sourceIds,quality};return true;
 };
 let selected=trySelect(eligible.filter(candidate=>candidate.priority===0&&candidate.exactAnswerScore>0),'exact_approved_answer',candidate=>({answer:candidate.text,concepts:candidate.concepts}));
 if(!selected&&intent==='gap_categories')selected=trySelect(eligible.filter(candidate=>candidate.priority===0&&candidate.relevantConceptScore>0),'relevant_approved_concept',candidate=>{const concepts=candidate.concepts;if(concepts.length<2)return null;return {answer:composeGapAnswer(concepts),concepts};});
 if(!selected&&intent==='product_capabilities'){
  const matching=eligible.filter(candidate=>candidate.sourceType==='prepared_knowledge'&&(candidate.category==='features'||candidate.category==='reporting_data')&&candidate.exactAnswerScore>=8).sort((a,b)=>b.exactAnswerScore-a.exactAnswerScore);
  const chosen=matching.filter((candidate,index)=>index===0||candidate.sourceIds.some(id=>!matching.slice(0,index).some(previous=>previous.sourceIds.includes(id)))).slice(0,4);
  if(chosen.length>=2){const answer=chosen.map(candidate=>`${candidate.section}: ${candidate.text}`).join(' '),sourceIds=[...new Set(chosen.flatMap(candidate=>candidate.sourceIds))],concepts:string[]=[],quality=validateAnswer(answer,sourceIds,concepts);diagnostics.answerQuality=quality;if(quality.passed){diagnostics.selectedPath='multi_source_composition';diagnostics.selectedSourceIds=sourceIds;diagnostics.selectedKnowledgeIds=sourceIds.map(id=>id.replace(/^knowledge:/,''));diagnostics.knowledgeAnswerPath='supported_feature_composition';selected={candidate:{...chosen[0],sourceIds,text:answer,concepts,exactAnswerScore:chosen.reduce((sum,item)=>sum+item.exactAnswerScore,0),relevantConceptScore:0,rejectionReasons:[]},answer,sourceIds,quality};}else diagnostics.knowledgeFallbackReason='composition_failed_quality_gate';}
 }
 if(!selected&&intent==='employer_proposition')tryKnowledgeComposition(eligible.filter(candidate=>candidate.priority===1&&['benefits','reporting_data','features'].includes(candidate.category||'')&&candidate.exactAnswerScore>0), 'multi_source_composition',4);
 if(!selected&&intent==='product_mechanism')tryKnowledgeComposition(eligible.filter(candidate=>candidate.priority===1&&/^(how membership starts|evidence develops|root keeps learning)$/i.test(candidate.section)&&candidate.exactAnswerScore>0),'multi_source_composition',3);
 if(!selected&&intent==='signup_process')tryKnowledgeComposition(eligible.filter(candidate=>candidate.priority===1&&/^(tell us about your organisation|confirm membership|set up root)$/i.test(candidate.section)&&candidate.exactAnswerScore>0),'multi_source_composition',3);
 if(!selected&&intent==='pricing'){
  const tiers=eligible.filter(candidate=>candidate.priority===1&&candidate.category==='pricing'&&candidate.sourceIds.length===1&&/(?:£\s?\d[\d,]*(?:\.\d{2})?|bespoke)/i.test(candidate.text)&&candidate.exactAnswerScore>0);
  const taxNote=eligible.find(candidate=>candidate.priority===1&&candidate.category==='commitment'&&/all prices are shown excluding vat/i.test(candidate.text));
  tryKnowledgeComposition([...tiers,...(taxNote?[taxNote]:[])],'multi_source_composition',6,true);
 }
 if(!selected&&intent!=='product_capabilities')selected=trySelect(eligible.filter(candidate=>candidate.sourceType==='prepared_knowledge'&&candidate.exactAnswerScore>0),'prepared_knowledge',candidate=>({answer:candidate.text,concepts:candidate.concepts}));
 if(!selected&&intent==='gap_categories'){
  const fragments=eligible.filter(candidate=>candidate.sourceIds.length===1&&candidate.concepts.length>0),conceptSources=new Map<string,Set<string>>();for(const candidate of fragments)for(const concept of candidate.concepts){const ids=conceptSources.get(concept)||new Set<string>();for(const id of candidate.sourceIds)ids.add(id);conceptSources.set(concept,ids);}
  const concepts=[...conceptSources.keys()],sourceIds=[...new Set(fragments.flatMap(candidate=>candidate.sourceIds))];if(concepts.length>=2&&sourceIds.length>=2){const answer=composeGapAnswer(concepts),quality=validateAnswer(answer,sourceIds,concepts);diagnostics.answerQuality=quality;if(quality.passed){diagnostics.selectedPath='multi_source_composition';diagnostics.selectedSourceIds=sourceIds;selected={candidate:{...fragments[0],sourceIds,text:fragments.map(candidate=>candidate.text).join(' '),id:fragments[0].id,sourceType:fragments.some(candidate=>candidate.sourceType==='playbook_step')?'playbook_step':'approved_claim',concepts,exactAnswerScore:0,relevantConceptScore:concepts.length,rejectionReasons:[]},answer,sourceIds,quality};}else diagnostics.fallbackReason='composed_answer_failed_quality_gate';}
 }
 if(!selected){const relevantCandidates=evaluated.filter(candidate=>candidate.exactAnswerScore>0||candidate.relevantConceptScore>0);diagnostics.selectedPath='safe_fallback';diagnostics.fallbackReason=diagnostics.fallbackReason|| (existing?.resolutionState==='exhausted'?'previous_bridge_exhausted_no_nested_bridge':bridgeTurnCount>MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'bridge_turn_limit_reached':relevantCandidates.length?'all_relevant_candidates_rejected_by_repetition_or_quality_gate':candidates.length?'no_direct_or_relevant_approved_concept':'no_approved_candidates');if(diagnostics.knowledgeLookupAttempted)diagnostics.knowledgeFallbackReason=knowledgeCandidates.length?'no_supported_knowledge_answer':'prepared_pack_has_no_relevant_items';diagnostics.knowledgeLookupDurationMs=Math.max(0,Date.now()-retrievalStartedAt);return safeFallback('exhausted',diagnostics);}
 const supportingText=selected.candidate.text,sourceType=selected.candidate.sourceType;let sellerWording=selected.answer;
 if(sourceType==='prepared_knowledge'){diagnostics.selectedKnowledgeIds=[...new Set(selected.sourceIds.map(id=>id.replace(/^knowledge:/,'')))];diagnostics.knowledgeAnswerPath=diagnostics.knowledgeAnswerPath||diagnostics.selectedPath||'direct_prepared_knowledge';const selectedFacts=selected.sourceIds.map(id=>sourceById.get(id)).filter((source):source is NonNullable<typeof source>=>!!source&&source.sourceType==='prepared_knowledge').map(source=>({section:source.section,text:source.text,...('category' in source?{category:source.category}:{})}));sellerWording=concisePreparedKnowledgeAnswer(intent,selectedFacts)||selected.answer;}diagnostics.knowledgeLookupDurationMs=Math.max(0,Date.now()-retrievalStartedAt);
  return {...base,resolutionState:bridgeTurnCount>=MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'exhausted':'active',fallbackDelivered:bridgeTurnCount>MAX_PRACTICE_QUESTION_BRIDGE_TURNS,approvedQuestionResponse:sellerWording,sellerControlQuestion:practiceQuestionControlMove(intent,currentStep?.section||'unknown',input.question),sourceType,sourceId:selected.candidate.id,sourceIds:selected.sourceIds,supportingText,retrievalDiagnostics:diagnostics,classification:'supported_question',evidenceFamily:null,canonicalAction:'resume_or_advance',detourAction:bridgeTurnCount>=MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'close':'continue'};
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
