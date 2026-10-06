# Repository Reconciliation Update — SPEC-161 Resolved

## Authority decision

Selected disposition: **C — `RECONSTRUCT_CANONICAL_FROM_EVIDENCE`**.

The canonical document `specs/feature/161-vertical-drama-async-skill-jobs/spec.md` is restored from the complete approved design `docs/portable-skill-pack/specs/2026-08-25-vertical-drama-async-skill-jobs-design.md`. The design is unchanged and remains at its original path. Source SHA-256: `3ab5930dc85d84d02b8de32f3e17d69ce09993241c99d5474fb25754a07532ce`; introduction commit: `13a313d474df163d6741ccf10e50df8aac2e30f0`. Reconstructed canonical spec SHA-256: `b3a3049809ebb3970a608e1e3b543f62cc687896c2c16825f0cb5ead25766c5f`.

Across all available refs and Git objects examined, no historical normative SPEC-161 `spec.md` was found. `claude-spec.md` calls itself synthesized from the approved design and is retained unchanged as supporting evidence. No renumber, alias, successor or supersession evidence exists. The source and the six downstream consumers establish independent canonical authority; this is reconstruction, not a claim about prior file history.

## Downstream references and relationship evidence

All six requested downstream Specs were checked and now resolve to the unique canonical ID 161:

| Spec | Classification | Evidence |
|---|---|---|
| 166 | Related architecture/billing context | `specs/feature/166-credit-context-polymorphic-lineage/spec.md:13-15` |
| 168 | Normative dependency | `specs/feature/168-vertical-drama-special-tie-in-footage-web/spec.md:6` |
| 173 | Normative dependency | `specs/feature/173-vertical-drama-enhanced-video-prompt-variants/spec.md:11-15` |
| 175 | Normative dependency | `specs/feature/175-vertical-drama-native-cinematic-audio/spec.md:11` |
| 176 | Builds on / reuses durable job pattern | `specs/feature/176-drama-series-emotion-timeline-web/spec.md:7,105,130,215` |
| 185 | Reuses durable job and billing pattern | `specs/feature/185-skill-framework-storyboard-project/spec.md:70` |

No downstream text needed repair: each reference accurately points to the recovered contract. The exact roles and source lines are recorded in `specs/feature/161-vertical-drama-async-skill-jobs/handoff/evidence/authority-resolution-2026-10-06.md` and SPEC-161's canonical Handoff `relevance_assessment.active_references`. SPEC-161 has no explicit outgoing numbered-Spec dependency or successor claim. The generated predecessor/successor candidate graph remains at 302 edges with zero dangling edges; it is a distinct projection from the semantic dependency references above.

## Inventory and reconciliation effect

| Measure | Before resolution | After resolution |
|---|---:|---:|
| Dynamic inventory records | 463 | 463 |
| Canonical Specs | 305 | 306 |
| Reconciliation-review records | 331 | 329 |
| Records with deterministic classification | 463 | 463 |
| Unresolved authority records | 1 | 0 |
| Duplicate canonical authorities | 0 | 0 |
| Valid renumber aliases | 6 | 6 |
| Relationship candidate edges | 302 | 302 |

The canonical count increases by one because the existing configured-root record now has its approved, provenance-marked `spec.md`; no inventory record is added or removed. The review count drops by two: the malformed SPEC-161 record is no longer unresolved, and the global reconciliation Handoff is no longer queued for reconciliation after its continuation changes to the final migration gate. The existing 307→305 count bridge, two historical dispositions and six aliases are unchanged.

## Verification

Evidence is captured in the isolated canonical worktree based on `origin/main` `4433949a6416a056478b65598a7f16a51e8654ca`; integration SHA is recorded after promotion.

- `python3 -m tools.spec_handoff index --check`: PASS; 463 records, 306 canonical Specs, no generated-view drift.
- `python3 -m tools.spec_handoff validate --all`: PASS; 463 discovered/indexed, no missing or invalid Handoffs, complete walk.
- `python3 -m tools.spec_handoff classifications --check`: PASS; 463 rows, zero unresolved authority.
- `python3 -B -m unittest discover -s tools/spec_handoff/tests -v`: PASS, 81 tests.
- `bash skills/audit-skills.sh`: PASS.
- SPEC-161 unique canonical identity and all six downstream link targets: PASS; no dangling relationship candidates.
- `git diff --check`: PASS.

## Closure boundary

`REPOSITORY_WIDE_SPEC_RECONCILIATION_COMPLETE = TRUE` once this evidence and its generated projections are integrated and rechecked on the resulting canonical SHA. Close `REVIEW_REMAINING_RECONCILIATION_RECORDS` then. Set `NEXT_WORKUNIT = FINAL_CANONICAL_SPEC_HANDOFF_MIGRATION_GATE`. Do **not** set `CANONICAL_SPEC_HANDOFF_MIGRATION_COMPLETE = TRUE`; runtime implementation equivalence, acceptance and the final migration gate remain outside this authority-resolution workunit.
