import { LensPanel } from "./LensPanel";
import { CaptureAurora } from "./CaptureAurora";
import { RELEASE } from "./release";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  apiCall,
  loadSaved,
  type Entry,
  type Lang,
  type Settings,
} from "./model";
import { t, useLocale, setLocale, languageName } from "./i18n";
import { messageText } from "./messages";
import { Icon, type IconName } from "./Icon";
import { Speaker, matches } from "./speech";
import { EkhoPlayer, recordingURL } from "./ekho";
import { CantonesePlayer, selectedReadings } from "./cantonese";
import { Microphone } from "./microphone";
import { pronunciation, jyutping } from "./pronunciation";
import { onlineTranslate } from "./translation";
import { nativeTranslation } from "./hk-native";
import { WakePanel, type WakeHandle } from "./WakePanel";

export type Tab = "translate" | "lens" | "chat" | "sound" | "book" | "settings";

const tabs: Tab[] = ["translate", "lens", "chat", "sound", "book", "settings"];

const tabNames: Record<Tab, [string, string]> = {
  translate: ["翻译", "Translate"],
  lens: ["镜头", "Lens"],
  chat: ["对话", "Converse"],
  sound: ["听读", "Listen"],
  book: ["记录", "Phrasebook"],
  settings: ["设置", "Settings"],
};

const titles = tabNames;

const descriptions: Record<Tab, [string, string]> = {
  lens: ["拍照识字，翻译并朗读", "Capture text, translate and listen"],
  translate: [
    "英语、普通话与粤语互译",
    "Translate between English, Mandarin and Cantonese",
  ],
  chat: [
    "轮流输入，翻译并朗读对话",
    "Take turns translating and listening",
  ],
  sound: [
    "整句朗读与单字发音",
    "Sentence playback and character pronunciation",
  ],
  book: [
    "查看翻译历史与收藏",
    "Translation history and saved phrases",
  ],
  settings: [
    "语言、语音与本机存储设置",
    "Language, speech and local storage settings",
  ],
};

