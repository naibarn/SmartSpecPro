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
- Enrollment recovery: the previous persisted session was stale. In the Control Plane path, `RunnerGateway.getStatus()` rejects a local-device token whose `runnerSessionId` differs from the node's active session with `RUNNER_SESSION_STALE` (HTTP 409). The connect flow was rerun, manually approved after `xdg-open` reported that no browser handler exists, and exited 0 with credentials stored locally. The new session is `4840061c-df75-44e8-b96f-e3029ba13ec6`.
- WSS publication: installed-binary `rescan` returned `state=connected`, `delivery=wss`, `ack=duplicate`, `pendingEvents=0`, and 11 snapshot tools. The duplicate acknowledgment is idempotent acceptance, not a rejection. The service was restarted and published revision `snapshot:local-runner:2026-10-09T00:30:10.085Z`, observed at `00:30:10.085Z` and expiring at `00:35:10.085Z` UTC. Live HTTPS fallback was not needed; the focused transport regression test passed the WSS-loss → HTTPS-fallback and idempotent-replay path.
- Control Plane read-back: a signed, read-only `GET /api/runners/local-runner/status` returned HTTP 200 with `status=online`, `trustState=trusted`, `connectionState=capability_ready`, the same session ID, and the same current snapshot revision/expiry. No live HTTPS fallback was needed; WSS delivered the snapshot.
- Installed-binary `status`, `doctor`, and `capabilities` returned exit 0 and discovered 11 candidates. The local-only commands reported 0 ready before probing; this is not a connectivity status. Present candidates include Codex, ffmpeg, ffprobe, and browser; seven catalog tools were not found. After `rescan`, browser was authenticated/available with probe state `ready` using Chrome for Testing `145.0.7632.6`.
- Codex: CLI is `codex-cli 0.160.0`; `codex login status` reports `Logged in using ChatGPT`. The Runner's bounded `codex --version` probe is healthy/available, but its policy deliberately returns `authenticated=false` and `auth_probe_required` outside the test-only deterministic adapter. Therefore Codex remains `auth_required` and is **not ready for Runner execution**. No real Codex task/dispatch was run to manufacture readiness.
- Service: `smartaihub-runner.service` is `active (running)`, PID `194841`, with `NRestarts=0`; the signed Control Plane status read-back confirms the session is online and snapshot is current at verification time.
- Focused source regression: `cargo test --locked --offline --manifest-path apps/runner-app/Cargo.toml --lib` — 163 passed, 0 failed. Shared web contract tests — 16 passed across 2 files. `runnerGateway.test.ts` — 18 passed with a test-only `JWT_SECRET`.
- No protected dispatch, grant, budget, or economic record was created. No Runner/Rust source was modified; the 409 was resolved by replacing the stale enrollment, not by changing code. Debian connection and browser capability acceptance pass; Codex readiness remains intentionally unverified/not ready under current auth policy. WSL2 and Windows acceptance remain separate.

**Debian Linux Runner connection acceptance: PASS** for the active Control Plane session, online status, fresh capability snapshot, and WSS acknowledgment. **Codex Runner execution readiness: NOT READY** until the approved adapter can obtain valid authentication evidence without a protected task dispatch.

## Next eligible workunit

1. Obtain the owner decision in `owner-approval-request.md` and bind approved issuer identity, key-management resource, trust policy and dedicated evidence bucket/prefix to server configuration ownership.
2. Implement concrete authority adapters only after those resources/configuration are authorized; test storage mutation/delete denial and key rotation/revocation against the real approved systems.
3. Integrate with the sole Lane 1 writer of `spec224RuntimeAdmission.ts`: verify outside DB locks, then re-read canonical binding, revocation and atomic evidence-consumption/replay state inside the protected-start transaction.
4. Run PostgreSQL separate-connection race tests for revocation and duplicate consumption, then independently resume Windows/Linux Runner, economic, dispatch and deployment gates.

