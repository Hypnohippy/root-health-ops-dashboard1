import {Buffer} from 'node:buffer';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {isConversationTurn,validatePracticeTurnSequence,type ConversationTurn} from './meetingConversationTurn';

export type AttestedPracticeTurn=ConversationTurn&{serverAttestation:string};

function payload(turn:ConversationTurn){return JSON.stringify({id:turn.id,order:turn.order,role:turn.role,text:turn.text,startedAt:turn.startedAt,endedAt:turn.endedAt,finalized:turn.finalized,boundary:turn.boundary,sourceEvidenceIds:turn.sourceEvidenceIds,sourceEvidence:turn.sourceEvidence||null,integrity:turn.integrity,provenance:{sourceId:turn.provenance.sourceId,method:turn.provenance.method,confidence:turn.provenance.confidence}});}
function signature(sessionId:string,turn:ConversationTurn,key:string){return createHmac('sha256',key).update(JSON.stringify({sessionId,turn:payload(turn)})).digest('hex');}
function transcriptPayload(sessionId:string,sequence:number,text:string){return JSON.stringify({sessionId,sequence,text});}

export type AttestedPracticeTranscript={id:string;text:string;serverAttestation:string};
export function attestPracticeTranscript(sessionId:string,sequence:number,text:string,key:string):string{
 if(!sessionId||!Number.isInteger(sequence)||sequence<0||typeof text!=='string'||!key)throw Error('Practice transcript cannot be attested.');
 return createHmac('sha256',key).update(transcriptPayload(sessionId,sequence,text)).digest('hex');
}
export function verifyPracticeTranscriptEvidence(sessionId:string,sequenceIds:string[],sellerText:string,evidence:unknown,key:string):evidence is AttestedPracticeTranscript[]{
 if(!key||!Array.isArray(evidence)||evidence.length!==sequenceIds.length)return false;
 const rows=evidence as AttestedPracticeTranscript[],ids=rows.map(row=>row?.id);
 if(ids.some((id,index)=>id!==sequenceIds[index])||new Set(ids).size!==ids.length)return false;
 for(const row of rows){if(typeof row.text!=='string'||typeof row.serverAttestation!=='string'||!/^[a-f0-9]{64}$/i.test(row.serverAttestation))return false;const expected=Buffer.from(attestPracticeTranscript(sessionId,Number(row.id),row.text,key),'hex'),received=Buffer.from(row.serverAttestation,'hex');if(expected.length!==received.length||!timingSafeEqual(expected,received))return false;}
 const reconstructed=rows.map(row=>row.text.trim()).filter(Boolean).join(' ').trim();return reconstructed===sellerText;
}

/** Server-only proof that a turn passed the Practice endpoint or was generated there. */
export function attestPracticeTurn(sessionId:string,turn:ConversationTurn,key:string):AttestedPracticeTurn{
 if(!sessionId||!key||!isConversationTurn(turn))throw Error('Practice turn cannot be attested.');
 return {...turn,serverAttestation:signature(sessionId,turn,key)};
}

export function isServerAttestedPracticeTurn(sessionId:string,value:unknown,key:string):value is AttestedPracticeTurn{
 if(!sessionId||!key||!isConversationTurn(value))return false;
 const turn=value as ConversationTurn&{serverAttestation?:unknown},provided=turn.serverAttestation;
 if(typeof provided!=='string'||!/^[a-f0-9]{64}$/i.test(provided))return false;
 const expected=Buffer.from(signature(sessionId,turn,key),'hex'),received=Buffer.from(provided,'hex');
 return expected.length===received.length&&timingSafeEqual(expected,received);
}

export function isServerAttestedPracticeSequence(sessionId:string,value:unknown,key:string):value is AttestedPracticeTurn[]{
 return !!sessionId&&validatePracticeTurnSequence(value)&&value.every(turn=>isServerAttestedPracticeTurn(sessionId,turn,key));
}
