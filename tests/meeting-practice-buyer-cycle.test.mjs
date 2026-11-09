import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const sessionId='11111111-1111-4111-8111-111111111111',key='synthetic-test-key-only';
const attest=loadMeeting('lib/meetingPracticeTurnAttestation.server.ts'),adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts'),flow=loadMeeting('lib/meetingPracticeFlow.ts'),knowledge=loadMeeting('lib/meetingPracticeKnowledge.ts');
const knowledgeText=fs.readFileSync('public/practice-knowledge/root-health-workplace-membership-source.txt','utf8');
const pack=knowledge.pinPracticeKnowledgePack([knowledge.preparePracticeKnowledgeSource({text:knowledgeText,fileName:'root-health-workplace-membership-source.txt'})]);
const playbookText=`# Northstar Buyer Cycle
## Opening
Set a clear purpose and understand how the team currently approaches wellbeing.
## Discovery
Understand current provision.
Explore what is working.
Identify pressure on burnout and engagement.
Understand how effectiveness is measured.
Identify what should be prioritised.
## Positioning
Connect the organisation's needs to the relevant support and insight.
## Soft Close
Agree whether a short follow-up is the right next step.`;
const playbook=adaptive.parseSalesPlaybook(playbookText);
const buyerReplies=[
 'We run quarterly wellbeing surveys and have a confidential support line.',
 'The line is valued by employees who use it, but we cannot tell whether it is changing anything.',
 'Pressure is showing up as fatigue and lower engagement in two teams, even though support is available.',
 'Managers are handling more referrals and several people have started taking more time off.',
 'We only see survey results once a year, so changes between surveys and the effect of interventions are hard to judge.',
 'Our priority is spotting pressure early in those teams before absence gets worse.',
 'How do you balance employee privacy with organisational transparency?',
 'That privacy boundary is helpful and the workforce view sounds relevant to us.',
 'Yes, a short follow-up to see how it could fit would be useful.',
];

function makeCommercialDecision(prompt,index){
 const buyerTurnId=prompt.currentBuyerTurnId,currentStepId=prompt.currentObjective.stepId;
 const shared={buyerIntent:prompt.buyerIntentHint,buyerQuestionSummary:prompt.finalizedConversation.at(-1).text.slice(0,180),currentObjective:{stepId:currentStepId,assessment:'covered'},coveredObjectives:[{stepId:currentStepId,evidenceTurnIds:[buyerTurnId]}],canonicalTargetStepId:null,detourAction:'none',detourTargetId:null,irrelevantFactIds:[],confidence:0.92};
 if(index===6){
  const fact=prompt.approvedPreparedFacts.find(item=>item.section==='Organisation Insights');assert.ok(fact,'the current buyer question selects an actual privacy/transparency fact from the pinned source');
  return {...shared,currentObjective:{stepId:currentStepId,assessment:'not_covered'},coveredObjectives:[],answerMode:'grounded_answer',groundedKnowledgeIds:[fact.knowledgeId],sellerAnswer:'Employees join privately; the organisation receives anonymous workforce-level insight rather than individual employee information.',sellerControlMove:'Would that balance fit the visibility you need?',canonicalAction:'stay',answersBuyerQuestion:true,supportedBySelectedFacts:true,unsupportedClaimRisk:'none'};
 }
 const next=prompt.uploadedPlaybookObjectives[prompt.uploadedPlaybookObjectives.findIndex(item=>item.stepId===currentStepId)+1];
 return {...shared,answerMode:'canonical_prompt',groundedKnowledgeIds:[],sellerAnswer:'',sellerControlMove:'',canonicalAction:next?'advance':'close',answersBuyerQuestion:false,supportedBySelectedFacts:false,unsupportedClaimRisk:'none'};
}

