import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const playbook=adaptive.parseSalesPlaybook(`# Northstar Practice Guide
## Opening
I'm trying to understand what you are doing around employee wellbeing, what is working, and where there may still be gaps.
## Discovery
Explore the gaps between the support employees need and the support they can currently access.
The gaps can include stress, burnout, absence, manager strain, low engagement, and underused support or resources.
## Positioning
Root Health is designed to help organisations understand wellbeing more continuously, rather than relying only on occasional surveys or one-off initiatives.
It gives employees something useful day to day, while giving the organisation a clearer view of where support may be needed.
## Approved Claims
A follow-up can focus on one specific question or area the buyer wants to explore and what would be useful to them.
## Soft Close
If this looks relevant, the sensible next step would be a short follow-up where I can show you how it works and we can decide whether it is worth exploring properly.
## Objection Handling
### Capacity concern
Objection: We do not have capacity this quarter.
Approved response: We can identify a manageable first step.`);

test('buyer question, objection, acceptance, not-ready, rejection, and normal response are distinct',()=>{
 assert.equal(flow.classifyPracticeBuyerTurn('What kind of gaps do you usually find in companies?'),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn('How exactly does it work in practice?'),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn('There is no capacity this quarter.'),'objection');
 assert.equal(flow.classifyPracticeBuyerTurn('That sounds good; let us set up a follow-up.'),'clear_acceptance');
 assert.equal(flow.classifyPracticeBuyerTurn('I need a little time to think about it.'),'not_ready');
 assert.equal(flow.classifyPracticeBuyerTurn('No thanks, we are not interested.'),'clear_rejection');
 assert.equal(flow.classifyPracticeBuyerTurn('The purpose makes sense.'),'normal_response');
});

test('question classifier gives a genuine direct clarification priority over a mild objection cue',()=>{
 assert.equal(flow.classifyPracticeBuyerTurn("I'm not sure how it works in practice; could you explain?"),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn("It sounds useful, but we don't have capacity this quarter."),'objection');
});

test('gap question rejects the opening paraphrase and selects a grounded category list from anywhere in the playbook',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'What kind of gaps are you thinking about?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-4'});
 assert.equal(bridge.questionBridgeActive,true);
 assert.equal(bridge.currentScriptStepId,'opening-1');
 assert.equal(bridge.suspendedScriptStepId,'opening-1');
 assert.equal(bridge.questionResolutionState,'awaiting_seller');
 assert.equal(bridge.sourceId,'discovery-1');
 assert.ok(bridge.sourceIds.includes('discovery-2'),'the composed answer cites the category detail step');
 assert.equal(bridge.sourceType,'playbook_step');
 assert.match(bridge.supportingText,/stress, burnout, absence, manager strain/i);
 assert.match(bridge.approvedQuestionResponse,/stress, burnout, absence, manager strain/i);
 assert.doesNotMatch(bridge.approvedQuestionResponse,/trying to understand what you are doing/i);
});

test('solution question uses grounded Root capabilities rather than inventing interventions',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'What kind of solutions do you typically recommend for these gaps?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-solutions'});
 assert.equal(bridge.sourceId,'positioning-1');
 assert.match(bridge.supportingText,/understand wellbeing more continuously/i);
 assert.match(bridge.approvedQuestionResponse,/occasional surveys or one-off initiatives/i);
 assert.doesNotMatch(bridge.approvedQuestionResponse,/recommend an intervention|guarantee|treatment/i);
});

test('positioning question can use the playbook close wording as a short practical answer',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'How exactly does it work in practice?',playbook,currentScriptStepId:'positioning-1',buyerTurnId:'buyer-8'});
 assert.equal(bridge.sourceType,'playbook_step');
 assert.equal(bridge.sourceId,'positioning-2');
 assert.match(bridge.supportingText,/employees something useful day to day/i);
});

test('soft-close clarification uses distinct approved detail and keeps the terminal step suspended',()=>{
 const original=flow.createPracticeQuestionBridge({question:'What would that follow-up look like?',playbook,currentScriptStepId:'soft_close-1',buyerTurnId:'buyer-10'});
 const afterSeller=flow.markPracticeQuestionBridgeAnswerSubmitted(original);
 const next=flow.createPracticeQuestionBridge({question:'How does that work for employees day to day?',playbook,currentScriptStepId:'soft_close-1',existingBridge:afterSeller,buyerTurnId:'buyer-12',previousSellerText:original.approvedQuestionResponse});
 assert.equal(original.sourceType,'approved_claim');
 assert.equal(original.suspendedScriptStepId,'soft_close-1');
 assert.equal(next.bridgeId,original.bridgeId);
 assert.equal(next.originalQuestion,original.originalQuestion);
 assert.equal(next.latestQuestion,'How does that work for employees day to day?');
 assert.equal(next.suspendedScriptStepId,'soft_close-1');
 assert.equal(next.currentScriptStepId,'soft_close-1');
 assert.equal(next.questionResolutionState,'awaiting_seller');
 assert.equal(next.bridgeTurnCount,2);
 assert.equal(next.answerHistory.length,1);
 assert.notEqual(next.sourceId,original.sourceId);
 assert.notEqual(next.approvedQuestionResponse,original.approvedQuestionResponse);
});

