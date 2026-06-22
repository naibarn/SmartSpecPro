# Synthesized Specification - Feature 123 Agent Experience Adapter Layer

## Purpose

Build a SmartSpec-owned Agent Experience Adapter Layer that normalizes agent interaction streams across existing SmartSpecPro surfaces without replacing current product UI in the first implementation.

The layer introduces:

- a canonical `SmartSpecAgentEvent` protocol;
- pure adapters for existing Agency and Team/Orchestrator streams;
- deterministic golden fixtures and negative fixtures;
- feature flags and centralized precedence;
- typed renderer intents that prevent UI renderers from mutating backend state directly;
- rollout, security, privacy, evidence, and traceability gates.

## Source Spec

Primary input:

- `specs/feature/123-agent-experience-adapter-layer/spec.md`

This synthesized spec is derived from that file plus codebase/web research and auto-decisions in `claude-interview.md`.

## MVP Scope

MVP includes:

1. `packages/agent-experience` with documented public exports.
2. Canonical event types, schema/version constants, parse result types, and typed renderer intents.
3. Dependency-free or minimal runtime validation strategy.
4. Agency adapter and Team/Orchestrator run adapter.
5. Golden and negative fixtures with inventory metadata.
6. Feature flags defaulted off and grouped in admin UI.
7. Shared feature flag precedence helper.
8. Package/unit tests, feature flag tests, fixture tests, and flag-off regression evidence.
9. Documentation artifacts required for future rollout.

MVP excludes:

- installing or importing `@runtypelabs/persona`;
- replacing `ChatView`, `AgencyChat`, or `TeamRoomView` as default UI;
- creating a customer website widget;
- customer page actions;
- database migrations;
- a new Agent Experience ledger;
- broad artifact editor, cost UI, or debug inspector replacement.

## Naming Rules

SmartSpec-owned feature, package, route, flag, and module names must not use `persona` as the primary term. `persona` remains reserved for existing SmartSpecPro assistant/persona concepts. The external package may be referred to only as `Runtype Persona` or `@runtypelabs/persona`.

Use:

- feature: Agent Experience Adapter Layer
- package: `@smartspec/agent-experience`
- event union: `SmartSpecAgentEvent`
- optional bridge: `runtypePersonaBridge`
- flags: `agentExperience*`

Avoid:

- `persona-adapter`
- `persona-ui-kit`
- `persona-protocol`
- `agent-persona-ui`

## Canonical Event Protocol

Every canonical event must include a metadata envelope with:

- source and surface;
- tenant/user/actor identity where available;
- team/room/run/conversation/message/work identity where available;
- trace/correlation/sequence identity where available;
- timestamp;
- visibility;
- redaction level;
- schema version.

Initial event families:

- session lifecycle;
- message delta/done;
- tool start/progress/done/error;
- approval request/resolved;
- artifact created/updated;
- cost estimate/finalized;
- workflow step;
- debug trace;
- error.

Unknown source events must not crash consumers. They are dropped, ignored, or mapped to authorized debug output based on classification.

## Adapter Requirements

Adapters must:

- be pure and testable;
- tolerate unknown extra fields;
- preserve source event IDs/timestamps/order where available;
- report dropped events with reasons;
- avoid leaking raw payloads into normal UI;
- keep backend services authoritative for approvals, billing, artifacts, and runtime state.

Required MVP adapters:

- `agencyStreamToAgentEvents`
- `runStreamToAgentEvents`

Follow-up adapters:

- direct chat;
- artifact records;
- approval records;
- media tasks;
- workflow/browser sessions.

## Renderer Intent Contract

Renderers consume validated canonical events and emit typed intents. They must not directly call billing, approval, artifact mutation, workflow mutation, or tRPC mutation paths.

Host surfaces handle intents and must re-check:

- tenant;
- user;
- role;
- feature flag;
- backend authority.

## Feature Flags

Required flags:

- `agentExperienceLayer`
- `agentExperienceShadowMode`
- `agentExperienceAgencyPreview`
- `agentExperienceTeamPreview`
- `agentExperienceChatPreview`
- `agentExperienceRuntypeRenderer`
- `agentExperienceDebugInspector`
- `agentExperienceForceRollback`
- `agentExperienceWebsiteWidget`
- `agentExperiencePageActions`

All flags default to `false`.

`agentExperienceForceRollback=true` overrides all Agent Experience behavior.

Future customer flags are no-ops until future specs define security gates.

## Security And Privacy

The adapter layer must not create a new source of truth for:

- message history;
- approvals;
- billing;
- artifacts;
- Team/Auto-Team run ledger;
- Work OS cases/tasks;
- media generation tasks;
- assistant persona settings.

Canonical event previews and fixtures must follow data classification rules:

- public metadata may be shown normally;
- tenant-scoped IDs require permission;
- sensitive summaries must be bounded/redacted;
- private debug payloads are debug-only and sanitized;
- secrets, credentials, tokens, signed URLs, and storage paths are never allowed in UI, fixtures, or logs.

## Rollout

Rollout order:

1. fixture-only package tests;
2. internal fixture preview;
3. Agency shadow mode;
4. Agency preview;
5. Team shadow/preview;
6. artifact/approval/cost hardening;
7. optional Runtype bridge spike;
8. selected tenant beta after evidence gates.

Default replacement is out of MVP.

## Acceptance Summary

MVP is acceptable when:

- the package exists with small documented public API;
- Agency and Team adapters pass golden and negative fixtures;
- feature flags and precedence helper are tested;
- renderer intent contract is tested;
- no existing Chat/Agency/Team behavior changes when flags are off;
- no `@runtypelabs/persona` dependency is in production paths;
- no database migration or durable Agent Experience ledger exists;
- evidence artifacts and section handoff are ready for the next implementation slice.
