# Agent Experience Adapter Layer Usage

## Package Entry Point

Import browser-safe runtime contracts from the workspace package root:

```ts
import {
  agencyStreamToAgentEvents,
  runStreamToAgentEvents,
  validateSmartSpecAgentEvent,
  evaluateAgentExperienceFlags,
  filterAgentExperienceEventsForRenderer,
} from "@smartspec/agent-experience";
```

Node-only fixture inventory helpers are intentionally kept out of the package root export. Package tests and offline tooling may import them from the explicit testing subpath:

```ts
import {
  listAgentExperienceFixtures,
  loadAgentExperienceFixture,
} from "@smartspec/agent-experience/testing/fixtures";
```

## Run Focused Checks

```bash
npm --workspace @smartspec/agent-experience test -- --run
npm --workspace @smartspec/agent-experience run typecheck
npm --prefix apps/web test -- client/src/pages/__tests__/AdminAgentExperiencePreview.test.tsx client/src/components/agent-experience/__tests__/AgentExperienceShell.test.tsx shared/__tests__/agentExperienceFeatureFlags.test.ts client/src/components/admin/tenantFeatureFlagGroups.test.ts
npm run typecheck
```

## What Was Implemented

- Canonical schema/version contracts and fail-closed validation.
- Pure Agency and Team stream adapters.
- Golden fixture inventory and synthetic fixtures.
- Fixture-only React preview components that emit typed intents only.
- Admin/developer fixture preview page at `/admin/agent-experience-preview`, mounted behind `RequireAdmin` and listed as `Agent Experience Preview` instead of overloading the existing Persona admin surface.
- Pointer-only artifact, backend-confirmed approval, and server-owned/advisory cost adapters.
- Renderer redaction/filtering helpers.
- Runtype bridge dependency gate with `@runtypelabs/persona@4.4.0` installed in `@smartspec/agent-experience`; renderer use remains feature-flagged and evidence-gated.
- Rollout, waiver, canary, and release-evidence validation helpers.

## Rollout Defaults

All `agentExperience*` tenant flags default to `false`. `agentExperienceForceRollback` disables all Agent Experience behavior through the shared precedence helper.

## Admin/Developer Preview Page

- Route: `/admin/agent-experience-preview`.
- Access: admin only through the existing `/admin/*` route guard.
- Data source: synthetic client fixtures only; no live tenant stream and no mutation/API call is made by the page.
- Safety guard: the browser page does not import `listAgentExperienceFixtures` or `loadAgentExperienceFixture` because those helpers use Node filesystem APIs for package tests.
- Package boundary: `@smartspec/agent-experience` root export stays browser-safe; Node fixture helpers live behind `@smartspec/agent-experience/testing/fixtures`.
- UI coverage: scenario selector, debug toggle, rendered/dropped event counts, event/visibility breakdown, dropped-event details, Agent Experience shell preview, and local intent log.