**Reactivation predicate:** accountable owner approval exists and approved issuer/key/storage configuration can be resolved server-side. Until then continue only dependency-independent tests/docs and keep both trusted remote admission classes denied.

## Authority provisioning readiness — 2026-10-09

**Fresh canonical source:** `2b576aaa5c29500155fcf3000891017bc3b54c8f`; task worktree is clean at that source before this documentation checkpoint.

### Read-only inventory findings

- `apps/cloudflare/wrangler.jsonc` names Worker `smartspec-cloudflare-runtime`, with `CLOUDFLARE_ACTIVATION=disabled`, `CLOUDFLARE_ENVIRONMENT=local`, and no resource bindings. It does not establish a deployed service principal or SPEC-224 server authority.
- `apps/web/server/services/spec224RemoteBundleStorage.ts` supports only dedicated non-production R2/S3-compatible configuration and restricts test buckets to `spec224-admission-test*`; the existing evidence still says roles are unverified and mutation/delete denial is untested.
- No `wrangler` executable was installed in this task environment. No Cloudflare/R2/KMS-related environment-variable names were present. Therefore authenticated account inventory was unavailable; actual R2 bucket, Secrets Store, KMS and service principal existence is **UNKNOWN**, not absent.
- No resource, key, secret, binding, grant, bucket, deploy, or runtime setting was created or changed.
- Official Cloudflare docs describe Secrets Store as account-level secrets retrievable by a bound Worker as a value, while Workers Web Crypto supports cryptographic operations. This is a possible software-signing path but is not evidence of a non-exportable asymmetric KMS signing operation. A security owner must explicitly accept Worker runtime access to key bytes before considering this store as signer input. The inspected Cloudflare Worker is disabled/local and has no such binding.

### Bounded owner package

See `owner-approval-request.md` and `authority-design.md`. Logical proposal only: existing authenticated SmartSpecPro server workload owning canonical DevelopmentRun/job/attempt reads; purpose-specific Ed25519 signing operation; dedicated non-production R2 evidence target with `spec224/<tenant-id>/<profile-digest>/` prefix; distinct writer and read-only verifier principals; one approved non-production tenant/project/environment and profile allowlist; explicit TTL, retention, rotation, revocation, incident ownership, byte/count/time limits, and immutable readback proof. These names are not provisioned resources. Owner must supply actual principal/account/key/bucket IDs and durable approval reference.

### Focused review passes

1. Checked the task started at the fresh `origin/main` SHA before edits.
2. Confirmed worker activation remains disabled and environment is local.
3. Confirmed Wrangler bindings do not declare R2 or Secrets Store resources.
4. Checked Wrangler CLI availability without invoking package installation or login.
5. Checked only names, not values, of Cloudflare/R2/KMS environment variables.
6. Re-read existing storage constraints; did not upgrade test bucket allowlist to trusted use.
7. Compared existing signing domains; did not nominate or reuse application/Runner keys.
8. Checked official Secrets Store integration: Worker can retrieve the bound secret value; no non-exportable signing operation is evidenced.
9. Checked official Worker Web Crypto: signing primitives do not prove a configured key authority or approved issuer.
10. Reviewed the package for scope creep: no resource creation, credential access, runtime admission change, Runner path edit, production trust, or dispatch authorization.

### Status and next action

- Workunit 1 decision package: **PREPARED / OWNER DECISION REQUIRED**.
- Existing resources available in Cloudflare account: **UNKNOWN** from this execution context; repository config only confirms no Worker bindings.
- Existing resources approved for SPEC-224: **NONE evidenced**.
- Workunit 2 concrete adapters: **WAITING_APPROVAL** until an authenticated owner returns exact identities/resources, signing operation and policy.
- Workunit 3 protected admission: **NOT READY**; both `REMOTE_TEST_TRUSTED` and `PRODUCTION_TRUSTED` remain denied. Runner ownership paths and reserved `spec224RuntimeAdmission.ts` files were not modified.
- Independent next action: owner supplies the bounded approval record and exact existing resources. Then verify metadata/policy read-only before implementing adapters; if Cloudflare inventory remains unavailable, use the established platform inventory/approval workflow rather than inferring resource absence.

