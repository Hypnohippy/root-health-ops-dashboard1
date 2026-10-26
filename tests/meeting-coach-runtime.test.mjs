import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMeeting} from './meeting-copilot-loader.mjs';
const runtime=loadMeeting('lib/meetingCoachRuntime.ts'),coach=loadMeeting('lib/meetingCoaching.ts'),core=loadMeeting('lib/meetingCopilot.ts');
const segment=(id,text)=>({id:String(id),text,gap:false});
const candidate=(id,text,quote,angle='outcome')=>({promptId:`${id}:q0`,text,wording:text,quote,segmentId:String(id),angle});

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
 const result=runtime.inspectLiveCoaching({questions:[old,{text:'Try another direction.',quote:rows[0].text,segmentId:'0'},{text:'Invented?',quote:'Missing quote',segmentId:'0'}]},rows,[],[old],1,100);
 assert.equal(result.candidates.length,0);assert.equal(result.trace.filter(e=>e.stage==='prompt_generated').length,3);
 assert.deepEqual(Array.from(result.trace.filter(e=>e.stage==='prompt_suppressed').map(e=>e.reason)),['duplicate_text','missing_usable_wording','invalid_or_ungrounded']);
 assert.ok(result.trace.every(e=>!('text' in e)&&!('quote' in e)));
});
test('new evidence within the same topic is not blocked by a coarse topic cooldown',()=>{
 const old=candidate(0,'Who approves this?',"I don't know who signs it off.",'decision');
 const next=candidate(1,'Is there a route to funding if value is proven?','No budget has been signed off.','decision');
 assert.equal(coach.coachingSuppression(next,[old]),null);
});
test('a fresh prompt has a reading window and a later prompt is queued before replacement',()=>{
 const a=candidate(0,'What made this worth looking at now?','Only a few minutes.'),b=candidate(1,'How does funding normally get approved?','No budget signed off.','decision');
 let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);
 state=runtime.receiveCoach(state,[b],[],5000);assert.equal(state.current.promptId,a.promptId);assert.equal(state.pending.promptId,b.promptId);
 state=runtime.advanceCoach(state,11999);assert.equal(state.current.promptId,a.promptId);
 state=runtime.advanceCoach(state,12000);assert.equal(state.current.promptId,b.promptId);
 assert.equal(state.trace.filter(e=>e.stage==='prompt_selected').length,2);assert.ok(state.trace.some(e=>e.stage==='prompt_replaced'));
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
  state=runtime.receiveCoach(state,result.candidates,[{stage:'opportunity_detected',sequence:i,at:i*15000,signals:opportunity.signals},...result.trace],i*15000);
  assert.equal(state.current.wording,wording);assert.equal(state.current.quote,text);state=runtime.markCoachDisplayed(state,state.current.promptId,i*15000+1);
 }
 assert.equal(state.trace.filter(e=>e.stage==='prompt_generated').length,6);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,6);
 assert.ok(state.trace.every(e=>typeof e.at==='number'&&typeof e.sequence==='number'));
 assert.equal(core.groundedMeetingAnalysis({nextMeeting:[state.current]},rows).nextMeeting.length,0);
});
test('signal-triggered live provider request retains reserve-first and both token-accounting fields',async()=>{
 const events=[],updates=[],text='No budget has been signed off; spend is tight.';
 class OpenAI{audio={transcriptions:{create:async()=>{events.push('transcribe');return {text,usage:{total_tokens:9}};}}};chat={completions:{create:async(body,options)=>{events.push('reason');assert.equal(options.timeout,6000);assert.equal(body.max_tokens,700);return {choices:[{message:{content:JSON.stringify({questions:[{text:'Is there a route to funding if value is clear?',wording:'Is there a route to funding if value is clear?',quote:text,segmentId:'0'}]})}}],usage:{total_tokens:17}};}}};}
 const db={rpc:async(_,{p_command})=>{events.push(p_command);return {data:{},error:null};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',context:{synthetic:true}},error:null}),update:v=>{updates.push(v);return q;},then:resolve=>resolve({error:null})};return q;}};
 const service=loadMeeting('lib/meetingCopilot.server.ts',{'openai':OpenAI,'./supabaseAdmin':{supabaseAdmin:db},'./meetingCoaching.server':{readMeetingFacts:async()=>[],readMeetingSender:async()=>''},'./diary.server':{},'./operationalIntelligence.server':{},'./relationshipCoach.server':{RELATIONSHIP_MODEL:'gpt-4o-mini'}},{process:{env:{OPENAI_API_KEY:'SYNTHETIC_TEST_KEY'}}});
 const form=new FormData();form.set('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');form.set('sequence','0');form.set('segments','[]');form.set('audio',new File([core.pcmWav(new Float32Array(24000),24000)],'test.wav'));
 const result=await service.transcribeMeeting({organisationId:'org-a',userId:'actor'},form);
 assert.deepEqual(events,['reserve','transcribe','reason']);assert.equal(result.analysis.questions.length,1);assert.ok(result.coachingTrace.some(e=>e.stage==='opportunity_detected'));assert.equal(updates[0].reasoning_tokens,17);assert.equal(updates[0].transcription_tokens,9);
});

test('queued advice expires rather than appearing late after a stalled tab',()=>{const a=candidate(0,'What matters most?','We are exploring.'),b=candidate(1,'Who else decides?','The decision is unclear.','decision');let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);state=runtime.receiveCoach(state,[b],[],1000);state=runtime.advanceCoach(state,26000);assert.equal(state.pending,null);assert.equal(state.current.promptId,a.promptId);assert.equal(state.trace.at(-1).reason,'queue_age');});
test('wording field cannot disguise a generic change-direction instruction',()=>{const rows=[segment(0,'We do not know yet.')],r=runtime.inspectLiveCoaching({questions:[{text:'Try another direction.',wording:'Try another direction.',quote:rows[0].text,segmentId:'0'}]},rows,[],[],0);assert.equal(r.candidates.length,0);assert.equal(r.trace.at(-1).reason,'missing_usable_wording');});
test('unmatched resolution cannot remove displayed advice and runtime stays bounded',()=>{let state=runtime.receiveCoach(runtime.createCoachRuntime(),[candidate(0,'What matters most?','We are exploring.')],[],0);state=runtime.receiveCoach(state,[],[],500,['foreign']);assert.ok(state.current);for(let i=0;i<1400;i++)state=runtime.receiveCoach(state,[],[{stage:'opportunity_checked',at:i,sequence:i}],i);assert.equal(state.trace.length,1200);});

test('queued/resolved selection is never falsely counted as a DOM display',()=>{const a=candidate(0,'What matters most?','Still exploring.'),b=candidate(1,'Who approves?','Authority is unclear.','decision');let state=runtime.receiveCoach(runtime.createCoachRuntime(),[a],[],0);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,0);state=runtime.markCoachDisplayed(state,a.promptId,1);state=runtime.receiveCoach(state,[b],[],1000);state=runtime.receiveCoach(state,[],[],13000,[b.promptId]);assert.equal(state.pending,null);assert.equal(state.current.promptId,a.promptId);assert.equal(state.trace.filter(e=>e.stage==='prompt_displayed').length,1);assert.ok(!state.trace.some(e=>e.stage==='prompt_selected'&&e.promptId===b.promptId));});
