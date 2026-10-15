export type Sequence = number[][];
export interface WakeProfile {
  version: 2;
  sampleRate: 16000;
  templates: Sequence[];
  threshold: number;
}
export const WAKE_KEY = "vokawa-wake-acoustic-v2";
export function normalize(sequence: Sequence): Sequence {
  if (!sequence.length) return [];
  const means = Array.from(
    { length: 12 },
    (_, j) => sequence.reduce((s, v) => s + v[j], 0) / sequence.length,
  );
  const centered = sequence.map((v) => v.map((x, j) => x - means[j]));
  return centered.map((v) => {
    const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / n);
  });
}
export function distance(a: Sequence, b: Sequence): number {
  if (
    a.length < 20 ||
    b.length < 20 ||
    Math.max(a.length, b.length) / Math.min(a.length, b.length) > 2.2
  )
    return Infinity;
  const x = normalize(a),
    y = normalize(b),
    n = x.length,
    m = y.length;
  let previous = new Float64Array(m + 1).fill(Infinity);
  previous[0] = 0;
  for (let i = 1; i <= n; i++) {
    const current = new Float64Array(m + 1).fill(Infinity);
    for (let j = 1; j <= m; j++) {
      if (Math.abs(i / n - j / m) > 0.35) continue;
      const cost =
        x[i - 1].reduce((s, v, k) => s + (v - y[j - 1][k]) ** 2, 0) / 12;
      current[j] =
        cost + Math.min(previous[j], current[j - 1], previous[j - 1]);
    }
    previous = current;
  }
  return previous[m] / (n + m);
}
export function score(sample: Sequence, templates: Sequence[]): number {
  const values = templates
    .map((t) => distance(sample, t))
    .sort((a, b) => a - b);
  return values.length < 2 ? Infinity : (values[0] + values[1]) / 2;
}
export function calibrate(positive: number[], negative: number[]) {
  if (
    positive.length < 3 ||
    negative.filter(Number.isFinite).length < 3 ||
    !positive.every(Number.isFinite)
  )
    throw Error("samples");
  const high = Math.max(...positive),
    low = Math.min(...negative);
  if (high >= low) throw Error("overlap");
  const threshold = (high + low) / 2 + 0.03;
  if (threshold >= low) throw Error("margin");
  return threshold;
}
export function parseProfile(raw: string | null): WakeProfile | null {
  if (!raw || raw.length > 700000) return null;
  try {
    const p = JSON.parse(raw);
    if (
      p.version !== 2 ||
      p.sampleRate !== 16000 ||
      !Number.isFinite(p.threshold) ||
      p.threshold <= 0 ||
      p.threshold >= 2 ||
      !Array.isArray(p.templates) ||
      p.templates.length < 3 ||
      p.templates.length > 5
    )
      return null;
    if (
      !p.templates.every(
        (s: unknown) =>
          Array.isArray(s) &&
          s.length >= 20 &&
          s.length <= 340 &&
          s.every(
            (v) =>
              Array.isArray(v) &&
              v.length === 12 &&
              v.every((x) => typeof x === "number" && Number.isFinite(x)),
          ),
      )
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
export interface Frame {
  features: number[];
  rms: number;
  clipped: boolean;
}
// Enrollment and continuous listening share identical segmentation boundaries.
export class UtteranceCapture {
  private quiet = 0;
  private noise = 0;
  private gate = 0.005;
  private lead: Frame[] = [];
  private active: Frame[] = [];
  private voiced = 0;
  private silent = 0;
  private blocked = false;
  push(frame: Frame): Sequence | null {
    if (this.quiet < 24) {
      this.quiet++;
      this.noise += frame.rms;
      this.gate = Math.max(0.005, (this.noise / this.quiet) * 2.5);
      return null;
    }
    const speech = frame.rms > this.gate;
    if (this.blocked) {
      if (!speech) {
        if (++this.silent >= 26) {
          this.blocked = false;
          this.silent = 0;
        }
      } else this.silent = 0;
      return null;
    }
    if (!this.active.length) {
      this.lead.push(frame);
      if (this.lead.length > 6) this.lead.shift();
      this.voiced = speech ? this.voiced + 1 : 0;
      if (this.voiced >= 3) {
        this.active = [...this.lead];
        this.lead = [];
        this.silent = 0;
      }
      return null;
    }
    this.active.push(frame);
    this.silent = speech ? 0 : this.silent + 1;
    if (this.active.length >= 340) {
      this.active = [];
      this.voiced = 0;
      this.blocked = true;
      this.silent = 0;
      return null;
    }
    if (this.silent < 26) return null;
    const frames = this.active;
    this.active = [];
    this.voiced = 0;
    this.silent = 0;
    const first = frames.findIndex((f) => f.rms > this.gate);
    let last = frames.length - 1;
    while (last >= 0 && frames[last].rms <= this.gate) last--;
    const trimmed = frames.slice(Math.max(0, first - 3), last + 5);
    if (
      first < 0 ||
      trimmed.length < 20 ||
      trimmed.filter((f) => f.clipped).length / trimmed.length > 0.15
    )
      return null;
    return trimmed.map((f) => f.features);
  }
}
// A compact FFT and mel filter bank keep wake matching on this device.
export class Features {
  private samples: number[] = [];
  private banks: { bin: number; weight: number }[][] = [];
  constructor() {
    const mel = (hz: number) => 2595 * Math.log10(1 + hz / 700),
      hz = (m: number) => 700 * (10 ** (m / 2595) - 1);
    const points = Array.from({ length: 28 }, (_, i) =>
      Math.floor((513 * hz(mel(80) + (i * (mel(7600) - mel(80))) / 27)) / 8000),
    );
    for (let i = 1; i <= 26; i++) {
      const weights: { bin: number; weight: number }[] = [];
      for (let k = points[i - 1]; k <= points[i + 1]; k++)
        weights.push({
          bin: k,
          weight:
            k <= points[i]
              ? (k - points[i - 1]) / Math.max(1, points[i] - points[i - 1])
              : (points[i + 1] - k) / Math.max(1, points[i + 1] - points[i]),
        });
      this.banks.push(weights);
    }
  }
  push(chunk: Float32Array): Frame[] {
    this.samples.push(...chunk);
    const frames: Frame[] = [];
    while (this.samples.length >= 400) {
      const slice = this.samples.slice(0, 400);
      this.samples.splice(0, 320);
      const re = new Float64Array(1024),
        im = new Float64Array(1024);
      for (let i = 0; i < 400; i++)
        re[i] =
          (slice[i] - 0.97 * (slice[i - 1] || 0)) *
          (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / 399));
      for (let i = 1, j = 0; i < 1024; i++) {
        let bit = 512;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) [re[i], re[j]] = [re[j], re[i]];
      }
      for (let size = 2; size <= 1024; size *= 2) {
        const angle = (-2 * Math.PI) / size;
        for (let start = 0; start < 1024; start += size)
          for (let j = 0; j < size / 2; j++) {
            const a = start + j,
              b = a + size / 2,
              c = Math.cos(angle * j),
              s = Math.sin(angle * j),
              r = re[b] * c - im[b] * s,
              z = re[b] * s + im[b] * c;
            re[b] = re[a] - r;
            im[b] = im[a] - z;
            re[a] += r;
            im[a] += z;
          }
      }
      const energy = this.banks.map((bank) =>
        Math.log(
          1e-10 +
            bank.reduce(
              (v, { bin, weight }) =>
                v + (re[bin] ** 2 + im[bin] ** 2) * weight,
              0,
            ),
        ),
      );
      const features = Array.from({ length: 12 }, (_, i) =>
        energy.reduce(
          (s, e, k) => s + e * Math.cos((Math.PI * (i + 1) * (k + 0.5)) / 26),
          0,
        ),
      );
      frames.push({
        features,
        rms: Math.sqrt(slice.reduce((s, x) => s + x * x, 0) / 400),
        clipped: slice.some((x) => Math.abs(x) > 0.99),
      });
    }
    return frames;
  }
}
