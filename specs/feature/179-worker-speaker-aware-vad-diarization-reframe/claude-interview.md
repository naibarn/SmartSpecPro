# Feature 179 Interview Transcript

The user requested autonomous planning and implementation with no further confirmation. The following domain decisions are extracted from the request history and are treated as the interview transcript; no additional question was needed.

## Q1. Must the workflow be fixed?

**Answer:** No. The user explicitly requires selectable workflows. A user may run subtitle-first editorial trimming on 16:9, then later reframe to 9:16 and run speaker-aware analysis. The product must not lock users into scan → diarize → reframe → render.

## Q2. Must the existing Silence Cut remain?

**Answer:** Yes. Dead-air detection, profile thresholds, manual range selection, playback skipping, FFmpeg dead-air rendering, and Remotion rendering must remain available. The new speaker-aware plan is additive and must consume the same composed edit map when selected.

## Q3. What should happen when an adapter is unavailable?

**Answer:** The user must be able to configure which adapters are active. The system must show preflight status and must never silently fall back to a different adapter. Any allowed fallback must be explicit in policy and visible in the result.

## Q4. What should speaker-aware editing support?

**Answer:** More than one speaker, people who are not facing the camera, people visible only as a body/person, stable seated/standing positions, slow camera moves, immediate cuts, manual locks, and user review/customization before render.

## Q5. What evidence can be used?

**Answer:** Authored subtitle/sidecar subtitle, observed ASR, VAD, optional diarization, face/body/posture tracks, and active-speaker evidence can be combined, but their provenance and conflicts must remain visible. Subtitle-first and visual/audio-first are both valid.

## Auto-decisions

- Use existing Zod contracts and worker job ledger patterns.
- Keep the composed edit map as the canonical bridge between preview, FFmpeg, and Remotion.
- Make scan artifacts immutable/versioned and require parent artifact hashes for downstream plans.
- Use a capability registry and explicit `AdapterPolicyV1`; selected adapters run only when preflight passes.
- Treat active speaker as a fusion result, not as face detection alone.
- Prefer pure functions for interval joins, confidence scoring, smoothing, debounce, and recipe compilation so they are testable without GPU/model files.
- Do not add a database migration unless the existing job/artifact persistence cannot carry the new versioned payload. First use existing job payload/artifact metadata boundaries.
