# Vokawa 0.6

English, Mandarin and Cantonese translation with a bilingual interface, system speech, exact Ekho syllable recordings and an optional local acoustic wake phrase.

## Run locally

Use Node.js 24 LTS (or a compatible Node.js 22 release), npm and Python 3.

```sh
npm ci
npm test
npm run build
npm run dev -- --port 5173 --strictPort
```

Open http://localhost:5173. The predev/prebuild script restores the included audio archives and verifies their SHA-256. No Ollama installation or Python server is required for the default MyMemory translation and system speech path.

Read [the Chinese update guide](docs/UPDATE_V06_ZH.md) before replacing an existing checkout. This is a whole-project update, not a replacement for `src/main.tsx` alone.

## Included functionality

- Redesigned responsive interface: translate, converse, listen, phrasebook and preferences.
- Persistent Chinese / English interface selection, separate from input/output languages.
- Arbitrary input, with UTF-8-aware translation chunks, request cancellation and stale-response protection.
- Hong Kong Cantonese system speech, plus English and Mandarin system speech. No Mandarin fallback for Cantonese.
- Exact Ekho syllable recordings and selectable readings for polyphonic characters. Choices do not override system speech phonemes.
- Saved phrases, history, search, copying and expanded text.
- Opt-in acoustic wake phrase: three enrollment recordings, positive/negative calibration, local matching, and browser dictation after waking.
- PWA manifest, relative GitHub Pages paths and cached audio on demand.
- Preserved optional FastAPI translation and speech services, original audio assets and third-party notices.

## Privacy and limits

Translation text goes to the selected translation provider. MyMemory has availability and free usage limits; this project does not guarantee translation accuracy or unlimited usage. The optional backend can provide contextual translation; MyMemory processes each request independently.

Wake phrase processing runs on the device. Dictation may send audio to the browser's speech provider. No recording starts automatically. Switching tabs within Vokawa, hiding the document or leaving the page stops recording. Background or lock-screen listening is not supported. Wake samples are stored only in the current browser/site.

The reconstructed wake engine uses profile version 2 and a new storage key. Previous recordings are left untouched, but must be enrolled again for this engine. The requested +0.03 calibration tolerance is retained; calibration refuses to save if this would accept a supplied negative example. Real-world wake accuracy must be evaluated with your voice.

System Cantonese voices depend on the device. Sentence-level pronunciations and prosody remain under the operating system's control. Character recordings are exact clips and have not been replaced.

## Source map

- `src/main.tsx`: React bootstrap.
- `src/App.tsx`, `src/style.css`, `src/Icon.tsx`: application, layout and icons.
- `src/i18n.ts`, `src/messages.ts`: interface language and service message localization.
- `src/translation.ts`, `src/model.ts`: translation requests, data and saved preferences.
- `src/speech.ts`, `src/cantonese.ts`, `src/ekho.ts`, `src/pronunciation.ts`: playback and pronunciation.
- `src/WakePanel.tsx`, `src/wake-core.ts`, `src/wake-audio.ts`: wake enrollment, matching and microphone lifecycle.
- `audio-assets/`: lossless split archive, restored into `public/audio/` automatically.
- `backend/`, `speech-service/`: preserved optional Python services.
- `tests/`: unit tests and browser acceptance scenarios.
- `backups/`: original source backups and superseded browser tests.

## Verification

See [the verification report](docs/V06_VERIFICATION.md) for the checks actually executed. Browser scenarios are included but were not run in the generation environment. To run them locally after building:

```sh
npx playwright install chromium
npm run test:e2e
```

These tests mock translation and speech-service responses. They do not certify real transcription, Cantonese pronunciation or iPhone microphone behavior.

## Deployment

This delivery does not publish anything. The retained GitHub Actions workflows deploy `main` pushes to GitHub Pages when enabled. Finish local testing before pushing. For iPhone installation, open the eventual HTTPS URL in Safari and choose Share → Add to Home Screen.

## Licensing

See `LICENSE`, `public/THIRD_PARTY_NOTICES.txt`, and the license files restored with the audio. Original assets and their attribution are preserved. New source comments are in English; interface text and documentation intentionally include Chinese.
