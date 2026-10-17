import { test, expect, type Page } from "@playwright/test";
const prefix = "#vokawa-share=";
const sharedURL = (text: string) => "/Vokawa/" + prefix + encodeURIComponent(text);
const input = (page: Page) => page.getByLabel("Text to translate", { exact: true });
async function shareAgain(page: Page, text: string) {
  await page.evaluate(hash => { location.hash = hash; }, prefix + encodeURIComponent(text));
  await expect(input(page)).toHaveValue(text);
  await expect(page).toHaveURL(/\/Vokawa\/$/);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("vokawa-interface-language", "en"));
});
test("Anywhere round-trips mixed text and only sends the edited text after confirmation", async ({ page }) => {
  const text = "Hello + 100% & #? = 你好！\n我哋聽日見 😊";
  const queries: string[] = [];
  const requests: string[] = [];
  page.on("request", r => requests.push(r.url() + " " + (r.headers().referer || "")));
  await page.route("https://api.mymemory.translated.net/get?**", route => {
    queries.push(new URL(route.request().url()).searchParams.get("q") || "");
    return route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: "確認後的譯文" } } });
  });
  await page.goto(sharedURL(text));
  await expect(input(page)).toHaveValue(text);
  await expect(page.getByRole("status").filter({ hasText: "Text received, not sent" })).toBeVisible();
  await expect(page).toHaveURL(/\/Vokawa\/$/);
  expect(queries).toEqual([]);
  expect(requests.join(" ")).not.toContain("vokawa-share");
  expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, state: history.state }))).not.toContain("我哋聽日見");
  await expect(page.getByText("Continuous listening", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Swap languages", exact: true }).click();
  await expect(input(page)).toHaveValue(text);
  await expect(page.getByRole("button", { name: "Confirm and translate", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Swap languages", exact: true }).click();
  await input(page).fill("edited + 50% & #");
  expect(queries).toEqual([]);
  await page.getByRole("button", { name: "Confirm and translate", exact: true }).click();
  await expect(page.locator(".translation-text")).toHaveText("確認後的譯文");
  expect(queries).toEqual(["edited + 50% & #"]);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("vokawa-v2") || "{}").history);
  expect(saved[0].sourceText).toBe("edited + 50% & #");
});
test("Anywhere clears a cold-start URL before the app bundle loads", async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route("**/assets/*.js", async route => { await gate; await route.continue(); });
  await page.goto(sharedURL("early private text"), { waitUntil: "commit" });
  try {
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    await expect(page.locator("#root")).toBeEmpty();
  } finally { release(); }
  await expect(input(page)).toHaveValue("early private text");
});
test("Anywhere accepts repeated identical and different shares in an already open Lens page", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.mymemory.translated.net/**", route => { requests++; return route.abort(); });
  await page.goto("/Vokawa/");
  await page.getByRole("navigation").getByRole("button", { name: "Lens", exact: true }).click();
  await shareAgain(page, "first share");
  await expect(page.locator("h1")).toHaveText("Translate");
  await page.getByRole("button", { name: "Discard shared text" }).click();
  await expect(input(page)).toHaveValue("");
  await shareAgain(page, "first share");
  await shareAgain(page, "second 分享");
  expect(requests).toBe(0);
  await page.goBack();
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(requests).toBe(0);
});
test("Anywhere refresh discards an unconfirmed draft without changing saved history", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("vokawa-v2")) localStorage.setItem("vokawa-v2", JSON.stringify({ history: [{ id: "old", source: "en", target: "yue", sourceText: "Saved before", targetText: "舊記錄", favorite: true }] }));
  });
  let requests = 0;
  await page.route("https://api.mymemory.translated.net/**", route => { requests++; return route.abort(); });
  await page.goto(sharedURL("unconfirmed private draft"));
  await expect(input(page)).toHaveValue("unconfirmed private draft");
  await page.reload();
  await expect(input(page)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confirm and translate" })).toHaveCount(0);
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Phrasebook", exact: true }).click();
  await expect(page.locator(".phrase-card")).toContainText("Saved before");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain("unconfirmed private draft");
});
test("Anywhere rejects malformed encoding, controls, empty and oversized text without truncating or sending", async ({ page }) => {
  let requests = 0;
  await page.route("https://api.mymemory.translated.net/**", route => { requests++; return route.abort(); });
  await page.goto("/Vokawa/");
  for (const [hash, message] of [
    [prefix + "%E4%BD", "Invalid URL encoding"],
    [prefix + "%00hello", "unsupported control characters"],
    [prefix + "%20%0A", "No text received"],
    [prefix + "a".repeat(3001), "exceeds 3,000"],
    [prefix + "a".repeat(28000), "exceeds 3,000"],
    ["#vokawa-share?text=wrong", "Invalid share link"],
  ]) {
    await page.evaluate(value => { location.hash = value; }, hash);
    await expect(page.getByRole("status").filter({ hasText: message })).toBeVisible();
    await expect(input(page)).toHaveValue("");
    expect(await page.evaluate(() => location.hash)).toBe("");
  }
  expect(requests).toBe(0);
});
test("Anywhere renders hostile-looking text literally and never follows payload URLs", async ({ page }) => {
  const text = '<img src=x onerror="window.__xss=1"> + javascript:alert(1) &auto=1&target=en';
  let external = 0; page.on("request", r => { if (!r.url().startsWith("http://127.0.0.1:4173")) external++; });
  await page.goto(sharedURL(text));
  await expect(input(page)).toHaveValue(text);
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  expect(external).toBe(0);
  await expect(page.getByRole("combobox", { name: "TO", exact: true })).toHaveValue("yue");
});
test("Anywhere stops an earlier translation and discards its late response", async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  await page.route("https://api.mymemory.translated.net/get?**", async route => { await gate; await route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: "STALE" } } }).catch(() => {}); });
  await page.goto("/Vokawa/"); await input(page).fill("old confirmed request");
  const started = page.waitForRequest("https://api.mymemory.translated.net/get?**");
  await page.getByRole("button", { name: "Translate", exact: true }).last().click(); await started;
  await shareAgain(page, "new unconfirmed share"); release();
  await expect(page.locator(".translation-text")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm and translate" })).toBeEnabled();
});
test("Anywhere failure to clean the URL blocks import and does not invoke translation", async ({ page }) => {
  await page.addInitScript(() => { history.replaceState = () => { throw Error("test cleanup failure"); }; });
  await page.goto(sharedURL("must not import"));
  await expect(page.getByRole("status").filter({ hasText: "Import was blocked" })).toBeVisible();
  await expect(input(page)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Confirm and translate" })).toHaveCount(0);
});
test("Anywhere installation guide provides a working test link and leaves normal anchors alone", async ({ page }) => {
  await page.goto("/Vokawa/#settings"); await expect(input(page)).toHaveValue("");
  expect(await page.evaluate(() => location.hash)).toBe("#settings");
  await page.getByRole("link", { name: "Share text from other apps · Set up Anywhere" }).click();
  await expect(page.locator("h1")).toHaveText("从分享菜单打开 Vokawa");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator("#prefix")).toHaveText("https://chanepic114514.github.io/Vokawa/#vokawa-share=");
  await page.locator("#receiver-test").click();
  await expect(input(page)).toHaveValue("Hello + 100% & #? = 你好！\n我哋聽日見 😊");
  await expect(page).toHaveURL(/\/Vokawa\/$/);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认并翻译", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/anywhere-phone.png", fullPage: true });
});
