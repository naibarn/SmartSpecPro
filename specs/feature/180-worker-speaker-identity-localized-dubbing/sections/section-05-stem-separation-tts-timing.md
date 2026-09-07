# Section 05 — Stem Separation and TTS Timing

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Create cue-level replacement dialogue with reliable timing and an explicit source-audio decision.

## Implementation scope

- Add durable cue-level TTS generation with one artifact per localized cue/speaker.
- Apply semantic timing budget, provider speed and bounded pitch-preserving time-stretch in that order.
- Preserve original cue intervals and record overflow/quality flags.
- Reuse the real Demucs/stem capability and QC boundary. Keep source music/SFX stems when leakage/quality passes.
- If quality fails, surface `remove_all_original_audio` and `manual_daw_required`; do not mix generated dialogue over source dialogue silently.
- Normalize sample rate/channel layout and record input audio-track selection, dialogue/music/SFX bus routing, ducking, headroom, loudness and true-peak settings. Block unresolved localized cues unless the user selects an explicit retention/non-dub policy.
- Support partial completion, checkpoint/resume and cue-level retry without duplicate paid provider work.

## TDD stubs

- Cue artifact and timing metadata tests.
- Speed/time-stretch bound and overflow tests.
- Stem quality/leakage decision tests.
- Audio routing tests for retained and removed original tracks.
- Mix-bus, sample-rate/channel, loudness/true-peak and unresolved-cue blocking tests.
- Input audio-track selection and no-subtitle cue-policy tests.
- Worker restart and partial retry tests.

## Exit criteria

The user can review cue waveform/timing and select an explicit audio strategy before mix/export. No unacceptable source dialogue leakage can pass silently.

## UI/UX Contract

### Target User / JTBD

Editors need to judge whether generated dialogue fits and whether original music/SFX can be retained safely.

### Surface Inventory

The Review tab contains cue waveform/timing, overflow flags, stem quality report, audio strategy choices and retry/manual-DAW action.

### Component Map

`DubbingCueReview` owns cue audio and timing; `StemQualityCard` owns leakage metrics; `OriginalAudioDecision` owns retain/remove/manual choice; worker job state remains server-authored.

### State Matrix

Cover generating, partial cues, timing overflow, separation running, acceptable, unacceptable, manual-DAW required, approved mix and retry.

### Responsive Matrix

Waveform and decision controls remain visible beside the timeline at desktop/laptop; stack cue and decision cards at tablet/mobile with one scroll surface.

### Accessibility Acceptance

Audio controls have text alternatives, timing values are announced, strategy radios are labeled and focus is preserved after preview completion.

### Copy Contract

Explain “เก็บเพลง/SFX ที่แยกได้”, “เอาเสียงต้นฉบับออกทั้งหมด” and “ส่งต่อทำใน DAW” with a clear warning against dialogue leakage.

### Browser Evidence Required

Capture timing overflow, acceptable separation, unacceptable separation and all-original-audio removal choice with cue audio controls reachable.

## v2 required integration

Consume both 08 local and 09 cloud results. Probe actual decoded duration. Timing/aligner artifacts bind final stretched checksum; failed alignment retries alone. Preserve authored/native dialogue choice and optional translation. Enforce contracts-v2.md stretch bounds and explicit source policy.
