import { afterEach, expect, it, vi } from "vitest";
import { speechParts, speechPlan, Speaker } from "../src/speech";
const hk = { lang: "zh-HK", localService: true, voiceURI: "hk", name: "HK" } as SpeechSynthesisVoice;
const en = { lang: "en-GB", localService: true, voiceURI: "en", name: "English" } as SpeechSynthesisVoice;
const zh = { lang: "zh-CN", localService: true, voiceURI: "zh", name: "Mandarin" } as SpeechSynthesisVoice;
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([
  "聽日有 meeting，記得帶文件。", "我用 social media 同朋友傾偈。",
  "開 Zoom meeting at 9:30，之後食飯！", "HK$1,250.50，唔係 HK$125.05。",
  "COVID-19、iPhone 16 Pro、O'Reilly。", "https://example.com/a?q=2 同 test@example.com",
  "😀 123\nHello!\n你好。", "全句都係粵語。", "English only.", "123.45", "",
])("preserves all text and punctuation: %s", text => {
  expect(speechParts(text, "yue").map(p => p.text).join("")).toBe(text);
});
it("groups a complete English phrase and uses explicit voices", () => {
  const plan = speechPlan("我用 social media 同朋友傾偈。", "yue", [zh, en, hk], "zh");
  expect(plan.map(p => p.voice.lang)).toEqual(["zh-HK", "en-GB", "zh-HK"]);
  expect(plan[1].text.trim()).toBe("social media");
});
it("preflights both languages and never falls back to Mandarin or remote voices", () => {
  expect(() => speechPlan("你好 meeting", "yue", [hk])).toThrow("英语");
  expect(() => speechPlan("你好 meeting", "yue", [zh, en])).toThrow("香港粤语");
  expect(() => speechPlan("你好 meeting", "yue", [hk, { ...en, localService: false }])).toThrow("英语");
});
it("keeps existing monolingual English and Mandarin routes", () => {
  expect(speechPlan("Hello world.", "en", [en, hk])[0].voice).toBe(en);
  expect(speechPlan("你好。", "zh", [zh, hk])[0].voice).toBe(zh);
});
it("finishes the whole mixed queue once and ignores duplicate or stale speech events", () => {
  vi.useFakeTimers();
  const spoken: any[] = [], done = vi.fn();
  vi.stubGlobal("window", { speechSynthesis: { getVoices: () => [hk, en], cancel: vi.fn(), speak: (u: unknown) => spoken.push(u) } });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  const speaker = new Speaker();
  speaker.speak("你好 meeting 再見。", "yue", "hk", 1, vi.fn(), done);
  spoken[0].onend(); spoken[0].onend();
  expect(spoken).toHaveLength(2);
  expect(done).not.toHaveBeenCalled();
  spoken[1].onend(); spoken[2].onend(); spoken[2].onend();
  expect(done).toHaveBeenCalledOnce();
  speaker.stop();
  expect(done).toHaveBeenCalledOnce();
});
it("returns control to continuous listening after an error or stalled voice", () => {
  vi.useFakeTimers();
  const spoken: any[] = [], done = vi.fn();
  vi.stubGlobal("window", { speechSynthesis: { getVoices: () => [hk, en], cancel: vi.fn(), speak: (u: unknown) => spoken.push(u) } });
  vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  const speaker = new Speaker();
  speaker.speak("你好 meeting", "yue", "", 1, vi.fn(), done);
  spoken[0].onerror({ error: "synthesis-failed" });
  expect(done).toHaveBeenCalledOnce();
  speaker.speak("你好 meeting", "yue", "", 1, vi.fn(), done);
  vi.advanceTimersByTime(45001);
  expect(done).toHaveBeenCalledTimes(2);
  spoken[1].onend();
  expect(spoken).toHaveLength(2);
});
