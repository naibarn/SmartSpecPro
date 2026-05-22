# Contracts

## Planning Contract

This orchestra run is read-only for production code. It may write only orchestra session artifacts unless the conductor explicitly records a later planning-artifact patch. Subagents must not modify files.

## Wave 1 Contract: Completeness Audit

### Shared Interface

Each subagent returns a Result Report with:

- `status`: `success`, `partial`, or `failed`
- `files_changed`: empty list unless explicitly authorized
- `files_inspected`: absolute paths
- `findings`: blocking gaps, recommended gaps, and strengths
- `blockers`: missing files or ambiguity that prevents a verdict
- `quality_gate_results`: commands/checks run or explicitly skipped
- `verdict`: `ready`, `ready_with_notes`, or `not_ready`

### Ownership Boundaries

| Agent | Read scope | Write scope |
| --- | --- | --- |
| Product/spec completeness | `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/**/*.md` | none |
| Codebase integration | Feature 116 plan files plus SocratiCode-narrowed code touchpoints | none |
| QA/TDD readiness | Feature 116 plan, section manifest, TDD plan, work packets, review artifacts | none |

### Test Boundary

- Product/spec completeness: manual artifact review only.
- Codebase integration: SocratiCode-first mapping to existing code; no code edits.
- QA/TDD readiness: deep-plan section checker and whitespace/planning gate recommendations.

### Impact Boundary

| Affected path/symbol | Handling |
| --- | --- |
| `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas` | in-scope-now, read-only audit |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.ts` | quality-gate-only via plan mapping; no edit |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProduction.ts` | quality-gate-only via plan mapping; no edit |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/MediaStudio.tsx` | quality-gate-only via plan mapping; no edit |

### Dispatch Metadata

- writer_count: 0
- dispatch_mode: parallel
- ownership_map: read-only disjoint review responsibilities
- merge_owner: conductor
- verification_owner: conductor

## Wave 5 Contract: End-to-End UI/UX Completeness Audit

### Shared Interface

Each subagent returns a Result Report with:

- `status`: `success`, `partial`, or `failed`
- `files_changed`: empty list
- `files_inspected`: absolute paths
- `findings`: grouped as blocking, recommended, optional
- `blockers`: gaps that prevent implementation-ready status
- `verdict`: `ready`, `ready_with_notes`, or `not_ready`

### Ownership Boundaries

| Agent | Read scope | Write scope |
| --- | --- | --- |
| Product Journey | Feature 116 spec, UX/workflow sections, implementation plan, reviews | none |
| Visual/UI | Feature 116 UI sections, UI/UX contract references, visual-ui-enhancement rubric | none |
| System Consistency | Feature 116 codebase touchpoints, router/service/flags/media boundaries, architecture sections | none |
| QA/TDD | Feature 116 TDD plan, section manifest, work packets, acceptance traceability | none |

### Test Boundary

- Product Journey: manual journey/decision/recovery audit.
- Visual/UI: UI/UX/a11y/responsive planning audit; browser evidence requirements review.
- System Consistency: SocratiCode-first mapping to current code boundaries; no code edits.
- QA/TDD: section checker, traceability, test coverage/gate review.

### Impact Boundary

| Affected path/symbol | Handling |
| --- | --- |
| `/home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas` | in-scope-now, read-only audit |
| Media Studio Production workflow | quality-gate-only via plan/codebase mapping |
| Feature flags and execution/handoff boundaries | quality-gate-only via plan/codebase mapping |

### Dispatch Metadata

- writer_count: 0
- dispatch_mode: parallel
- ownership_map: read-only review responsibilities
- merge_owner: conductor
- verification_owner: conductor
