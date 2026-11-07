import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const playbook=adaptive.parseSalesPlaybook(`# Northstar Practice Guide
## Opening
Set a clear purpose for this conversation.
## Discovery
Explore the gaps between the support employees need and the support they can currently access.
## Positioning
Root Health helps organisations understand wellbeing more continuously and see where support may be needed.
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

test('question bridge selects exact source-backed script sentences and preserves the suspended step',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'What kind of gaps do you usually find in companies?',playbook,currentScriptStepId:'discovery-1',buyerTurnId:'buyer-4'});
 assert.equal(bridge.questionBridgeActive,true);
 assert.equal(bridge.currentScriptStepId,'discovery-1');
 assert.equal(bridge.suspendedScriptStepId,'discovery-1');
 assert.equal(bridge.questionResolutionState,'awaiting_seller');
 assert.equal(bridge.sourceType,'playbook_step');
 assert.equal(bridge.sourceId,'discovery-1');
 assert.match(bridge.supportingText,/gaps/i);
 assert.match(bridge.approvedQuestionResponse,/approved script/i);
});

test('positioning question can use the playbook close wording as a short practical answer',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'How exactly does it work in practice?',playbook,currentScriptStepId:'positioning-1',buyerTurnId:'buyer-8'});
 assert.equal(bridge.sourceType,'playbook_step');
 assert.equal(bridge.sourceId,'soft_close-1');
 assert.match(bridge.supportingText,/show you how it works/i);
});

test('soft-close clarification becomes a question bridge and keeps the terminal step suspended',()=>{
 const original=flow.createPracticeQuestionBridge({question:'What would that follow-up look like?',playbook,currentScriptStepId:'soft_close-1',buyerTurnId:'buyer-10'});
 const next=flow.createPracticeQuestionBridge({question:'How long would the conversation be?',playbook,currentScriptStepId:'soft_close-1',existingBridge:original,buyerTurnId:'buyer-12'});
 assert.equal(original.sourceId,'soft_close-1');
 assert.equal(original.suspendedScriptStepId,'soft_close-1');
 assert.equal(next.suspendedScriptStepId,'soft_close-1');
 assert.equal(next.currentScriptStepId,'soft_close-1');
 assert.equal(next.questionResolutionState,'awaiting_seller');
});

test('unsupported question uses a safe non-claiming answer rather than inventing facts',()=>{
 const bridge=flow.createPracticeQuestionBridge({question:'Can you guarantee results for every organisation?',playbook,currentScriptStepId:'positioning-1',buyerTurnId:'buyer-9'});
 assert.equal(bridge.sourceType,'safe_fallback');
 assert.equal(bridge.sourceId,null);
 assert.equal(bridge.supportingText,null);
 assert.match(bridge.approvedQuestionResponse,/don't want to guess/i);
 assert.doesNotMatch(bridge.approvedQuestionResponse,/guarantee|pricing|integration|customer/i);
});

test('terminal outcomes are explicit and objections remain on the separate objection route',()=>{
 assert.equal(flow.practiceTerminalOutcome('clear_acceptance'),'interested_follow_up');
 assert.equal(flow.practiceTerminalOutcome('not_ready'),'not_ready');
 assert.equal(flow.practiceTerminalOutcome('normal_response'),null);
 assert.equal(flow.practiceTerminalOutcome('clear_rejection'),'declined');
 assert.equal(flow.practiceTerminalOutcome('objection'),null);
 assert.equal(flow.practiceTerminalOutcome('direct_question'),null);
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
