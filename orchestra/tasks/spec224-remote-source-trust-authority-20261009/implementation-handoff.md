# SPEC-224 Remote Source Trust Authority — checkpoint handoff

**Canonical base:** `f078537ad55c110ab7c3c7521723e232dfeff4a7`
**Task branch:** `codex/spec224-remote-source-trust-20261009`
**Task worktree:** `/home/dev/.cache/codex/worktrees/spec224-remote-source-trust-20261009`
**Verifier integration:** PR #387, merge SHA `1b0b86492b3f4b387bb0645605140ce4a9bfcc3f`
**Canonical handoff integration:** PR #388, merge SHA `f078537ad55c110ab7c3c7521723e232dfeff4a7`
**State:** `INTEGRATED_ISOLATED_COMPONENT / NOT_RUNTIME_AUTHORITY`

## Completed in this checkpoint

- Added `spec224RemoteSourceTrustVerifier.ts` as an isolated server-only contract. It is not imported by protected-start/runtime admission and returns evidence verification only, never dispatch permission.
- Signature verification is Ed25519 over canonical JSON. It resolves a trusted key and tenant/profile scope through a server authority adapter, recomputes the DER public-key fingerprint, checks key validity and revocation, and supports a retained key only while signed issue time falls within its approved validity interval.
- Storage bucket identities and prefixes are resolved from the server authority adapter, not caller input. Evidence object identity is signed; evidence bytes, source manifest/content, and every artifact are read back under byte/object limits and digest checked. Object-store references do not accept URLs.
- The verifier checks canonical run/workunit/job/attempt/fencing/source/profile/artifact/runner-session/capability-revision bindings, freshness, canonical revocation, replay state, and bounded authority/storage latency with stable deny reasons.
- Added focused tests with ephemeral test keys only. These fixtures prove verifier logic; they are not an issuer, trust root, production bucket, KMS, or live execution proof.
- No existing Runner/Rust files, `spec224RuntimeAdmission.ts`, its reserved tests, schemas, migrations, storage configuration, grant/economic records, or protected runtime integration were modified.

## Verification evidence

- Focused Vitest: `apps/web/server/services/spec224RemoteSourceTrustVerifier.test.ts` — **11 tests passed**.
- Scoped TypeScript compile of the two changed TS files — **passed** using `tsc --noEmit --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --types node --esModuleInterop ...`.
- Prettier on changed TypeScript files — **passed**.
- `git diff --check` — **passed**.
- A first package-script invocation accidentally selected the whole web test suite because the package script did not forward the path filter as expected; it was interrupted. It showed unrelated baseline failures/timeouts in scheduler Cloud Tasks, chat wiring, skill classifier, voice gateway, vertical-drama quality, telegram, worker fleet, and unrelated UI tests. The exact target test was rerun directly and passed. No claim is made for the package suite.

## Runner platform usability update — operator-confirmed

On 2026-10-09 the operator confirmed that the Windows and Linux Runner versions are usable. The attached screenshot shows a successful SmartAIHub Runner connection from WSL2, supporting Linux-side connection usability. The screenshot does not expose a reliable binary version string, so this handoff records no numeric version. The Windows usability statement is operator-confirmed; the screenshot itself shows WSL2 only.

This closes the platform installation/connection usability note only. It does **not** establish a fresh capability snapshot, Codex authentication/policy readiness, job-specific workspace binding, source-trust admission, authorized DevelopmentRun dispatch, completion receipt, economic settlement, or deployment. No Runner pairing code, account email, device identifier, or token-like URL value is copied into this repository.

## Focused QA/review passes

1. **Trust boundary:** verified the module is unregistered and no runtime admission import was added.
2. **Issuer identity:** unknown issuer/key fails closed; caller cannot choose a key resolver or dispatch authority.
3. **Cryptographic integrity:** payload/signature tamper fails; actual public-key fingerprint is recomputed from Ed25519 SPKI bytes.
4. **Rotation/revocation:** retained-key validity is bounded by signed issue time; revoked/out-of-window key is denied.
5. **Storage authority:** bucket and prefix come from owner-authorized server adapter; arbitrary URL, traversal and wrong bucket/prefix are rejected.
6. **Object immutability:** stored evidence bytes and all source/artifact objects are re-read and checked against signed size and SHA-256.
7. **Canonical binding:** tenant/run/workunit/job/attempt/fencing/source/profile/artifact/Runner session/capability revision mismatch is denied.
8. **Freshness:** future, expired and over-age evidence is denied; malformed envelope is denied with stable reason.
9. **Bounded I/O:** object count/size/total caps and deadline are enforced; timeout and unavailable storage fail closed.
10. **Revocation/replay/data safety:** canonical revocation and replay adapters are consulted after reads; verifier performs no writes. Atomic replay consumption and commit-time revocation re-read remain mandatory in later protected-start transaction integration.

## Authority decision and blockers

No authorized SPEC-224 remote issuer, trust key/catalog, KMS/secret-manager identity, production-capable evidence bucket/prefix, immutability proof, or accountable configuration owner was established in the repository/runtime evidence. See `authority-design.md` and `owner-approval-request.md` for the exact bounded owner decision and missing authority. The existing test-only R2/S3 storage setup and unrelated signing domains are not sufficient.

