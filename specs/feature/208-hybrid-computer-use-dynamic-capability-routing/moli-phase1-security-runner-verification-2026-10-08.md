# SPEC-208 Moli Phase 1 Security and Runner Verification — 2026-10-08

## Decision

**Partial implementation; production No-Go.** Canonical baseline inspected: `6f16fdcb75b075f35b638d31fbc42d02a1a8bf08`. Work is isolated on `codex/spec208-moli-phase1-20261008`. Moli remains disabled for production and Chromium remains the only production engine. The adapter changes and tests are experimental; no live Runner vertical slice or canonical integration was completed.

## Isolation finding and changes

Phase 0 observed that WebDriver Classic sessions on one Moli server shared `localStorage`. That is a confirmed failure of WebDriver session isolation. Phase 1 keeps the adapter CDP-only and does not add a WebDriver session mapping or dispatch path. A separate process or profile is not considered proof that WebDriver state partitions all requested storage surfaces. Any future WebDriver integration must remain disabled unless a Runner-owned design proves isolation across tenants, users, projects, job attempts, and every storage surface.

The adapter binds each attempt to job, attempt, tenant, user, project, lease, fencing token, deadline, session, authorization grant, and capability snapshot revision. It revalidates the active attempt before browser commands and bounds CDP commands by the job deadline. Production mode rejects Moli unconditionally, including when rollout flags are misconfigured. Cleanup errors are audited and returned as failures rather than silently swallowed.

The live CDP tests used separate BrowserContexts and checked cookies, `localStorage`, `sessionStorage`, IndexedDB, CacheStorage, service-worker state, and an authentication-token value. The optional process test started two actual pinned Moli processes with distinct profile directories and checked `localStorage` isolation. Tests also covered invalid sessions, cancellation cleanup, revoked permission, authorization rejection, deadline validation, failed BrowserContext disposal, and cleanup callback failure. These tests establish the tested CDP boundary only; they do not prove Runner-owned tenant/project isolation or durable profile deletion.

## Runner integration audit

The Runner source is in this repository under `apps/runner-app`; the Phase 0 evidence statement that the paired Runner was outside the checkout is incorrect. The web computer-use executor still constrains browser jobs to Chromium. Moli selection is not called by that executor, and the CDP adapter is not wired to `worker_jobs`, outbox dispatch, Runner lease/fencing authority, capability registry, policy service, audit receipts, resource budget, or production observability.

The existing Runner browser command path does not currently provide the complete cancellation/cleanup contract needed here: browser execution is synchronous in the command loop, the cancellation branch does not accept `computer_use.browser`, and there is no verified Moli process/profile lifecycle. Adapter callbacks remain test doubles and do not establish a real policy or cleanup receipt. There is also no demonstrated destination-policy enforcement at connection time for redirects, DNS/IP changes, or metadata/private addresses. Wiring the adapter now would create an unsafe parallel authority boundary. The minimum vertical slice is therefore **not implemented**.

## OSV advisory disposition

The pinned v1.1.15 lockfile report contains 11 records representing 7 distinct issues. Aliased OSV/GHSA/RustSec identifiers are grouped below. Cargo metadata places each package in the normal/build graph, but exact platform feature activation and exploit preconditions were not established for this shipped binary. No local dependency override or advisory suppression was added: Moli is a separately built upstream executable, and an unverified local lockfile edit would not remediate the binary already pinned.

