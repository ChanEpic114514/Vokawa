import { RELEASE } from "./release";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { t, useLocale } from "./i18n";
import { Icon } from "./Icon";
import {
  ContinuousWake,
  type ListeningPhase,
} from "./continuous-wake";
import { WakeAudio } from "./wake-audio";
import {
  WAKE_KEY,
  UtteranceCapture,
  calibrate,
  parseProfile,
  score,
  type Sequence,
  type WakeProfile,
} from "./wake-core";
import type { Lang } from "./model";
import "./wake.css";

export interface WakeHandle {
  stop(): void;
}

type Props = {
  lang: Lang;
  disabled: boolean;
  onPrepare: () => void;
  onText: (value: string, signal: AbortSignal) => Promise<void>;
};

type Mode = "templates" | "positive" | "negative";

export const WakePanel = forwardRef<WakeHandle, Props>(function WakePanel(
  { lang, disabled, onPrepare, onText },
  ref,
) {
  const locale = useLocale();

  const [profile, setProfile] = useState<WakeProfile | null>(() => {
    try {
      return parseProfile(localStorage.getItem(WAKE_KEY));
    } catch {
      return null;
    }
  });

  const [templates, setTemplates] = useState<Sequence[]>([]);
  const [positive, setPositive] = useState<number[]>([]);
  const [negative, setNegative] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>("templates");
  const [phase, setPhase] =
    useState<ListeningPhase | "sample">("off");

  const [status, setStatus] = useState("");
  const [consent, setConsent] = useState(false);
  const [retry, setRetry] = useState(false);
  const [level, setLevel] = useState(0);
  const [calibrationFailed, setCalibrationFailed] = useState(false);

  const audio = useRef(new WakeAudio());
  const loop = useRef(new ContinuousWake());
  const generation = useRef(0);
  const timeout =
    useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const beep = useRef<AudioContext | null>(null);
  const latestOnText = useRef(onText);

  useEffect(() => {
    latestOnText.current = onText;
  }, [onText]);

  function stop() {
    generation.current++;
    clearTimeout(timeout.current);

    audio.current.stop();
    loop.current.stop();

    setPhase("off");
    setLevel(0);

    void beep.current?.close().catch(() => {});
    beep.current = null;
  }

  useImperativeHandle(ref, () => ({ stop }));

  useEffect(() => {
    stop();
    setStatus("");
    setConsent(false);
    setRetry(false);
  }, [lang, locale]);

  useEffect(() => {
    if (disabled && !loop.current.translating) stop();
  }, [disabled]);

  useEffect(() => {
    const leave = () => {
      stop();
      setStatus(
        t(
          "监听已停止，返回前台后请重新开启。",
          "Listening stopped. Enable it again when you return.",
        ),
      );
    };

    const hide = () => {
      if (document.hidden) leave();
    };

    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
    };
  }, []);

  function error(message: string) {
    stop();
    setStatus(message);
  }

  async function capture(kind: Mode) {
    stop();
    onPrepare();
    setRetry(false);
    setPhase("starting");

    const id = generation.current;
    const capture = new UtteranceCapture();
    let taken = false;

    setStatus(
      t(
        "请先安静一秒，然后说一句，结束后停顿。",
        "Stay quiet for one second, then say one phrase and pause.",
      ),
    );

    timeout.current = setTimeout(() => {
      if (id === generation.current) {
        error(
          t(
            "未能收录完整语音，请重试。",
            "No complete phrase was captured. Please try again.",
          ),
        );
      }
    }, 20000);

    try {
      await audio.current.start((frame) => {
        if (id !== generation.current || taken) return;

        setLevel(Math.min(1, frame.rms * 10));

        const sequence = capture.push(frame);
        if (!sequence) return;
        taken = true;

        if (kind === "templates") {
          setTemplates((values) => [...values, sequence].slice(0, 5));
        } else {
          const value = score(sequence, templates);

          if (!Number.isFinite(value)) {
            error(
              t(
                "长度差异太大，请用长度接近的语句重新录制。",
                "Try a phrase of a similar length.",
              ),
            );
            return;
          }

          (kind === "positive" ? setPositive : setNegative)((values) =>
            [...values, value].slice(-30),
          );
        }

        stop();
        setStatus(t("已收录。", "Phrase captured."));
      }, error);

      if (id === generation.current) setPhase("sample");
    } catch {
      if (id === generation.current) {
        error(
          t(
            "无法开启麦克风，请检查权限与浏览器支持。",
            "Could not open the microphone. Check permission and browser support.",
          ),
        );
      }
    }
  }

  function save() {
    setCalibrationFailed(false);

    try {
      const next: WakeProfile = {
        version: 2,
        sampleRate: 16000,
        templates,
        threshold: calibrate(positive, negative),
      };

      if (!parseProfile(JSON.stringify(next))) {
        throw Error("samples");
      }

      localStorage.setItem(WAKE_KEY, JSON.stringify(next));
      setProfile(next);

      setStatus(
        t(
          "咒语已保存，下次无需重新录制。",
          "Wake phrase saved. You will not need to record it on each visit.",
        ),
      );
    } catch (e) {
      setCalibrationFailed((e as Error).message === "overlap");

      setStatus(
        (e as Error).message === "samples"
          ? t(
              "请完成三遍咒语、三次确认和三次其他语句。",
              "Record three templates, three matching phrases and three different phrases.",
            )
          : (e as Error).message === "overlap"
            ? t(
                "当前样本的匹配结果仍有重叠。你说的话可以完全不同，但声学匹配未能区分；可保留模板，仅重新收录确认或对比语句。",
                "The recorded samples still overlap in acoustic matching, even if their words differ. Keep your templates and rerecord the matching or different phrases.",
              )
            : t(
                "本机无法保存，请检查浏览器存储空间。",
                "Could not save on this device. Check browser storage.",
              ),
      );
    }
  }

  function enable() {
    if (!profile || !consent || disabled || document.hidden) return;

    stop();
    onPrepare();
    setRetry(false);

    try {
      beep.current = new AudioContext();
      void beep.current.resume().catch(() => {});
    } catch {
      /* A visual status is always available. */
    }

    loop.current.start({
      profile,
      lang,
      onText: (text, signal) => latestOnText.current(text, signal),

      onPhase: (next) => {
        setPhase(next);

        if (next === "off") {
          void beep.current?.close().catch(() => {});
          beep.current = null;
          setRetry(true);
        }
      },

      onStatus: setStatus,
      onLevel: setLevel,

      onWake: () => {
        const context = beep.current;
        if (context?.state !== "running") return;

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.frequency.value = 740;
        gain.gain.value = 0.08;

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };

        oscillator.start();
        oscillator.stop(context.currentTime + 0.12);
      },
    });
  }

  const active = phase !== "off";

  return (
    <div className="wake-panel">
      <p className="muted">
        Vokawa {RELEASE} ·{" "}
        <a
          href={`${import.meta.env.BASE_URL}api/update.html`}
          onClick={stop}
        >
          {t("检查更新", "Check for updates")}
        </a>
      </p>

      <div className="wake-intro">
        <div className="wake-orb" aria-hidden="true">
          <Icon name="magic" size={28} />
        </div>
        <div>
          <h3>Konamito Kanumeya</h3>
          <p className="phonetic">
            ko · na · mi · to <span>／</span> ka · nu · me · ya
          </p>
        </div>
      </div>

      <p className="muted">
        {t(
          "开启后持续在本机检测咒语，唤醒后转写并自动翻译，完成后继续等待。切换后台或锁屏会停止。",
          "Once enabled, Vokawa listens locally for your wake phrase, transcribes and translates, then listens again. Switching to the background or locking the screen stops the session.",
        )}
      </p>

      {!profile ? (
        <>
          <div className="wake-steps">
            <span className={mode === "templates" ? "current" : ""}>
              01 {t("录制", "Record")}
            </span>
            <span className={mode === "positive" ? "current" : ""}>
              02 {t("确认", "Match")}
            </span>
            <span className={mode === "negative" ? "current" : ""}>
              03 {t("区分", "Distinguish")}
            </span>
          </div>

          <p>
            {mode === "templates"
              ? t(
                  "按平时的音量与速度，分别录制三遍咒语。每次先安静一秒。",
                  "Record your wake phrase three times at your usual pace and volume. Begin each take with one quiet second.",
                )
              : mode === "positive"
                ? t(
                    "再正常念三遍咒语，让应用适应自然的快慢变化。",
                    "Say the wake phrase three more times, with natural variations in pace.",
                  )
                : t(
                    "录制三句长度接近的其他语句，例如日常聊天；不要念咒语。",
                    "Record three different phrases of similar length, such as everyday speech. Do not say the wake phrase.",
                  )}
          </p>

          <div className="action-row">
            <button
              disabled={
                active ||
                disabled ||
                (mode === "templates" && templates.length >= 5)
              }
              onClick={() => void capture(mode)}
            >
              <Icon name="mic" />
              {t("录制一遍", "Record a take")}{" "}
              <span>
                {mode === "templates"
                  ? templates.length
                  : mode === "positive"
                    ? positive.length
                    : negative.length}
                /3
              </span>
            </button>

            {mode === "templates" && templates.length >= 3 && (
              <button
                disabled={active}
                onClick={() => setMode("positive")}
              >
                {t("下一步", "Next")}
                <Icon name="arrow" />
              </button>
            )}

            {mode === "positive" && positive.length >= 3 && (
              <button
                disabled={active}
                onClick={() => setMode("negative")}
              >
                {t("下一步", "Next")}
                <Icon name="arrow" />
              </button>
            )}

            {mode === "negative" && negative.length >= 3 && (
              <button
                className="primary"
                disabled={active}
                onClick={save}
              >
                {t("保存咒语", "Save wake phrase")}
              </button>
            )}

            {calibrationFailed && (
              <>
                <details>
                  <summary>
                    {t(
                      "校准详情（可复制反馈）",
                      "Calibration details (copy for support)",
                    )}
                  </summary>
                  <p>
                    {t(
                      "距离越小表示声学匹配越接近；这里不判断句子意思。",
                      "Smaller distances indicate a closer acoustic match; this does not compare meaning.",
                    )}
                  </p>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {JSON.stringify(
                      {
                        version: RELEASE,
                        matching: positive.map((value) =>
                          Number.isFinite(value) ? value : "unmatched",
                        ),
                        different: negative.map((value) =>
                          Number.isFinite(value) ? value : "unmatched",
                        ),
                        maxMatching: Math.max(...positive),
                        minDifferent: Math.min(...negative),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>

                <button
                  disabled={active}
                  onClick={() => {
                    setPositive([]);
                    setMode("positive");
                    setCalibrationFailed(false);
                    setStatus("");
                  }}
                >
                  {t("重录咒语确认", "Rerecord matching phrases")}
                </button>

                <button
                  disabled={active}
                  onClick={() => {
                    setNegative([]);
                    setMode("negative");
                    setCalibrationFailed(false);
                    setStatus("");
                  }}
                >
                  {t("重录对比语句", "Rerecord different phrases")}
                </button>
              </>
            )}

            <button
              className="quiet"
              disabled={active}
              onClick={() => {
                setCalibrationFailed(false);
                setTemplates([]);
                setPositive([]);
                setNegative([]);
                setMode("templates");
                setStatus("");
              }}
            >
              {t("重新录制", "Start over")}
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={active}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {t(
                "允许本次前台会话持续检测咒语，并在每次唤醒后转写和翻译。转写音频可能发送给浏览器供应商，文字会发送给所选翻译服务。",
                "Allow wake listening and automatic transcription and translation throughout this foreground session. Transcription audio may go to your browser provider; text goes to the selected translation service.",
              )}
            </span>
          </label>

          <div className="action-row">
            <button
              className="primary"
              disabled={!consent || active || disabled}
              onClick={enable}
            >
              <Icon name="magic" />
              {t("开启持续监听", "Start continuous listening")}
            </button>

            {retry && (
              <button
                disabled={active || !consent || disabled}
                onClick={enable}
              >
                <Icon name="mic" />
                {t("重新开启监听", "Restart listening")}
              </button>
            )}

            <button
              className="quiet"
              disabled={active}
              onClick={() => {
                if (
                  !window.confirm(
                    t(
                      "重新录制咒语？当前保存的咒语会保留至新录制完成。",
                      "Record again? The saved phrase stays available until you save its replacement.",
                    ),
                  )
                ) {
                  return;
                }

                setProfile(null);
                setCalibrationFailed(false);
                setTemplates([]);
                setPositive([]);
                setNegative([]);
                setMode("templates");
                setStatus("");
              }}
            >
              {t("重新校准", "Recalibrate")}
            </button>
          </div>
        </>
      )}

      {active && (
        <div className="wake-live">
          <span className="live-dot" />
          <div className="level">
            <i style={{ width: `${Math.max(3, level * 100)}%` }} />
          </div>
          <button
            onClick={() => {
              stop();
              setStatus(t("已停止聆听。", "Listening stopped."));
            }}
          >
            <Icon name="stop" />
            {t("停止", "Stop")}
          </button>
        </div>
      )}

      <p role="status" className="wake-status">
        {status}
      </p>
    </div>
  );
});