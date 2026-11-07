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
export type PracticeQuestionCandidateScore={sourceIds:string[];exactAnswerScore:number;relevantConceptScore:number;concepts:string[];rejectionReasons:string[]};
export type PracticeQuestionRetrievalDiagnostics={intent:string;candidateCount:number;candidateSourceIds:string[];candidateScores:PracticeQuestionCandidateScore[];selectedSourceIds:string[];selectedPath:'exact_approved_answer'|'relevant_approved_concept'|'multi_source_composition'|'safe_fallback'|null;answerQuality:{answersQuestion:boolean;addsUsefulInformation:boolean;sourceBacked:boolean;distinctFromRecentWording:boolean;passed:boolean}|null;fallbackReason:string|null};
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
 retrievalDiagnostics?:PracticeQuestionRetrievalDiagnostics;
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

const stopWords=new Set(['what','when','where','which','who','whom','whose','why','how','does','did','doing','would','could','should','can','will','the','and','for','from','with','that','this','they','them','you','your','our','their','about','into','usually','specifically','exactly','kind','look','looking','like','mean','much','many','some','tell','please','company','companies','organisation','organisations','organization','organizations','every','result','results','people','team','teams','practice','recommend','recommendations','solution','solutions']);
function normalizeToken(token:string){return token.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ies$/,'y').replace(/s$/,'').replace(/ing$/,'').replace(/ed$/,'');}
function tokens(value:string){return value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!stopWords.has(token));}
function sentenceList(source:string){return source.split(/(?<=[.!?])\s+/).map(value=>value.trim()).filter(Boolean);}
type PracticeQuestionIntent='gap_categories'|'solution_capability'|'product_mechanism'|'follow_up_detail'|'general';
function questionIntent(question:string,context=''):PracticeQuestionIntent{
  if(/\b(solutions?|recommend(?:ation|ations)?|interventions?|treatments?|prescribe|address|resolve|deal with)\b/i.test(question))return 'solution_capability';
 if(/\b(follow[ -]?up|next step|next meeting|conversation|appointment)\b/i.test(question))return 'follow_up_detail';
 if(/\b(how does|how do|how would|how exactly|what does .* do|what is .* designed to|how .* work)\b/i.test(question))return 'product_mechanism';
  const gapTopic=/\b(gaps?|pressure|bottlenecks?|absence|burnout|stress|manager strain|engagement|wellbeing issues?|well-being issues?|underused support|existing support)\b/i.test(question);
  const asksForAreas=/\b(?:what|which)\s+(?:kinds?|types?|sorts?|areas?|examples?)\b|\bwhat exactly (?:are you )?looking for\b|\bwhere (?:do you|would you|does it) (?:usually )?(?:see|find|show)\b/i.test(question);
  const contextualGap=/\b(gaps?|pressure|absence|burnout|stress|manager strain|engagement|underused support|existing support)\b/i.test(context);
  if(gapTopic||asksForAreas&&contextualGap||/\b(gaps?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction)\b/i.test(question)&&/\b(kind|type|example|what|which|mean|specifically)\b/i.test(question))return 'gap_categories';
 return 'general';
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
 if(intent==='gap_categories'){
    const concepts=questionAnswerConcepts(sentence),literalAnswer=/\b(?:gaps?|pressure areas?|issues?|challenges?|problems?|bottlenecks?|barriers?|friction points?)\b.{0,80}\b(?:include|including|such as|for example|range from|can be|may include|are)\b/i.test(text);
   return literalAnswer&&concepts.length>=2?8+concepts.length:0;
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
 if(intent==='product_mechanism')return 'I don’t have an approved explanation for that detail. Which part of how it works should I clarify?';
 if(intent==='follow_up_detail')return 'I don’t have an approved detail about that next step. What part of the follow-up should I clarify?';
 return 'I don’t have an approved answer to that specific question. What detail should I clarify?';
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
 const recoveryWording=fallbackAnswerFor(questionIntent(question,[bridge.originalQuestion,bridge.latestQuestion].join(' ')),question,recoveryCount);
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
 const wordCount=value.split(/\s+/).filter(Boolean).length;
 return !!value&&value.length<=(explicitScenarioNeed?1200:300)&&sentences.length<=(explicitScenarioNeed?6:2)&&(explicitScenarioNeed||wordCount<=38);
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
 const intent=questionIntent(input.question,[existing?.originalQuestion||'',existing?.latestQuestion||'',input.playbook.scriptSteps.find(step=>step.id===suspendedScriptStepId)?.text||'',...input.playbook.scriptSteps.map(step=>step.text),...input.playbook.approvedClaims].join(' '));
 const safeFallback=(resolutionState:PracticeQuestionBridgeResolution='exhausted',retrievalDiagnostics:PracticeQuestionRetrievalDiagnostics):PracticeQuestionBridge=>({...base,resolutionState,fallbackDelivered:false,approvedQuestionResponse:fallbackAnswerFor(intent,input.question),sourceType:'safe_fallback',sourceId:null,sourceIds:[],supportingText:null,retrievalDiagnostics});
 const currentStep=input.playbook.scriptSteps.find(step=>step.id===suspendedScriptStepId);
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
 const references=[{kind:'previous_seller_wording',text:input.previousSellerText||''},{kind:'current_step_wording',text:currentStep?.text||''},...priorAnswers.map(text=>({kind:'previous_bridge_answer',text}))].filter(item=>item.text);
 const diagnostics:PracticeQuestionRetrievalDiagnostics={intent,candidateCount:candidates.length,candidateSourceIds:[...new Set(candidates.flatMap(candidate=>candidate.sourceIds))],candidateScores:[],selectedSourceIds:[],selectedPath:null,answerQuality:null,fallbackReason:null};
  const evaluated=candidates.map(candidate=>{const concepts=questionAnswerConcepts(candidate.text),exactAnswerScore=exactAnswerRelevance(intent,candidate.text,input.question),relevantConceptScore=relevantConceptRelevance(intent,candidate.text),rejectionReasons:string[]=[];for(const reference of references)if(repetitionSimilarity(candidate.text,reference.text)>=0.68)rejectionReasons.push(reference.kind);return {...candidate,concepts,exactAnswerScore,relevantConceptScore,rejectionReasons};});
 diagnostics.candidateScores=evaluated.map(candidate=>({sourceIds:candidate.sourceIds,exactAnswerScore:candidate.exactAnswerScore,relevantConceptScore:candidate.relevantConceptScore,concepts:candidate.concepts,rejectionReasons:[...candidate.rejectionReasons,...(candidate.exactAnswerScore===0&&candidate.relevantConceptScore===0?[candidate.concepts.length?'not_enough_relevant_concepts_for_single_source_answer':'no_relevant_approved_concept_match']:[])]}));
 if(existing?.resolutionState==='exhausted'&&existing.fallbackDelivered){diagnostics.candidateScores=diagnostics.candidateScores.map(candidate=>({...candidate,rejectionReasons:[...candidate.rejectionReasons,'previous_bridge_exhausted_no_nested_bridge']}));diagnostics.selectedPath='safe_fallback';diagnostics.fallbackReason='previous_bridge_exhausted_no_nested_bridge';return {...safeFallback('exhausted',diagnostics),fallbackDelivered:true};}
 const sourceById=new Map(sources.map(source=>[source.id,source]));
 const composeGapAnswer=(concepts:string[])=>`Things like ${naturalList(concepts)} — areas where the pressure can show up.`;
 const validateAnswer=(answer:string,sourceIds:string[],supportedConcepts:string[])=>{
   const approvedSources=sourceIds.map(id=>sourceById.get(id)).filter(Boolean),supportedText=approvedSources.map(source=>source!.text).join(' '),answerConcepts=questionAnswerConcepts(answer),answersQuestion=intent==='gap_categories'?answerConcepts.length>=2:exactAnswerRelevance(intent,answer,input.question)>0||relevantConceptRelevance(intent,answer)>0,addsUsefulInformation=makesInformativeProgress(answer,input.question),sourceBacked=approvedSources.length===sourceIds.length&&supportedConcepts.every(concept=>questionAnswerConcepts(supportedText).includes(concept)||supportedText.toLowerCase().includes(concept.toLowerCase())),distinctFromRecentWording=!references.some(reference=>repetitionSimilarity(answer,reference.text)>=0.68),passed=answersQuestion&&addsUsefulInformation&&sourceBacked&&distinctFromRecentWording;
  return {answersQuestion,addsUsefulInformation,sourceBacked,distinctFromRecentWording,passed};
 };
 const eligible=evaluated.filter(candidate=>candidate.rejectionReasons.length===0);
 const trySelect=(items:typeof eligible,path:PracticeQuestionRetrievalDiagnostics['selectedPath'],answerFor:(candidate:typeof eligible[number])=>{answer:string;concepts:string[]}|null)=>{
  const ordered=[...items].sort((a,b)=>b.exactAnswerScore-a.exactAnswerScore||b.relevantConceptScore-a.relevantConceptScore);
  for(const candidate of ordered){const composed=answerFor(candidate);if(!composed)continue;const sourceIds=[...new Set(candidate.sourceIds)],quality=validateAnswer(composed.answer,sourceIds,composed.concepts);diagnostics.answerQuality=quality;if(!quality.passed){candidate.rejectionReasons.push(...Object.entries(quality).filter(([,ok])=>!ok).map(([key])=>`answer_quality_${key}_failed`));const score=diagnostics.candidateScores.find(row=>row.sourceIds.join('|')===candidate.sourceIds.join('|')&&row.exactAnswerScore===candidate.exactAnswerScore&&row.relevantConceptScore===candidate.relevantConceptScore);if(score)score.rejectionReasons=[...candidate.rejectionReasons];continue;}diagnostics.selectedPath=path;diagnostics.selectedSourceIds=sourceIds;return {candidate,answer:composed.answer,sourceIds,quality};}
  return null;
 };
 let selected=trySelect(eligible.filter(candidate=>candidate.exactAnswerScore>0),'exact_approved_answer',candidate=>({answer:candidate.text,concepts:candidate.concepts}));
 if(!selected&&intent==='gap_categories')selected=trySelect(eligible.filter(candidate=>candidate.relevantConceptScore>0),'relevant_approved_concept',candidate=>{const concepts=candidate.concepts;if(concepts.length<2)return null;return {answer:composeGapAnswer(concepts),concepts};});
 if(!selected&&intent==='gap_categories'){
  const fragments=eligible.filter(candidate=>candidate.sourceIds.length===1&&candidate.concepts.length>0),conceptSources=new Map<string,Set<string>>();for(const candidate of fragments)for(const concept of candidate.concepts){const ids=conceptSources.get(concept)||new Set<string>();for(const id of candidate.sourceIds)ids.add(id);conceptSources.set(concept,ids);}
  const concepts=[...conceptSources.keys()],sourceIds=[...new Set(fragments.flatMap(candidate=>candidate.sourceIds))];if(concepts.length>=2&&sourceIds.length>=2){const answer=composeGapAnswer(concepts),quality=validateAnswer(answer,sourceIds,concepts);diagnostics.answerQuality=quality;if(quality.passed){diagnostics.selectedPath='multi_source_composition';diagnostics.selectedSourceIds=sourceIds;selected={candidate:{...fragments[0],sourceIds,text:fragments.map(candidate=>candidate.text).join(' '),id:fragments[0].id,sourceType:fragments.some(candidate=>candidate.sourceType==='playbook_step')?'playbook_step':'approved_claim',concepts,exactAnswerScore:0,relevantConceptScore:concepts.length,rejectionReasons:[]},answer,sourceIds,quality};}else diagnostics.fallbackReason='composed_answer_failed_quality_gate';}
 }
 if(!selected){const relevantCandidates=evaluated.filter(candidate=>candidate.exactAnswerScore>0||candidate.relevantConceptScore>0);diagnostics.selectedPath='safe_fallback';diagnostics.fallbackReason=diagnostics.fallbackReason|| (existing?.resolutionState==='exhausted'?'previous_bridge_exhausted_no_nested_bridge':bridgeTurnCount>MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'bridge_turn_limit_reached':relevantCandidates.length?'all_relevant_candidates_rejected_by_repetition_or_quality_gate':candidates.length?'no_direct_or_relevant_approved_concept':'no_approved_candidates');return safeFallback('exhausted',diagnostics);}
 const supportingText=selected.candidate.text,sourceType=selected.candidate.sourceType;
 return {...base,resolutionState:bridgeTurnCount>=MAX_PRACTICE_QUESTION_BRIDGE_TURNS?'exhausted':'active',fallbackDelivered:bridgeTurnCount>MAX_PRACTICE_QUESTION_BRIDGE_TURNS,approvedQuestionResponse:selected.answer,sourceType,sourceId:selected.candidate.id,sourceIds:selected.sourceIds,supportingText,retrievalDiagnostics:diagnostics};
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
