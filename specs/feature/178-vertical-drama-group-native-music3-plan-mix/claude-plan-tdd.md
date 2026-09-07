# TDD Plan — Feature 178 Group-Native MiniMax Music 3 Plan/Mix

This document defines test stubs to write before implementation. Keep tests
focused and avoid paid provider/GPU generation in ordinary test runs.

## 1. Outcome and implementation strategy

- Test that the group-native path can be selected without changing an existing episode-scoped request.
- Test that a group request cannot silently route to the first member episode.

## 2. Scope boundaries and invariants

- Contract tests reject mixed `episodeId`/`productionGroupId` scope.
- Legacy episode payloads remain valid while group payloads require versioned
  `production_episode` scope with no `episodeId`.
- Composition edit-map is required for initial ASR; speech edit-map is produced
  by ASR and required by generation/mix.
- Admission tests reject URL-only, missing-checksum and stale-revision media refs.
- Tests prove prior published mix revisions remain unchanged after a new mix.

## 3. Codebase decisions and ownership

- Import/export tests prove Web and Worker use the same versioned group payload union.
- Worker tests prove model/runtime failures are terminal and never use a fallback provider.

## 4. Data model and migration plan

- Schema tests cover group ownership, foreign keys, uniqueness, revision indexes and plan-revision relationships.
- Migration tests verify additive ordering, ledger registration and deterministic backfill only for complete managed artifacts.
- Backfill tests prove ambiguous member mappings and missing checksums remain blocked.
- Pipeline-run stage/upstream job identities recover without duplicate jobs or
  paid attempts.

## 5. Shared contract changes

- Valid episode and production-group envelopes parse.
- Missing IDs, both IDs, wrong scope fields, invalid hashes, missing group revision and unknown version fields fail.
- Idempotency key fixtures change when group revision, plan hash, artifact checksum or selected take changes.

## 6. Final-cut artifact publication

- Assembly completion persists storage reference, checksum, artifact revision, duration and membership snapshot.
- Old URL-only manifests produce `final_cut_artifact_required` and cannot queue audio work.
- Reassembly increments group revision when membership or final artifact identity changes.

## 7. Semantic group plan lifecycle

- Source snapshot tests preserve ordered member IDs and member plan hashes as evidence only.
- Contradictory member sources and timing uncertainty remain visible rather than being silently merged.
- State transition tests cover queued/running/review/approved/blocked/failed/cancelled and stale compare-and-swap failures.
- Approval cannot queue generation without current artifact, current source hash and independent rights approval.
- Duplicate approval/queue requests return existing idempotent records.
- Cross-Sub-Episode joins require skill reconciliation; member cues are not
  silently inherited.

## 8. Worker pipeline and artifact publication

- Group ASR emits real token timing and edit-map artifact metadata with checksum.
- Missing media, checksum mismatch, unavailable ASR and malformed output map to deterministic terminal/blocking reasons.
- MiniMax tests require exact model identity, revision, runtime/GPU metadata and published take artifact.
- Provider failure, model mismatch or GPU absence never becomes a successful take.
- Partial cue failure remains per-cue and cannot publish a complete mix unless
  the approved plan marks the missing cue optional/silent.
- Score-mix tests cover input ordering, deterministic ducking, FFmpeg probe and post-encode QC failure mapping.
- Existing baked/unknown music source blocks with `NATIVE_MUSIC_CONFLICT` until
  explicit replacement/ducking approval.
- Superseded callbacks cannot replace a current published projection.

## 9. API/router surface

- Router tests enforce tenant/user ownership and group revision on every group procedure.
- Responses contain bounded display projections and actionable blocked/terminal reasons.
- Episode procedures continue to reject group-only inputs and vice versa.

## 10. Web UI implementation

- Readiness heading renders when `groups.length === 0`.
- The empty state disables mutation and explains that a completed final cut is required.
- With `verticalDramaGroupNativeMusic3=false`, the readiness heading remains
  visible while group mutations and Worker admission remain disabled.
- A valid group renders the dedicated group panel; member panels appear only under an explicit source disclosure.
- Stale, blocked, loading, generating, published, QC-failed and read-only states render correct actions and labels.
- Group query invalidates after assembly publication without a full reload.
- Batch readiness avoids one query per Production Episode card; bounded polling
  stops at terminal state.

## 11. UI/UX contract

- Component tests cover the full state matrix and accessible names.
- Browser evidence covers 390x844, 768x1024, 1440x900, 360x800, 1024x768 and 1280x800.
- Keyboard/focus, reduced motion, `aria-live`, contrast and no-horizontal-overflow checks are recorded.
- The copy tests distinguish `Production EP` from `ตอนย่อย` and preserve server failure reasons.

## 12. Test-driven implementation matrix

- Keep the tests grouped by Web shared/service/router, Worker TypeScript, Worker Rust and UI component/browser surfaces.
- Prefer existing Vitest/Rust test helpers and single-worker focused commands under the RAM constraint.

## 13. Execution waves and dependencies

- Each wave must have a failing test or contract fixture before implementation and a focused passing command after implementation.
- Integration tests use no-credit fixtures; real GPU/provider proof is a separately gated runtime test.

## 14. Review checklist before implementation handoff

- Final checklist test confirms every new group artifact and state has an owner, failure reason, migration path and verification command.
