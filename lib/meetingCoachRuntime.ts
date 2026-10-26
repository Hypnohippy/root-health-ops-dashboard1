import type {MeetingCandidate,MeetingSegment} from './meetingCopilot';
import {coachingSuppression,groundedCoachingList,type MeetingFact} from './meetingCoaching';

export type CoachingConfig={intensity:'close'|'balanced'|'important';motion:string;desiredOutcome:string};
export const defaultCoachingConfig:CoachingConfig={intensity:'balanced',motion:'unconfigured',desiredOutcome:''};
export type CoachTrace={stage:string;at:number;sequence:number;promptId?:string;reason?:string;signals?:string[]};
export type CoachOpportunity={run:boolean;signals:string[];reason:string};
// These are provisional text signals, not speaker attribution, diagnosis or sales facts.
export function coachingOpportunity(segments:MeetingSegment[],sequence:number,config=defaultCoachingConfig,checkingOpenPrompt=false):CoachOpportunity{
 const speech=segments.filter(s=>!s.gap),latest=speech.at(-1)?.text||'',recent=speech.slice(-10).map(s=>s.text).join(' '),signals:string[]=[];
 if(!latest.trim())return {run:false,signals,reason:'no_speech'};
 if(/only (?:a )?few minutes|short on time|got to go|busy|a lot on/i.test(latest))signals.push('time_pressure');
 if(/just (?:looking|exploring|seeing)|not sure|don.t (?:really )?know|no (?:clear )?timeline/i.test(latest))signals.push('vague_intent');
 if(/budget|spend|funding|afford|cost|price/i.test(latest))signals.push('budget');
 if(/don.t want|not (?:ready|interested)|too (?:corporate|expensive)|keep it (?:brief|simple)|pressure|commit/i.test(latest))signals.push('concern');
 if(/tired|wear and tear|struggl|problem|quality|impact|difficult/i.test(latest))signals.push('problem_signal');
 if(/(?:send|email|receive|include|cover).{0,90}(?:summary|material|proposal|quote|pricing|information|document|purpose|effort|next step)/i.test(latest))signals.push('follow_up_requirements');
 const questions=recent.match(/[^.!?]*\?/g)||[];
 const timing=questions.filter(q=>/\b(?:when|timeline|timescale|how soon|time frame)\b/i.test(q)).length;
 const needs=questions.filter(q=>/\b(?:what|which).{0,80}(?:need|want|looking|outcome|hope)/i.test(q)).length;
 if((timing>1||needs>1)&&/not sure|don.t know|no (?:clear )?timeline|just (?:looking|exploring)|can.t (?:say|tell)|what|when/i.test(latest))signals.push('possible_stall');
 const material=/(?:send|email|receive|include).{0,100}(?:summary|material|proposal|quot|pricing|information|document|details|follow.up)/i.test(recent);
 if(material&&/thanks|thank you|wrap|finish|end (?:the|this)|before.{0,20}go|send.{0,60}summary|sounds (?:fine|good)|keep it brief/i.test(latest))signals.push('check_close');
 const important=signals.some(s=>['budget','concern','possible_stall','check_close','follow_up_requirements'].includes(s));
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
  const reason=!candidate?'invalid_or_ungrounded':(!candidate.wording&&!candidate.text.includes('?')||/^(?:try|explore|choose|change|shift|switch|move).{0,32}(?:direction|branch|topic|something else)[.!]?$/i.test(candidate.wording||candidate.text))?'missing_usable_wording':coachingSuppression(candidate,[...history,...candidates]);
  if(reason){trace.push({stage:'prompt_suppressed',at,sequence,promptId,reason});continue;}
  if(candidates.length>=2){trace.push({stage:'prompt_suppressed',at,sequence,promptId,reason:'display_capacity'});continue;}
  candidates.push({...candidate,promptId});
 }
 if(!list.length)trace.push({stage:'no_prompt_generated',at,sequence,reason:'model_abstained'});
 const resolved=Array.isArray(value.resolvedSuggestions)?value.resolvedSuggestions:[];
 const resolvedPrompts=resolved.flatMap(r=>r&&typeof r.promptId==='string'&&history.some(h=>h.promptId===r.promptId)&&typeof r.quote==='string'&&r.quote.length>=8&&segments.slice(-6).some(s=>!s.gap&&s.id===r.segmentId&&s.text.includes(r.quote))?[r.promptId]:[]);
 return {candidates,trace,resolvedPrompts};
}

export type CoachRuntime={current:MeetingCandidate|null;pending:MeetingCandidate|null;shownAt:number;queuedAt:number;history:MeetingCandidate[];trace:CoachTrace[]};
export const createCoachRuntime=():CoachRuntime=>({current:null,pending:null,shownAt:0,queuedAt:0,history:[],trace:[]});
const READ_MS=12000,EXPIRE_MS=40000,QUEUE_MS=24000;
function note(s:CoachRuntime,stage:string,at:number,c:MeetingCandidate|null,reason?:string){s.trace=[...s.trace,{stage,at,sequence:Number(c?.promptId?.split(':')[0]??-1),promptId:c?.promptId,reason}].slice(-1200);}
function show(s:CoachRuntime,c:MeetingCandidate,at:number){if(s.current)note(s,'prompt_replaced',at,s.current,'new_relevant_prompt');s.current=c;s.shownAt=at;s.history=[...s.history,c].slice(-200);note(s,'prompt_selected',at,c);}
export function advanceCoach(state:CoachRuntime,at:number):CoachRuntime{
 const s={...state};
 if(s.pending&&at-s.queuedAt>=QUEUE_MS){note(s,'prompt_expired',at,s.pending,'queue_age');s.pending=null;}
 if(s.current&&at-s.shownAt>=EXPIRE_MS){note(s,'prompt_expired',at,s.current,'display_age');s.current=null;}
 if(s.pending&&(!s.current||at-s.shownAt>=READ_MS)){const c=s.pending;s.pending=null;show(s,c,at);}
 return s.current===state.current&&s.pending===state.pending?state:s;
}
export function receiveCoach(state:CoachRuntime,candidates:MeetingCandidate[],trace:CoachTrace[],at:number,resolved:string[]=[],closed=false):CoachRuntime{
 const initial={...state,trace:[...state.trace,...trace].slice(-1200)};
 for(const key of ['current','pending'] as const)if(initial[key]&&(closed||resolved.includes(initial[key]!.promptId||''))){note(initial,'prompt_expired',at,initial[key],closed?'meeting_ended':'answered_or_moved_on');initial[key]=null;}
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
export function markCoachDisplayed(state:CoachRuntime,promptId:string,at:number):CoachRuntime{
 if(state.current?.promptId!==promptId||state.trace.some(e=>e.stage==='prompt_displayed'&&e.promptId===promptId))return state;
 const s={...state};note(s,'prompt_displayed',at,state.current);return s;
}
