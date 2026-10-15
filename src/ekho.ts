import keys from "./ekho-keys.json";
const available = new Set(keys);
export function recordingURL(jyutping: string): string | null {
  if (!/^[a-z]+[1-6]$/.test(jyutping) || !available.has(jyutping)) return null;
  return `${import.meta.env.BASE_URL}audio/ekho/${jyutping}.wav`;
}
export class EkhoPlayer {
  private audio: HTMLAudioElement | null = null;
  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
  }
  play(jyutping: string, notify: (message: string) => void) {
    this.stop();
    const url = recordingURL(jyutping);
    if (!url) {
      notify(`没有 ${jyutping} 的原始录音；不会替换声调或使用普通话。`);
      return;
    }
    // Start inside the user gesture; do not await a download before play().
    const audio = new Audio(url);
    this.audio = audio;
    audio.playbackRate = 1;
    audio.onended = () => {
      if (this.audio === audio) notify(`播放结束 · Ekho ${jyutping}`);
    };
    audio.onerror = () => {
      if (this.audio === audio)
        notify(
          `录音加载失败：${jyutping}。首次播放需要联网；请检查音频文件与连接。`,
        );
    };
    notify(`Ekho 原始单音节 · ${jyutping}`);
    void audio.play().catch(() => {
      if (this.audio === audio)
        notify("播放未获浏览器允许或音频不可用，请再次点击播放。");
    });
    // Full response, without Range, lets the PWA cache this clip for offline replay.
    void fetch(url).catch(() => {});
  }
}
