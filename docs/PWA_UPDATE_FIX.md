# Vokawa 0.6.2 — update recovery

The initial 0.6 release used prompt-mode service-worker registration without an update prompt. A waiting worker could leave an installed PWA running the old calibration rejection code even after a deployment.

This release activates new workers and claims clients, without forcibly reloading pages mid-recording. The explicit update link is visible in the header and wake panel. `/Vokawa/api/update.html` uses a path already excluded from the old worker's navigation fallback. It registers and updates the scoped worker, activates a waiting worker, then navigates back. It never clears local storage, deletes saved profiles, unregisters other workers, or starts the microphone. The recovery page is excluded from precaching so future recovery changes remain available online.

Open the recovery page while connected, choose **Update & open**, then confirm **v0.6.2** in the application. Installed iPhone users may need to close and reopen the home-screen app after updating in Safari. Unsaved enrollment takes are not persisted and should be completed before updating.

The scale-aware calibration correction from the preceding release is retained. A genuine overlap still fails safely; matching and different-phrase distances are available under Calibration details. Semantic differences do not guarantee acoustic separation. No real-user microphone accuracy is claimed by automated tests.

Validation: 54 unit tests pass locally, including waiting-worker activation, update failure recovery and legacy fallback exclusion; production build passes. Browser integration tests run in GitHub Actions.
