import { expect, it } from "vitest";
import { hkNative, nativeTranslation } from "../src/hk-native";
import { hkCorpus } from "./hk-corpus";

it.each(hkCorpus)("HK corpus: %s / %s", (_category, input, expected, source = "") => {
  const result = hkNative(input, source);
  expect(result.text).toBe(expected);
  expect(hkNative(result.text, source).text).toBe(expected);
});
it("leaves other target languages and provider metadata untouched", () => {
  for (const lang of ["en", "zh"] as const) {
    const data = { translation: "今天有会议。", engine: "custom", notice: "original", segments: 3 };
    expect(nativeTranslation(data, "source", lang)).toBe(data);
  }
});
it("integrates independently of provider and preserves unrelated fields", () => {
  for (const engine of ["MyMemory", "backend"]) {
    const result = nativeTranslation({ translation: "我们去机场。", engine, segments: 2 }, "We go to the airport.", "yue");
    expect(result.translation).toBe("我哋去機場。");
    expect(result.engine).toContain("HK Native");
    expect(result.segments).toBe(2);
  }
});
it("reports conservative fallbacks without promising a native-quality certification", () => {
  const result = hkNative("我們明天去機場。這是一段無法可靠分析的專業內容。");
  expect(result.rules).toContain("spoken-clause");
  expect(result.unchangedClauses).toBe(1);
});
it("does not interpret user private-use characters as protection markers", () => {
  const text = "\uE0000\uE001土豆";
  expect(hkNative(text).text).toBe(text);
});
it("leaves unknown compound names intact instead of applying substring replacements", () => {
  for (const name of ["土豆科技", "明天控股", "冰箱研究所", "空調有限公司", "會議中心", "方便麪博物館"])
    expect(hkNative(name).text).toBe(name);
});
it("does not spread an English term across unrelated clauses or quoted source text", () => {
  expect(hkNative("我今天有會議。我使用社交媒體。", "I have a meeting today. 我使用社交媒体。").text)
    .toBe("我今日有 meeting。我用社交媒體。");
  expect(hkNative("我今天有會議。", 'Translate the word "meeting". More unrelated text.').text)
    .toBe("我今日有會議。");
});
