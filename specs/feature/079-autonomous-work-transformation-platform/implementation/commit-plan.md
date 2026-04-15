# Feature 079 Commit Plan

Date: 2026-04-10

This repository currently has a dirty worktree with unrelated desktop, finance, auth, and spec changes already in flight. Use explicit path-based staging for Feature 079 so the workpack implementation can be reviewed and landed without pulling unrelated edits into the same commits.

## Commit 1: Spec package and implementation notes

Scope:
- Preserve the planning and implementation trail for Feature 079 as a standalone docs commit.

Stage:
```bash
git add -- \
  specs/feature/079-autonomous-work-transformation-platform/spec.md \
  specs/feature/079-autonomous-work-transformation-platform/claude-interview.md \
  specs/feature/079-autonomous-work-transformation-platform/claude-plan.md \
  specs/feature/079-autonomous-work-transformation-platform/claude-plan-tdd.md \
  specs/feature/079-autonomous-work-transformation-platform/claude-research.md \
  specs/feature/079-autonomous-work-transformation-platform/claude-spec.md \
  specs/feature/079-autonomous-work-transformation-platform/deep_plan_config.json \
  specs/feature/079-autonomous-work-transformation-platform/reviews/self-review-round-1.md \
  specs/feature/079-autonomous-work-transformation-platform/reviews/section-cross-consistency-review.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/.prompts \
  specs/feature/079-autonomous-work-transformation-platform/sections/index.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-01-shared-contracts-and-persistence.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-02-intake-and-playbook-drafting.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-03-workpack-compiler-and-routing.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-04-simulation-replay-and-exceptions.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-05-connector-mapping-and-boundary-control.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-06-learning-benchmarks-and-promotion.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-07-control-plane-ui-surfaces.md \
  specs/feature/079-autonomous-work-transformation-platform/sections/section-08-telemetry-rollout-and-gating.md \
  specs/feature/079-autonomous-work-transformation-platform/implementation/deep_implement_config.json \
  specs/feature/079-autonomous-work-transformation-platform/implementation/commit-plan.md \
  specs/feature/079-autonomous-work-transformation-platform/implementation/typecheck-blockers.md
```

Suggested message:
```text
docs(feature-079): add autonomous work transformation spec package
```

## Commit 2: Shared workpack contracts and persistence foundations

Scope:
- Shared domain types, promotion and telemetry helpers, feature flags, schema, and persistence layer.

Stage:
```bash
git add -- \
  apps/web/shared/workpackContracts.ts \
  apps/web/shared/workpackDomainPacks.ts \
  apps/web/shared/workpackPromotion.ts \
  apps/web/shared/workpackTelemetry.ts \
  apps/web/shared/featureFlags.ts \
  apps/web/shared/__tests__/workpackContracts.test.ts \
  apps/web/shared/__tests__/workpackFeatureFlags.test.ts \
  apps/web/shared/__tests__/workpackPromotion.test.ts \
  apps/web/shared/__tests__/workpackTelemetry.test.ts \
  apps/web/drizzle/workpackSchema.ts \
  apps/web/server/services/workpackPersistence.ts
```

Suggested message:
```text
feat(web): add workpack contracts and persistence foundation
```

## Commit 3: Workpack execution core

Scope:
- Intake, compiler, connector mapping, ledger, exception normalization, simulation, and replay services with dedicated tests.

Stage:
```bash
git add -- \
  apps/web/server/services/workpackIntakeService.ts \
  apps/web/server/services/workpackCompilerService.ts \
  apps/web/server/services/workpackConnectorService.ts \
  apps/web/server/services/workpackLedgerService.ts \
  apps/web/server/services/workpackExceptionService.ts \
  apps/web/server/services/workpackSimulationService.ts \
  apps/web/server/services/workpackReplayService.ts \
  apps/web/server/services/__tests__/workpackIntakeService.test.ts \
  apps/web/server/services/__tests__/workpackCompilerService.test.ts \
  apps/web/server/services/__tests__/workpackConnectorService.test.ts \
  apps/web/server/services/__tests__/workpackLedgerService.test.ts \
  apps/web/server/services/__tests__/workpackExceptionService.test.ts \
  apps/web/server/services/__tests__/workpackSimulationService.test.ts \
  apps/web/server/services/__tests__/workpackReplayService.test.ts
```

