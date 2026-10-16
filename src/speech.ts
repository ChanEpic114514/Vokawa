import type { Lang } from "./model";

export function matches(
  voice: Pick<SpeechSynthesisVoice, "lang" | "localService">,
  lang: Lang,
) {
  if (!voice.localService) return false;

  const code = voice.lang.toLowerCase().replaceAll("_", "-");

  if (lang === "yue") {
    return (
      code === "zh-hk" ||
      code === "yue" ||
      code === "yue-hk" ||
      code === "yue-hant-hk" ||
      code === "zh-hant-hk"
    );
  }

  if (lang === "zh") {
    return [
      "zh-cn",
      "zh-hans-cn",
      "cmn",
      "cmn-cn",
      "cmn-hans-cn",
    ].includes(code);
  }

  return /^en(-|$)/.test(code);
}

// Keep complete sentences without concatenating character recordings.
export function sentences(text: string): string[] {
  return text.match(/[^。！？!?\n]+[。！？!?\n]*|[。！？!?\n]+/g) || [];
}

export class Speaker {
  private generation = 0;
  private utterance: SpeechSynthesisUtterance | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private notify: ((message: string) => void) | undefined;
  private finished: (() => void) | undefined;

  stop() {
    this.generation++;
    clearTimeout(this.timeout);
    this.utterance = null;

    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    this.notify?.("已停止播放");
    this.notify = undefined;

    const done = this.finished;
    this.finished = undefined;
    done?.();
  }

  speak(
    text: string,
    lang: Lang,
    voiceURI: string,
    rate: number,
    notify: (message: string) => void,
    onFinished?: () => void,
  ) {
    this.stop();

    if (!text.trim()) {
      throw Error("请输入要朗读的文字。");
    }

    if (!("speechSynthesis" in window)) {
      throw Error("此浏览器不支持系统朗读。");
    }

    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => matches(voice, lang));

    const voice =
      voices.find((item) => item.voiceURI === voiceURI) || voices[0];

    if (!voice) {
      throw Error(
        lang === "yue"
          ? "没有可用的本地香港粤语声音。请在设置刷新声音并检查 iPhone 的语音下载；不会改用普通话。"
          : "没有此语言的本地声音，请检查系统语音设置。",
      );
    }

    const parts = sentences(text);
    const gen = this.generation;

    this.notify = notify;
    this.finished = onFinished;

    const next = (index: number) => {
      if (gen !== this.generation) return;

      if (index >= parts.length) {
        this.utterance = null;
        this.notify = undefined;
        notify("播放结束");

        const done = this.finished;
        this.finished = undefined;
        done?.();

        return;
      }

      const utterance = new SpeechSynthesisUtterance(parts[index]);
      this.utterance = utterance;

      utterance.lang = voice.lang;
      utterance.voice = voice;
      utterance.rate = rate;

      utterance.onend = () => {
        if (gen === this.generation) {
          clearTimeout(this.timeout);
          next(index + 1);
        }
      };

      utterance.onerror = (e) => {
        if (gen === this.generation) {
          this.stop();
          notify("播放失败：" + e.error + "。请再次点击播放。");
        }
      };

      this.timeout = setTimeout(
        () => {
          if (gen === this.generation) {
            this.stop();
            notify("系统朗读超时，请缩短句子后重试。");
          }
        },
        Math.max(45000, (parts[index].length * 1500) / rate),
      );

      notify(`正在播放 ${index + 1}/${parts.length} · ${voice.name}`);
      window.speechSynthesis.speak(utterance);
    };

    next(0);
  }
}