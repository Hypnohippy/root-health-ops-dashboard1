import {pcmWav} from './meetingCopilot';
/** Six 5-second packets bound transient in-memory backlog to 30 seconds. */
export const MAX_PENDING_AUDIO_CHUNKS=6;
export const PRACTICE_ENDPOINT_SILENCE_MS=1400;
export const PRACTICE_ENDPOINT_SETTLE_MS=250;
export async function startMeetingMicrophone(onChunk:(audio:Blob,pauseDetectedAt?:number)=>void,onFailure:(message:string)=>void,signal?:AbortSignal,onAudioActivity?:()=>void,onPracticeEndpoint?:()=>void,options:{practiceEndpointSilenceMs?:number}={}){
 // Resume from the explicit Start gesture, before permission/network awaits lose activation.
 const context=new AudioContext({sampleRate:24000});let stream:MediaStream|undefined,finished=false;
 let rejectStartup:(error:Error)=>void=()=>{};
 const blocked=new Promise<never>((_,reject)=>{rejectStartup=reject;});
 const release=()=>{stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});void context.close().catch(()=>{});};
 const cancel=()=>{release();rejectStartup(Error('Microphone start cancelled.'));};
 const timeout=setTimeout(()=>{release();rejectStartup(Error('Microphone did not become ready within 30 seconds. Check browser permission and microphone availability, then try Start again.'));},30000);
 signal?.addEventListener('abort',cancel,{once:true});
 try{
  if(signal?.aborted)throw Error('Microphone start cancelled.');
  const resume=context.resume();
  const permission=navigator.mediaDevices.getUserMedia({audio:true,video:false}).then(value=>{if(finished||signal?.aborted){value.getTracks().forEach(t=>t.stop());throw Error('Microphone start cancelled.');}stream=value;return value;});
  const ready=async()=>{await Promise.all([resume,permission,context.audioWorklet.addModule('/meeting-copilot-pcm.js')]);if(context.sampleRate!==24000)throw Error('This browser cannot provide the required microphone format.');};
  await Promise.race([ready(),blocked]);
  if(signal?.aborted)throw Error('Microphone start cancelled.');
  clearTimeout(timeout);signal?.removeEventListener('abort',cancel);
  const source=context.createMediaStreamSource(stream!),node=new AudioWorkletNode(context,'meeting-pcm'),silent=context.createGain();silent.gain.value=0;if(options.practiceEndpointSilenceMs!==undefined)node.port.postMessage({type:'configure_practice_endpoint',silenceMs:options.practiceEndpointSilenceMs});source.connect(node);node.connect(silent);silent.connect(context.destination);
  let failureReported=false;const fail=(message:string)=>{if(failureReported)return;failureReported=true;onFailure(message);};
  const floatSamples=(value:unknown):Float32Array|null=>Object.prototype.toString.call(value)==='[object Float32Array]'&&typeof (value as Float32Array).length==='number'?new Float32Array(value as Float32Array):null;let turnFlushResolve:(()=>void)|null=null,turnFlushReject:((error:Error)=>void)|null=null;
  node.port.onmessage=e=>{const data=e.data;if(data?.type==='audio_activity'){onAudioActivity?.();return;}if(data?.type==='practice_endpoint'){const samples=floatSamples(data.samples);if(samples?.length)onChunk(new Blob([pcmWav(samples,24000)],{type:'audio/wav'}));onPracticeEndpoint?.();return;}if(data?.type==='flush_complete'){turnFlushResolve?.();return;}const samples=floatSamples(data?.type==='silence_pause'||data?.type==='explicit_turn_flush'?data.samples:data);if(samples?.length)onChunk(new Blob([pcmWav(samples,24000)],{type:'audio/wav'}),data?.type==='silence_pause'?Date.now():undefined);};
  node.port.onmessageerror=()=>{turnFlushReject?.(Error('The microphone did not confirm the explicit Practice turn boundary. This turn cannot be used for script delivery.'));fail('Microphone audio could not be delivered to transcription. End and restart the meeting before continuing.');};
  node.onprocessorerror=()=>fail('Microphone audio processing stopped unexpectedly. End and restart the meeting before continuing.');
  const disconnect=()=>stream!.getTracks().forEach(t=>{t.onended=null;t.stop();});
  const abortCapture=()=>{disconnect();source.disconnect();node.port.onmessage=null;node.disconnect();silent.disconnect();void context.close().catch(()=>{});};
  signal?.addEventListener('abort',abortCapture,{once:true});stream!.getAudioTracks().forEach(track=>track.onended=()=>onFailure('Microphone disconnected. Transcript gap; end or restart the meeting.'));
  let stopped=false;return {setCaptureEnabled(enabled:boolean){if(stopped)return;if(enabled)node.port.postMessage('clear_turn');stream!.getAudioTracks().forEach(track=>{track.enabled=enabled;});},flushTurn(){if(stopped)return Promise.reject(Error('Microphone capture is closed.'));return new Promise<void>((resolve,reject)=>{let complete=false;const finish=(error?:Error)=>{if(complete)return;complete=true;clearTimeout(flushTimeout);turnFlushResolve=null;turnFlushReject=null;if(error)reject(error);else resolve();};turnFlushResolve=()=>finish();turnFlushReject=error=>finish(error);node.port.postMessage('flush_turn');const flushTimeout=setTimeout(()=>finish(Error('The explicit Practice turn boundary was not acknowledged. This turn cannot be used for script delivery.')),500);});},stop(){if(stopped)return;stopped=true;turnFlushReject?.(Error('Microphone capture ended before the explicit Practice turn boundary was confirmed.'));signal?.removeEventListener('abort',abortCapture);disconnect();source.disconnect();return new Promise<void>(resolve=>{const finish=()=>{clearTimeout(flushTimeout);node.port.onmessage=null;node.disconnect();silent.disconnect();void context.close();resolve();};const handle=node.port.onmessage;node.port.onmessage=e=>{handle?.call(node.port,e);finish();};node.port.postMessage('flush');const flushTimeout=setTimeout(finish,300);});}};
 }catch(error){finished=true;release();throw error;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
