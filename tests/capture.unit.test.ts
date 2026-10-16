import { afterEach, describe, expect, it, vi } from "vitest";
import { getCaptureActive, setCaptureActive, subscribeCapture } from "../src/capture-state";
import { Microphone, type Recognition } from "../src/microphone";
import { WakeAudio } from "../src/wake-audio";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("capture indicator lifecycle", () => {
  it("keeps the indicator on until every existing capture session has stopped", () => {
    const first = Symbol(), second = Symbol(), notify = vi.fn();
    const unsubscribe = subscribeCapture(notify);
    setCaptureActive(first, true);
    setCaptureActive(second, true);
    setCaptureActive(first, false);
    expect(getCaptureActive()).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    setCaptureActive(second, false);
    expect(getCaptureActive()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it("waits for recognition to start and clears activity after a network failure", () => {
    let rec: Recognition;
    class Fake {
      start() { rec = this as unknown as Recognition; }
      abort() {}
    }
    vi.stubGlobal("window", { SpeechRecognition: Fake, confirm: () => true });
    const mic = new Microphone();
    try {
      mic.start("en", vi.fn(), vi.fn(), vi.fn());
      expect(getCaptureActive()).toBe(false);
      rec!.onstart?.();
      expect(getCaptureActive()).toBe(true);
      const lateStart = rec!.onstart;
      rec!.onerror?.({ error: "network" });
      expect(getCaptureActive()).toBe(false);
      lateStart?.();
      expect(getCaptureActive()).toBe(false);
    } finally { mic.stop(); }
  });
  function setupWake() {
    const track = { stop: vi.fn(), onended: null as (() => void) | null };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const contexts: Context[] = [];
    class Context {
      constructor() { contexts.push(this); }
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
      destination = {};
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
      createGain = () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() });
    }
    class Node {
      port = { onmessage: null };
      onprocessorerror = null;
      connect() {}
      disconnect() {}
    }
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("AudioContext", Context);
    vi.stubGlobal("AudioWorkletNode", Node);
    return { track, stream, getUserMedia, contexts };
  }
  it("shows wake capture only after initialization and clears it on disconnection", async () => {
    const { track } = setupWake(), wake = new WakeAudio(), failure = vi.fn();
    try {
      await wake.start(vi.fn(), failure);
      expect(getCaptureActive()).toBe(true);
      track.onended?.();
      expect(getCaptureActive()).toBe(false);
      expect(track.stop).toHaveBeenCalledOnce();
      expect(failure).toHaveBeenCalledOnce();
    } finally { wake.stop(); }
  });
  it("reuses the initialized audio context across foreground rounds, then closes on stop", async () => {
    const { contexts, track } = setupWake(), wake = new WakeAudio();
    await wake.start(vi.fn(), vi.fn());
    wake.pause();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(contexts[0].close).not.toHaveBeenCalled();
    await wake.start(vi.fn(), vi.fn());
    expect(contexts).toHaveLength(1);
    expect(contexts[0].audioWorklet.addModule).toHaveBeenCalledOnce();
    wake.stop();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    expect(getCaptureActive()).toBe(false);
  });
  it("never lights up when microphone permission is rejected", async () => {
    const { getUserMedia } = setupWake(), wake = new WakeAudio();
    getUserMedia.mockRejectedValue(new Error("denied"));
    await expect(wake.start(vi.fn(), vi.fn())).rejects.toThrow("denied");
    expect(getCaptureActive()).toBe(false);
    wake.stop();
  });
  it("releases a late permission result after the user already stopped", async () => {
    const { getUserMedia, stream, track } = setupWake(), wake = new WakeAudio();
    let resolve!: (value: typeof stream) => void;
    getUserMedia.mockImplementation(() => new Promise(r => { resolve = r; }));
    const started = wake.start(vi.fn(), vi.fn());
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    wake.stop();
    resolve(stream);
    await started;
    expect(getCaptureActive()).toBe(false);
    expect(track.stop).toHaveBeenCalledOnce();
  });
});
