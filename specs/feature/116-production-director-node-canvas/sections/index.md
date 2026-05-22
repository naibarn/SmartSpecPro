<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-production-workspace-ux
section-02-context-assets-library-dnd
section-03-planning-skill-context-pack
section-04-react-flow-canvas
section-05-run-persistence-handoff
section-06-node-catalog-and-tool-config
section-07-video-shot-workspace
section-08-operational-safeguards
section-09-migration-and-backward-compatibility
section-10-execution-scheduler-and-delivery
section-11-timeline-continuity-and-cue-sheet
section-12-mvp-scope-and-acceptance-traceability
section-13-node-tool-binding-and-config-integrity
section-14-data-lifecycle-observability-release
section-15-product-image-storyboard-evidence-bridge
section-16-deep-implement-work-packets
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-production-workspace-ux | - | 04, 05, 07, 13 | Yes |
| section-02-context-assets-library-dnd | 01 | 03, 05, 15 | Yes |
| section-03-planning-skill-context-pack | 01, 02 | 04, 05, 06, 15 | Yes |
| section-04-react-flow-canvas | 01, 03, 06 | 05, 07, 13 | No |
| section-05-run-persistence-handoff | 01, 02, 03, 04 | 08, 10, 11, 14 | No |
| section-06-node-catalog-and-tool-config | 03 | 07, 08, 13 | Yes |
| section-07-video-shot-workspace | 04, 05, 06 | 10, 11, 13, 15 | No |
| section-08-operational-safeguards | 05, 06, 13 | 10, 14 | Yes |
| section-09-migration-and-backward-compatibility | 05 | 14 | Yes |
| section-10-execution-scheduler-and-delivery | 05, 07, 08, 13 | 11, 14 | No |
| section-11-timeline-continuity-and-cue-sheet | 07, 10 | 14 | Yes |
| section-12-mvp-scope-and-acceptance-traceability | all implementation sections | release gates | No |
| section-13-node-tool-binding-and-config-integrity | 05, 06 | 07, 10, 11 | No |
| section-14-data-lifecycle-observability-release | 05, 08, 10, 11 | live rollout | No |
| section-15-product-image-storyboard-evidence-bridge | 02, 03, 05, 07, 13 | 10, 11, 14 | Yes |
| section-16-deep-implement-work-packets | 01-15 | deep-implement waves | No |

## Execution Order

1. Sections 01-03 establish UX, asset, and planner context.
2. Sections 05, 06, and 13 establish contracts, persistence, and node binding before deep UI implementation.
3. Sections 04 and 07 build the canvas and Video Shot workspace against fixture planner output.
4. Sections 15 and 10 add product evidence and safe handoff/execution scaffolding.
5. Sections 11 and 14 add timeline/continuity plus operational gates.
6. Section 12 checks MVP boundaries and acceptance traceability.
7. Section 16 converts the plan into implementation work packets and is the wave map for deep-implement.

## Section Summaries

### section-01-production-workspace-ux

Dedicated Production workspace, project header, goal brief, project search, and exclusive tab behavior.

### section-02-context-assets-library-dnd

Library/search updates, character search, typed drag payloads, click-to-add fallback, and context drop zones.

### section-03-planning-skill-context-pack

Planner/verifier context pack, provider/tool capability registry inputs, and skill schema upgrades.

### section-04-react-flow-canvas

Node/edge canvas, editing, validation, layout save, group shot nodes, and list fallback.

### section-05-run-persistence-handoff

ProductionSpace persistence, project restore, versioned saves, and downstream handoff foundations.

### section-06-node-catalog-and-tool-config

Canonical node taxonomy and node-to-surface mapping.

### section-07-video-shot-workspace

Shot-level storyboard workspace, shot group nodes, child node graphs, mutation rules, and ordered story assembly.

### section-08-operational-safeguards

Versioning, optimistic locking, undo/redo, capability registry, idempotency, permissions, and recovery.

### section-09-migration-and-backward-compatibility

Compatibility adapter from the interim Production Director implementation and rollout/rollback strategy.

### section-10-execution-scheduler-and-delivery

Readiness-gated execution scheduler, credit reservation, progress lifecycle, captions/subtitles, delivery variants, and safe downstream handoff payloads.

### section-11-timeline-continuity-and-cue-sheet

Timecode model, shot cue sheet, transitions, audio/caption alignment, and cross-shot continuity rules.

### section-12-mvp-scope-and-acceptance-traceability

MVP boundaries, deferred capabilities, phase gates, requirement-to-test traceability, and release gating.

### section-13-node-tool-binding-and-config-integrity

Complete node-to-tool matrix, adapter contract, config snapshot lifecycle, output attachment lifecycle, and isolation tests.

### section-14-data-lifecycle-observability-release

Archive/delete/export, retention, audit events, metrics/alerts, kill switches, accessibility, and i18n readiness.

### section-15-product-image-storyboard-evidence-bridge

Product images as storyboard evidence, Feature 115 selected image import, per-shot product usage, product fidelity QA, and downstream evidence manifests.

### section-16-deep-implement-work-packets

Deep-implement wave packets with exact file areas, implementation order, dependencies, test targets, and exit criteria.
