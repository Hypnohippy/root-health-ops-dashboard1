import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const playbook=adaptive.parseSalesPlaybook(`# Northstar Practice Guide
## Opening
I'm trying to understand what you are doing around employee wellbeing, what is working, and where there may still be gaps.
## Discovery
Understand current provision.
Explore what is working.
Identify pressure on burnout and engagement.
Understand how effectiveness is measured.
Identify what should be prioritised.
## Positioning
Connect Root Health to the organisation's identified needs.
## Soft Close
Agree whether a short follow-up is the right next step.
## Objection Handling
### Capacity concern
Objection: We do not have capacity this quarter.
Approved response: We can identify a manageable first step.`);
function assertJsonEqual(actual,expected,message){assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);}
function decision(question,{stepId='opening-1',turnId='buyer-1',turnIds=[turnId],mode='canonical_prompt',answer='',control='',ids=[],action='stay',target=null,covered=[],assessment=covered.includes(stepId)?'covered':'not_covered',detour='none',detourTarget=null,answers=false,supported=false,risk='none'}={}){return {buyerIntent:flow.classifyPracticeQuestionIntent(question),buyerQuestionSummary:question.slice(0,180),answerMode:mode,groundedKnowledgeIds:ids,sellerAnswer:answer,sellerControlMove:control,currentObjective:{stepId,assessment},coveredObjectives:covered.map(id=>({stepId:id,evidenceTurnIds:turnIds})),canonicalAction:action,canonicalTargetStepId:target,detourAction:detour,detourTargetId:detourTarget,answersBuyerQuestion:answers,supportedBySelectedFacts:supported,irrelevantFactIds:[],unsupportedClaimRisk:risk,confidence:0.92};}
function validate(value,{question='The buyer has described their current process.',stepId='opening-1',turns=[{id:'seller-1',role:'seller',text:'We run a confidential support line.',finalized:true,integrity:'complete'},{id:'buyer-1',role:'buyer',text:question,finalized:true,integrity:'complete'}],items=[],snapshotVersion=null}={}){return flow.validatePracticeCommercialTurnDecision({value,playbook,currentStepId:stepId,buyerText:question,turns,items,snapshotVersion});}
function nav(stepId='opening-1'){const step=playbook.scriptSteps.find(item=>item.id===stepId);return {scriptStepId:stepId,currentScriptStepId:stepId,currentScriptSection:step.section,activeAdaptiveRoute:false,resumeScriptStepId:null};}

test('buyer classification separates questions, objections, acceptance, not-ready, rejection and ordinary responses',()=>{
 assert.equal(flow.classifyPracticeBuyerTurn('What kind of gaps do you usually find in companies?'),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn("I'm not sure how it works in practice; could you explain?"),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn("It sounds useful, but we don't have capacity this quarter."),'objection');
 assert.equal(flow.classifyPracticeBuyerTurn('We have support in place but cannot measure whether it is helping.'),'normal_response','an expressed measurement gap is not a refusal or objection to the proposal');
 assert.equal(flow.classifyPracticeBuyerTurn('The line is valued by employees who use it, but we cannot tell whether it is changing anything.'),'normal_response','a contrast clause describing an evidence gap is not objection evidence');
 assert.equal(flow.classifyPracticeBuyerTurn('That sounds good; let us set up a follow-up.'),'clear_acceptance');
 assert.equal(flow.classifyPracticeBuyerTurn('I need a little time to think about it.'),'not_ready');
 assert.equal(flow.classifyPracticeBuyerTurn('No thanks, we are not interested.'),'clear_rejection');
 assert.equal(flow.classifyPracticeBuyerTurn('The purpose makes sense.'),'normal_response');
});

test('Knowledge wording is accepted only as verified seller transcript context; unknown IDs fail closed',()=>{
 const context=flow.resolvePracticeBuyerSellerPromptContext({playbook,activeWordingId:'knowledge:root-local-item:item-007',currentScriptStepId:'discovery-1',sellerTurnText:'Leaders receive anonymous reporting.'});
 assert.equal(context.kind,'verified_seller_turn');assert.equal(context.id,'verified-seller-turn');assert.equal(context.section,'discovery');assert.equal(context.text,'Leaders receive anonymous reporting.');
 assert.equal(flow.resolvePracticeBuyerSellerPromptContext({playbook,activeWordingId:'invented-source',currentScriptStepId:'discovery-1',sellerTurnText:'Unverified wording.'}),null);
 assert.equal(flow.resolvePracticeBuyerSellerPromptContext({playbook,activeWordingId:'knowledge:item-7',currentScriptStepId:'missing',sellerTurnText:'Answer.'}),null);
});

