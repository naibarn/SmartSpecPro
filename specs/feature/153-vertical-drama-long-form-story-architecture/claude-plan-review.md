# Feature 153 Deep-plan Self-review

## Round 1 — structural and adversarial review

| Category | Result | Finding |
|---|---|---|
| Structural integrity | PASS | Every planned component is assigned to a section and an existing/new path; data flow is admission → blueprint → block → memory → gates → activation |
| Completeness vs spec | PASS | Episode mode/count, long-form hierarchy, mystery closure, advantage exchange, memory, adaptive cast/guest, world/media, wardrobe cues, Agents boundary, rollout, and proof are all represented |
| Codebase compatibility | PASS | Existing story-control, quality-ledger, memory event/snapshot, character variant, visual continuity, duration, production assembly, and Feature 152 seams are explicitly reused |
| Implementability | PASS WITH FOLLOW-UP | The implementation plan gives ownership and TDD boundaries; exact normalized-table choice remains intentionally gated by migration preflight rather than left as an unresolved implementation decision |
| Internal consistency | PASS | `quality_120`, `extended_long_form`, 120 recommendation, >120 extended support, and target count compatibility are consistent across spec, plan, and sections |
| Relationship integrity | PASS | Canonical graph, family/faction/social edges, evidence/disclosure/timeline, user map, and graph-aware repair are included across sections 03/04/08/09/11 |
| Quality benchmark | PASS | Chinese-drama-comparable quality is a target measured by deterministic floor plus human/sample rubric, not an unsupported automatic claim |
| Failure/concurrency safety | PASS | Stale source, fence loss, credit/provider uncertainty, malformed memory, retcon, cast growth, guest, look, world capability, and browser disconnect are covered |
| UI contract | PASS | Section 09 has a complete UI contract; non-UI sections explicitly mark UI requirements N/A and the checker passes |
| Section index | PASS | Manifest is valid and all 11 sections are complete according to the deep-plan checker |

## Adversarial review findings closed

1. A 120 hard cap could have contradicted the existing router's 1000 limit; the
   spec now explicitly preserves technical support and uses a quality/extended
   mode recommendation.
2. The current duration profile is 60 seconds; the spec now requires an
   explicit 90-second profile/configuration decision and preserves legacy output.
3. Existing character variants could be mistaken for story-driven looks; the
   spec now requires a separate cue ledger that references, but does not
   replace, outfit variants.
4. An “unexpected guest” could become deus ex machina; the guest contract now
   requires seed/world-rule explanation, bounded knowledge, protagonist agency,
   cost, and payoff/exit.
5. Agent sessions could be mistaken for canonical memory; the plan explicitly
   keeps application-owned events/snapshots/projections authoritative.
6. Section validation initially failed because the index lacked the required
   manifest and UI contracts were absent. Both were added and rechecked.

## Remaining external proof boundaries

The spec does not claim production migration, live provider capability,
browser, deployment, or active Agents SDK proof. These remain acceptance
matrix/runbook items and must be recorded when implementation reaches them.

## Round 2 — Draft-pipeline and graph hardening

| Category | Result | Finding / closure |
|---|---|---|
| Draft entrypoint alignment | CLOSED | `create/update -> generateStoryBible -> deep/extend -> memory/repair` is now an explicit mandatory flow; deep generation requires graph readiness and fingerprint. |
| Relationship persistence | CLOSED | Graph revision, checksum/fingerprint, and reverse dependency index are mandatory; storage may start in existing JSON/events/snapshots only if the same atomic contract is exposed. |
| Legacy compatibility | CLOSED | `relationshipMap` and `VdRelationshipState` remain readers/projections; strict mode cannot treat pair prose/state as canonical graph truth. |
| Repair precision | CLOSED | Typed graph deltas plus edge-to-content dependency index define exact impact closure and block missing index coverage. |
| Runtime economics | CLOSED | Versioned SLO envelope covers calls, repair rounds, time, credits, checkpoints, context, and partial policy before paid work. |
| Human quality benchmark | CLOSED | Fixed sampling windows, two independent reviewers, critical floors, inter-rater agreement, and adjudication are now required. |

## Round 3 — Scale and runtime completeness audit

| Category | Result | Finding / required closure |
|---|---|---|
| 90-second production contract | GAP CLOSED IN SPEC | A registered exact 9-shot duration vector, speech bands, and production-assembly mapping are now mandatory; the existing 60s fallback remains legacy-only. |
| Large-season planning | GAP CLOSED IN SPEC | 120–1000 episode plan creation is staged into interval-complete resumable chunks; one oversized story-bible response is not acceptable. |
| Fingerprint integrity | GAP CLOSED IN SPEC | Independent architecture/design/graph/duration/cast/memory/coverage fingerprints are required; source fingerprint reuse cannot mask missing snapshots. |
| Information isolation | GAP CLOSED IN SPEC | Viewpoint-scoped retrieval and knowledge-leakage blocking are explicit. |
| Cast scalability | GAP CLOSED IN SPEC | Active cast, introductions, guests, dialogue owners, meaningful actions, and visual load are executable versioned budgets. |
| Activation/persistence safety | GAP CLOSED IN SPEC | Strict runs are candidate-only, graph edit APIs are defined, and event/projection/index/checkpoint writes require idempotent transaction or recoverable outbox semantics. |
| Long-form engagement health | GAP CLOSED IN SPEC | Full-season repetition, hook novelty, escalation, and supporting-character agency are now explicit repair findings beyond local schema validity. |

