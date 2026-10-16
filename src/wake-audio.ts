import { setCaptureActive } from "./capture-state";
import { Features, type Frame } from "./wake-core";
import { t } from "./i18n";
const processor = `class Capture extends AudioWorkletProcessor {
 constructor(){super();this.buffer=[];this.position=0;this.source=[];}
 process(inputs){
  const channel=inputs[0]?.[0];if(!channel)return true;
  this.source.push(...channel);const step=sampleRate/16000;
  while(this.position+1<this.source.length){
   const k=Math.floor(this.position),f=this.position-k;
   this.buffer.push(this.source[k]*(1-f)+this.source[k+1]*f);this.position+=step;
   if(this.buffer.length===320){this.port.postMessage(new Float32Array(this.buffer));this.buffer=[];}
  }
  const used=Math.min(this.source.length,Math.floor(this.position));this.source.splice(0,used);this.position-=used;return true;
 }
}registerProcessor('vokawa-capture',Capture);`;
export class WakeAudio {
  private readonly captureSource = Symbol("WakeAudio");
  private generation = 0;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  stop() {
    setCaptureActive(this.captureSource, false);
    this.generation++;
    this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    this.node = null;
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
  }
  async start(
    onFrame: (frame: Frame) => void,
    onFailure: (message: string) => void,
  ) {
    this.stop();
    const id = this.generation;
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        t(
          "请通过 HTTPS 或 localhost 打开页面以使用麦克风。",
          "Open this page over HTTPS or localhost to use the microphone.",
        ),
      );
    const context = new AudioContext();
    this.context = context;
    try {
      await context.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      if (id !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      stream.getTracks().forEach(
        (track) =>
          (track.onended = () => {
            if (id === this.generation) {
              this.stop();
              onFailure(
                t(
                  "麦克风已断开，请重新开启。",
                  "Microphone disconnected. Please enable it again.",
                ),
              );
            }
          }),
      );
      const url = URL.createObjectURL(
        new Blob([processor], { type: "application/javascript" }),
      );
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      if (id !== this.generation) return;
      const features = new Features(),
        node = new AudioWorkletNode(context, "vokawa-capture");
      this.node = node;
      node.port.onmessage = (e) => {
        if (id === this.generation) features.push(e.data).forEach(onFrame);
      };
      node.onprocessorerror = () => {
        if (id === this.generation) {
          this.stop();
          onFailure(
            t(
              "声音处理已中断，请重新开启。",
              "Audio processing stopped. Please enable it again.",
            ),
          );
        }
      };
      const source = context.createMediaStreamSource(stream);
      this.source = source;
      source.connect(node);
      const silent = context.createGain();
      silent.gain.value = 0;
      node.connect(silent);
      silent.connect(context.destination);
      setCaptureActive(this.captureSource, true);
    } catch (e) {
      if (id !== this.generation) return;
      this.stop();
      throw e;
    }
  }
}
