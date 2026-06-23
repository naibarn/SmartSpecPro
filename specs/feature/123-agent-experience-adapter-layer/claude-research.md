# Research - Feature 123 Agent Experience Adapter Layer

## Research Decision

Codebase research: yes. SmartSpecPro is an existing git repository with active Chat, Agency, Team Room, Artifact, Approval, feature flag, and test patterns.

Web research: limited. The spec references `@runtypelabs/persona`, package boundary strategy, and Vitest/package testing, so current public package/documentation signals were checked. External research is advisory only; implementation must follow the local repo first.

Testing research: yes. Phase 0 is package/contracts/fixtures/flags work, so the plan must match existing TypeScript/Vitest and npm workspace patterns.

## Codebase Findings

### Repository And Tooling

- Root `package.json` uses npm workspaces: `packages/*` and `apps/*`.
- Package manager is `npm@10.9.8`; plans must not introduce pnpm/yarn lockfiles or commands.
- Root scripts include `npm run typecheck`, backed by Turbo.
- Existing tests use Vitest across shared, client, and server code.

### Feature Flag Patterns

Relevant files:

- `apps/web/shared/featureFlags.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts`
- `apps/web/client/src/components/admin/tenantFeatureFlagGroups.test.ts`
- `apps/web/shared/__tests__/openAiAgentsRuntimeFeatureFlags.test.ts`
- `apps/web/shared/__tests__/marketplaceHyperframesFeatureFlags.test.ts`

Observed pattern:

- Add new flags to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- Rollout-sensitive flags often default to `false`.
- Add focused tests that assert flags exist, defaults are correct, and typo variants are rejected.
- Admin grouping has tests to prevent ungrouped feature flags.

Implication for plan:

- Agent Experience flags must default `false`.
- A shared flag precedence helper should be tested separately from UI integration.
- Admin grouping must be part of the first implementation slice, even if visible UI remains unchanged.

### Agency Stream Baseline

Research through SocratiCode and existing feature artifacts confirms Agency streaming already handles:

- `tool_start`, `tool_progress`, `tool_end`
- `approval_required`
- guardrail events
- credit usage
- reconnect using `Last-Event-ID`
- polling fallback
- cancel modes
- legacy event names such as `token`, `tool_call`, and `tool_result`

Implication for plan:

- Phase 0 should adapt existing event shapes without changing the live Agency UI.
- Agency fixtures must include happy path, legacy path, approval path, malformed path, and rollback path.

### Team / Orchestrator Stream Baseline

`apps/web/client/src/hooks/useRunStream.ts` defines:

- `RunStreamEvent`
- event identity fields: `eventId`, `tenantId`, `teamId`, `roomId`, `runId`
- actor fields: `actorType`, `actorId`
- visibility: `transparent`, `milestone`, `summary_only`, `private_internal`
- `data: Record<string, unknown>`
- reconnect through `lastEventId` query parameter

`TeamRoomView.tsx` consumes `useRunStream`, keeps recent live events, and also maps history messages into `RunStreamEvent`-like objects.

Implication for plan:

- Team adapter tests must preserve identity, timestamp, visibility, actor, and ordering semantics.
- `private_internal` filtering is release-blocking before any normal renderer can receive Team events.

### Artifact And Approval Baseline

`apps/web/server/routers/artifact.ts` uses Zod input validation, protected procedures, tenant context, and service-level ownership checks through `artifactStorageService`.

Observed artifact behavior:

- list artifacts for a conversation
- get artifact version history
- create a new artifact version
- enforce content size and tenant/user access through service calls

Implication for plan:

- Canonical artifact events must remain pointers/previews, not trusted content blobs.
- Artifact content should load through existing permissioned paths after Phase 0.
- Phase 0 can define event shape and fixtures without touching artifact router behavior.

### Existing Runtime/Trace Direction

Feature 101 and schema snippets show runtime identity and trace fields already exist or are planned around Team/Agents SDK work:

- `team_runs.runtimeAdapterVersion`
- `team_runs.runtimeTraceId`
- `team_runs.runtimeCurrentStepKey`
- runtime state JSON fields

Implication for plan:

- Do not create an Agent Experience ledger.
- Store only derived, ephemeral, or fixture data in Phase 0.
- Carry trace identifiers in events for later linkage.

## Web Findings

### Runtype Persona

Public package/discovery signals indicate:

- `@runtypelabs/persona` exists as a themeable/pluggable AI chat widget package.
- Runtype also has a related `@runtypelabs/persona-proxy` package.
- Runtype blog material positions Persona as a website chat widget that can be dropped into a site.

Sources:

- https://www.npmjs.com/package/%40runtypelabs/persona-proxy
- https://www.runtype.com/blog/persona-ship-ai-chat-in-minutes
- https://libraries.io/npm/%40runtypelabs%2Fpersona

Implication for plan:

- Treat Runtype Persona as a Phase 2 optional renderer/bridge, not a Phase 0 dependency.
- Pin exact versions only after dependency, bundle, license, accessibility, rollback, and API-surface evaluation.
- Keep SmartSpec event semantics independent of external renderer semantics.

### TypeScript Package Export Boundaries

Node.js package docs define `package.json` package boundaries and `exports` as the explicit way to control public entry points.

Source:

- https://nodejs.org/api/packages.html
- https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html

Implication for plan:

- `packages/agent-experience` should expose a small root API.
- Do not let consumers import implementation internals directly.
- Public exports require tests and changelog discipline.

### Vitest

Vitest positions itself as a fast Vite-native test runner that also works for backend code and supports fixtures/test context patterns.

Sources:

- https://vitest.dev/
- https://vitest.dev/guide/
- https://vitest.dev/guide/test-context

Implication for plan:

- Use Vitest for package unit tests and shared/app tests.
- For Phase 0, deterministic JSON fixtures and pure adapter tests are sufficient.

## Testing Context

Recommended Phase 0 commands:

- package tests: `npm --workspace @smartspec/agent-experience test` once package scripts exist
- web/shared flag tests: `npm --prefix apps/web test -- apps/web/shared/__tests__/<agent-experience-flags>.test.ts`
- admin grouping tests: `npm --prefix apps/web test -- apps/web/client/src/components/admin/tenantFeatureFlagGroups.test.ts`
- typecheck: `npm run typecheck`

Implementation plans should replace placeholders with exact files after the package and tests exist.

## Planning Implications

1. The first implementation must be package/contracts/fixtures/flags only.
2. No visible UI replacement should be part of MVP.
3. Initial Phase 0 research advised not installing `@runtypelabs/persona`; the 2026-06-22 follow-up directive supersedes this by installing `@runtypelabs/persona@4.4.0` only for gated bridge evaluation.
4. Adapter functions should be pure and dependency-free.
5. Golden fixtures are the central safety mechanism.
6. Feature flag precedence must be centralized and testable.
7. All mutation behavior must remain in existing backend routes/services.
8. Debug/private data filtering must be tested before any preview renderer.
