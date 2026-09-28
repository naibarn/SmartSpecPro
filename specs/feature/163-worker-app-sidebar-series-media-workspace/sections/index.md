<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-principal-scopes
section-02-control-plane-binding
section-03-native-coordinator
section-04-worker-shell-ui
section-05-media-workspace-integration
section-06-integration-rollout
END_MANIFEST -->

# Feature 163 implementation sections

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 principal/scopes | - | 02, 03, 04 | yes |
| 02 Control Plane/binding | 01 | 03, 04, 05, 06 | no |
| 03 native coordinator | 01, 02 | 04, 05, 06 | no |
| 04 Worker shell/UI | 01, 02, 03 | 05, 06 | no |
| 05 Media Workspace integration | 01-04, Feature 162 contracts | 06 | no |
| 06 integration/rollout | 01-05 | - | no |

## Execution order

1. Section 01 shared principal/scope/action contracts.
2. Section 02 neutral access, binding persistence, and routes.
3. Section 03 native root/coordinator/control-plane client.
4. Section 04 shell/context/sidebar/screens/Quick Actions.
5. Section 05 Feature 162 mounting and integration states.
6. Section 06 migration, flags, tests, rollout, and final review.

## Section summaries

### section-01-principal-scopes
Effective Worker principal, access projection, canonical scope registry,
execution/upload split, Quick Action and error schemas.

### section-02-control-plane-binding
Neutral Series access service, REST Control Plane routes, binding migration,
idempotency/cursor/revision/audit and revoke lifecycle.

### section-03-native-coordinator
Tauri root picker/validation, HMAC/cache policy, singleton coordinator,
durable local jobs, recovery, and typed server client.

### section-04-worker-shell-ui
Route registry, Sidebar, Topbar, WorkerContext, legacy aliases, screen states,
Quick Actions and accessibility/responsive behavior.

### section-05-media-workspace-integration
Mount Feature 162 child screens under selected Series/root context and connect
queue/published/runtime/access projections without duplicating media logic.

### section-06-integration-rollout
Pair-to-revoke integration tests, migration dry-run, feature flags, rollback,
observability, browser/native evidence checklist, and final audit.