test('one direct buyer question is answered in its turn decision while navigation stays application-owned',()=>{
 const question='How do you balance employee privacy with organisational transparency?',id='buyer-question',items=[{knowledgeId:'local:item-1',sourceSection:'Organisation Insights',category:'reporting_data',statement:'Anonymous participation provides organisational insight without exposing individual employee data.'}];
 const value=decision(question,{stepId:'discovery-1',turnId:id,mode:'grounded_answer',ids:['local:item-1'],answer:'Employees join privately and leaders receive anonymous workforce-level insight, not individual employee information.',control:'Would that balance fit the visibility you need?',answers:true,supported:true});
 const result=validate(value,{question,stepId:'discovery-1',turns:[{id,role:'buyer',text:question,finalized:true,integrity:'complete'}],items,snapshotVersion:'pinned-v1'});
 assert.ok(result.decision, result.reason);assert.equal(result.decision.canonicalAction,'stay');assert.equal(result.decision.detourAction,'none');assert.equal(result.decision.provenance.snapshotVersion,'pinned-v1');
 const applied=flow.applyPracticeCommercialTurnDecision({navigation:nav('discovery-1'),playbook,decision:result.decision,sequence:2});
 assert.equal(applied.navigation.scriptStepId,'discovery-1');assert.equal(applied.reason,'hold_current_objective');
});

test('structured semantic answer judgement is accepted only with mechanically valid, supplied Knowledge IDs',()=>{
 const question='How do you gather the ongoing data?',item={knowledgeId:'local:item-1',sourceSection:'Root Intelligence',category:'reporting_data',statement:'Repeated assessments, check-ins and participation build a baseline and ongoing workforce evidence.'},base=decision(question,{stepId:'discovery-1',mode:'grounded_answer',ids:[item.knowledgeId],answer:'Repeated assessments, check-ins and participation build a baseline and ongoing workforce evidence.',control:'Would that evidence help answer the questions you need to resolve?',answers:true,supported:true});
 assert.ok(validate(base,{question,stepId:'discovery-1',items:[item]}).decision);
 assert.equal(validate({...base,answersBuyerQuestion:false},{question,stepId:'discovery-1',items:[item]}).decision,null);
 assert.equal(validate({...base,supportedBySelectedFacts:false},{question,stepId:'discovery-1',items:[item]}).decision,null);
 assert.equal(validate({...base,irrelevantFactIds:['local:item-2']},{question,stepId:'discovery-1',items:[item]}).decision,null);
 assert.equal(validate({...base,groundedKnowledgeIds:['unknown:item']},{question,stepId:'discovery-1',items:[item]}).reason,'knowledge_reference_invalid');
 assert.equal(validate({...base,unsupportedClaimRisk:'high'},{question,stepId:'discovery-1',items:[item]}).decision,null);
});

test('unsupported question uses a grounded reframe with no citations and does not borrow playbook copy',()=>{
 const question='How is this different from what we already have?',value=decision(question,{stepId:'discovery-1',mode:'grounded_reframe',answer:'I cannot compare it with a system I have not seen, but we can clarify what you need it to do.',control:'Which gap would matter most to compare?',answers:true});
 const result=validate(value,{question,stepId:'discovery-1'});assert.ok(result.decision,result.reason);assert.equal(result.decision.provenance.sourceType,'safe_fallback');assertJsonEqual(result.decision.groundedKnowledgeIds,[]);assert.equal(result.decision.canonicalAction,'stay');
 const invalid=validate({...value,groundedKnowledgeIds:['invented']},{question,stepId:'discovery-1'});assert.equal(invalid.decision,null);
});

test('objective evidence must cite unique finalized conversation turns and the active objective',()=>{
 const question='We run an employee support line but cannot tell whether it helps.';
 const valid=decision(question,{stepId:'discovery-1',turnId:'buyer-1',turnIds:['buyer-1'],action:'advance',covered:['discovery-1']});
 assert.ok(validate(valid,{question,stepId:'discovery-1'}).decision);
 for(const turns of [[{id:'buyer-1',role:'buyer',text:question,finalized:false,integrity:'complete'}],[{id:'buyer-1',role:'buyer',text:question,finalized:true,integrity:'gap'}]])assert.equal(validate(valid,{question,stepId:'discovery-1',turns}).decision,null);
 assert.equal(validate({...valid,coveredObjectives:[{stepId:'discovery-1',evidenceTurnIds:['missing']}]},{question,stepId:'discovery-1'}).decision,null);
 assert.equal(validate({...valid,currentObjective:{stepId:'discovery-2',assessment:'covered'}},{question,stepId:'discovery-1'}).decision,null);
});

