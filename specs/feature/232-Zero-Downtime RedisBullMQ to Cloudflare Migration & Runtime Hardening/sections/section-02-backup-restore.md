# Section 02 — Durable Backup and Isolated Restore Proof

## Objective and boundary

Tie an owner-approved encrypted backup and successful isolated restore to the exact Section 01 PostgreSQL target and release. A successful backup command or existing artifact is not restore proof. This plan does not take a Production backup, create a restore target, connect to Production, mutate data, or authorize later stages.

Keep all masked units masked. Keep real backup artifacts and credentials outside Git/public application paths. Do not use the media bucket unless its privacy, access, encryption, retention, and restore properties are separately approved. Do not treat SQL dump, filesystem backup, and PITR as interchangeable. Do not rerun migrations 0345–0349 when current evidence shows matching applied hashes.

## Work sequence

1. Require Section 01 `PASS` for the same target/revision, named DB operator and system owner, private durable destination, retention/deletion owner, and recovery method.
2. During an explicitly approved window, capture a fresh encrypted backup. Record method/tool version, source fingerprint/revision, consistent snapshot identity or PITR target timestamp/WAL LSN when available, timestamps, artifact size/checksum, integrity result, encryption scheme and key-version reference, destination/retention approvals. Bind the restore and sanitized aggregate comparison to that exact recovery point; schema/hash agreement alone does not prove data consistency. Never expose key bytes or signed URLs.
3. Restore to an isolated non-production target with no Production credentials/routes, public ingress, workers/schedulers, webhooks, messaging, email, or paid-provider access. Record isolation controls and target fingerprint.
4. Verify restored DB identity, migration journal/hashes through 0349 as applicable, required G2 tables/columns, and sanitized aggregate counts/checksums against the recovery point. Exercise the documented recovery procedure and record elapsed restore time and reviewer decision.
5. Any checksum, schema, migration, aggregate, or isolation discrepancy leaves the result `BLOCKED_SAFE`; do not start the writer fence or apply stage.

## Test requirements for future implementation

If a machine-checkable backup/restore gate is introduced, use pure evaluators and injected isolated DB readers. Tests must reject stale/mismatched target evidence, missing/corrupt artifact metadata, a restore target matching Production, external effects enabled, missing schema/migration proof, and secret-bearing output. Any PostgreSQL integration test must be opt-in, verify it is an isolated target before connecting, and avoid mutations. Planning-only work must not run these tests.

## Acceptance and handoff

Output: private backup reference/checksum, integrity and encryption metadata, isolated restore evidence, verified schema/migration state, sanitized aggregate comparison, recovery procedure reference, owner and independent reviewer sign-off. Section 03 may start only when this packet is current, approved, and for the same target/revision as Section 01. Artifact existence alone never passes this gate.

## External gates

Backup destination/method approval, protected backup access, restore infrastructure, Production target identity, and operator/reviewer sign-off are external. Failed or untrusted restore means remain fenced; no import or service reopening.

## Implementation outcome

- Strengthened the existing runbook's backup evidence requirements: consistency/recovery point, integrity, encryption/key-version, destination/retention owners, isolation, schema/migration hashes, and sanitized comparison.
- Bound the restore and aggregate checks to the backup's consistent snapshot identity or PITR target timestamp/WAL LSN when available; schema/hash equality alone is not accepted as data-consistency proof.
- The existing successful relational restore drill is not accepted as a durable encrypted backup; no new Production backup or restore was performed.
- The external durable-backup/restore gate remains `BLOCKED_SAFE`; documentation-only section, no test added or run.
