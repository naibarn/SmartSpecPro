# Final implementation gap audit — special tie-in episode

Date: 2026-08-29

This audit compares the implemented code with the design spec and all eight
implementation sections. It was repeated in five independent passes after the
section implementation was marked complete. The audit covers code and focused
tests; browser, provider, migration, deployment, and live Marketplace evidence
remain environment-level verification boundaries.

## Round 1 — contract, persistence, and API traceability

- Verified `episodeKind`, `specialSequence`, `specialData`, input versioning,
  idempotency, and normal-count exclusion are represented in the shared
  contract and server paths.
- Verified normal episode creation filters normal rows and computes the numeric
  episode ceiling without allowing special rows to change normal storyline
  semantics.
- Verified special create/update/retry preflight ownership, character/media
  authorization, model compatibility, and durable episode-local snapshots
  before queueing work.
- Found and fixed one plan-state gap: section 06/07 keys in
  `deep_implement_config.json` had a `.md` suffix that did not match the
  canonical section list. All eight state keys now match the section IDs and
  remain `complete`.

Result: no remaining code or plan-contract gap found.

## Round 2 — `idea-to-video-prompt` runtime and output contract

- Verified the adapter loads the installed skill resources and maps idea,
  references, characters, duration, 9:16, dialogue, speakers, extras, and
  locks into the skill input contract.
- Verified the expanded duration family includes 12 seconds without changing
  normal episode duration profiles.
- Verified output validation enforces 1–5 returned shots, exact duration and
  aspect ratio, authorized references/speakers, per-shot dialogue mode, and
  safe error classification.
- Closed the direct-API dialogue gap by requiring at least one selected speaker
  when dialogue is enabled. Added an explicit `EXACT:` line convention and
  validation so locked dialogue text must appear verbatim in returned speaking
  turns; unmarked text remains skill guidance.
- Verified canonical skill output is normalized into the existing start-frame
  and video-prompt plans without allocating paid image/video tasks.

Result: no remaining adapter/runtime gap found. The adapter's reduced Zod
boundary intentionally validates the fields consumed by the application; the
skill's canonical JSON schemas remain the skill-owned schema source.

## Round 3 — Marketplace Capture, managed media, and security

- Verified the UI flow is product search -> product selection -> exact image
  selection, with debounced search, pagination, loading/error/empty states,
  image previews, and a hard total limit of three references.
- Verified selected Marketplace images are materialized through the protected
  server procedure and persisted as managed media/provenance; the special
  input does not use a raw user-supplied URL as its canonical asset.
- Verified upload references are registered as managed media before they enter
  the special input.
- Verified location/store references support approved existing scene assets and
  server-side stable location-slot creation/reuse for new managed references.
- Verified server-side tenant/user/series/product/image/media ownership and
  ready-image checks occur before episode allocation or job queueing.

Result: no remaining implementation gap found. Live Marketplace permissions,
provider URL resolution, and R2 playback still require authenticated environment
verification.

## Round 4 — shared UI, special/normal boundary, and accessibility

- Verified the special dialog uses the shared episode workspace entry path and
  keeps the normal add-episode action separate.
- Verified the dialog covers the 5000-character brief, 1–3 references,
  character selection, up to three speakers, all required durations, fixed
  9:16, dialogue mode, extras, locks, separate special image/video models,
  edit, retry, loading, and actionable error states.
- Found and fixed one integration gap: the shared storyboard was still being
  passed normal episode-level storyboard generation and preference callbacks
  for special episodes. Those callbacks are now omitted only for
  `special_tie_in`, preventing normal story/prompt generation and normal model
  memory writes while preserving shared per-shot prompt editing and explicit
  image/video rendering actions.
- Verified the special page renders the skill-returned variable shot count and
  displays episode-local model snapshots; normal stage controls remain hidden
  only for the special variant.

Result: no remaining code gap found. Authenticated keyboard/screen-reader and
responsive browser evidence is not available in this environment.

## Round 5 — regression, operations, and convergence

- Verified all eight deep-implement sections are marked complete with canonical
  IDs in the implementation state file.
- Verified focused special tests pass, server entry points parse/bundle, and the
  client/widget production build passes.
- Verified targeted `git diff --check` has no whitespace errors in the owned
  feature paths; unrelated pre-existing worktree changes were not rewritten.
- Verified special create does not call normal story continuation or paid media
  rendering, while explicit downstream render actions remain available.
- Rechecked normal model-selection hydration and persistence boundaries; special
  episodes do not read/write normal series model memory.

Result: no remaining implementation gap identified after five rounds. Full
workspace TypeScript checking previously exceeded the available memory, and
browser/live-provider/migration/deployment checks remain release-gate work,
not silently treated as passed by this audit.

## Evidence run after the final fixes

```text
Focused special Vitest: 4 files passed, 11 tests passed
Normal-flow regression Vitest: 3 files passed, 43 tests passed; one unrelated
router fixture file remains blocked by its pre-existing queue/mock mismatch
Server esbuild parse: passed
Client + widget production build: passed
Skill input/output/UI JSON parse: passed
Plan-state section ID/status consistency: passed
Targeted git diff --check: passed
```