test('application accepts only playbook-defined forward targets and evidence-backed skips',()=>{
 const question='We currently offer confidential support but cannot measure its effect.';
 const evidence=[{id:'buyer-1',role:'buyer',text:question,finalized:true,integrity:'complete'}];
 const value=decision(question,{stepId:'discovery-1',turnId:'buyer-1',action:'advance',target:'discovery-2',covered:['discovery-1']});
 const validated=validate(value,{question,stepId:'discovery-1',turns:evidence});assert.ok(validated.decision,validated.reason);
 const moved=flow.applyPracticeCommercialTurnDecision({navigation:nav('discovery-1'),playbook,decision:validated.decision,sequence:4});assert.equal(moved.navigation.scriptStepId,'discovery-2');assert.equal(moved.navigation.visibleScriptText,playbook.scriptSteps.find(step=>step.id==='discovery-2').text);
 assert.equal(validate({...value,canonicalTargetStepId:'opening-1'},{question,stepId:'discovery-1',turns:evidence}).reason,'advance_target_not_next');
 const jump=decision(question,{stepId:'discovery-1',turnId:'buyer-1',turnIds:['buyer-1'],action:'advance_to',target:'discovery-3',covered:['discovery-1','discovery-2']});
 assert.ok(validate(jump,{question,stepId:'discovery-1',turns:evidence}).decision,'skipping is permitted only when every skipped objective has cited complete evidence');
 assert.equal(validate({...jump,coveredObjectives:[jump.coveredObjectives[0]]},{question,stepId:'discovery-1',turns:evidence}).reason,'skipped_objective_not_evidence_covered');
 assert.equal(validate({...value,canonicalAction:'advance',canonicalTargetStepId:null},{question,stepId:'discovery-1',turns:evidence}).decision.canonicalTargetStepId,null,'the app derives the exact next uploaded-playbook step for advance');
});

test('a genuine objection uses only its exact approved branch and then resumes the saved canonical objective',()=>{
 const objection='We do not have capacity this quarter.',question='The approved response is one manageable first step.';
 const objectionValue=decision(objection,{stepId:'discovery-2',turnId:'buyer-objection',mode:'objection_response',answer:'We can identify a manageable first step.',control:'If that addressed the concern, would it be worth moving to the next step?',detour:'answer_and_return',detourTarget:'capacity-concern',answers:true});
 // The parser supplies a stable branch id derived from its uploaded heading.
 const branch=playbook.objectionBranches[0];objectionValue.detourTargetId=branch.id;
 objectionValue.sellerAnswer=branch.response;
 const first=validate(objectionValue,{question:objection,stepId:'discovery-2',turns:[{id:'buyer-objection',role:'buyer',text:objection,finalized:true,integrity:'complete'}]});
 assert.ok(first.decision,first.reason);assert.equal(first.decision.groundedKnowledgeIds.length,0);assert.equal(first.decision.canonicalAction,'stay');
 const detour=flow.applyPracticeCommercialTurnDecision({navigation:nav('discovery-2'),playbook,decision:first.decision,sequence:4});assert.equal(detour.navigation.activeAdaptiveRoute,true);assert.equal(detour.navigation.resumeScriptStepId,'discovery-2');assert.equal(detour.navigation.approvedScriptBranchId,branch.id);
 const buyerAfter='A manageable first step sounds possible; let us look at what is already in place.';
 const returnValue=decision(buyerAfter,{stepId:'discovery-2',turnId:'buyer-after',action:'advance',target:'discovery-3',covered:['discovery-2']});
 const returnDecision=validate(returnValue,{question:buyerAfter,stepId:'discovery-2',turns:[{id:'buyer-after',role:'buyer',text:buyerAfter,finalized:true,integrity:'complete'}]});assert.ok(returnDecision.decision,returnDecision.reason);
 const resumed=flow.applyPracticeCommercialTurnDecision({navigation:detour.navigation,playbook,decision:returnDecision.decision,sequence:6});assert.equal(resumed.navigation.scriptStepId,'discovery-3');assert.equal(resumed.navigation.activeAdaptiveRoute,false);assert.equal(resumed.navigation.resumeScriptStepId,null);
 const invented={...objectionValue,detourTargetId:'invented-branch',sellerAnswer:'We guarantee a result.',canonicalAction:'stay'};assert.equal(validate(invented,{question:objection,stepId:'discovery-2',turns:[{id:'buyer-objection',role:'buyer',text:objection,finalized:true,integrity:'complete'}]}).decision,null);
});

