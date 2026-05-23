# Orchestra Contracts

## Contract: shared/backend/frontend — Feature 116 ProductionSpace Extensions

### Shared Interface
- `ProductionSpace.planningSelection?: ProductionPlanningSelection`
  - skill id/slug/title/tags, selected model mode, context pack summary, provider/capability compatibility.
- `ProductionNodeCatalogEntry[]`
  - shared catalog entries with `mvp`, `adapterStatus`, and `deferredReason` so full node matrix can be visible without requiring adapters.
- `ProductionDownstreamResultImport`
  - input includes `sourceSpaceVersion`, `target`, `recordId`, `selectedTakeRefs`, `timelineCueUpdates`, `captionUpdates`, `productWarningResolutions`, `manualApprovals`, `allowLockedUpdates`.
  - service/router response includes `{ space, version, record, importedShotIds, importedCueIds, skippedLockedIds }`.

### Ownership Boundaries
| File | Owner |
|---|---|
| /home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/server/services/productionSpaceService.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/server/routers/mediaProduction.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/productionSpaceService.test.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/mediaProduction.execution.test.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/shared/mediaProduction.test.ts | conductor |
| /home/dev/projects/SmartSpecPro/apps/web/client/src/features/media-production/components/*.tsx | conductor |
| /home/dev/projects/SmartSpecPro/specs/feature/116-production-director-node-canvas/** | conductor |

### Test Boundary
- Shared: node catalog contains MVP and deferred full-matrix entries; handoff payload remains server-safe.
- Service: downstream import rejects stale source versions, skips locked shots/nodes unless explicitly allowed, appends audit/metrics/record.
- Router: protected procedure requires tenant context and enforces owner/collaborator access through service layer; targeted integration covers new import route.
- UI: component tests should prove planning skill/model panel and project header affordances render without enabling provider generation.

### Impact Boundary
| Affected path/symbol | Handling |
|---|---|
| `ProductionSpace` shared type | in-scope-now |
| `validateProductionSpace` / `deriveProductionHandoffPayload` | in-scope-now + shared tests |
| `mediaProduction.importDownstreamResult` tRPC procedure | in-scope-now + router tests + security gate |
| Production UI components | in-scope-now + component tests |
| Migration SQL / DB schema | quality-gate/spec-test evidence only; no destructive migration in this wave |
| Existing Image/Video/Audio workflows | quality-gate-only via targeted tests/typecheck |

## Dispatch Metadata
- writer_count: 1 conductor-owned writer
- dispatch_mode: parallel read-only explorers plus sequential conductor edits
- merge_owner: conductor
- verification_owner: conductor

---

## Contract: UI/UX Review — Feature 116 Production Director

### Shared Interface
- Read-only review surface: Media Studio Production Director UI and supporting browser evidence.
- No files should be modified by reviewer agents. Findings must be concrete, severity-ranked, and reference file paths/selectors/screenshots where possible.

### Ownership Boundaries
| Agent | Scope |
|---|---|
| visual-ux-reviewer | visual hierarchy, action priority, workflow clarity, density, copy clarity, consistency with Media Studio/shadcn patterns |
| accessibility-reviewer | keyboard path, focus visibility, labels/accessible names, semantics, contrast/readability, reduced motion/state communication |
| responsive-reviewer | 390x844, 768x1024, 1024x768, 1280x800, 1440x900 behavior, overflow, canvas scroll/pan interaction, touch target risks |
| conductor | SocratiCode preflight, local evidence integration, browser command execution, final review report |

### Test Boundary
- Agents may recommend tests but must not edit tests.
- Conductor owns any browser evidence command and final pass/fail interpretation.

### Impact Boundary
| Surface | Handling |
|---|---|
| ProductionWorkspace UI | review-only |
| ProductionFlowCanvas UI / scroll behavior | review-only |
| ContextAssetBoard / NodeConfigPanel | review-only |
| MediaStudio shell and right rail | review-only |
| Backend/shared contracts | out-of-scope for this review |

### Dispatch Metadata
- writer_count: 0
- dispatch_mode: parallel_batch
- model_preference: gpt-5.3-codex-spark
- merge_owner: conductor
- verification_owner: conductor
