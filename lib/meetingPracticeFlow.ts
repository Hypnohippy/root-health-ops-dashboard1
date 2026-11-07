import type {SalesPlaybook,ScriptNavigation} from './meetingAdaptiveCoach';

export type PracticeBuyerClassification='normal_response'|'objection'|'direct_question'|'clear_acceptance'|'not_ready'|'clear_rejection';
export type PracticeQuestionSource='playbook_step'|'approved_claim'|'safe_fallback';
export type PracticeQuestionResolution='awaiting_seller'|'awaiting_buyer';
export type PracticeQuestionBridgeResolution='active'|'exhausted';
export type PracticeQuestionAnswerHistoryEntry={
 question:string;
 answer:string;
 sourceType:PracticeQuestionSource;
 sourceId:string|null;
 sourceIds:string[];
 supportingText:string|null;
};
export type PracticeQuestionBridge={
 id:string;
 bridgeId:string;
 currentScriptStepId:string;
 questionBridgeActive:true;
 suspendedScriptStepId:string;
 originalQuestion:string;
 latestQuestion:string;
 answerHistory:PracticeQuestionAnswerHistoryEntry[];
 bridgeTurnCount:number;
 resolutionState:PracticeQuestionBridgeResolution;
 fallbackDelivered:boolean;
 questionSummary:string;
 approvedQuestionResponse:string;
 questionResolutionState:PracticeQuestionResolution;
 sourceType:PracticeQuestionSource;
 sourceId:string|null;
 sourceIds:string[];
 supportingText:string|null;
 recoveryRequired?:boolean;
 recoveryCount?:number;
};
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

