import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import App, { CharacterAudio, type Tab } from "../src/App";
import { getLocale, setLocale } from "../src/i18n";
import { messageText } from "../src/messages";
import { loadSaved } from "../src/model";
afterEach(() => vi.unstubAllGlobals());
describe("bilingual interface", () => {
  it("renders all five screens in English without prototype controls", () => {
    setLocale("en");
    for (const tab of [
      "translate",
      "chat",
      "sound",
      "book",
      "settings",
    ] as Tab[]) {
      const html = renderToStaticMarkup(
        createElement(App, { initialTab: tab }),
      );
      expect(html).toContain("Main navigation");
      expect(html).toContain("Converse");
      expect(html).not.toMatch(/示例模式|未经人工审核|正在测试|测试阈值/);
      const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(labels.join(" ")).not.toMatch(/\p{Script=Han}/u);
    }
  });
  it("renders Chinese navigation and an empty input", () => {
    setLocale("zh");
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("待翻译内容");
    expect(html).toContain("翻译");
    expect(html).not.toContain("銀行行長今日");
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  });
  it("retains history and stores language independently", () => {
    const record = {
      id: "old",
      source: "en",
      target: "yue",
      sourceText: "hello",
      targetText: "你好",
      favorite: true,
    };
    const data = new Map([
      [
        "vokawa-v2",
        JSON.stringify({
          settings: { save: false, demo: true },
          history: [record],
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(data.get("vokawa-interface-language")).toBe("en");
    expect(loadSaved().history).toEqual([record]);
    expect(loadSaved().settings.demo).toBe(false);
  });
  it("localizes character controls without changing character content", () => {
    setLocale("en");
    const html = renderToStaticMarkup(
      createElement(CharacterAudio, {
        text: "行",
        onPlay: () => {},
        onStop: () => {},
      }),
    );
    expect(html).toContain("Listen character by character");
    expect(html).toContain("Reading 行");
    expect(html).toContain("hong4");
  });
  it("localizes errors while preserving identifiers and proper voice names", () => {
    setLocale("en");
    expect(messageText("播放结束")).toBe("Playback finished.");
    expect(messageText("正在播放 1/2 · 善怡")).toBe("Playing 1/2 · 善怡");
    expect(messageText("MyMemory 免费额度已用完，请稍后或明天再试。")).toMatch(
      /free quota/,
    );
    expect(messageText("未知错误")).not.toMatch(/\p{Script=Han}/u);
  });
});