test('arbitrary uploaded playbooks advance by their own objective IDs without Root-specific step assumptions',()=>{
 const arbitrary=adaptive.parseSalesPlaybook(`# Acme Guide\n## Opening\nAsk about their current workflow.\n## Discovery\nUnderstand the present process.\nExplore what works and what does not.\n## Positioning\nConnect the workflow to the need they described.\n## Soft Close\nAgree whether to take a follow-up.`),steps=arbitrary.scriptSteps;
 assertJsonEqual(steps.map(step=>step.id),['opening-1','discovery-1','discovery-2','positioning-1','soft_close-1']);
 let navigation=navFor(steps[0],arbitrary);
 for(let i=0;i<2;i++){const question=`Buyer evidence ${i+1} establishes ${steps[i].section}.`,turnId=`buyer-${i+1}`,value=decision(question,{stepId:steps[i].id,turnId,action:'advance',target:steps[i+1].id,covered:[steps[i].id]}),checked=flow.validatePracticeCommercialTurnDecision({value,playbook:arbitrary,currentStepId:steps[i].id,buyerText:question,turns:[{id:turnId,role:'buyer',text:question,finalized:true,integrity:'complete'}],items:[],snapshotVersion:null});assert.ok(checked.decision,checked.reason);navigation=flow.applyPracticeCommercialTurnDecision({navigation,playbook:arbitrary,decision:checked.decision,sequence:i+1}).navigation;assert.equal(navigation.scriptStepId,steps[i+1].id);}
});
function navFor(step,book){return {scriptStepId:step.id,currentScriptStepId:step.id,currentScriptSection:step.section,activeAdaptiveRoute:false,resumeScriptStepId:null};}

test('terminal outcomes are explicit and only the final soft-close is terminal',()=>{
 assert.equal(flow.practiceTerminalOutcome('clear_acceptance'),'interested_follow_up');assert.equal(flow.practiceTerminalOutcome('not_ready'),'not_ready');assert.equal(flow.practiceTerminalOutcome('normal_response'),null);assert.equal(flow.practiceTerminalOutcome('clear_rejection'),'declined');assert.equal(flow.practiceTerminalOutcome('objection'),null);assert.equal(flow.practiceTerminalOutcome('direct_question'),null);
 assert.equal(flow.isPracticeSoftCloseTerminalStep(playbook.scriptSteps.at(-1),playbook.scriptSteps),true);assert.equal(flow.isPracticeSoftCloseTerminalStep(playbook.scriptSteps.find(step=>step.id==='discovery-1'),playbook.scriptSteps),false);
});

test('Alex output style is a soft target while empty, oversized, and role-labelled turns fail closed',()=>{
 const short=flow.assessPracticeBuyerOutput('Yes, that is clear.');assert.equal(short.accepted,true);assert.ok(short.qualityNotes.includes('word_count_outside_target'));
 assert.equal(flow.assessPracticeBuyerOutput('').rejectionReason,'empty_output');assert.equal(flow.assessPracticeBuyerOutput('x'.repeat(1201)).rejectionReason,'text_too_long');assert.equal(flow.assessPracticeBuyerOutput('Seller: please continue.').rejectionReason,'role_mismatch');
});

test('Alex prompt answers a seller control move first and does not navigate',()=>{
 assert.match(flow.PRACTICE_BUYER_RESPONSE_INSTRUCTIONS,/answer that question first/i);assert.match(flow.PRACTICE_BUYER_RESPONSE_INSTRUCTIONS,/Do not ask a new product question after every seller turn/i);assert.match(flow.PRACTICE_BUYER_RESPONSE_INSTRUCTIONS,/do not move the script/i);
});

test('latency summary reports per-turn median and p95 from supplied timestamps only',()=>{
 const result=flow.summarizePracticeLatency([{turnOrder:1,latencyStage:'last_seller_speech_activity',at:0},{turnOrder:1,latencyStage:'silence_threshold_reached',at:100},{turnOrder:1,latencyStage:'settle_window_completed',at:200},{turnOrder:1,latencyStage:'final_required_packet_available',at:250},{turnOrder:1,latencyStage:'seller_turn_assembled',at:280},{turnOrder:1,latencyStage:'seller_integrity_validated',at:300},{turnOrder:2,latencyStage:'last_seller_speech_activity',at:0},{turnOrder:2,latencyStage:'silence_threshold_reached',at:300},{turnOrder:2,latencyStage:'settle_window_completed',at:400},{turnOrder:2,latencyStage:'final_required_packet_available',at:470},{turnOrder:2,latencyStage:'seller_turn_assembled',at:510},{turnOrder:2,latencyStage:'seller_integrity_validated',at:550}]);
 assert.equal(result.speechToEndpointMs.sampleCount,2);assert.equal(result.speechToEndpointMs.medianMs,200);assert.equal(result.speechToEndpointMs.p95Ms,300);assert.equal(result.sellerValidationMs.medianMs,30);assert.equal(result.sellerValidationMs.p95Ms,40);
});
