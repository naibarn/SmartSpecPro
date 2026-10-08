# Moli Lightweight Browser Integration Audit

**Date:** 2026-10-08
**Canonical baseline inspected:** `origin/main` = `6f19b9a2b33872a53629919e3ed648ee064bae75`
**Decision:** Proceed to a bounded, optional integration experiment under Spec 208; do not enable in production or claim runtime integration.
**Normative owner:** Spec 208, Revision 6. Spec 213 is unchanged because Jev/System-One decision semantics are not being changed.

## 1. Repository baseline and authority

- Primary checkout was clean on `main`; `HEAD` and `origin/main` matched at the baseline SHA above.
- The worktree inventory contained many detached canonical build/verify worktrees and active `codex/*` worktrees. No path was edited outside Spec 208. This audit did not modify other worktrees.
- Repository registry lists IDs 208, 213, 224, 226, 267, 269, 271, 277, 279, 287, 288, and 293–295 as occupied. No new Spec ID is needed.
- Spec 208 is the owner for governed browser capability and engine routing. Spec 213 explicitly keeps the decision-provider boundary and is not a browser-engine owner. Spec 226 consumes Spec 208 and prohibits a second execution plane. Spec 036 is a live-browser interaction surface, not the engine authority. Spec 183 is a planned SmartAIHub website WebMCP producer, not a generic external browser-provider contract. Spec 031 is ambiguous due a registry alias collision and is not used as authority.
- Canonical handoff for Spec 208 currently records `DORMANT_UNRESOLVED` / `DISCOVERING`, 0 requirements passed and 342 unresolved; that status is not runtime proof. Existing source-declared “Ready for Implementation” wording does not supersede the handoff.

## 2. Existing implementation inventory

| Surface | Repository evidence | State and relevance |
|---|---|---|
| Browser execution | `apps/runner-app/src/adapters.rs` (`probe_browser_candidate`, browser execution, Chromium launch/CDP) | Implemented bounded Chromium fixture path using temporary profile and loopback CDP; not a general Moli provider. |
| Runner authorization | `apps/runner-app/src/protocol.rs`; `apps/runner-app/src/diagnostics.rs`; `apps/runner-app/README.md` | Browser capability requires tenant/session grant, manifest/version, authenticated readiness and cleanup. Fail-closed contracts exist. |
| Canonical job dispatch | `apps/web/server/services/computerUseFeature195Gateway.ts`; `computerUseRunnerJobExecutor.ts`; `apps/web/server/jobs/unifiedJobControlPlaneRuntime.ts`; `postgresNodeJobWorker.ts` | Existing `worker_jobs` plus outbox and attempt/fencing path is the execution authority. Reuse it. |
| Engine routing | `apps/web/server/services/computerUseCapabilityRouting.ts` | Current route families are structured, semantic, local Runner, and visual. No Moli provider or general browser engine registry/health route was found. |
| Playwright | package/lock references, E2E, Chromium rendering, and browser discovery cache | Installed/used for tests/rendering and executable discovery; does not prove a general-purpose app automation provider. |
| Jev/System-One | Spec 213 and existing provider boundary | Decision provider, not the browser runtime. An external Jev bridge must not bypass Spec 208 authorization/execution. |
| MCP/WebMCP | Spec 183 | Planned native-first SmartAIHub site producer; no general Moli WebMCP interoperability proof found. |
| Moli | targeted `rg` over `apps`, `packages`, `specs` | No runtime dependency, adapter, provider registration, or local Moli implementation found. |
| Selenium | targeted runtime search | No first-party Selenium runtime integration found. |

Relevant existing tests (identified, not run):

- `apps/runner-app/src/discovery.rs` inline tests for discovery/order/fail-closed behavior.
- `apps/runner-app/src/adapters.rs` inline tests for target settling, grants, expiry/revocation, probe readiness and cleanup.
- `apps/web/server/services/__tests__/computerUseCapabilityRouting.test.ts`, `computerUseFeature195Gateway.test.ts`, `computerUseRunnerJobExecutor.test.ts`, and `runnerJobCommandContracts.test.ts`.
- `apps/web/server/routes/__tests__/runnerControl.test.ts` covers trust/auth/session binding and credential exclusion.

### Cross-Spec impact matrix

