import { describe, expect, it } from "vitest";
import {
  Features,
  UtteranceCapture,
  calibrate,
  distance,
  parseProfile,
  score,
  type Frame,
  type Sequence,
} from "../src/wake-core";
const sequence = (n = 60): Sequence =>
  Array.from({ length: n }, (_, i) =>
    Array.from(
      { length: 12 },
      (_, j) =>
        Math.sin((i / (n - 1)) * 5 + j) + Math.cos((i / (n - 1)) * 10 - j),
    ),
  );
const frame = (rms: number, i = 0): Frame => ({
  rms,
  clipped: false,
  features: sequence(80)[i % 80],
});
describe("acoustic wake matching", () => {
  it("matches identical phrases and tolerates moderate duration changes", () => {
    expect(distance(sequence(), sequence())).toBe(0);
    expect(distance(sequence(), sequence(80))).toBeLessThan(0.01);
    expect(distance(sequence(20), sequence(100))).toBe(Infinity);
  });
  it("averages the closest two enrollment samples", () => {
    const s = sequence();
    expect(score(s, [s, s, sequence(300)])).toBe(0);
    expect(score(s, [s])).toBe(Infinity);
  });
  it("retains the full tolerance when the acoustic gap permits it", () => {
    expect(calibrate([0.01, 0.02, 0.015], [0.2, 0.23, 0.25])).toBeCloseTo(0.14);
  });
  it("accepts separable recordings even when the fixed offset exceeds their gap", () => {
    const positive = [0.01, 0.02, 0.03],
      negative = [0.04, 0.05, 0.06];
    const threshold = calibrate(positive, negative);
    expect(threshold).toBeCloseTo(0.0375);
    expect(positive.every((value) => value <= threshold)).toBe(true);
    expect(negative.every((value) => value > threshold)).toBe(true);
  });
  it("scales tolerance to small normalized distances without accepting negative examples", () => {
    for (const scale of [0.0001, 0.001, 0.01, 0.1, 1]) {
      const positive = [1, 2, 3].map((value) => value * scale),
        negative = [4, 5, 6].map((value) => value * scale);
      const threshold = calibrate(positive, negative);
      expect(threshold).toBeGreaterThan(Math.max(...positive));
      expect(threshold).toBeLessThan(Math.min(...negative));
    }
    expect(() => calibrate([0.01, 0.02, 0.03], [NaN, 0.1, 0.2, 0.3])).toThrow(
      "samples",
    );
    expect(() => calibrate([-0.1, 0.02, 0.03], [0.1, 0.2, 0.3])).toThrow(
      "samples",
    );
  });
  it("refuses overlapping and insufficient calibration data", () => {
    expect(() => calibrate([0.1, 0.2, 0.3], [0.2, 0.3, 0.4])).toThrow(
      "overlap",
    );
    expect(() => calibrate([0.01, 0.02], [0.3, 0.4, 0.5])).toThrow("samples");
    expect(() =>
      calibrate([0.01, 0.02, 0.03], [Infinity, Infinity, 0.5]),
    ).toThrow("samples");
  });
  it("validates stored profiles before accepting microphone templates", () => {
    const p = {
      version: 2,
      sampleRate: 16000,
      templates: [sequence(), sequence(), sequence()],
      threshold: 0.1,
    };
    expect(parseProfile(JSON.stringify(p))).toEqual(p);
    expect(parseProfile(JSON.stringify({ ...p, version: 1 }))).toBeNull();
    expect(parseProfile(JSON.stringify({ ...p, threshold: -1 }))).toBeNull();
    expect(parseProfile("{")).toBeNull();
    expect(
      parseProfile(JSON.stringify({ ...p, templates: [[[null]]] })),
    ).toBeNull();
  });
  it("uses the same boundaries after different idle durations", () => {
    function capture(idle: number) {
      const segmenter = new UtteranceCapture();
      let result: Sequence | null = null;
      for (let i = 0; i < idle; i++) segmenter.push(frame(0.001));
      for (let i = 0; i < 70; i++) segmenter.push(frame(0.1, i));
      for (let i = 0; i < 30; i++) {
        const value = segmenter.push(frame(0.001));
        if (value) result = value;
      }
      return result;
    }
    expect(capture(30)).toEqual(capture(300));
    expect(capture(30)?.length).toBeGreaterThan(60);
  });
  it("rejects clipped and overlong utterances", () => {
    const capture = new UtteranceCapture();
    for (let i = 0; i < 30; i++) capture.push(frame(0.001));
    for (let i = 0; i < 50; i++)
      capture.push({ ...frame(0.5, i), clipped: true });
    for (let i = 0; i < 30; i++) expect(capture.push(frame(0.001))).toBeNull();
    for (let i = 0; i < 400; i++)
      expect(capture.push(frame(0.1, i))).toBeNull();
    for (let i = 0; i < 30; i++) expect(capture.push(frame(0.001))).toBeNull();
  });
  it("extracts finite features from silence and sine waves", () => {
    const f = new Features();
    const frames = f.push(
      Float32Array.from(
        { length: 3200 },
        (_, i) => Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.1,
      ),
    );
    expect(frames).toHaveLength(9);
    expect(
      frames.every(
        (x) => x.features.length === 12 && x.features.every(Number.isFinite),
      ),
    ).toBe(true);
    expect(frames[0].rms).toBeGreaterThan(0.06);
    expect(
      new Features()
        .push(new Float32Array(800))
        .every((x) => x.features.every(Number.isFinite)),
    ).toBe(true);
  });
});