| Advisory record(s) | Package/path | Severity and exploitability | Reachability and disposition |
| --- | --- | --- | --- |
| `RUSTSEC-2026-0204` | `crossbeam-epoch 0.9.18`; renderer/Stylo → Rayon graph | Severity not assigned by record; invalid pointer dereference in pointer formatting. Specific formatting call reachability is unproven. | Present in metadata dependency graph; fixed upstream at `>=0.9.20`. No verified Moli release containing the fix. Residual: unresolved. |
| `RUSTSEC-2024-0436` | `paste 1.0.15`; V8 proc-macro build graph | Informational/unmaintained; not a vulnerability exploit. Maintenance and future-fix risk. | Build-time graph only; not a runtime attack path. No replacement/removal established. Residual: maintenance risk. |
| `GHSA-cq8v-f236-94qc`, `RUSTSEC-2026-0097` | `rand 0.9.2` | Unsound RNG use requires a specific logger/reseed/thread RNG interaction and entropy/log conditions. Exploitability in Moli is unproven. | Present in metadata graph; fixed upstream at `>=0.9.3`. Exact enabled features/call paths and fixed release provenance unresolved. |
| `GHSA-2mjx-qc3c-rqvc`, `RUSTSEC-2026-0285` | `rustls 0.23.38`; TLS/WebSocket dependencies | Medium, CVSS 5.3; TLS 1.3 handshake encryption-level validation flaw. Requires affected TLS path. | TLS is used by dependency paths; whether this deployment exposes the affected outbound/server path is unverified. Fixed upstream at `>=0.23.45`; artifact not remediated. |
| `GHSA-82j2-j2ch-gfr8`, `RUSTSEC-2026-0104` | `rustls-webpki 0.103.12`; rustls graph | High, CVSS 7.5; malformed CRL can panic before signature validation. Upstream notes applications not using CRLs are unaffected. | CRL usage in the pinned binary is unverified. Fixed upstream at `>=0.103.13`; artifact not remediated. |
| `GHSA-97wc-2hqc-cjgr` | `smallbitvec 2.6.0`; renderer/Stylo graph | High, CVSS 7.3; capacity overflow can cause heap overflow through safe APIs. A malicious page reaching affected operations is plausible but unproven. | Present in metadata graph; fixed upstream at `>=2.6.1`; artifact not remediated. High residual risk. |
| `GHSA-xphw-cqx3-667j`, `RUSTSEC-2026-0103` | `thin-vec 0.2.14`; DOM graph | High, CVSS 7.3; panic during drop may cause use-after-free/double-free. Trigger path from untrusted page is unproven. | Present in metadata graph; fixed upstream at `>=0.2.16`; artifact not remediated. High residual risk. |

