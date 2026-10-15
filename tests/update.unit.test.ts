import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
const html = readFileSync("public/api/update.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
function harness(registration: any) {
  let click: () => Promise<void> = async () => {};
  const button = { disabled: false, addEventListener: (_: string, fn: typeof click) => { click = fn; } };
  const status = { textContent: "" };
  const replace = vi.fn();
  const register = vi.fn().mockResolvedValue(registration);
  const storage = { clear: vi.fn(), removeItem: vi.fn() };
  runInNewContext(script, {
    document: { getElementById: (id: string) => id === "update" ? button : status },
    location: { href: "https://example.com/Vokawa/api/update.html", replace },
    navigator: { serviceWorker: { register } },
    localStorage: storage, URL, setTimeout, clearTimeout,
  });
  return { click: () => click(), button, status, replace, register, storage };
}
describe("PWA recovery", () => {
  it("activates a waiting worker before opening the app without deleting user data", async () => {
    let onChange = () => {};
    const worker = {
      state: "installed",
      addEventListener: (_: string, fn: () => void) => { onChange = fn; },
      removeEventListener: vi.fn(),
      postMessage: vi.fn(() => { worker.state = "activated"; onChange(); }),
    };
    const update = vi.fn().mockResolvedValue(undefined);
    const h = harness({ waiting: worker, active: {}, update });
    expect(h.register).not.toHaveBeenCalled();
    await h.click();
    expect(update).toHaveBeenCalledOnce();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(h.register.mock.calls[0][0].href).toBe("https://example.com/Vokawa/sw.js");
    expect(h.register.mock.calls[0][1].scope).toBe("/Vokawa/");
    expect(h.replace).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/example.com\/Vokawa\/\?updated=/));
    expect(h.storage.clear).not.toHaveBeenCalled();
    expect(h.storage.removeItem).not.toHaveBeenCalled();
  });
  it("reports an update failure and lets the user retry without navigating", async () => {
    const h = harness({ update: vi.fn().mockRejectedValue(new Error("offline")) });
    await h.click();
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.button.disabled).toBe(false);
    expect(h.status.textContent).toContain("Update did not finish");
  });
  it("uses the legacy navigation exclusion so an old worker cannot return the stale app shell", () => {
    expect(/\/api\//.test("/Vokawa/api/update.html")).toBe(true);
    const config = readFileSync("vite.config.ts", "utf8");
    expect(config).toContain("skipWaiting: true");
    expect(config).toContain('globIgnores: ["api/update.html"]');
  });
});
