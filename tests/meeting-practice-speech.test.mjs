import assert from 'node:assert/strict';
import test from 'node:test';
import {loadMeeting} from './meeting-copilot-loader.mjs';

const voice=(name,lang,localService=true,isDefault=false)=>({name,lang,localService,default:isDefault});
const loadSpeechModule=()=>loadMeeting('lib/meetingPracticeSpeech.client.ts');

test('voice enumeration ranks natural English and prefers en-GB without requiring a specific voice name',()=>{
 const api=loadSpeechModule(),voices=[voice('English US Default','en-US',true,true),voice('English UK Desktop','en-GB',true),voice('English UK Natural Online','en-GB',false),voice('French Natural','fr-FR',false)];
 const selected=api.selectPracticeVoice(voices);
 assert.equal(selected.voice.name,'English UK Natural Online');
 assert.equal(selected.diagnostics.candidateVoiceCount,4);
 assert.equal(selected.diagnostics.fallbackReason,null);
});

test('voice ranking demotes robotic legacy options but still falls back to the best English voice',()=>{
 const selected=loadSpeechModule().selectPracticeVoice([voice('Legacy Desktop Voice','en-GB'),voice('Microsoft Natural','en-US',false)]);
 assert.equal(selected.voice.name,'Microsoft Natural');
 assert.equal(selected.diagnostics.fallbackReason,'preferred_locale_unavailable');
});

test('voiceschanged delayed-load path waits briefly for browser voices',async()=>{
 let available=[],listener=null,removed=false,calls=0;
 const synth={getVoices(){calls++;return available;},addEventListener(name,fn){assert.equal(name,'voiceschanged');listener=fn;},removeEventListener(name,fn){assert.equal(name,'voiceschanged');if(fn===listener)removed=true;}};
 const api=loadSpeechModule();
 const pending=api.preparePracticeVoiceSelection(synth,'en-GB',80);
 setTimeout(()=>{available=[voice('Late Natural UK','en-GB',false)];listener?.();},5);
 const selected=await pending;
 assert.equal(selected.voice.name,'Late Natural UK');
 assert.equal(removed,true);
 assert.ok(calls>=2);
});

test('unavailable language and empty voice lists use deterministic non-blocking fallbacks',async()=>{
 const api=loadSpeechModule(),fallback=api.selectPracticeVoice([voice('Browser Default','fr-FR',true,true),voice('Other Voice','de-DE')]);
 assert.equal(fallback.voice.name,'Browser Default');
 assert.equal(fallback.diagnostics.fallbackReason,'no_english_voice_available');
 const empty=await api.preparePracticeVoiceSelection({getVoices:()=>[]},'en-GB',5);
 assert.equal(empty.voice,null);
 assert.equal(empty.diagnostics.fallbackReason,'no_speech_voices_available');
});

test('selected voice diagnostics are emitted and spoken buyer text/settings remain unchanged',()=>{
 let captured=null;
 class Utterance{constructor(text){this.text=text;this.voice=null;this.lang='';this.rate=1;this.pitch=1;this.volume=1;}}
 const synth={getVoices(){return [];},speak(item){captured=item;item.onstart();item.onend();},cancel(){}};
 const api=loadMeeting('lib/meetingPracticeSpeech.client.ts',{}, {speechSynthesis:synth,SpeechSynthesisUtterance:Utterance});
 const selected=api.selectPracticeVoice([voice('Natural English UK','en-GB',false)]),events=[],text='The buyer said: “What would that follow-up look like?”';
 api.speakValidatedBuyerTurn(text,event=>events.push(event),selected);
 assert.equal(captured.text,text);
 assert.equal(captured.voice.name,'Natural English UK');
 assert.equal(captured.lang,'en-GB');
 assert.equal(captured.rate,0.97);
 assert.equal(captured.pitch,1);
 assert.equal(captured.volume,1);
 assert.equal(events[0].type,'ready');
 assert.deepEqual(events[0].voiceDiagnostics,selected.diagnostics);
 assert.equal(events[1].type,'started');
 assert.equal(events[2].type,'completed');
});