## P-RECOVERY validation interface repair — 2026-10-09

At canonical source `856ba06f6c82503d05ef79a81d640d511fbc602a`, Workunit B caller-graph review found a concrete integration defect: the Node protected-admission adapter posted to `/api/v1/approvals/internal/spec224-recovery-grants/validate`, but the canonical FastAPI approvals router had no registered route. The loopback integration helper also required this missing route. The approval DB service exposed an incomplete boolean validator and several branches called an undefined `decision(...)` helper, while the Node adapter requires the versioned `spec224.recovery-grant-validation.v1` decision envelope.

PR #392 (merge SHA `033f6a632e0e97c8a9fcbd9f54e1fb7482dc9c50`) added the internal-token-protected route and structured service contract. Validation returns stable deny reasons for missing grant, wrong tenant/owner, revoked grant, invalid audit chain/scope/binding, expired or malformed expiry; grant version and scope digest are returned only for `VALID`. The legacy service predicate remains as a boolean compatibility wrapper. No grant, approval, economic record, key, storage binding, or Runner setting was created or mutated. `spec224RuntimeAdmission.ts`, Runner/Rust paths, and the reserved runtime-admission tests were not edited.

Source-level review passed 18 focused invariants: module parsing, canonical route/method path, strict request model, authentication-before-service ordering, exact v1 output schema, tenant isolation, revocation state, owner activity, audit digest, expiry, malformed scope lists, source/workpackage/operation/path scope, runtime/admission binding, restricted failure metadata, and a route-registry regression test. `git diff --check` and `python3 -m py_compile` passed for the changed Python files. Post-merge test discovery found the canonical checkout venv at `/home/dev/projects/SmartSpecPro/python-backend/.venv/bin/pytest`: the focused file produced **10 passed, 1 failed**. The single failure is the pre-existing `test_legacy_approval_resume_fails_closed_without_loading_retired_runtime`, which detects the unchanged legacy LangGraph import in `_resume_workflow_after_decision`; the function has no diff from the base SHA and is outside this scoped P-RECOVERY route repair. Re-running the task-relevant selection produced **10 passed, 1 deselected**. The PostgreSQL-backed HTTP integration remains **NOT RUN**; unit tests do not establish live service or runtime admission.

The exact 5-second Node-to-Python validator call still occurs inside the protected-start transaction and grant fence. It is bounded and remains fail-closed, but creates a latency/lock-duration concern for the sole Lane 1 runtime writer to address or explicitly accept before live dispatch. This repair alone does not enable remote trust: no approved issuer/key/storage authority exists, `REMOTE_TEST_TRUSTED` and `PRODUCTION_TRUSTED` remain denied, and no live dispatch is claimed.

The handoff evidence correction merged as PR #393 at canonical SHA `388338d5d05f5d84d7d0fd044df08aa4833c4f65`. The registered user workspace `/home/dev/projects/SmartSpecPro` converged cleanly to that SHA with receipt `workspace-convergence:f58461db-585e-4df1-b145-c30a2331bd18`.

**Next eligible actions:** Workunit A remains `WAITING_OWNER_AUTHORITY`: the existing approval package requires exact existing issuer principal/owner, signing operation and key fingerprint, storage account/bucket/prefix, distinct writer/reader identities and permissions, trust scope/freshness/revocation/retention policy, and authenticated approval reference. Cloudflare account inventory remains unknown because this environment has no authenticated platform inventory interface; no resource is asserted absent. Workunit D remains `WAITING_AUTHENTICATED_RUNNER_EVIDENCE`: Windows usability is operator-confirmed, but this session has no supported authenticated Control Plane interface to capture a fresh Windows session/capability snapshot and Codex readiness. The existing Debian Linux Runner connection snapshot is fresh, but its Codex readiness remains `NOT_READY` (`auth_probe_required`).

