import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const manual=loadMeeting('lib/meetingPracticeManualAdvance.ts');
const adaptive=loadMeeting('lib/meetingAdaptiveCoach.ts');
const flow=loadMeeting('lib/meetingPracticeFlow.ts');
const playbook=adaptive.parseSalesPlaybook('# Practice\n## Opening\nSet the purpose.\n## Discovery\nAsk about current support.\n## Discovery\nAsk what is not working.\n## Discovery\nAsk who owns the decision.\n## Soft Close\nAgree the next step.');
const navFor=(stepId,patch={})=>{const step=playbook.scriptSteps.find(item=>item.id===stepId);return {selectedSalesMode:'scripted',playbookLoaded:true,currentScriptSection:step?.section||'discovery',previousScriptSection:null,previousScriptStepId:null,recommendedScriptSection:step?.section||'discovery',routeDirection:'stay',routeReason:'waiting',buyerIntent:'preserve only the transcript history',buyingSignalStrength:'weak',activeObjectionOrConfusion:'prior detour',readinessToClose:'ready',approvedScriptBranchId:'objection-eap',approvedScriptClaimId:'claim-1',currentScriptStepId:stepId,scriptStepId:stepId,visibleScriptText:step?.text||'',staySilent:true,currentScriptStepStatus:'answered',currentScriptStepWasSpoken:true,currentScriptStepComplete:true,nextSequentialScriptStepId:playbook.scriptSteps[playbook.scriptSteps.findIndex(item=>item.id===stepId)+1]?.id||null,adaptiveOverride:true,activeAdaptiveRoute:false,resumeScriptSection:'discovery',resumeScriptStepId:'discovery-2',deliveryEvidenceSequence:7,sequence:7,...patch};};
const baseInput=(navigation,more={})=>({active:true,terminal:false,navigation,playbook,questionDetour:null,...more});
const key=(patch={})=>({code:'Space',repeat:false,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,isComposing:false,keyCode:32,defaultPrevented:false,target:{tagName:'BODY',closest:()=>null},...patch});

test('normal Space advance selects exactly the next uploaded canonical step and its approved wording',()=>{
 const result=manual.resolveManualPracticeAdvance(baseInput(navFor('opening-1')));
 assert.equal(result.status,'advance');assert.equal(result.fromStepId,'opening-1');assert.equal(result.targetStepId,'discovery-1');assert.equal(result.targetText,playbook.scriptSteps[1].text);assert.equal(result.navigation.routeDirection,'advance');assert.equal(result.navigation.currentScriptStepStatus,'not_started');
});

test('question detour advances from its saved canonical position, not the bridge',()=>{
 const navigation=navFor('opening-1'),result=manual.resolveManualPracticeAdvance(baseInput(navigation,{questionDetour:{suspendedScriptStepId:'discovery-2'}}));
 assert.equal(result.status,'advance');assert.equal(result.fromStepId,'discovery-2');assert.equal(result.targetStepId,'discovery-3');assert.equal(result.detour,'question');
});

test('objection/recovery detour advances once from the saved canonical resume position',()=>{
 const navigation=navFor('objection-eap',{activeAdaptiveRoute:true,resumeScriptStepId:'discovery-2'}),result=manual.resolveManualPracticeAdvance(baseInput(navigation));
 assert.equal(result.status,'advance');assert.equal(result.fromStepId,'discovery-2');assert.equal(result.targetStepId,'discovery-3');assert.equal(result.detour,'adaptive');assert.equal(result.navigation.previousScriptStepId,'discovery-2');
});

test('manual transition clears temporary bridge, branch, claim, recovery and stale delivery state',()=>{
 const navigation=navFor('objection-eap',{activeAdaptiveRoute:true,resumeScriptStepId:'discovery-2'}),result=manual.resolveManualPracticeAdvance(baseInput(navigation,{questionDetour:{suspendedScriptStepId:'discovery-2'}}));
 assert.equal(result.status,'advance');assert.equal(result.navigation.activeAdaptiveRoute,false);assert.equal(result.navigation.resumeScriptStepId,null);assert.equal(result.navigation.approvedScriptBranchId,null);assert.equal(result.navigation.approvedScriptClaimId,null);assert.equal(result.navigation.activeObjectionOrConfusion,null);assert.equal(result.navigation.adaptiveOverride,false);assert.equal(result.navigation.deliveryEvidenceSequence,null);assert.equal(result.navigation.currentScriptStepId,'discovery-3');
});

test('manual planning is pure and preserves transcript/evidence history held by the caller',()=>{
 const navigation=Object.freeze(navFor('discovery-2')),turns=Object.freeze([{id:'s1',role:'seller',text:'Seller evidence'},{id:'b1',role:'buyer',text:'Already have a provider?'}]),evidence=Object.freeze(['packet-1','packet-2']);
 const result=manual.resolveManualPracticeAdvance(baseInput(navigation,{questionDetour:{suspendedScriptStepId:'discovery-2'}}));
 assert.equal(result.status,'advance');assert.deepEqual(turns.map(turn=>turn.text),['Seller evidence','Already have a provider?']);assert.deepEqual(evidence,['packet-1','packet-2']);assert.equal(navigation.scriptStepId,'discovery-2');
});

