# Implementation Plan - Feature 123 Agent Experience Adapter Layer

## 1. Plan Intent

This plan implements the safe foundation for SmartSpecPro's Agent Experience Adapter Layer.

The goal is not to replace Chat, Agency Chat, or Team Room UI. The goal is to create a SmartSpec-owned protocol and adapter package that can normalize existing agent runtime streams into a single tested event contract.

Recommended first implementation target:

- Section 01: shared package, contracts, schemas, fixtures, and feature flags.
- Section 02: Agency and Team stream adapters.
- Section 03: golden fixtures, negative tests, and documentation evidence.

Sections 04-08 are planned for continuity but should not be implemented until the MVP foundation is green.

## 2. Non-Negotiable Constraints

1. Do not rename or modify the existing SmartSpecPro persona system.
2. Do not use `persona` in SmartSpec-owned package/module/flag names for this feature.
3. Do not install `@runtypelabs/persona` in MVP.
4. Do not replace `ChatView`, `AgencyChat`, or `TeamRoomView` in MVP.
5. Do not create a new durable Agent Experience ledger.
6. Do not add a database migration in MVP.
7. Do not inline artifact content into canonical events.
8. Do not let renderers call mutation APIs directly.
9. All Agent Experience flags default to `false`.
10. `agentExperienceForceRollback` wins over every other Agent Experience flag.

## 3. Architecture Overview

The target architecture is:

```txt
Existing source streams and records
  Agency stream / Team run stream / future Chat / Artifact / Approval
        |
        v
Pure source adapters
  agencyStreamToAgentEvents
  runStreamToAgentEvents
        |
        v
SmartSpec canonical protocol
  SmartSpecAgentEvent[]
  AgentExperienceParseResult
        |
        v
Host surface filtering and renderer boundary
  Feature flags
  Visibility/redaction filters
  Typed renderer intents
        |
        v
Existing SmartSpec React UI first
Optional external renderer bridge later
```

The package is a boundary, not a runtime owner. Existing backend systems remain authoritative for billing, approval, artifact, runtime, Team, Work OS, and trace state.

## 4. Package Plan

Create a small dependency-light workspace package:

```txt
packages/agent-experience/
  package.json
  src/
    index.ts
    events.ts
    schemas.ts
    featureFlags.ts
    adapters/
      agencyStream.ts
      runStream.ts
    testing/
      fixtures.ts
      fixtures/
        agency.happy-path.2026-06-22-v1.fixture.json
        agency.legacy-path.2026-06-22-v1.fixture.json
        agency.approval-path.2026-06-22-v1.fixture.json
        agency.malformed-path.2026-06-22-v1.fixture.json
        team.run-path.2026-06-22-v1.fixture.json
        team.private-internal-visibility.2026-06-22-v1.fixture.json
        artifact.pointer-path.2026-06-22-v1.fixture.json
        approval.rejected-to-denied.2026-06-22-v1.fixture.json
        rollback.flags-off-legacy-rendering.2026-06-22-v1.fixture.json
    __tests__/
      schemas.test.ts
      agencyStream.test.ts
      runStream.test.ts
      fixtures.test.ts
      featureFlags.test.ts
```

Package name:

- `@smartspec/agent-experience`

Package metadata:

- `private: true`
- `type` should match the repository's TypeScript package convention after inspecting nearby packages.
- scripts should include at least `test` and `typecheck` if nearby packages do.
- `exports` should expose only the package root unless later sections justify subpath exports.
- `files` is optional while the package remains private.

Package public exports:

- `AGENT_EXPERIENCE_SCHEMA_VERSION`
- `SmartSpecAgentEventEnvelope`
- `SmartSpecAgentEvent`
- `AgentExperienceEventSource`
- `AgentExperienceSurface`
- `AgentArtifactFormat`
- `AgentWorkflowStepStatus`
- `AgentExperienceParseResult`
- `AgentExperienceIntent`
- `AgentExperienceIntentResult`
- `agencyStreamToAgentEvents`
- `runStreamToAgentEvents`
- `loadAgentExperienceFixture`
- `listAgentExperienceFixtures`

Do not export:

- source-specific raw stream types as product contracts;
- renderer bridge internals;
- tRPC clients;
- mutation helpers;
- billing, approval, artifact, or workflow service wrappers.

## 5. Canonical Protocol

Define event contracts in `packages/agent-experience/src/events.ts`.

Required types:

