# Section 01 — Pure Matcher

Create `voiceGuidedVisualMatch.ts` with no UI, filesystem, Tauri, or network imports. Define transcript segments/words, voice timeline map entries, image analysis, candidate slides, match evidence, image windows, proposal policy, and proposal fingerprint types. Normalize Thai/English text while retaining display text.

Map source transcript intervals through trim-in, speed, and timeline offset. Clamp to project range, reject invalid intervals, and concatenate multiple audio clips in timeline order. Prefer segment timings; use words to improve boundaries and expose whether word timing was available.

Score image captions, keywords, actions, settings, objects, and OCR against spoken windows with deterministic weights and explainable reasons. Missing analysis is manual review. Original order is always the baseline. Reordering requires one-to-one assignment, every moved image above `highConfidenceFloor`, and a total score improvement of at least `reorderMargin`.

Allocate non-overlapping image windows across the voice duration, preferring sentence boundaries, merging short windows, capping long windows, and handling silence deterministically. Fingerprint transcript, source map, asset fingerprints, analyses, matcher revision, and policy.

Tests cover trim/speed mapping, multi-source concatenation, Thai normalization, score explanations, low-confidence fallback, high-confidence reorder, duplicate prevention, duration coverage, stable fingerprints, and preservation of voice/subtitle clips.
