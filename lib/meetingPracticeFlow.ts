import type {SalesPlaybook} from './meetingAdaptiveCoach';

export type PracticeBuyerClassification='normal_response'|'objection'|'direct_question'|'clear_acceptance'|'not_ready'|'clear_rejection';
export type PracticeQuestionSource='playbook_step'|'approved_claim'|'safe_fallback';
export type PracticeQuestionResolution='awaiting_seller'|'awaiting_buyer';
export type PracticeQuestionBridge={
 id:string;
 currentScriptStepId:string;
 questionBridgeActive:true;
 suspendedScriptStepId:string;
 questionSummary:string;
 approvedQuestionResponse:string;
 questionResolutionState:PracticeQuestionResolution;
 sourceType:PracticeQuestionSource;
 sourceId:string|null;
 supportingText:string|null;
};
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
const acceptance=/\b(yes|sounds good|that works|works for me|let's (?:do|schedule|book|set up)|i'm interested|i am interested|happy to|i'd be open|i would be open|agree|go ahead|ready to)\b/i;
const notReady=/\b(not ready|need (?:some )?time|need to think|think about it|not yet|maybe later|unsure|a bit unsure|still deciding|no time right now|too busy right now)\b/i;

/** Classifies only the already role-validated synthetic buyer utterance. A direct question is not an objection by default. */
export function classifyPracticeBuyerTurn(text:string):PracticeBuyerClassification{
 const value=text.trim();
 if(!value)return 'normal_response';
 if(rejection.test(value))return 'clear_rejection';
 if(value.includes('?')&&questionLead.test(value)||/\b(tell me more|can you explain|could you explain|i'd like to know|i would like to know)\b/i.test(value))return 'direct_question';
 if(objection.test(value))return 'objection';
 if(acceptance.test(value))return 'clear_acceptance';
 if(notReady.test(value))return 'not_ready';
 return 'normal_response';
}

const stopWords=new Set(['what','when','where','which','who','whom','whose','why','how','does','did','doing','would','could','should','can','will','the','and','for','from','with','that','this','they','them','you','your','our','their','about','into','usually','specifically','exactly','kind','look','like','mean','much','many','some','tell','please','company','companies','organisation','organisations','organization','organizations','every','result','results','people','team','teams','practice']);
function normalizeToken(token:string){return token.toLowerCase().replace(/[^a-z0-9]/g,'').replace(/ies$/,'y').replace(/s$/,'').replace(/ing$/,'').replace(/ed$/,'');}
function tokens(value:string){return value.toLowerCase().split(/[^a-z0-9]+/).map(normalizeToken).filter(token=>token.length>2&&!stopWords.has(token));}
function bestSentence(questionTerms:Set<string>,source:string){
 const sentences=source.split(/(?<=[.!?])\s+/).map(value=>value.trim()).filter(Boolean);
 let best:{text:string;score:number}|null=null;
 for(const sentence of sentences){const terms=new Set(tokens(sentence)),score=[...questionTerms].filter(term=>terms.has(term)).length;if(score>0&&(!best||score>best.score))best={text:sentence,score};}
 return best;
}
const fallbackAnswer="I don't want to guess at that. Let's keep it as a point to clarify before deciding.";

/** Uses only exact sentences in the uploaded playbook or its approved-claims list; otherwise returns a non-claiming fallback. */
export function createPracticeQuestionBridge(input:{question:string;playbook:SalesPlaybook;currentScriptStepId:string;existingBridge?:PracticeQuestionBridge|null;buyerTurnId:string}):PracticeQuestionBridge{
 const current=input.playbook.scriptSteps.findIndex(step=>step.id===input.currentScriptStepId),currentSection=input.playbook.scriptSteps[current]?.section,questionTerms=new Set(tokens(input.question));
 const stepCandidates=input.playbook.scriptSteps.map((step,index)=>({id:step.id,section:step.section,text:step.text,rank:index===current?3:step.section===currentSection?2:1}));
 const candidates=[...stepCandidates,...input.playbook.approvedClaims.map((text,index)=>({id:`claim-${index+1}`,section:currentSection,text,rank:0}))];
 let winner:{id:string;sentence:string;score:number;rank:number;sourceType:PracticeQuestionSource}|null=null;
 for(const candidate of candidates){const match=bestSentence(questionTerms,candidate.text);if(!match)continue;const score=match.score*10+candidate.rank;if(!winner||score>winner.score)winner={id:candidate.id,sentence:match.text,score,rank:candidate.rank,sourceType:candidate.id.startsWith('claim-')?'approved_claim':'playbook_step'};}
 // Avoid presenting a barely related line as an answer: the fallback is safer than inventing facts.
 const minimumMatches=1;
 if(winner&&winner.score>=minimumMatches*10){
  const prefix=winner.sourceType==='approved_claim'?'What I can say from the approved information is: ':'The approved script puts it this way: ';
  return {id:`question-${input.buyerTurnId}`,currentScriptStepId:input.currentScriptStepId,questionBridgeActive:true,suspendedScriptStepId:input.existingBridge?.suspendedScriptStepId||input.currentScriptStepId,questionSummary:input.question.slice(0,240),approvedQuestionResponse:`${prefix}${winner.sentence}`,questionResolutionState:'awaiting_seller',sourceType:winner.sourceType,sourceId:winner.id,supportingText:winner.sentence};
 }
 return {id:`question-${input.buyerTurnId}`,currentScriptStepId:input.currentScriptStepId,questionBridgeActive:true,suspendedScriptStepId:input.existingBridge?.suspendedScriptStepId||input.currentScriptStepId,questionSummary:input.question.slice(0,240),approvedQuestionResponse:fallbackAnswer,questionResolutionState:'awaiting_seller',sourceType:'safe_fallback',sourceId:null,supportingText:null};
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