Therefore:

- `REMOTE_TEST_TRUSTED`: **DENY / not enabled**.
- `PRODUCTION_TRUSTED`: **DENY / not enabled**.
- Protected-start integration and persisted-proof dispatch revalidation: **NOT READY**, awaiting issuer + key + storage authority and owner approval.
- Windows/Linux Runner platform usability: **OPERATOR_CONFIRMED_USABLE** (Windows by operator statement; Linux WSL2 connection shown in the attached UI screenshot). Exact binary versions, fresh capability snapshots, Codex readiness, and job-specific authority remain unverified.
- Live dispatch, P-RECOVERY, economic provisioning, deployment: **separate gates; unverified**.
- PostgreSQL lock/revocation/replay race proof: **NOT RUN**; must be performed against actual admission transaction in later integration, not inferred from these unit tests.

## Linux Runner coordination

The workspace authority scan found three clean Runner worktrees and no active session IDs or open Linux Runner PR at scan time; prior merged PRs #325, #326, and #379 were inspected. Because the user specified reservation until explicit owner release and the Linux bug owner could not be identified from the registry, all Rust/Runner/install/transport/capability/session files remain reserved. This checkpoint changes none of them.

## Debian Linux Runner acceptance — 2026-10-09

The operator clarified that the target for this acceptance run is the Debian Linux machine hosting SmartAIHub, not WSL2. Keep this evidence separate from WSL2, Windows, and independent Debian installation acceptance.

- Host: Debian GNU/Linux 13 (trixie), x86_64, kernel `6.12.63+deb13-amd64`.
- Installed binary: `/home/dev/.local/bin/smartaihub-runner`; version `0.2.23`; contract `sah-runner-v1`; connect schema `sah-runner-connect-v2`; SHA-256 `382791c51220a4ddeebac63096ced9444753f25c20e55f5ee09d627c0ea291ed`.
- Local enrollment persistence: `/home/dev/.smartaihub-runner/runner-connection.json` exists with mode `0600`; redacted inspection confirms runner `local-runner`, a stored runner session ID, control/refresh token material, and device keys. This proves a local credential record is persisted; it does not prove the original `connect` process exit was captured or that the Control Plane currently accepts the record.
- `systemctl --user status smartaihub-runner.service`: `active (running)`, PID `3917259`, executing the installed binary with `run`. Recent journal entries repeatedly report `RUNNER_CONNECT_REQUEST_REJECTED_409` for refresh and update checks.
- Installed-binary `status`, `doctor`, and `capabilities` each returned exit 0 and local discovery state `ready`, with 11 discovered candidates and 0 ready tools. The local command state is not a connected/online claim. Codex was discovered as `codex.v1`, install state `ready`, but Runner candidate version, health, authentication, and probe remain unknown/required.
- Codex CLI: `codex-cli 0.160.0`; `codex login status` reports `Logged in using ChatGPT`. No Runner adapter auth or readiness is inferred from this CLI login.
- Installed-binary `rescan`, using the service data root, exited 3 with `RUNNER_CONNECT_REQUEST_REJECTED_409` before capability probing/publication. No capability snapshot revision, freshness, Control Plane acknowledgment, or live WSS/HTTPS delivery evidence was produced. The installed daemon remains running locally but is not verified online/acknowledged by the Control Plane.
- No protected dispatch, grant, budget, or economic record was created. No Runner/Rust source was modified; the observed Control Plane rejection is an external blocker, and its underlying ownership/binding cause is not confirmed. No Linux code defect was established.
- Focused source regression: `cargo test --locked --offline --manifest-path apps/runner-app/Cargo.toml --lib` — 163 passed, 0 failed. Shared web contract compatibility: `pnpm exec vitest run server/services/__tests__/runnerContracts.test.ts server/services/__tests__/runnerCompatibility.test.ts` — 16 passed across 2 files.

**Debian Linux acceptance: BLOCKED** on the Control Plane rejecting the persisted local enrollment with HTTP 409. The Control Plane owner must identify the conflicting binding and confirm the authorized Debian Runner identity; then rerun `rescan` and verify snapshot revision/freshness plus server acknowledgment before assessing Codex probe/readiness. WSL2 browser approval remains a separate enrollment observation and does not satisfy this Debian gate.

## Next eligible workunit

1. Obtain the owner decision in `owner-approval-request.md` and bind approved issuer identity, key-management resource, trust policy and dedicated evidence bucket/prefix to server configuration ownership.
2. Implement concrete authority adapters only after those resources/configuration are authorized; test storage mutation/delete denial and key rotation/revocation against the real approved systems.
3. Integrate with the sole Lane 1 writer of `spec224RuntimeAdmission.ts`: verify outside DB locks, then re-read canonical binding, revocation and atomic evidence-consumption/replay state inside the protected-start transaction.
4. Run PostgreSQL separate-connection race tests for revocation and duplicate consumption, then independently resume Windows/Linux Runner, economic, dispatch and deployment gates.

**Reactivation predicate:** accountable owner approval exists and approved issuer/key/storage configuration can be resolved server-side. Until then continue only dependency-independent tests/docs and keep both trusted remote admission classes denied.
