export type MeetingTranscriptionDiagnosticCode='invalid_audio'|'reservation_conflict'|'duplicate_request'|'session_conflict'|'provider_rejection'|'other_server_conflict';
export type MeetingTranscriptionFailureStage='input'|'session'|'reservation'|'provider'|'other';

export class MeetingTranscriptionError extends Error{
 constructor(readonly diagnosticCode:MeetingTranscriptionDiagnosticCode,message:string){super(message);this.name='MeetingTranscriptionError';}
}

export function classifyMeetingTranscriptionFailure(stage:MeetingTranscriptionFailureStage,details:{status?:number;reservationCode?:string}={}):MeetingTranscriptionDiagnosticCode{
 if(stage==='input')return 'invalid_audio';
 if(stage==='session')return 'session_conflict';
 if(stage==='reservation')return details.reservationCode==='23505'?'duplicate_request':'reservation_conflict';
 if(stage==='provider')return details.status===409?'provider_rejection':details.status===400||details.status===422?'invalid_audio':'other_server_conflict';
 return 'other_server_conflict';
}
