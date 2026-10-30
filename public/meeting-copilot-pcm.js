// Microphone only. No recorder/file storage, speaker identification or sound output.
class MeetingPCM extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(120000);this.length=0;this.heardSpeech=false;this.quietSamples=0;this.pauseSent=false;this.pauseSamples=Math.round(sampleRate*0.75);this.port.onmessage=e=>{if(e.data==='flush'&&this.length){this.port.postMessage(this.buffer.slice(0,this.length));this.length=0;}};}
 process(inputs){const input=inputs[0]?.[0];if(!input)return true;let energy=0,peak=0;for(const sample of input){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));this.buffer[this.length++]=sample;if(this.length===this.buffer.length){this.port.postMessage(this.buffer.slice());this.length=0;}}
  const speaking=energy/Math.max(1,input.length)>0.000064||peak>0.024;if(speaking){if(!this.heardSpeech)this.port.postMessage({type:'audio_activity'});this.heardSpeech=true;this.quietSamples=0;this.pauseSent=false;}else if(this.heardSpeech&&!this.pauseSent){this.quietSamples+=input.length;if(this.quietSamples>=this.pauseSamples){this.pauseSent=true;if(this.length){this.port.postMessage({type:'silence_pause',samples:this.buffer.slice(0,this.length)});this.length=0;}this.heardSpeech=false;}}return true;}
}
registerProcessor('meeting-pcm',MeetingPCM);
