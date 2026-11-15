# Assistant UI Chat Shell — Architecture Audit

**Audit date:** 2026-11-15 (Asia/Bangkok)
**Source baseline:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`, now deployed to the authorized `modular-debian-dev` target.
**Authority:** SPEC-312 R1.18; related contracts remain authoritative in SPEC-224, SPEC-294, SPEC-310, SPEC-313, SPEC-318, SPEC-319, SPEC-325 and the Core Chat API.

## As-built architecture

```text
Authenticated browser
  └─ Chat UI module (React 19, @assistant-ui/react 0.15.36, Astryx)
       ├─ External Store adapter: Core conversation IDs ↔ assistant-ui thread IDs
       ├─ same-origin Chat Hono Worker (/api/chat/*)
       │    └─ authenticated, tenant-scoped proxy to Modular Core
       └─ Core Hono API
            ├─ canonical identity / workspace authorization
            ├─ PostgreSQL smartspec: conversations, messages, worker_jobs, outbox
            ├─ R2 Chat attachment storage (authenticated owner-scoped reads)
            └─ Cloudflare Queue → worker job → provider admission → LLM
```

| Concern | Current owner / source | Finding |
|---|---|---|
| Authentication and tenant | Core signed host-bound session; `/v1/core/me`; Chat Worker identity middleware | Browser cookie stays same-origin; tenant is derived/verified server-side. |
| Workspace | Core membership and environment-scoped default workspace | UI uses the returned selected tenant; a client label/ID is not authorization. |
| Thread and messages | Core Chat repository and PostgreSQL | `conversationId` is the canonical thread identity; assistant-ui IDs are mapped, not separately persisted. |
| Turn lifecycle | Core Chat API → `worker_jobs` + outbox → Cloudflare Queue → worker | Browser POST returns a queued job; UI polls its authenticated status and hydrates persisted messages. No direct browser-to-provider call. |
| Attachments | Core authenticated upload/fetch API and R2 | UI keeps local previews and uploads before queueing the turn; Core owns stored bytes and access checks. |
| Provider/model selection and credits | Core enabled-model catalog, queue-side revalidation and shared credit accounting | UI submits selection intent only; authoritative validation/settlement is server-side. |
| Assistant UI state | `useChatAssistantRuntime.ts` External Store adapter | Core conversation/message records remain source of truth. No Assistant Cloud or AI SDK runtime. |
| Thread Inspector | Current conversation summary + workspace/model/message facts in `ChatWorkspace.tsx` | No canonical Agent, Harness, Run, Attempt, Machine, event or artifact read model is available to this surface. |
| Inline artifacts | No Core artifact capability (`artifacts: false`); Worker artifact routes return unavailable | Existing `ArtifactPanel` is a presentation component, not proof of an artifact service/viewer. |
| Streaming | No persisted event/SSE endpoint; queue runtime calls provider with `stream: false` | `isSending` indicates a queued/waiting turn; it is not token streaming. |
| Deployment | SPEC deployment registry: `modular-debian-dev`, `aimarkethubs.com`, Debian + local Workerd | Exact SHA `ad04c24` is deployed with matching component build digests, public asset-byte parity, health checks, and rollback pointer; see `evidence/modular-debian-dev-release-ad04c24.md`. Production `smartsihub.com` remains separate. |

## Proposed target architecture and lifecycle

Keep the current authority graph and add capabilities only behind versioned Core contracts. Chat creates/submits a turn once with an idempotency key. Core authorizes actor + tenant + workspace + conversation, persists the canonical job/outbox binding, and enqueues. The queue worker obtains provider admission, executes and settles credits, then writes canonical messages/job outcome. The browser polls and hydrates the same conversation; refresh/reconnect reads state and never redispatches. When a persisted event contract exists, the client may subscribe from a server cursor and deduplicate by event ID; it must still recover from canonical job/message state.

Task Control and Mission Control should project/link these same canonical Thread/Run/Job IDs from their owning APIs. They must not introduce another task manager, mission database or duplicate thread state. Inspector fields remain absent or explicitly unavailable until sourced from authorized read models. Artifacts require owner-scoped references, expiry/error semantics and safe typed viewers; untrusted HTML/apps remain sandboxed.

## Dependency and component map

| Layer | Main source | Responsibility / dependency |
|---|---|---|
| Chat module entry | `modules/chat/src/ui/main.tsx` | Locale, theme and module mounting; loads isolated Chat UI. |
| Chat shell | `modules/chat/src/ui/ChatWorkspace.tsx` | Workspace, navigation/history tabs, responsive panels, model selection, composer, Inspector. |
| Runtime adapter | `modules/chat/src/ui/useChatAssistantRuntime.ts`, `assistantUiMessages.ts` | Adapts canonical Chat records/callbacks to pinned assistant-ui External Store APIs. |
| Transcript and attachments | `MessageTimeline.tsx`, `AttachmentGallery.tsx`, `Composer.tsx` | Safe message presentation, preview/lightbox, selection and composer callbacks. Markdown renderer is a focused addition in this audit. |
| Chat API client | `modules/chat/src/ui/api.ts` | Same-origin Core session/capability/model/history/upload/send/status requests. |
| Chat API edge | `modules/chat/src/api/worker.ts`, `modules/chat/src/auth/coreSession.ts` | Hono routes and auth/tenant-scoped Core proxy; no provider secret in browser. |
| Canonical execution | `apps/saas-core/src/identity/authRoutes.ts`, `apps/saas-core/src/chat/chatService.ts`, `chatQueueRuntime.ts`, `chatRepository.ts` | Core authorization, persistence, queue/worker execution, status and settlement. |
| Shared DTOs | `modules/saas-contracts` | Versioned identity, model, conversation, message, attachment and capability shapes. |

## Runtime API contracts observed

Current UI proxy routes include `/api/chat/v1/session`, `/capabilities`, `/models`, `/conversations`, `/conversations/:id/messages`, `/attachments` (upload/fetch) and `/turns` + `/turns/:jobId` (submit/status). Hono proxy forwards verified tenant context to Core. Core capability response currently declares `conversations: true`, `messages: true`, `artifacts: false`; worker artifact routes return `503 chat_data_unavailable`. No SSE/EventSource route or durable cursor exists. Current Core turn output is job-status polling, not stream events.

## Reuse / replace decisions and ADRs

| Decision | Choice | Reason / boundary |
|---|---|---|
| Reuse assistant-ui | Reuse pinned `@assistant-ui/react@0.15.36` through External Store | Interaction primitives only; Core owns durable chat state. |
| Replace legacy dashboard shell | Use independent SmartSIHub Chat module and Astryx shell | User's target is chat-first; keep module independently buildable. |
| Keep Core API and job control plane | Reuse existing Hono/Core, PostgreSQL, worker_jobs/outbox and Queue | Avoid parallel persistence, direct provider calls or new scheduler. |
| Streaming | Defer pending persisted/versioned event contract | Polling is current truthful behavior; no fake token stream. |
| Inspector/Task/Mission/Artifacts | Capability-gate until canonical read/write contracts exist | Do not synthesize Agent/Run/artifact identity or bypass RBAC. |
| Markdown rendering | Add a small allowlist-based renderer in Chat module | Avoid bringing Node/server dependencies into Worker-targeted module; raw HTML is emitted as text and unsafe link schemes are not linked. |

The stable decisions above are amendments to SPEC-312 R1.18 and cross-reference existing SPEC-294/310/318/319/325 boundaries. No new independent architecture authority or database is introduced.

## Migration, rollback and deployment

The presentation adapter is reversible independently of Core: retain canonical API schemas/IDs and restore the previous transcript renderer/module artifact if a module release fails. Do not migrate or rename conversation/job data. Use `apps/web/scripts/deployment-targets.json` and the `modular-debian-dev` controller only; retain the previous release artifact and recorded rollback config. This audit does not alter `smartaihub.app`, tenant data, `smartsihub.com`, or production resources. The `ad04c24` release receipt proves exact-source deployment and service health only; authenticated UAT remains separate and blocked as recorded in `evidence/authenticated-uat-20261115.md`.

## Audit conclusion

The authority boundaries and queue-backed basic Chat path are coherent, but the eight-area assistant-ui deliverable is not complete. Core API gaps block true streaming, canonical Agent/Run/Attempt/Executor details, full artifact viewers and Task/Mission navigation. Authenticated browser UAT and viewport screenshots remain blocked in this execution environment. The implementation traceability matrix and completeness report enumerate each outcome and next corrective action.
