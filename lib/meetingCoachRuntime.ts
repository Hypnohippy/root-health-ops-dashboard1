import type {MeetingCandidate,MeetingSegment} from './meetingCopilot';
import {coachingSuppression,groundedCoachingList,type MeetingFact} from './meetingCoaching';

export type CoachingConfig={intensity:'close'|'balanced'|'important';motion:string;desiredOutcome:string};
export const defaultCoachingConfig:CoachingConfig={intensity:'balanced',motion:'unconfigured',desiredOutcome:''};
export type CoachTrace={stage:string;at:number;sequence:number;promptId?:string;reason?:string;signals?:string[];durationMs?:number};
export type CoachOpportunity={run:boolean;signals:string[];reason:string};
export type ConversationStateHint={kind:'time_constraint'|'exploration'|'budget_uncertainty'|'timeframe_uncertainty'|'problem_language'|'follow_up_request'|'contact_boundary';segmentId:string;quote:string};
export type ConversationState={observations:ConversationStateHint[];questionTrail:{segmentId:string;text:string}[]};
const stateMatchers:[ConversationStateHint['kind'],RegExp][]=[
 ['time_constraint',/only\s+(?:(?:got|have)\s+)?(?:a\s+)?few\s+minutes|short\s+on\s+time|time\s+is\s+tight|busy\s+today/i],
 ['exploration',/just\s+(?:looking|exploring|seeing)|just\s+having\s+a\s+look|not\s+sure\s+what\s+we\s+need/i],
 ['budget_uncertainty',/no\s+(?:signed[- ]off\s+)?budget|budget.{0,35}(?:not\s+approved|not\s+signed|unclear)|keep\s+(?:the\s+)?spend\s+tight|not\s+sure.{0,20}budget/i],
 ['timeframe_uncertainty',/no\s+(?:clear\s+)?(?:timeframe|timeline)|not\s+sure.{0,20}(?:when|timing)|no\s+date\s+in\s+mind/i],
 ['problem_language',/wear\s+and\s+tear|people.{0,35}tired|struggling|difficult|impact|problem/i],
 ['follow_up_request',/(?:send|email|receive|include|cover).{0,110}(?:summary|brief|purpose|effort|ballpark|cost|price|next\s+step|what\s+happens)/i],
 ['contact_boundary',/do\s+not\s+(?:contact|follow\s+up)|don.t\s+(?:contact|email|call|follow\s+up)|no\s+more\s+(?:calls|emails|contact)/i],
];
/** Session-only evidence pointers. They contain no speaker attribution or inferred fact. */
export function buildConversationState(segments:MeetingSegment[],priorValue?:unknown):ConversationState{
 const speech=segments.filter(s=>!s.gap&&s.text.trim()),prior=normalizeConversationState(priorValue),observations=[...prior.observations];
 for(const [kind,matcher] of stateMatchers){const matches=speech.filter(s=>matcher.test(s.text)),existing=observations.findIndex(h=>h.kind===kind),picked=kind==='time_constraint'||kind==='exploration'?(!observations.some(h=>h.kind===kind)?matches[0]:undefined):matches.at(-1);if(picked){const hint={kind,segmentId:picked.id,quote:picked.text.trim().slice(0,260)};if(existing>=0)observations[existing]=hint;else observations.push(hint);}}
 const fresh=speech.flatMap(s=>(s.text.match(/[^.!?]*\?/g)||[]).map(text=>({segmentId:s.id,text:text.trim().slice(-220)}))).filter(q=>q.text.length>=8),questionTrail=[...prior.questionTrail,...fresh].filter((q,i,a)=>a.findIndex(x=>x.segmentId===q.segmentId&&x.text===q.text)===i).slice(-8);
 return {observations:observations.slice(-7),questionTrail};
}
export function normalizeConversationState(value:unknown):ConversationState{
 if(!value||typeof value!=='object')return {observations:[],questionTrail:[]};const row=value as Record<string,unknown>,allowed=new Set(stateMatchers.map(([kind])=>kind));
 const observations=Array.isArray(row.observations)?row.observations.slice(-7).flatMap(item=>{if(!item||typeof item!=='object')return[];const r=item as Record<string,unknown>;return typeof r.kind==='string'&&allowed.has(r.kind as ConversationStateHint['kind'])&&typeof r.segmentId==='string'&&r.segmentId.length<=80&&typeof r.quote==='string'&&r.quote.trim().length>=8?[{kind:r.kind as ConversationStateHint['kind'],segmentId:r.segmentId,quote:r.quote.trim().slice(0,260)}]:[];}):[];
 const questionTrail=Array.isArray(row.questionTrail)?row.questionTrail.slice(-8).flatMap(item=>{if(!item||typeof item!=='object')return[];const r=item as Record<string,unknown>;return typeof r.segmentId==='string'&&r.segmentId.length<=80&&typeof r.text==='string'&&r.text.trim().length>=8?[{segmentId:r.segmentId,text:r.text.trim().slice(0,220)}]:[];}):[];
 return {observations,questionTrail};
}
// These are provisional text signals, not speaker attribution, diagnosis or sales facts.
export function coachingOpportunity(segments:MeetingSegment[],sequence:number,config=defaultCoachingConfig,checkingOpenPrompt=false,stateValue?:unknown):CoachOpportunity{
 const state=normalizeConversationState(stateValue),speech=segments.filter(s=>!s.gap),spoken=speech.filter(s=>s.text.trim()),latestChunk=speech.at(-1)?.text||'',latest=spoken.at(-1)?.text||'',recent=spoken.slice(-12).map(s=>s.text).join(' '),signals:string[]=[],hints=state.observations;
 if(!latestChunk.trim()){const prior=latest,hasStallQuestion=spoken.slice(-8).some(s=>/\?/.test(s.text))&&/not sure|don't know|do not know|no idea|can't say|cannot say|not really/i.test(prior);if(hasStallQuestion)signals.push('possible_pause_after_nonprogress');if(!signals.length)return {run:false,signals,reason:'no_speech'};}
 else {
 if(/only\s+(?:(?:got|have)\s+)?(?:a\s+)?few\s+minutes|short\s+on\s+time|time\s+is\s+tight|got\s+to\s+go|busy|a\s+lot\s+on/i.test(latest))signals.push('time_pressure');
 if(/just (?:looking|exploring|seeing)|not sure|don.t (?:really )?know|no (?:clear )?timeline/i.test(latest))signals.push('vague_intent');
 if(/budget|spend|funding|afford|cost|price/i.test(latest))signals.push('budget');
 if(/don.t want|not (?:ready|interested)|too (?:corporate|expensive)|keep it (?:brief|simple)|pressure|commit/i.test(latest))signals.push('concern');
 if(/tired|wear and tear|struggl|problem|quality|impact|difficult/i.test(latest))signals.push('problem_signal');
 if(stateMatchers.find(([kind])=>kind==='follow_up_request')?.[1].test(latest)||/(?:send|email|receive|include|cover).{0,100}(?:summary|brief|purpose|effort|ballpark|cost|price|next step|what happens)/i.test(latest))signals.push('follow_up_requirements');
 }
 const questions=Array.from(new Set(state.questionTrail.map(q=>q.text).concat(recent.match(/[^.!?]*\?/g)||[]).map(q=>q.trim().toLowerCase())));
 const timing=questions.filter(q=>/\b(?:when|timeline|timescale|how soon|time frame)\b/i.test(q)).length;
 const needs=questions.filter(q=>/\b(?:what|which).{0,80}(?:need|want|looking|outcome|hope)\b/i.test(q)).length;
 if((timing>1||needs>1)&&/not sure|don.t know|no (?:clear )?timeline|just (?:looking|exploring)|can.t (?:say|tell)|what|when/i.test(latest))signals.push('possible_stall');
 const budgetQuestions=questions.filter(q=>/budget|spend|fund|afford|price|cost/i.test(q)).length;if(budgetQuestions>1&&hints.some(h=>h.kind==='budget_uncertainty'))signals.push('budget_route_exhausted');
 const material=hints.some(h=>h.kind==='follow_up_request')||/(?:send|email|receive|include|cover).{0,120}(?:summary|brief|material|proposal|quot|pricing|information|document|details|follow.up|purpose|effort|next step)/i.test(recent);
 const closing=/(?:thanks|thank you|wrap(?:ping)? up|finish(?:ing)?|end(?:ing)? (?:the|this) call|before.{0,25}(?:go|leave)|(?:give|send|email).{0,80}(?:brief )?(?:summary|outline)|sounds (?:fine|good)|keep it brief|that's all|that is all|speak soon|goodbye)/i.test(latest);
 if(material&&closing)signals.push('check_close');
 if((latest.trim().split(/\s+/).length>=75||recent.trim().split(/\s+/).length>=100&&/what (?:we|i)(?:'ve| have) (?:done|built|developed)|the reason (?:i|we)|in terms of|what i wanted to explain/i.test(recent))&&/not sure|don't know|do not know|no idea|keep it brief/i.test(recent))signals.push('possible_long_explanation_after_stall');
 const important=signals.some(s=>['budget','concern','possible_stall','possible_pause_after_nonprogress','possible_long_explanation_after_stall','budget_route_exhausted','check_close','follow_up_requirements'].includes(s));
 const every=config.intensity==='close'?2:config.intensity==='important'?6:3;
 const event=config.intensity==='important'?important:signals.length>0;
 return {run:event||checkingOpenPrompt||sequence%every===every-1,signals,reason:event?'conversation_signal':checkingOpenPrompt?'active_prompt_resolution':sequence%every===every-1?'periodic_check':'quiet'};
}

export function inspectLiveCoaching(raw:unknown,segments:MeetingSegment[],facts:MeetingFact[],history:MeetingCandidate[],sequence:number,at=Date.now()){
 const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{},trace:CoachTrace[]=[],candidates:MeetingCandidate[]=[];
 const list=Array.isArray(value.questions)?value.questions.slice(0,6):[];
 for(const [index,item] of list.entries()){
  const promptId=`${sequence}:q${index}`;
  trace.push({stage:'prompt_generated',at,sequence,promptId});
  const candidate=groundedCoachingList([item],segments,facts,1)[0];
  const row=item&&typeof item==='object'?item as Record<string,unknown>:null;
  const source= row&&typeof row.segmentId==='string'?(row.evidenceKind==='recorded'?facts.find(f=>f.id===row.segmentId)?.text:segments.find(s=>s.id===row.segmentId&&!s.gap)?.text):undefined;
  const reason=!candidate?(!row||typeof row.text!=='string'||!row.text.trim()?'malformed_candidate':!source?'unknown_or_gap_source':typeof row.quote!=='string'||row.quote.trim().length<8||!source.includes(row.quote)?'quote_not_in_source':'invalid_candidate'):typeof candidate.goal!=='string'||!candidate.goal.trim()||candidate.goal.length>120?'missing_call_goal':(!candidate.wording&&!candidate.text.includes('?')||/^(?:try|explore|choose|change|shift|switch|move).{0,32}(?:direction|branch|topic|something else)[.!]?$/i.test(candidate.wording||candidate.text))?'missing_usable_wording':coachingSuppression(candidate,[...history,...candidates]);
  if(reason){trace.push({stage:'prompt_suppressed',at,sequence,promptId,reason});continue;}
  if(candidates.length>=2){trace.push({stage:'prompt_suppressed',at,sequence,promptId,reason:'display_capacity'});continue;}
  candidates.push({...candidate,promptId});
 }
 if(!list.length)trace.push({stage:'no_prompt_generated',at,sequence,reason:'model_abstained'});
 const resolved=Array.isArray(value.resolvedSuggestions)?value.resolvedSuggestions:[];
 const resolvedPrompts=resolved.flatMap(r=>r&&typeof r.promptId==='string'&&history.some(h=>h.promptId===r.promptId)&&typeof r.quote==='string'&&r.quote.length>=8&&segments.slice(-6).some(s=>!s.gap&&s.id===r.segmentId&&s.text.includes(r.quote))?[r.promptId]:[]);
 return {candidates,trace,resolvedPrompts};
}

export type CoachRuntime={current:MeetingCandidate|null;pending:MeetingCandidate|null;shownAt:number;queuedAt:number;visiblePromptId:string|null;visibleAt:number;history:MeetingCandidate[];trace:CoachTrace[]};
export const createCoachRuntime=():CoachRuntime=>({current:null,pending:null,shownAt:0,queuedAt:0,visiblePromptId:null,visibleAt:0,history:[],trace:[]});
const READ_MS=12000,EXPIRE_MS=40000,QUEUE_MS=24000;
function note(s:CoachRuntime,stage:string,at:number,c:MeetingCandidate|null,reason?:string,durationMs?:number){s.trace=[...s.trace,{stage,at,sequence:Number(c?.promptId?.split(':')[0]??-1),promptId:c?.promptId,reason,durationMs}].slice(-1200);}
function endVisibility(s:CoachRuntime,at:number,c:MeetingCandidate,reason:string){if(s.visiblePromptId===c.promptId){note(s,'prompt_visibility_ended',at,c,reason,Math.max(0,at-s.visibleAt));s.visiblePromptId=null;s.visibleAt=0;}}
function show(s:CoachRuntime,c:MeetingCandidate,at:number){if(s.current){endVisibility(s,at,s.current,'replaced');note(s,'prompt_replaced',at,s.current,'new_relevant_prompt');}s.current=c;s.shownAt=at;note(s,'prompt_selected',at,c);}
export function advanceCoach(state:CoachRuntime,at:number):CoachRuntime{
 const s={...state};
 if(s.pending&&at-s.queuedAt>=QUEUE_MS){note(s,'prompt_expired',at,s.pending,'queue_age');s.pending=null;}
 if(s.current&&at-s.shownAt>=EXPIRE_MS){endVisibility(s,at,s.current,'expired');note(s,'prompt_expired',at,s.current,'display_age');s.current=null;}
 if(s.pending&&(!s.current||at-s.shownAt>=READ_MS)){const c=s.pending;s.pending=null;show(s,c,at);}
 return s.current===state.current&&s.pending===state.pending?state:s;
}
export function receiveCoach(state:CoachRuntime,candidates:MeetingCandidate[],trace:CoachTrace[],at:number,resolved:string[]=[],closed=false):CoachRuntime{
 const initial={...state,trace:[...state.trace,...trace].slice(-1200)};
 for(const key of ['current','pending'] as const)if(initial[key]&&(closed||resolved.includes(initial[key]!.promptId||''))){if(key==='current')endVisibility(initial,at,initial[key]!,closed?'meeting_ended':'answered_or_moved_on');note(initial,'prompt_expired',at,initial[key],closed?'meeting_ended':'answered_or_moved_on');initial[key]=null;}
 const s={...advanceCoach(initial,at)};
 for(const [i,candidate] of candidates.slice(0,2).entries()){
  const c={...candidate,promptId:candidate.promptId||`${candidate.segmentId}:q${i}`};
  const reason=closed?'meeting_ended':coachingSuppression(c,[...s.history,...(s.pending?[s.pending]:[])]);
  if(reason){note(s,'prompt_suppressed',at,c,reason);continue;}
  note(s,'prompt_queued',at,c);
  if(!s.current||at-s.shownAt>=READ_MS)show(s,c,at);
  else{if(s.pending)note(s,'prompt_suppressed',at,s.pending,'superseded_while_queued');s.pending=c;s.queuedAt=at;}
 }
 return s;
}

/** UI calls this after its render commit; selection/queueing alone is not a display. */
export function markCoachRenderAttempted(state:CoachRuntime,promptId:string,at:number):CoachRuntime{if(state.current?.promptId!==promptId||state.trace.some(e=>e.stage==='prompt_render_attempted'&&e.promptId===promptId))return state;const s={...state};note(s,'prompt_render_attempted',at,s.current);return s;}
export function markCoachDisplayed(state:CoachRuntime,promptId:string,at:number):CoachRuntime{
 if(state.current?.promptId!==promptId)return state;const s={...state};
 if(s.visiblePromptId!==promptId){if(s.visiblePromptId&&s.current)endVisibility(s,at,s.current,'out_of_view');s.visiblePromptId=promptId;s.visibleAt=at;note(s,'prompt_visible',at,s.current);}
 if(s.trace.some(e=>e.stage==='prompt_displayed'&&e.promptId===promptId))return s;
 s.shownAt=at;s.history=[...s.history,s.current!].slice(-200);note(s,'prompt_displayed',at,s.current);return s;
}
export function markCoachNotVisible(state:CoachRuntime,promptId:string,at:number):CoachRuntime{if(state.visiblePromptId!==promptId||state.current?.promptId!==promptId)return state;const s={...state};endVisibility(s,at,s.current!,'out_of_view');return s;}