Suggested message:
```text
feat(web): add workpack intake compile and replay runtime services
```

## Commit 4: Promotion, telemetry, rollout, and backend control plane

Scope:
- Learning loop, promotion, telemetry, readiness, incident controls, router surfaces, and backend integration points.

Stage:
```bash
git add -- \
  apps/web/server/services/workpackLearningService.ts \
  apps/web/server/services/workpackPromotionService.ts \
  apps/web/server/services/workpackTelemetryService.ts \
  apps/web/server/services/workpackRolloutGateService.ts \
  apps/web/server/services/workpackReadinessService.ts \
  apps/web/server/services/workpackIncidentControlService.ts \
  apps/web/server/services/monitoringService.ts \
  apps/web/server/services/skillStudioService.ts \
  apps/web/server/services/skillUpgradeApplier.ts \
  apps/web/server/routers/workpack.ts \
  apps/web/server/routers.ts \
  apps/web/server/routers/monitoring.ts \
  apps/web/server/routers/adminOps.ts \
  apps/web/server/routers/tenantFeatureFlags.ts \
  apps/web/server/services/__tests__/workpackLearningService.test.ts \
  apps/web/server/services/__tests__/workpackPromotionService.test.ts \
  apps/web/server/services/__tests__/workpackTelemetryService.test.ts \
  apps/web/server/services/__tests__/workpackRolloutGateService.test.ts \
  apps/web/server/services/__tests__/workpackReadinessService.test.ts \
  apps/web/server/services/__tests__/workpackIncidentControlService.test.ts \
  apps/web/server/routers/__tests__/workpack.test.ts \
  apps/web/server/routers/__tests__/monitoring.workpack.test.ts \
  apps/web/server/routers/__tests__/tenantFeatureFlags.workpack.test.ts
```

Suggested message:
```text
feat(web): add workpack promotion telemetry and rollout controls
```

## Commit 5: Dedicated workpack UI surfaces

Scope:
- New workpack pages, workpack-specific UI primitives, and navigation helpers with page coverage.

Stage:
```bash
git add -- \
  apps/web/client/src/components/workpack/WorkpackStatusRail.tsx \
  apps/web/client/src/components/workpack/WorkpackSummaryHeader.tsx \
  apps/web/client/src/components/workpack/WorkpackSourcePanel.tsx \
  apps/web/client/src/components/workpack/WorkpackHistoryTimeline.tsx \
  apps/web/client/src/components/workpack/WorkpackDiffViewer.tsx \
  apps/web/client/src/components/workpack/WorkpackConnectorMatrix.tsx \
  apps/web/client/src/components/workpack/WorkpackMetricCards.tsx \
  apps/web/client/src/lib/workpackNavigation.ts \
  apps/web/client/src/lib/__tests__/workpackNavigation.test.ts \
  apps/web/client/src/pages/WorkpackIntakeStudio.tsx \
  apps/web/client/src/pages/WorkpackDetail.tsx \
  apps/web/client/src/pages/WorkpackReplayLab.tsx \
  apps/web/client/src/pages/WorkpackExceptionInbox.tsx \
  apps/web/client/src/pages/WorkpackConnectorStudio.tsx \
  apps/web/client/src/pages/WorkpackRoiDashboard.tsx \
  apps/web/client/src/pages/WorkpackDiscovery.tsx \
  apps/web/client/src/pages/__tests__/WorkpackIntakeStudio.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackDetail.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackReplayLab.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackExceptionInbox.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackConnectorStudio.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackRoiDashboard.test.tsx \
  apps/web/client/src/pages/__tests__/WorkpackDiscovery.test.tsx
```

Suggested message:
```text
feat(web): add workpack control-plane pages and shared ui
```

## Commit 6: Existing surface integration and admin visibility

Scope:
- Route wiring, entrypoint links from existing surfaces, admin rollout visibility, and regression tests for touched screens.

