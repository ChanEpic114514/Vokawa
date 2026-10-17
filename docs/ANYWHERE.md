# Vokawa Anywhere

Version 0.10 adds iOS Share Sheet intake via a manually configured Shortcut and a URL fragment. The full Chinese installation guide is [public/anywhere.html](../public/anywhere.html), deployed at https://chanepic114514.github.io/Vokawa/anywhere.html. [The JSON recipe](../shortcuts/translate-with-vokawa.json) records all action inputs and outputs. It is not an importable shortcut file. No signed shortcut or iCloud link has been generated; native action execution needs a physical Apple-device check.

## Protocol and lifecycle

`https://chanepic114514.github.io/Vokawa/#vokawa-share=<percent-encoded UTF-8 text>`

Encode only the payload once using Shortcuts URL Encode (Encode mode). The entire suffix is one value, not a URLSearchParams/query string; literal plus signs are preserved. There are no automatic-translate flags, callback URLs, remote-fetch URLs or language commands. FROM/TO remain user choices. Text, markup and JavaScript-looking strings are displayed as plain textarea content.

The build injects `scripts/anywhere-boot.js` near the top of the document, before the application bundle. The bootstrap bounds raw input to `prefix.length + 3000 * 9`, removes the owned fragment via `history.replaceState`, and queues only the latest packet in memory. It listens to hashchange, popstate and pageshow. The React subscriber consumes each packet once, stops speech/microphone/wake activity and pending translation, opens Translate, fills input and displays explicit confirmation. This includes repeat shares of identical text after the previous hash was removed. It does not deduplicate deliberate later shares.

`src/anywhere.ts` decodes once, rejects malformed UTF-8/percent encoding, unsupported control characters, empty input and more than 3,000 UTF-16 units, without truncating. Leading/trailing spaces, punctuation and line endings are preserved. The UI's existing character limit uses the same UTF-16 measurement. Native Shortcuts character counts may differ for emoji and combining sequences; browser validation is authoritative.

Only the user-triggered Confirm and translate button (or the existing Ctrl/Command+Enter equivalent) starts a translation. Automatic wake translation is disabled while intake confirmation is pending. Editing the text retains the confirmation state; cancelling discards it. A full reload has no fragment to reconsume and no saved intake draft. Ordinary non-Anywhere anchors are untouched. Cleanup failures fail closed with a generic error and no imported text. They cannot guarantee removal from a browser that refuses history updates; the user is told to close that tab.

## Privacy boundary

Fragments are not part of an HTTP request URL or referrer. A no-referrer policy is also set on the app and guide. Content is never placed in query parameters, titles, logs, history state, localStorage, sessionStorage or analytics. Existing translation/history behavior applies only after confirmation; successful confirmed translations may be saved according to the user's current setting. Browser session restoration/BFCache may retain in-memory UI. No promise is made to erase OS handoff data, browser-sync history, extensions, third-party app records or a URL before this page has executed. If the app fails to load or an old service worker serves an old build, clean-up may not run: update first and share again.

## iPhone and app compatibility

Use an HTTPS URL with Open URLs. The OS/default browser decides whether this opens Safari, another browser, a new tab or an installed PWA. There is no supported forced PWA-instance targeting or cross-container storage assumption in this implementation. No Web Share Target is declared. Safari is the recommended default for testing.

Apps must expose a system share action and pass text. A WhatsApp version that only exposes Copy/Forward cannot be made to expose Share by a web app. The configured Ask For Text fallback lets users copy, run the shortcut manually and paste intentionally. Sharing a web page URL is not equivalent to sharing selected text; the app does not fetch page bodies.

The old HK Native postprocessor was still wired into the repository's translation handler. Its runtime import/call has been removed to honor the user's decision not to use it. Historical entries are left intact. Legacy engine source and unit tests remain as inactive reference; Anywhere does not add or call a localization engine. Mixed-language speech and existing provider translation remain in place.

## Validation

`npm test` checks protocol edge cases, bounded inbox behavior, early URL cleanup, retry/repeat handling, cleanup failures and the action recipe's variable graph. The recipe check verifies the written configuration only, not Apple's native implementation.

`npm run build` checks TypeScript and embeds the bootstrap in production HTML. `tests/anywhere.e2e.spec.ts` exercises initial and warm intake, special characters, rejection, repeated shares, refresh/back navigation, confirmation-only network calls, storage privacy, stale translation cancellation and the installation guide in Chromium and WebKit. MyMemory responses are mocked; tests do not claim actual service quality or audible pronunciation.

Run after building:

```sh
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e
npx playwright test --config=playwright.webkit.config.ts
```

No physical iPhone Shortcut, WhatsApp/Mail share menu, actual Open URLs handoff or Home Screen launch has been tested in this environment. Follow the guide's two-line special-character example, repeat/refresh checks and long-input check on a device before claiming end-to-end iPhone support.
