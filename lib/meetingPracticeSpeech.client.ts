export type PracticeVoiceDiagnostics={voiceName:string|null;language:string|null;localService:boolean|null;rate:number;pitch:number;volume:number;fallbackReason:string|null;candidateVoiceCount:number};
export type PracticeVoiceSelection={voice:SpeechSynthesisVoice|null;diagnostics:PracticeVoiceDiagnostics};
export type PracticeSpeechEvent={type:'ready'|'started'|'completed'|'failed';at:number;reason?:string;voiceDiagnostics?:PracticeVoiceDiagnostics};
export const PRACTICE_SPEECH_DEFAULTS={rate:0.97,pitch:1,volume:1} as const;

function voiceScore(voice:SpeechSynthesisVoice,index:number,preferredLocale='en-GB'){
 const language=(voice.lang||'').toLowerCase(),name=(voice.name||'').toLowerCase(),preferred=preferredLocale.toLowerCase();let score=0;
 if(/^en(?:-|$)/.test(language))score+=1000;
 if(language===preferred)score+=120;
 else if(language.startsWith(`${preferred}-`))score+=100;
 else if(/^en-(?:ie|au|nz|gb)(?:-|$)/.test(language))score+=75;
 else if(/^en-us(?:-|$)/.test(language))score+=55;
 if(/natural|neural|premium|enhanced|online|aria|sonia|libby|ryan|google uk english/i.test(voice.name||''))score+=45;
 if(voice.localService)score+=4;
 if(/legacy|espeak|robot|desktop|compact|monotone/i.test(name))score-=160;
 if(voice.default)score-=8;
 return score-index/10000;
}

/** Rank rather than require one browser-specific voice name. Stable source order breaks ties. */
export function selectPracticeVoice(voices:SpeechSynthesisVoice[],preferredLocale='en-GB'):PracticeVoiceSelection{
 const list=Array.isArray(voices)?voices:[],english=list.filter(voice=>/^en(?:-|$)/i.test(voice.lang||''));
 const pool=english.length?english:list;
 const voice=[...pool].sort((a,b)=>english.length?voiceScore(b,list.indexOf(b),preferredLocale)-voiceScore(a,list.indexOf(a),preferredLocale):Number(b.default===true)-Number(a.default===true)||voiceScore(b,list.indexOf(b),preferredLocale)-voiceScore(a,list.indexOf(a),preferredLocale))[0]||null;
 const fallbackReason=voice===null?'no_speech_voices_available':english.length===0?'no_english_voice_available':!voice.lang?.toLowerCase().startsWith(preferredLocale.toLowerCase())?'preferred_locale_unavailable':null;
 return {voice,diagnostics:{voiceName:voice?.name||null,language:voice?.lang||null,localService:voice?voice.localService===true:null,rate:PRACTICE_SPEECH_DEFAULTS.rate,pitch:PRACTICE_SPEECH_DEFAULTS.pitch,volume:PRACTICE_SPEECH_DEFAULTS.volume,fallbackReason,candidateVoiceCount:list.length}};
}

/** Resolve late-loading browser voices without ever delaying microphone readiness. */
export function preparePracticeVoiceSelection(synthesis:SpeechSynthesis|undefined=globalThis.speechSynthesis,preferredLocale='en-GB',waitMs=800):Promise<PracticeVoiceSelection>{
 if(!synthesis)return Promise.resolve(selectPracticeVoice([] ,preferredLocale));
 let initial:SpeechSynthesisVoice[]=[];try{initial=synthesis.getVoices();}catch{}
 if(initial.length)return Promise.resolve(selectPracticeVoice(initial,preferredLocale));
 if(typeof synthesis.addEventListener!=='function')return Promise.resolve(selectPracticeVoice(initial,preferredLocale));
 return new Promise(resolve=>{
  let settled=false;
  const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);try{synthesis.removeEventListener('voiceschanged',onVoicesChanged);}catch{}let voices:SpeechSynthesisVoice[]=[];try{voices=synthesis.getVoices();}catch{}resolve(selectPracticeVoice(voices,preferredLocale));};
  const onVoicesChanged=()=>{let voices:SpeechSynthesisVoice[]=[];try{voices=synthesis.getVoices();}catch{}if(voices.length)finish();};
  const timer=setTimeout(finish,Math.max(0,waitMs));
  try{synthesis.addEventListener('voiceschanged',onVoicesChanged,{once:false});}catch{finish();}
 });
}

/** Speaks exactly the already-validated synthetic buyer text; it never produces transcript evidence. */
export function speakValidatedBuyerTurn(text:string,onEvent:(event:PracticeSpeechEvent)=>void,selection?:PracticeVoiceSelection){
 let finished=false,started=false,startTimer:ReturnType<typeof setTimeout>|null=null,completionTimer:ReturnType<typeof setTimeout>|null=null;
 const clearTimers=()=>{if(startTimer)clearTimeout(startTimer);if(completionTimer)clearTimeout(completionTimer);startTimer=null;completionTimer=null;};
 const fail=(reason:string)=>{if(finished)return;finished=true;clearTimers();onEvent({type:'failed',at:Date.now(),reason});};
 const synthesis=globalThis.speechSynthesis;
 const Utterance=globalThis.SpeechSynthesisUtterance;
 if(!text.trim()||!synthesis||!Utterance){fail('browser_speech_synthesis_unavailable');return ()=>{};}
 let utterance:SpeechSynthesisUtterance;
 try{utterance=new Utterance(text);}catch{fail('speech_utterance_unavailable');return ()=>{};}
 let activeSelection=selection;
 if(!activeSelection){let voices:SpeechSynthesisVoice[]=[];try{voices=synthesis.getVoices();}catch{}activeSelection=selectPracticeVoice(voices);}
 utterance.voice=activeSelection.voice;
 utterance.lang=activeSelection.voice?.lang||'en-GB';
 utterance.rate=PRACTICE_SPEECH_DEFAULTS.rate;
 utterance.pitch=PRACTICE_SPEECH_DEFAULTS.pitch;
 utterance.volume=PRACTICE_SPEECH_DEFAULTS.volume;
 utterance.onstart=()=>{if(finished||started)return;started=true;if(startTimer)clearTimeout(startTimer);startTimer=null;completionTimer=setTimeout(()=>{try{synthesis.cancel();}catch{}fail('speech_completion_timeout');},90000);onEvent({type:'started',at:Date.now()});};
 utterance.onend=()=>{if(finished)return;finished=true;clearTimers();onEvent({type:'completed',at:Date.now()});};
 utterance.onerror=event=>fail(`speech_playback_${event.error||'failed'}`);
 onEvent({type:'ready',at:Date.now(),voiceDiagnostics:activeSelection.diagnostics});
 try{synthesis.speak(utterance);if(!started&&!finished)startTimer=setTimeout(()=>{if(started||finished)return;try{synthesis.cancel();}catch{}fail('speech_start_timeout');},15000);}catch{fail('speech_playback_unavailable');}
 return ()=>{if(finished)return;finished=true;clearTimers();try{synthesis.cancel();}catch{}};
}
