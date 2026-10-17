# Vokawa Lens

Lens adds camera/photo OCR to the existing translation and playback interface. It uses Tesseract.js 7.0.0 with English, Simplified Chinese and Traditional Chinese integer LSTM data. The camera-to-local-OCR workflow was inspired by [txtr](https://github.com/relvanta/txtr); this React implementation does not copy its source or use its paid language pack.

## Use

1. Open **Lens / 镜头**. Set FROM and TO to the source and target languages.
2. Choose Camera (the system camera on supported phones), or Choose image. Camera capture is only requested after a tap; the browser controls the picker. Desktop browsers may show a file picker instead.
3. Set Image script to match the printed characters. A Mandarin source can still use Traditional Chinese OCR. Cantonese defaults to Traditional Chinese. The Chinese models can also recognize basic Latin characters, but English-heavy sections are best selected separately with the English model.
4. Rotate if needed. Drag to select one sign, menu item or paragraph. Use the scattered-text layout for separated labels; use continuous-text layout for paragraphs.
5. Select Recognize text. Review and edit the result in the existing input box. Names, prices, numbers and Cantonese characters require particular attention.
6. Select Translate, then Listen in the result. Existing history, favorites and character playback remain available.

## Privacy, connectivity and storage

- Image bytes are decoded, cropped and recognized locally in a disposable worker. No image is sent to a translation server. Image previews are released when removed or when leaving Lens; photos are not stored in history.
- Only pressing Translate sends the editable text to the currently selected translation provider. Existing MyMemory quotas, quality and network requirements still apply. A configured custom backend remains optional; Lens does not add one.
- OCR runtime and models are served from this site's `ocr/v1/` path. First use needs internet. All runtime variants and three models total about 25.5 MiB on the deployed site; a device only fetches its selected runtime and language models. They are not included in the app-shell precache.
- The service worker caches fetched OCR files for reuse, subject to browser storage eviction. Offline OCR requires those files to have been cached; offline translation is not promised. No API key, subscription or paid OCR service is introduced.
- Cancellation terminates the worker even during model loading. Leaving Lens, switching the interface/source language or hiding the page cancels work. The image is reduced to at most approximately 4 megapixels / 2600 pixels on its longest edge before OCR; uploads are limited to 25 MiB.

## Accuracy and device limits

Tesseract recognizes printed characters, not spoken language. Traditional Chinese data covers many Cantonese characters but is not a dedicated Cantonese OCR model. In the authored clear-print sample `我哋聽日見。呢度唔可以食嘢。`, local OCR misread `哋` and `嘢`. Combining Chinese and English models in the browser also misread the first Cantonese line as Latin letters. The shipped default therefore uses only the selected script model; its readable spans are checked in browser tests. A larger 26 MiB traditional model still misread these two characters in a local comparison, so it was not selected. Confidence alone did not reliably flag these mistakes. Lens therefore provides editable text and does not silently repair guessed words or auto-translate a photo.

Glare, handwriting, stylized signs, curved pages, low resolution and multi-column menus can produce wrong characters or reading order. Select smaller regions and review the result. This version does not reconstruct menu tables, translate overlays on the camera view, or claim every image is readable.

The system speech implementation is reused. Cantonese playback requires a local Hong Kong Cantonese voice; Mandarin is never substituted. Actual sound quality, camera permission prompts and memory behavior still require testing on a physical iPhone. WebKit automation is useful but is not an iPhone device test.

## Development and verification

```sh
npm ci
npm test
npm run build
npm run dev
```

`predev` and `prebuild` copy pinned npm OCR assets into `public/ocr/v1/`; generated assets are ignored by Git. The deployment build generates them again. `scripts/prepare-ocr.mjs` records file hashes and checks the pinned worker protocol version. Upgrading Tesseract requires revalidating `src/lens-ocr.ts` against its worker protocol and running actual browser OCR tests.

Unit tests cover image bounds, crop coordinates, text preservation, resource paths, cancellation and load failures. `tests/lens.e2e.spec.ts` uses real images, real workers, local WASM and local models for OCR. Translation responses and speech output are stubbed for deterministic integration tests; these tests do not establish live provider accuracy or audible quality. Existing product regression tests remain in place.

```sh
npx playwright install --with-deps chromium webkit
npm run test:e2e
npx playwright test --config=playwright.webkit.config.ts
```

Fixtures are authored high-contrast English, Simplified Chinese, Traditional Chinese and Cantonese text rendered with Noto Sans CJK. They are synthetic test images, not representative real-world photo benchmarks. Expected Cantonese checks deliberately cover readable text spans; the known incorrect characters are documented above rather than counted as correct.
