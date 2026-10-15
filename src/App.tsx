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
import { WakePanel, type WakeHandle } from "./WakePanel";
export type Tab = "translate" | "chat" | "sound" | "book" | "settings";
const tabs: Tab[] = ["translate", "chat", "sound", "book", "settings"];
const tabNames: Record<Tab, [string, string]> = {
  translate: ["翻译", "Translate"],
  chat: ["对话", "Converse"],
  sound: ["听读", "Listen"],
  book: ["记录", "Phrasebook"],
  settings: ["设置", "Settings"],
};
const titles: Record<Tab, [string, string]> = {
  translate: ["让每一句，都更靠近。", "A little closer.\nIn every language."],
  chat: ["让对话，自然继续。", "Keep the\nconversation flowing."],
  sound: ["听见语言的细节。", "Find the sound\nof every word."],
  book: ["把想说的话，留在这里。", "Words worth\nkeeping."],
  settings: ["你的语言，你的节奏。", "Make yourself\nat home."],
};
const descriptions: Record<Tab, [string, string]> = {
  translate: [
    "英语、普通话、粤语。随心表达，自然交流。",
    "English, Mandarin, Cantonese. A space for everything you want to say.",
  ],
  chat: [
    "在两种语言之间，轮流表达。",
    "Take turns and let your words meet halfway.",
  ],
  sound: [
    "从一句话，到每一个字。",
    "From the whole thought to the smallest sound.",
  ],
  book: [
    "重温对话，收藏下一次会用到的表达。",
    "Revisit a conversation. Save a phrase for the next one.",
  ],
  settings: [
    "按你的习惯，调整 Vokawa。",
    "A few small choices to make Vokawa yours.",
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
          if (!value)
            return (
              <span className="punctuation" key={i}>
                {char}
              </span>
            );
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
                  {readings.map((r) => (
                    <option key={r}>{r}</option>
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
      <select value={value} onChange={(e) => onChange(e.target.value as Lang)}>
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
          <i key={i} style={{ height, animationDelay: `${i * 0.08}s` }} />
        ),
      )}
    </div>
  );
}
export default function App({
  initialTab = "translate",
}: { initialTab?: Tab } = {}) {
  const locale = useLocale(),
    [saved] = useState(loadSaved);
  const [tab, setTab] = useState<Tab>(initialTab),
    [settings, setSettings] = useState<Settings>(saved.settings),
    [history, setHistory] = useState<Entry[]>(saved.history);
  const [source, setSource] = useState<Lang>("en"),
    [target, setTarget] = useState<Lang>("yue");
  const [input, setInput] = useState(""),
    [result, setResult] = useState<Entry | null>(null),
    [turns, setTurns] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [message, setMessage] = useState(""),
    [recording, setRecording] = useState(false);
  const [online, setOnline] = useState(
      typeof navigator === "undefined" || navigator.onLine,
    ),
    [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [readingChoices, setReadingChoices] = useState<Record<number, string>>(
    {},
  );
  const [token, setToken] = useState(""),
    [reading, setReading] = useState(""),
    [query, setQuery] = useState(""),
    [onlySaved, setOnlySaved] = useState(false),
    [full, setFull] = useState("");
  const speaker = useRef(new Speaker()),
    ekho = useRef(new EkhoPlayer()),
    canto = useRef(new CantonesePlayer()),
    mic = useRef(new Microphone());
  const wake = useRef<WakeHandle>(null),
    request = useRef<AbortController | null>(null),
    generation = useRef(0),
    dialog = useRef<HTMLDialogElement>(null),
    previousLocale = useRef(locale);
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
    cancel();
    setInput(value);
    setResult(null);
    setMessage("");
  }
  function changeTab(value: Tab) {
    cancel();
    stop();
    setMessage("");
    setTab(value);
  }
  function setting<K extends keyof Settings>(key: K, value: Settings[K]) {
    cancel();
    setSettings((s) => ({ ...s, [key]: value }));
  }
  function refreshVoices() {
    setVoices(window.speechSynthesis?.getVoices() || []);
  }
  useEffect(() => {
    try {
      localStorage.setItem("vokawa-v2", JSON.stringify({ settings, history }));
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
      },
      leave = () => {
        stop();
        cancel();
      },
      network = () => setOnline(navigator.onLine);
    window.speechSynthesis?.addEventListener("voiceschanged", refreshVoices);
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
    if (tab === "translate" && result) setInput(result.targetText);
    else setInput("");
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
      speaker.current.speak(text, lang, settings.voice, settings.rate, notify);
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
  async function translate() {
    if (!input.trim()) return;
    stop();
    cancel();
    setMessage("");
    setResult(null);
    const id = generation.current,
      controller = new AbortController();
    request.current = controller;
    setBusy(true);
    const snapshot = input.trim(),
      from = source,
      to = target;
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
                if (id === generation.current) setProgress(`${done}/${total}`);
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
                        .filter((e) => e.targetText.length <= 6000)
                        .slice(-6)
                        .map((e) => ({
                          source: e.source,
                          target: e.target,
                          sourceText: e.sourceText,
                          targetText: e.targetText,
                        }))
                    : [],
              },
              controller.signal,
            );
      if (id !== generation.current) return;
      if (
        typeof data.translation !== "string" ||
        !data.translation.trim() ||
        data.translation.length > 20000
      )
        throw Error(
          t(
            "服务没有返回有效译文。",
            "The service did not return a valid translation.",
          ),
        );
      const entry: Entry = {
        id: crypto.randomUUID(),
        source: from,
        target: to,
        sourceText: snapshot,
        targetText: data.translation,
        engine: data.engine || settings.translationProvider,
        favorite: false,
      };
      setResult(entry);
      if (settings.save)
        setHistory((values) => [entry, ...values].slice(0, 1000));
      if (tab === "chat") {
        setTurns((values) => [...values, entry].slice(-30));
        setInput("");
      }
      if (settings.auto)
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
    } catch (e) {
      if (id === generation.current)
        notify(
          controller.signal.aborted
            ? t(
                "翻译超时，请缩短内容后重试。",
                "Translation timed out. Try a shorter passage.",
              )
            : (e as Error).message,
        );
    } finally {
      clearTimeout(timer);
      if (id === generation.current) {
        setBusy(false);
        setProgress("");
        request.current = null;
      }
    }
  }
  function favorite(entry: Entry) {
    const current = history.find((e) => e.id === entry.id);
    const value = !(current?.favorite ?? entry.favorite);
    setHistory((values) =>
      current
        ? values.map((e) => (e.id === entry.id ? { ...e, favorite: value } : e))
        : [{ ...entry, favorite: value }, ...values].slice(0, 1000),
    );
    if (result?.id === entry.id) setResult({ ...result, favorite: value });
    setTurns((values) =>
      values.map((e) => (e.id === entry.id ? { ...e, favorite: value } : e)),
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
    (e) =>
      (!onlySaved || e.favorite) &&
      (e.sourceText + " " + e.targetText)
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
          <img src={`${import.meta.env.BASE_URL}vokawa-icon-v2.png`} alt="" />
          <span>
            vokawa<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="sidebar-label">
          {t("你的语言空间", "YOUR LANGUAGE SPACE")}
        </div>
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
          <div className="small-orbit" aria-hidden="true">
            粵
          </div>
          <p>
            {t("每一种表达，", "Every voice,")}
            <br />
            {t("都有它的回响。", "a new connection.")}
          </p>
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
            <a className="release-link" href={`${import.meta.env.BASE_URL}api/update.html`} onClick={stop} aria-label={t("检查更新", "Check for updates")}>v{RELEASE}</a>
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
              <div className="eyebrow">
                <span />
                {tab === "translate"
                  ? "WORDS WITHOUT BORDERS"
                  : tab === "sound"
                    ? "THE WAY WORDS SOUND"
                    : "A SPACE TO CONNECT"}
              </div>
              <h1>{t(...titles[tab])}</h1>
              <p>{t(...descriptions[tab])}</p>
            </div>
            <div className="language-sculpture" aria-hidden="true">
              <div className="orbit-line" />
              <span className="tile tile-ja">あ</span>
              <span className="tile tile-yue">粵</span>
              <span className="tile tile-en">A</span>
              <i />
            </div>
          </section>
          {(tab === "translate" || tab === "chat") && (
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
                  {t("连接每一种表达", "Made for connection")}
                </span>
              </div>
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
                    aria-label={t("待翻译内容", "Text to translate")}
                    placeholder={t(
                      "有什么想说的？",
                      "What would you like to say?",
                    )}
                    value={input}
                    maxLength={3000}
                    onChange={(e) => updateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
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
                        recording ? "record-button recording" : "record-button"
                      }
                      onClick={recording ? () => mic.current.stop() : dictate}
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
                      disabled={!busy && !input.trim()}
                      onClick={busy ? cancel : () => void translate()}
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
                          ? t("正在寻找合适的表达…", "Finding the right words…")
                          : t(
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
              <details
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
                      {t("一句咒语，开始表达", "Your voice. A little magic.")}
                    </strong>
                    <small>
                      {t(
                        "免按键唤醒语音输入",
                        "Wake speech input with your own phrase",
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
                  onText={updateInput}
                />
              </details>
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
                      <article className="conversation-turn" key={entry.id}>
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
                <summary>{t("其他音频来源", "Other audio sources")}</summary>
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
                    {t("录音／语音服务", "Recording / speech service")}
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
                    {t("全部记录", "All phrases")} <span>{history.length}</span>
                  </button>
                  <button
                    aria-pressed={onlySaved}
                    onClick={() => setOnlySaved(true)}
                  >
                    {t("收藏", "Saved")}{" "}
                    <span>{history.filter((e) => e.favorite).length}</span>
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
                              values.filter((e) => e.id !== entry.id),
                            );
                            if (result?.id === entry.id)
                              setResult({ ...result, favorite: false });
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                      <p className="source-text">{entry.sourceText}</p>
                      <p className="saved-translation">{entry.targetText}</p>
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
                            "留一点表达，给未来的你",
                            "A few words for your future self",
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
                    onChange={(e) => setLocale(e.target.value as "zh" | "en")}
                  >
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t("粤语系统声音", "Cantonese system voice")}</span>
                  <select
                    value={settings.voice}
                    onChange={(e) => setting("voice", e.target.value)}
                  >
                    <option value="">
                      {t("系统默认粤语声音", "Default Cantonese voice")}
                    </option>
                    {voices
                      .filter((v) => matches(v, "yue"))
                      .map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  onClick={() => {
                    refreshVoices();
                    setMessage(t("已刷新声音列表。", "Voice list refreshed."));
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
                      t("自动播放译文", "Play translations automatically"),
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
                    <summary>{t("自定义服务", "Custom services")}</summary>
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
                      <span>{t("语音服务地址", "Speech service URL")}</span>
                      <input
                        value={settings.speechApi}
                        onChange={(e) => setting("speechApi", e.target.value)}
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
                        {t("令牌（仅本次会话）", "Token (this session only)")}
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
                        if (result) setResult({ ...result, favorite: false });
                        setTurns((values) =>
                          values.map((e) => ({ ...e, favorite: false })),
                        );
                      }
                    }}
                  >
                    <Icon name="trash" size={15} />
                    {t("清除记录与收藏", "Clear history and saved phrases")}
                  </button>
                </section>
                <section className="install-card">
                  <Icon name="globe" size={25} />
                  <h3>{t("把 Vokawa 放进口袋", "Take Vokawa with you")}</h3>
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
                    {t("开源许可与音频来源", "Licenses & audio sources")} ↗
                  </a>
                </section>
              </div>
            </div>
          )}
          <footer className="page-footer">
            <span>vokawa.</span>
            <p>{t("让语言，成为连接。", "Let language bring you closer.")}</p>
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
      <dialog ref={dialog} onClose={() => setFull("")} className="full-dialog">
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
