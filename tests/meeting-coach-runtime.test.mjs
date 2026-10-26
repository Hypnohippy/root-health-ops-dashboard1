import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMeeting} from './meeting-copilot-loader.mjs';
const runtime=loadMeeting('lib/meetingCoachRuntime.ts'),coach=loadMeeting('lib/meetingCoaching.ts'),core=loadMeeting('lib/meetingCopilot.ts');
const segment=(id,text)=>({id:String(id),text,gap:false});
const candidate=(id,text,quote,angle='outcome')=>({promptId:`${id}:q0`,text,wording:text,goal:'Clarify a useful next step.',quote,segmentId:String(id),angle});

test('signals run on the current chunk, not only every third chunk',()=>{
 for(const [text,signal] of [["I've only a few minutes; just seeing what's out there.",'time_pressure'],['No budget is signed off; spend is tight.','budget'],['People have been tired. Wear and tear.','problem_signal'],['Please send purpose, effort required, ballpark cost and next step.','follow_up_requirements'],["I'll email a summary. Thanks, that sounds fine.",'check_close']]){
  const result=runtime.coachingOpportunity([segment(0,text)],0);assert.equal(result.run,true);assert.ok(result.signals.includes(signal));
 }
});
test('repeated questions with vague responses flag a possible stall, not an identified-speaker fact',()=>{
 const rows=[segment(0,'When might you start? I do not know.'),segment(1,'When do you expect to decide? I am not sure yet.')];
 assert.ok(runtime.coachingOpportunity(rows,1).signals.includes('possible_stall'));
 assert.ok(!runtime.coachingOpportunity([rows[1]],1).signals.includes('possible_stall'));
});
test('quiet/silent checks abstain and live prompt resolution is checked on fresh speech',()=>{
 assert.equal(runtime.coachingOpportunity([segment(0,'')],0).run,false);
 assert.equal(runtime.coachingOpportunity([segment(0,'Hello there.')],0).run,false);
 assert.equal(runtime.coachingOpportunity([segment(0,'Hello there.')],2).reason,'periodic_check');
 assert.equal(runtime.coachingOpportunity([segment(1,'The answer is yes.')],1,undefined,true).reason,'active_prompt_resolution');
});
test('intensity is configurable without hardwiring a sales motion or prompt quota',()=>{
 assert.equal(runtime.defaultCoachingConfig.motion,'unconfigured');
 const rows=[segment(0,'I am just exploring.')];
 assert.equal(runtime.coachingOpportunity(rows,0,{intensity:'important',motion:'transactional',desiredOutcome:'Qualify a trial'}).run,false);
 assert.equal(runtime.coachingOpportunity([segment(0,'There is no budget signed off.')],0,{intensity:'important',motion:'enterprise',desiredOutcome:''}).run,true);
 const messages=coach.meetingCoachingMessages([],rows,false,[],{intensity:'important',motion:'enterprise',desiredOutcome:'Qualify the next step'});
 assert.equal(JSON.parse(messages[1].content).coachingPolicy.salesMotion,'enterprise');
 assert.match(messages[0].content,/not assume one universal/);
});
test('generated invalid, duplicate and non-wording outputs have explicit suppression reasons',()=>{
 const rows=[segment(0,'We do not have funding signed off.')],old=candidate(0,'Is there a route to funding if value is clear?',rows[0].text,'decision');
 const result=runtime.inspectLiveCoaching({questions:[old,{text:'Try another direction.',goal:'Clarify a useful next step.',quote:rows[0].text,segmentId:'0'},{text:'Invented?',quote:'Missing quote',segmentId:'0'}]},rows,[],[old],1,100);
 assert.equal(result.candidates.length,0);assert.equal(result.trace.filter(e=>e.stage==='prompt_generated').length,3);
 assert.deepEqual(Array.from(result.trace.filter(e=>e.stage==='prompt_suppressed').map(e=>e.reason)),['duplicate_text','missing_usable_wording','quote_not_in_source']);
 assert.ok(result.trace.every(e=>!('text' in e)&&!('quote' in e)));
});
test('new evidence within the same topic is not blocked by a coarse topic cooldown',()=>{
 const old=candidate(0,'Who approves this?',"I don't know who signs it off.",'decision');
 const next=candidate(1,'Is there a route to funding if value is proven?','No budget has been signed off.','decision');
 assert.equal(coach.coachingSuppression(next,[old]),null);
});
test('a relevant prompt remains visible until resolution, high-priority change or expiry',()=>{
 const a=candidate(0,'What made this worth looking at now?','Only a few minutes.'),b=candidate(1,'How does funding normally get approved?','No budget signed off.','decision');
 let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);
 state=runtime.receiveCoach(state,[b],[],13000);assert.equal(state.current.promptId,a.promptId);assert.equal(state.pending.promptId,b.promptId);
 state=runtime.advanceCoach(state,20000);assert.equal(state.current.promptId,a.promptId);assert.equal(state.pending.promptId,b.promptId);
 state=runtime.advanceCoach(state,40000);assert.equal(state.current,null);assert.equal(state.pending,null);assert.ok(state.trace.some(e=>e.stage==='prompt_expired'&&e.reason==='display_age'));assert.ok(state.trace.some(e=>e.stage==='prompt_expired'&&e.reason==='queue_age'));
 const urgent={...candidate(2,'Before we finish, can we agree what happens after the brief?','The follow-up has no date.','next_step'),priority:'critical',branch:'follow_up'};
 state=runtime.receiveCoach(runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0),[urgent],[],1000);assert.equal(state.current.promptId,urgent.promptId);assert.ok(state.trace.some(e=>e.stage==='prompt_replaced'&&e.reason==='new_relevant_prompt'));
});
test('answered prompts retire immediately, pending prompts expire and End displays nothing further',()=>{
 const a=candidate(0,'What is the desired outcome?','We are exploring.'),b=candidate(1,'When would a check-in fit?','Send a summary.','next_step');
 let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);
 state=runtime.receiveCoach(state,[],[],2000,[a.promptId]);assert.equal(state.current,null);assert.equal(state.trace.at(-1).reason,'answered_or_moved_on');
 state=runtime.receiveCoach(state,[b],[],3000);state=runtime.advanceCoach(state,43000);assert.equal(state.current,null);assert.equal(state.trace.at(-1).reason,'display_age');
 state=runtime.receiveCoach(state,[a],[],44000,[],true);assert.equal(state.current,null);assert.equal(state.trace.at(-1).reason,'meeting_ended');
});
test('resolution requires an existing prompt ID and an exact fresh non-gap quote',()=>{
 const h=candidate(0,'What is the timing?','No timeline.'),rows=[segment(1,'A check-in next Friday would work.')];
 const result=runtime.inspectLiveCoaching({resolvedSuggestions:[{promptId:h.promptId,quote:rows[0].text,segmentId:'1'},{promptId:'foreign',quote:rows[0].text,segmentId:'1'}]},rows,[],[h],1);
 assert.deepEqual(Array.from(result.resolvedPrompts),[h.promptId]);
 assert.equal(runtime.inspectLiveCoaching({resolvedSuggestions:[{promptId:h.promptId,quote:rows[0].text,segmentId:'1'}]},[{...rows[0],gap:true}],[],[h],1).resolvedPrompts.length,0);
});
test('equivalent cautious-prospect simulation traces six distinct useful moves from generation to display',()=>{
 // Explicit deterministic model fixtures: this proves orchestration, not hosted LLM quality.
 const scenes=[
  ['I only have a few minutes; just seeing what is out there.','What made this worth a few minutes today?','outcome'],
  ['There is no budget signed off; spend is tight.','If this proved useful, is there normally a route to funding?','decision'],
  ['When might you act? I do not know. When would you decide? Still not sure.','What is happening with the current approach that you would most like to change?','concern'],
  ['People have been tired. It is wear and tear; I would not call it burnout.','Where are you seeing that wear and tear have the most effect?','criteria'],
  ['Send purpose, effort required, ballpark cost and what the next step involves.','What would make that short outline useful enough for you to consider the next step?','criteria'],
  ["I'll send a summary. Yes, thanks, keep it brief. Goodbye.",'When are you likely to look at it, and would a short check-in afterwards be useful?','next_step'],
 ];
 let state=runtime.createCoachRuntime();const rows=[];
 for(const [i,[text,wording,angle]] of scenes.entries()){
  rows.push(segment(i,text));const opportunity=runtime.coachingOpportunity(rows,i);assert.equal(opportunity.run,true);
  const result=runtime.inspectLiveCoaching({questions:[{...candidate(i,wording,text,angle),lead:'A point needs clarifying; try a concrete next question.'}]},rows,[],state.history,i,i*15000);
  state=runtime.receiveCoach(state,result.candidates,[{stage:'opportunity_detected',sequence:i,at:i*15000,signals:opportunity.signals},...result.trace],i*15000,state.current?[state.current.promptId]:[]);
  assert.equal(state.current.wording,wording);assert.equal(state.current.quote,text);state=runtime.markCoachDisplayed(state,state.current.promptId,i*15000+1);
 }
 assert.equal(state.trace.filter(e=>e.stage==='prompt_generated').length,6);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,6);
 assert.ok(state.trace.every(e=>typeof e.at==='number'&&typeof e.sequence==='number'));
 assert.equal(core.groundedMeetingAnalysis({nextMeeting:[state.current]},rows).nextMeeting.length,0);
});
test('signal-triggered live provider request retains reserve-first and both token-accounting fields',async()=>{
 const events=[],updates=[],text='No budget has been signed off; spend is tight.';
 class OpenAI{audio={transcriptions:{create:async()=>{events.push('transcribe');return {text,usage:{total_tokens:9}};}}};chat={completions:{create:async(body,options)=>{events.push('reason');assert.equal(options.timeout,6000);assert.equal(body.max_tokens,700);return {choices:[{message:{content:JSON.stringify({questions:[{text:'Is there a route to funding if value is clear?',wording:'Is there a route to funding if value is clear?',goal:'Clarify the funding path.',quote:text,segmentId:'0'}]})}}],usage:{total_tokens:17}};}}};}
 const db={rpc:async(_,{p_command})=>{events.push(p_command);return {data:{},error:null};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',context:{synthetic:true}},error:null}),update:v=>{updates.push(v);return q;},then:resolve=>resolve({error:null})};return q;}};
 const service=loadMeeting('lib/meetingCopilot.server.ts',{'openai':OpenAI,'./supabaseAdmin':{supabaseAdmin:db},'./meetingCoaching.server':{readMeetingFacts:async()=>[],readMeetingSender:async()=>''},'./diary.server':{},'./operationalIntelligence.server':{},'./relationshipCoach.server':{RELATIONSHIP_MODEL:'gpt-4o-mini'}},{process:{env:{OPENAI_API_KEY:'SYNTHETIC_TEST_KEY'}}});
 const form=new FormData();form.set('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');form.set('sequence','0');form.set('segments','[]');form.set('audio',new File([core.pcmWav(new Float32Array(24000),24000)],'test.wav'));
 const result=await service.transcribeMeeting({organisationId:'org-a',userId:'actor'},form);
 assert.deepEqual(events,['reserve','transcribe','reason']);assert.equal(result.analysis.questions.length,1);assert.ok(result.coachingTrace.some(e=>e.stage==='opportunity_detected'));assert.equal(updates[0].reasoning_tokens,17);assert.equal(updates[0].transcription_tokens,9);
});

test('queued advice expires rather than appearing late after a stalled tab',()=>{const a=candidate(0,'What matters most?','We are exploring.'),b=candidate(1,'Who else decides?','The decision is unclear.','decision');let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);state=runtime.receiveCoach(state,[b],[],1000);state=runtime.advanceCoach(state,26000);assert.equal(state.pending,null);assert.equal(state.current.promptId,a.promptId);assert.equal(state.trace.at(-1).reason,'queue_age');});
test('wording field cannot disguise a generic change-direction instruction',()=>{const rows=[segment(0,'We do not know yet.')],r=runtime.inspectLiveCoaching({questions:[{text:'Try another direction.',wording:'Try another direction.',goal:'Clarify a useful next step.',quote:rows[0].text,segmentId:'0'}]},rows,[],[],0);assert.equal(r.candidates.length,0);assert.equal(r.trace.at(-1).reason,'missing_usable_wording');});
test('unmatched resolution cannot remove displayed advice and runtime stays bounded',()=>{let state=runtime.receiveCoach(runtime.createCoachRuntime(),[candidate(0,'What matters most?','We are exploring.')],[],0);state=runtime.receiveCoach(state,[],[],500,['foreign']);assert.ok(state.current);for(let i=0;i<1400;i++)state=runtime.receiveCoach(state,[],[{stage:'opportunity_checked',at:i,sequence:i}],i);assert.equal(state.trace.length,1200);});

test('queued/resolved selection is never falsely counted as a DOM display',()=>{const a=candidate(0,'What matters most?','Still exploring.'),b=candidate(1,'Who approves?','Authority is unclear.','decision');let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,0);state=runtime.markCoachDisplayed(state,a.promptId,1);state=runtime.receiveCoach(state,[b],[],1000);state=runtime.receiveCoach(state,[],[],13000,[b.promptId]);assert.equal(state.pending,null);assert.equal(state.current.promptId,a.promptId);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,1);assert.ok(!state.trace.some(e=>e.stage==='prompt_selected'&&e.promptId===b.promptId));});

