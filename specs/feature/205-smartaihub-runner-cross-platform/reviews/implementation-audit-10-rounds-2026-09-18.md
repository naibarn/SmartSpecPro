# Feature 205 post-implementation audit — 10 rounds

Date: 2026-09-18 (final local audit after UI/lifecycle closure)

Each round used a separate lens. Findings marked fixed were corrected and the
affected focused test was rerun. Provider-specific runtime acceptance and
external environment items remain explicitly pending/unverified; they are not
counted as passing just because a generic contract test exists.

| Round | Lens | Result | Finding/action |
|---:|---|---|---|
| 1 | Requirements | FIXED/PASS | The status now distinguishes complete repository implementation from provider and rollout evidence; sections 07 and 09 expose only the remaining external gates. |
| 2 | Ownership | PASS | Runner package is separate from Worker App; no retired Agency/OpenSandbox/workflow path added. |
| 3 | Contract/data flow | FIXED/PASS | Added redacted platform projection to the snapshot contract; Job truth remains Feature 195 and tool/capability inventories remain separate. |
| 4 | Authentication | FIXED/PASS | Added operation scopes, explicit control-rotate/access-refresh/owner-revoke routes, bounded refresh replay convergence, native RSA device-proof signing, body-hash recomputation, Runner-specific nonce checks and route-level proof enforcement; revoked nodes are denied before WSS handshake or credential rotation. |
| 5 | Persistence/concurrency | FIXED/PASS | Added `FOR UPDATE` revision recheck before the Drizzle snapshot commit so concurrent submissions cannot roll back a newer revision. |
| 6 | Lease/fence/isolation | FIXED/PASS | Rust lease validation rejects expiry/fence mismatch; workspace policy now rejects symlink components in addition to traversal; Cloudflare assignment requires canonical scope. |
| 7 | Recovery/idempotency | FIXED/PASS | Added atomic journal persist/load with corruption fencing; sequence-zero duplicate behavior remains covered; reran the full 32-test Rust suite. |
| 8 | Discovery/execution reality | FIXED/PASS LOCAL | Added bounded real PATH scan, approved `--version` probe with separate auth state, native authenticated WSS transport with HTTPS durable fallback, direct no-shell process host/cancellation, periodic local `run` and explicit `rescan`. Provider-specific session acceptance remains external. |
| 9 | UI/customer flow | FIXED/PASS LOCAL | Existing single Feedback launcher exposes Chat/Task Control/Feedback; Runner/Worker labels now include safe platform, expandable redacted inventory and verification/unavailable/reconciling/waiting states. `/workers/connect` now embeds the authenticated Runner enrollment form beside Worker App. Deployed browser evidence remains pending. |
| 10 | Release/cross-spec/environment | PASS WITH EXPLICIT GATES | Manual-only workflow and 195/197/199/200/204 boundaries align; native artifacts, Cloudflare target, signing and provider/session evidence remain external gates. |

## Final local proof

- Rust Runner: 32 tests passed.
- Web Runner route/auth/contracts/gateway plus UI/Feedback/connect: 49 focused tests passed in 7 files after the lifecycle/auth closure; the post-closure route/gateway suite is covered by 20 passing tests.
- Cloudflare focused package: 23 tests passed and package check passed.
- Release build: `cargo build --manifest-path apps/runner-app/Cargo.toml --release` passed.
- Evidence checklist: 12 criteria passed; manual release workflow policy passed.
- Manual workflow policy: PASS.
- `node scripts/audit-runner-implementation.mjs`: 10/10 rounds passed.
- `git diff --check`: PASS.
- Whole-repository TypeScript type-check: intentionally not run per project
  RAM constraint.

No unresolved in-scope generic runtime safety/contract gap was left after the
lifecycle closure review. Remaining evidence gates are provider-specific session acceptance, native
host packaging/signing, the deployed Cloudflare target-account lifecycle and
deployed browser proof. Feature 205 repository implementation is complete, but
the external rollout evidence must remain unverified until those environments
are exercised.

## Fresh convergence audit — lifecycle/auth scope closure

This is a second 10-round pass after the previous audit found missing
credential-lifecycle routes. The repository was already dirty; unrelated files
were preserved and only Feature 205-owned paths were changed.

| Round | Lens | Result | Evidence/action |
|---:|---|---|---|
| 1 | Spec inventory | PASS | Re-read Sections 02, 03, 04, 06, 07 and the main device/auth/discovery requirements; mapped each to a route, module, test or external gate. |
| 2 | Cross-spec ownership | PASS | Confirmed Feature 195 remains Job/outbox truth, Feature 199 remains MCP gateway ownership, Feature 200 remains provider-neutral Agent semantics and Feature 204 remains Container scheduling/lifecycle. |
| 3 | Credential lifecycle | FIXED/PASS | Added control-token rotation, access-token refresh and owner-scoped Runner revocation routes; added route tests. |
| 4 | Revocation enforcement | FIXED/PASS | WSS handshake and credential rotation/refresh now check the registry node state before proceeding; revoked nodes cannot reconnect through those paths. |
| 5 | Tenant/user ownership | FIXED/PASS | Removed client-supplied `ownerUserId` from enrollment authority, propagated server-issued owner claims and blocked another owner from re-enrolling an existing Runner. |
| 6 | Device key validity | FIXED/PASS | Device binding now parses the public key cryptographically before issuing Runner credentials; malformed setup keys fail closed. |
| 7 | Persistence/concurrency | PASS | Drizzle repository remains tenant-scoped with snapshot revision locking; no new Runner-only Job ledger or scheduler was introduced. |
| 8 | Native runtime/discovery | PASS | Rust 32-test suite, release build, bounded discovery, device proof, WSS/HTTPS fallback and local `run/rescan` remain green. |
| 9 | UI/release boundary | PASS | Combined Feedback/Task Control and `/workers/connect` Runner form remain separate from Worker App; manual-only four-target workflow remains green. |
| 10 | Final convergence | PASS WITH EXPLICIT EXTERNAL GATES | Focused route/gateway suite passed 20 tests after fixes; Cloudflare target, real provider sessions, native signing/install and deployed browser evidence remain external gates. |

