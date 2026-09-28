# Feature 175 Test-Driven Development (TDD) Plan

## 1. Test Philosophy & Automated Quality Gates

All implementations strictly adhere to Test-Driven Development:
1. Write failing test reproducing contract/functionality.
2. Implement smallest safe change.
3. Verify test passes cleanly with zero regressions on existing suites.
4. Gated by strict coverage rules: Lines ≥ 90%, Branches ≥ 85%, Functions ≥ 95%.

## 2. Test Matrix by Section

### Section 01: Contracts & Fingerprints
- `verticalDramaAudioContracts.test.ts`: Validates `ShotAudioIntent`, `AudioManifest`, and `AudioQcReport` schemas.
- `verticalDramaEnhancedVideoPrompt.test.ts`: Verifies `buildEnhancedInputFingerprint` changes when `nativeAudioEnabled` toggles.
- `prompt-intent.schema.json` validation test: Verifies `oneOf` backward compatibility.

### Section 02: Compiler & Model Adapters
- `enhanced_bridge_audio.test.py`: Verifies `_terminal_prompt` produces "Spoken dialogue only" when toggle is `false`, and rich Foley + Ambience when `true`.
- `providerAudioShaping.test.ts`: Verifies model-specific timecode tags (Gemini Omni) vs positive blocks (Grok).

### Section 03: Worker QC & Transcoding
- `audioQcAnalyzer.test.ts`: Tests Silero VAD, Faster-Whisper ASR CER, and BGM ingress on test samples.
- `ingestionTranscoder.test.ts`: Tests CFR 25fps + 48kHz float resampling.

### Section 04: Surgical Demucs Stem Repair
- `demucsStemRepair.test.ts`: Tests stem extraction, TTS replacement, and IR convolution.

### Section 05: Mastering & Codec Delivery
- `cinematicMastering.test.ts`: Tests EBU R128 (-14 LUFS / -1.0 dBFS True Peak), FastStart `moov`, and dual-codec output.
- `perceptualAudioDiff.test.ts`: Verifies STFT spectral MSE < 0.001 against golden waveforms.

### Section 06: Storyboard UI & Metering
- `verticalDramaStoryboardAudioUi.test.tsx`: Tests Switch binding, 3-stem mixer faders, and Take history rollback.