## Round 4 — Operational completeness and implementation handoff

| Category | Result | Finding / required closure |
|---|---|---|
| Benchmark reproducibility | GAP CLOSED IN SPEC | Baseline floors, calibrated blind reviewers, weighted agreement, and adjudication are now materialized in the run contract. |
| Duration/assembly mapping | GAP CLOSED IN SPEC | The strict 90-second profile must map to the existing `VerticalDramaDurationPlan` and logical/render assembly fields with no mixed-runtime path. |
| Plan scale/replay | GAP CLOSED IN SPEC | Default/max chunk sizes, zero overlap, predecessor fingerprints, bounded retries, and deterministic idempotency are explicit. |
| Memory durability | GAP CLOSED IN SPEC | Compaction is a lossless, replay-verified cache; required truth IDs and revision invalidation are explicit. |
| Credit safety | GAP CLOSED IN SPEC | Work-unit reservation, unknown-outcome reconciliation, and no duplicate accepted-work charges are required. |
| Policy materialization | GAP CLOSED IN SPEC | Anti-drift and cast-density defaults must be resolved before paid admission, not left as qualitative configuration. |
| Diagnostic secrecy | GAP CLOSED IN SPEC | Graph/memory/candidate diagnostics apply viewpoint and permission redaction consistently with generation. |

## Round 5 — Runtime seam and stuck-run audit

| Category | Result | Finding / required closure |
|---|---|---|
| Speech/content budget | GAP CLOSED IN SPEC | Strict mode now reuses canonical `contentBudget`/`dialogueQuality` helpers and cannot disable the budget through a legacy flag. |
| Stuck-run recovery | GAP CLOSED IN SPEC | Existing lease, heartbeat, fence, watchdog, checkpoint, cancellation, and resume seams are explicitly reused; expired work cannot remain active forever. |
| Relationship semantics | GAP CLOSED IN SPEC | Self-edge, inverse/cardinality, parent-cycle, and belief-state invariants are explicit. |
| Cost ceiling | GAP CLOSED IN SPEC | Model/pricing snapshot, hard spend ceiling, and deterministic over-budget stop are required. |
| User lifecycle | GAP CLOSED IN SPEC | Pause/cancel/resume, late callback rejection, and unused-credit reconciliation are defined. |
| Storage decision | GAP CLOSED IN SPEC | Phase A must expose atomic repository/index semantics and escalate to normalized storage when the contract cannot be met. |
| Control lifecycle | GAP CLOSED IN SPEC | Pause is now a typed durable request distinct from cancellation, with checkpoint, reconciliation, and late-worker rules. |
| Episode contract completeness | GAP CLOSED IN SPEC | Strict episode contracts carry canonical speech/content-budget references and graph deltas carry belief state separately. |
| Policy fingerprint coverage | GAP CLOSED IN SPEC | Speech, benchmark, anti-drift, plan-chunk, execution, and pricing policies now have independent immutable fingerprints and stale-run rules. |

## Round 6 — Multi-engineer handoff and finalization audit

| Category | Result | Finding / required closure |
|---|---|---|
| Inherited contract pins | GAP CLOSED IN SPEC | Feature 151/152, provider/safety, locale, and vocabulary versions are pinned in the blueprint/run contract. |
| Retry behavior | GAP CLOSED IN SPEC | Typed retry/error classes and deterministic idempotency composition are explicit. |
| Activation integrity | GAP CLOSED IN SPEC | Durable post-write read-back suppresses false success. |
| Horizon extension | GAP CLOSED IN SPEC | Extension creates a new candidate and re-plans terminal closure and affected arc exits. |
| Status vocabulary | GAP CLOSED IN SPEC | `awaiting_reconciliation` is the only public reconciliation status; internal phases cannot become undocumented status values. |
| Acceptance traceability | GAP CLOSED IN SPEC | AC153-01..88 have exactly one primary section owner and an explicit proof label. |

## Round 7 — Final handoff consistency audit

| Category | Result | Finding / closure |
|---|---|---|
| Runtime status vocabulary | GAP CLOSED IN SPEC | Removed the undocumented `reconciling` status and aligned crash recovery, activation read-back, failure modes, and Section 08 to the existing `awaiting_reconciliation` contract. |
| AC ownership uniqueness | GAP CLOSED IN SPEC | Repartitioned the traceability manifest so every AC153-01..88 appears exactly once as a primary owner while supporting evidence remains allowed. |

