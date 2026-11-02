# R1.3 Architecture Decision — Computer Use, Browser Providers and Cloudflare Clef

> **Current profile note (R1.5, 2026-11-02):** The `smartaihub.app` bootstrap role below is historical and optional when a specific path is proven; it is not a prerequisite for the independent new platform. R1.5 Runner identity, boot-service, reconnect and UI-session boundaries are defined by SPEC-325 and the linked Runner ADRs. SPEC-208 remains the canonical Computer Use policy owner.

**Status:** Proposed additive implementation profile; **date:** 2026-11-01.
**Applies to:** SPEC-208 (canonical frozen Computer Use ownership), SPEC-318, 319, 324, 208/197/224/207/256/295.
**Production domain:** `smartsihub.com`; **Debian new-platform UAT:** `aimarkethubs.com`; **bootstrap command UI:** `smartaihub.app`.

## Decision

1. **No duplicate authority.** SPEC-208 remains the canonical Hybrid Computer Use / dynamic capability routing design, SPEC-197/Runner executes local OS/GUI actions, SPEC-224 owns existing development orchestration, SPEC-318 reuses canonical `worker_jobs`, SPEC-207 owns credit and spending authorization, SPEC-256 owns capability discovery. R1.3 is an implementation profile; it does not rewrite frozen SPEC-208 or introduce another job/permission/ledger source.
2. **Two distinct concepts:** Computer Use (act on browser/desktop environments) and Cloudflare **Clef** (multimodal **decision model**, not a browser, not a computer controller, not a durable scheduler). Clef may rank eligible actions/providers. It must never grant a capability that deterministic authorization has denied.
3. **Headless-first** for requests where user only wants final result; persist the job and artifacts, not a guaranteed live browser session. UI sessions may terminate while remote execution continues.
4. **Provider-neutral routes:** direct API/MCP/WebMCP where authorized and sufficient; Moli on isolated native Debian/Runner only after explicit conformance and tenant-isolation tests; Cloudflare Kitesurf for eligible stateless tasks; Chromium/Playwright on Debian/Cloudflare Browser Run for compatibility, stateful sessions, visual QA and human handoff; Windows/Linux Runner for real desktop computer use. Normal web pages cannot inject OS inputs.
5. **Clef integration:** use rule-based deterministic routing first. When alternatives remain, use optional `@cf/cloudflare/clef-flash` on Workers AI for fast typed selection, with `@cf/cloudflare/clef` for harder bounded questions and optional `clef-omni` for genuinely multimodal decisions. Make provider optional, rate/budget limited and feature flagged. Current hosted Clef-flash context is 24K, not the original 64K. Do not add Clef to every request just because it exists.
6. **Visual user experience:** Inline Chat shows progress/outcome and only essential evidence; User may open Artifact Panel/Browser Panel to inspect. Expensive live browser view is on demand. User may open the verified target URL in their familiar browser; it does not automatically transfer logged-in session/cookies.
7. **Work never silently disappears:** canonical admission before dispatch, transactional outbox, idempotency, lease/fencing, checkpoint/reconciliation, terminal receipts and manual resolution for ambiguous external side effects. A `browserSessionId` is disposable, `jobId` is durable.

## Placement and fallback matrix

| Route | Runtime | Default usage | Important exclusions |
|---|---|---|---|
| Direct structured API / MCP | Cloudflare Hono or authorized third-party endpoints | Prefer whenever available | No bypass of spending/auth action API |
| Browser WebMCP | Browser Run Chrome Lab, Kitesurf only where capability tested | Explicit structured browser-site actions | Browser-only, not headless server universal API; validate origin/effect in Core |
| Moli | Native isolated Rust process on Debian/Runner | Benchmarked read/DOM tasks only; enable per workload/tenant after SPEC-208 issues resolved | Not production default; no assumption of full Chrome parity or secure WebDriver isolation |
| Kitesurf | Cloudflare Browser Run stateless beta | Short headless extraction/DOM tasks | No persistent session/live view/human handoff; limited WebMCP permissions/origin filtering and iframes |
| Chromium / Playwright | Debian or Cloudflare Browser Run | Compatible first pilot; auth/UI testing; complex browser workflows; handoff | Extra CPU/memory/browser time; don't hold idle indefinitely |
| Native desktop computer use | Existing Windows/Linux Runner | OS dialogs, installed apps, keyboard/mouse, documents, GUI automation | Explicit device grants; requires trusted online executor; browser API not enough |
| Isolated cloud desktop | Separately provisioned GUI-compatible container/VM if justified | Optional future full desktop operation | Cloudflare Sandbox SDK built-in desktop was removed in v0.10.2; no assumption it exists |

## Routing contract

