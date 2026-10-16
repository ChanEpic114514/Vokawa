import { Microphone } from "./microphone";
import { WakeAudio } from "./wake-audio";
import {
  UtteranceCapture,
  score,
  type WakeProfile,
} from "./wake-core";
import { t } from "./i18n";
import type { Lang } from "./model";

export type ListeningPhase =
  | "off"
  | "starting"
  | "waiting"
  | "handoff"
  | "dictation"
  | "translating";

type Options = {
  profile: WakeProfile;
  lang: Lang;
  onPhase: (phase: ListeningPhase) => void;
  onStatus: (message: string) => void;
  onLevel: (level: number) => void;
  onText: (text: string, signal: AbortSignal) => Promise<void>;
  onWake?: () => void;
};

export class ContinuousWake {
  private audio = new WakeAudio();
  private mic = new Microphone();
  private generation = 0;
  private running = false;
  private phase: ListeningPhase = "off";
  private options: Options | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private translation: AbortController | null = null;

  get translating() {
    return this.phase === "translating";
  }

  stop() {
    this.running = false;
    this.generation++;
    clearTimeout(this.timer);

    this.translation?.abort();
    this.translation = null;

    this.audio.stop();
    this.mic.stop();

    if (this.phase !== "off") this.changePhase("off");
    this.options?.onLevel(0);
  }

  start(options: Options) {
    this.stop();
    this.options = options;

    if (document.hidden) return;

    this.running = true;
    void this.listen();
  }

  private current(id: number) {
    return (
      this.running &&
      id === this.generation &&
      !document.hidden
    );
  }

  private changePhase(phase: ListeningPhase) {
    this.phase = phase;
    this.options?.onPhase(phase);
  }

  private fail(message: string) {
    this.stop();
    this.options?.onStatus(message);
  }

  private again(id: number, message: string) {
    if (!this.current(id)) return;

    this.options!.onStatus(message);
    this.changePhase("handoff");
    clearTimeout(this.timer);

    this.timer = setTimeout(() => {
      if (this.current(id)) void this.listen();
    }, 700);
  }

  private async listen() {
    if (!this.running || document.hidden) return;

    // Invalidate callbacks before releasing the previous session.
    const id = ++this.generation;
    const options = this.options!;

    clearTimeout(this.timer);
    this.audio.pause();
    this.mic.stop();

    this.changePhase("starting");
    options.onStatus(
      t("正在开启麦克风…", "Opening microphone…"),
    );

    const capture = new UtteranceCapture();
    let matched = false;

    this.timer = setTimeout(() => {
      if (this.current(id)) {
        this.fail(
          t(
            "麦克风未能启动，请重新开启。",
            "The microphone did not start. Please enable listening again.",
          ),
        );
      }
    }, 15000);

    try {
      await this.audio.start(
        (frame) => {
          if (!this.current(id) || matched) return;

          options.onLevel(Math.min(1, frame.rms * 10));

          const sequence = capture.push(frame);
          if (
            !sequence ||
            !(
              score(sequence, options.profile.templates) <=
              options.profile.threshold
            )
          ) {
            return;
          }

          matched = true;
          clearTimeout(this.timer);

          // Release the microphone before browser speech recognition.
          this.audio.pause();
          options.onLevel(0);
          this.changePhase("handoff");

          options.onStatus(
            t(
              "已唤醒，正在准备语音输入…",
              "Awake. Preparing speech input…",
            ),
          );

          options.onWake?.();

          this.timer = setTimeout(() => {
            if (this.current(id)) this.dictate(id);
          }, 350);
        },
        (message) => {
          if (this.current(id)) this.fail(message);
        },
      );

      if (!this.current(id) || matched) return;

      clearTimeout(this.timer);
      this.changePhase("waiting");
      options.onStatus(
        t(
          "持续监听中，请说咒语。请保持应用在前台。",
          "Listening for your wake phrase. Keep Vokawa in the foreground.",
        ),
      );
    } catch {
      if (this.current(id)) {
        this.fail(
          t(
            "无法开启麦克风，请检查权限后重新开启。",
            "Could not open the microphone. Check permission and enable listening again.",
          ),
        );
      }
    }
  }

  private dictate(id: number) {
    const options = this.options!;
    this.changePhase("dictation");

    let text = "";
    let failed = false;
    let completed = false;

    try {
      this.mic.start(
        options.lang,
        (value) => {
          if (this.current(id)) text = value;
        },
        (active) => {
          if (
            !active &&
            this.current(id) &&
            !failed &&
            !completed &&
            text
          ) {
            completed = true;
            void this.translate(id, text);
          }
        },
        (message, code) => {
          if (!this.current(id)) return;
          failed = true;

          if (
            ["no-speech", "no-result", "timeout"].includes(code || "")
          ) {
            this.again(
              id,
              t(
                "未收到完整内容，正在返回咒语监听…",
                "No complete speech received. Returning to wake listening…",
              ),
            );
          } else {
            // Do not repeatedly retry permission or network failures.
            this.fail(message);
          }
        },
        {
          sessionConsent: true,
          onReady: () => {
            if (this.current(id)) {
              options.onStatus(
                t(
                  "请说待翻译内容，最长 30 秒。",
                  "Say what you want to translate, up to 30 seconds.",
                ),
              );
            }
          },
        },
      );
    } catch (e) {
      if (this.current(id)) this.fail((e as Error).message);
    }
  }

  private async translate(id: number, text: string) {
    const controller = new AbortController();
    this.translation = controller;
    this.changePhase("translating");

    this.options!.onStatus(
      t(
        "正在翻译；如已开启自动朗读，将等待播放结束。",
        "Translating; if automatic playback is enabled, listening resumes after playback.",
      ),
    );

    try {
      await this.options!.onText(text, controller.signal);

      this.again(
        id,
        t(
          "已完成，正在返回咒语监听…",
          "Done. Returning to wake listening…",
        ),
      );
    } catch (e) {
      if (this.current(id)) this.fail((e as Error).message);
    } finally {
      if (this.translation === controller) {
        this.translation = null;
      }
    }
  }
}