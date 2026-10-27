import {pcmWav} from './meetingCopilot';
/** Six 5-second packets bound transient in-memory backlog to 30 seconds. */
export const MAX_PENDING_AUDIO_CHUNKS=6;
export async function startMeetingMicrophone(onChunk:(audio:Blob,pauseDetectedAt?:number)=>void,onFailure:(message:string)=>void,signal?:AbortSignal){
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
  const source=context.createMediaStreamSource(stream!),node=new AudioWorkletNode(context,'meeting-pcm'),silent=context.createGain();silent.gain.value=0;source.connect(node);node.connect(silent);silent.connect(context.destination);
  node.port.onmessage=e=>{if(e.data instanceof Float32Array&&e.data.length)onChunk(new Blob([pcmWav(e.data,24000)],{type:'audio/wav'}));else if(e.data?.type==='silence_pause'&&e.data.samples instanceof Float32Array&&e.data.samples.length)onChunk(new Blob([pcmWav(e.data.samples,24000)],{type:'audio/wav'}),Date.now());};
  const disconnect=()=>stream!.getTracks().forEach(t=>{t.onended=null;t.stop();});
  const abortCapture=()=>{disconnect();source.disconnect();node.port.onmessage=null;node.disconnect();silent.disconnect();void context.close().catch(()=>{});};
  signal?.addEventListener('abort',abortCapture,{once:true});stream!.getAudioTracks().forEach(track=>track.onended=()=>onFailure('Microphone disconnected. Transcript gap; end or restart the meeting.'));
  let stopped=false;return {stop(){if(stopped)return;stopped=true;signal?.removeEventListener('abort',abortCapture);disconnect();source.disconnect();return new Promise<void>(resolve=>{const finish=()=>{clearTimeout(flushTimeout);node.port.onmessage=null;node.disconnect();silent.disconnect();void context.close();resolve();};const handle=node.port.onmessage;node.port.onmessage=e=>{handle?.call(node.port,e);finish();};node.port.postMessage('flush');const flushTimeout=setTimeout(finish,300);});}};
 }catch(error){finished=true;release();throw error;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',cancel);}
}