- Resolve user/tenant, actual goal, capability, workspace, server/device, budget and authorization **first**.
- Compute a deterministic eligible list from available provider capabilities, data location, host/device availability, allowed origin, effects, price, and time budget. If none, show one actionable status; never invent a device or silently send to unapproved provider.
- For unambiguous tasks select a known route without a model call. For ambiguous, non-privileged choices ask Clef-flash typed questions (`choice`, `noul` or `score`), constrained to already-eligible route IDs; include safe bounded state only. Persist model version, prompt/schema version, confidence/probabilities and route selection receipt but not secrets/HTML containing credentials.
- Calibrate thresholds on SmartSIHub-specific evals; thresholds are configurable, not arbitrary production promises. Invalid/low-confidence responses choose a deterministic safe route or route to reasoning model/human, not auto-deny all work.
- Reevaluate capabilities after a navigation or failure. Fallback is **per step** but cannot escape policy, financial budget, user grant or hostname bounds. Moving between stateful browser engines requires a fresh authorized session and independent authentication; never copy cookies by default.
- Browser/GUI tools can propose actions but only existing Executor and server-side Action contracts perform them. User approvals must be scoped and durable per goal, not endless global gates. Financial, public-publishing, permission escalation, external sending and destructive actions get only their actual narrow high-impact confirmation, not a blanket development block.
- Every action records source job/attempt, provider, allowed effect, run/cost refs, evidence and actual completion. For third-party non-idempotent actions after timeout, reconcile externally or mark `OUTCOME_UNKNOWN`; do not blindly replay.

## Technical proof / UAT slices (not global release gates)

**CU-1 (P2 Chat):** authenticated `smartaihub.app` goal starts one headless research run, durable `worker_jobs` survives user closing the browser; final summary and citations appear on new Chat at `aimarkethubs.com` once connected. Use direct fetch/Chromium route first; Moli/Kitesurf compare later.

**CU-2 (P3 Creator):** new Mini App preview on `aimarkethubs.com` is tested via Chromium/Playwright and stores screenshot/test results in Artifact Panel; the user can open the URL in local Chrome without sharing cloud cookies.

**CU-3 (P4 Autonomous):** Runner on Windows/Linux opens an approved desktop application, performs a bounded non-destructive operation and returns evidence; a device going offline marks WAITING_FOR_EXECUTOR (not a fictitious Cloud GUI success).

**CU-4 (Pilot Clef):** shadow-evaluate Clef-flash versus deterministic router on a labeled 100+ task sample (API/DOM/visual/OS and easy/hard). Report selection accuracy, latency p50/p95, false escalation, cost per successful run, optional model-disable fallback. No forced Clef model gate for P1 Core/Chat UAT.

**CU-5 (Fault):** simulate 1) lost Queue ACK, 2) browser crash, 3) Runner disconnect, 4) canceled goal, 5) unauthorized cross-tenant browser profile, 6) unknown external purchase outcome. Prove no duplicate charge and no unauthorized replay. The failing provider path may be held without blocking independent UI/Chat rollout.

**CU-6 (Moli/Kitesurf):** compare accuracy/compatibility, RSS/CPU, p95 latency and cost against Chromium on eligible corpus. Honor SPEC-208 R9 findings: production Moli not already qualified; Kitesurf no session persistence or human handoff. Stop only the unsafe provider path if failed.

## References verified on 2026-11-01

- SPEC-208 existing canonical source: `naibarn/SmartSpecPro/specs/feature/208-hybrid-computer-use-dynamic-capability-routing/spec.md` (Revision 9, Clef-first; Moli not production integrated)
- https://developers.cloudflare.com/changelog/post/2026-10-01-clef-workers-ai/
- https://developers.cloudflare.com/changelog/post/2026-10-09-clef-omni-workers-ai/
- https://developers.cloudflare.com/workers-ai/models/clef/
- https://developers.cloudflare.com/browser-run/
- https://developers.cloudflare.com/browser-run/kitesurf/
- https://developers.cloudflare.com/browser-run/features/webmcp/
- https://developers.cloudflare.com/changelog/product/sandbox/
- https://github.com/lexmount/moli

## R1.5 — Runner device identity and session boundary (2026-11-02)

Windows/Linux Computer Use remains an on-demand workload-specific Executor behind existing SPEC-208 policy. The enrolled OS-boot Core Connector is a distinct minimal presence service, not a persistent executor or Cloud Agent authority. It reconnects with device-key proof and a current bounded grant. GUI actions require a valid interactive session and never borrow personal browser cookies. Offline or locked-device work reports WAITING_FOR_EXECUTOR or WAITING_FOR_INTERACTIVE_SESSION. See the [Secure Runner Connection and Device Trust ADR](SECURE-RUNNER-CONNECTION-AND-DEVICE-TRUST-ADR.md) and [SPEC-325](../../specs/feature/325-smartaihub-zero-trust-always-on-agent-security/spec.md).