| Spec | Relationship | Required action |
|---|---|---|
| 208 | Capability routing and governed Computer Use owner | Updated in this change; any runtime adapter must land here first. |
| 213 | Jev/System-One decision provider upgrade | No change unless the decision protocol changes; Jev remains a provider. |
| 224 | Development orchestration | None; not an execution queue or browser authority. |
| 226 | Device-independent capability consumer | Consume ordinary 208 capability; no new executor. |
| 267 | Durable control-plane migration | Preserve its authority only after registry/provisional-ID caution; no duplicate job state. |
| 269 | Primary assistant | May request authorized logical capability; no direct engine selection bypass. |
| 271 | UAT evidence platform | May later host acceptance runs; does not own browser provider. |
| 277 | Task-control UX | Project status only; no new user permission surface. |
| 279 | Command ingress/delegation | Requests logical capability through existing gateway. |
| 287 | UI governance | No visual-parity claim from Moli; Chromium remains visual conformance path. |
| 288 | Resource Fabric | Runtime placement/resource scheduling consumer; no competing budget ledger. |
| 293–295 | Git/workspace/deployment operations | No browser authority; deployment remains separately gated. |
| 036 | Live browser interaction surface | Keep takeover/visual live session on its compatible existing engine. |
| 183 | SmartAIHub site WebMCP producer | WebMCP remains unverified on Moli; do not infer support. |

## 3. Upstream Moli and Jev Browser Bridge fact matrix

