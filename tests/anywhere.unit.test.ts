import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it, expect, vi } from "vitest";
import { MAX_SHARED_FRAGMENT, MAX_SHARED_TEXT, SHARE_PREFIX, parseSharedFragment, sharedFragment } from "../src/anywhere";
const boot = readFileSync("scripts/anywhere-boot.js", "utf8");
function harness(hash = "", broken = false) {
  const handlers: Record<string, () => void> = {};
  const location = { hash, pathname: "/Vokawa/", search: "?source=shortcut" };
  const history = { state: { existing: true }, replaceState: vi.fn((_state: unknown, _title: string, _url: string) => {
    if (broken) throw Error("History unavailable");
    location.hash = "";
  }) };
  const window: any = { location, history, addEventListener: (name: string, fn: () => void) => { handlers[name] = fn; } };
  runInNewContext(boot, { window, Set });
  return { window, location, history, event: (name: string) => handlers[name]?.() };
}
describe("Anywhere fragment protocol", () => {
  it.each([
    "Hello + 100% & #? = 你好！\n我哋聽日見 😊", "  spaces\tand\r\nnewlines  ",
    "<script>alert(1)</script>", "https://example.com/?x=1&y=2#secret", "%20 %25 %E4%BD%A0",
    "𠮷 e\u0301 🧑‍💻", "你好".repeat(1500), "😊".repeat(1500),
  ])("round trips literal text once: %.30s", text => {
    expect(parseSharedFragment(sharedFragment(text))).toEqual({ kind: "ready", text });
  });
  it("does not treat plus as space or interpret extra text as parameters", () => {
    expect(parseSharedFragment(SHARE_PREFIX + "a+b&auto=1&target=en")).toEqual({ kind: "ready", text: "a+b&auto=1&target=en" });
  });
  it.each(["%", "%GG", "%E4%BD", "%FF", "%ED%A0%80", "\ud800"])("rejects invalid encoding %s", encoded => {
    expect(parseSharedFragment(SHARE_PREFIX + encoded)).toEqual({ kind: "error", error: "encoding" });
  });
  it.each(["", "%20%09%0A"])("rejects empty input %s", encoded => {
    expect(parseSharedFragment(SHARE_PREFIX + encoded)).toEqual({ kind: "error", error: "empty" });
  });
  it.each(["%00", "%01", "%0B", "%7F"])("rejects controls %s", encoded => {
    expect(parseSharedFragment(SHARE_PREFIX + "hello" + encoded)).toEqual({ kind: "error", error: "control" });
  });
  it("rejects excess decoded and raw lengths without truncation", () => {
    expect(parseSharedFragment(SHARE_PREFIX + "a".repeat(3001))).toEqual({ kind: "error", error: "length" });
    expect(parseSharedFragment(SHARE_PREFIX + "a".repeat(MAX_SHARED_FRAGMENT))).toEqual({ kind: "error", error: "length" });
    expect(parseSharedFragment("#vokawa-share?text=hello")).toEqual({ kind: "error", error: "format" });
    expect(MAX_SHARED_TEXT).toBe(3000);
  });
});
describe("Anywhere early intake", () => {
  it("clears the fragment before the bundle, preserves unrelated URL state and consumes once", () => {
    const raw = sharedFragment("private text"); const h = harness(raw);
    expect(h.location.hash).toBe("");
    expect(h.history.replaceState).toHaveBeenCalledWith({ existing: true }, "", "/Vokawa/?source=shortcut");
    expect(h.window.vokawaAnywhere.take()).toEqual({ raw });
    expect(h.window.vokawaAnywhere.take()).toBeUndefined();
    h.event("pageshow"); expect(h.window.vokawaAnywhere.take()).toBeUndefined();
  });
  it("keeps only the newest pre-mount share and accepts later identical shares", () => {
    const h = harness(sharedFragment("first"));
    h.location.hash = sharedFragment("second"); h.event("hashchange");
    expect(h.window.vokawaAnywhere.take()).toEqual({ raw: sharedFragment("second") });
    const listener = vi.fn(), unsubscribe = h.window.vokawaAnywhere.subscribe(listener);
    h.location.hash = sharedFragment("second"); h.event("hashchange");
    expect(listener).toHaveBeenCalledOnce();
    expect(h.window.vokawaAnywhere.take()).toEqual({ raw: sharedFragment("second") });
    unsubscribe(); h.event("pageshow"); expect(listener).toHaveBeenCalledOnce();
  });
  it("removes invalid owned fragments, rejects oversized input without retaining it", () => {
    const h = harness(SHARE_PREFIX + "a".repeat(MAX_SHARED_FRAGMENT));
    expect(h.location.hash).toBe(""); expect(h.window.vokawaAnywhere.take()).toEqual({ error: "length" });
    h.location.hash = "#vokawa-share-invalid"; h.event("popstate");
    expect(h.location.hash).toBe(""); expect(h.window.vokawaAnywhere.take()).toEqual({ raw: "#vokawa-share-invalid" });
  });
  it("fails closed when URL cleanup fails", () => {
    const h = harness(sharedFragment("private text"), true);
    expect(h.window.vokawaAnywhere.take()).toEqual({ error: "cleanup" });
  });
  it("leaves unrelated anchors alone", () => {
    const h = harness("#settings");
    expect(h.location.hash).toBe("#settings"); expect(h.history.replaceState).not.toHaveBeenCalled();
    expect(h.window.vokawaAnywhere.take()).toBeUndefined();
  });
});
describe("Written Shortcut configuration", () => {
  it("uses explicit source variables, one encoding action, a fragment and no network/clipboard action", () => {
    const recipe = JSON.parse(readFileSync("shortcuts/translate-with-vokawa.json", "utf8"));
    expect(recipe.showInShareSheet).toBe(true); expect(recipe.inputTypes).toEqual(["Text", "Rich text"]);
    expect(recipe.ifNoInput).toBe("Ask For Text");
    expect(recipe.urlPrefix).toBe("https://chanepic114514.github.io/Vokawa/" + SHARE_PREFIX);
    const available = new Set(["Shortcut Input"]);
    for (const action of recipe.actions) {
      if (action.input) expect(available.has(action.input)).toBe(true);
      if (action.parts) for (const part of action.parts) if (part.variable) expect(available.has(part.variable)).toBe(true);
      if (action.output) available.add(action.output);
    }
    expect(recipe.actions.filter((a: any) => a.action === "URL Encode")).toEqual([{ action: "URL Encode", mode: "Encode", input: "Combined Text", output: "Encoded Text" }]);
    expect(recipe.actions.at(-1)).toEqual({ action: "Open URLs", input: "Share URL" });
    expect(recipe.actions[3].then.at(-1).action).toBe("Stop This Shortcut");
    expect(JSON.stringify(recipe)).not.toMatch(/Get Contents of URL|Get Clipboard|mymemory/i);
    const guide = readFileSync("public/anywhere.html", "utf8");
    expect(guide).toContain(recipe.urlPrefix); expect(guide).toContain("未在 iPhone");
    expect(guide).toContain("询问 / Ask For");
  });
});
