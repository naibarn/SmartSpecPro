# Feature 157 implementation audit rounds

This is the current audit ledger for the implementation-vs-plan review. It
records repository evidence only; browser, provider, deployment, migration
application, and production-canary proof are not inferred from local tests.

## Round 1 — authority and gap inventory

Status: completed.

- Confirmed the canonical five domain flags and the `0245` additive migration.
- Compared all ten section plans with the checkout and found real code gaps:
  Python trusted output registry, story/prompt/media coordinator, API/client
  copy, release control, observability, production matrix, and release gate.
- Confirmed the existing Draft QC repair failure could occur when Redis lost a
  result despite a durable current result; durable snapshot recovery is now
  used before the current-result precondition.

## Round 2 — durable attempts, billing, reconciliation, and schema

Status: completed for local code/tests; external database gate remains pending.

- Verified migration `0245_vertical_drama_assurance_attempts_reconciliation.sql`
  is additive and ordered after the current `0244` journal entry.
- Verified the durable repository, lease/fence, CAS finalization, physical-call
  ledger, unknown-usage classification, and duplicate-safe credit settlement
  focused suites pass.
- Migration checker still reports unapplied migrations in this checkout. No
  migration was applied because that requires a controlled deployment window,
  backup, and rollback proof.

## Round 3 — Python runtime and story/prompt/media continuity

Status: completed for local code/tests.

- Added the closed Python registry for all six versioned Vertical Drama output
  schema refs, task/schema mismatch rejection, identity/reference validation,
  SDK `output_type`, output guardrail, bounded `max_turns`, wall-clock timeout,
  and health schema advertisement.
- Added the server coordinator for current context, authoritative predecessors,
  stage fingerprints, immutable lineage, prompt/reference/video continuity,
  B-roll binding continuity, and stage wrapper seams.
- Node and Python focused tests cover valid output, unknown schema, identity
  mismatch, invented references, stale predecessor, and changed stage input.

## Round 4 — API, UX, rollout, and observability

Status: completed for local code/tests.

- Added stable browser-safe assurance copy without changing existing route
  fields or forcing a new screen.
- Added canonical release-control evaluation with kill-switch/rollback
  precedence and exact release/cohort/dependency evidence checks.
- Added bounded Feature 157 metrics and connected them to the existing
  `/metrics` output without exposing tenant IDs, URLs, prompts, or secrets.
- Added registry-derived 13-profile and visual-source coverage fixtures.

## Round 5 — integration and release gate

Status: completed as a fail-closed audit; production activation is blocked.

- Focused TypeScript suites and Python runtime suites pass after the final
  B-roll parser/type boundary fix.
- `git diff --check` passes.
- Full TypeScript check still reports pre-existing baseline errors in unrelated
  UI/media/runtime files; changed Feature 157 files are not among the remaining
  baseline errors after the B-roll boundary fix.
- The release-gate script intentionally returns `blocked` while evidence is
  `pending`. It does not fabricate browser, provider, deployment, migration,
  canary, or rollback evidence.

## Remaining release blockers (not silently marked complete)

1. Apply and verify migration `0245` in staging with backup/rollback proof. A
   guarded migration-only workflow was dispatched as run `32651696408`, but it
   stopped before connecting because the repository has no
   `NEON_STAGING_DB_URL` Actions secret. No staging statement ran and the
   `staging_migration` evidence gate is recorded as `blocked`, not `pass`.
2. Run authenticated browser flow for existing creator UX, including Draft QC
   repair and reconnect/retry states.
3. Run Node↔Python deployed compatibility and real provider unknown-outcome
   reconciliation proof.
4. Run the staging fault/restart/canary/rollback matrix and record redacted
   evidence in `implementation/release-evidence/manifest.json`.
5. Wire each existing story, start-frame/reference, video-prompt, B-roll,
   assembly, post-QC, and season-QC production route to the coordinator seam;
   the coordinator is present and tested, but local route-by-route activation is
   deliberately not claimed until its owner-scoped adapters and existing UX
   contracts are tested.

## Round 6 — durable route seam and staging evidence drill

Status: completed for the safe local/deployment boundary; external staging
activation remains blocked by missing credentials.

- Added `verticalDramaRouteAssurance.ts` with an explicit route/task registry,
  authoritative context construction, durable admission, lease/fence,
  coordinator execution, and finalization against a persisted domain artifact.
- Added fail-closed readiness checks to the coordinator: paid/export boundaries
  cannot proceed from draft context or an unverified assurance result.
- Wired the central episode pipeline's start-frame plan, video motion prompt,
  and episode assembly artifacts through the durable route seam when the active
  prompt/media flag is enabled. Flag-off behavior remains unchanged.
- The direct story, per-shot prompt/image/video, B-roll binding, post-QC, and
  season-QC routes still require their own atomic domain-persist adapters; no
  synthetic artifact IDs or post-commit false-success envelopes were added.
- Added a guarded staging restart/canary/rollback drill workflow during an
  earlier GCP-target assumption and dispatched it as run `32653299396`. It
  stopped before mutation because the required GCP Actions secrets are absent;
  no GCP API, restart, traffic shift, canary deployment, or rollback mutation
  occurred. This run is retained as historical evidence only and is not a
  beta deployment proof.

## Round 7 — Debian home-server beta rollout boundary

Status: local rollout tooling prepared; host execution remains pending.

- Replaced the active rollout evidence target in the release manifest with the
  Debian home-server runbook and local evidence script.
- Defined the single-host canary honestly as systemd restart plus five repeated
  health/readiness/application smoke checks; no fictional traffic split is used.
- Added explicit mutation confirmation for restart and rollback. Rollback
  requires an operator-supplied immutable-release activation command, so the
  script cannot guess a git checkout or overwrite a dirty worktree.
- No Home server restart, migration, canary, or rollback was executed from this
  checkout. These gates remain pending until evidence is captured on the beta
  host.
