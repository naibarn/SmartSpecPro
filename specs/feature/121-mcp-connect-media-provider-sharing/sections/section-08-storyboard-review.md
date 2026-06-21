# Section 08: Storyboard Review MCP Transport

## Goal

Enable Storyboard Review video generation/regeneration to use MCP Connect for selected tasks while preserving old drafts and Gateway API behavior.

## Depends On

- Section 04 media router integration.
- Section 06 Media Studio vertical slice.
- Section 07 handoff metadata if Marketplace Auto Review generated the draft.

## Files

Modify:

- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- `apps/web/server/routers/videoEditorProjects.ts`
- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx`
- extend relevant `apps/web/server/routers/__tests__/videoEditorProjects*.test.ts`

## Metadata Contract

Extend draft/task metadata with optional fields from the shared `MediaTaskTransportMetadata` contract:

- `transport`
- `mcpConnectionId`
- `sharedGroupId`
- `connectionOwnerUserId`
- `creditPolicy`
- `originSurface`
- provider/tool/schema hash fields where available

Missing transport means `gateway_api`.
Do not introduce a Storyboard Review-only transport metadata shape; serialize only the subset of `MediaTaskTransportMetadata` required by drafts/tasks.

## Behavior

- Inherit metadata from Auto Storyboard Review/Marketplace handoff when present.
- Let user change transport/connection for selected pending/regeneration tasks.
- Show provider account, transport, and credit source during progress.
- Require owner approval for shared video jobs.
- Stop pending tasks and offer explicit fallback when MCP unavailable.
- Mixed batches show per-task badges and batch summary counts.

## UI/UX Contract

### Target User / JTBD

- Role: reviewer approving/regenerating storyboard video clips.
- Goal: choose provider account for selected clips and understand mixed API/MCP results.
- Entry point: Storyboard Review page.
- Success outcome: selected tasks generate/regenerate with clear transport status and safe fallback.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| task controls | `StoryboardReviewPage.tsx` | selected-task transport/connection controls |
| progress summary | `StoryboardReviewPage.tsx` | batch transport/credit summary |
| workspace draft | `storyboardReviewWorkspace.ts` | optional transport metadata |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Storyboard task transport controls | `StoryboardReviewPage.tsx` | selected-task MCP/Gateway choice | connection picker metadata |
| Batch fallback dialog | `StoryboardReviewPage.tsx` | explicit fallback confirmation | failed/pending task state |
| Workspace metadata helpers | `storyboardReviewWorkspace.ts` | backward-compatible transport serialization | draft/task metadata |

### State Matrix

Cover: old draft gateway, inherited MCP, selected MCP, mixed selection, no connection, approval pending, provider failure, fallback confirmation, cancelled.

### Responsive Matrix

Verify mobile/tablet/desktop for task control density and no badge overflow.

### Accessibility Acceptance

Selected-task controls have labels; batch fallback dialog traps focus; badges have text labels.

### Copy Contract

Labels match Media Studio: `Gateway API`, `MCP Connect`, provider account credits, retry with Gateway API.

### Browser Evidence Required

Screenshots for old gateway draft, MCP selected tasks, fallback confirmation, and mixed batch summary.

## Tests First

- Test: old drafts without transport load as Gateway API.
- Test: `MediaTaskTransportMetadata` subset serializes/deserializes through workspace helpers.
- Test: selected tasks can set MCP metadata.
- Test: inherited metadata remains stable after reload.
- Test: fallback approval changes only remaining pending tasks.
- Test: mixed batch summary counts API and MCP.
- Test: shared video approval required.

Test file targets:

- `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`
- `apps/web/client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx`
- relevant `apps/web/server/routers/__tests__/videoEditorProjects*.test.ts`

Verification commands:

- `cd apps/web && npm test -- client/src/lib/storyboardReviewWorkspace.test.ts client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts`
- `cd apps/web && npm run check`

## Acceptance Criteria

- Storyboard Review remains usable without MCP flags.
- Draft metadata is backward compatible.
- MCP generation/regeneration works through existing async media boundary.
