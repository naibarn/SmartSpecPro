# Section 04 — Surgical Demucs Stem Repair Pipeline & Acoustic Convolver

## 1. Objective
Implement Zero-Pixel Surgical Audio Repair: Demucs v4 stem separation (`vocals.wav`, `no_vocals.wav`), TTS replacement for failed dialogue, Thai particle tonal preservation (`<prosody pitch="+5%">`), Room Impulse Response (IR) convolution, downward expander noise gate, and Stage 4b visual mouth realignment.

## 2. Invariants
1. VRAM Guardrail: If free GPU VRAM < 2.0 GB, Worker automatically routes Demucs via `--device cpu` without failing.
2. GPU queue serialization: Demucs tasks throttled to concurrency = 1 per GPU node.
3. Repaired audio must preserve exact original frame count and video duration.

## 3. Files to Modify & Create
- [NEW] `apps/web/server/services/verticalDramaAudioRepair.ts`:
  - Orchestrates stem isolation, TTS synthesis, IR convolution, and remuxing.
- [NEW] `apps/web/server/services/__tests__/verticalDramaAudioRepair.test.ts`:
  - Unit tests for repair workflow and credit estimation.

## 4. Verification
- `npm test -- verticalDramaAudioRepair.test.ts`
