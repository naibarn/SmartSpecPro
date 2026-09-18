# Usage Guide — Spec 202/203 Web Editor UI/UX

## Quick start

Open the active `/video-editor` route. The Phase3 shell now exposes:

- revision and saved/unsaved/autosave status in the header;
- a conflict panel with reload-latest and save-as-variant recovery actions;
- a Worker panel after submission, with reason-first polling, cancel guidance,
  pinned revision/runtime context, and an explicit `/worker-jobs` detail link;
- an AI Review panel with bounded scope, transcript state, change-set review,
  evidence/confidence, A/B preview, and QC blocking state;
- keyboard-accessible dialogs, project list, tabs, and mobile/tablet panel mode.

## Verification

```bash
cd apps/web
pnpm exec vitest run --environment jsdom \
  client/src/components/videoeditor/__tests__/editorUiSurfaces.test.tsx \
  client/src/components/videoeditor/__tests__/editorUiState.test.ts \
  client/src/components/videoeditor/__tests__/projectRevisionUi.test.ts \
  client/src/components/videoeditor/__tests__/executionStatusUi.test.ts \
  client/src/components/videoeditor/__tests__/reviewTypes.test.ts \
  client/src/components/videoeditor/__tests__/responsiveEditorUi.test.ts
```

The complete focused matrix and ten-round findings are recorded in
`../audits/ui-ux-10-round-audit-2026-09-18.md`.

## Main entry points

| Surface | Entry point |
|---|---|
| Shared status/error mapping | `client/src/components/videoeditor/ui/editorUiState.ts` |
| Status banner | `client/src/components/videoeditor/ui/EditorStatusBanner.tsx` |
| Legacy overlay focus policy | `client/src/components/videoeditor/ui/focusManagement.ts` |
| Revision/conflict | `client/src/components/videoeditor/ProjectConflictPanel.tsx` |
| Worker execution projection | `client/src/components/videoeditor/ui/executionStatusUi.ts` |
| In-editor job panel | `client/src/components/videoeditor/EditorJobStatusPanel.tsx` |
| AI review workspace | `client/src/components/videoeditor/review/ReviewWorkspacePanel.tsx` |
| Worker Jobs detail | `client/src/pages/RenderJobsPage.tsx` |

## Safety behavior

The UI never makes itself authoritative for revision, capability, artifact,
QC, or tenant state. It only projects server/runtime data. Unknown execution
states degrade to a review state, unverified output refs keep links disabled,
and unavailable transcript/change-set data is shown as unavailable rather than
invented.

Authenticated browser evidence at the six required viewports is still a release
gate and is documented in `../ui-browser-evidence.md`.
