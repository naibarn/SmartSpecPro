# Section 04 — Guarded State Reconciliation and Stable Proof

## Objective and boundary

Reconcile active Redis-only JTI revocations and eligible login-failure state into PostgreSQL through existing guarded, idempotent importers, then prove convergence with independent scans. Preserve every PostgreSQL-only revocation and all active device/pairing state. This section does not migrate device grants or pairing records via the JTI/login importers, delete either source, rerun migrations 0345–0349, or reopen services.

## Entry criteria and work

Require Sections 01–03 `PASS` for one target/revision/window, approved encrypted backup and isolated restore, complete writer fence, fresh snapshots, dry-run results, and zero malformed/unclassified records.

1. Review current dry-run output and re-confirm owner approval, target identity, backup/restore, writer fence, and independent reviewer immediately before each apply.
2. Apply only the needed existing importer (`migrate-jti-revocations.ts` and/or `migrate-auth-login-failure-counters.ts`). Preserve current dual maintenance/writer-paused guards. Do not treat flags alone as proof. No DDL is expected; do not rerun 0345–0349.
3. Keep JTI imports monotonic and idempotent: import active Redis-only digests, preserve PostgreSQL-only entries, never shorten a later expiry or replace permanent revocation with an expiring one, and retain Redis source keys.
4. Preserve login counter/lockout semantics: no lower count, shorter expiry, or lost persistent lockout. Keep identity values redacted.
5. Let active device grants and pairing records drain only through their normal consume/expiry/revocation lifecycle. If they cannot drain, stop and require a separately reviewed migration with dedicated tests; do not improvise a data rewrite.
6. On timeout/uncertain commit, keep maintenance active and compare fresh read-only state before any retry. Never blindly rerun or delete data to force matching counts.
7. Perform independent post-import scans, then repeat after a quiet interval selected and justified from measured writer/scheduler behavior. Any new write invalidates the proof. Require zero active Redis-only JTI, no weakened/lost lockout, preserved PostgreSQL-only revocations, and understood/drained device/pairing state.

## Future focused tests

Extend `jtiRevocationImporter.test.ts`, `revocation.test.ts`, `revocation.postgres.integration.test.ts`, and login counter importer/store tests for idempotence, monotonic expiry/permanent state, PostgreSQL-only preservation, partial retry, and output redaction. Snapshot tests must show active device/pairing records cannot be declared drained. Run focused tests only after implementation authorization and integrations only against isolated test DBs.

## Acceptance and handoff

Require guarded apply audit, independent before/after scans, two stable comparisons, no unresolved discrepancy, and independent reviewer sign-off. Keep all services fenced. Section 05 security validation and Section 06 reopen approval remain required. If any criterion fails, result is `BLOCKED_SAFE` and preserve both stores.

## External gates

Production apply, private evidence review, and measured quiet-interval selection require named owner approval and current evidence. Local tests or dry-runs cannot clear them.

## Implementation outcome

- Login-counter collection now rejects non-canonical numeric values and invalid identities; its store rejects an invalid batch before writing any valid subset.
- Login-counter `--apply` now rescans, blocks if counts/expiry materially changed (with 1-second PTTL sampling tolerance), and runs the same all-family G2 audit gate immediately before import.
- JTI apply failures close initialized DB/Redis clients and preserve sanitized failure output.
- Validation: focused snapshot, importer, and revocation tests passed; the PostgreSQL integration suite remained skipped because `RUN_DB_INTEGRATION_TESTS` was not enabled.
- No Production imports or database writes were performed.