Stage:
```bash
git add -- \
  apps/web/client/src/App.tsx \
  apps/web/client/src/pages/WorkflowGallery.tsx \
  apps/web/client/src/pages/DesktopOpen.tsx \
  apps/web/client/src/pages/Dashboard.tsx \
  apps/web/client/src/pages/Chat.tsx \
  apps/web/client/src/pages/Teams.tsx \
  apps/web/client/src/components/admin/OpsEarlyWarningPanel.tsx \
  apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx \
  apps/web/client/src/components/admin/tenantFeatureFlagGroups.ts \
  apps/web/client/src/components/admin/__tests__/workpackRolloutPanels.test.tsx \
  apps/web/client/src/pages/__tests__/WorkflowGallery.test.tsx \
  apps/web/client/src/pages/__tests__/Dashboard.test.tsx \
  apps/web/client/src/pages/__tests__/Teams.test.tsx \
  apps/web/client/src/pages/__tests__/Chat.browserSession.test.tsx
```

Suggested message:
```text
feat(web): wire workpacks into gallery chat teams and admin surfaces
```

## Commit 7: Repo-wide typecheck hardening

Scope:
- Repair surrounding auth, desktop, release-build, audit, and finance type drifts so Feature 079 can land into a green repository state.

Stage:
```bash
git add -- \
  apps/web/client/src/services/authService.ts \
  apps/web/server/routes/desktopHost.ts \
  apps/web/server/services/auditLogger.ts \
  apps/web/server/services/desktopDeviceRegistryService.ts \
  apps/web/server/services/desktopReleaseBuildService.ts \
  apps/web/server/services/financeService.ts \
  apps/web/server/services/__tests__/financeService.test.ts \
  specs/feature/079-autonomous-work-transformation-platform/implementation/typecheck-blockers.md
```

Suggested message:
```text
fix(web): restore repo-wide typecheck around workpack integration
```

## Verification checkpoint before each commit

Recommended command set:
```bash
npm --workspace=@smartspec/web test -- \
  shared/__tests__/workpackContracts.test.ts \
  shared/__tests__/workpackPromotion.test.ts \
  shared/__tests__/workpackTelemetry.test.ts \
  shared/__tests__/workpackFeatureFlags.test.ts \
  server/services/__tests__/workpackIntakeService.test.ts \
  server/services/__tests__/workpackCompilerService.test.ts \
  server/services/__tests__/workpackConnectorService.test.ts \
  server/services/__tests__/workpackLedgerService.test.ts \
  server/services/__tests__/workpackExceptionService.test.ts \
  server/services/__tests__/workpackSimulationService.test.ts \
  server/services/__tests__/workpackReplayService.test.ts \
  server/services/__tests__/workpackLearningService.test.ts \
  server/services/__tests__/workpackPromotionService.test.ts \
  server/services/__tests__/workpackTelemetryService.test.ts \
  server/services/__tests__/workpackRolloutGateService.test.ts \
  server/services/__tests__/workpackReadinessService.test.ts \
  server/services/__tests__/workpackIncidentControlService.test.ts \
  server/routers/__tests__/workpack.test.ts \
  server/routers/__tests__/monitoring.workpack.test.ts \
  server/routers/__tests__/tenantFeatureFlags.workpack.test.ts \
  client/src/lib/__tests__/workpackNavigation.test.ts \
  client/src/pages/__tests__/WorkpackIntakeStudio.test.tsx \
  client/src/pages/__tests__/WorkpackDetail.test.tsx \
  client/src/pages/__tests__/WorkpackReplayLab.test.tsx \
  client/src/pages/__tests__/WorkpackExceptionInbox.test.tsx \
  client/src/pages/__tests__/WorkpackConnectorStudio.test.tsx \
  client/src/pages/__tests__/WorkpackRoiDashboard.test.tsx \
  client/src/pages/__tests__/WorkpackDiscovery.test.tsx \
  client/src/components/admin/__tests__/workpackRolloutPanels.test.tsx \
  client/src/pages/__tests__/WorkflowGallery.test.tsx \
  client/src/pages/__tests__/Teams.test.tsx \
  client/src/pages/__tests__/Dashboard.test.tsx \
  client/src/pages/__tests__/Chat.browserSession.test.tsx
```

Repo-wide typecheck now passes. Keep `npm --workspace=@smartspec/web run typecheck -- --pretty false` as a required gate between commits because this repository has several adjacent integration surfaces that can drift together.