test('rolling conversation evidence keeps early time pressure and later updates without speaker labels',()=>{
 const early=segment(0,"I've only got a few minutes though."),explore=segment(1,"I'm just seeing what's out there."),later=segment(20,'Could you send a brief summary with purpose and effort?');
 const state=runtime.buildConversationState([early,explore]);const updated=runtime.buildConversationState([later],state);
 assert.equal(state.observations.find(x=>x.kind==='time_constraint').quote,early.text);assert.equal(updated.observations.find(x=>x.kind==='time_constraint').segmentId,'0');assert.equal(updated.observations.find(x=>x.kind==='follow_up_request').segmentId,'20');
 assert.deepEqual(Array.from(updated.observations.map(x=>x.kind)),['time_constraint','exploration','follow_up_request']);
 assert.equal(runtime.coachingOpportunity([later],20,undefined,false,updated).run,true);
});

test('follow-up request and natural brief-summary close trigger a next-state conversation',()=>{
 const rows=[segment(0,"I've only got a few minutes."),segment(1,'Could you send me the purpose, effort, ballpark cost and next step?'),segment(2,'That sounds fine; keep it brief.'),segment(3,'I will give you a brief summary and then we can leave it there.')],state=runtime.buildConversationState(rows);
 const requestOpportunity=runtime.coachingOpportunity(rows.slice(0,2),1,undefined,false,runtime.buildConversationState(rows.slice(0,2))),opportunity=runtime.coachingOpportunity(rows,3,undefined,false,state);assert.ok(requestOpportunity.signals.includes('follow_up_requirements'));assert.ok(opportunity.signals.includes('check_close'));assert.equal(opportunity.run,true);
 const messages=coach.meetingCoachingMessages([],rows,false,[],{conversationState:state,opportunity});assert.match(messages[0].content,/explicitly choose the realistic goal NOW/);assert.match(messages[0].content,/unresolved close/);assert.match(messages[1].content,/time_constraint/);assert.equal(JSON.parse(messages[1].content).conversationState.observations.length,2);
});