test('one server commercial decision per buyer turn ranks pinned facts, answers a question, and advances natural objective coverage through the uploaded playbook',async()=>{
 const generationCalls=[],usageRows=Array.from({length:9},(_,sequence)=>({organisation_id:'org-test',user_id:'user-test',session_id:sessionId,sequence,seconds:5,reasoning_tokens:0})),session={id:sessionId,status:'live',context:{synthetic:true,practiceTurnMode:'turn_based_v1'}};
 const supabaseAdmin={from(table){const filters={};let update=null;const query={select(){return this;},eq(column,value){filters[column]=value;return this;},in(column,values){filters[column]=values;return Promise.resolve({data:usageRows.filter(row=>values.includes(row[column])),error:null});},update(values){update=values;return this;},maybeSingle(){if(table==='meeting_copilot_sessions')return Promise.resolve({data:session,error:null});const row=usageRows.find(item=>Object.entries(filters).every(([key,value])=>item[key]===value));if(row&&update)Object.assign(row,update);return Promise.resolve({data:row?{sequence:row.sequence}:null,error:null});},then(resolve,reject){const rows=usageRows.filter(row=>Object.entries(filters).every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value));return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return query;}};
 let buyerRequestCount=0,decisionRequestCount=0,failedOnce=false,lastDecisionOutput=null;
 class MockOpenAI{constructor(){this.chat={completions:{create:async params=>{generationCalls.push(params);const name=params.response_format?.json_schema?.name;if(name==='synthetic_practice_buyer'){buyerRequestCount++;if(!failedOnce){failedOnce=true;throw Object.assign(Error('synthetic transient failure'),{status:503});}const buyerIndex=buyerRequestCount===2?0:buyerRequestCount-2;return {choices:[{message:{content:JSON.stringify({text:buyerReplies[buyerIndex]})}}],usage:{total_tokens:18}};}assert.equal(name,'practice_commercial_turn_decision','every completed buyer response receives exactly one complete decision');decisionRequestCount++;const prompt=JSON.parse(params.messages[1].content),decision=makeCommercialDecision(prompt,decisionRequestCount-1);lastDecisionOutput=decision;return {choices:[{message:{content:JSON.stringify(decision)}}],usage:{total_tokens:23}};}}};}}
 const server=loadMeeting('lib/meetingCopilot.server.ts',{
  openai:MockOpenAI,'./supabaseAdmin':{supabaseAdmin},
  './meetingCoaching.server':{readMeetingFacts:async()=>[],readMeetingSender:async()=>null},
  './diary.server':{readDiary:async()=>[]},'./operationalIntelligence.server':{readOperationalIntelligence:async()=>({})},
  './relationshipCoach.server':{RELATIONSHIP_MODEL:'synthetic-test-model'},
  './meetingCopilot':{meetingAttachment:()=>null,meetingSegments:()=>[],groundedMeetingAnalysis:()=>({}),wavSeconds:()=>0,meetingEvidenceKey:()=>'',PRACTICE_MIN_CHECKPOINT_AUDIO_MS:1000},
  './meetingLaunch':{RELATIONSHIP_CALL_PREFIX:'relationship-call:'},
 },{process:{env:{SUPABASE_SERVICE_ROLE_KEY:key,OPENAI_API_KEY:'synthetic-test-key'}}});
 const turnHistory=[];let navigation={scriptStepId:playbook.scriptSteps[0].id,currentScriptStepId:playbook.scriptSteps[0].id,currentScriptSection:'opening',activeAdaptiveRoute:false,resumeScriptStepId:null};
 const expectedSteps=['discovery-1','discovery-2','discovery-3','discovery-4','discovery-5','positioning-1','positioning-1','soft_close-1','soft_close-1'];
 for(let cycleIndex=0;cycleIndex<buyerReplies.length;cycleIndex++){
  const currentStep=playbook.scriptSteps.find(step=>step.id===navigation.scriptStepId),sellerOrder=turnHistory.length+1,sequence=cycleIndex;
  const seller={id:`seller-turn-${cycleIndex+1}`,order:sellerOrder,role:'seller',text:currentStep.text,startedAt:10+cycleIndex*20,endedAt:20+cycleIndex*20,finalized:true,boundary:'explicit',sourceEvidenceIds:[String(sequence)],integrity:'complete',provenance:{sourceId:sessionId,method:'practice_action',confidence:null},sourceEvidence:[{id:String(sequence),text:currentStep.text,serverAttestation:attest.attestPracticeTranscript(sessionId,sequence,currentStep.text,key)}]};
  const result=await server.meetingRequest({organisationId:'org-test',userId:'user-test'},{action:'practice_cycle',id:sessionId,sellerTurn:seller,previousTurns:turnHistory,activeWordingId:currentStep.id,currentScriptStepId:currentStep.id,playbookText,knowledgePack:pack});
  const completeTurns=[...turnHistory,result.sellerTurn,result.buyerTurn],validation=flow.validatePracticeCommercialTurnDecision({value:result.practiceCommercialDecision,playbook,currentStepId:currentStep.id,buyerText:result.buyerTurn.text,turns:completeTurns,items:pack.items,snapshotVersion:pack.snapshotVersion});
  assert.ok(validation.decision,`cycle ${cycleIndex+1} decision validates against attested turns and pinned Knowledge: ${validation.reason}; server=${JSON.stringify(result.practiceCommercialDecisionDiagnostics)}; decision=${JSON.stringify(result.practiceCommercialDecision)}; providerOutput=${JSON.stringify(lastDecisionOutput)}; buyer=${JSON.stringify(result.buyerTurn.text)}`);
  const applied=flow.applyPracticeCommercialTurnDecision({navigation,playbook,decision:validation.decision,sequence:result.buyerTurn.order});assert.ok(applied.navigation,`cycle ${cycleIndex+1} app consumption is legal: ${applied.reason}`);navigation=applied.navigation;
  assert.equal(result.practiceCommercialDecisionDiagnostics.status,'validated');assert.equal(result.practiceBuyerGeneration.attempts.length,cycleIndex===0?2:1);assert.equal(navigation.scriptStepId,expectedSteps[cycleIndex],`cycle ${cycleIndex+1} follows semantic buyer evidence, not exact script sentence matching`);
  if(cycleIndex===6){assert.equal(validation.decision.buyerIntent,'privacy_transparency');assert.equal(validation.decision.answerMode,'grounded_answer');assert.match(validation.decision.sellerAnswer,/Employees join privately/);assert.equal(validation.decision.canonicalAction,'stay');assert.equal(validation.decision.provenance.urlFetched,false);assert.equal(JSON.stringify(validation.decision.provenance.knowledgeIds),JSON.stringify(validation.decision.groundedKnowledgeIds));}
  if(cycleIndex===8)assert.equal(navigation.currentScriptStepComplete,true);
  turnHistory.push(result.sellerTurn,result.buyerTurn);
 }
 assert.equal(decisionRequestCount,9,'one complete commercial decision is composed for each buyer response');assert.equal(buyerRequestCount,10,'only the buyer generation retry repeats; commercial decision does not');assert.equal(generationCalls.length,19);assert.equal(generationCalls.filter(call=>call.response_format?.json_schema?.name==='practice_commercial_turn_decision').length,9);assert.equal(generationCalls.some(call=>call.messages.some(message=>String(message.content).includes('answerAndNavigate'))),false);assert.equal(navigation.scriptStepId,'soft_close-1');
});
