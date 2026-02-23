# Orchestra Contracts

## Contract: Presentation version history frontend ↔ backend

### Shared Interface
- Procedure: `trpc.presentation.listVersions`
- Input: `{ deckId: number; limit?: number; offset?: number }`
- Response item shape:
  `{ id: number; versionNumber: number; contentType: string; changeDescription: string | null; createdAt: Date; createdByUserId: number; snapshot: { schemaVersion: "presentation_slide_snapshot_v1"; deckId: number; slideId: number; slideTitle: string; slideVersion: number; saveMode: "manual"; savedAt: string } | null }`
- Procedure: `trpc.presentation.restoreVersion`
- Input: `{ deckId: number; versionId: number }`
- Response shape: `{ restoredSlideId: number; restoredSlideVersion: number; deckVersion: number }`

### Ownership Boundaries
| File | Owner |
|------|-------|
| /home/dev/projects/SmartSpecPro/apps/web/server/services/presentationService.ts | backend wave |
| /home/dev/projects/SmartSpecPro/apps/web/server/routers/presentation.ts | backend wave |
| /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.tsx | frontend wave |
| /home/dev/projects/SmartSpecPro/apps/web/client/src/pages/PresentationEditor.test.tsx | frontend wave |

### Test Boundary
- backend: validate list/restore procedures and snapshot persistence behavior.
- frontend: validate history UI rendering and restore-trigger flow from Presentation Editor.
