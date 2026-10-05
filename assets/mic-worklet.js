// Mono PCM capture only. The output is deliberately silent: no mic monitoring.
class SandyMicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.length = 0;
    this.port.onmessage = event => {
      if(event.data === "flush") { this.flush(); this.port.postMessage({flushed:true}); }
    };
  }
  flush() {
    if(!this.length) return;
    const data = this.buffer.slice(0,this.length);
    this.port.postMessage({samples:data},[data.buffer]);
    this.length = 0;
  }
  process(inputs,outputs) {
    for(const channel of outputs[0]||[]) channel.fill(0);
    const channels = inputs[0];
    if(!channels?.length) return true;
    for(let i=0;i<channels[0].length;i++) {
      let sample = 0;
      for(const channel of channels) sample += channel[i]||0;
      this.buffer[this.length++] = sample/channels.length;
      if(this.length === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor("sandy-mic",SandyMicProcessor);
