// Microphone only. No recorder/file storage, speaker identification or sound output.
class MeetingPCM extends AudioWorkletProcessor {
 constructor(){super();this.buffer=new Float32Array(240000);this.length=0;this.port.onmessage=e=>{if(e.data==='flush'&&this.length){this.port.postMessage(this.buffer.slice(0,this.length));this.length=0;}};}
 process(inputs){const input=inputs[0]?.[0];if(input)for(const sample of input){this.buffer[this.length++]=sample;if(this.length===this.buffer.length){this.port.postMessage(this.buffer.slice());this.length=0;}}return true;}
}
registerProcessor('meeting-pcm',MeetingPCM);
