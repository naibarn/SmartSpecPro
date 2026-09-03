# Section 05 — Final Master Assembly, Loudness Normalization & Codec Delivery

## 1. Objective
Implement cinematic mastering and container delivery: Remotion audio timeline graph, automated J/L-cuts, anti-pumping spectral mid-band ducking, 75Hz mobile HPF, EBU R128 loudness normalization (-14 LUFS, -1.0 dBFS True Peak, LRA ≤ 6.5 LU), FastStart `moov` atom placement, and dual-codec delivery.

## 2. Invariants
1. Master output strictly normalized to -14 LUFS (±1.0 LUFS) and True Peak ceiling ≤ -1.0 dBFS.
2. FastStart `moov` atom placed at container start (`-movflags +faststart`).
3. Dual-codec delivery: AAC-LC in `.m4a` for Safari / iOS; Opus in `.webm` for Chrome / Android.
4. Vertical 9:16 dialogue stereo pan clamped to ±22%.

## 3. Files to Modify & Create
- [NEW] `apps/web/server/services/verticalDramaAudioMastering.ts`:
  - Remotion audio graph builder and mastering DSP filter chain.
- [NEW] `apps/web/server/services/__tests__/verticalDramaAudioMastering.test.ts`:
  - Unit tests for filter chain syntax, loudness flags, and faststart options.

## 4. Verification
- `npm test -- verticalDramaAudioMastering.test.ts`