test('epoch invalidation makes an older in-flight navigation result stale',()=>{
 const epoch=manual.createManualAdvanceEpoch(),requestToken=epoch.begin();assert.equal(epoch.isCurrent(requestToken),true);epoch.invalidate();assert.equal(epoch.isCurrent(requestToken),false);const laterToken=epoch.begin();assert.equal(epoch.isCurrent(requestToken),false);assert.equal(epoch.isCurrent(laterToken),true);
});

test('after manual advance the existing question and objection classifiers remain available',()=>{
 const result=manual.resolveManualPracticeAdvance(baseInput(navFor('discovery-2'),{questionDetour:{suspendedScriptStepId:'discovery-2'}}));
 assert.equal(result.status,'advance');assert.equal(flow.classifyPracticeBuyerTurn('What does the membership include?'),'direct_question');assert.equal(flow.classifyPracticeBuyerTurn('We have no budget for another provider.'),'objection');
});

test('Space suppression diagnostics are safe and identify the actionable stop condition',()=>{
 const validPlan=manual.resolveManualPracticeAdvance(baseInput(navFor('opening-1')));
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key({target:{tagName:'INPUT',closest:()=>null}}),activePractice:true,phase:'live',turnState:'ready',plan:validPlan}),'invalid_focus');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'live',turnState:'buyer_generating',plan:validPlan}),'generation_in_flight');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'live',turnState:'ready',plan:manual.resolveManualPracticeAdvance(baseInput(navFor('soft_close-1')))}),'terminal');
 const noNextPlan=manual.resolveManualPracticeAdvance(baseInput(navFor('discovery-3'),{playbook:{scriptSteps:playbook.scriptSteps.slice(0,-1)}}));
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'live',turnState:'ready',plan:noNextPlan}),'no_next_step');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:false,phase:'live',turnState:'ready',plan:manual.resolveManualPracticeAdvance(baseInput(navFor('opening-1'),{active:false}))}),'inactive_practice');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'inactive',turnState:'ready',plan:validPlan}),'invalid_phase');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'live',turnState:'ready',plan:manual.resolveManualPracticeAdvance(baseInput(null))}),'stale_state');
 assert.equal(manual.manualPracticeSpaceSuppressionReason({event:key(),activePractice:true,phase:'live',turnState:'ready',plan:validPlan}),null);
});

test('terminal soft-close step is a no-op',()=>{
 const terminal=playbook.scriptSteps.at(-1);assert.equal(terminal.id,'soft_close-1');const result=manual.resolveManualPracticeAdvance(baseInput(navFor(terminal.id)));assert.equal(result.status,'unavailable');assert.equal(result.reason,'current_step_terminal');
});

test('no next step is a no-op and does not synthesize a destination',()=>{
 const custom={...playbook,scriptSteps:playbook.scriptSteps.slice(0,2)},result=manual.resolveManualPracticeAdvance({...baseInput(navFor('discovery-1')),playbook:custom});
 assert.equal(result.status,'unavailable');assert.equal(result.reason,'no_next_step');
});

test('inactive, terminal and missing-script sessions cannot advance',()=>{
 assert.equal(manual.resolveManualPracticeAdvance(baseInput(navFor('opening-1'),{active:false})).reason,'inactive');assert.equal(manual.resolveManualPracticeAdvance(baseInput(navFor('opening-1'),{terminal:true})).reason,'terminal');assert.equal(manual.resolveManualPracticeAdvance({...baseInput(navFor('opening-1')),navigation:null}).reason,'missing_navigation');assert.equal(manual.resolveManualPracticeAdvance({...baseInput(navFor('opening-1')),playbook:null}).reason,'missing_navigation');
});

test('Space is consumed only for an eligible unmodified non-repeating Space key',()=>{
 assert.equal(manual.shouldHandleManualPracticeSpace(key(),true),true);assert.equal(manual.shouldHandleManualPracticeSpace(key({code:'Enter'}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key(),false),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({repeat:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({shiftKey:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({altKey:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({ctrlKey:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({metaKey:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({isComposing:true}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({keyCode:229}),true),false);assert.equal(manual.shouldHandleManualPracticeSpace(key({defaultPrevented:true}),true),false);
});

test('Space preserves normal behavior in input, textarea, select, button, dialog and contenteditable focus',()=>{
 for(const tagName of ['INPUT','TEXTAREA','SELECT','BUTTON','A','SUMMARY'])assert.equal(manual.shouldHandleManualPracticeSpace(key({target:{tagName,closest:()=>null}}),true),false,`${tagName} focus blocks override`);
 assert.equal(manual.shouldHandleManualPracticeSpace(key({target:{tagName:'DIV',isContentEditable:true,closest:()=>null}}),true),false,'contenteditable focus blocks override');
 assert.equal(manual.shouldHandleManualPracticeSpace(key({target:{tagName:'DIV',closest:selector=>selector.includes('[role="dialog"]')?{}:null}}),true),false,'modal/dialog focus blocks override');
});
