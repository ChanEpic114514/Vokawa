---
title: Vokawa Cantonese Speech
emoji: 🔊
colorFrom: green
colorTo: blue
sdk: gradio
sdk_version: 5.49.1
python_version: 3.12
app_file: app.py
pinned: false
license: mit
---

This is the Gradio transport for Vokawa. Upload app.py, requirements.txt,
and backend/__init__.py + backend/cantonese_speech.py at the Space root.
Use its https://OWNER-SPACE.hf.space address in Vokawa's Gradio speech setting.

Weights: typangaa/canto-tts-nano (Apache-2.0); the downloaded model is about
764 MB and may need over 2 GB RAM during CPU inference. This is not a
verified iPhone inference solution.

Hosting is not deployed by this source package. New normal compute Spaces
currently require a paid plan. Eligible free personal accounts may select
ZeroGPU, but CPU ONNX execution on that hosting route is not verified here.
No GPU allocation is claimed by this CPU adapter. Do not select paid hardware.

The service receives text and readings only. It creates temporary output WAVs;
Gradio cache cleanup is configured for 10 minutes. No microphone or voice clone.
