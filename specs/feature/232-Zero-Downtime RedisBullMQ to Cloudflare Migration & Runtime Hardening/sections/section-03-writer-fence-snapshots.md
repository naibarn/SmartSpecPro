# Section 03 — Writer Fence and Fresh G2 Snapshots

## Objective and boundary

With Sections 01 and 02 approved, fence every G2 writer and capture coordinated, current Redis/PostgreSQL snapshots. This stage is read-only with respect to auth data: no importer apply, schema change, deletion, service unmask, or traffic reopening. An unknown writer, target mismatch, post-fence write, malformed entry, or unclassified state yields `BLOCKED_SAFE`.

## Work sequence

1. Approve a named maintenance window. Gate public and direct-origin traffic and stop/fence all inventoried login/token, refresh/revoke, device, pairing, worker, scheduler, and cleanup writers. Keep Backend/Web/watchdog masked and Redis available for non-G2 duties.
2. Record a single fence time plus per-writer/service/revision evidence. Prove no G2 writes occurred after the fence. Any late write invalidates affected snapshots; fence the missed writer and recapture all affected families.
3. On the confirmed targets, perform fresh read-only scans for:
   - JTI active/persistent/expired/invalid keys versus active PostgreSQL digests and expiries;
   - login counters and lockouts, including persistent, expired, malformed records;
   - device grants by pending/consumed/expired/replayed/invalid state;
   - Runner and Worker pairing records by pending/active/revoked/expired/malformed state.
4. Run the existing importer dry-runs only. Include target, fence, revision, scan timestamps, aggregate counts, safe digests/hashes, unresolved counts, and redaction assertion. Do not use historical counts as import quantities. Never print raw JTIs, emails, device/pairing values, credentials, or Redis payloads.
5. Rehearse late-write detection with synthetic data in `smartspec_test` or an injected reader, never Production.

## Future focused tests

Extend `g2AuthStateSnapshot.test.ts`, `redisG2AuthStateAudit` tests, and importer tests to prove fence/time/target binding, late writes invalidate snapshots, all four state families are classified, malformed/ambiguous values block, literal prefixes are used, and output is redacted. Run only focused tests after implementation authorization.

## Acceptance and handoff

Require complete current writer-fence evidence, matching Redis/PG fingerprints and revision, fresh scans after the fence, dry-runs for JTI and login counters, explicit device/pairing dispositions, and zero unclassified records. Output a two-person-reviewed no-write packet. Section 04 cannot begin otherwise. `AUTH_WRITERS_PAUSED=1` alone is not proof of a complete fence.

## External gates

Maintenance approval, origin/route fencing, all-writer stop evidence, and fresh Production scans require authorized operators. Do not start either importer with `--apply` or unmask services here.

## Implementation outcome

- Hardened the G2 Redis state audit to use the shared login lockout threshold, classify invalid counters and unknown/malformed device/pairing values, and report paired user-side records separately from device-side records without claiming deduplication.
- Added literal-prefix validation to both Redis snapshot collectors; JTI apply now blocks if the scan contains invalid identifiers or any non-revocation value under the revocation prefix.
- JTI apply repeats the JTI scan, blocks if its active digest set, permanence, or expiry materially changed (allowing up to 1 second of PTTL sampling drift), then audits login/device/Runner/Worker Redis state immediately before writes and blocks malformed or unclassified records. The external writer-fence proof remains mandatory.
- Login-counter auditing accepts only canonical positive decimal values and blocks malformed numeric representations from appearing valid.
- Updated the runbook to mark historical counts as non-authoritative, require fresh target-specific scans, and invalidate affected snapshots on post-fence writes.
- Validation: `g2AuthStateSnapshot.test.ts`, `jtiRevocationImporter.test.ts`, and `revocation.test.ts` passed (17 tests); no Production scan or apply was performed.
