# Section 03 — Worker Audio QC Engine & Continuous Ingestion Transcoding

## 1. Objective
Build containerized Worker audio ingestion and QC evaluation pipeline: CFR 25.000 fps + 48kHz float resampling, Silero VAD, Faster-Whisper ASR CER evaluation with PyThaiNLP, SyncNet AV sync bounds, MusicNN BGM ingress detection, and F0 pitch anchor.

## 2. Invariants
1. All incoming videos must be normalized to CFR 25.000 fps and 48,000 Hz 32-bit float audio (`soxr`) immediately upon download to eliminate progressive timecode drift.
2. Thai ASR CER evaluated with PyThaiNLP word segmentation; CER ≤ 0.15 passes.
3. Allowable AV sync window is `[-60ms, +30ms]`.
4. BGM bleed flagged if harmonic ratio > 0.40 while `music.enabled === false`.

## 3. Files to Modify & Create
- [NEW] `apps/web/server/services/verticalDramaAudioQc.ts`:
  - Dispatches Worker audio QC jobs, stores `AudioQcReport` in database.
- [NEW] `apps/web/server/services/__tests__/verticalDramaAudioQc.test.ts`:
  - Unit tests for QC scoring, CER thresholds, and sync flags.

## 4. Verification
- `npm test -- verticalDramaAudioQc.test.ts`
