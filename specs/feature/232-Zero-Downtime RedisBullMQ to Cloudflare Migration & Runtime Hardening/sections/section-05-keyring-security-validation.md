# Section 05 — Keyring and Security Validation

## Objective and boundary

Prove the recovered PostgreSQL-backed state and encryption-key contract preserve auth/session security before any reopen decision. This section does not rotate secrets, change environment values, unmask services, or promote G2 authority to Durable Objects.

## Work sequence

1. Trace readers of `AUTH_SESSION_ENCRYPTION_KEYS_JSON` and `AUTH_SESSION_ENCRYPTION_ACTIVE_KEY_ID`, including encrypted authorization sessions and pairing consumers.
2. Using secret-manager metadata and instance evidence, compare active key ID and retained historical key IDs across every intended Web/Backend instance. Record identifiers/references only; never print key bytes, full environment values, or secret-derived hashes. Missing historical keys or parity mismatches block.
3. In focused local/isolated tests with synthetic fixtures, prove historical-key decrypt, active-key write, tamper/unknown-key rejection, cross-instance session read, and restart persistence. No captured production ciphertext in tests/artifacts.
4. Reconfirm PostgreSQL-first JTI behavior remains fail-closed, Redis mirror write/read failure cannot allow a revoked token, PG-only revocations remain denied, and login lockout semantics survive reconciliation.
5. Verify device grants and Runner/Worker pairing separately: consumed/expired/revoked entries cannot replay; active state is either drained by its normal lifecycle or remains a blocker.
6. Produce a redacted security evidence packet with revisions, focused test identifiers, key-ID parity, synthetic session results, revocation/counter behavior, state dispositions, exceptions, and `PASS`/`BLOCKED_SAFE` decision.

## Future focused tests

Retain/extend `ephemeralAuthorizationSessionStore.postgres.integration.test.ts`, `deviceAuthRoutes.test.ts`, `revocation.test.ts`, `revocation.postgres.integration.test.ts`, `jtiRevocationImporter.test.ts`, and `g2AuthStateSnapshot.test.ts` for the behaviors above. Integrations must use approved isolated test targets. Do not run repo-wide TypeScript typecheck.

## Acceptance and handoff

All state classes have explicit disposition; every intended instance has matching approved key IDs; synthetic decrypt/write/cross-instance/restart and fail-closed checks pass; revocation/counter guarantees remain monotonic; device/pairing state is drained or explicitly blocks. This section `PASS` is not service-unmask authorization.

## External gates

Current instance/keyring inventory, security owner approval, current production state, and live smoke evidence remain external. Mismatch or missing evidence keeps the maintenance fence in place.

## Implementation evidence

- Extracted the AES-256-GCM envelope/keyring operations into `authorizationSessionCrypto.ts` without changing the session-store contract. Focused synthetic-key tests cover active-key writes, retained historical-key decrypt, unknown-key and tamper rejection, and missing active-key rejection.
- The existing PostgreSQL integration test covers lookups across two store instances and key rotation; it was skipped because `RUN_DB_INTEGRATION_TESTS` was not enabled. Cross-instance and restart persistence are therefore not proven in this run.
- Revocation, JTI importer, login-counter importer, and G2 snapshot focused tests are covered by the Section 03/04 evidence. No production key values or ciphertext were read or written.
- Local results do not establish key-ID parity across deployed instances, provider/secret-manager state, device/pairing drainage, or live smoke results. Section status remains `BLOCKED_SAFE` until those external gates pass.
