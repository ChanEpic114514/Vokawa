import { afterEach, expect, it, vi } from "vitest";
import {
  CantonesePlayer,
  phraseRecording,
  selectedReadings,
} from "../src/cantonese";
afterEach(() => vi.unstubAllGlobals());
it("indexes full recordings by both text and pronunciation", () => {
  expect(phraseRecording("如果", selectedReadings("如果"))?.kind).toBe(
    "真人词语",
  );
  const rows = selectedReadings("如果");
  rows[0].jyutping = "jyu6";
  expect(phraseRecording("如果", rows)).toBeUndefined();
  expect(selectedReadings("行", { 0: "hong4" })[0].jyutping).toBe("hong4");
});
it("keeps whitespace, punctuation and English while correcting context", () => {
  const text = " 銀行行長去 IFC 開完會。 ";
  const rows = selectedReadings(text);
  expect(rows.map((r) => r.char).join("")).toBe(text);
  expect(
    rows
      .filter((r) => r.jyutping)
      .map((r) => r.jyutping)
      .join(" "),
  ).toBe("ngan4 hong4 hong4 zoeng2 heoi3 hoi1 jyun4 wui2");
});
it("requests selected pronunciations, keeps generated audio in memory, and prevents late playback after stop", async () => {
  const instances: any[] = [];
  vi.stubGlobal(
    "Audio",
    class {
      constructor(public src: string) {
        instances.push(this);
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
      removeAttribute() {}
      load() {}
    },
  );
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("location", { href: "http://localhost/", protocol: "http:" });
  let resolve!: (r: Response) => void;
  const pending = new Promise<Response>((r) => (resolve = r));
  const fetch = vi.fn(() => pending);
  vi.stubGlobal("fetch", fetch);
  const player = new CantonesePlayer(),
    notify = vi.fn(),
    text = "數一數。";
  const request = player.play(
    text,
    selectedReadings(text),
    "/api",
    "fastapi",
    "secret",
    1,
    notify,
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body).readings[0].jyutping).toBe(
    "sou2",
  );
  player.stop();
  resolve(
    new Response(new Blob(["RIFF"]), {
      headers: { "Content-Type": "audio/wav" },
    }),
  );
  await request;
  expect(instances).toHaveLength(0);
});
