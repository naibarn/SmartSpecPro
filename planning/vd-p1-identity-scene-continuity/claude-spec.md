# Specification synthesis — VD visual consistency P1

Date: 2026-08-01
Sources: Features 137 v1.3.0, 138 v1.3.0, 139 v1.1.0, current-worktree
reconciliation and the retained 2026-07-23 interview.

## Goal

Keep a Vertical Drama series coherent across shots by deciding and reusing three
classes of facts:

- Feature 139: the series visual register;
- Feature 137: identity-safe movement derived from the observed start frame;
- Feature 138: concrete per-scene lighting/set continuity.

## Delivery order

Foundation → 139 → 137 → 138 P1a → joint P1 verification → 138 P1b canary.

The historical `basePlan` prerequisite is obsolete and becomes baseline recapture.
Neighbor anchoring is not part of the P1a release boundary.

## Feature 139 requirements

- One effective identity remains in `bible.presetVisualIdentity`.
- `bible.lookLockControl` records reversible mode, inherited source/governance,
  revision and timestamp.
- One source-aware resolver governs every generation reader and prevents flag
  leakage between legacy preset mix and look lock.
- Five bounded code-owned genre entries plus manual/inherited/none modes.
- Owner-scoped, row-locked `setSeriesLookLock` with expected revision.
- Authoring LLMs receive compact register facts; raw fragments are applied exactly
  once by one final image-prompt assembler across every image-producing path.
- Create/settings/storyboard UI follows Astryx and full UI/UX state, responsive,
  accessibility and browser-evidence contracts.

## Feature 137 requirements

- P1 only: categorical per-shot/sub-shot motion profile, deterministic risk floor,
  face observability, skill motion contracts, judge dimension and drafting guidance.
- Bulk receives conditional prose but no output-schema field.
- Explicit runner activation fact for every new skill clause.
- Persist `motionContractStatus`; missing/invalid never means low-risk and adds no
  retry beyond the existing bounded loop.
- Zero new LLM calls/renders; selected-model budgets and bounded token overhead.
- P2/P3 video-safe frames, angle packs and post-render/clip QC are deferred.

## Feature 138 requirements

- P1a authors/stores one state per eligible multi-shot scene using stable membership
  hash, revision, idempotency and fresh-row JSONB merge.
- The planner consumes Feature 139 look; concrete scene facts outrank broad style.
- Mismatched state is stale and never injected.
- Required multi-shot planning failure stops before paid render; explicit single
  shot may continue unlocked with a bounded warning.
- Owner-scoped plan/update mutations use expected revision.
- Feature 140 owns prop persistence.
- P1b has a separate child flag, same-id prompt/render provenance, pre-render asset
  revalidation and within-scene-only serialization.

## Cross-feature constraints

- Precedence: policy/safety → identity/required facts → look → scene → shot → motion.
- All relevant flags off preserves runtime prompts, payloads, reads, scheduling and
  persisted shapes against the refreshed baseline.
- No migrations, automatic paid regeneration, model switching or prompt truncation.
- New audit events contain bounded ids/enums/timing/outcomes, not prompts or signed
  URLs.
- GA evidence is fixed offline/manual and never depends on deferred QC.

## Verification

- Recaptured fail-set identity and focused typecheck delta.
- Pure resolver/flag truth tables plus single-flag, dependency, all-off and all-on
  integration coverage.
- Real-file skill activation/dormancy plus opt-in real-LLM gates.
- Tenant/owner/concurrency tests for new mutations.
- Astryx component tests and browser evidence at 390x844, 768x1024, 1440x900.
- Internal rollout order 139 → 137 → 138 P1a, followed separately by P1b canary.
