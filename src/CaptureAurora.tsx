import { useId, useSyncExternalStore } from "react";
import { getCaptureActive, getServerCaptureActive, subscribeCapture } from "./capture-state";
import { t, useLocale } from "./i18n";
import { Icon } from "./Icon";
import "./aurora.css";

export function CaptureAurora({ onStop }: { onStop: () => void }) {
  useLocale();
  const active = useSyncExternalStore(subscribeCapture, getCaptureActive, getServerCaptureActive);
  const gradient = useId().replace(/:/g, "");
  if (!active) return null;
  return (
    <section className="capture-aurora" aria-label={t("麦克风状态", "Microphone status")}>
      <div className="aurora-art" aria-hidden="true">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradient}>
              <stop stopColor="#9385b5" stopOpacity="0" />
              <stop offset=".25" stopColor="#9385b5" />
              <stop offset=".55" stopColor="#b18caa" />
              <stop offset=".78" stopColor="#c29d89" />
              <stop offset="1" stopColor="#c29d89" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g fill="none" stroke={`url(#${gradient})`}>
            <path className="aurora-halo" d="M0 59 C160 85 240 10 400 43 S620 84 760 48 S900 34 1000 58" />
            <path className="aurora-thread" d="M0 59 C160 85 240 10 400 43 S620 84 760 48 S900 34 1000 58" />
            <path className="aurora-echo" d="M0 54 C180 28 270 77 430 57 S650 17 800 53 S930 76 1000 48" />
          </g>
        </svg>
      </div>
      <div className="capture-controls">
        <span role="status"><i />{t("麦克风已开启", "Microphone on")}</span>
        <button onClick={onStop} aria-label={t("停止麦克风", "Stop microphone")}>
          <Icon name="stop" size={13} />{t("停止", "Stop")}
        </button>
      </div>
    </section>
  );
}