- `SmartSpecAgentEventEnvelope`
- `SmartSpecAgentEvent`
- `AgentExperienceParseResult`
- `AgentExperienceDroppedEvent`
- `AgentExperienceIntent`
- `AgentExperienceIntentResult`
- related source/surface/visibility/redaction/status unions.

Validation belongs in `schemas.ts`.

MVP validation approach:

- Prefer dependency-free TypeScript guards if possible.
- If the package already has access to Zod without expanding the dependency graph, Zod is acceptable.
- Validation must reject unsupported top-level event type/source/surface/visibility/redaction/status values.
- Validation must fail closed on unknown future schema versions.

Schema change-control:

- create `schema-changelog.md` in Section 01 with initial schema version, supported versions, compatibility notes, and owner;
- document the rule that post-Phase 0 changes must update schema version, fixtures, changelog, and compatibility expectations together;
- after Phase 1, support current and current-1 schema versions unless a later migration plan explicitly extends the window;
- deprecation entries must include deprecated field/event, replacement, removal window, affected fixtures, and rollback note.

Parse result contract:

- adapters return validated canonical events and dropped-event diagnostics;
- renderers receive only validated canonical events, not dropped diagnostics.

## 6. Adapter Plan

### 6.1 Agency Adapter

Implement `agencyStreamToAgentEvents` in `src/adapters/agencyStream.ts`.

Inputs:

- source event name;
- source payload;
- tenant/user/conversation/run identity supplied by caller;
- optional sequence/source event ID/timestamp.

Mapping coverage:

- `meta` / `run_started` -> `session.started`
- `text_delta` / `token` -> `message.delta`
- assistant completion -> `message.done`
- `tool_start` -> `tool.start`
- `tool_progress` -> `tool.progress`
- `tool_end` / `tool_result` -> `tool.done` or `tool.error`
- `approval_required` -> `approval.request`
- `preview_ready` -> `artifact.created`
- `run_complete` / `run_finished` -> `workflow.step` and optional `cost.finalized`
- `guardrail_trigger` -> `debug.trace` or `error` depending on source severity

Do not change `useAgencyStream.ts` in Section 02 unless the adapter cannot be tested without a minimal exported type.

### 6.2 Team Adapter

Implement `runStreamToAgentEvents` in `src/adapters/runStream.ts`.

Inputs:

- `RunStreamEvent`-like object shape;
- optional caller-provided defaults for surface and redaction behavior.

Mapping coverage:

- preserve `eventId` as `sourceEventId`;
- preserve `tenantId`, `teamId`, `roomId`, `runId`, `actorType`, `actorId`, `ts`, and `visibility`;
- map message activity to message events where source event semantics are known;
- map tool/stage/approval/artifact event types to canonical events where source payload is sufficient;
- map unknown/private/internal events to dropped diagnostics or debug-only events according to visibility rules.

Do not expose `private_internal` events to normal renderer fixtures.

## 7. Feature Flag Plan

Add flags to:

- `apps/web/shared/featureFlags.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`

Add tests similar to existing feature flag suites.

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

All default `false`.

Add a shared helper in the package or web shared layer for precedence:

- force rollback disables all behavior;
- layer disabled ignores all child flags;
- shadow-only runs adapter observation without visible UI changes;
- preview requires layer true and surface preview true;
- external renderer requires layer true, renderer flag true, and dependency gate pass;
- debug inspector requires debug flag and role/redaction checks;
- future customer flags are no-ops.

Recommended location:

- package-level pure helper if no app dependencies are required;
- app/shared wrapper if tenant flag shape imports are required.

## 8. Fixture And Evidence Plan

Create fixture files under `packages/agent-experience/src/testing/fixtures/`.

Every fixture must include metadata:

- fixture ID;
- schema version;
- adapter version if applicable;
- surface;
- source;
- scenario;
- synthetic/redaction status;
- expected canonical event types;
- expected dropped reasons when applicable;
- related requirement.

Create `fixture-inventory.md` in the planning directory or package docs after fixture files exist.

Fixtures must be synthetic unless production-derived shape is impossible to model safely. Production-derived fixtures must be redacted before commit.

Privacy and retention rules:

- fixture inventory must identify whether a fixture is synthetic or production-derived;
- production-derived fixtures require redaction review, owner, source date, and removal criteria;
- fixtures must not include raw prompts, user content, OAuth/API tokens, signed URLs, privileged storage paths, or tenant-identifiable samples;
- if implementation creates projections, metrics, debug previews, or cached artifact references, the relevant section must document delete/access-revocation behavior.

