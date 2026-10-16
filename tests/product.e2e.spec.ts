import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("vokawa-interface-language"))
      localStorage.setItem("vokawa-interface-language", "en");
  });
  await page.route("https://api.mymemory.translated.net/get?**", (route) =>
    route.fulfill({
      json: {
        responseStatus: 200,
        responseData: { translatedText: "我聽日去銀行。" },
      },
    }),
  );
  await page.goto("/");
});
test("switches interface language and retains it on reload", async ({
  page,
}) => {
  await expect(
    page.getByLabel("Text to translate", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByLabel("待翻译内容", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("待翻译内容", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByLabel("Text to translate", { exact: true }),
  ).toBeVisible();
});
test("translates arbitrary input and reveals exact character audio controls", async ({
  page,
}) => {
  await page
    .getByLabel("Text to translate", { exact: true })
    .fill("I will go to the bank tomorrow.");
  await page
    .getByRole("button", { name: "Translate", exact: true })
    .last()
    .click();
  await expect(page.locator(".translation-text")).toHaveText("我聽日去銀行。");
  await page
    .getByText("Listen character by character", { exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Listen to 行/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand", exact: true }).click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("dialog")).not.toBeVisible();
});
test("preserves a saved phrase across reload and language change", async ({
  page,
}) => {
  await page
    .getByLabel("Text to translate", { exact: true })
    .fill("A new phrase.");
  await page
    .getByRole("button", { name: "Translate", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Phrasebook", exact: true }).click();
  await expect(page.locator(".phrase-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.locator(".phrase-card")).toContainText("A new phrase.");
  await expect(
    page.getByRole("button", { name: "取消收藏", exact: true }),
  ).toBeVisible();
});
test("does not display a late translation after the input changes", async ({
  page,
}) => {
  let resolve: () => void = () => {};
  const gate = new Promise<void>((r) => (resolve = r));
  await page.route(
    "https://api.mymemory.translated.net/get?**",
    async (route) => {
      await gate;
      await route
        .fulfill({
          json: {
            responseStatus: 200,
            responseData: { translatedText: "OLD RESULT" },
          },
        })
        .catch(() => {});
    },
  );
  await page.getByLabel("Text to translate", { exact: true }).fill("old input");
  await page
    .getByRole("button", { name: "Translate", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Text to translate", { exact: true }).fill("new input");
  resolve();
  await expect(page.locator(".translation-text")).toHaveCount(0);
  await expect(
    page.getByLabel("Text to translate", { exact: true }),
  ).toHaveValue("new input");
});
test("reports a speech network error without silently retrying", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).__attempts = 0;
    (window as any).SpeechRecognition = class {
      onerror: any;
      onstart: any;
      start() {
        (window as any).__attempts++;
        setTimeout(() => this.onerror?.({ error: "network" }), 10);
      }
      abort() {}
    };
  });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({
        hasText: "Could not connect to the speech recognition service",
      }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__attempts)).toBe(1);
  await expect(
    page.getByRole("button", { name: "Voice input", exact: true }),
  ).toBeVisible();
});
test("opening the wake phrase panel never starts the microphone", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as any).__micCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__micCalls++;
      throw new Error("unexpected");
    };
  });
  await page.getByText("Wake phrase", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Record a take/ }),
  ).toBeVisible();
  expect(await page.evaluate(() => (window as any).__micCalls)).toBe(0);
});
test("keeps reading, conversation and preferences accessible in both languages", async ({
  page,
}) => {
  for (const name of ["Converse", "Listen", "Phrasebook", "Settings"]) {
    await page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.locator("h1")).toBeVisible();
  }
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Listen", exact: true })
    .click();
  await expect(page.getByLabel("Cantonese text", { exact: true })).toHaveValue(
    "",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Converse", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Swap languages", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "FROM", exact: true }),
  ).toHaveValue("yue");
});
test("uses a stacked phone layout and a two-column desktop layout without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const mobileInput = await page.locator(".input-panel").boundingBox(),
    mobileOutput = await page.locator(".output-panel").boundingBox();
  expect(mobileOutput!.y).toBeGreaterThan(mobileInput!.y + mobileInput!.height);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const desktopInput = await page.locator(".input-panel").boundingBox(),
    desktopOutput = await page.locator(".output-panel").boundingBox();
  expect(desktopOutput!.x).toBeGreaterThan(
    desktopInput!.x + desktopInput!.width,
  );
  expect(Math.abs(desktopOutput!.y - desktopInput!.y)).toBeLessThan(2);
});

test("aurora follows actual recognition activity, errors and explicit stop", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).__audioRequests = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).__audioRequests++;
      throw Error("The indicator must not open a second microphone stream");
    };
    (window as any).SpeechRecognition = class {
      onstart: any;
      onerror: any;
      start() { (window as any).__recognizer = this; }
      abort() {}
    };
  });
  page.on("dialog", dialog => dialog.accept());
  const aurora = page.getByRole("region", { name: "Microphone status" });
  await expect(aurora).toHaveCount(0);
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await expect(aurora).toHaveCount(0);
  await page.evaluate(() => (window as any).__recognizer.onstart());
  await expect(aurora).toBeVisible();
  await page.getByRole("button", { name: "Stop microphone", exact: true }).click();
  await expect(aurora).toHaveCount(0);
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await page.evaluate(() => (window as any).__recognizer.onstart());
  await expect(aurora).toBeVisible();
  await page.evaluate(() => (window as any).__recognizer.onerror({ error: "network" }));
  await expect(aurora).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__audioRequests)).toBe(0);
});

test("phone aurora respects reduced motion and stops when changing screens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    (window as any).SpeechRecognition = class {
      onstart: any;
      start() { setTimeout(() => this.onstart?.(), 10); }
      abort() {}
    };
  });
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await expect(page.locator(".capture-aurora")).toBeVisible();
  expect(await page.locator(".aurora-thread").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator(".capture-aurora")).toHaveCount(0);
});
