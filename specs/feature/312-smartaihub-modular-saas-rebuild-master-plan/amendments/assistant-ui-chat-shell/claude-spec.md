# SmartSIHub assistant-ui Chat Shell — implementation brief

## Objective

Modernize the existing independently deployed `@smartaihub/chat` module by adopting pinned `@assistant-ui/react` ExternalStoreRuntime as a presentation/interaction foundation, without changing canonical SmartSIHub ownership of Chat state or the Worker Jobs/Queue/credit architecture. Preserve Astryx styling, themes, locale, current workspace and attachment workflows. Implement the usable parts now; keep unsupported Agent/Run/tool/artifact/streaming features explicitly unavailable until the backend contract exists.

## Current architecture from repository audit

- `smartaihub-platform/modules/chat` is a separately built React 19.3 + Vite 7.3.8 module loaded by the SaaS Shell manifest loader.
- UI state and presentation currently live in `ChatWorkspace.tsx`, `ConversationList.tsx`, `MessageTimeline.tsx`, `Composer.tsx`, and `AttachmentGallery.tsx`; API helpers live in `api.ts`.
- Chat Worker routes authenticate through Core and forward workspace-scoped requests. Core persists conversation/message/attachment state in the canonical `smartspec` contract.
- Text/attachment turn admission is authenticated and idempotent, then uses canonical `worker_jobs` + outbox + Cloudflare Queue, provider control and shared credit settlement. The browser polls job status and hydrates persisted messages.
- There is no token/event streaming subscription, nor complete Project/Session/Agent/Run/Attempt/Task/Mission/Executor/tool/artifact/cancel read/write surface. Current artifacts capability is false. Those UI surfaces must not imply live capabilities.
- The current module manifest's declared write-authority metadata needs reconciliation with the actual write path before changing it; do not infer that code writes are disabled.

## Chosen integration

Use `@assistant-ui/react@0.15.36` (React ^18/^19 peers) and `useExternalStoreRuntime`. Keep it isolated in a small adapter and custom Astryx-rendered presentation. Map existing Core conversation IDs to runtime thread IDs and preserve canonical message IDs. Existing send, attachment upload, job polling, history hydration, model choice, credit metadata and auth headers remain the only transport and authority. Do not use Assistant Cloud, AI SDK, Cloudflare Agents or a new client persistence layer.

Official compatibility research: ExternalStoreRuntime is designed for externally owned messages and host-controlled persistence; it requires stable IDs and synchronization of currentThreadId with the host's selected thread. Assistant Transport is intended for server-owned state snapshots and bidirectional commands; SmartSIHub does not expose that protocol today. The documented Cloudflare Agents integration uses `@cloudflare/ai-chat` + AI SDK and would introduce a different backend/session model, so it is not selected for the existing canonical worker_jobs Chat path. `@assistant-ui/react` peer constraints accept React 19; exact pin to be verified with installed package typings and bundle dry-run.

## Observable deliverables

1. Assistant-ui external runtime and canonical message/thread mapping are mounted in the Chat module through a replaceable adapter.
2. Existing message send, queued completion, history, model selection, attachment flow, usage metadata, locale, themes and workspace selection still work.
3. A persistent three-region desktop experience remains coherent; tablet/mobile navigation, history, inspector and composer are reachable without overflow.
4. Inspector and status elements are backed only by existing authorized conversation/workspace/job data; unsupported Agent, Run, tool, artifact and cloud states remain clearly unavailable.
5. New tests verify mapping and identity stability, multi-thread switching, failure/retry, attachment integration, job status hydration and no redispatch after refresh/reconnect.
6. Chat module build and deployment to authorized `modular-debian-dev` are verified. Authenticated UAT is reported separately and required before claiming user-flow acceptance.

## Explicit open gaps

- True token streaming requires a versioned persisted Core event/cursor contract and provider/consumer integration; polling a queued job is not streaming.
- Reconnection to a currently running job requires a server-authorized active-job lookup by conversation; browser-only stored job IDs are not authorization and are not durable truth.
- Full Agent/Run/Attempt/Executor/Task/Mission/artifact/tool/cancel UX requires corresponding Core read/action contracts.
- Development browser UAT requires an authenticated user session; no user credentials are stored in the repo or handoff.
