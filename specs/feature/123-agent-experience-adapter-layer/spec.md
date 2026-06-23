# Feature 123: Agent Experience Adapter Layer

**Version:** 0.1.0
**Date:** 2026-06-22
**Status:** Draft
**Builds on:** Existing Chat, Agency, Team Room, Artifact, Approval, Agent Runtime, and Work OS surfaces
**External reference:** `runtypelabs/persona` / `@runtypelabs/persona` as an optional renderer and protocol reference
**Principle:** Unify SmartSpecPro's internal agent interaction experience through a stable SmartSpec-owned event protocol and adapter layer before adopting any external widget, website embed, or page-action system.

---

## 1. Goal

SmartSpecPro already has several agent-facing interaction surfaces:

- direct Chat;
- Agency Chat;
- Team Room and Auto-Team run monitor;
- Media Studio assistants;
- Storyboard Review and Marketplace Auto Review flows;
- approval, artifact, cost, and debug surfaces;
- browser automation and MCP-related workflows.

These surfaces have overlapping needs: streaming chat, tool-call visibility, approvals, artifacts, file/image input, voice readiness, cost preview, workflow progress, and runtime debugging. The goal of this feature is to define a shared **Agent Experience Adapter Layer** that makes those capabilities consistent without replacing existing product surfaces in one large rewrite.

The layer must:

- preserve current Chat, Agency, Team Room, Media Studio, and Work OS behavior;
- define a SmartSpec-owned event protocol that can map existing runtime streams into one UI contract;
- keep external UI libraries replaceable;
- allow `@runtypelabs/persona` to be tested as an optional renderer/reference;
- avoid naming collisions with SmartSpecPro's existing assistant persona/domain-persona system;
- delay customer website embedding until internal product UX is stable.

---

## 2. Naming And Collision Policy

This project already uses "persona" to mean SmartSpecPro assistant identity, user-selected assistant profile, team member profile, and admin-managed assistant templates. The external dependency is also named Persona. To avoid ambiguity, SmartSpecPro-owned modules, symbols, routes, database names, feature flags, and package names must **not** use `persona` as the primary product term for this feature.

### 2.0 Glossary

| Term | Definition |
|---|---|
| Agent Experience Adapter Layer | SmartSpec-owned protocol, adapter, and UI boundary that normalizes agent events across existing surfaces. |
| Source stream | Existing runtime stream or record source, such as Agency SSE, Team run SSE, chat message lifecycle, artifact router, or approval router. |
| Canonical event | A validated `SmartSpecAgentEvent` produced by an adapter and safe for renderer consumption after visibility filtering. |
| Adapter | Pure mapping function from a source stream/record into canonical events plus dropped-event diagnostics. |
| Renderer | UI layer that consumes canonical events and emits typed intents, without directly mutating backend state. |
| Host surface | Existing SmartSpecPro page or flow, such as Agency Chat or Team Room, that owns permissions, flags, and backend action handlers. |
| Shadow mode | Observation mode that runs adapters and metrics without changing visible UI. |
| Preview mode | Explicit feature-flagged mode that renders canonical events in an Agent Experience UI for a selected surface. |
| Bridge | Isolation layer that maps SmartSpec events/intents to an optional external renderer such as `@runtypelabs/persona`. |
| Fixture | Synthetic or redacted sample event stream used for deterministic adapter, renderer, security, and rollback tests. |
| Dropped event | Source event that is malformed, unauthorized, unsupported, or unsafe and therefore not rendered as a normal canonical event. |
| Backend authority | Existing server-side service/router that remains the source of truth for approval, billing, artifact, runtime, or workflow mutations. |

### 2.1 Reserved Terms

Use these terms only for their existing meanings:

| Term | Meaning |
|---|---|
| `persona` | Existing SmartSpecPro assistant/user/team identity concept. Do not overload for UI widgets. |
| `PersonaSelector` | Existing chat identity selector component. Do not rename or repurpose in this feature. |
| `personaTemplates`, `personaSystem` | Existing schema/feature-flag concepts. Do not reuse for the adapter layer. |
| `@runtypelabs/persona` | External npm package only. Refer to it as `Runtype Persona` in docs. |

### 2.2 SmartSpec-Owned Names

Use these names for new work:

| Concept | Recommended name |
|---|---|
| Feature | Agent Experience Adapter Layer |
| Shared event protocol | `agent-experience-protocol` or `agentExperienceProtocol` |
| Event type union | `SmartSpecAgentEvent` |
| Adapter package | `@smartspec/agent-experience` |
| Optional external renderer bridge | `runtypePersonaBridge` |
| UI wrapper components | `AgentExperienceShell`, `AgentTimeline`, `AgentArtifactPane`, `AgentApprovalCard` |
| Feature flag | `agentExperienceLayer` |
| External dependency flag | `agentExperienceRuntypeRenderer` |
| Compatibility tests | `agentExperienceCompatibility` |

Avoid these names:

- `persona-adapter`
- `persona-ui-kit`
- `smart-persona`
- `agent-persona-ui`
- `persona-protocol`
- `persona-debugger`

### 2.3 Documentation Rule

When the external library must be mentioned, write `Runtype Persona` or ``@runtypelabs/persona``. When discussing SmartSpecPro assistant identity, write `assistant persona`, `team member persona`, or `SmartSpecPro persona`.

---

## 3. Existing Baseline

Codebase inspection shows that this feature should extend the current system rather than create a parallel agent console from scratch.

### 3.1 Streaming Baseline

`apps/web/client/src/hooks/useAgencyStream.ts` already models:

- streaming assistant messages;
- `tool_start`, `tool_progress`, `tool_end`;
- `approval_required`;
- guardrail events;
- credit usage;
- reconnect with `Last-Event-ID`;
- polling fallback;
- cancel modes.

`apps/web/client/src/hooks/useRunStream.ts` already models Team/Orchestrator SSE events with event IDs, team/room/run identity, actor identity, visibility, and event data.

### 3.2 UI Baseline

Relevant existing components include:

