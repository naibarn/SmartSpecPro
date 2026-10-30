# Unified AI Workspace Gap Audit and Implementation Slice

Date: 2026-10-30 (Asia/Bangkok)

## Scope and source state

- Canonical checkout: `/mnt/SmartSpecDev/projects/SmartSpecPro`, branch `main`.
- Baseline at inspection: `969a2051f695c53da130ad5330aa4721bf9bebb4` (`HEAD == origin/main`).
- This record covers the source slice in its containing commit; the integrated SHA is reported by that commit, not inferred here.
- Development target: `https://aimarkethubs.com`, routed through the development tunnel to the local development web service on port 3100. `https://aimarkethubs.com/healthz` returned HTTP 200. The served Vite module for `ConversationScopeBadge.tsx` included the current `projectTitle` mapping.
- Production is a separate service on port 3000 and was not changed or deployed.
- The development web and tunnel services were active. The dev web service was restarted through `scripts/restart-dev-web.sh` after checking the development `worker_jobs` read model for active work; it reported healthy and the diagnostics guard returned its expected HTTP 403.
- The checkout had unrelated edits and unknown session lock files. They were preserved and excluded from this slice.

## User-visible feature matrix

| Capability | Existing source and route | Observed status | Remaining acceptance |
|---|---|---|---|
| Chat / Task Control / Mission Control navigation | `client/src/pages/Chat.tsx`; Chat `/chat`, Task Control `/chat?panel=control-plane&view=full`, Mission Control `/agent-monitor` | **PARTIAL** — source has explicit navigation and tests preserve conversation/thread identity across routes. Authenticated hosted click-through was unavailable. | Verify the exact routes and selection continuity in an authenticated browser at desktop and mobile widths. |
| Project and Session navigation | `components/chat/ChatSidebar.tsx`; `chat.listConversations` | **PARTIAL, improved in this slice** — Sessions remain newest-first within each project group. API now returns an authorized project display title; sidebar groups by Project and hides opaque IDs. | Hosted authenticated session create/switch/reopen/rename/archive journey and persistent state after browser restart. |
| Thread overview | `components/chat/ThreadOverviewSidebarPanel.tsx`; `chat.listRecentConversationThreads` | **PARTIAL** — persisted thread status groups and cross-conversation listing exist; this is the default sidebar view and the Sessions view remains available. | Validate multi-session status and pending actions against real persisted runs; complete cross-host/global agent replay. |
| Task Control preparation and authority | Task Control panel in `Chat.tsx` and existing SPEC-224 APIs | **PARTIAL** — uses existing Goal Admission, workspace authority, source admission, lease, budget and approval boundaries. No duplicate execution authority was added. | Hosted readiness, model selection, authenticated Start/Grant, and real Goal execution remain unverified. |
| Mission Control | `client/src/pages/TaskObservabilityMonitor.tsx`, route `/agent-monitor`, `workerJobs.observability` | **PARTIAL** — route and shared task deep links exist; the page is a canonical task read model, not a new scheduler. | Current screenshot showed an empty workspace summary and no task rows for that account. Verify authorized cross-runner/agent data, dependencies and durable replay in hosted UAT. |
| Harness / Model / Runner selection | Task Control panel; Runner catalog/capability APIs | **PARTIAL/BLOCKED for live acceptance** — source contains catalog-driven controls and freshness/entitlement checks. | Confirm genuine catalog for the signed-in user, explicit pin retention, and supported reasoning options in hosted UI. No model is hardcoded by this change. |
| Rich Harness output | `client/src/lib/useTaskHarnessOutputEvents.ts` and Task Control/Chat inspectors | **PARTIAL** — shared durable event replay hook and evidence sections exist. | Prove actual stdout/stderr, tool events, diff, tests, artifacts, usage, child hierarchy, retries and final verification on a live Run. |
| Multi-agent / multi-runner control | Mission Control and canonical `worker_jobs` projections | **PARTIAL** — multiple registered Runner rows and task observability are represented. | Cross-host agent graph, concurrent live tasks, dependencies and replay/gap recovery remain open in SPEC-294 handoff. |
| SPEC-224 autonomous pilot | Existing SPEC-224 control plane and Debian Runner | **BLOCKED on live acceptance evidence** — the dev read-only aggregate had no worker jobs at inspection; no real Goal Grant, Child 1/2 receipts, settlement or independent final verify was observed in this audit. | Start the bounded Goal through authenticated Task Control and validate genuine Runner evidence; never infer completion from tests. |

## Source change in this slice