Fresh convergence result: no safe in-scope MUST_FIX or MUST_DO_NOW gap remains.
The remaining items are environment/provider acceptance gates and are recorded
as unverified rather than inferred from local tests.

## Fresh convergence audit — application startup and browser proof

This third 10-round pass was run after the cross-spec audit exposed an
application-startup failure during browser verification. The failure was fixed
at its import boundary and the affected runtime was reverified.

| Round | Lens | Result | Evidence/action |
|---:|---|---|---|
| 1 | Reproduction | FIXED/PASS | Playwright reproduced a deterministic ESM startup failure for `CONTENT_PROTECTION_FAILURE_CODES`. |
| 2 | Root cause | FIXED/PASS | Both content-protection constants were imported from `workerRuntime.ts` although they are owned by `contentProtectionWorker.ts`. |
| 3 | Boundary repair | FIXED/PASS | Moved the two constants to the owning shared module without changing Worker behavior. |
| 4 | Worker regression | PASS | Worker registry, Hermes version, Remotion event, content-protection and Worker runtime suites passed 103 tests. |
| 5 | Cross-feature contracts | PASS | Feature 195–205 focused web suite passed 128 tests with 2 intentional skips. |
| 6 | Browser startup | PASS | Web server started successfully under Playwright after the import correction. |
| 7 | Browser surfaces | PASS | Control Plane browser smoke passed 4/4 across mobile, tablet, desktop and the global Feedback entry. |
| 8 | Native Runner | PASS | Rust format check, 32 tests and release build passed. |
| 9 | Container boundary | PASS | Cloudflare runtime passed 23 tests and package check. |
| 10 | Final convergence | PASS WITH EXPLICIT EXTERNAL GATES | Static Runner audit 10/10 and cross-spec audit 10/10 passed; provider/session, signing/install and deployed target evidence remain external gates. |

Fresh result: the only newly discovered in-scope blocker was the shared-module
import mismatch, and it is fixed. The Playwright server emitted environment
warnings for missing test-session cookies and a pre-existing queue-health
backlog; neither caused a test failure or changed the implementation boundary.

## Release/update readiness closure — 10 rounds

This follow-up specifically rechecked the user-facing GitHub Actions build,
SmartAIHub-owned download catalog, version check/update command and native
cross-platform replacement path after the release-management changes.

| Round | Lens | Result | Evidence/action |
|---:|---|---|---|
| 1 | Workflow trigger | PASS | YAML and policy verifier confirm `workflow_dispatch` only; no push/PR build trigger. |
| 2 | Target matrix | PASS | Workflow declares Windows x86_64, macOS Intel, macOS arm64 and Linux x86_64 jobs. |
| 3 | Publish safety | PASS | `publish=true` is rejected unless `signing_mode=required-secret`; shared schema and workflow guard agree. |
| 4 | Catalog boundary | PASS | Normal users use same-origin catalog/download routes; GitHub repository/token remain server/admin-only. |
| 5 | Build import | PASS | Admin build record persists publish intent and sync refuses artifact-only runs. |
| 6 | Version check | PASS | Dashboard reads current/latest/last-checked data from the Runner catalog and connected-node projection. |
| 7 | Update authorization | PASS | Browser owner/admin checks, Runner audience/scope and device proof remain required for update polling/download/ack. |
| 8 | Update state machine | FIXED/PASS | Runner now acknowledges `verifying → replacing → restarting → completed` instead of skipping server-required phases. |
| 9 | Windows replacement | FIXED/PASS | Runner copies a sibling post-exit helper, releases the live image lock, confirms the new binary and rolls back on failed health confirmation. |
| 10 | Final convergence | PASS WITH EXPLICIT EXTERNAL GATES | Static audit is 10/10; real GitHub Actions artifacts, signing secrets, native installs and deployed storage/browser proof remain unverified. |

### Fresh local proof

- Rust: `cargo fmt --check` and 36 tests passed.
- Local Linux release build: `cargo build --manifest-path apps/runner-app/Cargo.toml --release` passed.
- Web release/update focused suite: 10 files, 56 tests passed.
- Workflow policy verifier, YAML parse, module import probe and `git diff --check` passed.
- Repository-wide TypeScript type-check was intentionally not run because of
  the project RAM constraint.
