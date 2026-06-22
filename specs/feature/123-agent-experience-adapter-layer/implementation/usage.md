# Agent Experience Adapter Layer Usage

## Package Entry Point

Import from the workspace package root:

```ts
import {
  agencyStreamToAgentEvents,
  runStreamToAgentEvents,
  validateSmartSpecAgentEvent,
  evaluateAgentExperienceFlags,
  filterAgentExperienceEventsForRenderer,
} from "@smartspec/agent-experience";
```

## Run Focused Checks

```bash
npm --workspace @smartspec/agent-experience test -- --run
npm --workspace @smartspec/agent-experience run typecheck
npm --prefix apps/web test -- shared/__tests__/agentExperienceFeatureFlags.test.ts client/src/components/admin/tenantFeatureFlagGroups.test.ts client/src/components/agent-experience/__tests__/AgentExperienceShell.test.tsx
npm run typecheck
```

## What Was Implemented

- Canonical schema/version contracts and fail-closed validation.
- Pure Agency and Team stream adapters.
- Golden fixture inventory and synthetic fixtures.
- Fixture-only React preview components that emit typed intents only.
- Pointer-only artifact, backend-confirmed approval, and server-owned/advisory cost adapters.
- Renderer redaction/filtering helpers.
- Runtype bridge dependency gate without installing `@runtypelabs/persona`.
- Rollout, waiver, canary, and release-evidence validation helpers.

## Rollout Defaults

All `agentExperience*` tenant flags default to `false`. `agentExperienceForceRollback` disables all Agent Experience behavior through the shared precedence helper.
