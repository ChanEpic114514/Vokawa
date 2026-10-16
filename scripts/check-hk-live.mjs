// Opt-in smoke check against the real free API. Never runs in CI.
// Output is evidence for review, not a native-speaker quality score.
import { createServer } from "vite";
import { mkdir, writeFile } from "node:fs/promises";
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const rows = [];
try {
  const { onlineTranslate } = await server.ssrLoadModule("/src/translation.ts");
  const { nativeTranslation, hkNative } = await server.ssrLoadModule("/src/hk-native.ts");
  for (const [source, target, text] of [
    ["zh", "yue", "我们明天坐公交车去机场。"],
    ["en", "yue", "I have a meeting today."],
    ["en", "yue", "I use social media."],
    ["zh", "yue", "会议在9:30开始，不是8:30。"],
    ["yue", "en", "我想飲水。"],
    ["en", "zh", "I would like a glass of water."],
    ["zh", "en", "我想喝水。"],
    ["yue", "zh", "我想飲水。"],
  ]) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const raw = await onlineTranslate(text, source, target, controller.signal);
      const output = nativeTranslation(raw, text, target);
      rows.push({ source, target, text, providerText: raw.translation, output: output.translation,
        rules: target === "yue" ? hkNative(raw.translation, text).rules : [], status: "response-received" });
    } catch (error) {
      rows.push({ source, target, text, status: "failed", error: String(error) });
    } finally { clearTimeout(timer); }
    console.log(JSON.stringify(rows.at(-1)));
    if (rows.at(-1).status === "failed") break;
  }
  await mkdir("docs", { recursive: true });
  await writeFile("docs/hk-live-results.json", JSON.stringify({
    checkedAt: new Date().toISOString(), mode: "Node HTTP, actual MyMemory API; no mocks",
    nativeSpeakerReviewed: false, iphoneAudioTested: false, rows,
  }, null, 2) + "\n");
  if (rows.length !== 8 || rows.some(r => r.status === "failed")) process.exitCode = 1;
} finally { await server.close(); }
