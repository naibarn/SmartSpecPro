# SmartSIHub Assistant UI Completeness Audit

**Run date:** 2026-11-15 (Asia/Bangkok)
**Scope:** SPEC-312 R1.18 assistant-ui Chat Shell, all eight audit areas.
**DEV target:** `https://aimarkethubs.com/chat` / `modular-debian-dev`.
**Platform audited and deployed:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b` (integrated `origin/main` and released to the authorized modular Debian DEV target).
**SPEC checkout:** SmartSpecPro `07542eeba2ce72f4c76012ad33931e0f9c687606` before this report is integrated.
**Overall recommendation:** keep R1.18 and parent SPEC-312 open. Basic queued Chat path and presentation foundation exist, but the full eight-area assistant-ui integration is not accepted: authenticated browser UAT is unavailable and multiple target features lack canonical Core contracts.

## Executive summary

The Chat module is not a mock-only shell: it calls authenticated same-origin Hono routes, maps Core conversation/message IDs through `@assistant-ui/react` External Store, uploads attachments via Core, submits idempotent turns through `worker_jobs`/outbox/Cloudflare Queue, polls canonical job status and hydrates saved messages. The exact-source `ad04c24` release receipt proves module and service health for that SHA.

The implementation is still incomplete against the requested assistant-ui scope. Core has no persisted event stream (provider call uses `stream: false`), no Chat read model for Agent/Harness/Run/Attempt/Machine/Executor, and no artifact capability (false in Core; Worker routes return 503). Task Control and Mission Control navigation are placeholders. Inspector facts are limited to currently available conversation/workspace/model/message information. Authenticated live send/attachment/history/reconnect and viewport screenshots remain unverified because browser-control access is unavailable. Safe basic Markdown rendering is included in deployed source SHA `ad04c24`; scoped package checks pass.

## Eight-area completion matrix

| Area | Status | Evidence | Remaining gap | Corrective action |
|---|---|---|---|---|
| 1. Architecture Audit | PARTIAL | `implementation/ARCHITECTURE_AUDIT.md` maps as-is/to-be, ownership, routes, job lifecycle, decisions and rollback | Architecture is documented, but target Agent/Run/Event/Artifact contracts are not implemented | Keep Core as authority; version missing contracts before expanding UI |
| 2. SPEC | PARTIAL | `spec.md`, this matrix, architecture audit, existing handoff/evidence | Several requested requirements remain designed-only; source/deployed SHA distinction must be updated after integration | Keep R1.18 open; reconcile final platform SHA, tests, release receipt and blockers in handoff |
| 3. Chat UI | PARTIAL | `ChatWorkspace.tsx`, composer, model selector, conversation list, responsive panel CSS and attachment gallery; focused UI tests | Desktop/tablet/mobile visual UAT unverified; tool-call UI unavailable | Run authenticated screenshots at 1440×900, 820×1180, 390×844 in supported browser; verify controls/keyboard/overflow |
| 4. Runtime Adapter | PARTIAL | `useChatAssistantRuntime.ts`, Core-proxied API, worker job submission/status polling, idempotency and history hydration; unit/contract tests | No real token stream/event cursor or authenticated reconnect proof; no Agent/Run mapping | Add versioned persisted Core events and scope/identity DTOs before adapter extension; run authenticated UAT |
| 5. Thread Inspector | PARTIAL | `ConversationInspector` displays canonical available conversation ID/title, workspace, selected/resolved model, message count, timestamp, send state | No Project/Session/Agent/Harness/Run/Attempt/Machine/Executor/event/artifact canonical read model | Build authorized Core read projection; until then keep unavailable fields absent and verify existing facts on thread switches |
| 6. Inline Artifacts | MISSING | `ArtifactPanel.tsx` is a renderer; Core explicitly reports `artifacts:false`, Chat Worker endpoints return 503 | No artifact service contract, real references, typed viewers/download/expiry/access control | Implement owner-scoped artifact API and safe media renderers/sandbox, then add API + access tests |
| 7. Task Control Integration | MISSING | Existing Chat links are placeholders; cross-SPEC Task Control contract exists elsewhere | No Chat-to-task canonical Thread/Run relationship or return navigation | Add scoped Core/Task Control contract and integration tests; do not create another task DB |
| 8. Mission Control Integration | MISSING | SPEC-294 Mission Control exists independently | No Chat-to-Mission shared run links/events/artifacts/resume contract | Add a read/link contract owned by canonical Mission Control and tests for round-trip/reconnect |

## Architecture and contract findings

See [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) for full current/proposed architecture, component dependency map, ownership, lifecycle, decision matrix and migration/rollback. Core and worker-job contracts remain authoritative; this audit does not introduce a parallel thread, scheduler, mission store, credit ledger or direct provider path.

Notable source facts:

- Chat module package pins `@assistant-ui/react` at `0.15.36`; `useChatAssistantRuntime.ts` adapts the canonical conversation/messages and delegates send to the existing API.
- Chat Hono Worker proxies session, capabilities, enabled models, conversations/messages, attachments and turn submission/status to Core.
- Core turn route persists job/outbox work; `chatQueueRuntime.ts` invokes providers with `stream: false`; the browser polls status. “Waiting” is not streaming.
- Core capabilities report `artifacts: false`; Chat Worker artifact routes return `503 chat_data_unavailable`. The present `ArtifactPanel` has only a component-level fixture test.
- Task Control and Mission Control placeholders are not integrations. Do not assign fabricated Agent/Run/Executor facts.
- Local audit work adds safe basic Markdown headings/emphasis/inline and fenced code/lists/link allowlisting; raw HTML remains text. This is a subset, not full CommonMark/GFM; it is deployed at source SHA `ad04c24`.

## Specification reconciliation

SPEC-312 R1.18 remains subordinate to SPEC-224 execution evidence, SPEC-294 Mission Control, SPEC-310 Harness, SPEC-313 identity/entitlements, SPEC-318 durable jobs, SPEC-319 UI design and SPEC-325 security. This audit makes the intended/as-built split explicit and preserves the current rules: queue-only LLM dispatch, no unsupported streaming claims, capability-gated Agent/Run/Artifact surfaces, same-origin auth and no parallel persistence authority. The change does not close parent SPEC-312.

Deployment mapping is verified from `apps/web/scripts/deployment-targets.json`: `aimarkethubs.com` is `modular-debian-dev` on Debian + local Workerd; `smartaihub.app` remains legacy Debian; `smartsihub.com` is future Cloudflare production and not activated. The exact-source `ad04c24` receipt covers both the Markdown patch and corrected module authority metadata; receipt proves deployment health, not authenticated user behavior.

## Files changed for this audit

Platform source (focused checks passed, integrated and deployed):

- `modules/chat/src/ui/MarkdownContent.tsx`
- `modules/chat/src/ui/MessageTimeline.tsx`
- `modules/chat/src/ui/styles.css`
- `modules/chat/src/ui/workspace.test.tsx`
- `modules/chat/module.manifest.json`
- `modules/chat/src/moduleManifest.test.ts`

SmartSpecPro amendment (audit and handoff):

- `implementation/ARCHITECTURE_AUDIT.md`
- `implementation/IMPLEMENTATION_TRACEABILITY.md`
- `implementation/ASSISTANT_UI_COMPLETENESS_AUDIT.md`
- `implementation/HANDOFF.md`
- `implementation/evidence/modular-debian-dev-release-ad04c24.md`
- `implementation/evidence/chat-manifest-authority-checks-20261115.md`
- `spec.md`
- `apps/web/scripts/deployment-targets.json` (release controller receipt pointer)

## Test and deployment evidence

The Markdown UI checks and unchanged Core auth/queue checks are documented in [chat-shell-audit-checks-20261115.md](evidence/chat-shell-audit-checks-20261115.md): Chat UI 42/42 and Core auth/queue 39/39 across three discovered files at the earlier source. The follow-up [manifest authority checks](evidence/chat-manifest-authority-checks-20261115.md) passed Chat 43/43, package typecheck, and Vite + Wrangler dry-runs at deployed source `ad04c24`; Vite reported the `main` chunk at 516.91 kB minified (130.21 kB gzip). Current authenticated UAT evidence is [authenticated-uat-20261115.md](evidence/authenticated-uat-20261115.md): public health/assets and unauthenticated denial are verified for `ad04c24`; authenticated browser scenarios are BLOCKED. Current release evidence is [modular-debian-dev-release-ad04c24.md](evidence/modular-debian-dev-release-ad04c24.md); the previous [48708cc receipt](evidence/modular-debian-dev-release-48708cc.md) and historical [e314 receipt](evidence/modular-debian-dev-release-e31402e.md) remain historical only.

The `ad04c24` source is deployed with a new authorized `modular-debian-dev` receipt, three component health checks, build-tree digests and public asset-byte parity; see the linked release evidence. Do not claim full UAT based on unit tests or unauthenticated health checks.

## Known risks and blockers

1. Authenticated browser-control session and screenshot capability is unavailable here; owner must enter credentials/MFA directly in a supported browser, then verify live Chat and responsive interactions. Do not share credentials/cookies/tokens.
2. Core does not expose persisted stream events; implement a versioned contract before streaming acceptance.
3. Agent/Harness/Run/Attempt/Executor, artifacts, Task Control and Mission Control integration require authoritative read/link contracts and tenant tests.
4. Source SHA `ad04c24` is deployed with exact-target health/rollback evidence. Authenticated browser UAT is still blocked, so real user flows and viewport behavior are not verified.

## Final acceptance recommendation

**NOT ACCEPTED as complete.** Continue the amendment. Core queued Chat and adapter foundations can be accepted as implemented only at the evidence level listed in the matrix. Full completion requires closure of the missing backend-owned contracts and authenticated browser UAT for actual send/response, attachment round-trip, history/reconnect, security ownership and all three viewports.
