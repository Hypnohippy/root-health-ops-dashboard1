import {buildConversationState,coachingOpportunity,defaultCoachingConfig,deterministicCoachingFallback,inspectLiveCoaching,type CoachTrace,type CoachOpportunity,type CoachingConfig,type ConversationState} from './meetingCoachRuntime';
import {PRACTICE_ID,practiceMeeting,meetingCoachingMessages,meetingEmailMessages,coachingHistory,type MeetingFact} from './meetingCoaching';
import {RELATIONSHIP_CALL_PREFIX} from './meetingLaunch';
import {readMeetingFacts,readMeetingSender} from './meetingCoaching.server';
import OpenAI from 'openai';
import {supabaseAdmin} from './supabaseAdmin';
import {readDiary} from './diary.server';
import {readOperationalIntelligence} from './operationalIntelligence.server';
import {type RelationshipTenant} from './relationshipWorkspace.server';
import {meetingAttachment,meetingSegments,groundedMeetingAnalysis,wavSeconds,meetingEvidenceKey,type MeetingSegment,type MeetingCandidate} from './meetingCopilot';
import {RELATIONSHIP_MODEL} from './relationshipCoach.server';
const uuid=/^[a-f0-9-]{36}$/i;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
class MeetingAnalysisUnavailable extends Error{constructor(readonly reason:'context_unavailable'|'provider_timeout_or_failure'|'invalid_model_response'){super('Meeting analysis unavailable.');}}
function safeAnalysisFailure(error:unknown){return error instanceof MeetingAnalysisUnavailable?error.reason:'analysis_unavailable';}
function meetingPrepContext(record:Awaited<ReturnType<typeof readOperationalIntelligence>>){
 const research=record.researchAccess?record.approvedResearch.map(row=>{
  const saved=object(object(row.research_snapshot).phase2d),facts=Array.isArray(saved.facts)?saved.facts.map(value=>String(object(value).claim||'')).filter(Boolean).slice(0,8):[];
  return {savedAt:typeof row.created_at==='string'?row.created_at:null,facts};
 }):[];
 return {person:{name:record.relationship.name,role:record.relationship.role,company:record.relationship.company},opportunity:{stage:record.relationship.stage,nextAction:record.relationship.nextAction,dueDate:record.relationship.nextDueDate,facts:record.relationship.facts,interpretation:record.relationship.interpretation},notes:record.notes.filter(note=>record.researchAccess||note.founder_only!==true).slice(-8).map(note=>({kind:note.activity_type,at:note.recorded_at,text:typeof note.message==='string'?note.message.slice(0,1200):''})).filter(note=>note.text),research};
}
export async function prepareMeeting(tenant:RelationshipTenant,id:string){
 if(id===PRACTICE_ID)return practiceMeeting(tenant.organisationId);
 if(id.startsWith(RELATIONSHIP_CALL_PREFIX)){
  const locator=id.slice(RELATIONSHIP_CALL_PREFIX.length);
  if(!/^(?:inbox|target|acquisition|workspace)_[a-f0-9-]{36}$/i.test(locator))throw Error('Exact relationship call context is unavailable.');
  const before=await supabaseAdmin.from('lifecycle_revisions').select('revision').eq('organisation_id',tenant.organisationId).maybeSingle();if(before.error)throw Error('Relationship revision unavailable.');
  const record=await readOperationalIntelligence(tenant,locator);
  if(!record.relationship.contactId||record.intelligence.identity.humanReviewRequired)throw Error('Exact relationship identity requires review.');
  const after=await supabaseAdmin.from('lifecycle_revisions').select('revision').eq('organisation_id',tenant.organisationId).maybeSingle();if(after.error||String(before.data?.revision)!==String(after.data?.revision))throw Error('Relationship evidence changed; reload.');
  const evidence=[...record.conversation.dated,...record.conversation.undated].filter(r=>r.direction!=='snapshot').slice(-20).map(r=>({id:r.id,at:r.at,text:r.text.slice(0,3000),direction:r.direction}));
  return {lifecycleRevision:String(after.data?.revision||0),kind:record.relationship.kind,workspaceId:record.workspace?.id||null,canFounder:record.researchAccess,meetingContext:meetingPrepContext(record),meetingObjective:null,knownNextStep:record.relationship.nextAction,attachment:{appointmentId:id,relationshipId:record.relationship.contactId,locator,at:null,channel:'Call',title:`Call with ${record.relationship.name}`,source:{provider:'relationship_call',organisationId:tenant.organisationId,relationshipId:record.relationship.contactId},provenance:[]},evidence,name:record.relationship.name,revision:record.workspace?.revision??null,refs:record.relationship.refs};
 }
 const before=await supabaseAdmin.from('lifecycle_revisions').select('revision').eq('organisation_id',tenant.organisationId).maybeSingle();if(before.error)throw Error('Appointment revision unavailable.');
 const snapshot=await readDiary(tenant),item=snapshot.items.find(i=>i.id===id);if(!item)throw Error('Appointment unavailable.');const attachment=meetingAttachment(item,tenant.organisationId),record=await readOperationalIntelligence(tenant,attachment.locator);
 if(record.relationship.contactId!==attachment.relationshipId||record.intelligence.identity.humanReviewRequired)throw Error('Exact relationship identity requires review.');
 const evidence=[...record.conversation.dated,...record.conversation.undated].filter(r=>r.direction!=='snapshot').slice(-20).map(r=>({id:r.id,at:r.at,text:r.text.slice(0,3000),direction:r.direction}));
 const after=await supabaseAdmin.from('lifecycle_revisions').select('revision').eq('organisation_id',tenant.organisationId).maybeSingle();if(after.error||String(before.data?.revision)!==String(after.data?.revision))throw Error('Appointment evidence changed; reload.');
 return {lifecycleRevision:String(after.data?.revision||0),kind:record.relationship.kind,workspaceId:record.workspace?.id||null,canFounder:record.researchAccess,meetingContext:meetingPrepContext(record),meetingObjective:null,knownNextStep:record.relationship.nextAction,attachment,evidence,name:record.relationship.name||item.title,revision:record.workspace?.revision??null,refs:record.relationship.refs};
}
async function command(t:RelationshipTenant,id:string,kind:string,data:Record<string,unknown>){const result=await supabaseAdmin.rpc('meeting_copilot_command',{p_org:t.organisationId,p_actor:t.userId,p_id:id,p_command:kind,p_data:data});if(result.error)throw Error('Meeting capture is unavailable for this workspace or its allowance has been reached. Your transcript remains available; nothing was sent to your contact.');return result.data;}
async function session(t:RelationshipTenant,id:unknown){if(typeof id!=='string'||!uuid.test(id))throw Error('Meeting unavailable.');const {data,error}=await supabaseAdmin.from('meeting_copilot_sessions').select('*').eq('id',id).eq('organisation_id',t.organisationId).eq('user_id',t.userId).maybeSingle();if(error||!data)throw Error('Meeting unavailable.');return data;}
const client=()=>{if(!process.env.OPENAI_API_KEY)throw Error('Meeting AI is currently unavailable.');return new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:45000,maxRetries:0});};
export async function analyzeMeeting(t:RelationshipTenant,context:Record<string,unknown>,segments:MeetingSegment[],review:boolean,history:MeetingCandidate[]=[],live:{sequence:number;opportunity:CoachOpportunity;config:CoachingConfig;conversationState?:ConversationState}={sequence:-1,opportunity:{run:true,signals:[],reason:'direct'},config:defaultCoachingConfig}){
 if(!segments.some(s=>!s.gap&&s.text.trim()))return {analysis:groundedMeetingAnalysis({},segments),tokens:0,emailError:false,coachingTrace:[] as CoachTrace[],resolvedPrompts:[] as string[]};
 let facts:MeetingFact[];try{facts=await readMeetingFacts(t,context);}catch{throw new MeetingAnalysisUnavailable('context_unavailable');}
 let response;try{response=await client().chat.completions.create({model:RELATIONSHIP_MODEL,temperature:0.2,max_tokens:review?1800:700,response_format:{type:'json_object'},messages:meetingCoachingMessages(facts,segments,review,history,{...live.config,opportunity:live.opportunity,conversationState:live.conversationState})},{timeout:review?45000:6000});}catch{throw new MeetingAnalysisUnavailable('provider_timeout_or_failure');}
 let parsed:unknown;try{parsed=JSON.parse(response.choices[0]?.message.content||'{}');}catch{throw new MeetingAnalysisUnavailable('invalid_model_response');}
 const analysis=groundedMeetingAnalysis(parsed,segments,facts),coaching=!review?inspectLiveCoaching(parsed,segments,facts,history,live.sequence,Date.now(),live.opportunity):null;if(coaching){const deterministicGuard=live.opportunity.signals.some(signal=>['check_close','material_fact_omitted','one_call_close','meeting_refusal','call_goal_changed'].includes(signal));if(deterministicGuard){const at=Date.now(),fallback=inspectLiveCoaching(deterministicCoachingFallback(segments,live.opportunity,live.sequence),segments,[],history,live.sequence,at,live.opportunity);coaching.trace.push(...coaching.candidates.map(candidate=>({stage:'prompt_suppressed',at,sequence:live.sequence,promptId:candidate.promptId,reason:live.opportunity.signals.includes('check_close')?'deterministic_close_guard':'deterministic_motion_guard',priority:'critical' as const})),...fallback.trace,{stage:'generation_fallback',at,sequence:live.sequence,reason:live.opportunity.signals.includes('check_close')?'deterministic_close_guard':'deterministic_motion_guard',priority:'critical'});analysis.questions=fallback.candidates;}else analysis.questions=coaching.candidates;}let tokens=response.usage?.total_tokens||0,emailError=false;
 if(review)try{
  // Separate provider request: no internal summary, notes or research is passed to email generation.
  const external=await client().chat.completions.create({model:RELATIONSHIP_MODEL,temperature:0.2,max_tokens:900,response_format:{type:'json_object'},messages:meetingEmailMessages(typeof context.name==='string'?context.name:'',segments,await readMeetingSender(t))});tokens+=external.usage?.total_tokens||0;const value=JSON.parse(external.choices[0]?.message.content||'{}');
  if(typeof value.email!=='string'||!value.email.trim()||/relationship score|confidence score|internal (?:analysis|coaching|research)|inferred motive|\[(?:your|insert|sender)[^\]]*\]/i.test(value.email))throw Error('External draft unavailable');analysis.email=value.email.slice(0,5000);
 }catch{emailError=true;}
 return {analysis,tokens,emailError,coachingTrace:coaching?.trace||[],resolvedPrompts:coaching?.resolvedPrompts||[]};
}
export async function meetingRequest(t:RelationshipTenant,body:Record<string,unknown>){
 if(body.action==='start'){if(body.consent!==true||typeof body.appointmentId!=='string'||typeof body.id!=='string'||!uuid.test(body.id))throw Error('Confirm microphone/transcription consent and exact appointment.');const context=await prepareMeeting(t,body.appointmentId);client();const s=await command(t,body.id,'start',{appointmentId:context.attachment.appointmentId,relationshipId:context.attachment.relationshipId,context:{...context,evidence:context.evidence.map(({id,at,direction})=>({id,at,direction}))}});return {id:s.id,version:s.version};}
 const s=await session(t,body.id);
 if(s.context?.synthetic===true&&(body.action==='approve'||body.action==='task'))throw Error('Synthetic practice cannot be promoted, retained or turned into canonical tasks.');
 if(body.action==='end'){const ended=await command(t,s.id,'end',{});return {version:ended.version,status:ended.status};}
 if(body.action==='review'){if(s.status!=='review')throw Error('End microphone capture before review.');const segments=meetingSegments(body.segments);await command(t,s.id,'review_claim',{});const result=await analyzeMeeting(t,s.context,segments,true);if('tokens' in result){const {error}=await supabaseAdmin.from('meeting_copilot_usage').update({reasoning_tokens:result.tokens}).eq('organisation_id',t.organisationId).eq('user_id',t.userId).eq('session_id',s.id).eq('sequence',2147483647);if(error)throw Error('Review usage could not be confirmed. Transcript remains available.');}return result;}
 if(body.action==='task'){
  if(s.status!=='approved'||body.confirmed!==true||typeof body.task!=='string'||!body.task.trim()||body.task.length>1000||typeof body.key!=='string'||!uuid.test(body.key))throw Error('Approve the meeting note, then review this task explicitly.');
  const current=await prepareMeeting(t,s.appointment_id);if(meetingEvidenceKey(current.attachment)!==meetingEvidenceKey(s.context.attachment))throw Error('Appointment linkage changed.');
  return promote(t,s.id,{operation:'task',confirmed:true,task:body.task,key:body.key,context:current,lifecycleRevision:current.lifecycleRevision});
 }
 if(body.action==='approve'){
  if(s.status==='approved'&&body.confirmed===true&&s.result?.approvedSummary===body.summary)return {saved:true,...s.result,href:`/dashboard/growth/relationships/workspace_${s.result.workspaceId}?organisationId=${t.organisationId}`};
  if(body.confirmed!==true||s.status!=='review'||body.version!==s.version||typeof body.summary!=='string'||!body.summary.trim()||body.summary.length>12000)throw Error('Review and explicitly approve the meeting summary.');
  const current=await prepareMeeting(t,s.appointment_id);if(meetingEvidenceKey(current.attachment)!==meetingEvidenceKey(s.context.attachment))throw Error('Appointment evidence changed. Review exact linkage before saving.');
  const transcript=meetingSegments(body.segments);return promote(t,s.id,{operation:'note',confirmed:true,version:s.version,summary:body.summary,context:current,lifecycleRevision:current.lifecycleRevision,retainTranscript:body.retainTranscript===true,transcript:body.retainTranscript===true?transcript:[]});
 }
 throw Error('Unsupported meeting operation.');
}
export async function transcribeMeeting(t:RelationshipTenant,form:FormData){const id=form.get('id'),s=await session(t,id),sequence=Number(form.get('sequence')),audio=form.get('audio');if(!(audio instanceof File)||!Number.isInteger(sequence)||sequence<0||sequence>600)throw Error('Invalid microphone chunk.');const bytes=await audio.arrayBuffer(),seconds=wavSeconds(bytes);await command(t,s.id,'reserve',{sequence,seconds});
 const transcription=await client().audio.transcriptions.create({model:'gpt-transcribe',file:new File([bytes],'meeting.wav',{type:'audio/wav'})}).catch(()=>{throw Error('Transcription failed. This chunk is a gap; no missing speech was invented.');});
 const text=transcription.text,coachingTrace:CoachTrace[]=[];let analysis=null,analysisError=false,tokens=0,resolvedPrompts:string[]=[];
 // Same metered/sequence-guarded chunk; signals permit a live check before the periodic fallback.
 try{const prior=meetingSegments(JSON.parse(String(form.get('segments')||'[]'))).slice(-18),segments=[...prior,{id:String(sequence),text,gap:false}],conversationState=buildConversationState(segments,JSON.parse(String(form.get('conversationState')||'{}'))),history=coachingHistory(JSON.parse(String(form.get('coachingHistory')||'[]'))),open=JSON.parse(String(form.get('openCoachingPrompts')||'[]')),checkingOpen=Array.isArray(open)&&open.slice(0,2).some(id=>typeof id==='string'&&history.some(h=>h.promptId===id)),opportunity=coachingOpportunity(segments,sequence,defaultCoachingConfig,checkingOpen,conversationState),detectedAt=Date.now();
  coachingTrace.push({stage:opportunity.signals.length?'opportunity_detected':'opportunity_checked',at:detectedAt,sequence,signals:opportunity.signals,priority:opportunity.priority,reason:opportunity.reason});
  if(s.context?.synthetic===true)coachingTrace.push({stage:'practice_conversation_state',at:detectedAt,sequence,signals:opportunity.signals,priority:opportunity.priority,salesMotion:opportunity.salesMotion,conversationStage:opportunity.conversationStage,callGoal:opportunity.callGoal,goalChangeReason:opportunity.goalChangeReason,materialFactSegmentId:opportunity.materialFact?.segmentId,promptSource:opportunity.signals.includes('material_fact_omitted')?'whole_call_memory':'latest_chunk'});
  if(opportunity.run){
   try{
    const result=await analyzeMeeting(t,s.context,segments,false,history,{sequence,opportunity,config:defaultCoachingConfig,conversationState});
    if('analysis' in result){analysis=result.analysis;tokens=result.tokens;coachingTrace.push(...(result.coachingTrace||[]));resolvedPrompts=result.resolvedPrompts||[];}
    if(opportunity.priority==='high'||opportunity.priority==='critical')if(!analysis?.questions.length){const raw=deterministicCoachingFallback(segments,opportunity,sequence),fallback=inspectLiveCoaching(raw,segments,[],history,sequence,Date.now(),opportunity);coachingTrace.push(...fallback.trace,{stage:'generation_fallback',at:Date.now(),sequence,reason:'no_usable_model_coaching',priority:opportunity.priority});if(fallback.candidates.length){analysis=analysis||groundedMeetingAnalysis({},segments);analysis.questions=fallback.candidates;}}
   }catch(error){coachingTrace.push({stage:'generation_failed',at:Date.now(),sequence,reason:safeAnalysisFailure(error),priority:opportunity.priority});
    if(opportunity.priority==='high'||opportunity.priority==='critical'){const raw=deterministicCoachingFallback(segments,opportunity,sequence),fallback=inspectLiveCoaching(raw,segments,[],history,sequence,Date.now(),opportunity);coachingTrace.push(...fallback.trace,{stage:'generation_fallback',at:Date.now(),sequence,reason:'analysis_unavailable',priority:opportunity.priority});if(fallback.candidates.length){analysis=groundedMeetingAnalysis({},segments);analysis.questions=fallback.candidates;}else analysisError=true;}else analysisError=true;
   }
  }
  else coachingTrace.push({stage:'generation_skipped',at:Date.now(),sequence,reason:opportunity.reason});
 }catch{analysisError=true;coachingTrace.push({stage:'generation_failed',at:Date.now(),sequence,reason:'analysis_unavailable'});}
 {const usage=(transcription as unknown as {usage?:{total_tokens?:number}}).usage;const {error}=await supabaseAdmin.from('meeting_copilot_usage').update({reasoning_tokens:tokens,transcription_tokens:Number.isInteger(usage?.total_tokens)?usage!.total_tokens:null}).eq('organisation_id',t.organisationId).eq('user_id',t.userId).eq('session_id',s.id).eq('sequence',sequence);if(error)analysisError=true;}
 // Metadata only: never transcript, prompt text, context, names or credentials.
 console.info('meeting_coach',JSON.stringify({sessionId:s.id,sequence,events:coachingTrace}));
 return {text,analysis,analysisError,seconds,coachingTrace,resolvedPrompts};
}

async function promote(t:RelationshipTenant,id:string,data:Record<string,unknown>){const {data:result,error}=await supabaseAdmin.rpc('meeting_copilot_promote',{p_org:t.organisationId,p_actor:t.userId,p_id:id,p_data:data});if(error)throw Error('Meeting approval was not confirmed. Current appointment, identity, source revision and review must match.');const href=`/dashboard/growth/relationships/workspace_${result.workspaceId}?organisationId=${t.organisationId}`;return {saved:true,...result,href};}
