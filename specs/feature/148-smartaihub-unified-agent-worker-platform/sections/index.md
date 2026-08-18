<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-mcp-oauth-discovery
section-02-client-onboarding
section-03-hermes-task-correlation
section-04-comfyui-worker-adapter
section-05-runtime-readiness-process-safety
section-06-ui-docs-telemetry-rollout
section-07-verification-and-handoff
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section                                     | Depends On         | Blocks         | Parallelizable |
| ------------------------------------------- | ------------------ | -------------- | -------------- |
| section-01-mcp-oauth-discovery              | -                  | 02, 03, 06, 07 | Yes            |
| section-02-client-onboarding                | 01                 | 06, 07         | No             |
| section-03-hermes-task-correlation          | 01                 | 06, 07         | No             |
| section-04-comfyui-worker-adapter           | 01, 03, 05         | 06, 07         | No             |
| section-05-runtime-readiness-process-safety | 01                 | 04, 06, 07     | Yes after 01   |
| section-06-ui-docs-telemetry-rollout        | 01, 02, 03, 04, 05 | 07             | No             |
| section-07-verification-and-handoff         | 01–06              | -              | No             |

## Execution Order

1. section-01-mcp-oauth-discovery.
2. section-02-client-onboarding and section-05-runtime-readiness-process-safety
   may proceed after section 01, but the dirty checkout requires explicit file
   ownership and the implementation runner should execute them sequentially.
3. section-03-hermes-task-correlation after section 01 and onboarding contract.
4. section-04-comfyui-worker-adapter after typed scheduler/relay and readiness
   contracts are stable.
5. section-06 UI/docs/telemetry after all behavior contracts exist.
6. section-07 focused verification, cross-section review, and handoff.

## Section Summaries

### section-01-mcp-oauth-discovery

Harden canonical MCP PRM, OAuth challenge/audience validation, production
DB-backed readiness, and truthful optional capability discovery.

### section-02-client-onboarding

Add versioned onboarding descriptors, browserless device/key fallback, and
client-specific Hermes/Claude/Codex setup while preserving integration panels.

### section-03-hermes-task-correlation

Reuse the existing Hermes external-agent gateway as a parent task and create
typed child-job correlation with durable idempotency and safe result projection.

### section-04-comfyui-worker-adapter

Implement the registered ComfyUI service adapter, progress/interrupt/output
validation, sequential scheduling, and existing artifact publication path.

### section-05-runtime-readiness-process-safety

Extend signed runtime profiles, claim-time readiness, managed installation, and
typed process-manager safety for Windows/macOS local media runtimes.

### section-06-ui-docs-telemetry-rollout

Align settings/manual/MCP resources, telemetry, feature-flag controls, and
user-visible status/fallback/revoke surfaces.

### section-07-verification-and-handoff

Run focused and integration checks, compare against spec, document external
production gates, and preserve unrelated worktree changes.