test('a seller-delivered answer cannot be selected again as a bridge source',()=>{
 const first=flow.createPracticeQuestionBridge({question:'What kind of gaps are you thinking about?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-gap'});
 const active=flow.markPracticeQuestionBridgeAnswerSubmitted(first);
 const followUp=flow.createPracticeQuestionBridge({question:'What examples do you mean?',playbook,currentScriptStepId:'opening-1',existingBridge:active,buyerTurnId:'buyer-gap-followup',previousSellerText:first.approvedQuestionResponse});
 assert.notEqual(followUp.sourceId,first.sourceId);
 assert.notEqual(followUp.supportingText,first.supportingText);
 assert.equal(followUp.answerHistory.length,1);
});

test('same-step wording is rejected when it repeats the seller turn without adding an answer',()=>{
 const repeatedPlaybook=adaptive.parseSalesPlaybook(`# Repetition Guide
## Opening
Set a clear purpose for the call.
## Discovery
Common bottlenecks include approvals, handoffs, and delayed updates.`);
 const delivered=repeatedPlaybook.scriptSteps.find(step=>step.id==='discovery-1').text;
 const bridge=flow.createPracticeQuestionBridge({question:'What bottlenecks do you mean?',playbook:repeatedPlaybook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-repeat',previousSellerText:delivered});
 assert.equal(bridge.sourceType,'safe_fallback');
 assert.equal(bridge.resolutionState,'exhausted');
 assert.match(bridge.approvedQuestionResponse,/don.t want to guess/i);
});

test('unsupported questions fail safely and the same bridge is bounded after the fallback is delivered',()=>{
 const first=flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'positioning-1',buyerTurnId:'buyer-9'});
 assert.equal(first.sourceType,'safe_fallback');
 assert.equal(first.resolutionState,'exhausted');
 assert.equal(first.fallbackDelivered,false);
 const delivered=flow.markPracticeQuestionBridgeAnswerSubmitted(first);
 assert.equal(delivered.fallbackDelivered,true);
 assert.equal(delivered.resolutionState,'exhausted');
 assert.equal(delivered.bridgeId,first.bridgeId);
 assert.equal(flow.canContinuePracticeQuestionBridge(delivered),false,'a delivered non-claiming fallback closes the bounded detour');
});

test('unsupported direct question after a delivered fallback enters visible recovery without repeating fallback or opening a nested bridge',()=>{
 const first=flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-guarantee'});
 const delivered=flow.markPracticeQuestionBridgeAnswerSubmitted(first);
 const recovery=flow.createPracticeQuestionRecovery(delivered,'Could you prescribe a treatment for that?');
 assert.equal(recovery.bridgeId,first.bridgeId);
 assert.equal(recovery.suspendedScriptStepId,'opening-1');
 assert.equal(recovery.latestQuestion,'Could you prescribe a treatment for that?');
 assert.equal(recovery.recoveryRequired,true);
 assert.equal(recovery.fallbackDelivered,true);
 assert.equal(recovery.sourceType,'safe_fallback');
 assert.notEqual(recovery.approvedQuestionResponse,first.approvedQuestionResponse,'recovery is a distinct handoff instruction, not a repeated answer');
 assert.match(recovery.approvedQuestionResponse,/which part would be most useful to explore first|what would be most useful for you to understand first/i);
 assert.doesNotMatch(recovery.approvedQuestionResponse,/David|ask David|pause here/i);
 assert.equal(flow.canContinuePracticeQuestionBridge(recovery),false);
});

