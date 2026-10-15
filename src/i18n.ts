import { useSyncExternalStore } from "react";
import type { Lang } from "./model";
export type Locale = "zh" | "en";
const KEY = "vokawa-interface-language";
const listeners = new Set<() => void>();
function initial(): Locale {
  try {
    const value = localStorage.getItem(KEY);
    if (value === "en" || value === "zh") return value;
  } catch {
    /* Storage is optional. */
  }
  return typeof navigator !== "undefined" &&
    !navigator.language?.startsWith("zh")
    ? "en"
    : "zh";
}
let locale = initial();
export function getLocale() {
  return locale;
}
export function setLocale(value: Locale) {
  locale = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* Keep the session choice. */
  }
  if (typeof document !== "undefined")
    document.documentElement.lang = value === "zh" ? "zh-Hans" : "en";
  listeners.forEach((fn) => fn());
}
export function useLocale() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getLocale,
    getLocale,
  );
}
export function t(zh: string, en: string) {
  return locale === "zh" ? zh : en;
}
export function languageName(lang: Lang) {
  return lang === "en"
    ? t("英语", "English")
    : lang === "zh"
      ? t("普通话", "Mandarin")
      : t("粤语", "Cantonese");
}