The task-relevant Python tests pass 10/10 when selecting away the unrelated, unchanged legacy LangGraph test. PostgreSQL-backed HTTP integration remains **NOT RUN**. The bounded 5-second Node-to-Python recovery-grant call still runs inside the protected-start transaction/fence; the Lane 1 runtime owner must resolve or explicitly accept this lock-duration issue before live dispatch. Workunit C, trusted remote admission, real Runner dispatch, settlement, and deployment remain blocked/unverified.

## Combined Lane 1 + Lane 2-2 continuation — 2026-10-09

**Canonical source:** `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978` (`origin/main`). This checkpoint refreshed the existing SPEC-224 manifest through the shared writer to generation 20 and this SHA; `REMOTE_TEST_TRUSTED` and `PRODUCTION_TRUSTED` remain denied.

### Authority and interface status

- No new authenticated owner approval, issuer principal, signing key/operation, approved evidence bucket/prefix, or storage permission proof was present in the latest canonical handoffs. `wrangler` and authenticated Cloudflare inventory access are unavailable in this session. Resource existence remains **UNKNOWN**, not absent. The existing bounded owner request remains the correct decision package; do not create resources or credentials.
- Production caller review remains unchanged: `externalAgentTaskExecutor.ts` calls `commitSpec224ProtectedExecutionStart`; the trusted source verifier and DevelopmentRun eligibility evaluator are not wired as production admission authorities. They must stay unregistered until approved canonical evidence sources and owner authority exist.
- P-RECOVERY validation route repair from PR #392 is integrated. The Node-to-Python validator still performs bounded HTTP I/O while the admission transaction/grant fence is held; safe lock-duration reduction and PostgreSQL race proof remain prerequisites before live dispatch. This is not a trust bypass and no dispatch occurred.

### Windows Runner evidence and next action

- Latest Windows review artifact is Runner Desktop `0.2.26`, source `14e705d366aa7eac5e95abd321823a6983536906`, unsigned review build SHA-256 `b9d3ae520a630458a8dd04b51e037880cc9782b53815f60bff23fa6c9cf52bf0`; evidence and Actions artifact link are in `specs/feature/205-smartaihub-runner-cross-platform/handoff/evidence/runner-refresh-http409-reauth-20261009.md`.
- The fix classifies HTTP 409 as requiring browser reauthorization and keeps 503 retryable. Windows runtime acceptance is still pending: install that review build, use browser reconnect once, approve replacement of the stale/conflicting session, then confirm the 30-second retry loop stops and the UI directs browser reconnect.
- This session has no supported authenticated Control Plane interface to read a fresh Windows session/capability snapshot or Codex readiness. The user-provided pairing screenshot and earlier operator confirmation are not fresh capability or real-job evidence.
- Debian Linux evidence remains separate and stale for live readiness: session `4840061c-df75-44e8-b96f-e3029ba13ec6`, snapshot `snapshot:local-runner:2026-10-09T00:30:10.085Z`; Codex was `auth_probe_required`. No Linux Runner paths were modified because ownership remains reserved.

### Acceptance and next ready work

- Trust issuer/verifier activation: **WAITING_OWNER_AUTHORITY**.
- Windows fresh session/Codex capability: **WAITING_OPERATOR_REAUTH_AND_AUTHENTICATED_READBACK**.
- Linux Codex execution readiness: **NOT_READY**; independent of Windows.
- Economic grant/budget/ledger, real dispatch, receipt-backed settlement, deployment, and UAT: **NOT VERIFIED**; no protected records were changed.
- Next executable action: operator installs Windows `0.2.26` and reconnects through the browser; in parallel, the accountable platform/security owner returns exact existing trust resource identities and approval. After either predicate resolves, continue its independent workunit without claiming the other gate passed.

No implementation tests were rerun because this checkpoint changed only handoff metadata; previous verifier and P-RECOVERY test evidence remains tied to its recorded source SHAs and does not prove runtime acceptance at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`.
