// Microphone only. No recorder/file storage, speaker identification or sound output.
class MeetingPCM extends AudioWorkletProcessor {
 constructor(){
  super();
  this.buffer=new Float32Array(120000);
  this.length=0;
  this.heardSpeech=false;
  this.wasSpeaking=false;
  this.quietSamples=0;
  this.pauseSent=false;
  this.pauseSamples=Math.round(sampleRate*0.75);
  this.practiceEndpointing=false;
  this.practiceCheckpointSamples=Math.round(sampleRate*0.75);
  this.practiceMinAudioSamples=Math.round(sampleRate*0.16);
  this.practiceMinSpeechSamples=Math.round(sampleRate*0.08);
  this.practiceMinSustainedSpeechSamples=Math.round(sampleRate*0.06);
  this.practiceSpeechSamples=0;
  this.practiceCurrentSpeechRunSamples=0;
  this.practiceLongestSpeechRunSamples=0;
  this.practiceCheckpointSent=false;
  this.lastSpeechEndLength=0;
  this.processedSamples=0;
  this.lastSpeechEndSample=0;
  this.port.onmessage=e=>{
   const message=e.data;
   if(message?.type==='configure_practice_endpoint'){
    const silenceMs=Number(message.silenceMs),minAudioMs=Number(message.minAudioMs),minSpeechMs=Number(message.minSpeechMs),minSustainedSpeechMs=Number(message.minSustainedSpeechMs);
    if(Number.isFinite(silenceMs)&&silenceMs>=500&&silenceMs<=3000){
     this.practiceEndpointing=true;
     this.pauseSamples=Math.round(sampleRate*silenceMs/1000);
     if(Number.isFinite(minAudioMs)&&minAudioMs>=100&&minAudioMs<=1000)this.practiceMinAudioSamples=Math.round(sampleRate*minAudioMs/1000);
     if(Number.isFinite(minSpeechMs)&&minSpeechMs>=40&&minSpeechMs<=500)this.practiceMinSpeechSamples=Math.round(sampleRate*minSpeechMs/1000);
     if(Number.isFinite(minSustainedSpeechMs)&&minSustainedSpeechMs>=40&&minSustainedSpeechMs<=300)this.practiceMinSustainedSpeechSamples=Math.round(sampleRate*minSustainedSpeechMs/1000);
     this.length=0;this.heardSpeech=false;this.wasSpeaking=false;this.quietSamples=0;this.pauseSent=false;this.practiceCheckpointSent=false;this.practiceSpeechSamples=0;this.practiceCurrentSpeechRunSamples=0;this.practiceLongestSpeechRunSamples=0;this.lastSpeechEndLength=0;
    }
    return;
   }
   if(message==='clear_turn'){
    this.length=0;this.heardSpeech=false;this.wasSpeaking=false;this.quietSamples=0;this.pauseSent=false;this.practiceCheckpointSent=false;this.practiceSpeechSamples=0;this.practiceCurrentSpeechRunSamples=0;this.practiceLongestSpeechRunSamples=0;this.lastSpeechEndLength=0;
    return;
   }
   if(message==='flush_turn'){
    if(this.length){this.port.postMessage({type:'explicit_turn_flush',samples:this.buffer.slice(0,this.length)});this.length=0;}
    this.port.postMessage({type:'flush_complete'});
    return;
   }
   if(message==='flush'&&this.length){this.port.postMessage(this.buffer.slice(0,this.length));this.length=0;}
  };
 }
 append(input){
  let offset=0;
  while(offset<input.length){
   const count=Math.min(this.buffer.length-this.length,input.length-offset);
   this.buffer.set(input.subarray(offset,offset+count),this.length);this.length+=count;offset+=count;
   if(this.length===this.buffer.length){this.port.postMessage(this.buffer.slice());this.length=0;if(this.practiceEndpointing){this.practiceSpeechSamples=0;this.practiceCurrentSpeechRunSamples=0;this.practiceLongestSpeechRunSamples=0;}}
  }
 }
 practicePacketEligible(samples){
  return samples.length>=this.practiceMinAudioSamples&&this.practiceSpeechSamples>=this.practiceMinSpeechSamples&&this.practiceLongestSpeechRunSamples>=this.practiceMinSustainedSpeechSamples;
 }
 process(inputs){
  const input=inputs[0]?.[0];if(!input)return true;
  this.processedSamples+=input.length;
  let energy=0,peak=0;for(const sample of input){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  const speaking=energy/Math.max(1,input.length)>0.000064||peak>0.024;
  if(this.practiceEndpointing){
   if(speaking){
    if(!this.wasSpeaking){
     this.port.postMessage({type:'audio_activity'});
     if(this.practiceCheckpointSent){this.length=0;this.lastSpeechEndLength=0;this.practiceSpeechSamples=0;this.practiceCurrentSpeechRunSamples=0;this.practiceLongestSpeechRunSamples=0;}
    }
    this.heardSpeech=true;this.wasSpeaking=true;this.quietSamples=0;this.pauseSent=false;this.practiceCheckpointSent=false;
    this.append(input);this.lastSpeechEndLength=this.length;this.practiceSpeechSamples+=input.length;this.practiceCurrentSpeechRunSamples+=input.length;this.practiceLongestSpeechRunSamples=Math.max(this.practiceLongestSpeechRunSamples,this.practiceCurrentSpeechRunSamples);this.lastSpeechEndSample=this.processedSamples;
   }else if(this.heardSpeech){this.wasSpeaking=false;this.practiceCurrentSpeechRunSamples=0;this.append(input);this.quietSamples+=input.length;}
   if(this.heardSpeech&&!this.practiceCheckpointSent&&this.quietSamples>=this.practiceCheckpointSamples){
    this.practiceCheckpointSent=true;
    const samples=this.lastSpeechEndLength>0?this.buffer.slice(0,this.lastSpeechEndLength):new Float32Array(0);
    if(this.practicePacketEligible(samples)){
     this.port.postMessage({type:'practice_partial',samples,quietMs:this.quietSamples/sampleRate*1000,speechEndSample:this.lastSpeechEndSample,audioDurationMs:samples.length/sampleRate*1000,activeSpeechMs:this.practiceSpeechSamples/sampleRate*1000,sustainedSpeechMs:this.practiceLongestSpeechRunSamples/sampleRate*1000});
     this.length=0;this.lastSpeechEndLength=0;this.practiceSpeechSamples=0;this.practiceLongestSpeechRunSamples=0;
    }else{
     this.port.postMessage({type:'practice_checkpoint_skipped',reason:'insufficient_meaningful_audio',quietMs:this.quietSamples/sampleRate*1000,audioDurationMs:samples.length/sampleRate*1000,activeSpeechMs:this.practiceSpeechSamples/sampleRate*1000,sustainedSpeechMs:this.practiceLongestSpeechRunSamples/sampleRate*1000});
    }
   }
   if(this.heardSpeech&&!this.pauseSent&&this.quietSamples>=this.pauseSamples){
    this.pauseSent=true;
    const candidate=this.lastSpeechEndLength>0?this.buffer.slice(0,this.lastSpeechEndLength):new Float32Array(0);
    const samples=this.practicePacketEligible(candidate)?candidate:new Float32Array(0);
    this.port.postMessage({type:'practice_endpoint',samples,silenceMs:this.quietSamples/sampleRate*1000,speechEndSample:this.lastSpeechEndSample,endpointSample:this.processedSamples,audioDurationMs:samples.length/sampleRate*1000,activeSpeechMs:this.practiceSpeechSamples/sampleRate*1000,sustainedSpeechMs:this.practiceLongestSpeechRunSamples/sampleRate*1000,closureOnly:samples.length===0});
    this.length=0;this.lastSpeechEndLength=0;this.practiceSpeechSamples=0;this.practiceCurrentSpeechRunSamples=0;this.practiceLongestSpeechRunSamples=0;this.heardSpeech=false;this.wasSpeaking=false;this.quietSamples=0;this.practiceCheckpointSent=false;
   }
   return true;
  }
  this.append(input);
  if(speaking){if(!this.heardSpeech)this.port.postMessage({type:'audio_activity'});this.heardSpeech=true;this.quietSamples=0;this.pauseSent=false;}
  else if(this.heardSpeech&&!this.pauseSent){this.quietSamples+=input.length;if(this.quietSamples>=this.pauseSamples){this.pauseSent=true;if(this.length){this.port.postMessage({type:'silence_pause',samples:this.buffer.slice(0,this.length)});this.length=0;}this.heardSpeech=false;}}
  return true;
 }
}
registerProcessor('meeting-pcm',MeetingPCM);
