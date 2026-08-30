<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: npm --workspace apps/web test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-server-access-workflow-migration
section-02-shot-dispatch-publication
section-03-native-mcp-analysis
section-04-storyboard-shot-inspector
section-05-worker-canonical-shell
section-06-media-workspace-batch
section-07-integration-verification
END_MANIFEST -->

# Gap Closure Sections

## Dependency graph

| Section | Depends on | Parallelizable |
|---|---|---|
| 01 server/access/workflow/migration | — | No, schema single writer |
| 02 shot dispatch/publication | 01 | No |
| 03 native MCP/analysis | 01 | Partial after 01 |
| 04 storyboard inspector | 02 | No |
| 05 Worker canonical shell | 01 | Partial with 04 |
| 06 workspace batch | 01, 03, 05 | No |
| 07 integration verification | 01–06 | No |

## Execution order

1. 01; run schema and contract gates.
2. 02 and 03 sequentially in this conductor session; run affected gates.
3. 04 and 05; run UI/type gates.
4. 06; run Worker/native and integration gates.
5. 07; perform review convergence and final gap triage.
