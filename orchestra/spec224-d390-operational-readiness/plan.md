# Spec 224 D3.90 — Operational Readiness

## Task
Make the authorized Spec 224 path practically testable against an isolated copy of the current application schema, preserve the shared database, and identify/close implementation gaps for direct use by supported harnesses.

## Classification
- Scope: large
- Risk: high (database, tenant authorization, runner admission)
- Affected domains: PostgreSQL, Node control plane, Runner, external harness adapters, source/runtime admission
- Estimated file count: discovery-dependent
- Chosen route: orchestra resume with bounded sequential implementation and focused verification
- Bug route: false
- Classification notes: The user authorizes development and migration work, but the shared persistent database must remain unchanged; protected execution stays fail-closed unless its actual trust gate is satisfied.

## Ownership and safety
- Worktree: `/home/dev/projects/SmartSpecPro-spec224-d385`, branch `codex/spec224-d385-runtime-proof`.
- Preserve all existing dirty files and prior bind/release implementation.
- Shared application database is backup-only/read-only. Any replay or integration test uses a newly named database with no copied user rows and a non-superuser runtime role.
- Reuse `worker_jobs`, outbox, Spec 224 DevelopmentRun, existing Runner Gateway, and existing provider adapters. No second queue, lifecycle authority, approval system, or retired workflow/Agency/OpenSandbox code.
- No production deployment, paid provider, shared-worktree edits, Cloudflare migration edits, or TypeScript typecheck.

## Immediate test matrix
| Requirement | RED / gap evidence | GREEN check | Proof boundary |
|---|---|---|---|
| Preserve existing data while testing current schema | Shared DB is persistent; migration journal already populated | Full backup hash + restore-list validation; schema-only restore into campaign-owned DB; exact source DB table/data fingerprints unchanged | Clone schema has no user rows; no production certification |
| Spec 224 DB contracts work on current schema | Current D385 code has not yet been exercised against the current schema snapshot | Focused PostgreSQL Spec 224 integration suites on the clone using a non-superuser role | Only selected integration paths |
| Harness dispatch is available through canonical authority | Source currently accepts four provider names but Runner adapter contract may support fewer | Provider/adapter conformance tests and source trace from authorized API to worker/outbox/Runner | No live paid provider or positive protected execution absent admission |
| Required new schema is additive and safe | No migration will be applied to the shared DB | Fresh/candidate migration replay only in campaign DB after exact SQL review | Does not certify historical upgrade or production |

## Sequencing
1. Freeze current worktree and migration/database identities; retain verified backup.
2. Build a schema-only isolated copy of current application DB, then grant least-privilege test access.
3. Run focused DB and contract checks; repair only confirmed in-scope defects.
4. Implement only concrete harness integration gaps that preserve canonical authorities and pass the actual admission boundary.
5. Reverify, update checkpoint, and report which operational gates still require external trust configuration.
