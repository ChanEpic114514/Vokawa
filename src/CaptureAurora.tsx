
import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";

import {
  getCaptureActive,
  getCaptureLevel,
  getServerCaptureActive,
  subscribeCapture,
} from "./capture-state";

import { t, useLocale } from "./i18n";
import { Icon } from "./Icon";

import "./aurora.css";

export function CaptureAurora({
  onStop,
}: {
  onStop: () => void;
}) {
  useLocale();

  const active = useSyncExternalStore(
    subscribeCapture,
    getCaptureActive,
    getServerCaptureActive,
  );

  const gradient = useId().replace(/:/g, "");

  const haloRef = useRef<SVGPathElement>(null);
  const threadRef = useRef<SVGPathElement>(null);
  const echoRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!active) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) return;

    let animationId = 0;
    let smoothLevel = 0;

    // Generate a smooth travelling wave.
    const createWave = (
      time: number,
      amplitude: number,
      phase: number,
      strength: number,
      baseline: number,
    ) => {
      const points = 48;

      let path = "";

      for (let i = 0; i <= points; i++) {
        const progress = i / points;
        const x = progress * 1000;

        // Reduce amplitude smoothly at both edges.
        const envelope = Math.pow(
          Math.sin(Math.PI * progress),
          0.72,
        );

        // Primary travelling wave.
        const primary = Math.sin(
          progress * Math.PI * 3.4 -
          time * 2.0 +
          phase,
        );

        // Secondary harmonic adds natural variation.
        const secondary = Math.sin(
          progress * Math.PI * 7.6 +
          time * 0.9 +
          phase,
        );

        const wave = primary + secondary * 0.2;

        const y =
          baseline +
          wave * amplitude * strength * envelope;

        path +=
          `${i === 0 ? "M" : "L"}` +
          `${x.toFixed(1)} ${y.toFixed(1)} `;
      }

      return path;
    };

    const render = (timestamp: number) => {
      const time = timestamp / 1000;

      const incomingLevel = getCaptureLevel();

      // Respond quickly to speech and release gradually.
      const smoothing =
        incomingLevel > smoothLevel ? 0.19 : 0.07;

      smoothLevel +=
        (incomingLevel - smoothLevel) * smoothing;

      // Gentle idle motion plus sound-responsive amplitude.
      const amplitude =
        3.2 + 22 * Math.sqrt(smoothLevel);

      const primaryPath = createWave(
        time,
        amplitude,
        0,
        1,
        43,
      );

      const secondaryPath = createWave(
        time,
        amplitude,
        1.6,
        0.58,
        51,
      );

      haloRef.current?.setAttribute(
        "d",
        primaryPath,
      );

      threadRef.current?.setAttribute(
        "d",
        primaryPath,
      );

      echoRef.current?.setAttribute(
        "d",
        secondaryPath,
      );

      animationId = requestAnimationFrame(render);
    };

    animationId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <section
      className="capture-aurora"
      aria-label={t("麦克风状态", "Microphone status")}
    >
      <div
        className="aurora-art"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradient}>
              <stop
                offset="0"
                stopColor="#af9cd8"
                stopOpacity="0"
              />

              <stop
                offset=".24"
                stopColor="#af9cd8"
              />

              <stop
                offset=".53"
                stopColor="#cba5bf"
              />

              <stop
                offset=".78"
                stopColor="#e0b58c"
              />

              <stop
                offset="1"
                stopColor="#e0b58c"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>

          <g
            fill="none"
            stroke={`url(#${gradient})`}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              ref={haloRef}
              className="aurora-halo"
              d="M0 43 Q250 30 500 43 T1000 43"
            />

            <path
              ref={threadRef}
              className="aurora-thread"
              d="M0 43 Q250 30 500 43 T1000 43"
            />

            <path
              ref={echoRef}
              className="aurora-echo"
              d="M0 51 Q250 65 500 51 T1000 51"
            />
          </g>
        </svg>
      </div>

      <div className="capture-controls">
        <span role="status">
          <i />
          {t("麦克风已开启", "Microphone on")}
        </span>

        <button
          onClick={onStop}
          aria-label={t("停止麦克风", "Stop microphone")}
        >
          <Icon name="stop" size={13} />
          {t("停止", "Stop")}
        </button>
      </div>
    </section>
  );
}
