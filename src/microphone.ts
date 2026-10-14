import { locales, type Lang } from './model';
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: {results: { [index: number]: { [index: number]: {transcript: string} } }}) => void) | null;
  onerror: ((event: {error: string}) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
export class Microphone {
  private active: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private finish: (() => void) | undefined;
  stop() {
    const active = this.active; this.active = null;
    clearTimeout(this.timer);
    if (active) {active.onresult = null; active.onend = null; active.onerror = null; active.abort();}
    this.finish?.(); this.finish = undefined;
  }
  start(lang: Lang, onText: (text: string) => void, onStatus: (value: boolean) => void, onError: (message: string) => void) {
    this.stop();
    const w = window as unknown as { SpeechRecognition?: new() => Recognition; webkitSpeechRecognition?: new() => Recognition };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) throw Error('此浏览器不支持语音识别，请使用键盘输入。');
    if (!window.confirm('浏览器语音识别可能把音频发送给 Apple 或浏览器供应商，无法保证本地处理。仅本次主动录音，最长 30 秒，离开页面即停止。继续吗？')) return;
    const rec = new Constructor(); this.active = rec;
    rec.lang = locales[lang]; rec.continuous = false; rec.interimResults = false;
    rec.onresult = e => {if(this.active === rec) onText(e.results[0][0].transcript.slice(0,3000));};
    rec.onerror = e => {onError('识别失败：'+e.error);this.stop();};
    rec.onend = () => this.stop();
    this.finish = () => onStatus(false);
    try { rec.start(); onStatus(true); this.timer = setTimeout(() => this.stop(),30000); }
    catch { this.stop(); throw Error('无法开始录音，请检查麦克风权限。'); }
  }
}
