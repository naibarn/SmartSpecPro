# Section 04 — Preview UI

Add `VoiceGuidedVisualMatchModal.tsx` and wire Media Workspace. Collect the `audio_voice` track and image candidates from `video_broll`/`video_main`. Invoke HyperFrames with word timestamps when supported, call native image analysis once per image with progress, and build the pure proposal.

Render idle, transcribing, analyzing, ready, low-confidence fallback, applying, applied, and error states. Show sentence boundaries, text, image thumbnail/name, confidence, evidence, original/proposed order, and windows. Enable reordered apply only when eligible. Provide original timing, reordered plan, cancel, and undo actions.

Use existing locale hook and add Thai/English strings. Keep focus trapped, buttons keyboard reachable, progress in a live region, and the list scrollable on mobile/tablet. Do not mutate project during analysis.
