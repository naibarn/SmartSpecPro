<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm exec vitest run shared/videoEditorContracts.test.ts client/src/components/videoeditor/__tests__/workerRenderHandoff.test.ts client/src/components/videoeditor/__tests__/workerEditorProject.test.ts server/services/__tests__/compositionScanJob.test.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-project-adapter
section-02-operation-bridge
section-03-timeline-change-sets
section-04-ai-tools-transcript
section-05-preview-render-qc
section-06-acceptance-rollout
END_MANIFEST -->

# Spec 202 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 project adapter | Spec 203 01–03 | 02, 03, 06 | no |
| 02 operation bridge | Spec 203 03–04, 01 | 05, 06 | no |
| 03 timeline/change sets | Spec 203 01–05, 01 | 04, 05, 06 | no |
| 04 AI tools/transcript | 01, 02, 03 | 05, 06 | no |
| 05 preview/render/QC | 02, 03, 04, Spec 203 06–07 | 06 | no |
| 06 acceptance/rollout | 01–05, Spec 203 09 | - | no |

## Execution order

1. section-01-project-adapter
2. section-02-operation-bridge and section-03-timeline-change-sets
3. section-04-ai-tools-transcript
4. section-05-preview-render-qc
5. section-06-acceptance-rollout

## Section summaries

### section-01-project-adapter
Server revision load/save/autosave, legacy conversion, conflict UX, and domain
separation.

### section-02-operation-bridge
Worker/Node operation dispatch, Full Scan status, degraded review, cancel, and
retry.

### section-03-timeline-change-sets
EDL mapping, non-destructive change sets, protected ranges, undo/redo, and
canonical timeline synchronization.

### section-04-ai-tools-transcript
Suggest/Draft/Apply modes, transcript/timeline sync, inspector, and suggestions
inbox state.

### section-05-preview-render-qc
Source/plan parity, progress, cancellation, QC, artifact visibility, and
restore/rollback UX.

### section-06-acceptance-rollout
Focused/browser tests, bilingual accessibility/responsive evidence, feature
flags, and unsupported capability release gates.