## Round 8 — Runtime contract materialization audit

| Category | Result | Finding / closure |
|---|---|---|
| Retry/SLO materialization | GAP CLOSED IN SPEC | Added retry/SLO version and fingerprint fields plus strict defaults: schema correction 1, transient provider 2, paid plan-chunk retries 2, and repair rounds per work unit 3. Missing or unversioned values block paid admission. |
| Status-plane mapping | GAP CLOSED IN SPEC | Distinguished the existing four-state transport job wrapper from the canonical Feature 152 story-generation run status; transport success cannot imply activation success. |
| Typed run extension | GAP CLOSED IN SPEC | Retry/SLO fields are carried in a typed `longForm` run-contract member rather than an unvalidated generic constraints map. |

## Round 9 — Quality benchmark and nested-budget audit

| Category | Result | Finding / closure |
|---|---|---|
| Retry/repair/continuation semantics | GAP CLOSED IN SPEC | Separated provider retries, outer deterministic repair rounds, and inherited Feature 152 continuation calls; nested calls count toward SLO/credits and cannot reset the outer budget. |
| Benchmark reproducibility | GAP CLOSED IN SPEC | Added rubric/calibration versions, deterministic deduplicated sampling, minimum sample rule, weighted agreement statistic, and bootstrap confidence policy. |

## Round 10 — Benchmark result and sampling contract audit

| Category | Result | Finding / closure |
|---|---|---|
| Benchmark result persistence | GAP CLOSED IN SPEC | Added a typed result with sampled episode IDs, per-dimension confidence intervals, agreement/adjudication state, confidence status, and label eligibility. |
| Canonical sample selection | GAP CLOSED IN SPEC | Added a deterministic round-half-up sampling formula with clamp, deduplication, sorting, and an explicit insufficient-confidence outcome. |

## Round 11 — Benchmark finalization and evidence lineage audit

| Category | Result | Finding / closure |
|---|---|---|
| Reviewer evidence lineage | GAP CLOSED IN SPEC | Benchmark results now persist reviewer artifact IDs, optional adjudication artifact, bootstrap seed/resample policy, final dimension scores, and a result fingerprint. |
| Activation binding | GAP CLOSED IN SPEC | Final activation read-back verifies the exact benchmark result reference and suppresses success when the result or evidence lineage is stale/missing. |

## Round 12 — Reviewer ingestion and typed activation reference audit

| Category | Result | Finding / closure |
|---|---|---|
| Reviewer ingestion boundary | GAP CLOSED IN SPEC | Added create/submit/get benchmark review APIs plus adjudication API with immutable tenant-scoped artifacts and blind-session isolation. |
| Typed activation reference | GAP CLOSED IN SPEC | Added optional-during-review, mandatory-before-activation benchmark finalization reference to the typed `longForm` run extension. |

## Round 13 — Explainable relationship-map audit

| Category | Result | Finding / closure |
|---|---|---|
| Relationship path explanation | GAP CLOSED IN SPEC | Added canonical direct/derived/multiple/ambiguous/no-path result with source edge IDs, family side, validity, disclosure, and evidence. |
| User graph inspection | GAP CLOSED IN SPEC | Added pair-path API/UI behavior and a proof that derived labels such as “น้องเมีย” cannot appear as unexplained authored edges. |

## Round 14 — Bounded multi-path and relationship redaction audit

| Category | Result | Finding / closure |
|---|---|---|
| Path result completeness | GAP CLOSED IN SPEC | Relationship-path results now return a bounded candidate list rather than a singular path and explicitly signal truncation. |
| Query safety and secrecy | GAP CLOSED IN SPEC | `maxHops`/`maxPaths`, tenant/permission/viewpoint redaction, and non-leaking secret edge behavior are explicit in the contract, UI, and proof. |

## Round 15 — Redaction-policy lineage audit

| Category | Result | Finding / closure |
|---|---|---|
| Redaction policy replay safety | GAP CLOSED IN SPEC | Added relationship-redaction policy version/fingerprint to blueprint/run/path-result lineage and required stale-policy fencing for retrieval, diagnostics, and repair. |

## Round 16 — User-visible relationship graph retrieval audit

| Category | Result | Finding / closure |
|---|---|---|
| Graph retrieval API | GAP CLOSED IN SPEC | Added a bounded `getCharacterRelationshipGraph` query/view contract with timeline and family/faction/type/status/disclosure filters, cursor/page-size pagination, redacted counts, and candidate-active aggregate diff. |
| UI/proof alignment | GAP CLOSED IN SPEC | Section 09 and Section 11 now require the graph operation, partial loading, and non-leaking diff proof rather than only pair-path inspection. |
