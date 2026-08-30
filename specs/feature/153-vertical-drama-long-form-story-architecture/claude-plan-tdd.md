# Feature 153 TDD and Verification Plan

## Test layers

1. **Pure contracts:** Zod parsing, canonical IDs/fingerprints, mode/count/
   duration resolution, interval coverage, mystery closure, thread/consequence,
   advantage, relationship graph normalization/timeline/disclosure, lifecycle,
   world rule, capability, look cue, and retrieval rules.
2. **Graph repair:** contradictory family/social edges, affected episode/dialogue
   closure, candidate-vs-active graph diff, and user evidence links.
3. **Projection/concurrency:** memory fold, event append, snapshot checksum,
   user-edit precedence, retcon supersession, row-lock/optimistic conflict,
   and retrieval pack determinism.
4. **Service integration:** blueprint candidate, block checkpoints, resume,
   fencing, repair impact closure, final closure gate, credit/provider
   reconciliation, and Feature 151 adapter parity.
5. **Router/UI:** authorization and tenant scope, status/action mapping,
   candidate approval, bounded relationship-graph filters/cursors/page-size,
   redacted counts, candidate-active aggregate diff, jsdom state rendering,
   responsive browser evidence, and accessibility checks for changed surfaces.
6. **Replay/performance:** 120-episode quality fixture, 150-episode extended
   fixture, and synthetic 500-episode scheduler/ledger replay without live LLM
   or provider calls.
7. **Draft-path alignment:** `generateStoryBible` graph admission,
   `generateStoryBibleDeep`/extend/revise/resume/repair fingerprint propagation,
   typed relationship deltas, legacy projection derivation, dependency-index
   atomicity, and versioned SLO metadata.
8. **Benchmark protocol:** deterministic sampling windows, two-reviewer score
   records, critical dimension floors, inter-rater agreement, and adjudication.
9. **Scale and secrecy:** exact 90-second profile/assembly mapping, staged
   120–1000 plan chunks, independent fingerprint coverage, viewpoint-scoped
   secret redaction, executable cast-density limits, strict candidate-only
   activation, and crash-safe persistence replay.
10. **Anti-drift:** full-season repetition, novelty, hook, and supporting-cast
    agency health fixtures.
11. **Operational durability:** duration-plan/assembly adapter, plan chunk
    policy and idempotency, lossless memory compaction, credit reconciliation,
    revision invalidation, and redacted graph diagnostics.
12. **Runtime reuse:** strict speech/content-budget propagation, lease/
    heartbeat/watchdog recovery, graph semantic invariants, hard spend ceiling,
    and durable pause/cancel/resume lifecycle.
13. **Handoff traceability:** inherited contract pins, retry/repair/continuation
    matrix, final activation read-back, horizon extension re-plan, relationship
    alias versioning, and AC-to-section ownership manifest.

## Test-first order

- Write failing shared contract fixtures before adding service wiring.
- Add memory/ledger property and regression tests before changing projection.
- Add job checkpoint/fence tests before connecting block generation.
- Add negative closure/cast/look/world tests before enabling strict flags.
- Add router/UI tests only after server status and finding schemas stabilize.
- For relationship graph retrieval, first assert filter composition and page-size
  clamping, then assert cursor continuation/truncation, redacted counts and
  candidate-active aggregate diff; add stale redaction-policy rejection before
  browser wiring.
- Add benchmark calibration/agreement/confidence fixtures and assert
  materialized policy defaults before any paid-run admission.
- Run focused Vitest, focused TypeScript check, and `git diff --check` after
  each implementation wave.

## Required evidence labels

Every acceptance row must say `local_unit`, `local_integration`,
`browser`, `provider`, `migration`, `production`, or `deployment`. A passing
local unit test cannot be used as proof for a provider or production row.
