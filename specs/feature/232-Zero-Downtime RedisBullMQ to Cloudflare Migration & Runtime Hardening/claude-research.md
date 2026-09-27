# Deep Plan Research — Spec 232 G2 Auth / Revocation Recovery

## Research decision

- **Codebase research: required.** This is an existing SmartSpecPro repository and the plan must separate current recovery code from the future Cloudflare G2 design.
- **Research method:** targeted `rg` and bounded source reads. SocratiCode was not used because repository `AGENTS.md` retires and prohibits that system.
- **Web research: required.** Spec 232 names Cloudflare Durable Objects, PostgreSQL, and production backup/restore. Consulted current official Cloudflare and PostgreSQL documentation on 2026-09-27.
- **Testing research: required.** Existing Vitest unit/integration coverage and guarded migration scripts establish the local contract and recovery proof surfaces. No tests or production writes were run for this planning task.

## Scope boundary and authorities

- Spec 232 §5 owns G2 Auth/revocation migration semantics. Spec 245 coordinates full-system waves and already has a deep-plan package (`claude-research.md`, `claude-interview.md`, `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, and four sections). The Spec 245 package is not to be overwritten; this Spec 232 plan should provide a G2 slice and a bounded reconciliation delta for Spec 245.
- The immediate production issue is recovery from a partial Redis → PostgreSQL authorization-state transition. It is distinct from implementing Cloudflare Durable Object enforcement. Do not make service unmask/start, import, deploy, secret changes, or external state changes part of the local plan authoring action.
- Feature 186/195 and PostgreSQL remain canonical job/business authorities where applicable. Spec 232's G2 row identifies PostgreSQL as fresh authorization authority and DO as coordination; KV is non-authoritative.
- The current operational runbook (`ops/feature-232/g1-g2-production-readiness-runbook.md`) reports G1/G2 blocked and explicitly requires backup restore proof, all-writer fencing, fresh scans/reconciliation, keyring parity, smoke tests, and authorized maintenance exit before services are reopened.

## Current code evidence

- `apps/web/server/_core/revocation.ts` hashes raw JTIs before storing them and uses PostgreSQL as the runtime authority. `JTI_REDIS_ROLLBACK_MIRROR=enabled` is a temporary compatibility bridge: writes to Redis before PostgreSQL and checks PostgreSQL before Redis; store/mirror errors fail closed.
- `apps/web/scripts/migrate-jti-revocations.ts` is dry-run by default. `--apply` requires both `JTI_REVOCATION_MAINTENANCE_CONFIRMED=1` and `AUTH_WRITERS_PAUSED=1`; output omits raw identifiers and connection details.
- Login-failure counters have a separate importer and maintenance confirmation. Device authorization and Runner/Worker pairing state are separate G2 state families and need independent drain/reconciliation proof; JTI reconciliation alone is insufficient.
- Ephemeral authorization sessions require `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID`; the operational runbook requires key-ID/secret-version parity across every Web instance without exposing secret material.
- Existing targeted proof surfaces include `revocation.test.ts`, `revocation.postgres.integration.test.ts`, `jtiRevocationImporter.test.ts`, `g2AuthStateSnapshot.test.ts`, `loginFailureCounterStore.postgres.integration.test.ts`, `deviceAuthRoutes.test.ts`, and `ephemeralAuthorizationSessionStore.postgres.integration.test.ts`. Local tests do not certify the production target or service reopening.
- The runbook requires a verified isolated restore using a backup that contains the already-applied 0349 schema; it explicitly prohibits rerunning migrations 0345–0349 on the target.

## Official technical research

### Cloudflare Durable Objects

- SQLite-backed Durable Object storage is transactional and strongly consistent **within each unique object**, and is private to that object. New namespaces are recommended to use SQLite-backed storage; that backend supports point-in-time recovery for up to 30 days. This does not by itself provide an atomic transaction across separate per-session, per-user, or per-tenant objects.
- Durable Object in-memory state may be discarded on hibernation, eviction, deployment, or runtime restart. Any revocation/version state needed after restart must be restored from durable storage or rechecked through the approved fresh PostgreSQL path; in-memory-only state cannot satisfy the G2 contract.
- Sources: [SQLite-backed Durable Object Storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Durable Object lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

### PostgreSQL recovery

- PostgreSQL documents SQL dumps, filesystem-level backups, and continuous archiving/PITR as distinct backup approaches with different assumptions. The recovery plan must choose an approved method and prove an isolated restore against the target version/schema instead of treating the existence of a dump as restore evidence.
- Source: [PostgreSQL Backup and Restore](https://www.postgresql.org/docs/current/backup.html).

## Research implications for the plan

1. Make safe service reopening a separately gated recovery outcome; a completed local plan, migration script, or passing local tests cannot authorize unmasking.
2. Keep raw JTIs and secret values out of artifacts/logs. Use aggregate counts and digest-level comparisons only.
3. Require a maintenance-fenced, repeatable two-way state comparison, preserving PostgreSQL-only revocations and proving zero active Redis-only revocations before reopening.
4. Model login lockouts, device grants, and pairing sessions separately; retain active state and close late-arrival races after the writer fence.
5. Treat the temporary Redis-first mirror as a limited forward-recovery bridge, not a safe Redis-only rollback. Disable it only after the specified rollback window and caller telemetry gates pass.
6. Plan future DO promotion as a distinct G2 wave with cross-object/global revoke semantics, restart recovery, cross-region negative tests, and PostgreSQL fresh-read fallback/fail-closed proof. Do not imply this future migration is needed to perform the immediate Redis/PG recovery.
7. Preserve Spec 245's existing master plan and add only a reviewed G2 dependency/gate delta after the Spec 232 plan is self-reviewed.

## Known evidence limits

- The most recent documented JTI mismatch is a 2026-09-26 snapshot, not a maintenance-fenced scan for 2026-09-27. Do not treat its counts as current or as an import batch size.
- The current workspace confirms the service units remain masked, but that does not prove all external origins/replicas are fenced or that production data remains unchanged since the documented scan.
- No production DB/Redis write, service operation, Cloudflare change, backup, or provider deployment was performed during research.
