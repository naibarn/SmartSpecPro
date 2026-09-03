# Section 03 — Skill-first media inspection and terminal prompt finalizer

## Objective

Inspect every real attachment first, author grounded prompt context, compose
all deterministic constraints, and make a provider-specific final optimization
skill the last semantic writer. The final prompt shown, persisted, QC-checked,
and serialized is the same string.

## Files and boundaries

- Add versioned inspection/final-optimization skills through the existing skill
  registry/loader.
- Extend `verticalDramaVideoMotionPromptGeneration.ts` with typed attachment
  input, inspection results, labels, and terminal finalizer ownership.
- Extend `verticalDramaStoryBible.ts` or a focused adapter for capability-aware
  native/derived video and audio inspection content.
- Reuse the existing image prompt terminal-finalizer interface where possible.
- Add prompt hash/equality metadata and tests.

## Required behavior

Stage A inspects every actual start, stop, and reference asset. Images use native
vision when available. Video/audio use native input only when supported;
otherwise use bounded keyframes/transcript/metadata with explicit derived state.
Unreadable/unavailable assets stay visible in diagnostics and cannot be dropped.
Cache by media fingerprint and skill version; retry idempotently. Treat media
text, filenames, captions, and transcripts as untrusted content.

Stage B receives the complete manifest, inspection status, continuity facts,
provider profile, and temporal roles. Every accepted label appears in the
manifest/prompt, or receives an explicit not-used reason.

Stage C adds provider mode, temporal semantics, dialogue, audio, style, safety,
negative, and model-format instructions before Stage D.

Stage D returns final positive/negative prompt, skill/version stamp, bundle
revision/fingerprint, capability profile version, and validation. Afterward
only validation, hashing, authorization, and text-preserving transport are
allowed. User/model/profile/revision edits invalidate the final stamp and rerun
the finalizer. Reject any whitespace/Unicode/trim mutation that changes hash.

## TDD-first tests

Write tests for native/derived/unavailable inspection, cache/idempotency,
attachment coverage, prompt-injection isolation, stable labels, pre-finalizer
composition, post-finalizer immutability, user-edit invalidation, hash equality,
and retry/repair/speaker-switch/bulk fingerprint preservation.

## Exit criteria

Focused skill, motion-prompt, image-finalizer, and router prompt tests pass, and
an outbound request fixture proves exact terminal prompt equality.

## UI/UX Contract

### Target User / JTBD
N/A — skill orchestration is backend/skill runtime behavior; prompt display is section 05.

### Existing Pattern Reference
N/A — no new UI surface; reuse the image prompt finalizer contract.

### Surface Inventory
N/A — no browser surface is changed by this section.

### Component Map
N/A — no browser components are owned here.

### State Matrix
N/A — inspection/finalizer states are machine-readable and tested here; UI mapping is section 05.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — accessibility acceptance is in section 05.

### Copy Contract
N/A — skill output is structured data; user copy is section 05.

### Browser Evidence Required
N/A — browser evidence is required in section 05.

### Implementation status

Implemented in `apps/web/shared/verticalDramaShotMedia.ts` and
`apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`.
Stable labels are included before authoring, actual stop images are attached
when present, mixed references are declared explicitly, unavailable
video/audio inspection is not falsely claimed, and the terminal optimizer is
the final semantic prompt writer. Focused motion-prompt tests pass.
