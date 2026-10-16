# Vokawa 0.7 — dark interface and capture aurora

This release follows the selected dark design with a low-saturation capture light band. Neutral charcoal surfaces, muted violet/rose/amber accents, the original Vokawa icon and desktop left navigation are retained. Compact functional headings replace promotional slogans. Translation, Cantonese audio, saved phrases and wake calibration remain available.

The aurora appears only after an existing speech recognition session reports that it has started, or after local wake capture finishes initializing. It requests no microphone stream of its own. Stopping, errors, microphone disconnection and the existing page-visibility cleanup turn it off. Its Stop button stops the current capture, including wake listening. Initial wake enrollment and active wake listening also show the band because the microphone is in use. Motion is a capture-state indicator, not an amplitude meter. The curves stay static under reduced-motion preferences.

English and Chinese labels are supported. Existing local history and wake profiles are preserved. The version link opens the existing update recovery page.

Validation: 59 local unit tests passed; TypeScript and production build passed. GitHub browser tests cover recognition startup, explicit stop, network failure, no extra audio capture, mobile overflow, reduced motion and screen changes in addition to the existing product checks. Automated browser tests use simulated recognition and do not prove microphone accuracy or iPhone Safari compatibility on physical hardware.

Rollback: the previous deployed source is commit 630a13ed5c4a597870cc9497626aee560331251d. Reverting this release restores the prior appearance without deleting browser profiles.