Primary advisory references: [crossbeam](https://osv.dev/vulnerability/RUSTSEC-2026-0204), [paste](https://osv.dev/vulnerability/RUSTSEC-2024-0436), [rand](https://osv.dev/vulnerability/RUSTSEC-2026-0097), [rustls](https://osv.dev/vulnerability/RUSTSEC-2026-0285), [rustls-webpki](https://osv.dev/vulnerability/RUSTSEC-2026-0104), [smallbitvec](https://github.com/servo/smallbitvec/security/advisories/GHSA-97wc-2hqc-cjgr), [thin-vec](https://rustsec.org/advisories/RUSTSEC-2026-0103.html).

## Provenance, SBOM, and license status

Phase 0 pins the upstream v1.1.15 tag commit and records SHA-256 digests for the source archive, Linux release archive, extracted executable, and Cargo.lock in `moli-phase0-prototype-2026-10-08.md`. The executable used by the Phase 1 process test matched the recorded digest and reported `moli 1.1.15`. The tag is immutable by commit identity, but no publisher signature or authenticated checksum/attestation was verified; local hashes establish artifact identity, not publisher authenticity.

The CycloneDX report covers 626 components and 438 dependency relationships from the normal/build graph. The license inventory has 626 entries; three local workspace crates omit explicit license metadata. A full source-tree notice bundle review and legal compatibility assessment are incomplete. These are outstanding supply-chain gates, not accepted exceptions.

## Executed verification

From `apps/web`, the following focused command passed with the pinned Moli loopback endpoint and binary configured:

```text
pnpm exec vitest run server/services/__tests__/moliBrowserEngine.test.ts server/services/__tests__/moliCdpBrowserAdapter.test.ts server/services/__tests__/computerUseRunnerJobExecutor.test.ts --reporter=dot
Result: 3 files passed, 19 tests passed.
```

This includes mocked policy callbacks plus live local Moli CDP/process tests. It is not a Runner integration test. `git diff --check` passed on the current worktree before documentation changes. Typecheck and Runner/browser end-to-end tests were not run. The web package typecheck script requests an 8 GiB Node heap; host admission showed only 13 GiB available while several unrelated Python/Node workloads were active, so the check was resource-deferred to avoid competing with shared workloads. A prior misrouted package test command started the broad web suite and reported unrelated existing failures/timeouts; those results are not counted as Phase 1 tests and were not retried.

## Benchmark suite

`evidence/moli-phase1-80-case-suite.json` contains 80 case definitions across 10 categories. Every case is marked `NOT_RUN`; suite status is `IMPLEMENTED_NOT_EXECUTED`. No latency, RSS, accuracy, or throughput result is claimed.

## Ten QA review passes

| Pass | Review focus and evidence | Gap/fix or result |
| --- | --- | --- |
| 1 | Canonical baseline, Spec revision, worktree/branch ownership and existing Phase 0 artifacts. | Confirmed exact baseline and separate worktree; no other worktree was modified. |
| 2 | WebDriver Classic session-storage behavior in Phase 0 smoke evidence and adapter protocol surface. | Confirmed shared storage failure; kept Phase 1 adapter CDP-only and WebDriver undispatched. |
| 3 | BrowserContext storage partitioning for cookies/local/session storage, IndexedDB, CacheStorage, service worker, and auth token. | Added/ran live two-context assertions; passed. Does not imply user/project Runner integration. |
| 4 | Independent process/profile isolation using pinned Moli executable. | Added/ran two-process test with distinct profiles; `localStorage` remained isolated. Other requested storage values tested at CDP BrowserContext level. |
| 5 | Attempt identity and authorization freshness across user/project/job/lease/fence/deadline. | Added required identity fields and per-command active-attempt callback/deadline checks; live Runner implementation remains absent from the adapter. |
| 6 | Cancellation, invalid session, revoked permission, timeout/deadline, and cleanup failure paths. | Tests cover session close with cancellation reason, invalid use after close, a mocked revoked/expired attempt, invalid deadline, and failed context disposal/profile cleanup. A CDP command timeout, browser crash, expired live lease during dispatch, and real Runner cancellation were not exercised. |
| 7 | Engine selection and misconfigured production flags. | Added production hard-pin test; Chromium selected even if Moli flags are true. |
| 8 | Real Runner ownership and end-to-end control path. | Found Runner source in this repository and corrected Phase 0 claim; identified browser cancellation, lease/policy and cleanup wiring gaps. No unsafe integration attempted. |
| 9 | All 11 OSV records, alias grouping, path, conditions, fix versions, reachability and artifact remediation. | Grouped into 7 issues; no suppression or speculative local override; all unresolved artifact issues remain production blockers. |
| 10 | Provenance/license completeness, benchmark claims, diff hygiene, test evidence and handoff accuracy. | Digests matched local executable; publisher authenticity and legal notice review remain open. 80 cases are explicitly NOT_RUN. No merge or production readiness claim. |

## Remaining blockers and next phase

1. Integrate Moli inside the existing Runner/job control plane only after browser command cancellation, fencing/deadline checks, connection-time destination enforcement, resource budgets, and durable cleanup receipts can be implemented and tested end to end.
2. Keep WebDriver disabled unless a complete cross-tenant/user/project/attempt isolation test proves the selected server/process/profile design for all browser storage. Do not infer this from process isolation alone.
3. Obtain a trusted upstream artifact/release with fixes for applicable advisories; verify signatures/provenance, rerun the target-aware security scan, and complete third-party license/notice review.
4. Run scoped typecheck and Runner/browser integration tests on admitted capacity. Execute the 80-case benchmark only after isolation/security prerequisites pass.
5. Keep Chromium as default production engine and Moli disabled until all SPEC-208 security and acceptance gates pass.