test('a supported direct question after a closed bridge starts as a separate question rather than nesting under the old id',()=>{
 const completed=flow.markPracticeQuestionBridgeAnswerSubmitted(flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-guarantee'}));
 const independent=flow.createPracticeQuestionBridge({question:'What kind of gaps are you thinking about?',playbook,currentScriptStepId:'opening-1',existingBridge:null,buyerTurnId:'buyer-new-question'});
 assert.notEqual(independent.bridgeId,completed.bridgeId);
 assert.equal(independent.originalQuestion,'What kind of gaps are you thinking about?');
 assert.equal(independent.bridgeTurnCount,1);
 assert.equal(independent.sourceId,'discovery-1');
 assert.ok(independent.sourceIds.includes('discovery-2'));
});

test('bridge answers are bounded and exhaustion emits one final non-claiming fallback',()=>{
 const first=flow.createPracticeQuestionBridge({question:'What kind of gaps are you thinking about?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'bridge-limit-1'});
 const second=flow.createPracticeQuestionBridge({question:'What solutions do you recommend?',playbook,currentScriptStepId:'opening-1',existingBridge:flow.markPracticeQuestionBridgeAnswerSubmitted(first),buyerTurnId:'bridge-limit-2'});
 const third=flow.createPracticeQuestionBridge({question:'How does it work day to day?',playbook,currentScriptStepId:'opening-1',existingBridge:flow.markPracticeQuestionBridgeAnswerSubmitted(second),buyerTurnId:'bridge-limit-3'});
 assert.equal(third.bridgeTurnCount,3);
 assert.equal(third.resolutionState,'exhausted');
 assert.equal(third.sourceType,'playbook_step');
 const finalFallback=flow.createPracticeQuestionBridge({question:'What else can you recommend?',playbook,currentScriptStepId:'opening-1',existingBridge:flow.markPracticeQuestionBridgeAnswerSubmitted(third),buyerTurnId:'bridge-limit-4'});
 assert.equal(finalFallback.bridgeId,first.bridgeId);
 assert.equal(finalFallback.suspendedScriptStepId,'opening-1');
 assert.equal(finalFallback.sourceType,'safe_fallback');
 assert.match(finalFallback.approvedQuestionResponse,/don.t want to guess/i);
 assert.equal(flow.canContinuePracticeQuestionBridge(flow.markPracticeQuestionBridgeAnswerSubmitted(finalFallback)),false);
});

test('arbitrary uploaded playbooks answer a category question without Root-specific runtime assumptions',()=>{
 const arbitrary=adaptive.parseSalesPlaybook(`# Acme Guide
## Opening
Let's understand the current process.
## Discovery
Common bottlenecks include approvals, handoffs, duplicated entry, and delayed updates.
## Solution
The workflow brings approvals and handoffs into one shared view.`);
 const bridge=flow.createPracticeQuestionBridge({question:'What kinds of bottlenecks do teams face?',playbook:arbitrary,currentScriptStepId:'opening-1',buyerTurnId:'buyer-generic'});
 assert.equal(bridge.sourceId,'discovery-1');
 assert.match(bridge.supportingText,/approvals, handoffs, duplicated entry/i);
});

test('a relevant composed answer can join adjacent approved facts and records every supporting playbook id',()=>{
 const composition=adaptive.parseSalesPlaybook(`# Field Guide
## Opening
Set a clear purpose.
## Positioning
The approach is designed to help teams understand patterns over time.
It provides managers with a clearer view of employee support needs.
## Soft Close
Agree a useful next step.`);
 const bridge=flow.createPracticeQuestionBridge({question:'What solutions do you recommend?',playbook:composition,currentScriptStepId:'opening-1',buyerTurnId:'buyer-composed'});
 assert.deepEqual([...bridge.sourceIds],['positioning-1','positioning-2']);
 assert.match(bridge.supportingText,/patterns over time.*provides managers/i);
 assert.match(bridge.approvedQuestionResponse,/patterns over time.*provides managers/i);
});

test('unsupported question uses a safe non-claiming answer rather than inventing facts',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'positioning-1',buyerTurnId:'buyer-9'});
 assert.equal(bridge.sourceType,'safe_fallback');
 assert.equal(bridge.sourceId,null);
 assert.equal(bridge.supportingText,null);
 assert.match(bridge.approvedQuestionResponse,/don.t want to guess/i);
 assert.doesNotMatch(bridge.approvedQuestionResponse,/guarantee|pricing|integration|customer/i);
});

