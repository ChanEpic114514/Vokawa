import { afterEach, expect, it, vi } from "vitest";
import {
  byteLength,
  decodeEntities,
  onlineTranslate,
  parseTranslation,
  splitTranslation,
} from "../src/translation";
import { loadSaved } from "../src/model";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const ok = (text = "譯文") =>
  new Response(
    JSON.stringify({
      responseStatus: 200,
      responseData: { translatedText: text },
    }),
  );
it("keeps every code point and newline within 500 UTF-8 bytes", () => {
  for (const text of [
    "𠮶😀長".repeat(240),
    "a".repeat(1500),
    "第一段。\n\n第二段！\n第三段",
    "Please keep 123. 中文，標點！ ".repeat(100),
  ]) {
    const chunks = splitTranslation(text);
    expect(chunks.join("")).toBe(text);
    expect(chunks.every((s) => byteLength(s) <= 500)).toBe(true);
    expect(chunks.every((s) => !s.trim().includes("\n"))).toBe(true);
  }
});
it("uses Hong Kong Cantonese and sends only current text without credentials", async () => {
  const f = vi.fn().mockResolvedValue(ok("我聽日返嚟。"));
  vi.stubGlobal("fetch", f);
  expect(
    (
      await onlineTranslate(
        "I will return tomorrow.",
        "en",
        "yue",
        new AbortController().signal,
      )
    ).translation,
  ).toBe("我聽日返嚟。");
  const [url, opts] = f.mock.calls[0];
  expect(url.searchParams.get("langpair")).toBe("en-GB|yue-HK");
  expect([...url.searchParams.keys()].sort()).toEqual(["langpair", "mt", "q"]);
  expect(opts.credentials).toBe("omit");
  expect(opts.cache).toBe("no-store");
  expect(opts.headers).toBeUndefined();
});
it("does not return partial success when later segment fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(ok("First."))
      .mockResolvedValueOnce(new Response("{}", { status: 503 })),
  );
  await expect(
    onlineTranslate("first\nsecond", "en", "zh", new AbortController().signal),
  ).rejects.toThrow("503");
});
it("detects HTTP-success quota payloads and malformed output", () => {
  for (const p of [
    { responseStatus: 429 },
    {
      responseStatus: 200,
      quotaFinished: true,
      responseData: { translatedText: "warning" },
    },
  ])
    expect(() => parseTranslation(p)).toThrow("额度");
  for (const p of [
    null,
    {},
    [],
    { responseStatus: 200, responseData: { translatedText: 9 } },
  ])
    expect(() => parseTranslation(p)).toThrow();
});
it("decodes entities as text, not executable markup", () => {
  expect(decodeEntities("&lt;img src=x&gt; &amp; &#x55BA; &#21946;")).toBe(
    "<img src=x> & 喺 喺",
  );
  expect(decodeEntities("&#x110000; &#xD800;")).toBe("&#x110000; &#xD800;");
});
it("preserves paragraphs without submitting whitespace", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(ok("Hello."))
    .mockResolvedValueOnce(ok("Goodbye."));
  vi.stubGlobal("fetch", f);
  expect(
    (
      await onlineTranslate(
        "你好。\n\n再見。",
        "yue",
        "en",
        new AbortController().signal,
      )
    ).translation,
  ).toBe("Hello.\n\nGoodbye.");
  expect(f).toHaveBeenCalledTimes(2);
});
it("aborts live request and subsequent segments", async () => {
  const c = new AbortController(),
    f = vi
      .fn()
      .mockImplementation(
        (_u, o) =>
          new Promise((_resolve, reject) =>
            o.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      );
  vi.stubGlobal("fetch", f);
  const task = onlineTranslate("one\ntwo", "en", "zh", c.signal);
  c.abort();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(f).toHaveBeenCalledTimes(1);
});
it("rejects offline and overlong input without a request", async () => {
  vi.stubGlobal("navigator", { onLine: false });
  const f = vi.fn();
  vi.stubGlobal("fetch", f);
  await expect(
    onlineTranslate("new text", "en", "yue", new AbortController().signal),
  ).rejects.toThrow("联网");
  await expect(
    onlineTranslate(
      "a".repeat(3001),
      "en",
      "yue",
      new AbortController().signal,
    ),
  ).rejects.toThrow("3000");
  expect(f).not.toHaveBeenCalled();
});
it("migrates old demo-only mode and preserves history and speech", () => {
  const history = [
    {
      id: "old",
      source: "en",
      target: "yue",
      sourceText: "hello",
      targetText: "你好",
      favorite: true,
      engine: "old",
    },
  ];
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        settings: {
          demo: true,
          speechApi: "https://example.test",
          save: false,
        },
        history,
      }),
  });
  const r = loadSaved();
  expect(r.settings.demo).toBe(false);
  expect(r.settings.translationProvider).toBe("mymemory");
  expect(r.settings.speechApi).toBe("https://example.test");
  expect(r.history).toEqual(history);
});
it("disables obsolete demo preference", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        settings: { demo: true, translationProvider: "mymemory" },
      }),
  });
  expect(loadSaved().settings.demo).toBe(false);
});
