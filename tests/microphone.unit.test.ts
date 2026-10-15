import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Microphone,
  recognitionError,
  type Recognition,
} from "../src/microphone";
import { setLocale } from "../src/i18n";
class Fake implements Recognition {
  static all: Fake[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  onstart: Recognition["onstart"] = null;
  start = vi.fn();
  abort = vi.fn();
  constructor() {
    Fake.all.push(this);
  }
}
beforeEach(() => {
  Fake.all = [];
  vi.useFakeTimers();
  vi.stubGlobal("window", { SpeechRecognition: Fake, confirm: () => true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("speech recognition lifecycle", () => {
  it("cleans up network failure with no automatic retry", () => {
    const mic = new Microphone(),
      error = vi.fn(),
      status = vi.fn();
    mic.start("en", vi.fn(), status, error);
    const rec = Fake.all[0];
    rec.onerror?.({ error: "network" });
    expect(error).toHaveBeenCalledOnce();
    expect(rec.abort).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(60000);
    expect(Fake.all).toHaveLength(1);
    expect(error).toHaveBeenCalledOnce();
  });
  it("ignores callbacks from an abandoned session", () => {
    const mic = new Microphone(),
      text = vi.fn(),
      error = vi.fn();
    mic.start("en", text, vi.fn(), error);
    const rec = Fake.all[0],
      late = rec.onresult;
    mic.start("zh", text, vi.fn(), error);
    late?.({ results: [[{ transcript: "stale" }]] });
    expect(text).not.toHaveBeenCalled();
    Fake.all[1].onresult?.({ results: [[{ transcript: "new" }]] });
    expect(text).toHaveBeenCalledWith("new");
    mic.stop();
  });
  it("reports startup timeout and releases the session", () => {
    const error = vi.fn(),
      mic = new Microphone();
    mic.start("en", vi.fn(), vi.fn(), error);
    vi.advanceTimersByTime(8000);
    expect(error).toHaveBeenCalledOnce();
    expect(Fake.all[0].abort).toHaveBeenCalledOnce();
  });
  it("reports empty results and enforces the 30 second recording limit", () => {
    const mic = new Microphone(),
      error = vi.fn();
    mic.start("en", vi.fn(), vi.fn(), error);
    Fake.all[0].onstart?.();
    Fake.all[0].onend?.();
    expect(error).toHaveBeenCalledWith(recognitionError("no-result"));
    mic.start("en", vi.fn(), vi.fn(), error);
    Fake.all[1].onstart?.();
    vi.advanceTimersByTime(30000);
    expect(error).toHaveBeenLastCalledWith(recognitionError("timeout"));
  });
  it("waits for consent and returns localized actionable failures", () => {
    vi.stubGlobal("window", { SpeechRecognition: Fake, confirm: () => false });
    const mic = new Microphone();
    mic.start("en", vi.fn(), vi.fn(), vi.fn());
    expect(Fake.all).toHaveLength(0);
    setLocale("en");
    for (const code of [
      "network",
      "no-result",
      "not-allowed",
      "audio-capture",
      "service-not-allowed",
      "start-timeout",
    ])
      expect(recognitionError(code)).not.toMatch(/\p{Script=Han}/u);
  });
  it("does not treat a completed transcript as a failure", () => {
    const error = vi.fn(),
      text = vi.fn(),
      mic = new Microphone();
    mic.start("en", text, vi.fn(), error);
    Fake.all[0].onstart?.();
    Fake.all[0].onresult?.({ results: [[{ transcript: " hello " }]] });
    Fake.all[0].onend?.();
    expect(text).toHaveBeenCalledWith("hello");
    expect(error).not.toHaveBeenCalled();
  });
});
