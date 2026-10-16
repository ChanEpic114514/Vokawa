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

export interface SpeechPart { text: string; lang: Lang }

/** Preserve every code unit. Group English phrases, numbers and punctuation together. */
export function speechParts(text: string, lang: Lang): SpeechPart[] {
  if (lang === "en") return sentences(text).map(text => ({ text, lang }));
  const result: SpeechPart[] = [];
  for (const sentence of sentences(text)) {
    const runs = sentence.match(/https?:\/\/[^\s\p{Script=Han}，。！？]+|[A-Za-z][A-Za-z0-9]*(?:[’'._@:/+-][A-Za-z0-9]+)*(?:[ \t]+(?:[A-Za-z][A-Za-z0-9]*(?:[’'._@:/+-][A-Za-z0-9]+)*|[0-9]+(?:[.:][0-9]+)*))*|[^A-Za-z]+/gu) || [];
    const parts: SpeechPart[] = [];
    let leading = "";
    for (const run of runs) {
      const script: Lang | undefined = /[A-Za-z]/.test(run) ? "en" : /\p{Script=Han}/u.test(run) ? lang : undefined;
      if (!script) {
        if (parts.length) parts[parts.length - 1].text += run;
        else leading += run;
      } else if (parts.at(-1)?.lang === script) parts[parts.length - 1].text += run;
      else { parts.push({ text: leading + run, lang: script }); leading = ""; }
    }
    if (leading) parts.push({ text: leading, lang });
    result.push(...parts);
  }
  return result;
}

export function speechPlan(text: string, lang: Lang, voices: SpeechSynthesisVoice[], preferred = "") {
  const parts = speechParts(text, lang);
  // Resolve all required voices before speaking, so a missing English voice cannot truncate playback.
  return parts.map(part => {
    const candidates = voices.filter(v => matches(v, part.lang));
    const voice = candidates.find(v => v.voiceURI === preferred)
      || (part.lang === "en" ? candidates.find(v => /^en[-_]GB$/i.test(v.lang)) : undefined)
      || candidates[0];
    if (!voice) throw Error(part.lang === "yue"
      ? "没有可用的本地香港粤语声音。请在设置刷新声音并检查 iPhone 的语音下载；不会改用普通话。 / Download a Hong Kong Cantonese voice and refresh voices."
      : part.lang === "en"
        ? "没有可用的本地英语声音。请下载英语声音后再播放。 / Download an English voice and refresh voices."
        : "没有此语言的本地声音，请检查系统语音设置。 / Check the device voice settings.");
    return { ...part, voice };
  });
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

    const parts = speechPlan(text, lang, window.speechSynthesis.getVoices(), voiceURI);
    const safeRate = Number.isFinite(rate) ? Math.max(0.6, Math.min(1.2, rate)) : 1;
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

      const utterance = new SpeechSynthesisUtterance(parts[index].text);
      this.utterance = utterance;

      const voice = parts[index].voice;
      utterance.lang = voice.lang;
      utterance.voice = voice;
      utterance.rate = safeRate;

      utterance.onend = () => {
        if (gen === this.generation && this.utterance === utterance) {
          this.utterance = null;
          clearTimeout(this.timeout);
          next(index + 1);
        }
      };

      utterance.onerror = (e) => {
        if (gen === this.generation && this.utterance === utterance) {
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
        Math.max(45000, (parts[index].text.length * 1500) / safeRate),
      );

      notify(`正在播放 ${index + 1}/${parts.length} · ${voice.name}`);
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        this.stop();
        notify("系统朗读启动失败，请再次点击播放。 / Speech could not start. Tap Play again.");
      }
    };

    next(0);
  }
}