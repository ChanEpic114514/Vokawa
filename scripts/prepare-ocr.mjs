import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const target = new URL("public/ocr/v1/", root);
const version = JSON.parse(await readFile(new URL("node_modules/tesseract.js/package.json", root), "utf8")).version;
if (version !== "7.0.0") throw Error("Revalidate the OCR worker protocol before upgrading Tesseract.js.");
await mkdir(new URL("core/", target), { recursive: true });
await mkdir(new URL("data/", target), { recursive: true });
const assets = [];
async function copy(source, name) {
  await copyFile(new URL(source, root), new URL(name, target));
  const data = await readFile(new URL(name, target));
  assets.push({ path: name, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
}
await copy("node_modules/tesseract.js/dist/worker.min.js", "worker.min.js");
for (const name of await readdir(new URL("node_modules/tesseract.js-core/", root))) {
  if (/^tesseract-core.*lstm\.wasm(?:\.js)?$/.test(name)) await copy(`node_modules/tesseract.js-core/${name}`, `core/${name}`);
}
for (const lang of ["eng", "chi_sim", "chi_tra"]) {
  await copy(`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, `data/${lang}.traineddata.gz`);
}
await copy("node_modules/tesseract.js/LICENSE.md", "LICENSE-Tesseract.txt");
await copy("node_modules/tesseract.js-core/LICENSE", "LICENSE-Tesseract-core.txt");
await writeFile(new URL("assets.json", target), JSON.stringify({ engine: version, assets }, null, 2));
console.log(`Prepared ${assets.length} OCR files (${(assets.reduce((n, a) => n + a.bytes, 0) / 1024 / 1024).toFixed(1)} MiB), loaded on demand.`);