## 9. Renderer Intent Boundary

Define `AgentExperienceIntent` and `AgentExperienceIntentResult`, but do not implement host mutations in MVP.

Renderer contract:

- renderer consumes `SmartSpecAgentEvent[]`;
- renderer emits typed intents;
- host surface handles intents;
- host surface re-checks tenant, user, role, feature flags, and backend authority before mutation;
- external renderer bridges may emit intents only.

Section 04 can add a fixture-only preview renderer after sections 01-03 are green.

## 10. UI/UX Contract For Future Preview UI

Target user / job-to-be-done:

- Internal SmartSpecPro users and operators need to inspect agent progress, tools, artifacts, approvals, cost, and debug state consistently across Agency and Team workflows.

Surface inventory:

- MVP: fixture-only local/component preview if useful.
- Follow-up: Agency Chat preview, Team Room preview, direct Chat preview.

Component map:

- `AgentExperienceShell`: container and layout.
- `AgentTimeline`: canonical event timeline.
- `AgentApprovalCard`: approval intent emitter.
- `AgentArtifactPane`: permissioned artifact pointer display.
- `AgentDebugInspector`: future gated debug view.

State matrix:

- loading fixture;
- empty event list;
- malformed fixture;
- safe error;
- partial parse with dropped events;
- debug denied;
- flag disabled;
- renderer fallback.

Responsive matrix:

- mobile: drawer for artifacts/debug;
- tablet: timeline plus collapsible side panel;
- desktop: timeline plus side panel;
- dense/laptop: no horizontal-only debug overflow.

Accessibility:

- keyboard reachable approval/artifact/debug controls;
- visible focus;
- ARIA labels for icon-only controls;
- no focus steal during streaming;
- reduced-motion compatible timeline.

Copy contract:

- Thai and English for user-visible errors, approvals, cost confirmations, fallback/rollback states.
- Debug-only technical labels may remain English.
- Do not use `Persona` in user-facing copy for this feature.

Browser evidence:

- required only when section 04 or later introduces browser-visible preview UI.
- capture mobile 390x844, tablet 768x1024, desktop 1440x900 evidence.

## 11. Rollout And Evidence Plan

MVP does not enable live preview. It prepares gates for later stages.

Required evidence artifacts as phases progress:

- `fixture-inventory.md`
- `schema-changelog.md`
- `release-evidence.md`
- `rollback-drill.md`
- `dependency-gate-report.md`
- `threat-model.md`
- `launch-decision-log.md`
- `performance-baseline.md`
- `alert-triage-matrix.md`
- surface adoption checklist or section in `release-evidence.md`
- requirement-to-test traceability checklist or section in `release-evidence.md`

MVP should create placeholder or initial versions for:

- `fixture-inventory.md`
- `schema-changelog.md`

Later rollout sections should create:

- `release-evidence.md`
- `rollback-drill.md`
- `threat-model.md`
- `launch-decision-log.md`
- `performance-baseline.md`
- `alert-triage-matrix.md`

Evidence artifacts should use a consistent shape: owner, date, git SHA or branch, related section, status, command or evidence reference, and waiver status.

Waivers must include `waiver_id`, gate, reason, owner, expiry date, mitigation, revisit trigger, and impacted rollout stage. Waivers cannot bypass cross-tenant safety, approval integrity, billing authority, secret redaction, or rollback readiness.

Before live preview or tenant beta, release evidence must include:

- surface adoption criteria for each enabled surface;
- compatibility coverage for streaming, tool calls, approvals, artifacts, files where supported, themes, debug mode, credits, errors, mobile layout, access control, i18n, accessibility, rollback, and external bridge when enabled;
- performance baseline for adapter parse overhead, time to first token/event, shadow-mode overhead, artifact preview load, debug inspector expansion, and external renderer bundle impact where applicable;
- alert thresholds and first-triage ownership for parse success, fallback, cross-tenant/access denial, approval backend failure, artifact open/download errors, bridge errors, and stream reconnects;
- reviewer/signoff record that references evidence artifacts, not only verbal approval.

Canary progression for later live rollout:

- `fixture_only`
- `shadow_internal`
- `preview_internal`
- `selected_tenants`
- `ramp_25`
- `ramp_50`
- `ramp_100`