test('pause after vague non-progressing answers can trigger support, while silence alone abstains',()=>{
 const rows=[segment(0,'When might this happen?'),segment(1,'I am not sure yet.'),segment(2,'')];
 const opportunity=runtime.coachingOpportunity(rows,2);assert.ok(opportunity.signals.includes('possible_pause_after_nonprogress'));assert.equal(opportunity.run,true);
 assert.equal(runtime.coachingOpportunity([segment(3,'')],3).reason,'no_speech');
});

test('repeated budget route is signalled as a branch change, not a prompt quota',()=>{
 const rows=[segment(1,'What budget is available?'),segment(2,'No budget has been signed off.'),segment(3,'What spend did you have in mind?'),segment(4,'There is no number yet.')],state=runtime.buildConversationState(rows);
 assert.ok(runtime.coachingOpportunity(rows,4,undefined,false,state).signals.includes('budget_route_exhausted'));
 const prior=candidate(3,'What number do you have in mind?','There is no number yet.','decision'),next=candidate(4,'If useful, how would something like this normally get funded?','There is no number yet.','concern');
 assert.equal(coach.coachingSuppression(next,[prior]),null);
});

test('candidate goal is carried through exact grounding and shown-history starts only after visible acknowledgement',()=>{
 const rows=[segment(0,'There is no signed-off budget.')],raw={questions:[{...candidate(0,'How would something useful normally be funded?','There is no signed-off budget.','decision'),goal:'Secure a useful second conversation.',lead:'Budget is not approved; test the funding path.'}]};
 const result=runtime.inspectLiveCoaching(raw,rows,[],[],0);assert.equal(result.candidates[0].goal,'Secure a useful second conversation.');
 let state=runtime.receiveCoach(runtime.createCoachRuntime(),result.candidates,result.trace,0);assert.equal(state.history.length,0);state=runtime.markCoachDisplayed(state,state.current.promptId,100);assert.equal(state.history.length,1);
 state=runtime.advanceCoach(state,40100);assert.equal(state.trace.at(-1).stage,'prompt_expired');assert.equal(state.trace.at(-2).stage,'prompt_visibility_ended');assert.equal(state.trace.at(-2).durationMs,40000);
});