export function CharacterAudio({
  text,
  onPlay,
  onStop,
  onChange,
}: {
  text: string;
  onPlay: (value: string) => void;
  onStop: () => void;
  onChange?: (choices: Record<number, string>) => void;
}) {
  const candidates = useMemo(() => pronunciation(text), [text]);
  const [choices, setChoices] = useState<Record<number, string>>({});

  return (
    <details className="character-audio">
      <summary>
        <Icon name="sound" />
        <span>{t("逐字听读", "Listen character by character")}</span>
        <Icon name="chevron" size={16} />
      </summary>

      <p className="muted">
        {t(
          "点选单字听录音；多音字可切换读音。这些选择不会改变系统整句朗读。",
          "Tap a character to hear its recording. Choose a different reading for polyphonic characters; this does not change system speech.",
        )}
      </p>

      <div className="readings">
        {candidates.map(([char, readings], i) => {
          const value = choices[i] || readings[0] || "";

          if (!value) {
            return (
              <span className="punctuation" key={i}>
                {char}
              </span>
            );
          }

          return (
            <div className="reading" key={i}>
              <button
                disabled={!recordingURL(value)}
                title={value}
                aria-label={`${t("听读", "Listen to")} ${char} ${value}`}
                onClick={() => onPlay(value)}
              >
                <span>{char}</span>
                <Icon name="sound" size={14} />
              </button>

              {readings.length > 1 ? (
                <select
                  aria-label={`${t("读音", "Reading")} ${char} ${i + 1}`}
                  value={value}
                  onChange={(e) => {
                    onStop();
                    const next = { ...choices, [i]: e.target.value };
                    setChoices(next);
                    onChange?.(next);
                  }}
                >
                  {readings.map((reading) => (
                    <option key={reading}>{reading}</option>
                  ))}
                </select>
              ) : (
                <small>{value}</small>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function LanguageSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Lang;
  onChange: (lang: Lang) => void;
}) {
  return (
    <label className="language-select">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Lang)}
      >
        {(["en", "zh", "yue"] as Lang[]).map((lang) => (
          <option key={lang} value={lang}>
            {languageName(lang)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Wave({ active = false }: { active?: boolean }) {
  return (
    <div className={`wave ${active ? "moving" : ""}`} aria-hidden="true">
      {[18, 32, 50, 74, 56, 94, 120, 85, 62, 76, 44, 28, 16].map(
        (height, i) => (
          <i
            key={i}
            style={{ height, animationDelay: `${i * 0.08}s` }}
          />
        ),
      )}
    </div>
  );
}

export default function App({
  initialTab = "translate",
}: { initialTab?: Tab } = {}) {
  const locale = useLocale();
  const [saved] = useState(loadSaved);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [settings, setSettings] = useState<Settings>(saved.settings);
  const [history, setHistory] = useState<Entry[]>(saved.history);

  const [source, setSource] = useState<Lang>("en");
  const [target, setTarget] = useState<Lang>("yue");

  const [input, setInput] = useState("");
  const [result, setResult] = useState<Entry | null>(null);
  const [turns, setTurns] = useState<Entry[]>([]);

  const [busy, setBusy] = useState(false);
  const [lensBusy, setLensBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState("");
  const [recording, setRecording] = useState(false);

  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine,
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [readingChoices, setReadingChoices] =
    useState<Record<number, string>>({});

  const [token, setToken] = useState("");
  const [reading, setReading] = useState("");
  const [query, setQuery] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [full, setFull] = useState("");

  const speaker = useRef(new Speaker());
  const ekho = useRef(new EkhoPlayer());
  const canto = useRef(new CantonesePlayer());
  const mic = useRef(new Microphone());

  const wake = useRef<WakeHandle>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousLocale = useRef(locale);

  const notify = (value: string) => setMessage(messageText(value));

  function cancel() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setProgress("");
  }

  function stopSound() {
    speaker.current.stop();
    ekho.current.stop();
    canto.current.stop();
  }

  function stop() {
    stopSound();
    mic.current.stop();
    wake.current?.stop();
  }

  function updateInput(value: string) {
    wake.current?.stop();
    cancel();
    setInput(value);
    setResult(null);
    setMessage("");
  }

  function changeTab(value: Tab) {
    cancel();
    stop();
    setMessage("");
    if (value === "lens" || tab === "lens") { setInput(""); setResult(null); }
    setTab(value);
  }

  function setting<K extends keyof Settings>(key: K, value: Settings[K]) {
    cancel();
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function refreshVoices() {
    setVoices(window.speechSynthesis?.getVoices() || []);
  }

  useEffect(() => {
    try {
      localStorage.setItem(
        "vokawa-v2",
        JSON.stringify({ settings, history }),
      );
    } catch {
      setMessage(
        t(
          "本机存储不可用或已满，记录可能无法保存。",
          "Device storage is unavailable or full. Your phrases may not be saved.",
        ),
      );
    }
  }, [settings, history]);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-Hans" : "en";

    if (previousLocale.current !== locale) {
      stop();
      cancel();
      setMessage("");
      previousLocale.current = locale;
    }
  }, [locale]);

  useEffect(() => {
    refreshVoices();

    const hide = () => {
      if (document.hidden) {
        stop();
        cancel();
      }
    };

    const leave = () => {
      stop();
      cancel();
    };

    const network = () => setOnline(navigator.onLine);

    window.speechSynthesis?.addEventListener(
      "voiceschanged",
      refreshVoices,
    );
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);

    return () => {
      stop();
      request.current?.abort();

      window.speechSynthesis?.removeEventListener(
        "voiceschanged",
        refreshVoices,
      );
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);

  useEffect(() => {
    if (full && !dialog.current?.open) dialog.current?.showModal();
  }, [full]);

  function swap() {
    stop();
    cancel();

    setSource(target);
    setTarget(source);

    if (tab === "translate" && result) {
      setInput(result.targetText);
    } else {
      setInput("");
    }

    setResult(null);
    setMessage("");
  }

  function changeLanguage(value: Lang, side: "source" | "target") {
    stop();
    cancel();
    setResult(null);
    setMessage("");

    if (side === "source") {
      setSource(value);
      if (value === target) setTarget(source);
    } else {
      setTarget(value);
      if (value === source) setSource(target);
    }
  }

  function play(text: string, lang: Lang) {
    stop();

    try {
      speaker.current.speak(
        text,
        lang,
        settings.voice,
        settings.rate,
        notify,
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }

  function playCharacter(value: string) {
    stop();
    ekho.current.play(value, notify);
  }

  function dictate() {
    stop();
    cancel();

    try {
      mic.current.start(
        source,
        (text) => updateInput(text),
        setRecording,
        notify,
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }

  async function translate(text = input, wakeSignal?: AbortSignal) {
    if (!text.trim() || wakeSignal?.aborted || (tab === "lens" && (lensBusy || text.length > 3000))) return;

    if (wakeSignal) {
      stopSound();
      mic.current.stop();
      setInput(text);
    } else {
      stop();
    }

    cancel();
    setMessage("");
    setResult(null);

    const id = generation.current;
    const controller = new AbortController();
    request.current = controller;

    const abortWake = () => {
      controller.abort();
      speaker.current.stop();
    };

    wakeSignal?.addEventListener("abort", abortWake, { once: true });

    setBusy(true);

    const snapshot = text.trim();
    const from = source;
    const to = target;
    const timer = setTimeout(() => controller.abort(), 180000);

    try {
      const data =
        settings.translationProvider === "mymemory"
          ? await onlineTranslate(
              snapshot,
              from,
              to,
              controller.signal,
              (done, total) => {
                if (id === generation.current) {
                  setProgress(`${done}/${total}`);
                }
              },
            )
          : await apiCall(
              settings.api,
              token,
              "/translate",
              {
                text: snapshot,
                source: from,
                target: to,
                context:
                  tab === "chat"
                    ? turns
                        .filter((entry) => entry.targetText.length <= 6000)
                        .slice(-6)
                        .map((entry) => ({
                          source: entry.source,
                          target: entry.target,
                          sourceText: entry.sourceText,
                          targetText: entry.targetText,
                        }))
                    : [],
              },
              controller.signal,
            );

      if (id !== generation.current || controller.signal.aborted) {
        throw new DOMException("Translation cancelled", "AbortError");
      }

      if (
        typeof data.translation !== "string" ||
        !data.translation.trim() ||
        data.translation.length > 20000
      ) {
        throw Error(
          t(
            "服务没有返回有效译文。",
            "The service did not return a valid translation.",
          ),
        );
      }

      const localized = nativeTranslation(data, snapshot, to);
      const entry: Entry = {
        id: crypto.randomUUID(),
        source: from,
        target: to,
        sourceText: snapshot,
        targetText: localized.translation,
        engine: localized.engine || settings.translationProvider,
        notice: localized.notice,
        favorite: false,
      };

      setResult(entry);

      if (settings.save) {
        setHistory((values) => [entry, ...values].slice(0, 1000));
      }

      if (tab === "chat") {
        setTurns((values) => [...values, entry].slice(-30));
        setInput("");
      }

      if (settings.auto) {
        if (wakeSignal) {
          // Resume wake listening only after playback has finished.
          await new Promise<void>((resolve) => {
            try {
              speaker.current.speak(
                entry.targetText,
                to,
                settings.voice,
                settings.rate,
                notify,
                resolve,
              );
            } catch (e) {
              notify((e as Error).message);
              resolve();
            }
          });
        } else {
          try {
            speaker.current.speak(
              entry.targetText,
              to,
              settings.voice,
              settings.rate,
              notify,
            );
          } catch (e) {
            notify((e as Error).message);
          }
        }
      }
    } catch (e) {
      const errorMessage = controller.signal.aborted
        ? t(
            "翻译已取消或超时，请重试。",
            "Translation was cancelled or timed out. Please try again.",
          )
        : (e as Error).message;

      if (id === generation.current && !wakeSignal?.aborted) {
        notify(errorMessage);
      }

      if (wakeSignal) throw Error(errorMessage);
    } finally {
      clearTimeout(timer);
      wakeSignal?.removeEventListener("abort", abortWake);

      if (id === generation.current) {
        setBusy(false);
        setProgress("");
        request.current = null;
      }
    }
  }

  function favorite(entry: Entry) {
    const current = history.find((item) => item.id === entry.id);
    const value = !(current?.favorite ?? entry.favorite);

    setHistory((values) =>
      current
        ? values.map((item) =>
            item.id === entry.id ? { ...item, favorite: value } : item,
          )
        : [{ ...entry, favorite: value }, ...values].slice(0, 1000),
    );

    if (result?.id === entry.id) {
      setResult({ ...result, favorite: value });
    }

    setTurns((values) =>
      values.map((item) =>
        item.id === entry.id ? { ...item, favorite: value } : item,
      ),
    );
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t("已复制。", "Copied."));
    } catch {
      setFull(text);
      setMessage(
        t(
          "请在放大视图中长按文字复制。",
          "Press and hold the text in the expanded view to copy it.",
        ),
      );
    }
  }

  const actions = (entry: Entry) => (
    <div className="result-actions">
      <button
        className="listen-button"
        onClick={() => play(entry.targetText, entry.target)}
      >
        <Icon name="sound" />
        {t("听译文", "Listen")}
      </button>

      <div className="icon-actions">
        <button
          className={entry.favorite ? "icon-button selected" : "icon-button"}
          aria-label={
            entry.favorite ? t("取消收藏", "Unsave") : t("收藏", "Save")
          }
          onClick={() => favorite(entry)}
        >
          <Icon name="star" />
        </button>

        <button
          className="icon-button"
          aria-label={t("复制", "Copy")}
          onClick={() => void copy(entry.targetText)}
        >
          <Icon name="copy" />
        </button>

        <button
          className="icon-button"
          aria-label={t("放大", "Expand")}
          onClick={() => setFull(entry.targetText)}
        >
          <Icon name="expand" />
        </button>
      </div>
    </div>
  );

  const filtered = history.filter(
    (entry) =>
      (!onlySaved || entry.favorite) &&
      (entry.sourceText + " " + entry.targetText)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            changeTab("translate");
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}vokawa-icon-v2.png`}
            alt=""
          />
          <span>
            vokawa<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="sidebar-label">{t("功能", "WORKSPACE")}</div>

        <nav aria-label={t("主导航", "Main navigation")}>
          {tabs.map((item) => (
            <button
              key={item}
              className={tab === item ? "nav-item active" : "nav-item"}
              aria-current={tab === item ? "page" : undefined}
              onClick={() => changeTab(item)}
            >
              <Icon name={item as IconName} />
              <span>{t(...tabNames[item])}</span>
              {tab === item && <i />}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>VOKAWA · {RELEASE}</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            <span>Vokawa</span>
            <span>/</span>
            {t(...tabNames[tab])}
          </span>

          <div className="topbar-tools">
            <a
              className="release-link"
              href={`${import.meta.env.BASE_URL}api/update.html`}
              onClick={stop}
              aria-label={t("检查更新", "Check for updates")}
            >
              v{RELEASE}
            </a>

            <span className={`connection ${online ? "" : "offline"}`}>
              <i />
              {online ? t("已连接", "Online") : t("离线", "Offline")}
            </span>

            <div
              className="locale-switch"
              aria-label={t("界面语言", "Interface language")}
            >
              <button
                aria-pressed={locale === "zh"}
                onClick={() => setLocale("zh")}
              >
                中文
              </button>
              <button
                aria-pressed={locale === "en"}
                onClick={() => setLocale("en")}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        <main>
          <section className="hero">
            <div>
              <h1>{t(...titles[tab])}</h1>
              <p>{t(...descriptions[tab])}</p>
            </div>
          </section>

          <CaptureAurora onStop={stop} />

          {(tab === "translate" || tab === "chat" || tab === "lens") && (
            <>
              <div className="language-bar">
                <LanguageSelect
                  label={t("从", "FROM")}
                  value={source}
                  onChange={(value) => changeLanguage(value, "source")}
                />

                <button
                  className="swap-button"
                  onClick={swap}
                  aria-label={t("交换语言", "Swap languages")}
                >
                  <Icon name="swap" />
                </button>

                <LanguageSelect
                  label={t("到", "TO")}
                  value={target}
                  onChange={(value) => changeLanguage(value, "target")}
                />

                <span className="language-bar-note">
                  <Icon name="globe" size={15} />
                  {tab === "lens" ? t("图片文字识别", "Text from images") : t("文字与语音输入", "Text and voice input")}
                </span>
              </div>

              {tab === "lens" && <LensPanel source={source} onText={updateInput} onPrepare={() => { stop(); updateInput(""); }} onBusy={setLensBusy} />}
              <div className="translation-grid">
                <section className="panel input-panel">
                  <div className="panel-heading">
                    <span>
                      <i className="panel-dot" />
                      {languageName(source)}
                    </span>

                    <button
                      className="icon-button"
                      disabled={!input}
                      aria-label={t("清空输入", "Clear input")}
                      onClick={() => {
                        stop();
                        updateInput("");
                      }}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  </div>

                  <textarea
                    disabled={tab === "lens" && lensBusy}
                    aria-label={t("待翻译内容", "Text to translate")}
                    placeholder={tab === "lens" ? t("识别后在这里校对文字，再点击翻译。", "Review recognized text here, then select Translate.") : t("有什么想说的？", "What would you like to say?")}
                    value={input}
                    maxLength={3000}
                    onChange={(e) => updateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        (e.ctrlKey || e.metaKey)
                      ) {
                        e.preventDefault();
                        void translate();
                      }
                    }}
                  />

                  <div className="input-meta">
                    <span>{input.length.toLocaleString()} / 3,000</span>
                    <span>⌘ / Ctrl + Enter</span>
                  </div>

                  <div className="input-actions">
                    <button
                      className={
                        recording
                          ? "record-button recording"
                          : "record-button"
                      }
                      disabled={tab === "lens" && lensBusy}
                      onClick={
                        recording ? () => mic.current.stop() : dictate
                      }
                      aria-label={
                        recording
                          ? t("停止录音", "Stop recording")
                          : t("语音输入", "Voice input")
                      }
                    >
                      <Icon name={recording ? "stop" : "mic"} />
                      <span>
                        {recording
                          ? t("正在聆听", "Listening")
                          : t("语音输入", "Voice input")}
                      </span>
                    </button>

                    <button
                      className="primary"
                      disabled={!busy && (!input.trim() || (tab === "lens" && (lensBusy || input.length > 3000)))}
                      onClick={
                        busy
                          ? () => {
                              stop();
                              cancel();
                            }
                          : () => void translate()
                      }
                    >
                      {busy ? t("取消", "Cancel") : t("翻译", "Translate")}
                      <Icon name={busy ? "close" : "arrow"} />
                    </button>
                  </div>
                </section>

                <section
                  className={`panel output-panel ${busy ? "is-busy" : ""}`}
                  aria-busy={busy}
                >
                  <div className="panel-heading">
                    <span>
                      <i className="panel-dot mint" />
                      {languageName(target)}
                    </span>
                    <span className="output-label">
                      {t("译文", "TRANSLATION")}
                    </span>
                  </div>

                  {result ? (
                    <>
                      <div
                        className="translation-text"
                        lang={
                          target === "yue"
                            ? "zh-HK"
                            : target === "zh"
                              ? "zh-CN"
                              : "en"
                        }
                      >
                        {result.targetText}
                      </div>

                      {settings.jp && target === "yue" && (
                        <p className="jyutping">
                          {jyutping(result.targetText)}
                        </p>
                      )}

                      {actions(result)}

                      {target === "yue" && (
                        <CharacterAudio
                          key={result.id}
                          text={result.targetText}
                          onPlay={playCharacter}
                          onStop={stopSound}
                        />
                      )}
                    </>
                  ) : (
                    <div className="output-empty">
                      <Wave active={busy} />
                      <p role="status">
                        {busy
                          ? t("正在翻译…", "Translating…")
                          : tab === "lens" ? t("等待识别与翻译", "Ready to recognize and translate") : t(
                              "等待你的第一句话",
                              "Your next connection starts here",
                            )}
                      </p>
                      <span>
                        {busy
                          ? progress
                          : t(
                              "译文会出现在这里",
                              "Your translation will appear here",
                            )}
                      </span>
                    </div>
                  )}
                </section>
              </div>

              <div className="translation-footnote">
                <span>
                  {t(
                    "机器翻译可能存在误差。",
                    "Machine translations may contain errors.",
                  )}
                </span>
                <button className="text-button" onClick={stopSound}>
                  <Icon name="stop" size={12} />
                  {t("停止播放", "Stop playback")}
                </button>
              </div>

              {tab !== "lens" && <details
                className="wake-card"
                onToggle={(e) => {
                  if (!e.currentTarget.open) wake.current?.stop();
                }}
              >
                <summary>
                  <span className="feature-icon">
                    <Icon name="magic" />
                  </span>
                  <span>
                    <strong>
                      {t("持续监听", "Continuous listening")}
                    </strong>
                    <small>
                      {t(
                        "前台咒语唤醒，自动转写与翻译",
                        "Wake, transcribe and translate while in the foreground",
                      )}
                    </small>
                  </span>
                  <Icon name="chevron" size={18} />
                </summary>

                <WakePanel
                  ref={wake}
                  lang={source}
                  disabled={busy}
                  onPrepare={() => {
                    stopSound();
                    mic.current.stop();
                  }}
                  onText={(text, signal) => translate(text, signal)}
                />
              </details>}

              {tab === "chat" && (
                <section className="conversation">
                  <div className="section-heading">
                    <h2>{t("这段对话", "This conversation")}</h2>
                    <button
                      className="text-button"
                      onClick={() => setTurns([])}
                    >
                      {t("清空", "Clear")}
                    </button>
                  </div>

                  {turns.length ? (
                    turns.map((entry) => (
                      <article
                        className="conversation-turn"
                        key={entry.id}
                      >
                        <div>
                          <small>{languageName(entry.source)}</small>
                          <p>{entry.sourceText}</p>
                        </div>
                        <Icon name="arrow" size={16} />
                        <div>
                          <small>{languageName(entry.target)}</small>
                          <p>{entry.targetText}</p>
                          {actions(entry)}
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted">
                      {t(
                        "翻译后，点击交换语言，让另一位接着说。",
                        "After translating, swap languages and let the other person speak.",
                      )}
                    </p>
                  )}
                </section>
              )}
            </>
          )}

          {tab === "sound" && (
            <section className="panel reading-panel">
              <div className="panel-heading">
                <span>
                  <i className="panel-dot mint" />
                  {t("粤语听读", "Cantonese listening")}
                </span>
                <Icon name="sound" />
              </div>

              <textarea
                aria-label={t("粤语文字", "Cantonese text")}
                placeholder={t(
                  "输入你想听的粤语文字…",
                  "Enter Cantonese text to listen…",
                )}
                value={reading}
                maxLength={3000}
                onChange={(e) => {
                  stopSound();
                  setReading(e.target.value);
                  setReadingChoices({});
                }}
              />

              {settings.jp && reading && (
                <p className="jyutping">{jyutping(reading)}</p>
              )}

              <div className="action-row">
                <button
                  className="primary"
                  disabled={!reading.trim()}
                  onClick={() => play(reading, "yue")}
                >
                  <Icon name="sound" />
                  {t("朗读整句", "Read aloud")}
                </button>
                <button onClick={stopSound}>
                  <Icon name="stop" />
                  {t("停止", "Stop")}
                </button>
              </div>

              {reading && (
                <CharacterAudio
                  key={reading}
                  text={reading}
                  onPlay={playCharacter}
                  onStop={stopSound}
                  onChange={setReadingChoices}
                />
              )}

              <details className="advanced">
                <summary>
                  {t("其他音频来源", "Other audio sources")}
                </summary>
                <p className="muted">
                  {t(
                    "可播放随应用附带的完整录音；其他文字需要你配置语音服务。",
                    "Play an included full recording when available. Other text needs a speech service configured in Settings.",
                  )}
                </p>
                <div className="action-row">
                  <button
                    disabled={!reading.trim()}
                    onClick={() => {
                      stop();

                      void canto.current
                        .play(
                          reading,
                          selectedReadings(reading, readingChoices),
                          settings.speechApi,
                          settings.speechKind,
                          token,
                          settings.rate,
                          notify,
                        )
                        .catch((e) => notify(e.message));
                    }}
                  >
                    {t(
                      "录音／语音服务",
                      "Recording / speech service",
                    )}
                  </button>

                  <button onClick={() => canto.current.replay()}>
                    {t("重播", "Replay")}
                  </button>
                </div>
              </details>
            </section>
          )}

          {tab === "book" && (
            <>
              <div className="book-toolbar">
                <div className="segmented">
                  <button
                    aria-pressed={!onlySaved}
                    onClick={() => setOnlySaved(false)}
                  >
                    {t("全部记录", "All phrases")}{" "}
                    <span>{history.length}</span>
                  </button>
                  <button
                    aria-pressed={onlySaved}
                    onClick={() => setOnlySaved(true)}
                  >
                    {t("收藏", "Saved")}{" "}
                    <span>
                      {history.filter((entry) => entry.favorite).length}
                    </span>
                  </button>
                </div>

                <label className="search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label={t("搜索记录", "Search phrases")}
                    placeholder={t("搜索你的表达", "Find your words")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>

              <div className="phrase-list">
                {filtered.length ? (
                  filtered.map((entry) => (
                    <article className="panel phrase-card" key={entry.id}>
                      <div className="phrase-meta">
                        <span>
                          {languageName(entry.source)}{" "}
                          <Icon name="arrow" size={12} />{" "}
                          {languageName(entry.target)}
                        </span>
                        <button
                          className="icon-button"
                          aria-label={t("删除记录", "Delete phrase")}
                          onClick={() => {
                            setHistory((values) =>
                              values.filter((item) => item.id !== entry.id),
                            );
                            if (result?.id === entry.id) {
                              setResult({ ...result, favorite: false });
                            }
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>

                      <p className="source-text">{entry.sourceText}</p>
                      <p className="saved-translation">
                        {entry.targetText}
                      </p>
                      {actions(entry)}
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <Icon name="book" size={38} />
                    <h2>
                      {query
                        ? t("没有找到这句话", "No matching phrases")
                        : t(
                            "还没有保存的翻译",
                            "No saved translations yet",
                          )}
                    </h2>
                    <p>
                      {t(
                        "翻译后的记录会出现在这里，点击星标即可收藏。",
                        "Your translations will appear here. Tap the star to keep a favorite.",
                      )}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === "settings" && (
            <div className="settings-grid">
              <section className="panel settings-panel">
                <div className="section-heading">
                  <h2>{t("偏好", "Preferences")}</h2>
                  <Icon name="settings" />
                </div>

                <label className="settings-row">
                  <span>{t("界面语言", "Interface language")}</span>
                  <select
                    value={locale}
                    onChange={(e) =>
                      setLocale(e.target.value as "zh" | "en")
                    }
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </label>

                <label className="field">
                  <span>
                    {t("粤语系统声音", "Cantonese system voice")}
                  </span>
                  <select
                    value={settings.voice}
                    onChange={(e) => setting("voice", e.target.value)}
                  >
                    <option value="">
                      {t(
                        "系统默认粤语声音",
                        "Default Cantonese voice",
                      )}
                    </option>

                    {voices
                      .filter((voice) => matches(voice, "yue"))
                      .map((voice) => (
                        <option key={voice.voiceURI} value={voice.voiceURI}>
                          {voice.name}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  className="text-button"
                  onClick={() => {
                    refreshVoices();
                    setMessage(
                      t("已刷新声音列表。", "Voice list refreshed."),
                    );
                  }}
                >
                  <Icon name="refresh" size={15} />
                  {t("刷新声音", "Refresh voices")}
                </button>

                <p className="muted small">
                  {t(
                    "若没有声音，请在设备系统设置中下载香港粤语声音，再返回刷新。",
                    "If no voice is available, download a Hong Kong Cantonese voice in system settings, then refresh.",
                  )}
                </p>

                <label className="field rate-field">
                  <span>
                    {t("朗读速度", "Playback speed")}{" "}
                    <b>{settings.rate.toFixed(2)}×</b>
                  </span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.2"
                    step="0.05"
                    value={settings.rate}
                    onChange={(e) => {
                      stopSound();
                      setting("rate", Number(e.target.value));
                    }}
                  />
                </label>

                {(
                  [
                    [
                      "auto",
                      t(
                        "自动播放译文",
                        "Play translations automatically",
                      ),
                    ],
                    ["jp", t("显示粤拼", "Show Jyutping")],
                    ["save", t("保存翻译记录", "Save translation history")],
                  ] as const
                ).map(([key, label]) => (
                  <label className="settings-row" key={key}>
                    <span>{label}</span>
                    <input
                      className="toggle"
                      type="checkbox"
                      checked={settings[key]}
                      onChange={(e) => setting(key, e.target.checked)}
                    />
                  </label>
                ))}
              </section>

              <div>
                <section className="panel settings-panel">
                  <h2>{t("连接与隐私", "Connections & privacy")}</h2>

                  <label className="field">
                    <span>{t("翻译服务", "Translation service")}</span>
                    <select
                      value={settings.translationProvider}
                      onChange={(e) =>
                        setting(
                          "translationProvider",
                          e.target.value as Settings["translationProvider"],
                        )
                      }
                    >
                      <option value="mymemory">MyMemory</option>
                      <option value="backend">
                        {t("自己的后端", "Own backend")}
                      </option>
                    </select>
                  </label>

                  <p className="muted">
                    {t(
                      "翻译文字会发送到所选服务。MyMemory 有免费额度限制。历史记录与咒语样本保存在当前浏览器中。",
                      "Translation text is sent to the selected service. MyMemory has a free usage limit. History and wake phrase samples stay in this browser.",
                    )}
                  </p>

                  <p className="muted">
                    {t(
                      "语音输入只在主动开启后工作，可能使用浏览器供应商的在线转写。锁屏或后台聆听不受支持。",
                      "Speech input runs only when enabled and may use online transcription from your browser provider. Listening in the background or on the lock screen is not supported.",
                    )}
                  </p>

                  <details className="advanced">
                    <summary>
                      {t("自定义服务", "Custom services")}
                    </summary>

                    <label className="field">
                      <span>
                        {t("翻译后端地址", "Translation backend URL")}
                      </span>
                      <input
                        value={settings.api}
                        onChange={(e) => setting("api", e.target.value)}
                      />
                    </label>

                    <label className="field">
                      <span>
                        {t("语音服务地址", "Speech service URL")}
                      </span>
                      <input
                        value={settings.speechApi}
                        onChange={(e) =>
                          setting("speechApi", e.target.value)
                        }
                      />
                    </label>

                    <label className="field">
                      <span>{t("语音接口", "Speech API type")}</span>
                      <select
                        value={settings.speechKind}
                        onChange={(e) =>
                          setting(
                            "speechKind",
                            e.target.value as Settings["speechKind"],
                          )
                        }
                      >
                        <option value="fastapi">FastAPI</option>
                        <option value="gradio">Gradio</option>
                      </select>
                    </label>

                    <label className="field">
                      <span>
                        {t(
                          "令牌（仅本次会话）",
                          "Token (this session only)",
                        )}
                      </span>
                      <input
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </label>
                  </details>

                  <button
                    className="text-button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "清除全部历史记录和收藏？",
                            "Clear all history and saved phrases?",
                          ),
                        )
                      ) {
                        setHistory([]);

                        if (result) {
                          setResult({ ...result, favorite: false });
                        }

                        setTurns((values) =>
                          values.map((entry) => ({
                            ...entry,
                            favorite: false,
                          })),
                        );
                      }
                    }}
                  >
                    <Icon name="trash" size={15} />
                    {t(
                      "清除记录与收藏",
                      "Clear history and saved phrases",
                    )}
                  </button>
                </section>

                <section className="install-card">
                  <Icon name="globe" size={25} />
                  <h3>
                    {t("把 Vokawa 放进口袋", "Take Vokawa with you")}
                  </h3>
                  <p>
                    {t(
                      "在 iPhone Safari 打开部署网址，点击分享，再选择“添加到主屏幕”。",
                      "Open your deployed URL in iPhone Safari, tap Share, then Add to Home Screen.",
                    )}
                  </p>
                  <a
                    href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(
                      "开源许可与音频来源",
                      "Licenses & audio sources",
                    )}{" "}
                    ↗
                  </a>
                </section>
              </div>
            </div>
          )}

          <footer className="page-footer">
            <span>vokawa.</span>
            <p>
              {t("让语言，成为连接。", "Let language bring you closer.")}
            </p>
            <small>EN / 普 / 粵</small>
          </footer>
        </main>
      </div>

      {message && (
        <div className="toast" role="status">
          <Icon name="sound" size={18} />
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label={t("关闭提示", "Dismiss message")}
            onClick={() => setMessage("")}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        onClose={() => setFull("")}
        className="full-dialog"
      >
        <button
          className="icon-button"
          aria-label={t("关闭", "Close")}
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
        <p>{full}</p>
      </dialog>
    </div>
  );
}