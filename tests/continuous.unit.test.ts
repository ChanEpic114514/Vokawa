import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContinuousWake } from "../src/continuous-wake";
import type { WakeProfile, Frame } from "../src/wake-core";

const fake = vi.hoisted(() => ({
  frame: null as null | ((frame: Frame) => void),
  failure: null as null | ((message: string) => void),
  text: null as null | ((text: string) => void),
  status: null as null | ((active: boolean) => void),
  error: null as null | ((message: string, code?: string) => void),
  audioStart: vi.fn(), audioStop: vi.fn(), audioPause: vi.fn(),
  micStart: vi.fn(), micStop: vi.fn(),
}));
vi.mock("../src/wake-audio", () => ({ WakeAudio: class {
  start(frame: typeof fake.frame, fail: typeof fake.failure) {
    fake.audioStart(); fake.frame = frame; fake.failure = fail;
    return Promise.resolve();
  }
  stop() { fake.audioStop(); }
  pause() { fake.audioPause(); }
} }));
vi.mock("../src/microphone", () => ({ Microphone: class {
  start(_: unknown, text: typeof fake.text, status: typeof fake.status, error: typeof fake.error, options: {onReady: () => void}) {
    fake.micStart(); fake.text = text; fake.status = status; fake.error = error;
    status?.(true); options.onReady();
  }
  stop() { fake.micStop(); }
} }));
vi.mock("../src/wake-core", () => ({
  UtteranceCapture: class { push() { return [[1]]; } },
  score: () => 0,
}));
let loop: ContinuousWake;
const profile = { templates: [], threshold: .1 } as unknown as WakeProfile;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.stubGlobal("document", { hidden: false });
  loop = new ContinuousWake();
});
afterEach(() => { loop.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function start(onText = vi.fn().mockResolvedValue(undefined)) {
  const onPhase = vi.fn(), onStatus = vi.fn();
  loop.start({ profile, lang: "en", onPhase, onStatus, onLevel: vi.fn(), onText });
  await Promise.resolve();
  return { onText, onPhase, onStatus };
}
async function wake() {
  fake.frame?.({ rms: .05 } as Frame);
  await vi.advanceTimersByTimeAsync(350);
}
function transcript(text = "hello") {
  fake.text?.(text); fake.status?.(false);
}
describe("foreground listening session", () => {
  it("translates only after recognition ends, then supports another complete round", async () => {
    const { onText, onPhase } = await start();
    await wake();
    fake.text?.("first");
    expect(onText).not.toHaveBeenCalled();
    fake.status?.(false);
    await vi.advanceTimersByTimeAsync(700);
    expect(onText).toHaveBeenCalledWith("first", expect.any(AbortSignal));
    expect(onPhase).toHaveBeenLastCalledWith("waiting");
    await wake(); transcript("second");
    await vi.advanceTimersByTimeAsync(700);
    expect(onText).toHaveBeenCalledTimes(2);
    expect(fake.audioStart).toHaveBeenCalledTimes(3);
  });
  it("waits for translation and playback before resuming", async () => {
    let resolve!: () => void;
    const { onPhase } = await start(vi.fn(() => new Promise<void>(r => { resolve = r; })));
    await wake(); transcript();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPhase).toHaveBeenLastCalledWith("translating");
    expect(fake.audioStart).toHaveBeenCalledOnce();
    resolve(); await vi.advanceTimersByTimeAsync(700);
    expect(onPhase).toHaveBeenLastCalledWith("waiting");
  });
  it("aborts pending translation and never restarts after stopping", async () => {
    let resolve!: () => void;
    const { onText } = await start(vi.fn(() => new Promise<void>(r => { resolve = r; })));
    await wake(); transcript();
    const signal = onText.mock.calls[0][1] as AbortSignal;
    loop.stop(); expect(signal.aborted).toBe(true);
    resolve(); await vi.advanceTimersByTimeAsync(5000);
    expect(fake.audioStart).toHaveBeenCalledOnce();
  });
  it.each(["no-speech", "no-result", "timeout"])("returns to wake listening after %s", async code => {
    const { onText, onPhase } = await start(); await wake();
    fake.error?.("empty", code); fake.status?.(false);
    await vi.advanceTimersByTimeAsync(700);
    expect(onText).not.toHaveBeenCalled();
    expect(onPhase).toHaveBeenLastCalledWith("waiting");
  });
  it.each(["network", "not-allowed", "service-not-allowed", "audio-capture"])("stops without an automatic retry for %s", async code => {
    const { onPhase, onStatus } = await start(); await wake();
    fake.error?.("failed", code); fake.status?.(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(onPhase).toHaveBeenLastCalledWith("off");
    expect(onStatus).toHaveBeenLastCalledWith("failed");
    expect(fake.audioStart).toHaveBeenCalledOnce();
  });
  it("ignores stale recognition callbacks after stopping during handoff", async () => {
    const { onText } = await start(); await wake();
    const staleText = fake.text, staleStatus = fake.status;
    loop.stop(); staleText?.("late"); staleStatus?.(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onText).not.toHaveBeenCalled();
    expect(fake.audioStart).toHaveBeenCalledOnce();
  });
  it("never restarts while the document is hidden", async () => {
    await start(); await wake(); transcript();
    vi.stubGlobal("document", { hidden: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fake.audioStart).toHaveBeenCalledOnce();
  });
  it("stops on translation failure and retains its message", async () => {
    const { onPhase, onStatus } = await start(vi.fn().mockRejectedValue(new Error("quota")));
    await wake(); transcript();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPhase).toHaveBeenLastCalledWith("off");
    expect(onStatus).toHaveBeenLastCalledWith("quota");
    expect(fake.audioStart).toHaveBeenCalledOnce();
  });
});
