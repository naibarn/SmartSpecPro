# Autonomous Approval & Execution Orchestration — Handoff

Date: 2026-10-28 (Asia/Bangkok)
Status: `INTERNAL_POLICY_CORRECTION_READY`; `PRODUCTION_0415_BLOCKED_EXTERNAL_CREDENTIAL`

## Scope and audit findings

| Area | Finding | Classification |
|---|---|---|
| Approval / mission authority | SPEC-224 already defines durable goal/run authorization, scope binding, budget, expiry, revocation and auto-resume; Feature 195 owns the only durable `worker_jobs`/events/outbox execution truth. Reuse these contracts; do not add an authority or ledger. | Existing authorized path |
| Internal policy | `security-review` agent incorrectly instructed that HIGH findings require user approval and that missing specialist data always escalates. This contradicted the active Security Review Protocol, which requires in-scope remediation/containment and human risk authority only for unavoidable residual risk. | Removable internal approval loop |
| GitHub production path | Live `production` Environment has no protection rules or deployment branch policy. Repository variables and Environment secrets list are empty. `NEON_PROD_DB_URL` is absent. | Missing Production configuration/credential |
| Debian / database path | Previously inspected runtime exposes only read-only Production diagnostics; its live fingerprint does not match the pinned 0415 target and it lacks schema-write authority. Do not use it for migration. No existing Admin/Runner schema-migration executor was found. | Missing authorized writer path |
| Cloudflare | Existing Cloudflare executor/mandate controls Cloudflare resources and deployment operations; it does not execute SmartAIHub PostgreSQL schema migrations. | External path is out of scope for 0415 |
| Platform boundary | No owner-issued Production database writer credential is present in an approved secret authority. A local Admin identity or mission approval cannot create that credential or provider permission. | Real owner/provider authority boundary |

## Changes in this checkpoint

- Added an additive SPEC-224 amendment for mission-scoped grants, authorization reuse across retries/restarts, execution-time revalidation, existing secret-authority resolution, authorized executor recovery, audit lineage, and exact stop/recovery conditions.
- Corrected `skills/sub-agents/agents/security-review.md`: CONDITIONAL findings now initiate remediation or containment; missing specialist data is recovered via existing orchestration or isolated to the affected path. No auto-approval of residual security risk was introduced.
- The installed sub-agent skill copy was older than the canonical source before this change. `bash skills/publish-to-installed-skills.sh` and `bash skills/verify-installed-skills-sync.sh` both passed after the update.

## Migration 0415 acceptance case

| Environment | Status | Evidence / limitation |
|---|---|---|
| DEV | `ALREADY_APPLIED` | Prior migration receipt and schema verification are recorded in `orchestra/tasks/cloudflare-delegated-staging-20261017/origin-completion/production-cutover/implementation/evidence/migration-0415-environment-results.md`. This task did not reapply 0415. DEV authenticated RPC/UI acceptance remains unverified. |
| PRODUCTION | `BLOCKED_EXTERNAL_CREDENTIAL` | GitHub production Environment has no secrets or variables; direct Debian inspection has no matching target writer. Prior read-only production evidence reports 0415 absent, table `canonical_project_workspace_bindings` absent, migration ledger through 0414, and SQLSTATE `42P01`; target fingerprint is `sha256:67a8ab64ed2fab25355103df7e256b941bd3c2140ac62b7c797e106054ef5f83`. No Production write was performed. |

No Production RPC, Runner, Workspace Binding, or UI E2E claim is made. The live authenticated RPC/UI checks remain pending until the authorized migration is executed and an authenticated Production session is available.

## Required recovery

The Production database owner/credential issuer must provide a least-privilege writer credential for the exact pinned Production target through an already-approved Production secret authority (for example, configure the existing `NEON_PROD_DB_URL` secret if the existing GitHub migration workflow is selected). Do not send the credential in chat or use DEV/read-only credentials. Once present, continue the already approved exact-0415 mission: verify fresh fingerprint, history, checksum, dependency and idempotency; execute only 0415 through the authorized runner; verify receipt/schema; then run the three authenticated RPCs and live Runner/Workspace/Project Binding UI checks.

## Verification and integration

- Repository baseline during this checkpoint: local `main` and `origin/main` both `ebebf4a5d74edfb00d7834bc6f964c2777e90a3f`.
- Files from other work remain dirty and are excluded from this change, including `apps/web/server/routers/__tests__/verticalDramaCharacters.manualVariantTwinCrud.test.ts`, local skillpack/test outputs, and existing task lock files.
- Focused policy text check and `git diff --check` passed. Commit and remote SHA reconciliation remain to be recorded before reporting this checkpoint integrated.
- No local `npm run typecheck` was run.