Hard aborts at every live stage:

- cross-tenant issue;
- approval integrity issue;
- billing authority issue;
- secret/signed URL leak;
- rollback failure;
- parse success below gate.

## 12. Implementation Sections

The implementation should be split into eight sections:

1. `section-01-shared-contracts-and-flags`
2. `section-02-agency-and-team-adapters`
3. `section-03-golden-fixtures-and-negative-tests`
4. `section-04-preview-renderer-and-intents`
5. `section-05-artifact-approval-cost-adapters`
6. `section-06-debug-inspector-and-redaction`
7. `section-07-runtype-renderer-spike`
8. `section-08-rollout-metrics-and-release-gates`

Sections 01-03 are the recommended first deep-implement target.

## 13. File Ownership

Likely files to add:

- `packages/agent-experience/package.json`
- `packages/agent-experience/src/index.ts`
- `packages/agent-experience/src/events.ts`
- `packages/agent-experience/src/schemas.ts`
- `packages/agent-experience/src/featureFlags.ts`
- `packages/agent-experience/src/adapters/agencyStream.ts`
- `packages/agent-experience/src/adapters/runStream.ts`
- `packages/agent-experience/src/testing/fixtures.ts`
- `packages/agent-experience/src/testing/fixtures/*.fixture.json`
- `packages/agent-experience/src/__tests__/*.test.ts`
- `apps/web/shared/__tests__/agentExperienceFeatureFlags.test.ts`
- `specs/feature/123-agent-experience-adapter-layer/fixture-inventory.md`
- `specs/feature/123-agent-experience-adapter-layer/schema-changelog.md`

Likely files to modify:

- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/featureFlags.js` if the repository requires the JS sibling to stay synchronized
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.test.ts`

Avoid modifying in sections 01-03 unless proven necessary:

- `apps/web/client/src/pages/AgencyChat.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`
- artifact/approval routers.

Before editing any existing shared file, inspect for user changes and keep diffs minimal. The current repository may have unrelated dirty files; implementation must not revert them.

## 14. Acceptance Gates

MVP is done when:

- package public API is documented and tested;
- schema/version validation tests pass;
- Agency and Team adapters pass golden and negative fixture tests;
- dropped-event diagnostics are tested;
- feature flags default off and admin grouping tests pass;
- feature flag precedence helper tests pass;
- renderer intent contract tests pass;
- fixture inventory exists with redaction status;
- schema changelog and compatibility/deprecation rules exist;
- no `@runtypelabs/persona` dependency is installed;
- flag-off regression evidence exists for Chat, Agency Chat, and Team Room;
- no database migration exists;
- no visible UI replacement is introduced.

Before live preview or tenant beta:

- threat model exists and covers malformed streams, cross-tenant references, debug exposure, approval spoofing/replay, billing manipulation, artifact XSS/privileged URL leak, external renderer supply-chain risk, fixture/log leakage, and deferred page-action privilege escalation;
- performance baseline exists and shows no unacceptable regression against existing surfaces;
- alert/triage ownership exists for stream, adapter, approval, artifact, billing/cost, debug, and renderer bridge failures;
- release evidence includes waiver status, reviewer signoff, rollback drill, surface adoption criteria, and requirement-to-test traceability.

## 15. Risks And Mitigations

| Risk | Mitigation |
|---|---|
| Package contract becomes too broad | Keep root exports minimal; require tests for each export. |
| Adapter logic duplicates source runtime semantics incorrectly | Use fixture mapping tables and preserve source IDs/timestamps. |
| Private Team events leak | Test private/internal fixture filtering before any preview UI. |
| Flags behave inconsistently across surfaces | Centralize flag precedence helper and test each precedence row. |
| Runtype bridge creeps into MVP | Keep dependency gate in Section 07 only; do not install in sections 01-03. |
| Fixture data leaks sensitive content | Require synthetic fixtures by default and redaction metadata. |
| Existing UI regresses | Keep all preview flags off and run flag-off smoke evidence. |
| `featureFlags.js` is generated or manually synced inconsistently | Inspect local convention before editing; if generated, update source and generation evidence instead of hand-editing generated output. |
| Package module format conflicts with workspace conventions | Inspect neighboring `packages/*/package.json` files in Section 01 before choosing `type`, `main`, `types`, or `exports`. |

## 16. Next Step

Proceed to TDD planning, then split the implementation into section files. The first implementation wave should target sections 01-03 only.