Reviewed upstream repositories on 2026-10-08: [lexmount/moli](https://github.com/lexmount/moli), [Moli README](https://github.com/lexmount/moli/blob/main/README.md), [Moli releases](https://github.com/lexmount/moli/releases), and [lexmount/jev-browser-bridge](https://github.com/lexmount/jev-browser-bridge). These pages are mutable; pin exact source commit, release artifact digest, license bundle, and SBOM before implementation.

| Topic | Verified upstream statement | SmartAIHub conclusion / open verification |
|---|---|---|
| License | Moli README offers Apache-2.0 or MIT by default, with separately licensed components/fixtures and notices under `licenses/`; Jev Browser Bridge declares Apache-2.0. | No dependency/SBOM license audit was run. Audit every transitive/distributed license and notices against the pinned source before bundling. |
| Architecture | Moli says it is an independent Rust browser kernel, not Chromium; names libcurl, html5ever, rusty_v8/V8, Servo/Stylo, Taffy/Parley and CPU software rendering. | Rust is not evidence of lower memory for SmartAIHub's workload. Treat all performance as a test hypothesis. |
| JavaScript | README states V8 plus modules, timers, microtasks, events, iframes and workers. | API presence does not prove Chrome behavioral equivalence. Measure syntax/API and site completion per corpus; no universal compatibility claim. |
| DOM/CSS/layout | Native DOM, CSS cascade/computed style; on-demand layout. `--layout` enables geometry/hit test and coordinates. | Eligible for DOM-first work; require capability tests. Geometry may be stale between layout refreshes; do not use as visual proof. |
| CDP/WebDriver/BiDi | README says one endpoint supports CDP, WebDriver Classic and WebDriver BiDi; shows Playwright `connectOverCDP`. | Validate each required command/event against pinned versions. Playwright's documented connection is a starting point, not API parity. |
| WebMCP | README links a WebMCP playground with CLI listing/calling native site tools. | This does not establish browser protocol implementation or compatibility with Spec 183. Treat as unsupported pending conformance evidence. |
| Storage/cookies | README lists cookies, WebCrypto, profile-scoped localStorage, IndexedDB and OPFS; profile/cookie/cache options are mentioned. | Keep profiles per tenant/job/session; test persistence, deletion, encrypted material handling and crash cleanup. No cross-engine state migration. |
| Platform | README states Linux, macOS and Windows. | Require official artifact/platform matrix, architecture support, reproducible install, sandbox behavior and smoke test on each deployment target. |
| Screenshots | Software viewport/full-document screenshot and raster PDF documented with `--layout`; README says no Chrome pixel parity, high-fidelity Canvas/WebGL/media, or all Chrome screenshot/print modes. | No screenshot-based QA, canvas/WebGL-heavy, media fidelity, or visual acceptance route to Moli. Keep Chromium/Playwright. |
| Network/security | README exposes proxy, timeouts, connection/resource limits, private-network policy and diagnostics. | Options are not an enforced SmartAIHub security boundary. Enforce our egress policy outside the browser and verify DNS rebinding, redirect and address checks. |
| Isolation | README describes per-profile storage and kernel lifecycle. | No upstream claim substitutes for tenant isolation. Use one isolated process/profile per bounded session until measured and reviewed. |
| Maturity/release | GitHub shows active commits and releases; at audit, releases page listed v1.1.12 as latest, dated 2026-09-30. | Active project, but not enough to infer production stability. Pin release, assess changelog, open issues/security advisories, reproducibility, upgrade cadence and rollback. |
| Jev Browser Bridge | Apache-2.0 Python bridge accepts arbitrary CDP endpoints, includes Moli examples, and publishes MiniWoB++ 172-episode results. | Optional external decision/automation client only after code, dependencies, auth and data flow review. Its published scores are upstream claims and not SmartAIHub acceptance. |

Upstream performance claims are deliberately excluded from the decision gate. Any upstream-reported RSS, CPU, latency, WPT, or task completion result is neither independently verified here nor a SmartAIHub measurement.

## 4. Decision record

**Decision:** Conduct an opt-in evaluation of Moli for bounded DOM-first browser jobs. Do not adopt it as the default engine and do not send stateful live user sessions to it. Keep HTTP/API ahead of browser work; retain Chromium/Playwright for visual/compatibility workloads; retain existing Computer Use/Jev/Runner behavior according to current capability and policy.

**Rationale:** Moli's documented on-demand layout model and CDP endpoint are technically aligned with DOM-first agent work, and an upstream Jev bridge exists. SmartAIHub has no Moli integration today, no generic engine health/provider seam, and current browser execution is a constrained Chromium fixture route. The cost advantage, compatibility, and security posture for our workloads remain unproven. The decision is therefore “worth a controlled experiment,” not “worth production rollout now.”

### Routing and compatibility rules

1. Resolve an existing authorized HTTP/API/structured capability first when it meets the goal.
2. Select Moli only when the task is explicitly marked eligible, the provider is enabled for the tenant/environment, capability probe matches every required operation, resource admission passes, and the pinned adapter/runtime health is good.
3. Route visual QA, screenshot fidelity, canvas/WebGL/media, unsupported browser APIs, or compatibility-sensitive flows to Chromium/Playwright.
4. Use existing Computer Use/Runner/Jev target when its session, capability, and policy permit. A Jev decision does not grant browser authority.
5. Fallback is decided before session state is created, or after a failure only if no side effect/session state can be lost and policy explicitly permits a fresh session. No transparent cross-engine session migration.
6. Authorization/policy/tenant/origin denials never trigger a weaker fallback. Capability mismatch can route only to an allowlisted engine that independently satisfies authorization.

Retries use the canonical job attempt/retry policy and idempotency classification. Network/provider health errors may retry bounded read-only work. A possibly committed form submit is reconciled, not replayed. Circuit breaking is provider-version scoped, with recovery probes that do not execute user tasks.

## 5. Benchmark plan (80 paired cases)

Run the same versioned task/corpus on Moli and current Chromium/Playwright; use independent expected outcomes and blind scoring where practical. Include 80 cases:

- 20 static/multi-page extraction tasks: structured fields, long pages, tables, pagination, Unicode, frames.
- 20 JavaScript application tasks: hydration, SPA navigation, event handlers, delayed content, modules/workers, API-backed state.
- 20 form tasks: text/select/check boxes, validation errors, multi-step flow, file upload/download with fixtures, duplicate labels; no real purchases or external irreversible actions.
- 10 protocol/capability tasks: supported and intentionally unsupported CDP/WebDriver commands, iframe/target lifecycle, popup, network error, cancellation.
- 10 security/isolation tasks: tenant/profile boundary, cookie/secret redaction, disallowed private/loopback/metadata destinations, redirects, DNS change/rebinding simulation, prompt-injection page content.

Record per case: corpus/case hash; engine/runtime/adapter/OS/architecture; task and expected result; capability snapshot; auth/policy fixture; attempt; task completion and correctness rubric; extraction precision/recall/field accuracy; JS compatibility result; form side-effect receipt; median/P95 latency; peak RSS per session and per successful task; CPU; crash/timeout; retries/fallback reason; cleanup; and cost per successful task. Preserve screenshots only for authorized test fixtures; never log cookies, credential values, raw authorization headers or production personal data.

Run concurrency at 1, 5, 10, 25, 50 and 100 sessions against each admitted engine. Establish a host/container memory and CPU budget before each step. Stop admission before 80% of the configured memory limit or when CPU/latency safety thresholds are crossed; do not intentionally induce OOM. Report reached/skipped steps with resource observations. Repeat each admitted concurrency point at least three times after warmup; report median and P95, not just best case.

### Go / No-Go / rollback

All gates in Revision 6 apply. Additionally:

- Go only if the lower 95% confidence bound for eligible task completion is within 3 percentage points of Chromium; if fewer than 80 cases are applicable, document the denominator and block the gate.
- Extraction field accuracy is at least 98%; form correctness at least 95% for eligible fixture forms; no unauthorized form side effects.
- At concurrency 10 and above (only where both engines are admitted), median and P95 peak RSS per successful task are each at least 30% below Chromium. If Moli is not lower, resource-reduction objective is not met.
- Protocol and platform required for the intended deployment are 100% green for declared supported operations; unsupported operations fail explicitly.
- Security gates: zero cross-tenant/profile/session leakage; zero secret disclosure; zero unapproved private-network fetch; 100% cleanup; no stateful session migration.
- Any critical security leak, wrong-tenant event, unapproved egress, repeated unknown submit outcome, cleanup failure, crash/timeout above threshold, task completion below threshold, or RSS gate failure means No-Go. Disable Moli for new work, preserve job receipts, and use prior compatible route for new sessions. Do not copy cookies or resume an active session on another engine.

## 6. Implementation phases

| Phase | Deliverable | Exit predicate |
|---|---|---|
| 0. Source/license | Pin Moli source/release, artifact hashes, transitive license/SBOM, platform support and security review | Approved pinned build and documented notices; no unresolved high security or license issue. |
| 1. Adapter contract | Add default-off Moli capability adapter and explicit feature/capability probes, using existing Runner and worker control plane | Contract tests prove auth, allowlisted origin/egress, isolation, fail-closed mismatch, receipts and cleanup. |
| 2. Conformance | Run focused protocol, JS, DOM, storage, cancellation, form and unsupported-command tests | Supported matrix is accurate; unsupported calls fail visibly. |
| 3. Paired benchmark | Execute the 80-case paired corpus and safe concurrency levels | All quantitative/security gates in §5 pass on one pinned revision. |
| 4. Canary | Tenant/environment allowlist, default disabled, non-sensitive task cohort and monitored rollback | Full observation window meets gates with no incident; authorize next cohort through existing controls. |
| 5. Expansion | Gradual cohort growth while tracking exact runtime version and receipts | Maintain thresholds; automatically disable new Moli selection when circuit/quality gates trip. |

Each phase remains a separate implementation/verification/deployment obligation. Spec revision and audit do not mean any phase has been implemented.

## 7. Ten-pass QA review

Each pass checked the proposed contract against the repository evidence and upstream sources. These are documented architecture/spec reviews, not executed tests.

1. **Architecture consistency — PASS.** Spec 208 already owns capability routing; no new Spec, queue, planner or permission system added.
2. **Cross-Spec dependencies — PASS.** 213 decision provider, 226 consumer, 195 job authority, 197 execution boundary, 183 WebMCP producer and 287 UI conformance boundaries are preserved.
3. **Existing implementation compatibility — PASS.** Proposal matches Runner/CDP boundary while clearly separating the current fixture-only Chromium implementation from proposed Moli adapter.
4. **Security isolation — PASS.** Default off, private CDP endpoint, egress filtering, destination revalidation, secrets redaction, isolated profiles, process cleanup and negative tests are specified.
5. **Auth / tenant boundaries — PASS.** Existing grant and policy must authorize each attempt; provider selection cannot widen authorization and denial cannot fall back.
6. **Browser protocol compatibility — PASS.** CDP, WebDriver Classic/BiDi are capability-probed; Playwright connection does not imply parity; WebMCP remains unverified; unsupported paths fail visibly.
7. **Session and data integrity — PASS.** No silent cookie/storage migration; non-idempotent ambiguous submits reconcile or return unknown, not replay.
8. **Runtime resource controls — PASS.** Per-session budget and concurrency admission, safe stop conditions, CPU/RSS metrics, cancellation, cleanup and resource-blocked classification are included.
9. **Failure recovery / rollback — PASS.** Version-scoped circuit breaker, allowlisted fallback for fresh sessions, canary disable, preserve receipts, and no stateful migration are specified.
10. **Testability / acceptance completeness — PASS.** 80 paired cases, 1/5/10/25/50/100 concurrency, metrics, thresholds, Go/No-Go, rollback and required evidence are specified.

## 8. Open risks and required next work

- No source-level Moli or Jev Browser Bridge license/SBOM/transitive dependency review was performed.
- No protocol conformance test, security test, SmartAIHub benchmark, load test, app test, or browser UAT was run for Moli.
- Moli's API behavior, release artifact provenance and lifecycle stability must be pinned and independently verified before implementation.
- The existing Runner path's deployment authorization and network egress guarantees need a dedicated security review when the Moli adapter implementation is proposed.
- Current canonical Spec 208 handoff has unresolved authority/relevance and 342 open requirements; this audit does not resolve the broader reconciliation backlog.
- Implementation and production rollout remain unapproved by evidence until the specified phases pass. Moli is not enabled and no job was replayed.

**Next action:** reconcile Spec 208's canonical handoff against Revision 6; then create the implementation WorkUnit for Phase 0 with an owner and source-pinned acceptance artifacts. Do not begin runtime implementation before the license/provenance and security boundary checks are recorded.
