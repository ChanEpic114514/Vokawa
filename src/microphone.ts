import { setCaptureActive } from "./capture-state";
import { locales, type Lang } from "./model";
import { t } from "./i18n";
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: {
        results: {
          [index: number]: { [index: number]: { transcript: string } };
        };
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
export function recognitionError(code: string) {
  const errors: Record<string, [string, string]> = {
    network: [
      "无法连接语音识别服务。请检查网络，或换用手机 Safari；也可以直接输入文字。",
      "Could not connect to the speech recognition service. Check your connection, try Safari on your phone, or type instead.",
    ],
    "not-allowed": [
      "麦克风权限被拒绝，请在浏览器设置中允许后重试。",
      "Microphone access was denied. Allow it in browser settings and try again.",
    ],
    "service-not-allowed": [
      "浏览器禁止使用语音识别服务，请改用键盘输入。",
      "The browser blocked speech recognition. Please type instead.",
    ],
    "audio-capture": [
      "无法使用麦克风，请检查设备或关闭其他录音程序。",
      "The microphone is unavailable. Check your device or close other recording apps.",
    ],
    "no-speech": [
      "没有听到语音，请点击录音后再说一次。",
      "No speech was detected. Tap the microphone and try again.",
    ],
    "no-result": [
      "语音识别已结束，但没有返回文字。请重试或直接输入。",
      "Speech recognition ended without a transcript. Try again or type instead.",
    ],
    "start-timeout": [
      "语音识别未能启动，请点击重试。",
      "Speech recognition did not start. Tap to try again.",
    ],
    timeout: [
      "录音已达 30 秒，请缩短内容后重试。",
      "Recording reached 30 seconds. Try a shorter phrase.",
    ],
    "language-not-supported": [
      "当前语音服务不支持所选语言，请切换语言或输入文字。",
      "The speech service does not support this language. Change the language or type instead.",
    ],
    aborted: ["录音已取消。", "Recording cancelled."],
  };
  const pair = errors[code];
  return pair
    ? t(...pair)
    : t("语音识别失败：", "Speech recognition failed: ") + code;
}
export class Microphone {
  private readonly captureSource = Symbol("Microphone");
  private active: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startup: ReturnType<typeof setTimeout> | undefined;
  private finish: (() => void) | undefined;
  stop() {
    setCaptureActive(this.captureSource, false);
    const rec = this.active;
    this.active = null;
    clearTimeout(this.timer);
    clearTimeout(this.startup);
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = rec.onstart = null;
      try {
        rec.abort();
      } catch {
        /* Already stopped. */
      }
    }
    const done = this.finish;
    this.finish = undefined;
    done?.();
  }
  start(
    lang: Lang,
    onText: (text: string) => void,
    onStatus: (value: boolean) => void,
    onError: (message: string) => void,
    options: { sessionConsent?: boolean; onReady?: () => void } = {},
  ) {
    this.stop();
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor)
      throw Error(
        t(
          "此浏览器不支持语音识别，请使用键盘输入。",
          "This browser does not support speech recognition. Please type instead.",
        ),
      );
    if (
      !options.sessionConsent &&
      !window.confirm(
        t(
          "语音识别可能把音频发送给浏览器供应商。本次录音最长 30 秒，离开页面即停止。继续吗？",
          "Speech recognition may send audio to your browser provider. Recording lasts up to 30 seconds and stops when you leave this page. Continue?",
        ),
      )
    ) {
      onError(recognitionError("aborted"));
      return;
    }
    const rec = new Constructor();
    this.active = rec;
    let hasText = false;
    rec.lang = locales[lang];
    rec.continuous = false;
    rec.interimResults = false;
    const fail = (code: string) => {
      if (this.active !== rec) return;
      onError(recognitionError(code));
      this.stop();
    };
    rec.onstart = () => {
      if (this.active !== rec) return;
      clearTimeout(this.startup);
      setCaptureActive(this.captureSource, true);
      options.onReady?.();
    };
    rec.onresult = (e) => {
      if (this.active !== rec) return;
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (text) {
        hasText = true;
        onText(text.slice(0, 3000));
      }
    };
    rec.onerror = (e) => fail(e.error);
    rec.onend = () => {
      if (this.active !== rec) return;
      if (!hasText) fail("no-result");
      else this.stop();
    };
    this.finish = () => onStatus(false);
    onStatus(true);
    this.startup = setTimeout(() => fail("start-timeout"), 8000);
    this.timer = setTimeout(() => fail("timeout"), 30000);
    try {
      rec.start();
    } catch {
      fail("audio-capture");
    }
  }
}