test('terminal outcomes are explicit and objections remain on the separate objection route',()=>{
 assert.equal(flow.practiceTerminalOutcome('clear_acceptance'),'interested_follow_up');
 assert.equal(flow.practiceTerminalOutcome('not_ready'),'not_ready');
 assert.equal(flow.practiceTerminalOutcome('normal_response'),null);
 assert.equal(flow.practiceTerminalOutcome('clear_rejection'),'declined');
 assert.equal(flow.practiceTerminalOutcome('objection'),null);
 assert.equal(flow.practiceTerminalOutcome('direct_question'),null);
 assert.equal(flow.classifyPracticeBuyerTurn('We do not have capacity this quarter, so how would you handle that?'),'objection','a concrete objection takes precedence over its question form');
 assert.equal(flow.practiceTerminalOutcomeLabel('interested_follow_up'),'Practice complete — buyer interested in follow-up.');
 assert.equal(flow.practiceTerminalOutcomeLabel('not_ready'),'Practice complete — buyer not ready.');
 assert.equal(flow.practiceTerminalOutcomeLabel('declined'),'Practice complete — buyer declined.');
});

test('only the final soft-close section is a scripted terminal; short discovery playbooks remain navigable',()=>{
 const discoveryOnly=[{id:'opening-1',section:'opening',text:'Open.'},{id:'discovery-1',section:'discovery',text:'Ask.'}];
 const softClose=[...discoveryOnly,{id:'soft_close-1',section:'soft_close',text:'Suggest a follow-up.'}];
 assert.equal(flow.isPracticeSoftCloseTerminalStep(discoveryOnly.at(-1),discoveryOnly),false);
 assert.equal(flow.isPracticeSoftCloseTerminalStep(softClose.at(-1),softClose),true);
 assert.equal(flow.isPracticeSoftCloseTerminalStep(softClose[1],softClose),false);
});

test('bridge-delivered source-backed discovery content records provenance and skips only that covered step',()=>{
 const step=playbook.scriptSteps.find(item=>item.id==='discovery-1'),support=step.text;
 const bridge={id:'bridge-coverage',bridgeId:'bridge-coverage',currentScriptStepId:'opening-1',questionBridgeActive:true,suspendedScriptStepId:'opening-1',originalQuestion:'What is the current approach?',latestQuestion:'What is the current approach?',answerHistory:[],bridgeTurnCount:1,resolutionState:'active',fallbackDelivered:false,questionSummary:'current approach',approvedQuestionResponse:support,questionResolutionState:'awaiting_seller',sourceType:'playbook_step',sourceId:step.id,sourceIds:[step.id],supportingText:support};
 const sellerTurn={id:'seller-bridge-answer',text:`${support} We should be clear about the gap between what people need and what they can access.`};
 const records=flow.assessPracticeBridgeCoverage(playbook,bridge,sellerTurn);
 assert.equal(records.length,1);
 assert.equal(records[0].stepId,'discovery-1');
 assert.equal(records[0].status,'explicitly_delivered');
 assert.equal(records[0].sellerTurnId,sellerTurn.id);
 assert.equal(records[0].bridgeOrRouteId,bridge.bridgeId);
 assert.ok(records[0].sourceIds.includes('discovery-1'));
 assert.match(records[0].reason,/source_backed_script_objective/);
 const navigation={routeDirection:'advance',activeAdaptiveRoute:false,approvedScriptBranchId:null,scriptStepId:'discovery-1',currentScriptStepId:'discovery-1',currentScriptSection:'discovery',recommendedScriptSection:'discovery',nextSequentialScriptStepId:'discovery-2',visibleScriptText:step.text,staySilent:false,currentScriptStepStatus:'not_started',currentScriptStepWasSpoken:false,currentScriptStepComplete:false};
 const skipped=flow.skipCoveredPracticeSteps(navigation,playbook,{ 'discovery-1':records[0] });
 assert.equal(skipped.skipped.map(item=>item.stepId).join(','),'discovery-1');
 assert.equal(skipped.navigation.scriptStepId,'discovery-2');
 assert.equal(skipped.allRemainingCovered,false);
});