test('live rejection telemetry distinguishes malformed source and quote without exposing generated text',()=>{
 const rows=[segment(0,'No budget has been signed off.')],result=runtime.inspectLiveCoaching({questions:[{text:'What route could make this fundable?',quote:'No budget has been approved.',segmentId:'0'},{text:'What is the priority?',quote:rows[0].text,segmentId:'9'}]},rows,[],[],1);
 assert.deepEqual(Array.from(result.trace.filter(e=>e.stage==='prompt_suppressed').map(e=>e.reason)),['quote_not_in_source','unknown_or_gap_source']);assert.ok(result.trace.every(e=>!('text' in e)&&!('quote' in e)));
});

test('a coaching suggestion without an explicit current call goal is rejected',()=>{
 const rows=[segment(0,'We are exploring a possible pilot.')],result=runtime.inspectLiveCoaching({questions:[{text:'What would make it useful?',wording:'What would make it useful?',quote:rows[0].text,segmentId:'0'}]},rows,[],[],0);
 assert.equal(result.candidates.length,0);assert.equal(result.trace.at(-1).reason,'missing_call_goal');
});

test('bounded fallback survives model failure and surfaces a high-priority unresolved close',async()=>{
 const events=[];class OpenAI{audio={transcriptions:{create:async()=>({text:"I'll send the brief you asked for. Thanks, we can leave it there.",usage:{total_tokens:3}})}};chat={completions:{create:async()=>{events.push('model');throw Error('private provider detail');}}};}
 const db={rpc:async(_,{p_command})=>{events.push(p_command);return {data:{},error:null};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',context:{synthetic:true}},error:null}),update:()=>q,then:resolve=>resolve({error:null})};return q;}};
 const service=loadMeeting('lib/meetingCopilot.server.ts',{'openai':OpenAI,'./supabaseAdmin':{supabaseAdmin:db},'./meetingCoaching.server':{readMeetingFacts:async()=>[],readMeetingSender:async()=>''},'./diary.server':{},'./operationalIntelligence.server':{},'./relationshipCoach.server':{RELATIONSHIP_MODEL:'gpt-4o-mini'}},{process:{env:{OPENAI_API_KEY:'SYNTHETIC_TEST_KEY'}}});
 const prior=[segment(1,'Could you send me what it is, effort, ballpark cost and what happens next?'),segment(2,'No budget has been signed off and I am only exploring.')],state=runtime.buildConversationState(prior),form=new FormData();form.set('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');form.set('sequence','3');form.set('segments',JSON.stringify(prior));form.set('conversationState',JSON.stringify(state));form.set('coachingHistory','[]');form.set('audio',new File([core.pcmWav(new Float32Array(24000),24000)],'test.wav'));
 const result=await service.transcribeMeeting({organisationId:'org-a',userId:'actor'},form);
 assert.deepEqual(events,['reserve','model']);assert.equal(result.analysisError,false);assert.equal(result.analysis.questions.length,1);assert.match(result.analysis.questions[0].goal,/review point/i);assert.match(result.analysis.questions[0].wording,/useful to review the brief/);assert.ok(result.coachingTrace.some(e=>e.stage==='generation_failed'&&e.reason==='provider_timeout_or_failure'));assert.ok(result.coachingTrace.some(e=>e.stage==='generation_fallback'&&e.priority==='critical'));assert.equal(result.coachingTrace.find(e=>e.stage==='opportunity_detected').priority,'critical');assert.doesNotMatch(JSON.stringify(result.coachingTrace),/private provider detail|send me what it is/);
});

test('Alex-style synthetic simulation redirects exhausted routes, advances the goal and reports actually visible high-priority coaching',()=>{
 const scenes=[
  "I've only got a few minutes. I'm not buying today, there is no defined project, no signed-off budget and I have not thought deeply about it.",
  'When do you think you might act? I am not sure. When would this happen? I do not know.',
  'I want to explain the whole programme in detail. We have spent years developing a broad range of materials, different pathways, several delivery formats, a lot of background research, a number of options, and many possible ways to adapt the content for different teams. The framework has multiple stages and we could talk through every element, the history, the rationale, all the modules, the exercises, the supporting resources and the measurement approach. There is quite a lot to cover and I could keep going through each part now.',
  'We have wear and tear in the team, but I am cautious about making a big project of it.',
  'Could you send a brief covering what it is, effort for my team, ballpark cost and what happens next?',
  'There is no date I can commit to, but I would look at something brief.',
  "I'll send the brief you asked for. Thanks, we can leave it there."
 ];
 let rows=[],state=runtime.createCoachRuntime(),conversation=runtime.buildConversationState([]),high=[];
 for(const [i,text] of scenes.entries()){
  rows=[...rows,segment(i,text)];conversation=runtime.buildConversationState([segment(i,text)],conversation);const opportunity=runtime.coachingOpportunity(rows,i,undefined,false,conversation);if(opportunity.priority==='high'||opportunity.priority==='critical')high.push(opportunity);
  const raw=runtime.deterministicCoachingFallback(rows,opportunity,i);if(raw){const result=runtime.inspectLiveCoaching(raw,rows,[],state.history,i,i*15000,opportunity);state=runtime.receiveCoach(state,result.candidates,[{stage:'opportunity_detected',at:i*15000,sequence:i,signals:opportunity.signals,priority:opportunity.priority},...result.trace],i*15000,state.current?[state.current.promptId]:[]);if(state.current){state=runtime.markCoachDisplayed(state,state.current.promptId,i*15000+500);}}
 }
 const summary=runtime.coachingDiagnostics(state.trace),shown=state.trace.filter(e=>e.stage==='prompt_visible');
 assert.ok(high.length>=3);assert.ok(shown.length>=3);assert.equal(summary.promptsVisible,shown.length);assert.ok(summary.highPriorityVisible>=3);assert.equal(summary.highPriorityMissCount,summary.highPriorityOpportunities-summary.highPriorityVisible);assert.ok(summary.highPriorityMissReasons.every(m=>m.causes.length>0));assert.ok(summary.medianHighPriorityDetectionToVisibleMs>=0);assert.ok(state.history.some(p=>p.branch==='trigger'));assert.ok(state.history.some(p=>p.branch==='consequence'&&/Stop explaining/i.test(p.goal)));assert.ok(state.history.some(p=>p.branch==='follow_up'&&/review point/i.test(p.goal)&&!/effort required from the buyer/i.test(p.wording)));assert.ok(state.history.some(p=>p.priority==='critical'));assert.ok(state.trace.some(e=>e.stage==='prompt_expired'&&e.reason==='answered_or_moved_on'));assert.ok(state.trace.some(e=>e.stage==='prompt_suppressed'&&e.reason==='duplicate_text'));
});

test('a materially different route is allowed on the same quote while true duplicate text remains suppressed',()=>{
 const quote='There is no budget signed off and timing is unclear.',old={...candidate(1,'When might the budget be approved?',quote,'decision'),branch:'funding',goal:'Find a timing for approval.'},next={...candidate(2,'What would need to happen internally for this to become a priority?',quote,'decision'),branch:'trigger',goal:'Find the trigger for action.'};
 assert.equal(coach.coachingSuppression(next,[old]),null);assert.equal(coach.coachingSuppression({...next,text:old.text,wording:old.wording},[old]),'duplicate_text');
});

test('close fast path respects an explicit agreed review point and contact boundary',()=>{
 const request=segment(0,'Could you send a brief with the effort and cost?'),review=segment(1,'Thanks, we will review it Tuesday; yes, that works.'),state=runtime.buildConversationState([request,review]);
 assert.ok(!runtime.coachingOpportunity([request,review],1,undefined,false,state).signals.includes('check_close'));
 const boundary=segment(2,"Please don't contact me again. Thanks, goodbye."),blocked=runtime.buildConversationState([request,boundary]),opportunity=runtime.coachingOpportunity([request,boundary],2,undefined,false,blocked),fallback=runtime.deterministicCoachingFallback([request,boundary],opportunity,2);
 assert.ok(opportunity.signals.includes('contact_boundary'));assert.equal(opportunity.priority,'critical');assert.equal(fallback.questions[0].branch,'graceful_exit');assert.match(fallback.questions[0].wording,/follow up/);
});

test('an agreed follow-up after requested material triggers deterministic high-priority close and uses known send timing',()=>{
 const rows=[segment(0,'Could you send me the brief with the purpose and the effort?'),segment(1,'We could have another call once it is over.'),segment(2,'That works. I will email it in the next couple of days.')],state=runtime.buildConversationState(rows),opportunity=runtime.coachingOpportunity(rows,2,undefined,false,state),fallback=runtime.deterministicCoachingFallback(rows,opportunity,2);
 assert.ok(opportunity.signals.includes('follow_up_requirements'));assert.ok(opportunity.signals.includes('check_close'));assert.equal(opportunity.priority,'critical');assert.equal(opportunity.followUpAccepted,true);assert.equal(opportunity.relativeSendTiming,'in the next couple of days');assert.match(fallback.questions[0].goal,/review point/i);assert.match(fallback.questions[0].wording,/in the next couple of days/);assert.match(fallback.questions[0].wording,/review a few days after that/);assert.doesNotMatch(fallback.questions[0].wording,/effort.*\?/i);
});

test('date refusal changes the close question to a respectful review trigger instead of renewed date pressure',()=>{
 const rows=[segment(0,'Please email the short brief with likely effort and cost.'),segment(1,'A follow-up could be useful, but I cannot commit to a date.'),segment(2,'I will send it by Friday.')],state=runtime.buildConversationState(rows),opportunity=runtime.coachingOpportunity(rows,2,undefined,false,state),fallback=runtime.deterministicCoachingFallback(rows,opportunity,2);
 assert.ok(opportunity.signals.includes('check_close'));assert.equal(opportunity.priority,'critical');assert.equal(opportunity.dateRefused,true);assert.equal(opportunity.relativeSendTiming,'by Friday');assert.match(fallback.questions[0].wording,/No problem/);assert.match(fallback.questions[0].wording,/by Friday/);assert.match(fallback.questions[0].wording,/useful point to check back/);assert.doesNotMatch(fallback.questions[0].wording,/what date|book a call/i);
});

test('known brief requirements switch coaching from rediscovery to securing review',()=>{
 const rows=[segment(0,'Could you send a brief with purpose, effort and ballpark cost?'),segment(1,'No, I do not have a date I can commit to.')],state=runtime.buildConversationState(rows),opportunity=runtime.coachingOpportunity(rows,1,undefined,false,state),fallback=runtime.deterministicCoachingFallback(rows,opportunity,1);
 assert.ok(opportunity.signals.includes('follow_up_requirements'));assert.equal(fallback.questions[0].goal,'Secure a clear review point, not a sale today.');assert.match(fallback.questions[0].wording,/what would be a useful point/);assert.doesNotMatch(fallback.questions[0].wording,/what effort|what should the brief include/i);
});

test('unsupported format claims are replaced with a neutral format clarification',()=>{
 const rows=[segment(0,"We are exploring this, but have not settled on an approach.")],item={text:'They want a workshop pilot.',wording:'I can put together a workshop pilot for you.',lead:'The prospect is interested in a workshop.',goal:'Plan the workshop pilot.',quote:rows[0].text,segmentId:'0',evidenceKind:'transcript'},opportunity={run:true,signals:['vague_intent'],reason:'conversation_signal',priority:'normal'};
 const result=runtime.inspectLiveCoaching({questions:[item]},rows,[],[],0,100,opportunity),candidate=result.candidates[0];
 assert.equal(result.candidates.length,1);assert.match(candidate.wording,/When you say you’re exploring this/);assert.match(candidate.wording,/workshop, a pilot, ongoing access/);assert.match(candidate.wording,/[?]$/);assert.match(candidate.goal,/Clarify the format/);assert.equal(candidate.evidenceKind,'transcript');assert.ok(result.trace.some(e=>e.reason==='unsupported_product_format_assumption'));assert.ok(result.trace.some(e=>e.reason==='format_clarification_fallback'));
});

test('only an exact recorded prospect request or confirmed purpose establishes a product format',()=>{
 const fact={id:'purpose',kind:'recorded',text:'Confirmed meeting purpose: prospect requested information about a short workshop pilot.'},candidate={text:'You requested information about a workshop pilot.',wording:'I can outline what that workshop pilot could involve.',lead:'The confirmed purpose mentions this format.',goal:'Explain the requested workshop pilot.',quote:fact.text,segmentId:fact.id,evidenceKind:'recorded'};
 assert.equal(coach.unsupportedProductFormat(candidate,[fact]),false);
 const note={...fact,id:'note',kind:'user_note',text:'User-recorded observation (not independently verified): prospect may want a workshop pilot.'};
 assert.equal(coach.unsupportedProductFormat({...candidate,quote:note.text,segmentId:note.id},[note]),true);
 assert.equal(coach.unsupportedProductFormat({...candidate,evidenceKind:'transcript',text:'They want a workshop. When you say you’re exploring this, are you thinking about a workshop?',wording:'When you say you’re exploring this, are you thinking about a workshop?',lead:'The prospect wants a workshop.'},[]),true);
 assert.doesNotMatch(JSON.stringify(coach.practiceFacts),/workshop|pilot|demo|subscription/i);
});