const stopWords=new Set(['what','when','where','which','who','whom','whose','why','how','does','did','doing','would','could','should','can','will','the','and','for','from','with','that','this','they','them','you','your','our','their','about','into','usually','specifically','exactly','kind','look','like','mean','much','many','some','tell','please','company','companies','organisation','organisations','organization','organizations','every','result','results','people','team','teams','practice','recommend','recommendations','solution','solutions']);
function normalizeToken(token:string){return token.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ies$/,'y').replace(/s$/,'').replace(/ing$/,'').replace(/ed$/,'');}
function tokens(value:string){return value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!stopWords.has(token));}
function sentenceList(source:string){return source.split(/(?<=[.!?])\s+/).map(value=>value.trim()).filter(Boolean);}
type PracticeQuestionIntent='gap_categories'|'solution_capability'|'product_mechanism'|'follow_up_detail'|'general';
function questionIntent(question:string):PracticeQuestionIntent{
 if(/\b(solutions?|recommend(?:ation|ations)?|interventions?|address|resolve|deal with)\b/i.test(question))return 'solution_capability';
 if(/\b(follow[ -]?up|next step|next meeting|conversation|appointment)\b/i.test(question))return 'follow_up_detail';
 if(/\b(how does|how do|how would|how exactly|what does .* do|what is .* designed to|how .* work)\b/i.test(question))return 'product_mechanism';
 if(/\b(gaps?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction)\b/i.test(question)&&/\b(kind|type|example|what|which)\b/i.test(question))return 'gap_categories';
 return 'general';
}
function semanticRelevance(intent:PracticeQuestionIntent,sentence:string,question:string):number{
 const text=sentence.toLowerCase();
 if(intent==='gap_categories'){
  const groundedListHead=/\b(?:gaps?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction points?)\b.{0,64}\b(?:include|including|such as|for example|range from|can be|may include)\b/i.test(text);
  const commaItems=(sentence.match(/,/g)||[]).length;
  const multipleItems=commaItems>=1||/\b(and|or)\b/i.test(text);
  return groundedListHead&&multipleItems?8:0;
 }
 if(intent==='solution_capability'){
  const capabilitySignals=[/\b(designed|helps?|enables?|supports?|provides?|gives?)\b/i,/\b(continu(?:ous|ously)|day to day|daily|regularly|over time)\b/i,/\b(understand|identify|clearer view|show|reveal)\b/i,/\b(survey|surveys|one.off|initiative|initiatives)\b/i,/\b(employee|organisation|organization|support|wellbeing|well-being)\b/i];
  const count=capabilitySignals.filter(pattern=>pattern.test(text)).length;
  return count>=4?count+4:0;
 }
 if(intent==='product_mechanism'){
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
function repetitionSimilarity(candidate:string,reference:string):number{
 const a=new Set(tokens(candidate)),b=new Set(tokens(reference));
 if(!a.size||!b.size)return 0;
 const overlap=[...a].filter(token=>b.has(token)).length;
 return overlap/Math.min(a.size,b.size);
}
function makesInformativeProgress(candidate:string,question:string){const candidateTokens=new Set(tokens(candidate)),questionTokens=new Set(tokens(question));const repeatsQuestion=questionTokens.size>=3&&repetitionSimilarity(candidate,question)>=0.72;return !repeatsQuestion&&[...candidateTokens].filter(token=>!questionTokens.has(token)).length>=3;}
const fallbackAnswer="I don’t want to guess or overstate that. What would be most useful for you to understand first, so I can answer accurately?";
export const MAX_PRACTICE_QUESTION_BRIDGE_TURNS=3;

/** Mark that the seller has delivered the current bridge answer; an exhausted fallback must not loop. */
export function markPracticeQuestionBridgeAnswerSubmitted(bridge:PracticeQuestionBridge):PracticeQuestionBridge{
 return {...bridge,questionResolutionState:'awaiting_buyer',resolutionState:bridge.resolutionState==='exhausted'?'exhausted':'active',fallbackDelivered:bridge.sourceType==='safe_fallback'||bridge.fallbackDelivered};
}

/** A delivered exhausted fallback closes the detour; later questions return to normal objection/navigation handling. */
export function canContinuePracticeQuestionBridge(bridge:PracticeQuestionBridge|null|undefined):boolean{
 return !bridge||bridge.resolutionState!=='exhausted'||!bridge.fallbackDelivered;
}

/** Keep an unsupported direct buyer question visible as a handoff instead of resuming unrelated script wording. */
export function createPracticeQuestionRecovery(bridge:PracticeQuestionBridge,question:string):PracticeQuestionBridge{
 const previousAnswer=bridge.questionResolutionState==='awaiting_buyer'?{question:bridge.latestQuestion,answer:bridge.approvedQuestionResponse,sourceType:bridge.sourceType,sourceId:bridge.sourceId,sourceIds:bridge.sourceIds,supportingText:bridge.supportingText}:null;
 const recoveryCount=(bridge.recoveryCount||0)+1;
 const recoveryWording=[
  'I don’t want to guess or overstate that. What would be most useful for you to understand first, so I can answer accurately?',
  'I’d rather give you a properly grounded answer than speculate. Which part would be most useful to explore first?',
  'I can’t answer that accurately from the approved information yet. Let’s stay with what we can establish: what is the main issue you want to address?'
 ][Math.min(recoveryCount,2)];
 return {...bridge,latestQuestion:question,questionSummary:question.slice(0,240),answerHistory:previousAnswer?[...bridge.answerHistory,previousAnswer]:bridge.answerHistory,questionBridgeActive:true,resolutionState:'exhausted',fallbackDelivered:true,recoveryRequired:true,recoveryCount,approvedQuestionResponse:recoveryWording,questionResolutionState:'awaiting_seller',sourceType:'safe_fallback',sourceId:null,sourceIds:[],supportingText:null};
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

export function practiceBuyerResponseWithinDefaultBudget(text:string,explicitScenarioNeed=false){
 const value=text.trim(),sentences=value.split(/(?<=[.!?])\s+/).filter(Boolean);
 return !!value&&value.length<=(explicitScenarioNeed?1200:520)&&sentences.length<=(explicitScenarioNeed?6:3);
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
export function createPracticeQuestionBridge(input:{question:string;playbook:SalesPlaybook;currentScriptStepId:string;existingBridge?:PracticeQuestionBridge|null;buyerTurnId:string;previousSellerText?:string|null}):PracticeQuestionBridge{
 const existing=input.existingBridge||null;
 const previousAnswer=existing?.questionResolutionState==='awaiting_buyer'?{question:existing.latestQuestion,answer:existing.approvedQuestionResponse,sourceType:existing.sourceType,sourceId:existing.sourceId,sourceIds:existing.sourceIds,supportingText:existing.supportingText}:null;
 const answerHistory=previousAnswer?[...(existing?.answerHistory||[]),previousAnswer]:[...(existing?.answerHistory||[])];
 const bridgeTurnCount=existing?existing.bridgeTurnCount+1:1;
 const bridgeId=existing?.bridgeId||`question-bridge-${input.buyerTurnId}`;
 const suspendedScriptStepId=existing?.suspendedScriptStepId||input.currentScriptStepId;
 const base={
  id:bridgeId,bridgeId,currentScriptStepId:suspendedScriptStepId,questionBridgeActive:true as const,suspendedScriptStepId,
  originalQuestion:existing?.originalQuestion||input.question,latestQuestion:input.question,answerHistory,bridgeTurnCount,
  questionSummary:input.question.slice(0,240),questionResolutionState:'awaiting_seller' as const,recoveryRequired:false,
 };
 const safeFallback=(resolutionState:PracticeQuestionBridgeResolution='exhausted'):PracticeQuestionBridge=>({...base,resolutionState,fallbackDelivered:false,approvedQuestionResponse:fallbackAnswer,sourceType:'safe_fallback',sourceId:null,sourceIds:[],supportingText:null});
 if(existing?.resolutionState==='exhausted'||bridgeTurnCount>MAX_PRACTICE_QUESTION_BRIDGE_TURNS)return safeFallback();

 const intent=questionIntent(input.question),currentStep=input.playbook.scriptSteps.find(step=>step.id===suspendedScriptStepId);
 const sources=[
  ...input.playbook.scriptSteps.filter(step=>step.section!=='approved_claims').map(step=>({id:step.id,section:step.section,text:step.text,sourceType:'playbook_step' as const})),
  ...input.playbook.approvedClaims.map((text,index)=>({id:`claim-${index+1}`,section:'approved_claims',text,sourceType:'approved_claim' as const})),
 ];
 const groupedSources=new Map<string,typeof sources>();
 for(const source of sources){const group=groupedSources.get(`${source.sourceType}:${source.section}`)||[];group.push(source);groupedSources.set(`${source.sourceType}:${source.section}`,group);}
 const candidates:{id:string;sourceIds:string[];text:string;sourceType:'playbook_step'|'approved_claim'}[]=[];
 for(const group of groupedSources.values()){
  const fragments=group.flatMap(source=>sentenceList(source.text).map(text=>({id:source.id,text,sourceType:source.sourceType})));
  for(let index=0;index<fragments.length;index++){
   const first=fragments[index];candidates.push({id:first.id,sourceIds:[first.id],text:first.text,sourceType:first.sourceType});
   const second=fragments[index+1];
   if(second&&first.sourceType===second.sourceType&&first.text!==second.text&&`${first.text} ${second.text}`.length<=480)candidates.push({id:first.id,sourceIds:[first.id,second.id],text:`${first.text} ${second.text}`,sourceType:first.sourceType});
  }
 }
 const priorAnswers=answerHistory.map(entry=>entry.answer);
 const references=[input.previousSellerText||'',currentStep?.text||'',...priorAnswers].filter(Boolean);
 let winner:{id:string;sourceIds:string[];text:string;sourceType:'playbook_step'|'approved_claim';score:number}|null=null;
 for(const candidate of candidates){
  const answer=candidate.text;
  if(references.some(reference=>repetitionSimilarity(answer,reference)>=0.68))continue;
  if(!makesInformativeProgress(answer,input.question))continue;
  const score=semanticRelevance(intent,answer,input.question);
  if(score>0&&(!winner||score>winner.score))winner={id:candidate.id,sourceIds:candidate.sourceIds,text:answer,sourceType:candidate.sourceType,score};
 }
 if(!winner)return safeFallback();
 const prefix=winner.sourceType==='approved_claim'?'The approved information describes it this way: ':'One relevant point from the approved playbook is: ';
 return {...base,resolutionState:bridgeTurnCount>=MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'exhausted':'active',fallbackDelivered:false,approvedQuestionResponse:`${prefix}${winner.text}`,sourceType:winner.sourceType,sourceId:winner.id,sourceIds:winner.sourceIds,supportingText:winner.text};
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
