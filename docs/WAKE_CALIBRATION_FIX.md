# Wake calibration fix — 2026-10-15

The rebuilt engine returns normalized distances. Adding an unconditional 0.03 to the positive/negative midpoint rejected all separable samples whose gap was 0.06 or less. The UI incorrectly described both this artificial margin failure and genuine acoustic overlap as similar speech.

Calibration now uses midpoint + min(0.03, gap / 4). The result remains strictly above all supplied positive distances and below all supplied negative distances. No known-negative guard is bypassed. Actual overlap still fails with an accurate explanation and buttons to rerecord either calibration group without discarding templates. Saved profiles and distance calculations remain unchanged.

Regression cases cover narrow gaps at five scales, the previously rejected narrow-gap example, invalid distances, wide gaps, and actual overlap. These automated tests do not certify a user's real recordings or wake accuracy. Existing saved profiles are not automatically recalibrated.
