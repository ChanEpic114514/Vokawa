# HK Native Engine 1.0 — Vokawa 0.8

This release integrates a local, conservative Hong Kong spoken-language postprocessor into both existing translation-provider paths. It does not replace MyMemory with a language model. There is one spoken style, with no formal-mode toggle. Uncertain clauses can remain written Chinese to avoid inventing meaning.

## Pipeline and guarantees

1. MyMemory still receives the current input, using the existing 500-byte chunking, language codes, cancellation, quota and network handling. No API key, new backend, subscription or additional translation endpoint was added.
2. After a valid response, `nativeTranslation` processes **only** Cantonese targets. English and Mandarin targets pass through. Saved history is not retranslated. New history and optional automatic speech receive the same processed text.
3. `opencc-js` 1.4.2 (`cn2t`, `cn` → `hk`) runs locally. Dictionaries ship in the bundle, with MIT / Apache-2.0 notices in `public/THIRD_PARTY_NOTICES.txt`.
4. Quoted spans, titles, code, URLs, email addresses and markup are masked before conversion, restored byte-for-byte, and excluded from grammar rewriting. Unknown compound names are never substring-replaced. Unquoted Han names can undergo orthographic conversion; this is not named-entity recognition.
5. A bounded clause parser accepts only explicitly supported subjects, times, predicates and typed noun phrases. A rewrite requires consuming the entire clause. Unknown tails fall back to the OpenCC-normalized provider result. No global vocabulary find-and-replace is used. Numbers must survive in the same order, otherwise the original result is returned.
6. Source English is retained only in supported slots: `social media` in a media noun slot, `meeting` in a having-a-meeting construction. Clause counts must align; quoted source terms are ignored. Existing English is preserved. Chinese-only input does not trigger artificial English insertion.

Examples covered by the authored corpus:

| Provider text | Local output | Condition |
| --- | --- | --- |
| 我们明天乘坐公交车去机场。 | 我哋聽日搭巴士去機場。 | Fully recognized travel clause |
| 我正在喝奶茶。 | 我飲緊奶茶。 | Recognized progressive verb and drink |
| 我们还没有吃饭。 | 我哋仲未食飯。 | Negative aspect retained |
| 我的钱包 | 我嘅銀包 | Possessive noun phrase |
| 我今天有会议。 | 我今日有 meeting。 | Corresponding source clause uses “meeting” |
| 我使用社交媒体。 | 我用 social media。 | Corresponding source clause uses “social media” |
| 微信支付不是八達通。 | Unchanged | No substitution of brands/services |
| 我不能喝水。 | Unchanged | Ability versus permission is uncertain |

The parser does not arbitrarily change Mandarin modal 會, add sentence-final emotion particles, replace mainland place names with Hong Kong names, or turn every 謝謝 into 唔該.

## Lexicon provenance and review

`src/hk-lexicon.ts` contains project-authored entries and `tests/hk-corpus.ts` contains project-authored acceptance examples. **These entries have not been signed off by a Hong Kong native-speaker reviewer.** `LEXICON_REVIEW` explicitly records `pending-native-speaker-review`. Automated expected-output tests are engineering checks, not human linguistic review. No dictionary definitions, audio or bulk word list were scraped or redistributed.

Reference points checked during implementation:

- OpenCC implementation and conversion API: https://github.com/nk2028/opencc-js (installed stable 1.4.2, not the prerelease).
- Hong Kong transport terminology: https://www.fed.cuhk.edu.hk/~pth/publish_new_20.php (CUHK discussion of 的士 / 巴士).
- Fridge terminology: https://words.hk/zidin/雪櫃 . Reference only; dictionary data was not imported.
- MyMemory API: https://mymemory.translated.net/doc/spec.php . Existing service limits still apply.
- Browser voice inventory: https://developer.apple.com/documentation/webkitjs/speechsynthesis/1634378-getvoices and https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis . Device voices, not app-bundled models.

## Mixed speech

`speechParts` groups continuous English words, acronyms and numbers into English runs. Han runs use the selected target language. Cantonese runs accept only explicit local HK/Cantonese language tags; Mandarin is never a fallback. Local English voices are resolved before playback (preferred English voice if selected; otherwise en-GB if present). If either required language is missing, playback stops with a download/refresh instruction before any fragment is spoken.

Utterances advance on completion without an artificial inter-segment delay. Stop, errors, stale callbacks and timeout settle the existing completion callback, so continuous listening can resume. No extra microphone access was introduced. Speech does not concatenate individual character recordings.

Limitations: the browser can pause between voices; consistent timbre or gapless prosody cannot be guaranteed. Latin script detection is not a full language detector (French names and romanized Cantonese may be spoken as English). Empty voice inventories require refreshing after device voices become available. Automated fake-voice tests cannot verify pronunciation, loudness or Safari audio behavior.

## Validation and reproducibility

```sh
npm ci
npm test
npm run build
# Browser regression suite, also run in GitHub Actions:
npx playwright install --with-deps chromium
npm run test:e2e
# Optional actual API check, consumes free quota and writes an evidence file:
NODE_USE_ENV_PROXY=1 node scripts/check-hk-live.mjs
```

- `tests/hk-corpus.ts`: vocabulary, questions, aspect, negation, names, quotes, numeric fidelity, contextual mixing and fallback cases. Each case also checks idempotence.
- `tests/hk-native.unit.test.ts`: provider-independent integration, target-language pass-through, protected markers and clause-context isolation.
- `tests/mixed-speech.unit.test.ts`: lossless segmentation, voice selection, absent voices, completion/cancellation and errors/timeouts.
- `tests/product.e2e.spec.ts`: existing UI regressions plus provider-response → HK result → saved history, preserving old records. API responses and microphone/voices are mocked in these browser tests.
- `docs/hk-live-results.json`: timestamped **actual** API responses, before/after text and matched rules. Success means an HTTP translation was returned, not that it was certified correct. The script stops on a failure rather than reporting partial success as a pass.

No physical iPhone or human Cantonese listening review was performed for this release. On an iPhone, test a mixed sentence such as `我今日有 meeting，之後睇 social media。`, stopping midway, replaying, and continuous wake → transcription → translation → auto speech → waiting. Missing local HK/English voices should show an actionable error, never silently select Mandarin.

## Limits of the requested architecture

A finite local rule engine cannot guarantee native-level translations for arbitrary sentences or repair every MyMemory mistranslation. Complex/ambiguous clauses intentionally retain the provider wording. Source/target clause alignment is heuristic, not semantic alignment. Proper-name detection, English loanword choice and human lexical sign-off remain limited. MyMemory still needs the internet and has free quota limits; only postprocessing, dictionary conversion and available local voices run on the device. Neither the history storage keys nor saved wake profiles were changed.
