import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
const fixture = (name: string) => path.resolve(`tests/fixtures/lens/${name}.png`);
async function openLens(page: Page) {
  await page.addInitScript(() => localStorage.setItem("vokawa-interface-language", "en"));
  await page.goto("/Vokawa/");
  await page.getByRole("navigation").getByRole("button", { name: "Lens", exact: true }).click();
}
async function recognize(page: Page, image: string) {
  await page.getByLabel("Choose an image file", { exact: true }).setInputFiles(fixture(image));
  await expect(page.getByRole("img", { name: "Image to recognize" })).toBeVisible();
  await page.getByRole("button", { name: "Recognize text", exact: true }).click();
  await expect(page.getByLabel("Text to translate", { exact: true })).not.toHaveValue("", { timeout: 120000 });
  return page.getByLabel("Text to translate", { exact: true }).inputValue();
}
test("Lens runs real English OCR at the Pages subpath, then translates and invokes HK speech", async ({ page }) => {
  test.setTimeout(150000);
  const outgoing: string[] = [];
  page.on("request", r => { if (r.url().startsWith("https://api.mymemory")) outgoing.push(r.url()); });
  await openLens(page);
  await page.route("https://api.mymemory.translated.net/get?**", route => route.fulfill({ json: { responseStatus: 200, responseData: { translatedText: "請使用正門。" } } }));
  await page.evaluate(() => {
    const w = window as any; w.__spoken = [];
    w.SpeechSynthesisUtterance = class { constructor(public text: string) {} };
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ lang: "zh-HK", localService: true, voiceURI: "hk", name: "HK" }],
      cancel() {}, addEventListener() {}, removeEventListener() {},
      speak(u: any) { w.__spoken.push({ text: u.text, lang: u.voice.lang }); setTimeout(() => u.onend?.(), 10); },
    } });
  });
  const text = await recognize(page, "english");
  expect(text).toContain("Please use the main entrance.");
  expect(text).toContain("09:00"); expect(text).toContain("18:00");
  expect(outgoing).toHaveLength(0);
  await page.getByRole("button", { name: "Translate", exact: true }).last().click();
  await expect(page.locator(".translation-text")).toContainText("正門");
  expect(outgoing.length).toBeGreaterThan(0);
  await page.locator(".result-actions .listen-button").click();
  await expect.poll(() => page.evaluate(() => (window as any).__spoken.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__spoken[0].lang)).toBe("zh-HK");
  await page.screenshot({ path: "test-results/lens-phone.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/lens-desktop.png", fullPage: true });
});
for (const [image, source, expected] of [
  ["simplified", "zh", ["菜单", "牛肉饭", "38", "12"]],
  ["traditional", "yue", ["營業通知", "星期一至星期五", "上午九時至下午六時"]],
  ["cantonese", "yue", ["聽日見", "唔可以食"]],
] as const) {
  test(`Lens recognizes a real ${image} image with its selected script model`, async ({ page }, testInfo) => {
    test.setTimeout(150000); await openLens(page);
    await page.getByRole("combobox", { name: "FROM", exact: true }).selectOption(source);
    const text = await recognize(page, image);
    await testInfo.attach(`${image}-ocr.txt`, { body: text, contentType: "text/plain" });
    for (const part of expected) expect(text.replace(/\s/g, "")).toContain(part);
    await page.getByLabel("Text to translate", { exact: true }).fill(image === "cantonese" ? "我哋聽日見。呢度唔可以食嘢。" : text);
    await expect(page.getByRole("button", { name: "Translate", exact: true }).last()).toBeEnabled();
  });
}
test("Lens cancels a loading worker, does not revive stale text and clears the image", async ({ page }) => {
  await openLens(page);
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/ocr/v1/core/**", async route => { await gate; await route.abort().catch(() => {}); });
  await page.getByLabel("Choose an image file", { exact: true }).setInputFiles(fixture("english"));
  await page.getByRole("button", { name: "Recognize text", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel recognition" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel recognition" }).click(); release();
  await expect(page.getByText("Recognition cancelled.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Text to translate", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByRole("img", { name: "Image to recognize" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recognize text", exact: true })).toBeDisabled();
});
test("Lens supports crop, rotation, bilingual UI and rejects unsupported images", async ({ page }) => {
  await openLens(page);
  await page.getByLabel("Choose an image file", { exact: true }).setInputFiles(fixture("english"));
  const image = page.getByTestId("lens-image"); await expect(image).toBeVisible();
  const box = (await image.boundingBox())!;
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .1); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .6); await page.mouse.up();
  await expect(page.getByRole("button", { name: "Recognize selection" })).toBeEnabled();
  await page.getByRole("button", { name: "Whole image", exact: true }).click();
  await page.getByRole("button", { name: "Rotate 90°" }).click();
  await expect(page.getByRole("button", { name: "Rotate 90°" })).toBeEnabled();
  const size = await image.locator("img").evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size[1]).toBeGreaterThan(size[0]);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("button", { name: "识别文字", exact: true })).toBeVisible();
  await page.getByLabel("选择图片文件", { exact: true }).setInputFiles({ name: "bad.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("status").filter({ hasText: "无法读取此图片" })).toBeVisible();
});
test("Lens reuses downloaded OCR resources offline without sending a translation request", async ({ page, context }) => {
  test.setTimeout(150000); await openLens(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
  });
  const first = await recognize(page, "english");
  await expect.poll(async () => page.evaluate(async () => {
    const cache = await caches.open("vokawa-ocr-v1");
    return (await cache.keys()).some(r => r.url.endsWith("eng.traineddata.gz"));
  })).toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Recognize text", exact: true }).click();
  await expect(page.getByLabel("Text to translate", { exact: true })).toHaveValue(first, { timeout: 120000 });
  await context.setOffline(false);
});