`chat.listConversations` now resolves project titles only for active canonical projects visible to the current tenant user as owner or active member. It returns a display title, not a filesystem path or an authorization decision. The sidebar groups sessions by project, preserves the API's newest-first ordering within each group, shows an understandable fallback for inaccessible or unassigned projects, and passes the display title to the scope badge. The badge no longer exposes project IDs to the user. English and Thai labels were added.

No new project registry, session store, thread store, job ledger, scheduler, approval flow or runner identity was introduced. The existing SPEC-294 `uwac-r06` implementation handoff has an active lock sentinel and was not modified; this evidence is additive.

## Target information architecture and interaction contract

Keep one workspace shell with three obvious destinations: **Chat** for project/session/thread context, **Task Control** for preparing and authorizing a Goal, and **Mission Control** for monitoring the same canonical Runs across authorized machines. The current routes already implement those destinations; the follow-up work is to make session/project navigation and task state reliable and visible, not to add another execution surface.

Expected navigation:

```text
Chat
  Project → Sessions (recent activity first) → Thread (status groups)
  Thread → same Goal/Run → Task Control inspector or Mission Control
Task Control
  select Project Workspace → Harness/Model/Runner → review policy/budget → prepare → approve/start
  prepared or active Goal → same Run evidence and exact originating Thread
Mission Control
  authorized Runs across Runners → Run detail → exact Chat Thread / Task Control
```

The Project labels the code/resource context; a Session is a durable conversation; a Thread is a focused branch of that conversation; a Goal is the authorized intent; Run/Job/Attempt and receipts remain owned by SPEC-224. Switching Session must restore its own messages and pinned execution context. Chat and Task Control should show concise progress first and place logs, diff, tests, artifacts, usage and receipts in progressive-detail tabs. Mission Control should default to active/waiting/review work, with history below, and every row should open the same canonical Run detail.

Implementation order remaining after this slice:

1. Authenticated hosted UAT for project/session/thread switching and the three route transitions.
2. Correlate and repair the hosted Chat transcript and observability 500s using the real request ID and server exception.
3. Close live Runner catalog, Goal preparation and approval UI gaps under SPEC-277/SPEC-224.
4. Complete durable cross-host event replay, agent/run graph, and multi-runner Mission Control under SPEC-294.
5. Validate real Child 1 → receipt/settlement → automatic Child 2 → independent Final Verify under SPEC-224.

## Runtime and browser evidence limits

- Development route health and current transformed client source were checked over `aimarkethubs.com`.
- The screenshot supplied by the user shows HTTP 500 responses for `chat.getMessages` and `workerJobs.observability`. The current dev service journal has no matching route stack trace at the available timestamps, so this audit cannot attribute those 500s to a specific database/API cause. Prior canonical evidence explicitly leaves the hosted `chat.getMessages` root cause open.
- An authenticated login probe on the current dev service returned `auth.login: Invalid email or password` (HTTP 401); credentials were not changed or disclosed. Therefore hosted authenticated Playwright acceptance is **BROWSER_UAT_BLOCKED**, not passed. Local component tests and earlier synthetic local UAT are not hosted acceptance evidence.
- `aimarkethubs.com` currently serves development source. A separate isolated-UAT title/context marker was previously observed in the document title; with no authenticated browser session, its effect on the signed-in user context remains unresolved.

## Verification

- Focused Vitest: 5 files, 49 tests passed, covering sidebar project grouping, scope badge privacy, conversation thread project authorization, unified wiring and the affected MemoryPanel expectation.
- `git diff --check`: passed.
- Hosted development health: HTTP 200; served transformed scope badge included current `projectTitle` behavior.
- Authenticated hosted browser journeys: not run; `BROWSER_UAT_BLOCKED` for the 401 reason above.

## Canonical SPEC ownership and next work

- SPEC-294 owns the unified workspace/Mission Control projection and global task continuity. Continue the existing locked UWAC handoff only through its owner/lock protocol; open requirements include cross-host agent/run graph and durable replay/gap recovery.
- SPEC-277 owns Task Control user experience. Reconcile preparation/approval diagnostics there without duplicating SPEC-224 authority.
- SPEC-224 owns live Goal execution and autonomous Child continuation. Keep the bounded Pilot open until real Child 1 and Child 2 receipts, settlement and independent final verification exist.
- SPEC-293 owns workspace/repository authority; SPEC-200 owns harness contracts; SPEC-310 is the current Native Harness design/validation authority. These remain partial and are not replaced here.
- The referenced SPEC-309 was not found as a canonical directory under `specs/feature` during the inventory. Resolve the identifier against the canonical registry before assigning additional requirements to it.
- Next action: run authenticated desktop/mobile UAT on the development domain, capture correlated server traces for the observed `chat.getMessages` and `workerJobs.observability` 500s, fix the first failing runtime boundary, then continue the genuine SPEC-224 pilot. Do not deploy production.
