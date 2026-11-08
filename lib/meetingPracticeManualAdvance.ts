import type {SalesPlaybook,ScriptNavigation} from './meetingAdaptiveCoach';

export type ManualAdvanceDetour={suspendedScriptStepId:string}|null;

export function createManualAdvanceEpoch(){
 let value=0;
 return {begin(){return ++value;},invalidate(){return ++value;},isCurrent(token:number){return token===value;},get value(){return value;}};
}

export type ManualAdvancePlan=
 |{status:'advance';fromStepId:string;targetStepId:string;targetSection:string;targetText:string;navigation:ScriptNavigation;detour:'question'|'adaptive'|'none'}
 |{status:'unavailable';reason:'inactive'|'terminal'|'missing_navigation'|'current_step_missing'|'current_step_terminal'|'no_next_step'};

type NavigationLike=ScriptNavigation|null|undefined;
type PlaybookLike=Pick<SalesPlaybook,'scriptSteps'>|null|undefined;

/** Resolve a manual advance from the canonical cursor, never a temporary branch index. */
export function resolveManualPracticeAdvance(input:{active:boolean;terminal:boolean;navigation:NavigationLike;playbook:PlaybookLike;questionDetour:ManualAdvanceDetour}):ManualAdvancePlan{
 if(!input.active)return {status:'unavailable',reason:'inactive'};
 if(input.terminal)return {status:'unavailable',reason:'terminal'};
 const steps=input.playbook?.scriptSteps||[],navigation=input.navigation;
 if(!navigation||!steps.length)return {status:'unavailable',reason:'missing_navigation'};
 const detour=input.questionDetour?'question':navigation.activeAdaptiveRoute&&navigation.resumeScriptStepId?'adaptive':'none';
 const fromStepId=input.questionDetour?.suspendedScriptStepId||(detour==='adaptive'?navigation.resumeScriptStepId:null)||navigation.scriptStepId||navigation.currentScriptStepId;
 if(!fromStepId)return {status:'unavailable',reason:'missing_navigation'};
 const index=steps.findIndex(step=>step.id===fromStepId),current=index>=0?steps[index]:null;
 if(!current)return {status:'unavailable',reason:'current_step_missing'};
 if(current.section==='soft_close'&&steps.at(-1)?.id===current.id)return {status:'unavailable',reason:'current_step_terminal'};
 const next=steps[index+1];
 if(!next)return {status:'unavailable',reason:'no_next_step'};
 const nextNavigation:ScriptNavigation={
  ...navigation,
  currentScriptSection:next.section,
  previousScriptSection:current.section,
  previousScriptStepId:current.id,
  recommendedScriptSection:next.section,
  routeDirection:'advance',
  routeReason:'Seller manually advanced the approved Practice script.',
  buyerIntent:null,
  buyingSignalStrength:'none',
  activeObjectionOrConfusion:null,
  readinessToClose:'not_ready',
  approvedScriptBranchId:null,
  approvedScriptClaimId:null,
  currentScriptStepId:next.id,
  scriptStepId:next.id,
  visibleScriptText:next.text,
  staySilent:false,
  currentScriptStepStatus:'not_started',
  currentScriptStepWasSpoken:false,
  currentScriptStepComplete:false,
  nextSequentialScriptStepId:steps[index+2]?.id||null,
  adaptiveOverride:false,
  activeAdaptiveRoute:false,
  resumeScriptSection:null,
  resumeScriptStepId:null,
  deliveryEvidenceSequence:null,
  sequence:undefined,
 };
 return {status:'advance',fromStepId,targetStepId:next.id,targetSection:next.section,targetText:next.text,navigation:nextNavigation,detour};
}

type SpaceEventLike={code?:string;repeat?:boolean;shiftKey?:boolean;altKey?:boolean;ctrlKey?:boolean;metaKey?:boolean;isComposing?:boolean;keyCode?:number;defaultPrevented?:boolean;target?:unknown};
export type ManualPracticeSpaceSuppressionReason='generation_in_flight'|'no_next_step'|'terminal'|'invalid_focus'|'inactive_practice'|'invalid_phase'|'stale_state'|'other';
type FocusTargetLike={tagName?:string;isContentEditable?:boolean;getAttribute?:(name:string)=>string|null;closest?:(selector:string)=>unknown};

function isKeyboardBlockedTarget(target:unknown):boolean{
 if(!target||typeof target!=='object')return false;
 const element=target as FocusTargetLike,tag=element.tagName?.toLowerCase();
 if(['input','textarea','select','button','a','summary'].includes(tag||'')||element.isContentEditable)return true;
 if(element.getAttribute?.('contenteditable')!==null&&element.getAttribute?.('contenteditable')!==undefined&&element.getAttribute('contenteditable')!=='false')return true;
 return !!element.closest?.('input,textarea,select,button,a[href],summary,[role="button"],[contenteditable]:not([contenteditable="false"]),[role="dialog"],dialog,[aria-modal="true"],[data-keyboard-modal="true"]');
}

/** Only consume Space when the local Practice-only advance can actually occur. */
export function shouldHandleManualPracticeSpace(event:SpaceEventLike,eligible:boolean):boolean{
 return eligible&&event.code==='Space'&&!event.repeat&&!event.shiftKey&&!event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.isComposing&&event.keyCode!==229&&!event.defaultPrevented&&!isKeyboardBlockedTarget(event.target);
}

/** Safe, content-free explanation for a Practice Space press that cannot advance. */
export function manualPracticeSpaceSuppressionReason(input:{event:SpaceEventLike;activePractice:boolean;phase:'live'|'inactive';turnState:string;plan:ManualAdvancePlan}):ManualPracticeSpaceSuppressionReason|null{
 if(!input.activePractice)return 'inactive_practice';
 if(input.phase!=='live')return 'invalid_phase';
 if(['processing','buyer_generating'].includes(input.turnState))return 'generation_in_flight';
 if(input.plan.status==='unavailable'){
  if(input.plan.reason==='terminal'||input.plan.reason==='current_step_terminal')return 'terminal';
  if(input.plan.reason==='no_next_step')return 'no_next_step';
  if(input.plan.reason==='inactive')return 'inactive_practice';
  if(input.plan.reason==='missing_navigation'||input.plan.reason==='current_step_missing')return 'stale_state';
  return 'other';
 }
 return shouldHandleManualPracticeSpace(input.event,true)?null:'invalid_focus';
}
