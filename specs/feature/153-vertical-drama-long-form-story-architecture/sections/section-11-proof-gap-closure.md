# Section 11 — Proof and gap closure

## Scope

Close the acceptance matrix with deterministic fixtures, focused integration
tests, typecheck/diff checks, and explicit external proof boundaries.

## Required fixtures

- 120×90-second quality-mode romance/mystery with early clue, reversal,
  advantage exchange, new recurring cast, and gala/rural/travel/sleep/combat
  looks.
- Fantasy/sci-fi 120-episode story with world rules, costs, high spectacle,
  and a controlled episode-120 guest.
- 150-episode extended-mode checkpoint replay.
- Relationship graph fixture with family sides, parent/sibling/spouse/in-law,
  friend/faction/rival edges, secrecy/known-by states, episode changes, and
  evidence-linked repair of a deliberately wrong edge.

## Additional alignment proof

- draft admission rejects a missing graph readiness/fingerprint before deep
  generation;
- every strict episode emits a valid graph delta and the legacy pair-state
  projection is derived from the accepted graph;
- inverse/symmetric/cycle/timeline/in-law invariants and exact reverse
  dependency repair impact are covered;
- relationship-path proof shows direct, derived, multiple, ambiguous, and no
  path cases with bounded hop/path limits, truncation, source edge IDs, family
  side, validity, evidence, and viewpoint/permission redaction;
- relationship-graph query proof covers episode/range, family/faction/type/
  status/disclosure filters, cursor/page-size bounds, partial loading, redacted
  counts, and candidate-versus-active aggregate diff without leaking secret
  edge/evidence IDs;
- benchmark sampling uses fixed, rounded, deduplicated windows, two
  independent calibrated reviewers, blind scoring, critical/non-critical
  floors, weighted agreement, bootstrap confidence reporting, and adjudication;
- benchmark result persistence preserves sampled episode IDs, per-dimension
  intervals, reviewer/adjudication artifacts, result fingerprint, confidence
  status, adjudication status, and label eligibility;
- reviewer API proof rejects stale candidate/policy/sample fingerprints,
  prevents cross-reviewer score leakage, and requires both artifacts before
  adjudication;
- focused proof covers all draft/deep/extend/revise/resume/repair wiring and
  versioned call/time/credit/context SLO metadata.
- exact 90-second/9-shot profile and production assembly mapping;
- staged 120/500/1000 plan chunks with truncation and resume recovery;
- viewpoint-scoped secret redaction, executable cast-density limits, strict
  activation-path rejection, graph edit conflict handling, and crash-safe
  persistence replay.
- relationship-redaction policy version/fingerprint changes fence stale
  retrieval, path diagnostics, and repair attempts without leaking secret edge
  IDs or evidence; an outdated expected fingerprint is rejected.
- full-season anti-drift fixture covering repeated hooks/tactics/locations,
  low novelty, and supporting-character agency distribution.
- Negative unresolved early mystery, orphan thread, unseeded guest, hard-dead
  return, uncued wardrobe, free miracle, unsupported capability, and identity
  swap fixtures, plus contradictory relationship and knowledge fixtures.
- Synthetic 500-episode scheduler/ledger replay without live LLM calls.
- Duration adapter proof covers `VerticalDramaDurationPlan` and render-segment
  sums for the strict 90-second profile.
- Plan-chunk proof covers default/max chunk size, zero overlap, predecessor
  fingerprints, retry/idempotency, and gap/overlap recovery at 120, 500, and
  1000 episodes.
- Lossless memory-compaction proof deliberately drops a required truth ID and
  verifies that replay blocks the snapshot.
- Credit proof covers accepted-work replay and unknown provider outcome
  reconciliation without duplicate charge.
- Graph diagnostic proof verifies secret-edge/evidence redaction for an
  unauthorized user and a character viewpoint.
- Speech-budget proof verifies strict profile-to-`contentBudget`/
  `dialogueQuality` propagation and rejects a flag-disabled strict run.
- Runtime reliability proof expires a lease, fences the old worker, resumes
  from the checkpoint, and rejects a late callback after cancellation.
- Retry proof distinguishes provider retries, deterministic repair rounds, and
  inherited Feature 152 provider continuations; nested calls cannot reset the
  outer repair budget or escape the SLO/credit estimate.
- Graph semantic proof covers self-edge, inverse/cardinality, parent-cycle,
  and belief-state-versus-canonical-truth negatives.
- Budget proof verifies pricing snapshot, hard ceiling, over-budget stop,
  pause/cancel, and unused-credit reconciliation.
- Control-request proof verifies typed `pause` versus `cancel` persistence,
  replay idempotency, and late-worker rejection.
- Strict episode-contract proof verifies content/speech-budget references and
  relationship-delta belief state are present and schema-valid.
- Policy-fingerprint proof changes one resolved policy at a time and verifies
  that only dependent chunks/blocks are fenced while accepted content remains
  readable.
- Benchmark finalization proof changes the result fingerprint or reviewer/
  adjudication reference after candidate review and verifies activation is
  suppressed until the exact result is reconciled.
- Traceability proof verifies every AC153 row has one primary section owner,
  proof label, evidence path, and inherited-boundary status before release.

## Proof boundary

Focused tests prove local contracts and code paths. Browser, provider,
production database migration, deployment, real model capability, and Agents
SDK active-mode proof must be run and recorded separately. Full repository
typecheck noise must not be confused with Feature 153 failures.

## Done condition

Every Feature 153 acceptance criterion is mapped to a test or explicit external
proof record; inherited Feature 152 partial boundaries remain visible until
actually proven.

The Chinese-drama-comparable target additionally requires a versioned human
sample rubric covering early/middle/late/finale relationship readability,
emotional escalation, reveal satisfaction, dialogue voice, antagonist pressure,
episode curiosity, visual variety, cultural plausibility, and ending payoff.

## UI/UX Contract

### Target User / JTBD

N/A — proof and evidence section; browser evidence requirements are owned by
Section 09.

### Surface Inventory

N/A.

### Component Map

N/A.

### State Matrix

N/A.

### Responsive Matrix

N/A.

### Accessibility Acceptance

N/A — no browser surface is changed here.

### Copy Contract

N/A.

### Browser Evidence Required

N/A — this section records whether Section 09 browser proof was performed.

## Implementation notes

Focused proof is distributed across `longFormContracts.test.ts`,
`verticalDramaLongForm.test.ts`, `verticalDramaLongFormGraph.test.ts`,
`verticalDramaSeriesMemoryProjection.test.ts`, and the relationship graph panel
test. The latest parity slice proves typed graph-delta validation, strict-delta
to legacy-state projection, evidence/provenance graph materialization, bounded
filters/path inspection, planner coverage, memory repair, checkpoint retry,
cast/world/look gates, closure, and stale fingerprints. Full AC153 benchmark,
dedicated API-family, browser, provider, and production proof remains open.