- `apps/web/client/src/components/chat/ChatView.tsx`;
- `apps/web/client/src/components/chat/PersonaSelector.tsx`;
- `apps/web/client/src/components/chat/MessageCostBadge.tsx`;
- `apps/web/client/src/components/chat/ImageGalleryPanel.tsx`;
- `apps/web/client/src/components/chat/VisualContextBadge.tsx`;
- `apps/web/client/src/components/chat/artifacts/ArtifactPanel.tsx`;
- `apps/web/client/src/components/chat/skill/SkillSelector.tsx`;
- `apps/web/client/src/components/chat/voice/VoiceAgentControls.tsx`;
- `apps/web/client/src/components/chat/ThreadRouter.tsx`;
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`;
- `apps/web/client/src/pages/AgencyChat.tsx`;
- `apps/web/client/src/pages/AdminApprovals.tsx`;
- `apps/web/client/src/pages/AdminOrchestrationLogs.tsx`.

### 3.3 Artifact And Approval Baseline

`apps/web/server/routers/artifact.ts` and `apps/web/server/services/artifactStorageService.ts` already support conversation artifacts and version history.

`apps/web/server/routers/approvals.ts` already proxies approval operations and records Work OS approval decisions when work case metadata is present.

### 3.4 Package Baseline

The repository uses npm workspaces:

- `packages/ui`;
- `packages/shared`;
- `packages/db`;
- `packages/skills`;
- `packages/local-ai-core`;
- `apps/web`;
- `apps/extension`;
- `apps/tauri-shell`.

This makes an internal package such as `packages/agent-experience` a natural fit if the layer grows beyond one app.

### 3.5 Related Feature Dependencies

This feature is a UI/protocol unification layer. It must align with, but not duplicate, the runtime and persistence work already described in related specs:

| Related area | Dependency / alignment requirement |
|---|---|
| Feature 101 OpenAI Agents SDK Chat/Team Orchestration | Reuse runtime trace/checkpoint identity and step-link concepts. |
| Team / Auto-Team ledger | Keep `team_runs`, `team_room_messages`, `auto_team_trace_events`, and `auto_team_*` tables as the Team source of truth. |
| Work OS automation | Keep Work OS approvals/checkpoints authoritative for work-backed runs. |
| Existing artifact router/storage | Use artifact IDs and permissioned artifact reads instead of embedding large trusted blobs in events. |
| Existing approval router | Normalize approval state, but keep approval decisions routed through existing backend paths. |
| Existing feature flag system | Register all rollout flags through `apps/web/shared/featureFlags.ts` and admin flag grouping. |

### 3.6 Likely File Ownership

Implementation planning should start from these likely files and add or adjust only the smallest required set:

| Area | Likely files |
|---|---|
| Shared package | `packages/agent-experience/package.json`, `packages/agent-experience/src/**` |
| Feature flags | `apps/web/shared/featureFlags.ts`, `apps/web/shared/featureFlags.js`, `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts` |
| Agency adapter fixtures | `apps/web/client/src/hooks/useAgencyStream.ts`, `apps/web/shared/agencyStreamEvents.ts`, tests under `packages/agent-experience/src/adapters/` |
| Team adapter fixtures | `apps/web/client/src/hooks/useRunStream.ts`, `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`, tests under `packages/agent-experience/src/adapters/` |
| Artifact adapter | `apps/web/server/routers/artifact.ts`, `apps/web/server/services/artifactStorageService.ts`, `apps/web/client/src/components/chat/artifacts/ArtifactPanel.tsx` |
| Approval adapter | `apps/web/server/routers/approvals.ts`, existing approval UI components and tests |
| Preview UI | new app-local preview route/component only after protocol tests pass |

Do not modify these files in Phase 0 unless the implementation plan proves a direct need. Phase 0 should mostly add the new package and tests.

---

## 4. Non-Goals

- Do not replace `ChatView`, `AgencyChat`, or `TeamRoomView` in the first phase.
- Do not rename or modify the existing SmartSpecPro persona system.
- Do not fork or edit `@runtypelabs/persona` source code.
- Do not build a customer website widget in Phase 1 or Phase 2.
- Do not expose public client tokens, website embeds, or customer WebMCP actions until internal behavior passes compatibility, security, and usability gates.
- Do not introduce a second durable ledger for Team/Auto-Team runs.
- Do not route risky actions through UI-only approval checks. Backend approval and audit remain authoritative.
- Do not enable `@runtypelabs/persona` beyond the gated bridge evaluation until the protocol spike proves useful and the exact version remains pinned.

---

## 5. External Library Position

Runtype Persona should be treated as:

1. an optional renderer;
2. a reference implementation for agent UX patterns;
3. a protocol compatibility target;
4. a potential future website widget foundation.

It should **not** become the source of truth for SmartSpecPro event semantics, permissions, billing, approvals, artifacts, or runtime ledgers.

Recommended production posture:

- use the installed npm dependency only through the gated bridge until spike approval;
- pin exact version, for example `"@runtypelabs/persona": "x.y.z"`;
- gate all usage behind `agentExperienceRuntypeRenderer`;
- isolate all external-library imports behind `runtypePersonaBridge`;
- never import external widget internals from core Chat, Agency, Team, Approval, Artifact, or billing services;
- run compatibility tests before every version upgrade.

Optional evaluation posture:

- inspect the upstream repository or examples during spike work;
- avoid git submodule unless source-level debugging is required;
- contribute upstream only when a missing extension point cannot be solved through public plugin/adapter APIs.

---

## 6. SmartSpec Agent Event Protocol

SmartSpecPro must define its own event protocol first. Existing Agency and Team streams should be mapped into this protocol through adapters.

### 6.1 Event Contract

Every event must carry a canonical metadata envelope. The envelope preserves runtime identity, ordering, tenancy, visibility, and redaction state across Chat, Agency, Team, Media, Workflow, and future renderer bridges.

```ts
type SmartSpecAgentEventEnvelope = {
  eventId: string;
  sourceEventId?: string | null;
  source: AgentExperienceEventSource;
  surface: AgentExperienceSurface;
  tenantId: string;
  userId?: number | null;
  actorId?: string | null;
  actorType?: "user" | "assistant" | "system" | "external" | null;
  teamId?: string | null;
  roomId?: string | null;
  runId?: string | null;
  conversationId?: number | string | null;
  messageId?: number | string | null;
  workCaseId?: string | null;
  workTaskId?: string | null;
  traceId?: string | null;
  correlationId?: string | null;
  sequence?: number | null;
  timestamp: string;
  visibility: "public" | "transparent" | "milestone" | "summary_only" | "debug" | "private_internal";
  redactionLevel: "none" | "summary" | "redacted" | "debug_only";
  schemaVersion: "2026-06-22.v1";
};

type SmartSpecAgentEvent =
  | (SmartSpecAgentEventEnvelope & { type: "session.started"; sessionId: string })
  | (SmartSpecAgentEventEnvelope & { type: "message.delta"; messageId: string; text: string })
  | (SmartSpecAgentEventEnvelope & { type: "message.done"; messageId: string })
  | (SmartSpecAgentEventEnvelope & { type: "tool.start"; toolCallId: string; toolName: string; argsPreview?: unknown })
  | (SmartSpecAgentEventEnvelope & { type: "tool.progress"; toolCallId: string; status: string; message?: string; dataPreview?: unknown })
  | (SmartSpecAgentEventEnvelope & { type: "tool.done"; toolCallId: string; resultPreview?: unknown; durationMs?: number; creditsUsed?: number })
  | (SmartSpecAgentEventEnvelope & { type: "tool.error"; toolCallId: string; errorCode?: string; message: string; recoverable: boolean })
  | (SmartSpecAgentEventEnvelope & { type: "approval.request"; approvalId: string; summary: string; riskLevel: "low" | "medium" | "high" | "critical"; expiresAt?: string })
  | (SmartSpecAgentEventEnvelope & { type: "approval.resolved"; approvalId: string; decision: "approved" | "denied" | "expired" | "cancelled"; sourceDecision?: "approved" | "rejected" | "expired" | "cancelled" })
  | (SmartSpecAgentEventEnvelope & { type: "artifact.created"; artifactId: string; title: string; format: AgentArtifactFormat; version?: number })
  | (SmartSpecAgentEventEnvelope & { type: "artifact.updated"; artifactId: string; version: number; contentPreview?: unknown })
  | (SmartSpecAgentEventEnvelope & { type: "cost.estimate"; estimateId: string; credits: number; reason: string; requiresConfirmation: boolean })
  | (SmartSpecAgentEventEnvelope & { type: "cost.finalized"; creditsUsed: number; refundCredits?: number; reason?: string })
  | (SmartSpecAgentEventEnvelope & { type: "workflow.step"; workflowId: string; stepId: string; status: AgentWorkflowStepStatus; label?: string })
  | (SmartSpecAgentEventEnvelope & { type: "debug.trace"; traceId: string; label: string; payloadPreview?: unknown })
  | (SmartSpecAgentEventEnvelope & { type: "error"; message: string; recoverable: boolean; code?: string });

type AgentExperienceEventSource =
  | "chat"
  | "agency_stream"
  | "run_stream"
  | "artifact_router"
  | "approval_router"
  | "media_task"
  | "workflow_runtime"
  | "browser_session"
  | "fixture";

type AgentExperienceSurface =
  | "chat"
  | "agency_chat"
  | "team_room"
  | "media_studio"
  | "storyboard_review"
  | "marketplace_auto_review"
  | "workflow_builder"
  | "browser_session"
  | "admin_debug";

type AgentArtifactFormat =
  | "markdown"
  | "html"
  | "json"
  | "image"
  | "video"
  | "table"
  | "code"
  | "document";

type AgentWorkflowStepStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "done"
  | "error"
  | "cancelled"
  | "paused";
```

### 6.2 Required Adapters

| Adapter | Input | Output |
|---|---|---|
| `agencyStreamToAgentEvents` | `useAgencyStream` / `/api/v1/agency/stream` event names | `SmartSpecAgentEvent[]` |
| `runStreamToAgentEvents` | `useRunStream` Team/Orchestrator events | `SmartSpecAgentEvent[]` |
| `chatMessageToAgentEvents` | Chat tRPC/streaming message lifecycle | `SmartSpecAgentEvent[]` |
| `artifactRecordToAgentEvents` | `conversationArtifacts` and artifact router responses | artifact events |
| `approvalRecordToAgentEvents` | tRPC approval proxy and Work OS approval records | approval events |
| `mediaTaskToAgentEvents` | media generation task state | workflow/cost/artifact events |

### 6.3 Protocol Rules

- Adapters must be pure and testable.
- Adapters must tolerate unknown event fields.
- Raw payloads must be hidden from normal users and exposed only in debug mode.
- Event IDs and timestamps from source streams must be preserved when available.
- `eventId` must be stable and deduplicable. Prefer source event IDs when they are already globally safe; otherwise derive from source, run/conversation identity, sequence, and event type.
- `sequence` must preserve source stream order when available. When not available, adapters may assign client-local ordering for rendering only.
- Tenant, user, team, room, run, and work-case identity must remain server-authoritative.
- Cost events must never finalize billing from client state.
- Approval events must represent backend-authoritative approval state.
- Existing approval values of `rejected` must normalize to canonical `denied` while preserving the original value in `sourceDecision`.
- Unknown or unsupported source events must not crash renderers. They should either be ignored or mapped to a debug-only `debug.trace` event based on risk and visibility.
- Payload previews must be bounded in size and redacted before entering normal UI state.

### 6.4 Existing Event Mapping

The first implementation must define explicit source-to-canonical mapping tables before writing UI components.

#### Agency Stream Mapping

| Source event | Canonical event | Notes |
|---|---|---|
| `meta` / `run_started` | `session.started` | Preserve `runId`, agency/conversation identity, and source event ID when present. |
| `text_delta` | `message.delta` | `data.delta` becomes `text`. |
| `token` | `message.delta` | Legacy support. `data.token` or `data.content` becomes `text`. |
| stream completion / assistant message finalization | `message.done` | Emit when source stream marks the current message complete or when run ends. |
| `agent_switch` | `workflow.step` or `debug.trace` | Use `workflow.step` only when it represents user-visible ownership/progress; otherwise debug-only. |
| `tool_start` | `tool.start` | Preserve `toolCallId`, `toolName`, and actor/agent name. |
| `tool_progress` | `tool.progress` | Preserve progress message and status. |
| `tool_end` | `tool.done` or `tool.error` | Map status/error fields conservatively. |
| `tool_call` | `tool.start` | Legacy support. |
| `tool_result` | `tool.done` or `tool.error` | Legacy support. |
| `guardrail_trigger` | `debug.trace` or `error` | User-visible only when action is blocked or needs user attention. |
| `approval_required` | `approval.request` | Requires backend approval ID/key, risk level when available, and expiry when available. |
| `preview_ready` | `artifact.created` | For preview artifacts; content remains behind artifact access service. |
| `run_complete` / `run_finished` | `workflow.step` + `cost.finalized` | Emit final workflow state and cost event when usage exists. |
| `error` | `error` | Redact details for normal users. |

#### Team / Orchestrator Stream Mapping

| Source field/event | Canonical mapping | Notes |
|---|---|---|
| `eventId` | `sourceEventId` and candidate `eventId` | Must preserve replay and dedupe behavior. |
| `eventType` matching message activity | `message.delta` or `message.done` | Depends on source event semantics. |
| `eventType` matching tool activity | `tool.start`, `tool.progress`, `tool.done`, or `tool.error` | Preserve actor and visibility. |
| `eventType` matching stage/step status | `workflow.step` | Include `stepId`, status, and label when available. |
| `eventType` matching approval state | `approval.request` or `approval.resolved` | Preserve Work OS approval linkage. |
| `eventType` matching artifact references | `artifact.created` or `artifact.updated` | Do not inline large artifact content. |
| `visibility` | canonical `visibility` | Map `private_internal` to debug/private-only rendering. |
| `ts` | `timestamp` | Preserve source timestamp. |

#### Approval Decision Mapping

| Source decision | Canonical decision | Notes |
|---|---|---|
| `approved` | `approved` | unchanged |
| `rejected` | `denied` | preserve `sourceDecision: "rejected"` |
| `expired` | `expired` | unchanged |
| `cancelled` | `cancelled` | unchanged |

### 6.5 Renderer Contract

Renderers consume canonical events, not source-specific runtime objects.

Renderer requirements:

- no renderer may call billing, approval, artifact mutation, or workflow mutation APIs directly without a typed action handler supplied by the host surface;
- renderer actions must return typed intents such as `approveApproval`, `denyApproval`, `openArtifact`, `downloadArtifact`, `retryStep`, or `stopRun`;
- host surfaces decide whether those intents are allowed based on existing permissions and feature flags;
- external renderer bridges must not receive private/debug-only events unless debug mode and permissions allow it.

Renderer intents should be explicit enough that SmartSpec React components and any optional external bridge can share the same host boundary:

```ts
type AgentExperienceIntent =
  | { type: "approval.approve"; approvalId: string; comment?: string }
  | { type: "approval.deny"; approvalId: string; reason?: string }
  | { type: "artifact.open"; artifactId: string; version?: number }
  | { type: "artifact.download"; artifactId: string; version?: number }
  | { type: "artifact.copy"; artifactId: string; version?: number; format?: AgentArtifactFormat }
  | { type: "workflow.retryStep"; workflowId: string; stepId: string }
  | { type: "workflow.stopRun"; runId: string; reason?: string }
  | { type: "debug.expandEvent"; eventId: string }
  | { type: "cost.confirm"; estimateId: string }
  | { type: "composer.attachFile"; fileId: string }
  | { type: "navigation.openTrace"; traceId: string };

type AgentExperienceIntentResult =
  | { ok: true; status?: string; event?: SmartSpecAgentEvent }
  | { ok: false; code: string; message: string; recoverable: boolean };
```

Host action rules:

- every intent handler must re-check tenant, user, role, feature flag, and source authority before mutation;
- intent handlers must be idempotent where retries can occur, especially approvals, stop run, retry step, and cost confirmation;
- intent results should return safe user-facing messages and avoid raw backend errors;
- external renderer bridges may emit intents, but may not hold direct references to tRPC clients, mutation hooks, billing services, approval services, or artifact services.

### 6.6 Contract Versioning And Validation

The event protocol is a product contract. It must be versioned, validated, and released with the same care as a public API even though Phase 0 is internal.

Versioning rules:

- `schemaVersion` must use a stable string literal such as `2026-06-22.v1`.
- The package must export a named constant, for example `AGENT_EXPERIENCE_SCHEMA_VERSION`, instead of duplicating string literals across adapters and tests.
- Adapters must include their own `adapterVersion` in test fixtures, debug output, or parse metrics so drift can be traced.
- Renderers must support the current schema version and may support one previous schema version during migration.
- Events with a higher unknown schema version must fail closed into a safe fallback path instead of being rendered as trusted UI.
- Breaking changes require a new schema version, fixture updates, and a migration note in this spec or its implementation section.

Validation rules:

- Define runtime schemas using the repository's existing validation approach. If Zod is already available in the target package graph, prefer Zod; otherwise keep Phase 0 dependency-free and validate with narrow TypeScript guards plus exhaustive tests.
- Unknown top-level `type`, `source`, `surface`, `visibility`, `redactionLevel`, artifact format, workflow status, or approval decision values must be rejected or mapped to debug-only output.
- Unknown extra fields inside known source payloads may be tolerated, but they must not become normal UI state without explicit mapping.
- Missing tenant identity, run/conversation identity for run-bound events, or approval ID for approval events must produce a dropped-event metric and a safe debug/error event only when authorized.
- Malformed source events must not crash the stream, renderer, or host page.

Adapter parse results should expose enough detail for tests and metrics:

```ts
type AgentExperienceParseResult = {
  events: SmartSpecAgentEvent[];
  dropped: Array<{
    reason: "malformed" | "missing_identity" | "unsupported_type" | "unauthorized_visibility" | "schema_version";
    sourceEventId?: string | null;
    sourceType?: string | null;
  }>;
};
```

This result type is for adapter and metric boundaries. Renderers should still receive only validated `SmartSpecAgentEvent[]`.

### 6.7 Contract Change Control And Deprecation

The protocol will be shared by multiple surfaces, so changes must be intentional and reviewable.

Change control rules:

- Additive event fields may be introduced behind tests and fixtures without changing `schemaVersion` when old renderers can safely ignore them.
- New event `type` values require mapping-table updates, golden fixtures, renderer fallback behavior, and release notes in the implementation plan.
- Existing event fields cannot change meaning without a new schema version.
- Removing an event field or changing required/optional status requires a deprecation window and fixture coverage for old and new shapes.
- Source-specific adapters must not silently reinterpret old source events after a schema change; preserve legacy mappings until the source stream itself is retired.
- All schema changes must update the review checklist and at least one golden fixture.

Deprecation rules:

- Support current and current-1 schema versions only after Phase 1 unless a live migration requires a longer window.
- Deprecated event fields should emit parse/usage metrics before removal so maintainers can see whether any surface still depends on them.
- The first implementation should include a lightweight schema changelog in `packages/agent-experience` or the feature directory.
- A renderer bridge may lag one schema version, but it must fail closed when it cannot safely render an event.

---

## 7. UX Scope

### 7.1 Internal Agent Experience Shell

The first internal UI target is not a website widget. It is a reusable shell/pattern for internal SmartSpecPro agent workflows.

Required shell capabilities:

- streaming response area;
- composer with text and existing attachment workflows;
- model/assistant identity controls using existing SmartSpecPro components;
- skill selector integration;
- cost estimate and message cost display;
- artifact pane;
- tool-call timeline;
- approval cards;
- reconnect/error state;
- debug toggle for authorized users only;
- responsive desktop/mobile layout;
- no regression to current direct chat behavior.

### 7.2 Artifact Pane

The artifact pane should reuse existing artifact storage and rendering first.

MVP formats:

- Markdown;
- JSON;
- HTML;
- image;
- video;
- table;
- code.

Behavior:

- support version history for versioned artifacts;
- support copy/download/open actions where existing permissions allow;
- support "send to another SmartSpecPro tool" only through existing safe handoff routes;
- mobile should use a drawer pattern rather than forcing a desktop side panel.

### 7.3 Approval UX

Approval cards must show:

- action name;
- tool/API/provider to be called;
- estimated credits when applicable;
- data summary that will be sent;
- expected output;
- risk level;
- expiration time;
- approve/deny/edit-request controls where backend supports them.

Backend remains authoritative:

- approval IDs must come from approved backend surfaces;
- approval decision must call existing tRPC/Python/Work OS approval path;
- UI cannot grant blanket approval for sensitive action families;
- browser/page actions must bind approvals to action context, target origin, payload digest, and expiry when applicable.

### 7.4 Tool Call Visualization

Tool calls should be visible but compact by default.

Normal users see:

- tool name;
- short human-readable status;
- queued/running/completed/failed;
- runtime duration when available;
- credit cost when applicable.

Debug users may expand:

- raw payload preview;
- redacted request/response;
- trace ID;
- provider/model;
- MCP request/response metadata;
- RAG sources;
- latency.

### 7.5 Developer Debugger

The debug view should build on current orchestration, monitoring, and runtime trace work. It should not invent a parallel trace store.

Authorized users can inspect:

- event stream;
- timestamps and latency;
- model/provider/runtime route;
- prompt/context size summary;
- tool input/output preview;
- MCP request/response preview;
- RAG sources;
- cost estimate/finalization;
- sanitized error stack/code;
- related artifact IDs and approval IDs.

Access must be limited to admins, developers, owners, or users with explicit debug permission.

### 7.6 UX Non-Functional Requirements

The internal shell and preview renderer must preserve the quality of existing SmartSpecPro surfaces.

Accessibility:

- All icon-only controls need accessible labels and visible focus states.
- Approval cards, cost confirmations, artifact actions, and stop/retry controls must be keyboard reachable.
- Streaming updates should not steal focus from the composer or active approval/action control.
- Reduced-motion users should not receive distracting timeline animations.
- Debug inspector content must remain navigable without horizontal-only scrolling on normal laptop widths.

i18n:

- New user-visible strings must support Thai and English.
- Technical/debug strings may remain English in debug-only views, but user-facing errors, approval prompts, cost confirmations, and rollback/fallback states need Thai/English coverage.
- Avoid using "Persona" in user-facing copy for this feature except when explicitly referring to the external `Runtype Persona` evaluation in developer/admin documentation.

Performance and perceived latency:

- The adapter layer must avoid O(n²) reprocessing of long event streams.
- Rendering should append/patch visible event groups rather than rebuild the entire timeline when possible.
- Large artifact previews should lazy-load through existing artifact/media paths.
- Debug payload expansion should be lazy and permission-gated.
- Shadow mode should sample or bound metrics work if full capture creates noticeable overhead.

---

## 8. Phased Roadmap

### Phase 0 — Protocol And Dependency Spike

**Goal:** Prove the adapter boundary before changing product UI.

Deliverables:

- `packages/agent-experience` or equivalent app-local module if package extraction is premature;
- `SmartSpecAgentEvent` schemas and test fixtures;
- adapters for Agency and Team run streams;
- no production/core-surface import of `@runtypelabs/persona` yet;
- evaluation note comparing existing UI vs Runtype Persona renderer capabilities;
- dependency risk report for bundle size, security, license, extension points, and version strategy.

Exit criteria:

- Agency stream events map to `SmartSpecAgentEvent`;
- Team run events map to `SmartSpecAgentEvent`;
- adapter tests cover unknown fields and malformed events;
- no existing UI behavior changes.

Value: High. Risk: Low.

### Phase 1 — Internal Agent Experience Foundation

**Goal:** Create a reusable internal UI layer around the protocol while preserving existing surfaces.

Deliverables:

- `AgentExperienceShell` prototype behind feature flag;
- artifact pane adapter using existing artifact router/service;
- tool-call timeline component;
- approval card adapter using existing approvals router;
- cost estimate/finalization display adapters;
- reconnect/error states;
- compatibility test suite v1.

Recommended rollout:

1. hidden admin/dev preview using recorded stream fixtures;
2. Agency Chat preview mode;
3. Team Room preview mode;
4. direct Chat integration only after stable.

Value: Very high. Risk: Medium.

### Phase 2 — Runtype Persona Renderer Bridge

**Goal:** Evaluate `@runtypelabs/persona` as an optional renderer without committing core product UX to it.

Deliverables:

- exact pinned dependency only if spike passes;
- `runtypePersonaBridge` module;
- SmartSpec event to Runtype Persona SSE mapping;
- theme bridge using SmartSpec tokens where public APIs allow;
- plugin/renderer bridge for artifacts, approvals, and tool calls;
- snapshot and accessibility checks for bridge-rendered flows.

Rules:

- do not import external renderer directly from core Chat/Agency/Team files;
- do not depend on external private APIs;
- do not fork external source;
- bridge must be removable without changing backend event semantics.

Value: Medium-high. Risk: Medium.

### Phase 3 — Production Approval, Credit, And Artifact UX

**Goal:** Make internal agent flows safe and understandable for real paid and risky work.

Deliverables:

- unified approval card patterns;
- credit estimate and expensive-action confirmation UX;
- artifact version and export UX improvements;
- workflow progress timeline;
- mobile artifact drawer;
- role/debug permission gates.

Backend requirements:

- approvals remain context-bound;
- credit reservation/finalization remains idempotent server-side;
- artifact access remains tenant/user scoped;
- debug payloads are redacted.

Value: Very high. Risk: Medium-high because billing, approval, and permissions are involved.

### Phase 4 — Skill-Specific Agent Renderers

**Goal:** Let SmartSpecPro skills render specialized outputs without one-off UI for every workflow.

Priority renderers:

| Renderer | Purpose |
|---|---|
| Image Prompt renderer | prompt editor, reference image cards, style locks |
| Video Storyboard renderer | shot cards, segment timeline, start/stop frame preview |
| Slide renderer | outline, slide preview, export controls |
| RAG renderer | citation viewer and document snippets |
| MCP renderer | permission cards and tool result viewer |
| Ecommerce renderer | product card, benefit table, ad script preview |
| Social Post renderer | platform preview for Facebook/TikTok/LINE |

Deliverables:

- renderer registry;
- renderer permission model;
- test harness for renderer fixture events;
- fallback renderer for unknown artifact/tool types.

Value: High. Risk: Medium.

### Phase 5 — Workflow Builder And Debug Integration

**Goal:** Connect the unified event model to workflow builder, Work OS, team runs, and admin debugging.

Deliverables:

- event stream inspector;
- visual workflow step tracking;
- node-level status;
- retry failed step where backend supports it;
- inspect redacted payload;
- inspect RAG retrieval;
- inspect credit usage;
- save session as workflow template where policy allows;
- admin audit log view links.

Value: High. Risk: Medium.

### Phase 6 — Internal Page Action Tools

**Goal:** Let the SmartSpecPro assistant control SmartSpecPro pages first, before customer websites.

Examples:

- Video Studio: create storyboard, generate image prompt, send to video model, render final video, export MP4.
- Slide Studio: create outline, generate slide draft, apply theme, export PPTX.
- Skill Marketplace: create skill draft, validate skill schema, publish skill, duplicate skill.

Security requirements:

- server-side tool registry;
- allowlist per surface;
- capability policy per action;
- audit log;
- approval for destructive, costly, external, publish, submit, send, delete, or cross-project actions;
- no raw browser DOM tool execution for sensitive actions without policy classification.

Value: Medium-high. Risk: High.

### Phase 7 — Customer Website Widget MVP

**Goal:** Only after internal UX is proven, create an embeddable assistant for customer websites.

Features:

- script tag install;
- public client token;
- website chat widget;
- theme options;
- basic RAG from website/document source;
- lead capture;
- human handoff placeholder;
- analytics dashboard;
- abuse/rate-limit protection.

This phase may use Runtype Persona more directly if the internal renderer bridge has proven stable. It must still use SmartSpecPro server-side policy, tenancy, rate-limit, and audit boundaries.

Value: Medium. Risk: Medium-high.

### Phase 8 — Customer Page Actions

**Goal:** Let customers expose controlled page actions to their assistant.

This phase is intentionally last.

Security requirements:

- explicit customer configuration;
- domain allowlist;
- action capability scopes;
- contextual human approval for sensitive actions;
- action audit log;
- rate limit per site;
- token rotation;
- legal/privacy review;
- fail-closed behavior for unknown contexts.

Value: High long-term. Risk: Very high.

### 8.1 Roadmap Prioritization Matrix

This matrix answers which roadmap items are worth doing first for SmartSpecPro, balancing product value, codebase fit, effort, and risk.

| Roadmap item | Product value | Codebase fit | Effort | Risk | Priority | Recommendation |
|---|---|---|---|---|---|---|
| Phase 0 protocol and fixtures | High | Very high | Low-medium | Low | P0 | Do first. It creates the safe contract for every later phase. |
| Phase 1 internal shell foundation | Very high | High | Medium | Medium | P0 | Do after Phase 0. It improves current internal workflows without public embed risk. |
| Phase 3 approval, credit, artifact hardening | Very high | High | Medium-high | Medium-high | P1 | Pull forward as soon as real preview traffic touches paid or risky actions. |
| Phase 5 workflow/debug integration | High | High | Medium | Medium | P1 | Valuable once protocol fixtures prove Team/Work OS trace alignment. |
| Phase 4 skill-specific renderers | High | Medium-high | Medium | Medium | P2 | Add selectively for high-usage skills after the base shell is stable. |
| Phase 2 Runtype Persona renderer bridge | Medium-high | Medium | Medium | Medium | P2 | Evaluate, but do not block internal SmartSpec renderer work on it. |
| Phase 6 internal page action tools | Medium-high | Medium | High | High | P3 | Useful, but only after approval/action policy is mature. |
| Phase 7 customer website widget | Medium | Medium | High | Medium-high | P4 | Defer until internal agent UX proves stable and supportable. |
| Phase 8 customer page actions | High long-term | Low-medium initially | Very high | Very high | P5 | Last. Requires separate security, legal, privacy, abuse, and customer-control specs. |

Priority interpretation:

- P0: required foundation; should be planned first.
- P1: high leverage after foundation; can run in parallel only if ownership is clear.
- P2: valuable enhancement; should not delay P0/P1 stabilization.
- P3-P5: future bets; keep scoped out until internal safety and operational readiness are proven.

The best near-term roadmap is: Phase 0 -> Phase 1 -> targeted Phase 3 hardening -> Phase 5 debug/workflow integration. Treat Runtype Persona as a parallel spike, not a dependency.

---

## 9. Architecture

### 9.1 Recommended Layering

```txt
Existing SmartSpecPro runtimes
  Chat / Agency / Team / Media / Workflow / Browser / Work OS
        |
        v
Source-specific adapters
  agencyStreamToAgentEvents
  runStreamToAgentEvents
  chatMessageToAgentEvents
  mediaTaskToAgentEvents
  approvalRecordToAgentEvents
  artifactRecordToAgentEvents
        |
        v
SmartSpec Agent Event Protocol
        |
        v
Agent Experience UI components
  Shell / Timeline / Approval / Artifact / Debug / Cost
        |
        v
Optional renderers
  Existing React components
  Runtype Persona bridge
  Future widget renderer
```

### 9.2 Package Strategy

The repository uses `npm@10.9.8` with npm workspaces. Do not introduce pnpm/yarn commands or lockfiles for this feature.

Decision for v0.1:

- start in `packages/agent-experience` because Agency and Team adapters are both in the recommended first slice;
- keep the package small and dependency-free for Phase 0;
- expose only schemas, adapter functions, fixtures, and test helpers at first;
- add UI components only after Phase 1 confirms that multiple surfaces consume the package.

Recommended package:

```txt
packages/
  agent-experience/
    package.json
    src/
      events.ts
      schemas.ts
      adapters/
        agencyStream.ts
        runStream.ts
        chat.ts
        artifacts.ts
        approvals.ts
        mediaTasks.ts
      renderers/
        registry.ts
      testing/
        fixtures.ts
```

Avoid creating:

```txt
packages/persona-adapter/
packages/persona-ui-kit/
packages/persona-protocol/
```

### 9.2.1 Package Public API Contract

Phase 0 should keep the package API intentionally small. Consumers should import only documented exports from the package root.

Recommended public exports:

```ts
export {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  type SmartSpecAgentEventEnvelope,
  type SmartSpecAgentEvent,
  type AgentExperienceEventSource,
  type AgentExperienceSurface,
  type AgentArtifactFormat,
  type AgentWorkflowStepStatus,
  type AgentExperienceParseResult,
  type AgentExperienceIntent,
  type AgentExperienceIntentResult,
} from "./events";

export {
  agencyStreamToAgentEvents,
  runStreamToAgentEvents,
} from "./adapters";

export {
  loadAgentExperienceFixture,
  listAgentExperienceFixtures,
} from "./testing";
```

API rules:

- do not export source-specific raw event types as canonical product contracts;
- do not export renderer-specific bridge internals from the package root;
- do not expose mutation helpers from the package;
- keep fixture helpers test-only or clearly marked as non-production utilities;
- every public export must have at least one typecheck or unit test consumer;
- breaking export changes require schema changelog, decision-log entry, and current/current-1 compatibility review.

### 9.3 Feature Flags

| Flag | Purpose |
|---|---|
| `agentExperienceLayer` | enables SmartSpec event protocol and internal preview UI |
| `agentExperienceShadowMode` | maps live source streams into canonical events without changing visible UI |
| `agentExperienceAgencyPreview` | enables Agency Chat preview surface |
| `agentExperienceTeamPreview` | enables Team Room preview surface |
| `agentExperienceChatPreview` | enables direct Chat preview surface after Agency/Team prove stable |
| `agentExperienceRuntypeRenderer` | enables optional external renderer bridge |
| `agentExperienceDebugInspector` | enables debug inspector for authorized users |
| `agentExperienceForceRollback` | highest-priority kill switch that disables all Agent Experience preview/bridge behavior |
| `agentExperienceWebsiteWidget` | future customer widget gate |
| `agentExperiencePageActions` | future page-action gate |

Registration requirements:

- add flags to `TenantFeatureFlags` in `apps/web/shared/featureFlags.ts`;
- add flags to `ALLOWED_FEATURE_FLAGS`;
- add explicit `false` defaults in `FEATURE_FLAG_DEFAULTS`;
- add admin discoverability in `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`;
- add tests that every new flag is declared, defaulted to `false`, and listed in admin grouping;
- `agentExperienceForceRollback=true` overrides all other Agent Experience flags;
- customer-facing flags (`agentExperienceWebsiteWidget`, `agentExperiencePageActions`) must remain non-operational placeholders until their future feature specs define separate security gates.

Flag semantics:

- `agentExperienceLayer`
  - allows loading the package, schemas, fixture preview, and internal preview code paths;
  - does not change source runtime behavior by itself.
- `agentExperienceShadowMode`
  - runs live stream adapters in observation mode;
  - records adapter parse/coverage metrics when safe;
  - does not change the user's visible UI.
- `agentExperienceAgencyPreview`, `agentExperienceTeamPreview`, `agentExperienceChatPreview`
  - allow explicitly selected preview rendering for that surface;
  - must keep the existing surface as the default until production beta approval.
- `agentExperienceRuntypeRenderer`
  - may only be honored when `agentExperienceLayer=true`;
  - must also satisfy dependency/bundle/security/rollback gates.
- `agentExperienceDebugInspector`
  - enables debug inspector UI only for authorized users;
  - does not bypass payload redaction.

Flag precedence:

| Condition | Expected behavior |
|---|---|
| `agentExperienceForceRollback=true` | Disable all Agent Experience preview, shadow, bridge, debug, widget, and page-action behavior regardless of other flags. |
| `agentExperienceLayer=false` | Do not activate package-driven preview paths. Shadow, preview, Runtype renderer, debug inspector, widget, and page-action flags are ignored. |
| `agentExperienceShadowMode=true`, preview flags `false` | Run adapters for observation/metrics only; visible UI remains existing Chat, Agency, or Team surface. |
| Surface preview flag `true`, `agentExperienceLayer=true` | Allow explicitly selected preview renderer for that surface; existing renderer remains fallback. |
| `agentExperienceRuntypeRenderer=true`, `agentExperienceLayer=true` | Use external renderer only if dependency gate passed; otherwise stay on SmartSpec renderer and record bridge-disabled reason. |
| `agentExperienceDebugInspector=true` | Show debug inspector only after role/permission and redaction checks pass. |
| Future customer flags `true` before their specs ship | No-op. Flags must not expose widget or page-action behavior without future security gates. |

Flag evaluation should be centralized in a small helper rather than duplicated across every surface. Tests should cover each precedence row.

---

## 10. Data, Security, And Privacy

### 10.1 Data Ownership

The adapter layer must not create a new source of truth for:

- message history;
- approvals;
- billing;
- artifacts;
- team run ledger;
- Work OS cases/tasks;
- media generation tasks;
- assistant persona settings.

It may create derived view models and ephemeral client state.

### 10.2 Redaction

Normal users must not see:

- raw provider API keys;
- OAuth tokens;
- MCP session IDs;
- unredacted prompt/context payloads;
- private RAG document content outside their permission scope;
- raw browser DOM payloads for sensitive actions;
- internal stack traces.

Debug users may see sanitized payloads only.

### 10.2.1 Data Classification Matrix

Every canonical event field, preview, fixture, and metric should fit one of these classes before it is rendered, persisted, or logged.

| Class | Examples | Normal UI | Debug UI | Fixtures | Metrics/logs |
|---|---|---|---|---|---|
| Public UI metadata | safe status labels, event type, workflow step label, artifact title after permission check | allowed | allowed | allowed if synthetic | allowed |
| Tenant-scoped identity | tenant ID, user ID, room ID, run ID, conversation ID, artifact ID, approval ID | allowed only when scoped to current tenant/user permission | allowed with role gate | synthetic or redacted only | hashed/redacted when possible |
| Sensitive payload summary | prompt/context summary, tool args preview, provider result preview, RAG snippet summary | bounded and redacted only when user has permission | sanitized and role-gated | synthetic/redacted only | reason codes or hashes, not raw text |
| Private/internal debug payload | raw request/response, MCP metadata, stack trace, internal policy decision payload | never | sanitized, role-gated, redaction enforced | do not commit unless synthetic | do not log raw payload |
| Secret/credential material | API keys, OAuth tokens, signed URLs, MCP session tokens, storage paths | never | never | never | never |
| Billing/approval authority data | credit reservation IDs, approval decision actor, action digest, audit link | display safe summaries only | allowed when role-gated | synthetic/redacted only | allowed as IDs/reason codes where safe |

Classification rules:

- Anything not classified must default to private/internal and be hidden from normal renderers.
- Signed URLs should be treated as secret material unless the existing artifact/media service explicitly provides short-lived, permissioned display URLs.
- Renderer bridges may receive only public UI metadata, permissioned tenant-scoped identity, and bounded sensitive summaries after host filtering.
- Fixture review must reject raw customer prompts, raw provider payloads, tokens, signed URLs, and tenant-identifiable examples.

### 10.3 Approval Integrity

Approval events must preserve:

- tenant ID;
- actor/user identity;
- work case/run/task identity when present;
- target action;
- risk level;
- expiry;
- decision;
- decision actor;
- audit link.

Browser/page action approvals must also bind to:

- target origin;
- normalized action details;
- action digest;
- payload preview hash;
- page context fingerprint when available.

### 10.4 Billing Integrity

Cost estimates in UI are advisory. Credit reservations, deductions, releases, refunds, and finalization must happen server-side through existing credit/budget services.

### 10.5 Trace And Checkpoint Reuse

This feature must reuse or align with the runtime persistence direction from Feature 101 and related Team/Auto-Team work.

Do not create a parallel trace or checkpoint store for the Agent Experience layer.

Trace/debug projections should reuse or map to:

- `agent_runtime_traces` for generic redacted runtime archives across Chat, Responses/shared skill runtime, and cross-surface debugging when that table is present;
- `agent_runtime_checkpoints` for generic Chat/Responses/shared-skill human-in-the-loop pause/resume when that table is present;
- `auto_team_trace_events` for Team-facing event playback;
- `auto_team_execution_stages` for durable Team/Auto-Team stage state;
- `auto_team_review_records` for reviewer verdicts and repair loops;
- `auto_team_artifact_refs` for Team artifact references;
- `team_room_messages.metadataJson` for visible chat-to-step/trace links;
- `work_approvals` and `work_automation_run_checkpoints` for Work OS-backed approval/resume.

Adapter output may carry trace identifiers and summaries, but persistence remains owned by the existing runtime services.

### 10.6 Artifact Security And Size Rules

Artifact UI must treat canonical artifact events as pointers, not trusted content blobs.

Rules:

- `artifact.created` and `artifact.updated` events should carry IDs, format, title, version, and safe preview metadata only;
- large content must be loaded through existing artifact/media/library access paths after permission checks;
- HTML artifacts must render only through an existing sanitized/sandboxed viewer;
- image/video/download URLs must be signed or access-controlled by existing services;
- `contentPreview` must be size-bounded, redacted, and safe for display in normal UI;
- raw provider output, worker logs, storage paths, and private manifests must not appear in normal artifact panes;
- version history must continue to use existing artifact storage/version rules where available;
- renderer bridges must never receive unsanitized HTML or privileged URLs.

### 10.7 Feature Flag And Rollback Rules

Every rollout phase must be reversible by flag.

Rollback requirements:

- `agentExperienceLayer=false` returns all surfaces to existing behavior;
- preview flags must not change source runtime behavior;
- external renderer bridge failures fall back to SmartSpec React components;
- adapter parse failures should degrade to existing source UI or safe error display;
- no migration in this feature may be destructive;
- dependency installation must be separately reversible by branch/lockfile diff.

### 10.8 Operator Rollback Playbook

Every production or tenant beta rollout must have a short operator playbook before enablement.

Minimum rollback steps:

1. Set `agentExperienceForceRollback=true` for the affected tenant or environment.
2. Confirm preview flags no longer affect Chat, Agency Chat, Team Room, or hidden preview routes.
3. Confirm existing legacy stream rendering still works for the affected surface.
4. Review adapter parse/fallback/error metrics for the rollback window.
5. If `agentExperienceRuntypeRenderer` was enabled, disable it separately and confirm the SmartSpec React renderer fallback works.
6. If the issue involved approvals, billing, artifacts, or cross-tenant visibility, freeze wider rollout until the backend audit confirms no unsafe side effects.

Rollback drills should be tested before internal production beta, not during the first incident.

### 10.9 Privacy, Retention, And Delete Behavior

The adapter layer should minimize retained data and inherit existing data lifecycle policies.

Rules:

- Canonical events in client state should be ephemeral unless an existing runtime, Team, Work OS, artifact, approval, or trace service explicitly persists the underlying source record.
- New fixtures must be synthetic or redacted. Do not commit customer prompts, private tool payloads, provider responses, access tokens, signed URLs, or tenant-identifiable production data.
- Debug payload previews must follow the retention/deletion behavior of their source trace or log system.
- Artifact previews must be removable when the underlying artifact/media/library record is deleted or access is revoked.
- If a user or tenant deletion request removes source messages, artifacts, approvals, traces, or work records, Agent Experience projections must not preserve independent copies.
- Metrics should avoid raw text and payload content. Prefer counters, reason codes, source/surface names, schema versions, and redacted identifiers.
- Schema changelogs and fixture files must not include sensitive examples.

### 10.10 Threat Model Checklist

Before tenant beta, create or update a short threat model for this feature.

Minimum threats to cover:

| Threat | Required control |
|---|---|
| Malicious or malformed SSE/source events | runtime validation, dropped-event reporting, safe fallback |
| Cross-tenant event or artifact reference | tenant/server-authoritative identity checks and negative tests |
| Debug payload exposure | role gate, redaction, private visibility filtering |
| Approval spoofing or replay | backend-authoritative approval ID, action context binding, audit verification |
| Billing/cost manipulation | server-side credit reservation/finalization only |
| Artifact preview XSS or privileged URL leak | sanitized/sandboxed rendering and signed/access-controlled URLs |
| External renderer supply-chain risk | dependency gate, exact pin, isolated bridge, rollback plan |
| Prompt/tool payload leakage in fixtures or logs | synthetic/redacted fixtures and content-free metrics |
| Page-action privilege escalation in future phases | explicit deferral, server-side action registry, scoped approvals |

Threat model review is a release blocker for any tenant beta that enables live streams, artifact previews, approval cards, cost confirmations, or external renderer bridges.

---

## 11. Compatibility Test Matrix

| Area | Required coverage |
|---|---|
| Streaming chat | token delta, message done, multi-agent switch, reconnect |
| Tool calls | start, progress, done, error, unknown payload fields |
| Approvals | request, approve, deny, expire, cancel, backend failure |
| Artifacts | markdown, JSON, HTML, image, video, table/code, version update |
| Files | upload preview, remove, send with message where current surface supports it |
| Theme | light, dark, tenant brand tokens, high contrast risk |
| Debug mode | event log, latency, payload preview, trace ID |
| Credits | estimate, confirmation, finalization display, refund/release state |
| Errors | API error, model error, tool error, network error, malformed SSE |
| Mobile | composer, artifact drawer, approval card, timeline |
| Access control | normal user, owner, admin, developer/debug role, cross-tenant denial |
| External renderer bridge | same fixtures render through bridge without private API usage |
| i18n | Thai/English strings for all new user-visible states |
| Accessibility | keyboard navigation, focus visibility, ARIA labels for icon controls, reduced-motion compatibility |
| Rollback | flags disabled restore existing Chat, Agency, and Team behavior |

### 11.1 Dependency And Bundle Gates

Before enabling `@runtypelabs/persona` beyond gated bridge evaluation, the spike must produce or update a dependency gate report covering:

- exact package version and license;
- dependency tree and install diff;
- bundle-size impact for `apps/web`;
- CSS/theme isolation and style bleed risk;
- Shadow DOM or DOM ownership behavior, if applicable;
- accessibility parity for keyboard, focus, screen reader labels, and reduced motion;
- mobile drawer/layout parity with existing SmartSpec UI;
- private API usage check;
- supply-chain audit result;
- uninstall/rollback steps.

### 11.2 Golden Fixture Requirements

Phase 0 must ship with golden fixtures before any live preview is enabled.

Required fixture sets:

| Fixture | Must prove |
|---|---|
| Agency happy path | `meta`, `text_delta`, `tool_start`, `tool_progress`, `tool_end`, `run_complete` map in order. |
| Agency legacy path | `token`, `tool_call`, `tool_result`, legacy finish events map without regression. |
| Agency approval path | `approval_required`, approval resolution, timeout/error fallback behavior. |
| Agency malformed path | invalid JSON, unknown event, missing tool ID, missing run ID fail safely. |
| Team run path | `RunStreamEvent` identity, visibility, step status, actor metadata, and timestamp preservation. |
| Team private/internal path | `private_internal` events are hidden from normal renderers and visible only in authorized debug view. |
| Artifact path | artifact IDs, versions, formats, and preview metadata map without inline privileged content. |
| Approval decision path | source `rejected` normalizes to canonical `denied` with `sourceDecision` preserved. |
| Rollback path | all preview flags disabled restore legacy rendering expectations. |

Fixture files should live in `packages/agent-experience/src/testing/fixtures/` and be small enough for unit tests. Large payloads should be represented by redacted summaries or content hashes.

### 11.2.1 Fixture Naming And Versioning

Fixture names should be stable, searchable, and tied to the behavior they prove.

Recommended naming pattern:

```txt
<surface>.<scenario>.<schemaVersion>.fixture.json
```

Examples:

- `agency.happy-path.2026-06-22-v1.fixture.json`
- `agency.malformed-missing-tool-id.2026-06-22-v1.fixture.json`
- `team.private-internal-visibility.2026-06-22-v1.fixture.json`
- `approval.rejected-to-denied.2026-06-22-v1.fixture.json`
- `rollback.flags-off-legacy-rendering.2026-06-22-v1.fixture.json`

Fixture metadata should include:

```ts
type AgentExperienceFixtureMetadata = {
  fixtureId: string;
  schemaVersion: string;
  adapterVersion?: string;
  surface: AgentExperienceSurface;
  source: AgentExperienceEventSource;
  scenario: string;
  synthetic: boolean;
  redactionReviewed: boolean;
  expectedEventTypes: string[];
  expectedDroppedReasons?: string[];
  relatedRequirement?: string;
};
```

Rules:

- fixture IDs must be unique and listed in `fixture-inventory.md`;
- production-derived fixtures must be redacted before commit and marked `synthetic: false`;
- prefer synthetic fixtures unless production shape is impossible to model safely;
- every fixture should state expected canonical event types and dropped reasons;
- schema version bumps require either fixture updates or explicit current/current-1 compatibility fixtures.

### 11.3 Test Ownership

Minimum tests for the first implementation slice:

- package unit tests for event schemas and adapter functions;
- feature flag declaration/default/admin grouping tests;
- golden fixture tests for Agency and Team adapters;
- negative tests for malformed payloads and missing identity;
- renderer contract tests proving renderer intents do not call mutations directly;
- no-regression smoke tests that current Chat, Agency Chat, and Team Room render paths remain default when flags are off.

Use existing project conventions:

- `vitest` for package and app tests;
- React Testing Library for component-level preview UI tests;
- `npm --prefix apps/web test -- ...` for web tests;
- root `npm run typecheck` or package-specific typecheck when implementation touches shared TypeScript.

### 11.4 Verification Command Matrix

Implementation plans should replace placeholders with exact file paths once tests exist. Until then, use this matrix as the expected verification shape.

| Gate | Example command | Required before |
|---|---|---|
| Agent Experience package tests | `npm --workspace @smartspec/agent-experience test` or the package's actual npm script | merging adapter/package work |
| Web shared feature flag tests | `npm --prefix apps/web test -- apps/web/shared/__tests__/<agent-experience-flags>.test.ts` | enabling any Agent Experience flag in code |
| App component tests | `npm --prefix apps/web test -- <agent-experience-preview-or-renderer-tests>` | enabling preview UI for any surface |
| Typecheck | `npm run typecheck` or narrower workspace typecheck if the repo standard supports it | merging shared TypeScript changes |
| Bundle/dependency gate | existing bundle/dependency audit command or documented manual report | enabling `@runtypelabs/persona` beyond gated bridge evaluation |
| Security regression gate | targeted tests for redaction, cross-tenant denial, approval routing, and artifact access | tenant beta |
| Flag-off regression smoke | documented smoke path for Chat, Agency Chat, and Team Room with all preview flags off | every staged rollout |

Verification evidence should record:

- command executed;
- git SHA or branch;
- feature flag state;
- fixture set version;
- pass/fail result;
- known waivers with owner and expiry.

### 11.5 Production Beta Metrics

Internal production beta cannot proceed until the implementation can capture these metrics or explicitly document why a metric is unavailable:

| Metric | Purpose |
|---|---|
| adapter parse success rate | Detect malformed stream coverage and unknown event drift. |
| adapter fallback rate | Detect how often preview rendering falls back to legacy UI. |
| stream reconnect rate | Detect transport instability. |
| time to first token/event | Detect UX latency regression. |
| approval card completion rate | Detect approval usability issues. |
| approval abandonment/expiry rate | Detect unclear or poorly timed approval prompts. |
| artifact open/download error rate | Detect permission or signed URL regressions. |
| cost confirmation abandonment rate | Detect cost UX friction. |
| debug inspector access denial count | Detect permission misconfiguration or attempted misuse. |
| Runtype renderer bridge error rate | Detect external renderer instability when enabled. |

Go/no-go recommendation for beta:

- zero known cross-tenant data exposure issues;
- zero billing finalization from client state;
- zero approval decisions accepted without backend confirmation;
- adapter parse success rate >= 99% for enabled preview surfaces;
- no P0/P1 UI regressions in current Chat, Agency Chat, or Team Room with flags off;
- documented rollback drill for disabling all Agent Experience flags.

### 11.6 Alert And Triage Expectations

Production beta should not rely on dashboards that only the implementer understands. Define alert thresholds and triage ownership before widening rollout.

Minimum alert candidates:

| Signal | Suggested trigger | First triage owner |
|---|---|---|
| Adapter parse success rate | below beta gate threshold for 15 minutes | frontend/platform owner |
| Adapter fallback rate | sudden spike after deploy or flag change | frontend owner |
| Cross-tenant/access denial anomaly | any confirmed unauthorized access path | security/backend owner |
| Approval backend failure rate | sustained increase or clustered failures | Work OS/backend owner |
| Artifact open/download error rate | sustained increase for enabled tenants | artifact/media owner |
| Runtype renderer bridge error rate | spike after dependency or flag change | bridge owner |
| Stream reconnect rate | sustained increase per surface | runtime/platform owner |

Triage rules:

- security, tenant isolation, approval, and billing issues block rollout expansion immediately;
- renderer-only issues should disable `agentExperienceRuntypeRenderer` first and keep SmartSpec renderer fallback active;
- adapter parse drift should first switch affected surfaces back to legacy rendering while fixtures are updated;
- every beta incident must record whether rollback was required and whether fixtures need expansion.

### 11.7 Performance Budgets

Budgets should be measured against the existing surface before preview rollout. The numbers below are initial targets and may be tightened after baseline measurement.

| Area | Initial budget |
|---|---|
| Adapter parse overhead | p95 under 10 ms for a normal single event batch on supported browsers/devices. |
| Timeline append/update | no visible typing or scroll jank for normal Agency and Team fixture sizes. |
| Time to first token/event | no regression greater than 100 ms versus existing surface baseline in preview mode. |
| Shadow mode overhead | no user-visible regression; disable or sample shadow metrics if overhead is measurable. |
| Artifact preview load | lazy-load large content; initial shell must stay responsive while artifact fetch is pending. |
| Debug inspector expansion | lazy-load or compute payload previews only when expanded and authorized. |
| External renderer bundle impact | must be documented before dependency install and accepted before tenant beta. |

Performance tests do not need to be elaborate in Phase 0. They should at minimum include deterministic fixture-size checks and a documented baseline before live preview.

### 11.8 Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Parallel runtime ledger accidentally created | Team/Work OS/debug views disagree about source of truth | Keep adapter state derived only; reuse Feature 101, Team, Auto-Team, and Work OS trace/checkpoint stores. |
| Cross-tenant or private debug payload leak | Critical data exposure | Filter by tenant, visibility, and debug permission before renderer input; add private/internal fixture tests. |
| External renderer imports private APIs or grows bundle size unexpectedly | Upgrade fragility and performance regression | Require dependency/bundle gate before enabling `@runtypelabs/persona` beyond gated bridge evaluation; isolate behind `runtypePersonaBridge`. |
| Approval decision semantics mismatch | Risky action approved or denied incorrectly | Normalize source decisions explicitly; route all decisions through existing backend approval paths. |
| Cost estimate treated as billing finalization | Credit/budget integrity issue | Keep estimates advisory; server remains authoritative for reservation, deduction, release, refund, and finalization. |
| Artifact event carries trusted or oversized content | XSS, data leak, memory/performance regression | Treat artifact events as pointers; load content through permissioned artifact/media paths; bound and redact previews. |
| Feature flags drift between TS, JS, defaults, and admin grouping | Rollout or rollback behaves unpredictably | Add flag declaration/default/admin grouping tests and make `agentExperienceForceRollback` override all preview flags. |
| New names collide with existing SmartSpecPro persona system | Developer confusion and wrong integration points | Enforce the naming policy in code review and tests; avoid package/module/flag names that use `persona` for SmartSpec-owned concepts. |
| Schema version drift between adapters and renderers | Preview UI renders stale or unsafe data | Export schema/version constants, validate runtime payloads, and reject unsupported future versions. |
| Malformed stream event crashes a live session | User-visible outage | Use adapter parse results with dropped-event reporting; render safe fallback or keep legacy UI active. |
| Fixtures or debug projections retain sensitive data | Privacy and compliance issue | Require synthetic/redacted fixtures, source-owned retention, and content-free metrics. |
| Stream rendering regresses typing latency | Agent UX feels slower than current Chat/Agency/Team surfaces | Establish performance budgets and compare preview mode against baseline before rollout. |

Risk review is required before moving from Phase 0 to Phase 1 and before any tenant beta.

---

## 12. Rollout Plan

1. **Read-only protocol fixtures**
   - Add event schema and fixture tests.
   - No UI changes.

2. **Internal preview route**
   - Render fixture events with SmartSpec components.
   - No live production stream binding.

3. **Agency Chat preview**
   - Map `useAgencyStream` state/events into the protocol.
   - Keep current Agency Chat as default.

4. **Team Room preview**
   - Map `useRunStream` events into the protocol.
   - Keep Team Room UI as default.

5. **Artifact and approval hardening**
   - Reuse existing routers/services.
   - Add missing mobile/debug states.

6. **Optional Runtype Persona bridge**
   - Enable only for dev/admin preview.
   - Pin exact version.
   - Run compatibility tests.

7. **Internal production beta**
   - Enable for selected tenants/users.
   - Capture UX, error, latency, approval, and cost metrics.

8. **Future customer widget**
   - Start only after internal beta meets acceptance criteria.

### 12.1 Surface Adoption Criteria

Do not move a surface from fixture preview to live preview until the surface passes its adoption gate.

| Surface | May enter live preview when | Must remain legacy/default when |
|---|---|---|
| Agency Chat | Agency happy, legacy, approval, malformed, rollback, and cost fixtures pass; preview can fall back to current Agency UI. | live stream parse success is below threshold, approval/cost mapping is incomplete, or reconnect behavior regresses. |
| Team Room | Team run, private/internal, artifact, workflow step, rollback, and visibility fixtures pass. | private/internal filtering is unproven, Team ledger mapping is ambiguous, or event ordering/dedupe breaks replay. |
| Direct Chat | Agency and Team previews are stable and chat message lifecycle fixtures exist. | direct Chat would require changing default `ChatView` behavior before shared adapters are proven. |
| Media Studio | artifact, cost, provider-error, and long-running task fixtures exist. | artifact preview security, provider task status mapping, or cost finalization source is unresolved. |
| Workflow Builder / Work OS | workflow step, checkpoint, approval, retry, and audit-link fixtures exist. | Work OS remains authoritative but mapping cannot preserve work case/task/run identity. |
| Admin Debug | tenant filtering, role filtering, redaction, and denial metrics pass. | any raw payload, cross-tenant data, or private/internal event can reach an unauthorized renderer. |

Default posture:

- fixture preview comes before shadow mode;
- shadow mode comes before live preview;
- live preview comes before default replacement;
- default replacement is out of scope for MVP unless a later implementation plan explicitly approves it.

### 12.2 Ownership And Handoff Matrix

Before Phase 1 preview reaches real tenant traffic, assign concrete owners for each operational class. The names below describe ownership areas; implementation planning should replace them with team/person ownership.

| Area | Primary responsibility | Handoff requirement |
|---|---|---|
| Event protocol/package | schema versions, adapter parse behavior, fixture coverage | package README, schema changelog, fixture update guide |
| Agency stream adapter | Agency event mapping, reconnect/fallback semantics | source event mapping table kept current with `useAgencyStream` changes |
| Team run adapter | Team/Orchestrator visibility, actor, run, stage, and artifact mapping | mapping reviewed whenever Team run event types change |
| Preview renderer | SmartSpec React rendering, renderer intents, UI fallback | flag-off and fallback smoke checklist |
| Approval adapter | backend approval state, decision normalization, Work OS linkage | approval routing and audit evidence |
| Artifact adapter | artifact pointers, signed/access-controlled loading, version rendering | artifact permission and preview-size checklist |
| Cost events | advisory estimates and finalized server-side billing display | credit/budget service source documented |
| Debug inspector | redaction, tenant filtering, role access | debug permission policy and denial metrics |
| Runtype renderer bridge | optional external renderer, bundle/security gate, bridge fallback | dependency gate report and uninstall/rollback note |

Handoff is incomplete if a rollout operator cannot answer:

- which flag disables the affected behavior;
- which metric confirms recovery;
- which fixture should be expanded after a new stream/event failure;
- which backend service remains authoritative for approval, billing, artifact, or runtime state.

### 12.3 Phase Gate Evidence

Each phase should produce a small evidence artifact before moving forward. This can be a markdown note inside the feature directory or an implementation-plan section.

| Phase | Required evidence |
|---|---|
| Phase 0 | schema/adapter test results, fixture list, no-dependency confirmation, flag defaults confirmation |
| Phase 1 | fixture preview screenshots or component test evidence, renderer intent tests, flag-off regression evidence |
| Phase 2 | dependency/bundle/security report, bridge isolation proof, fallback proof |
| Phase 3 | approval, billing, artifact, redaction, and mobile regression evidence |
| Phase 4 | renderer registry tests and fallback renderer evidence |
| Phase 5 | debug/workflow trace linkage evidence and permission-denial tests |
| Phase 6 | server-side action registry, approval policy, and audit evidence |
| Phase 7 | public widget threat model, token/rate-limit evidence, abuse controls |
| Phase 8 | customer action scope model, legal/privacy review, domain allowlist, fail-closed tests |

Do not treat a phase as complete only because code merged. The phase is complete when the relevant evidence exists and rollback has been rehearsed for any live traffic phase.

---

### 12.4 Requirement-To-Test Traceability

Implementation planning should preserve traceability from requirement to test/evidence. The first implementation plan should turn this matrix into concrete test files and commands.

| Requirement | Primary evidence | Minimum test/evidence type |
|---|---|---|
| Canonical event envelope and schema versioning | schema unit tests and fixture snapshots | package tests for valid/invalid events and unsupported versions |
| Agency source mapping | Agency golden fixtures | adapter tests for happy, legacy, approval, malformed, and rollback paths |
| Team source mapping | Team golden fixtures | adapter tests for event identity, visibility, actor metadata, step state, and private/internal filtering |
| Dropped-event diagnostics | parse result tests | negative tests for malformed, missing identity, unsupported type, unauthorized visibility, and schema version |
| Renderer intent boundary | renderer contract tests | tests proving renderer emits intents and cannot directly call mutation paths |
| Feature flag precedence | flag helper tests | tests for force rollback, layer disabled, shadow-only, preview, external renderer, debug, and future no-op flags |
| Artifact safety | artifact adapter/security tests | tests proving events carry pointers/previews only and content loads through permissioned paths |
| Approval integrity | approval adapter/router tests | tests for decision normalization, backend confirmation, action context, and audit linkage |
| Cost integrity | cost adapter/service tests | tests proving estimates are advisory and finalized billing remains server-side |
| Debug redaction | security tests | tests for role gates, redaction, private/internal filtering, and denial metrics |
| Data classification | fixture and security review evidence | fixture lint/review checklist plus tests for secret/signed URL rejection where feasible |
| UX accessibility/i18n | component tests or browser evidence | keyboard/focus/label/reduced-motion checks and Thai/English copy coverage for new states |
| Performance budgets | baseline and fixture-size measurements | documented baseline plus adapter/render timing checks before live preview |
| Rollback | smoke tests/runbook evidence | flags-off regression for Chat, Agency Chat, Team Room and rollback drill record |
| External renderer bridge | dependency gate report | bundle/security/license/accessibility report plus bridge fallback tests |

Traceability rules:

- A requirement cannot move to tenant beta with only prose evidence unless the implementation plan records why automated testing is impractical.
- Every new canonical event type must add at least one fixture and one renderer fallback or display expectation.
- Every new mutation intent must add a host-handler authorization test or documented backend test.
- Every new debug payload field must update data classification and redaction tests.

### 12.5 Canary Stage Gates

Tenant beta should progress through explicit stages. Do not skip stages unless a decision-log entry explains why and the release owner signs off.

| Stage | Scope | Entry gate | Exit gate | Abort trigger |
|---|---|---|---|---|
| `fixture_only` | local/package/component fixtures | schema, adapter, and negative tests pass | fixture preview renders without mutation paths | fixture coverage gaps or redaction failures |
| `shadow_internal` | internal users only, legacy UI visible | flag precedence tests pass; shadow metrics are safe | parse/fallback metrics stable; no visible UI regression | measurable latency overhead or parse drift |
| `preview_internal` | internal users explicitly opting into preview UI | surface adoption criteria pass | flag-off smoke and rollback drill pass | approval, billing, artifact, or debug gate failure |
| `selected_tenants` | small tenant cohort with named owner | threat model, release evidence, triage owners, and rollback drill complete | beta metrics meet thresholds for agreed dwell window | cross-tenant issue, billing/approval integrity issue, or parse success below gate |
| `ramp_25` | limited broader cohort | selected tenant stage is green | no P0/P1 regression and no unresolved security waiver | SLO breach, rollback failure, or unsupported event spike |
| `ramp_50` | expanded cohort | ramp 25 evidence is green | same gates remain green with higher traffic | same as above |
| `ramp_100` | broad tenant availability | final go/no-go signoff complete | launch evidence archived | any release-blocking incident |

Minimum dwell windows and exact cohort sizes should be set by the implementation plan. Security, tenant isolation, approval, billing, artifact access, and rollback failures are hard aborts at every stage.

### 12.6 Waiver Policy

Waivers are allowed only for non-critical gaps and must be time-boxed.

Waiver rules:

- no waiver may bypass cross-tenant safety, approval integrity, billing authority, secret redaction, or rollback readiness;
- every waiver must include owner, reason, impacted gate, expiry date, revisit trigger, and mitigation;
- waivers must be visible in `release-evidence.md`;
- expired waivers block stage progression;
- repeated waiver extensions require a decision-log entry;
- tenant beta cannot proceed with open critical/high security or data-integrity waivers.

Suggested waiver shape:

```md
- waiver_id:
  gate:
  reason:
  owner:
  expires_on:
  mitigation:
  revisit_trigger:
```

### 12.7 Reviewer And Signoff Model

Before live preview or tenant beta, review must cover more than implementation correctness.

Required reviewers by gate:

| Gate | Required signoff |
|---|---|
| Phase 0 package merge | package/API owner and test owner |
| first fixture preview | frontend owner and package/API owner |
| first shadow mode | frontend owner, runtime/platform owner, and observability owner |
| first live preview | frontend owner, runtime/platform owner, security/backend owner, and rollback owner |
| approval/cost/artifact preview | Work OS/backend owner, billing/credit owner, artifact/media owner, and security owner |
| debug inspector preview | security owner and platform/admin owner |
| Runtype renderer bridge | dependency/security owner, frontend owner, and rollback owner |
| selected tenant beta | release owner, frontend owner, backend/runtime owner, security owner, support/ops owner |
| ramp stages | release owner plus any owner for a changed or previously failing gate |

Signoff rules:

- signoff must reference evidence artifacts, not only verbal approval;
- any reviewer may block rollout for their owned gate;
- unresolved critical/high findings block live preview and tenant beta;
- signoff should be recorded in `launch-decision-log.md` for beta/ramp stages;
- implementation-only approval is not enough for customer-facing widget or page-action phases.

## 13. Acceptance Criteria

MVP is acceptable when:

- SmartSpec-owned event protocol exists, includes canonical metadata envelope fields, and is tested.
- Schema version constants, runtime validation, and unsupported-version fail-closed behavior are tested.
- Contract change-control, deprecation, and schema changelog rules exist before the first schema change after Phase 0.
- Source-to-canonical mapping tables exist for Agency and Team streams.
- Agency and Team stream adapters pass fixture tests.
- Adapter parse results report dropped malformed, unsupported, missing-identity, unauthorized-visibility, and schema-version events.
- Renderer intent contract exists and host handlers re-check tenant, user, role, feature flag, and backend authority before mutation.
- Package public API exports are intentionally small, documented, and covered by typecheck or unit-test consumers.
- Golden fixtures cover happy path, legacy path, approval path, malformed payloads, private/internal Team events, artifact pointers, and rollback behavior.
- Fixture naming, metadata, schema versioning, redaction status, expected event types, and expected dropped reasons are documented in fixture inventory.
- Feature flags are registered in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, `FEATURE_FLAG_DEFAULTS`, and admin grouping with false defaults.
- Feature flag precedence is implemented through a shared helper and tested, including force rollback, layer disabled, shadow-only, preview, external renderer, debug inspector, and future no-op flags.
- Existing Chat, Agency, and Team Room behavior remains unchanged when flags are off.
- Artifact and approval UI can render from protocol events.
- Approval decision normalization maps source `rejected` to canonical `denied`.
- Trace/debug output reuses or aligns with existing runtime trace/checkpoint stores instead of creating a parallel ledger.
- Artifact previews are bounded, redacted, and loaded through existing permissioned artifact/media paths.
- Data classification rules are applied before event fields, previews, fixtures, metrics, logs, or renderer bridge payloads are exposed.
- Privacy, retention, delete, and fixture redaction behavior is documented and tested where implementation creates projections, fixtures, metrics, or debug previews.
- Tenant beta has a threat model covering malformed streams, cross-tenant references, debug exposure, approval spoofing, billing manipulation, artifact XSS, external renderer supply-chain risk, and fixture/log leakage.
- Debug inspector is permission-gated.
- UX non-functional requirements cover accessibility, Thai/English i18n, focus behavior, reduced motion, and responsive debug/approval/artifact states.
- Naming policy is followed: no new SmartSpec package/module/flag uses `persona` as its primary feature name.
- Runtype Persona, if installed, is pinned and isolated behind `runtypePersonaBridge`.
- Runtype Persona, if installed, has a dependency/bundle/security/rollback gate report.
- Compatibility tests cover at least streaming, tool calls, approval, artifacts, errors, mobile layout, i18n, accessibility, and rollback.
- Verification command matrix is updated with real test file paths/scripts when implementation begins.
- Performance budgets are measured against the existing surface before live preview rollout.
- Internal beta has measurable parse success, fallback, reconnect, approval, artifact, cost, and bridge-error metrics.
- Alert and triage ownership exists for stream, adapter, approval, artifact, billing/cost, debug, and renderer bridge failures.
- Surface adoption criteria are satisfied before any surface moves from fixture preview to shadow mode, live preview, or default replacement.
- Phase gate evidence exists before moving from fixtures to live preview and before moving from preview to tenant beta.
- Requirement-to-test traceability exists for schema, adapters, dropped events, renderer intents, flags, artifacts, approvals, cost, debug, classification, UX, performance, rollback, and external bridge gates.
- Canary stage gates define entry, exit, and abort criteria before tenant beta or ramp rollout.
- Waivers are time-boxed, owner-assigned, visible in release evidence, and cannot bypass critical safety, billing, approval, redaction, or rollback gates.
- Reviewer/signoff model is satisfied for package merge, preview, shadow mode, live preview, dependency bridge, tenant beta, and ramp gates.
- Roadmap prioritization remains P0/P1-first unless a documented decision changes dependency order.
- MVP scope stays inside the MVP boundary matrix unless a decision-log entry explicitly expands it.
- Definition of Ready is satisfied before creating the detailed implementation plan, and Definition of Done is satisfied before calling the MVP complete.
- Open questions have phase-specific blocking gates so Phase 0 can proceed without prematurely implementing blocked later phases.
- Implementation evidence artifacts exist or are explicitly marked not-yet-applicable before live preview, tenant beta, dependency adoption, or release gates.
- Doc-sync guard or equivalent manual checklist verifies flags, fixtures, schema changelog, waivers, dependency gates, launch decisions, and implementation section mapping before tenant beta.
- Risk register is reviewed before Phase 1 and before tenant beta.
- Operator rollback playbook is tested before tenant beta.

---

## 14. Resolved Planning Decisions

These decisions should stand unless implementation research finds a hard blocker:

| Decision | Choice | Rationale |
|---|---|---|
| First live preview surface | Agency Chat | `useAgencyStream` already exposes the richest matching event set for streaming, tool calls, approvals, credits, reconnect, and fallback. |
| Package location | `packages/agent-experience` | Agency and Team adapters are both first-slice deliverables, so shared package boundaries are justified. |
| Phase 0 dependency posture | `@runtypelabs/persona@4.4.0` installed only for gated bridge evaluation | Prevent renderer churn in production paths while allowing the requested bridge spike. |
| Renderer default | existing SmartSpec React components | External renderer is optional and gated. |
| Trace persistence | reuse/align with Feature 101 and existing Team/Work OS stores | Prevents another runtime ledger. |
| Customer widget/page actions | future separate rollout | Keeps internal UX stabilization first. |

---

## 15. Open Questions

1. Should debug inspector data be visible to domain admins or only platform admins/developers?
2. Should Runtype Persona be evaluated through npm only, or should source-level examples be reviewed in a one-time spike branch?
3. Which existing credit/budget service should provide the canonical `cost.estimate` event for non-media chat/tool actions?
4. Should `agent_runtime_traces` / `agent_runtime_checkpoints` be required before production beta, or can Phase 1 use source runtime trace IDs plus existing Team/Work OS projections?

---

## 16. Recommended First Implementation Slice

Start with a no-risk read-only slice:

1. Create `packages/agent-experience` with `SmartSpecAgentEvent` schemas and fixtures.
2. Create `agencyStreamToAgentEvents`.
3. Create `runStreamToAgentEvents`.
4. Register Agent Experience feature flags with all defaults set to `false`.
5. Add tests using captured/minimal fixture events:
   - `text_delta` -> `message.delta`;
   - `tool_start/tool_progress/tool_end` -> tool events;
   - `approval_required` -> `approval.request`;
   - `rejected` -> `denied` with `sourceDecision`;
   - malformed event -> ignored or safe error event;
   - private/internal Team event -> hidden from normal renderer;
   - unknown fields preserved only in debug preview.
6. Add a no-regression flag-off test plan for Chat, Agency Chat, and Team Room.
7. Add a hidden fixture preview page or Storybook-like local component test only if needed.

This slice creates the foundation for the roadmap while avoiding dependency churn, UI regressions, or naming confusion.

### 16.1 MVP Boundary Matrix

Use this matrix to prevent implementation creep. MVP means the safe foundation needed for later Agent Experience work, not the full product vision.

| Area | MVP | Follow-up |
|---|---|---|
| Protocol | canonical event envelope, schema constants, validation, parse results | additional event families after live usage proves need |
| Adapters | Agency and Team adapters with golden/negative fixtures | direct Chat, Media, Workflow, Browser, and customer widget adapters |
| UI | fixture-only preview with SmartSpec components if needed | default replacement of Chat/Agency/Team surfaces |
| Renderer bridge | no production `@runtypelabs/persona` import | optional Runtype bridge after dependency gate |
| Feature flags | declarations, false defaults, precedence helper/tests | tenant beta rollout automation and cohort tooling |
| Artifacts | pointer/preview event contract and safety tests | richer artifact editor/export UX |
| Approvals | decision normalization and backend-authority contract | edit-request flows and broader policy authoring |
| Cost | advisory event shape and server-authority contract | full cross-surface cost UX and budget controls |
| Debug | redaction/visibility rules and fixture tests | full admin event inspector with trace navigation |
| Persistence | no new durable Agent Experience ledger | reuse/align trace/checkpoint stores after Feature 101 status is known |
| Customer surfaces | explicitly deferred | website widget and customer page actions in separate specs |

Anything in the Follow-up column requires either a later implementation section or a separate feature spec before coding.

---

## 17. Implementation Readiness Checklist

Before creating a detailed implementation plan, confirm:

- Feature 101 trace/checkpoint status is understood, including whether `agent_runtime_traces` and `agent_runtime_checkpoints` already exist or remain planned.
- Initial first-slice posture was not to install `@runtypelabs/persona`; the 2026-06-22 follow-up implementation directive installs `@runtypelabs/persona@4.4.0` in `@smartspec/agent-experience` while keeping renderer activation dependency-gated and feature-flagged.
- All feature flags default to `false`.
- The first preview uses recorded fixtures before live streams.
- Agency Chat is the first live preview unless the implementer finds a blocking issue.
- No source runtime mutation is required for Phase 0.
- No database migration is required for Phase 0.
- No artifact content is inlined into canonical events.
- Debug/private events are filtered before normal rendering.
- Rollback behavior is tested before any tenant beta.

---

### 17.1 Definition Of Ready For Implementation Planning

The feature is ready to enter a detailed implementation plan when:

- Phase 0 scope is limited to package/contracts/fixtures/adapters/flags unless explicitly expanded.
- Open questions that block Phase 0 are either resolved or marked non-blocking with an owner.
- Existing source event samples for Agency and Team are identified or synthetic equivalents are approved.
- Feature flag names and precedence rules are accepted.
- `@runtypelabs/persona@4.4.0` is installed only for gated bridge evaluation and not imported from core Chat, Agency, or Team surfaces.
- Security-sensitive behavior for debug, artifact, approval, and cost events has testable rules.
- The implementation plan can name exact files likely changed for section 01 and section 02.
- The plan includes verification commands or placeholders that will be replaced once tests exist.

If any item is missing, the next planning step should resolve that item before implementation begins.

### 17.2 Definition Of Done For MVP

The MVP is done only when all of these are true:

- `packages/agent-experience` or the approved equivalent exists with documented exports.
- Agency and Team adapters pass golden and negative fixture tests.
- Feature flags are declared, defaulted off, grouped in admin UI, and covered by tests.
- Shared flag precedence helper exists and tests cover force rollback, layer disabled, shadow-only, preview, debug, and future no-op flags.
- Renderer intent contract exists and tests prove renderers cannot directly call mutation paths.
- Fixture preview renders canonical events with SmartSpec components without live stream binding.
- Flag-off regression evidence exists for Chat, Agency Chat, and Team Room.
- No production path imports `@runtypelabs/persona`.
- No database migration, durable ledger, customer widget, or page-action behavior is introduced.
- Implementation notes record any deferred gaps and the next recommended section.

This Definition of Done is narrower than the long-term roadmap. It intentionally describes the safe MVP foundation, not the full Agent Experience program.

### 17.3 Open Question Resolution Gates

Open questions should not all block Phase 0, but they must block the phases they affect.

| Open question | Blocks | Required resolution |
|---|---|---|
| Debug inspector visible to domain admins vs platform admins/developers | Phase 1 debug preview and any tenant beta with debug inspector | Permission policy, role checks, denial metrics, and redaction tests. |
| Runtype Persona npm-only vs source-level review | Phase 2 renderer bridge | Dependency evaluation method and exact-version strategy. |
| Canonical credit/budget service for `cost.estimate` | Phase 3 cost UX and any paid-action preview | Server-owned source for estimate/finalized cost events. |
| `agent_runtime_traces` / `agent_runtime_checkpoints` required before beta | Phase 5 debug/workflow integration and production beta | Trace/checkpoint source-of-truth decision and fallback projection plan. |

Implementation plans may proceed with Phase 0 while these remain open, as long as the plan does not implement the blocked phase.

## 18. Implementation Section Plan

When this spec is converted into implementation sections, split work by contract risk and dependency order. Do not start with UI replacement.

| Section | Scope | Depends on | Exit criteria |
|---|---|---|---|
| `section-01-shared-contracts-and-flags` | Create `packages/agent-experience`, event types/schemas, schema constants, parse result types, and feature flags. | none | Typecheck passes; flags default `false`; schema validation tests pass. |
| `section-02-agency-and-team-adapters` | Implement `agencyStreamToAgentEvents` and `runStreamToAgentEvents`. | section 01 | Golden fixtures map in order; dropped-event results are tested. |
| `section-03-golden-fixtures-and-negative-tests` | Add happy, legacy, approval, private/internal, malformed, artifact, rollback fixtures. | sections 01-02 | Fixture coverage matches section 11.2. |
| `section-04-preview-renderer-and-intents` | Build fixture-only preview renderer with typed renderer intents. | sections 01-03 | Renderer receives only canonical events and emits typed intents without direct mutations. |
| `section-05-artifact-approval-cost-adapters` | Map artifact pointers, approval decisions, and advisory cost events. | sections 01-04 | Approval/cost/artifact tests prove backend authority and permissioned loading. |
| `section-06-debug-inspector-and-redaction` | Add authorized debug inspector patterns and redaction gates. | sections 01-05 | Normal users cannot receive private/debug events; debug users see sanitized previews only. |
| `section-07-runtype-renderer-spike` | Evaluate optional `@runtypelabs/persona` bridge after gates. | sections 01-06 | Dependency/bundle/security report completed; bridge remains removable. |
| `section-08-rollout-metrics-and-release-gates` | Add parse/fallback/reconnect/approval/artifact/cost metrics and rollback drill. | sections 01-07 as applicable | Beta go/no-go checklist can be evaluated with real telemetry. |

Recommended first PR:

- include only section 01 and enough fixtures to prove the package boundary;
- do not activate `@runtypelabs/persona` as a default renderer without dependency, bundle, accessibility, security, and rollback evidence;
- do not change visible Chat, Agency Chat, or Team Room rendering.

## 19. Explicit Deferrals

These items are intentionally outside the first implementation slice:

- customer website widget implementation;
- customer page actions and WebMCP-style page control;
- public client tokens, widget script tags, and customer domain allowlists;
- blanket approvals or long-lived action grants;
- durable schema migrations for a new Agent Experience ledger;
- replacing `ChatView`, `AgencyChat`, or `TeamRoomView` as default UI;
- enabling `@runtypelabs/persona` as a default or production renderer before the dependency gate report is accepted.

Deferring these items protects the value of the feature: SmartSpecPro gets a stable internal protocol and adapter surface before taking on public embed, browser action, or third-party renderer risk.

## 20. Review Checklist For Future Spec Updates

Use this checklist whenever the spec changes:

- Does the change preserve the naming policy and avoid SmartSpec-owned `persona` naming?
- Does it keep backend approvals, billing, artifacts, and runtime ledgers authoritative?
- Does it preserve the renderer intent boundary instead of letting renderers call mutation APIs directly?
- Does it add or update golden fixtures for every new event type or mapping?
- Does it update the schema changelog and deprecation notes when contract shape changes?
- Does it specify flag behavior and rollback behavior?
- Does it update flag precedence tests when adding or changing flags?
- Does it state whether normal users, admins, or debug users can see the data?
- Does it preserve privacy, retention, deletion, and fixture redaction rules?
- Does it require threat-model updates when a new live stream, artifact, approval, billing, debug, or external-renderer path is introduced?
- Does it keep external renderer imports isolated behind a bridge?
- Does it avoid adding dependencies before the dependency gate?
- Does it preserve performance budgets against current Chat, Agency Chat, and Team Room baselines?
- Does it keep roadmap priority aligned with Phase 0/1/3/5 before public widget or page-action work?
- Does it include Thai and English user-visible state requirements when UI copy is introduced?
- Does it define how malformed, unknown, private, or unsupported events fail closed?

### 20.1 Decision Log Template

When implementation research changes a resolved decision, add a short ADR-style entry to the implementation plan or a feature-local `decision-log.md`.

Required fields:

```md
Decision: <title>
Date: YYYY-MM-DD

- section_or_phase:
- options_considered:
  - option A
  - option B
- decision_taken:
- reason:
- impact:
- rollback_or_revisit_condition:
- related_tests_or_evidence:
```

Decisions that require a log entry:

- changing the first live preview surface;
- installing or removing `@runtypelabs/persona`;
- changing feature flag precedence;
- adding a database migration or durable projection;
- expanding MVP beyond the boundary matrix;
- changing debug permission policy;
- changing the source of truth for approval, billing, artifact, trace, or runtime state;
- moving a customer widget or page-action item into an active implementation phase.

### 20.2 Implementation Evidence Artifact Index

The detailed implementation plan should create or reference these artifacts as they become relevant:

| Artifact | Purpose | Required by |
|---|---|---|
| `implementation-plan.md` | sectionized delivery plan, dependencies, test commands | before coding |
| `decision-log.md` | ADR-lite implementation decisions and deviations | whenever resolved decisions change |
| `schema-changelog.md` | event schema version changes, deprecations, fixture updates | first schema change after Phase 0 |
| `release-evidence.md` | command results, screenshots/component evidence, flag states, waivers | before live preview and beta |
| `rollback-drill.md` | rollback steps executed, result, owner, timestamp | before tenant beta |
| `dependency-gate-report.md` | package version, license, bundle, security, accessibility, rollback | before enabling `@runtypelabs/persona` beyond gated bridge evaluation |
| `threat-model.md` | live stream, debug, artifact, approval, billing, bridge risks and controls | before tenant beta |
| `fixture-inventory.md` | fixture names, source/synthetic status, coverage, redaction review | before live preview |
| `launch-decision-log.md` | canary stage decisions, go/no-go result, signoff, next gate | before selected tenant beta and each ramp stage |

Evidence artifacts should include the git SHA or branch, date, owner, command/result where applicable, and any waiver expiry. Waivers without an owner and expiry do not satisfy release gates.

### 20.3 Doc Sync Guard

Implementation evidence should stay synchronized with the spec. If the implementation plan adds a docs-contract test or validation script, it should check at least these invariants:

- every feature flag listed in this spec exists in the implementation flag inventory or is marked future/no-op;
- every required golden fixture in section 11.2 exists in `fixture-inventory.md`;
- every section in the implementation plan maps to a row in section 18 or explains the deviation in `decision-log.md`;
- every live preview stage has a matching `release-evidence.md` entry;
- every schema change has a `schema-changelog.md` entry and fixture update;
- every open waiver has owner and expiry;
- every dependency gate for `@runtypelabs/persona` is complete before the package is enabled;
- every launch/ramp decision is recorded in `launch-decision-log.md`.

Doc-sync failures should block tenant beta and ramp stages. They should not block Phase 0 package work unless the missing documentation is directly part of the current PR.

## 21. Final Readiness Assessment

Current readiness after this spec revision:

| Area | Readiness | Notes |
|---|---|---|
| Product fit | High | Aligns with existing Chat, Agency, Team, artifact, approval, Work OS, and runtime surfaces. |
| Codebase compatibility | High | Uses npm workspaces, feature flags, existing routers/services, and adapter-first package boundaries. |
| Naming safety | High | Avoids SmartSpec-owned `persona` names and isolates external `Runtype Persona` terminology. |
| Phase 0 implementability | High | Can start with pure schemas, fixtures, adapters, and false-default flags. |
| Runtime/security safety | Medium-high | Strong rules exist; implementation must prove redaction, tenant filtering, and backend authority with tests. |
| External renderer readiness | Medium | Worth evaluating only after protocol, fixtures, dependency gate, and rollback path are complete. |
| Customer widget readiness | Low by design | Correctly deferred until internal UX and protocol are stable. |

Recommendation: proceed to a detailed implementation plan for sections 01-03 only. Treat sections 04-08 as follow-on work after adapter fixtures and fail-closed behavior are proven.