test('unrelated, partial, and objection-route evidence cannot skip canonical script wording',()=>{
 const navigation={routeDirection:'advance',activeAdaptiveRoute:false,approvedScriptBranchId:null,scriptStepId:'discovery-1',currentScriptStepId:'discovery-1',currentScriptSection:'discovery',recommendedScriptSection:'discovery',nextSequentialScriptStepId:'discovery-2',visibleScriptText:'Explore the current approach.',staySilent:false,currentScriptStepStatus:'not_started',currentScriptStepWasSpoken:false,currentScriptStepComplete:false};
 const coverage={ 'discovery-1':{stepId:'discovery-1',status:'partially_covered',sellerTurnId:'seller-1',sourceIds:['discovery-1'],bridgeOrRouteId:'bridge-1',reason:'partial',evidenceText:'We do some wellbeing work.',confidence:0.3} };
 assert.equal(flow.skipCoveredPracticeSteps(navigation,playbook,coverage).skipped.length,0,'partial coverage remains available to the seller');
 const unrelated={...coverage['discovery-1'],status:'covered',stepId:'positioning-1',sourceIds:['positioning-1']};
 assert.equal(flow.skipCoveredPracticeSteps(navigation,playbook,{'positioning-1':unrelated}).skipped.length,0,'an unrelated covered step does not skip discovery');
 assert.equal(flow.assessPracticeScriptCoverage({step:playbook.scriptSteps.find(item=>item.id==='discovery-1'),sourceIds:['1-capacity-concern'],supportingText:'We can identify a manageable first step.',sellerTurn:{id:'seller-objection',text:'We can identify a manageable first step.'},bridgeOrRouteId:'1-capacity-concern'}),null,'objection wording without explicit discovery-step provenance cannot mark discovery covered');
 assert.equal(flow.assessPracticeBridgeCoverage(playbook,{...flow.createPracticeQuestionBridge({question:'Can you guarantee results?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-fallback'}),sourceType:'safe_fallback',sourceIds:[],supportingText:null},{id:'seller-safe-boundary',text:'I do not want to guess.'}).length,0,'safe fallback carries no script coverage authority');
});

test('recovery always supplies self-sufficient spoken wording and a normal buyer reply can return to the conversation',()=>{
 const unsupported=flow.markPracticeQuestionBridgeAnswerSubmitted(flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'opening-1',buyerTurnId:'buyer-recovery'}));
 const recovery=flow.createPracticeQuestionRecovery(unsupported,'Could you prescribe a treatment for that?');
 assert.ok(recovery.approvedQuestionResponse.trim().length>20);
 assert.match(recovery.approvedQuestionResponse,/I don’t want to guess|I’d rather give you|I can’t answer that accurately/);
 assert.doesNotMatch(recovery.approvedQuestionResponse,/David|ask David|clarify with David|pause here/i);
 const afterDelivery=flow.markPracticeQuestionBridgeAnswerSubmitted(recovery);
 assert.equal(afterDelivery.questionResolutionState,'awaiting_buyer');
 assert.equal(flow.classifyPracticeBuyerTurn('That is fair; what can you tell me about the current approach?'),'direct_question');
 assert.equal(flow.classifyPracticeBuyerTurn('I understand. We currently use a quarterly survey.'),'normal_response','a normal reply leaves the unsupported loop and can resume canonical navigation');
});

test('synthetic buyer text is concise by default; longer output needs an explicit scenario need',()=>{
 assert.equal(flow.practiceBuyerResponseWithinDefaultBudget('We use annual surveys. What do employees find most useful?'),true);
 assert.equal(flow.practiceBuyerResponseWithinDefaultBudget('We use annual surveys. Our managers also check in. I am unsure what else is available. What would you recommend?'),false);
 assert.equal(flow.practiceBuyerResponseWithinDefaultBudget('x'.repeat(600)),false);
 assert.equal(flow.practiceBuyerResponseWithinDefaultBudget('We have several teams and different support needs. Our current process combines surveys and manager conversations. We need a clear view across those sources. Could you show how the evidence is organised?',true),true,'an explicit scenario need permits a bounded longer reply');
 assert.equal(flow.practiceBuyerResponseWithinDefaultBudget('x'.repeat(1300),true),false,'even an explicit scenario need remains bounded');
});

test('Practice latency summary reports per-cycle median and p95 without inventing live samples',()=>{
 const stages=['last_seller_speech_activity','silence_threshold_reached','settle_window_completed','final_required_packet_available','seller_turn_assembled','seller_integrity_validated','buyer_generation_started','buyer_generation_completed','buyer_turn_finalized','buyer_audio_started','buyer_audio_completed','practice_handover_complete','seller_listening_resumed','next_wording_first_visible'];
 const rows=[];for(let turnOrder=1;turnOrder<=3;turnOrder++){let at=turnOrder*10000;for(const latencyStage of stages){rows.push({turnOrder,latencyStage,at});at+=turnOrder*10;}}
 const result=flow.summarizePracticeLatency(rows);
 assert.equal(result.speechToEndpointMs.sampleCount,3);
 assert.equal(result.speechToEndpointMs.medianMs,20);
 assert.equal(result.speechToEndpointMs.p95Ms,30);
 assert.equal(result.buyerEndToHandoverCompleteMs.medianMs,20);
 assert.equal(flow.summarizePracticeLatency([]).buyerGenerationMs.medianMs,null,'no live latency claim is emitted without samples');
});
