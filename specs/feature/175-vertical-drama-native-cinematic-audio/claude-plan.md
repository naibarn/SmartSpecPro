# Feature 175 Implementation Plan: Native Audio Vertical Drama Series

## 1. Executive Summary & Core Invariant

This plan details the additive implementation of **Feature 175: Native Audio Vertical Drama Series** according to the 1,242-line hardened specification.
The core invariant established by the user is strictly enforced:
- `nativeAudioEnabled === true`: Generate full cinematic sound design (Verbatim Dialogue, Motivated Physical Foley with Material Pairing, Continuous Room Tone, Subjective States).
- `nativeAudioEnabled === false`: Strictly enforce **"Dialogue Only"**. Strip all Foley and ambient room tone. Inject hard negative prompt audio constraints forbidding environmental sound, foley, and music. If a shot has no dialogue, enforce silent visual acting.

## 2. Architecture & Pipeline Structure

The architecture spans 6 decoupled slices:
1. **Contracts & Fingerprints:** Additive `ShotAudioIntent`, `AudioManifest`, `AudioQcReport`, schema `oneOf` compatibility, fingerprint cache invalidation, and tRPC endpoints.
2. **Compiler & Model Adapters:** `enhanced_bridge.py` Python prompt compilation adhering to toggle state across Gemini Omni, Grok, MiniMax H3, Seedance, Veo, Wan.
3. **Worker QC & Transcoding:** Containerized ingestion transcoding (CFR 25fps + 48kHz float sinc resampling), Silero VAD with vocal fry resilience, Faster-Whisper Thai CER with bilingual code-switching, SyncNet AV sync window, MusicNN BGM ingress detection, and F0 pitch anchor.
4. **Surgical Demucs Stem Repair:** Demucs v4 stem isolation (`vocals.wav`, `no_vocals.wav`), ElevenLabs / Gemini Flash TTS dialogue swap, Thai particle tonal preservation, room impulse response (IR) convolver, downward expander noise gate, WSOLA pause injection, and Stage 4b facial mouth realignment.
5. **Mastering & Codec Delivery:** Remotion audio graph, J/L-cuts, spectral mid-band ducking, 75Hz mobile HPF, phase correlation, EBU R128 loudness normalization (-14 LUFS / -1.0 dBFS True Peak), FastStart `moov` atom placement, and dual-codec delivery (AAC-LC for Safari, Opus for Chrome).
6. **Storyboard UI & Metering:** Episode header switch, 3-stem mixer faders, WebAudio synchronized playback engine, studio LUFS/VU meters, sub-segment punch-in, and Take history rollback drawer.

## 3. Section Manifest

- `section-01-contracts-and-fingerprints.md`
- `section-02-compiler-and-adapters.md`
- `section-03-worker-qc-and-transcoding.md`
- `section-04-demucs-surgical-repair.md`
- `section-05-mastering-and-codec-delivery.md`
- `section-06-storyboard-ui-and-metering.md`
