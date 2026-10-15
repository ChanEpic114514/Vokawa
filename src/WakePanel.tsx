import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { t, useLocale } from "./i18n";
import { Icon } from "./Icon";
import { Microphone } from "./microphone";
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
  onText: (value: string) => void;
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
  const [positive, setPositive] = useState<number[]>([]),
    [negative, setNegative] = useState<number[]>([]);
  const [mode, setMode] = useState<Mode>("templates");
  const [phase, setPhase] = useState<
    "off" | "sample" | "starting" | "waiting" | "handoff" | "dictation"
  >("off");
  const [status, setStatus] = useState(""),
    [consent, setConsent] = useState(false),
    [retry, setRetry] = useState(false),
    [level, setLevel] = useState(0);
  const audio = useRef(new WakeAudio()),
    mic = useRef(new Microphone()),
    generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const beep = useRef<AudioContext | null>(null);
  function stop() {
    generation.current++;
    clearTimeout(timeout.current);
    audio.current.stop();
    mic.current.stop();
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
    if (disabled) stop();
  }, [disabled]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    const leave = () => stop();
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
    const id = generation.current,
      capture = new UtteranceCapture();
    let taken = false;
    setStatus(
      t(
        "请先安静一秒，然后说一句，结束后停顿。",
        "Stay quiet for one second, then say one phrase and pause.",
      ),
    );
    timeout.current = setTimeout(() => {
      if (id === generation.current)
        error(
          t(
            "未能收录完整语音，请重试。",
            "No complete phrase was captured. Please try again.",
          ),
        );
    }, 20000);
    try {
      await audio.current.start((frame) => {
        if (id !== generation.current || taken) return;
        setLevel(Math.min(1, frame.rms * 10));
        const sequence = capture.push(frame);
        if (!sequence) return;
        taken = true;
        if (kind === "templates")
          setTemplates((values) => [...values, sequence].slice(0, 5));
        else {
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
      if (id === generation.current)
        error(
          t(
            "无法开启麦克风，请检查权限与浏览器支持。",
            "Could not open the microphone. Check permission and browser support.",
          ),
        );
    }
  }
  const [calibrationFailed, setCalibrationFailed] = useState(false);
  function save() {
    setCalibrationFailed(false);
    try {
      const next: WakeProfile = {
        version: 2,
        sampleRate: 16000,
        templates,
        threshold: calibrate(positive, negative),
      };
      if (!parseProfile(JSON.stringify(next))) throw Error("samples");
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
  function beginDictation(saved: WakeProfile) {
    const id = generation.current;
    setPhase("dictation");
    let failed = false,
      received = false;
    try {
      mic.current.start(
        lang,
        (text) => {
          if (id === generation.current) {
            received = true;
            onText(text);
          }
        },
        (active) => {
          if (!active && id === generation.current && !failed && received) {
            setStatus(
              t("已填写文字，可点击翻译。", "Text is ready. Tap Translate."),
            );
            timeout.current = setTimeout(() => {
              if (id === generation.current) void listen(saved);
            }, 700);
          }
        },
        (message) => {
          failed = true;
          error(message);
          setRetry(true);
        },
        {
          sessionConsent: true,
          onReady: () =>
            setStatus(
              t(
                "请说待翻译内容，最长 30 秒。",
                "Say what you want to translate, up to 30 seconds.",
              ),
            ),
        },
      );
    } catch (e) {
      error((e as Error).message);
      setRetry(true);
    }
  }
  async function listen(saved: WakeProfile) {
    audio.current.stop();
    mic.current.stop();
    clearTimeout(timeout.current);
    const id = ++generation.current;
    setPhase("starting");
    setRetry(false);
    setStatus(t("正在开启麦克风…", "Opening microphone…"));
    const capture = new UtteranceCapture();
    let matched = false;
    timeout.current = setTimeout(() => {
      if (id === generation.current)
        error(
          t(
            "麦克风未能启动，请检查权限。",
            "The microphone did not start. Check its permission.",
          ),
        );
    }, 15000);
    try {
      await audio.current.start((frame) => {
        if (id !== generation.current || matched) return;
        setLevel(Math.min(1, frame.rms * 10));
        const sequence = capture.push(frame);
        if (!sequence) return;
        if (score(sequence, saved.templates) <= saved.threshold) {
          matched = true;
          audio.current.stop();
          setLevel(0);
          setPhase("handoff");
          setStatus(
            t("已唤醒，正在准备语音输入…", "Awake. Preparing speech input…"),
          );
          const context = beep.current;
          if (context?.state === "running") {
            const oscillator = context.createOscillator(),
              gain = context.createGain();
            oscillator.frequency.value = 740;
            gain.gain.value = 0.08;
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.12);
          }
          timeout.current = setTimeout(() => {
            if (id === generation.current) beginDictation(saved);
          }, 350);
        }
      }, error);
      if (id === generation.current) {
        clearTimeout(timeout.current);
        setPhase("waiting");
        setStatus(
          t(
            "正在聆听咒语。请保持页面打开。",
            "Listening for your wake phrase. Keep this page open.",
          ),
        );
      }
    } catch {
      if (id === generation.current)
        error(
          t(
            "无法开启麦克风，请检查浏览器权限。",
            "Could not open the microphone. Check browser permission.",
          ),
        );
    }
  }
  function enable() {
    if (!profile || !consent) return;
    stop();
    onPrepare();
    try {
      beep.current = new AudioContext();
      void beep.current.resume().catch(() => {});
    } catch {
      /* A visual status is always available. */
    }
    void listen(profile);
  }
  const active = phase !== "off";
  return (
    <div className="wake-panel">
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
          "咒语在本机识别。只在你开启后聆听，离开页面即停止。",
          "The wake phrase is matched on this device. Listening starts only when enabled and stops when you leave the page.",
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
              <button disabled={active} onClick={() => setMode("positive")}>
                {t("下一步", "Next")}
                <Icon name="arrow" />
              </button>
            )}
            {mode === "positive" && positive.length >= 3 && (
              <button disabled={active} onClick={() => setMode("negative")}>
                {t("下一步", "Next")}
                <Icon name="arrow" />
              </button>
            )}
            {mode === "negative" && negative.length >= 3 && (
              <button className="primary" disabled={active} onClick={save}>
                {t("保存咒语", "Save wake phrase")}
              </button>
            )}
            {calibrationFailed && (
              <>
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
                "允许本次唤醒后使用语音输入。转写音频可能发送给浏览器供应商。",
                "Allow speech input after waking in this session. Transcription audio may be sent to your browser provider.",
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
              {t("开启咒语唤醒", "Enable wake phrase")}
            </button>
            {retry && (
              <button
                disabled={active || !consent || disabled}
                onClick={() => {
                  stop();
                  onPrepare();
                  setRetry(false);
                  beginDictation(profile);
                }}
              >
                <Icon name="mic" />
                {t("重试语音输入", "Retry speech input")}
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
                )
                  return;
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
