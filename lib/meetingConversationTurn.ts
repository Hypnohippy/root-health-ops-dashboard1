import type {MeetingSegment} from './meetingCopilot';

export type ConversationTurnRole='seller'|'buyer'|'unknown';
export type ConversationTurn={
 id:string;
 order:number;
 role:ConversationTurnRole;
 text:string;
 startedAt:number|null;
 endedAt:number|null;
 finalized:true;
 boundary:'confirmed'|'explicit';
 sourceEvidenceIds:string[];
 integrity:'complete'|'gap';
 provenance:{sourceId:string;method:'practice_action'|'separate_channel'|'provider_label'|'diarization'|'unknown';confidence:number|null};
 sourceEvidence?:{id:string;text:string;serverAttestation:string}[];
};

/** A transcript made only of hesitation sounds is not a seller turn for Practice. */
export function hasSubstantiveSellerSpeech(value:unknown):value is string {
 if(typeof value!=='string')return false;const tokens=value.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu)||[];return tokens.some(token=>!/^(?:um+|uh+|erm+|er+|hmm+)$/.test(token));
}

const roles=new Set<ConversationTurnRole>(['seller','buyer','unknown']);
const methods=new Set<ConversationTurn['provenance']['method']>(['practice_action','separate_channel','provider_label','diarization','unknown']);

export function isConversationTurn(value:unknown):value is ConversationTurn {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>,provenance=row.provenance as Record<string,unknown>|null;
 return typeof row.id==='string'&&row.id.length>0&&Number.isInteger(row.order)&&Number(row.order)>0&&roles.has(row.role as ConversationTurnRole)&&typeof row.text==='string'&&row.text.trim().length>0&&row.text.length<=12000&&(row.startedAt===null||typeof row.startedAt==='number'&&Number.isFinite(row.startedAt))&&(row.endedAt===null||typeof row.endedAt==='number'&&Number.isFinite(row.endedAt))&&(row.startedAt===null||row.endedAt===null||Number(row.endedAt)>=Number(row.startedAt))&&row.finalized===true&&(row.boundary==='confirmed'||row.boundary==='explicit')&&Array.isArray(row.sourceEvidenceIds)&&row.sourceEvidenceIds.every(id=>typeof id==='string'&&id.length>0)&&new Set(row.sourceEvidenceIds).size===row.sourceEvidenceIds.length&&(row.integrity==='complete'||row.integrity==='gap')&&!!provenance&&typeof provenance.sourceId==='string'&&provenance.sourceId.length>0&&methods.has(provenance.method as ConversationTurn['provenance']['method'])&&(provenance.confidence===null||typeof provenance.confidence==='number'&&Number.isFinite(provenance.confidence)&&provenance.confidence>=0&&provenance.confidence<=1);
}

/** Build turns in application-owned order; audio packet IDs remain source evidence only. */
export function finalizeSellerPracticeTurn(input:{id:string;order:number;packetSegments:MeetingSegment[];startedAt:number|null;endedAt:number;sourceId:string;packetAttestations?:Map<string,string>;boundary?:'confirmed'|'explicit'}):ConversationTurn {
 const ordered=[...input.packetSegments],text=ordered.filter(row=>!row.gap).map(row=>row.text.trim()).filter(Boolean).join(' ').trim();
 const turn:ConversationTurn={id:input.id,order:input.order,role:'seller',text,startedAt:input.startedAt,endedAt:input.endedAt,finalized:true,boundary:input.boundary||'explicit',sourceEvidenceIds:ordered.map(row=>row.id),integrity:ordered.some(row=>row.gap)?'gap':'complete',provenance:{sourceId:input.sourceId,method:'practice_action',confidence:null},sourceEvidence:ordered.map(row=>({id:row.id,text:row.text,serverAttestation:input.packetAttestations?.get(row.id)||''}))};
 if(!isConversationTurn(turn))throw Error('Seller practice turn is invalid.');
 return turn;
}

export function createSyntheticBuyerTurn(input:{id:string;order:number;text:string;sourceId?:string;at?:number}):ConversationTurn {
 const text=input.text.trim(),at=input.at??Date.now(),turn:ConversationTurn={id:input.id,order:input.order,role:'buyer',text,startedAt:at,endedAt:at,finalized:true,boundary:'explicit',sourceEvidenceIds:[`synthetic:${input.id}`],integrity:'complete',provenance:{sourceId:input.sourceId||'synthetic-practice-buyer',method:'practice_action',confidence:null}};
 if(!isConversationTurn(turn)||!text)throw Error('Synthetic buyer turn is invalid.');
 return turn;
}

export function validatePracticeTurnSequence(value:unknown):value is ConversationTurn[] {
 if(!Array.isArray(value)||value.length>300||!value.every(isConversationTurn))return false;
 const ids=new Set<string>();for(let index=0;index<value.length;index++){
  const turn=value[index] as ConversationTurn;
  if(ids.has(turn.id)||turn.order!==index+1||turn.role==='unknown'||turn.integrity!=='complete'||turn.role==='buyer'&&turn.boundary!=='explicit'||turn.provenance.method!=='practice_action'||index===0&&turn.role!=='seller')return false;ids.add(turn.id);
  if(index>0){const previous=value[index-1] as ConversationTurn;if(turn.role===previous.role||turn.startedAt!==null&&previous.endedAt!==null&&turn.startedAt<previous.endedAt)return false;}
 }
 return true;
}

export function isTurnBasedSyntheticPracticeContext(value:unknown):boolean {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const context=value as Record<string,unknown>;
 return context.synthetic===true&&context.practiceTurnMode==='turn_based_v1';
}

export function resolvePracticeCoachTurns(context:unknown,practiceMode:unknown,value:unknown):{mode:'legacy'}|{mode:'turn_based';turns:ConversationTurn[]}|{mode:'invalid'} {
 const synthetic=!!context&&typeof context==='object'&&!Array.isArray(context)&&(context as Record<string,unknown>).synthetic===true;
 if(value!==undefined){
  if(!synthetic||!validatePracticeTurnSequence(value)||value.at(-1)?.role!=='buyer')return {mode:'invalid'};
  return {mode:'turn_based',turns:value};
 }
 if(synthetic&&(isTurnBasedSyntheticPracticeContext(context)||practiceMode===true))return {mode:'invalid'};
 return {mode:'legacy'};
}

/** One canonical transcript source per finalized turn; no speaker reconstruction from packets. */
export function conversationTurnsToSegments(turns:ConversationTurn[]):MeetingSegment[] {
 if(!validatePracticeTurnSequence(turns))throw Error('Practice conversation turns are incomplete or out of order.');
 return turns.map(turn=>({id:String(turn.order-1),text:turn.text,gap:turn.integrity==='gap'}));
}
