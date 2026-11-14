# SPEC-312 Amendment R1.18 — assistant-ui Chat presentation foundation

**Status:** active implementation amendment
**Scope:** `smartaihub-platform/modules/chat` and versioned Core Chat read contracts required by this presentation layer.
**Authority:** subordinate to SPEC-312 and existing identity, worker job, queue, credit, attachment, security and deployment contracts.

## Goal

Adopt `@assistant-ui/react` as the reusable React presentation and interaction foundation for the SmartSIHub Chat module. Keep SmartSIHub Core authoritative for identity, environment tenant, workspace, conversation/thread, messages, attachments, worker jobs, provider/model selection, credit accounting, authorization and execution status. Preserve the independently built Chat module and existing Astryx design system; do not turn this into a combined legacy build or introduce another orchestration/persistence service.

## Runtime choice

- Pin an exact `@assistant-ui/react` version compatible with the repository's React version. Record the selected version and its compatibility evidence in the implementation handoff.
- Use `ExternalStoreRuntime` first. It bridges externally owned messages and callbacks without replacing the existing Core API or canonical PostgreSQL/worker-job persistence.
- Keep assistant-ui behind a small Chat presentation adapter so the dependency can be upgraded or replaced without changing Core contracts.
- Do not add `@assistant-ui/ai-sdk`, Assistant Cloud, or Cloudflare Agents as a second chat/job runtime for the current queued LLM path. Re-evaluate only when a backend-owned streaming or Agent protocol is available and its authority boundaries are explicit.
- Use assistant-ui primitives and interaction state with SmartSIHub/Astryx components and theme tokens; do not ship its default visual system in place of the product design system.

## Canonical state and thread mapping

- Map the existing authorized `conversationId` to the assistant-ui `threadId`; preserve it across selection, reload and history hydration. Do not mint a second persisted thread identity.
- Preserve backend message IDs as stable assistant-ui message IDs. Keep user/assistant role, content, attachment references, model/usage/credit metadata and timestamps in a typed adapter.
- Route new messages, attachments and turn polling through the existing authenticated Chat API and canonical `worker_jobs` + outbox + Queue path. Do not bypass provider admission, tenant checks, credit reservation or settlement.
- Ensure switching threads updates the runtime's selected thread and source-of-truth conversation atomically. A browser refresh or reconnect MUST hydrate history and may reconnect to an existing job only through an authorized server read; it MUST NOT resubmit the user's turn or dispatch a duplicate job.
- Preserve the existing idempotency key behavior. Do not treat canceling assistant-ui's local display/transport as cancellation of a background job.

## Chat shell and interaction requirements

- Keep a desktop three-region layout: left navigation/history, central conversation and composer, and right thread inspector. On tablet, navigation and inspector may collapse into reachable panels; on mobile, make Chat the default full-screen surface with accessible navigation/history and inspector views.
- Preserve workspace chooser/creator, menu/history tabs, panel collapse, Thai/English localization, all supported Astryx themes, model selector (Auto and enabled models only), compact attachment previews/removal, full-size contain-fit Lightbox, and current attachment caps/validation. Tablet/mobile navigation, history and inspector overlays must provide an accessible close action and must not trap the user away from the central chat. Attachment selection accepts up to 10 images and text files together, whether selected in one batch or incrementally; each image preview remains a small thumbnail, preserves the source aspect ratio (including 1:1, 9:16 and 16:9), and opens the full image in a Lightbox.
- Render empty, loading, queued/running, completed, failed, reconnecting and unavailable states from real API state. Do not display “streaming”, “Always On”, live Agents, run metrics, tool activity, artifacts or cancellation controls unless a corresponding authorized backend contract and capability are present.
- Keep the existing Chat message send workflow working while the presentation adapter is introduced. A UI migration MUST NOT disable text-only send, existing attachment send, persisted history, provider/model selection or credit display. Upload selected attachments through the authenticated Core attachment API, then dispatch one idempotent worker turn containing the uploaded attachment IDs; never call an LLM directly from the browser. Auto selection for image turns must use an enabled model whose catalog entry declares image support, or show the actionable vision-model unavailable error.
- Render Markdown and code safely. Generated UI, tool payloads, artifacts and external content are untrusted; never execute arbitrary generated JavaScript in the application origin. Trusted internal React renderers require a static allowlist; untrusted HTML/apps require an isolated sandbox with explicit permissions.

## Backend integration boundaries

- The current Chat Worker/Core API and canonical database remain authoritative. Assistant UI components may issue only the user interactions already authorized by those APIs.
- Agent, Project, Session, Run, Attempt, Executor, tool, event-stream, artifact, approval and cancellation UI must remain capability-gated until Core has a versioned, tenant/workspace-scoped read/write contract and acceptance evidence. Use a clear unavailable/coming-soon state instead of synthesized records.
- Any later streaming integration must consume persisted/versioned Core events, preserve ordering and stable IDs, deduplicate by event identity, reconnect from a server cursor, and recover canonical job state after refresh. Browser disconnect alone must never cancel a background job.
- Do not change the canonical queue, worker lease/fencing, provider rate limiting, model enablement or shared credit ledger as a side effect of adopting the presentation library.

## Security and compatibility

- Keep server-side tenant, actor, workspace and conversation authorization on every read/write. Never authorize using a thread ID, workspace label, URL, localStorage value or guessed Durable Object name.
- Keep provider and service credentials out of the browser, assistant-ui state, attachment metadata, event streams and logs.
- Pin compatibility-sensitive packages exactly and verify React 19 compatibility, Worker bundle output and independent Chat build. No Node-only server dependency or Express may enter the Worker runtime.
- Keep the module independently buildable, deployable and rollbackable. Do not change `smartaihub.app` or production `smartsihub.com`.

## Acceptance criteria

1. Chat presentation uses the pinned assistant-ui External Store Runtime through a replaceable adapter, while Astryx remains the visual system.
2. Existing workspace, model/Auto selection, text send, image/document attachments, queued job completion, history reload and credit metadata remain functional against the current dev Core.
3. Thread/conversation and message IDs stay stable across create, select, hydrate, reload and retry; a refresh during queued work never resubmits or duplicates the job.
4. No unsupported tool, artifact, Agent, Run, streaming, cancellation, executor or cloud-state claims appear in the UI.
5. Desktop, tablet and mobile layouts keep navigation, history, conversation, composer, inspector, locale and theme controls usable without overflow or occlusion.
6. Focused unit/integration tests cover adapter mapping, stable IDs, send failure/retry, multi-thread switching, refresh/reconnect without redispatch, attachments and accessible responsive navigation. Existing Chat tests remain green.
7. Chat-only typecheck/build and Worker dry-run pass; development release targets only `modular-debian-dev` (`aimarkethubs.com`) and records local/public smoke evidence. Authenticated chat and attachment UAT is recorded separately when an authenticated browser session is available.
8. Update the SPEC-312 canonical handoff with exact source SHA, package version, checks, development release evidence and still-open backend/UAT gaps. Do not close the parent SPEC or R1.18 while streaming, run contracts, artifact/Agent integration, authenticated UAT or other required criteria remain unverified.

## Known implementation gap at amendment start

The current module uses custom React state/Astryx rendering; Core-backed conversations/messages and queued job status exist, but the client has no token-stream event subscription and no full Agent/Run/Attempt/Task/Mission/artifact read contract. The current interface also contains placeholder “coming soon” affordances. These facts constrain what may be claimed during the first migration slice.
