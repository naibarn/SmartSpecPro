# TDD Plan — Spec 232 G2 Auth / Revocation Recovery

These are test requirements for a future, separately authorized recovery implementation. The current planning task does not run Production changes or tests.

## 1. Purpose, scope and operating mode

- Assert G2 recovery can complete without enabling DO migration, Redis-wide shutdown, or any second auth authority.
- Assert plan/implementation status cannot mark Production ready from local or stale evidence.
- Assert Redis-only rollback is rejected when a PG-only revocation exists.

## 2. Current implementation and target boundary

- Extend/retain `revocation.test.ts` coverage for PG-first lookup, mirror write ordering, store/mirror outage fail-closed, expiry and PG-only denial.
- Check guarded importer defaults to dry-run and rejects `--apply` unless both required maintenance/writer-fence gates are present.
- Assert JTI importer output never contains raw JTIs, credentials or connection details.
- Assert recovery code path does not instantiate or require the future Durable Objects authority.

## 3. Execution roles and durable evidence

- Test evidence redaction: secrets, raw JTI values and auth keys never appear in stdout/errors/artifact serialization.
- Test gate evaluator rejects missing owner approval, target identity, backup proof, reviewer, revision or stale evidence timestamp.
- Test evidence bundle records immutable source/version references and aggregate results without customer identifiers.

## 4. Ordered implementation waves

### Wave 0 — Target and writer inventory

- Test inventory parser rejects an unknown origin/instance or unclassified auth writer.
- Test writer-fence status is instance-scoped and incomplete/stale proof leaves the gate blocked.

### Wave 1 — Backup and restore

- In isolated non-production integration, validate restore schema through 0349 and expected auth aggregates/checksums.
- Test missing/corrupt/untrusted backup metadata blocks all import/apply steps.

### Wave 2 — Maintenance and stop writers

- Test all known auth write operations are blocked/fenced during maintenance and that a late write invalidates existing snapshots.
- Test unrelated Redis consumers are not disabled by the G2 maintenance procedure.

### Wave 3 — Fresh snapshots and dry-run

- Extend `g2AuthStateSnapshot.test.ts` for late JTI, login lockout, device grant and pairing state after a preparation scan.
- Test invalid/expired/persistent records are classified correctly and raw identifiers remain redacted.
- Test snapshot equality is target/fence/time scoped; stale historical count cannot satisfy the gate.

### Wave 4 — Guarded import and stable proof

- Extend `jtiRevocationImporter.test.ts` for idempotent active import, expiry preservation, PG-only preservation and repeat-scan convergence.
- Test a timeout/partial import followed by a fresh comparison does not duplicate or delete revocation state.
- Extend login counter importer/store integration for concurrent counters, persistent lockout preservation and invalid-entry block.
- Test device and pairing state cannot be marked drained while active/unconsumed records remain.

### Wave 5 — Keyring, bridge and security

- Retain `revocation.postgres.integration.test.ts` multi-client visibility and fail-closed cases.
- Extend ephemeral authorization session integration for key rotation and cross-client decrypt, including missing/wrong active key rejection.
- Test a PG-only digest remains denied when Redis mirror is empty; test Redis bridge read/write errors fail closed.
- Keep production tests explicitly opt-in and separate from ordinary local tests.

### Wave 6 — Smoke and reopening

- Test reopening evaluator requires every prior wave's current evidence and two approvals.
- Test exact service order and fail-stop behavior when Backend/Web health checks fail; no automatic mask removal or watchdog bypass.
- Assert public/origin health and per-instance auth behavior are separate acceptance checks.
- Test telemetry stop thresholds trigger maintenance/fencing without data deletion or Redis-wide shutdown.

## 5. Spec 245 reconciliation and deferred DO wave

- Test crosswalk links point to the correct Spec 232 plan and do not overwrite existing Spec 245 R8 files.
- Test Spec 245's status remains blocked/unverified until every required G2 and unrelated master-plan gate has its own evidence.
- In the future DO plan, test cross-object/global revoke, hibernation/deploy restore, concurrency at await boundaries, cross-region deny and fresh PG fallback/fail-closed behavior.

## 6. Failure handling and rollback boundaries

- Test every failure in the plan yields `BLOCKED_SAFE` and cannot delete PG/Redis revocation records.
- Test PG-only revocation makes Redis-only rollback ineligible.
- Test failed restore, active writer, nonzero discrepancy, key mismatch, stale evidence and protected allow each block reopening.

## 7. Capacity, security, data and operational costs

- Test scans/imports use bounded batches and expose aggregate counts while keeping token/account identifiers private.
- Test import retry remains idempotent under batch boundary and transient DB failure.
- Confirm no test fixture or script targets Production unless a separately approved production-safety gate explicitly enables it.

## 8. Verification boundaries

- Add a gate-report test proving local suite PASS is not promoted to Production PASS.
- Validate that production evidence requires target fingerprint, timestamp, revision, reviewer and explicit owner approval.
- Preserve repository policy: do not run repo-wide TypeScript typecheck; choose focused suites only after implementation authorization.
