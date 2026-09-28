<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-media-contracts
section-02-media-persistence-services
section-03-worker-local-pipeline
section-04-comfy-mcp-shot-generation
section-05-media-workspace-ui
section-06-integration-rollout
END_MANIFEST -->

# Feature 162 implementation sections

## Dependency graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts | - | 02, 03, 04, 05 | yes |
| 02 persistence/services | 01 | 04, 05, 06 | no |
| 03 Worker local pipeline | 01 | 04, 06 | yes after 01 |
| 04 Comfy MCP shot generation | 01, 02, 03 | 06 | no |
| 05 Media Workspace UI | 01, 02 | 06 | yes with 03/04 after dependencies |
| 06 integration/rollout | 01-05 | - | no |

## Execution order

1. Section 01 shared contracts.
2. Sections 02 and 03 after section 01.
3. Sections 04 and 05 after their stated dependencies.
4. Section 06 integration, rollout flags, and final verification.

## Section summaries

### section-01-media-contracts
Strict shared schemas for media roots, source/probe/analysis/edit/QC plans,
workflow resolution, start/reference frames, job/artifact states, and errors.

### section-02-media-persistence-services
Additive Drizzle persistence plus server media job admission, access/policy
rechecks, artifact verification/publication, workflow resolution, and indexing.

### section-03-worker-local-pipeline
Tauri-native root safety, local scan/probe/plan/process/QC/checkpoint state, and
derived-only publication bridge.

### section-04-comfy-mcp-shot-generation
Typed MCP adapter, capability probe, workflow registry resolution, start-frame
and reference-frame staging, execution reconciliation, and shot artifact QC.

### section-05-media-workspace-ui
Nine-shot storyboard controls and Feature 163 Media Workspace child screens,
including state, responsive, accessibility, workflow and approval controls.

### section-06-integration-rollout
End-to-end fixtures/tests, flags, migration dry-run, observability, rollout,
rollback, and evidence boundaries.
