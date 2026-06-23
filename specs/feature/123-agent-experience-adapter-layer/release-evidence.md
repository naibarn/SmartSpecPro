# Agent Experience Release Evidence

Status: fixture/protocol implementation with admin/developer fixture preview only. Live tenant preview and tenant beta are not approved by this artifact.

## Required Shape

- Owner:
- Date:
- Git SHA or branch:
- Related section:
- Stage:
- Command/evidence reference:
- Result:
- Waiver status:

## Current Evidence

- Package tests: `npm --workspace @smartspec/agent-experience test -- --run` passes 36 tests across 9 files.
- Package typecheck: `npm --workspace @smartspec/agent-experience run typecheck` passes.
- Web focused tests: `npm --prefix apps/web test -- client/src/pages/__tests__/AdminAgentExperiencePreview.test.tsx client/src/components/agent-experience/__tests__/AgentExperienceShell.test.tsx shared/__tests__/agentExperienceFeatureFlags.test.ts client/src/components/admin/tenantFeatureFlagGroups.test.ts` passes 18 tests across 4 files.
- Root typecheck: `npm run typecheck` passes.
- Dependency audit: `npm audit --workspace @smartspec/agent-experience --audit-level=moderate` reports 0 vulnerabilities.
- Plan checks: `check-sections.py` reports 8/8 sections complete; `check-ui-contracts.py` passes 8 UI-affecting section files.
- Feature flags: default off.
- Admin/developer fixture preview: `/admin/agent-experience-preview` is available behind `RequireAdmin`; it uses synthetic client fixtures only and records shell intents locally.
- Live tenant preview: not enabled.
- Tenant beta: blocked until rollback drill, threat model, performance baseline, alert/triage matrix, surface adoption criteria, and reviewer signoff are complete.
