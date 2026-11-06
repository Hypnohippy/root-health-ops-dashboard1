export type PracticeSpeechEvent={type:'ready'|'started'|'completed'|'failed';at:number;reason?:string};

/** Speaks exactly the already-validated synthetic buyer text; it never produces transcript evidence. */
export function speakValidatedBuyerTurn(text:string,onEvent:(event:PracticeSpeechEvent)=>void){
 let finished=false,started=false,startTimer:ReturnType<typeof setTimeout>|null=null,completionTimer:ReturnType<typeof setTimeout>|null=null;
 const clearTimers=()=>{if(startTimer)clearTimeout(startTimer);if(completionTimer)clearTimeout(completionTimer);startTimer=null;completionTimer=null;};
 const fail=(reason:string)=>{if(finished)return;finished=true;clearTimers();onEvent({type:'failed',at:Date.now(),reason});};
 const synthesis=globalThis.speechSynthesis;
 const Utterance=globalThis.SpeechSynthesisUtterance;
 if(!text.trim()||!synthesis||!Utterance){fail('browser_speech_synthesis_unavailable');return ()=>{};}
 let utterance:SpeechSynthesisUtterance;
 try{utterance=new Utterance(text);}catch{fail('speech_utterance_unavailable');return ()=>{};}
 utterance.lang='en-GB';
 utterance.onstart=()=>{if(finished||started)return;started=true;if(startTimer)clearTimeout(startTimer);startTimer=null;completionTimer=setTimeout(()=>{try{synthesis.cancel();}catch{}fail('speech_completion_timeout');},90000);onEvent({type:'started',at:Date.now()});};
 utterance.onend=()=>{if(finished)return;finished=true;clearTimers();onEvent({type:'completed',at:Date.now()});};
 utterance.onerror=event=>fail(`speech_playback_${event.error||'failed'}`);
 onEvent({type:'ready',at:Date.now()});
 try{synthesis.speak(utterance);if(!started&&!finished)startTimer=setTimeout(()=>{if(started||finished)return;try{synthesis.cancel();}catch{}fail('speech_start_timeout');},15000);}catch{fail('speech_playback_unavailable');}
 return ()=>{if(finished)return;finished=true;clearTimers();try{synthesis.cancel();}catch{}};
}
