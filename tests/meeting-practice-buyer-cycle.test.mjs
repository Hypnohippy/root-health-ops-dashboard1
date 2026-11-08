import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const sessionId='11111111-1111-4111-8111-111111111111',key='synthetic-test-key-only',sellerText='The source says the reporting is anonymous and does not expose individual employee data. Is that visibility missing from what you have now?';

test('Knowledge-sourced seller answer reaches the bounded buyer generator with attested transcript context',async()=>{
 const attest=loadMeeting('lib/meetingPracticeTurnAttestation.server.ts'),generationCalls=[],usageRows=[{sequence:0,seconds:5,reasoning_tokens:0}],session={id:sessionId,status:'live',context:{synthetic:true,practiceTurnMode:'turn_based_v1'}};
 const supabaseAdmin={from(table){return {select(){return this;},eq(){return this;},in(){return Promise.resolve({data:usageRows,error:null});},update(){return this;},maybeSingle(){return Promise.resolve({data:table==='meeting_copilot_sessions'?session:{sequence:0},error:null});},then(resolve,reject){return Promise.resolve({data:usageRows,error:null}).then(resolve,reject);}};}};
 class MockOpenAI{constructor(){this.chat={completions:{create:async params=>{generationCalls.push(params);if(generationCalls.length===1)throw Object.assign(Error('synthetic transient failure'),{status:503});return {choices:[{message:{content:JSON.stringify({text:'Yes, our annual surveys do not show what is happening between check-ins.'})}}],usage:{total_tokens:18}};}}};}}
 const server=loadMeeting('lib/meetingCopilot.server.ts',{
  openai:MockOpenAI,
  './supabaseAdmin':{supabaseAdmin},
  './meetingCoaching.server':{readMeetingFacts:async()=>[],readMeetingSender:async()=>null},
  './diary.server':{readDiary:async()=>[]},
  './operationalIntelligence.server':{readOperationalIntelligence:async()=>({})},
  './relationshipCoach.server':{RELATIONSHIP_MODEL:'synthetic-test-model'},
  './meetingCopilot':{meetingAttachment:()=>null,meetingSegments:()=>[],groundedMeetingAnalysis:()=>({}),wavSeconds:()=>0,meetingEvidenceKey:()=>'',PRACTICE_MIN_CHECKPOINT_AUDIO_MS:1000},
  './meetingLaunch':{RELATIONSHIP_CALL_PREFIX:'relationship-call:'},
 },{process:{env:{SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'synthetic-test-key'}}});
 const turn={id:'seller-turn-1',order:1,role:'seller',text:sellerText,startedAt:10,endedAt:20,finalized:true,boundary:'confirmed',sourceEvidenceIds:['0'],integrity:'complete',provenance:{sourceId:sessionId,method:'practice_action',confidence:null},sourceEvidence:[{id:'0',text:sellerText,serverAttestation:attest.attestPracticeTranscript(sessionId,0,sellerText,key)}]};
 const result=await server.meetingRequest({organisationId:'org-test',userId:'user-test'},{action:'practice_cycle',id:sessionId,sellerTurn:turn,previousTurns:[],activeWordingId:'knowledge:root-membership:item-007',currentScriptStepId:'discovery-1',playbookText:'# Practice Guide\n## Opening\nSet a clear purpose.\n## Discovery\nAsk about current support.'});
 assert.equal(generationCalls.length,2,'one transient provider failure receives the existing single bounded retry');assert.equal(generationCalls[0].max_tokens,64,'normal Alex turns use a bounded token allowance consistent with the concise response contract');
 assert.match(generationCalls[0].messages[0].content,/answer that question first and do not introduce a new product question/i);
 const prompt=JSON.parse(generationCalls[0].messages[1].content);
 assert.equal(prompt.activeApprovedSellerWording,undefined,'a local Knowledge ID is never mislabeled as uploaded-playbook wording');
 assert.deepEqual(prompt.verifiedSellerResponseContext,{section:'discovery',text:sellerText});
 assert.equal(prompt.currentSellerTurn,sellerText,'the buyer receives the exact transcript text already verified against microphone evidence');
 assert.equal(result.buyerTurn.text,'Yes, our annual surveys do not show what is happening between check-ins.','the synthetic buyer response addresses the seller’s attested control question');
 assert.equal(result.practiceBuyerGeneration.attempts.length,2);
 assert.equal(result.practiceBuyerGeneration.attempts[0].failureClass,'provider_unavailable');
 assert.equal(result.practiceBuyerGeneration.attempts[0].retryResult,'succeeded');
 assert.equal(result.practiceBuyerGeneration.navigationCommitted,false);
});

