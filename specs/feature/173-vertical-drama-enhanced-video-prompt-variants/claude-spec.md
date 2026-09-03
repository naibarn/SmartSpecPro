# Synthesized Feature 173 specification

## Outcome

Vertical Drama storyboard creators can generate either the existing Legacy
video prompt or an opt-in Enhanced prompt produced by the constrained Generic
Commercial Video Director v11 skill. Both variants can be viewed in one
familiar editor. Enhanced generation is a preview operation; only an explicit,
CAS-guarded Apply changes the prompt bundle used for rendering.

## Non-regression constraints

- Existing Legacy button, mutation, payload, job lifecycle, polling, editor
  save behavior, projection, and render path remain compatible.
- Feature flags default Enhanced UI/jobs/Apply off. Off means Legacy still
  works and stored Enhanced data remains readable if it already exists.
- Enhanced failures, stale results, runtime unavailability, or late jobs never
  clear Legacy or silently invoke Legacy as a substitute.
- Existing rendered media is never deleted by generation, edit, Apply, or
  restore. A changed prompt provenance is surfaced as `prompt_mismatch` or
  `provenance_unknown`.

## Data and state

Add a versioned `videoPromptVariants` store to each clip. It contains a Legacy
and/or Enhanced full prompt bundle, active variant, revisions, input/model/media
fingerprints, provider/profile/skill/SDK lineage, diagnostics, and edit/finalize
state. Legacy is lazily snapshotted on the first successful Enhanced result.
The existing clip fields remain the active projection for render consumers.
Use the exact Feature 170 `VideoShotMediaBundle` for Enhanced media evidence.

For split shots, Apply is group-atomic and stores a fingerprint over ordered
clips, dialogue windows, prompt hashes, target model fingerprints, and media
bundle fingerprints. No mixed active group is permitted.

## Runtime and API

Add read-only readiness, Enhanced generate, durable job status, variant edit,
finalize, and Apply/restore operations under the Vertical Drama router. All
operations enforce tenant/user/series/episode/shot scope. Readiness is free;
generation/finalize use explicit confirmation, admission, credits, idempotency,
and operation-specific job identity.

The server builds one immutable input snapshot from canonical Drama state,
approved media, continuity, dialogue, exact selected video model/profile, and
the configured authoring model. Adapter overrides are locked routing, no
fallback, research off unless explicitly admitted, `plan_only`, and no Agent
paid tools. Agent output is structured provider-neutral intent. A single
Core/Feature170 provider compiler/finalizer writes the final model-aware
bundle.

## UI

Add one adjacent Enhanced action per shot, one Legacy/Enhanced selector in the
existing editor, independent status/error states, exact model-role summary,
explicit Apply/Restore, stale/runtime/cost diagnostics, and split-shot group
state. Reuse existing components/styles/tokens and preserve current Legacy
layout and keyboard behavior. The browser contract covers mobile/tablet/
desktop, accessibility, flag-off behavior, and preview-versus-active clarity.

## Acceptance

The implementation is complete only when all four sections are implemented,
focused TypeScript tests pass, Legacy regression tests remain passing, variant
reader/merge/runtime/job/UI/model-policy tests exist, and browser/runtime/live
provider/deployment gates are either passed with evidence or clearly reported
as unverified. At least five post-implementation audit rounds must compare
implementation to this spec; every high-confidence gap must be fixed.
