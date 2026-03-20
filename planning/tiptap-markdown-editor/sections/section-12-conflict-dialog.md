I have all the necessary context. Now I will produce the section content.

# Section 12: Conflict Resolution Dialog

## Overview

This section implements `ConflictResolutionDialog.tsx`, a modal dialog that appears when an auto-save or manual save fails due to an optimistic locking conflict (`expectedUpdatedAt` mismatch). The dialog presents two clear options: overwrite the server version with local changes, or reload the latest server version (discarding local edits). It also integrates with the auto-save mechanism to pause retries while the dialog is open and resume after the user makes a choice.

## Dependencies

- **Section 10** (Page Integration): The conflict dialog is mounted inside `UnifiedDocumentSurface` and wired into the save flow that Section 10 establishes.
- **Section 03** (Editor Surface): `UnifiedDocumentSurface.tsx` manages auto-save debounce and must expose pause/resume controls.

## Background

### How Conflicts Occur

The `trpc.library.saveMarkdown` mutation accepts an optional `expectedUpdatedAt` parameter for optimistic locking. When the server receives a save request where `expectedUpdatedAt` does not match the document's current `updatedAt` timestamp in the database, it throws a `LibraryMarkdownVersionConflictError`. This happens when:

- The same document is open in two browser tabs and both auto-save independently.
- A background re-indexing job updates the document's `updatedAt` timestamp between the user's load and save.

### Current Behavior (Before This Section)

The existing `DocumentManagement.tsx` save handler (around line 724) catches version conflict errors and immediately retries without `expectedUpdatedAt` (last-write-wins). This is a silent overwrite with no user notification. The new editor replaces this with an explicit user choice.

### Existing UI Pattern

The project uses Radix `AlertDialog` components from `@smartspec/ui`. The re-export is at `apps/web/client/src/components/ui/alert-dialog.tsx`. The available primitives are: `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle`.

### Draft State Shape

The `MarkdownDraftState` interface (defined in `DocumentManagement.tsx` around line 89) tracks per-document state:

```
interface MarkdownDraftState {
  value: string;
  savedValue: string;
  updatedAt?: string;
}
```

Both resolution options must update this state correctly after the user chooses.

---

## Tests (Write First)

### File: `apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx`

```
# Test: renders warning message when open={true}
#   Mount the dialog with open=true, verify the warning text about
#   "document modified elsewhere" is visible in the document.

# Test: "Overwrite" button fires onOverwrite callback
#   Mount with onOverwrite mock, click the overwrite button,
#   verify the mock was called exactly once.

# Test: "Reload" button fires onReload callback
#   Mount with onReload mock, click the reload button,
#   verify the mock was called exactly once.

# Test: dialog cannot be dismissed without choosing an option
#   Mount with open=true, attempt to close via Escape key or clicking
#   outside the overlay. Verify the dialog remains visible and neither
#   onOverwrite nor onReload was called.

# Test: dialog shows document title when provided
#   Mount with documentTitle="My Report", verify the title appears
#   in the dialog content so users know which document has a conflict.

# Test: dialog is not rendered when open={false}
#   Mount with open=false, verify no dialog content in the DOM.
```

Implementation notes for tests:
- Use Vitest with `jsdom` environment and `@testing-library/react`.
- Import `AlertDialog` primitives from `@/components/ui/alert-dialog`.
- For the "cannot be dismissed" test, Radix AlertDialog does not close on overlay click or Escape by default when there is no `AlertDialogCancel` wired to close. The component should not pass an `onOpenChange` handler that allows dismissal without a choice. Verify by simulating `Escape` keydown on the dialog content and asserting `open` state has not changed (the parent controls `open`).
- Mock `useTranslation` (or the project's `useTranslation` hook) to return English strings for test assertions.

---

## Implementation Details

### Step 1: Create the ConflictResolutionDialog Component

**File to create**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/ConflictResolutionDialog.tsx`

This is a controlled dialog component. The parent manages the `open` state.

**Props interface:**

```typescript
interface ConflictResolutionDialogProps {
  open: boolean;
  documentTitle?: string;
  onOverwrite: () => void;
  onReload: () => void;
}
```

**Component structure:**

- Uses `AlertDialog` from `@/components/ui/alert-dialog` with `open` prop (no `onOpenChange` -- the dialog cannot be dismissed without choosing).
- `AlertDialogContent` wraps the entire dialog body.
- `AlertDialogHeader` with `AlertDialogTitle` showing a warning icon (Lucide `AlertTriangle`) and a title like `t("editor.conflict.title")`.
- `AlertDialogDescription` explaining that the document was modified elsewhere (in another tab or by another user) and the user must choose how to proceed. If `documentTitle` is provided, include it in the message.
- `AlertDialogFooter` with two buttons:
  - **Reload** button (secondary/outline style) -- calls `onReload`. This is the safer option so it appears first (left position). Use `AlertDialogCancel` or a plain `Button` styled as secondary.
  - **Overwrite** button (destructive style) -- calls `onOverwrite`. Use `AlertDialogAction` with destructive variant. This is the "dangerous" option so it gets the warning color.

**Key behaviors:**

- The dialog must NOT have an `onOpenChange` callback that would allow closing without a choice. The `open` prop is controlled entirely by the parent.
- No `X` close button in the header.
- Escape key should not dismiss the dialog. **WARNING**: Radix `AlertDialog` DOES close on Escape by default. Must explicitly add `onEscapeKeyDown={(e) => e.preventDefault()}` and `onPointerDownOutside={(e) => e.preventDefault()}` on `AlertDialogContent` to block dismissal without choosing an option. Verify this in the "cannot be dismissed" test.

### Step 2: Add i18n Keys

**Files to modify:**
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/i18n/locales/en.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/client/src/lib/i18n/locales/th.ts`

Add the following keys under an `editor.conflict` namespace (or wherever the project nests editor-related keys):

| Key | English | Thai |
|-----|---------|------|
| `editor.conflict.title` | `"Document Conflict"` | `"เอกสารขัดแย้ง"` |
| `editor.conflict.description` | `"This document has been modified elsewhere (another tab or user). Choose how to proceed:"` | `"เอกสารนี้ถูกแก้ไขจากที่อื่น (แท็บอื่นหรือผู้ใช้อื่น) เลือกวิธีดำเนินการ:"` |
| `editor.conflict.overwrite` | `"Overwrite"` | `"บันทึกทับ"` |
| `editor.conflict.overwriteHint` | `"Save your version, discarding the other changes"` | `"บันทึกเวอร์ชันของคุณ ละทิ้งการเปลี่ยนแปลงอื่น"` |
| `editor.conflict.reload` | `"Reload"` | `"โหลดใหม่"` |
| `editor.conflict.reloadHint` | `"Load the latest version, discarding your unsaved changes"` | `"โหลดเวอร์ชันล่าสุด ละทิ้งการเปลี่ยนแปลงที่ยังไม่ได้บันทึก"` |

### Step 3: Integrate with UnifiedDocumentSurface Save Flow

**File to modify**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx`

The save handler inside `UnifiedDocumentSurface` (or in `DocumentManagement.tsx` depending on where save is orchestrated after Section 10) must be updated to:

1. **Detect conflict errors**: In the `catch` block of the save mutation, check the tRPC error shape — NOT by string-matching the message (fragile). Use one of these approaches:
   - **Preferred**: Check `error.data?.httpStatus === 409` (the server returns HTTP 409 for version conflicts)
   - **Alternative**: Check `error.message.includes("CONFLICT")` (tRPC error code, more stable than the human-readable message)
   - **Do NOT**: Use `error.message.includes("version conflict")` — this depends on the exact English error message text which could change without TypeScript catching the regression

2. **Pause auto-save**: When a conflict is detected, set a `conflictDetected` state flag to `true`. The auto-save debounce timer should check this flag and skip firing when it is `true`.

3. **Show the dialog**: Render `ConflictResolutionDialog` with `open={conflictDetected}`.

4. **Update save status**: While the conflict dialog is open, the toolbar save status indicator should show "Conflict detected" (add i18n key `editor.save.conflict` / `"ตรวจพบความขัดแย้ง"`).

**State additions to UnifiedDocumentSurface:**

```
const [conflictDetected, setConflictDetected] = useState(false);
```

### Step 4: Implement the Overwrite Handler

When the user clicks "Overwrite":

1. Call `saveMarkdownMutation.mutateAsync` again with the same content but **without** the `expectedUpdatedAt` parameter. This performs a last-write-wins save.
2. On success: update `markdownDraftByDocId[docId]` with the new `savedValue` and `updatedAt` from the server response. Set `conflictDetected = false`. Resume auto-save.
3. On failure: show an error toast. The conflict dialog closes but the error state is set so the user sees the error banner.

This mirrors the existing retry logic at line 728 of `DocumentManagement.tsx`, but makes it user-initiated rather than automatic.

### Step 5: Implement the Reload Handler

When the user clicks "Reload":

1. Invalidate the tRPC query: `trpcUtils.library.getMarkdownContent.invalidate({ id: documentId })`.
2. Fetch the latest content. When the query refetches, the new content arrives via the `markdownContentQuery.data` path.
3. Re-parse the new markdown into the Tiptap editor using `editor.commands.setContent(TiptapMarkdownBridge.parse(newContent))`.
4. Update `markdownDraftByDocId[docId]` so that `value`, `savedValue`, and `updatedAt` all reflect the freshly loaded content (document is now clean/not dirty).
5. Set `conflictDetected = false`. Resume auto-save.

**Important**: The user loses their unsaved local changes when choosing Reload. The dialog description must make this clear.

### Step 6: Auto-Save Pause/Resume Mechanism

The auto-save debounce (2-second timer after last edit, established in Section 03) must respect the conflict state.

**Approach**: In the `onUpdate` callback or the debounce trigger, add a guard:

```
if (conflictDetected) return; // skip auto-save while conflict dialog is open
```

After either resolution (overwrite or reload), set `conflictDetected = false`, which allows the next edit to re-trigger the auto-save timer normally.

If the user continues typing while the conflict dialog is open (possible if they switch to source mode or if the dialog is non-blocking in a future iteration), the typed content is still tracked in `markdownDraftByDocId` but is not sent to the server until the conflict is resolved.

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/client/src/components/editor/ConflictResolutionDialog.tsx` | **Create** |
| `apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx` | **Create** |
| `apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx` | **Modify** (add conflict state, dialog rendering, save error handling) |
| `apps/web/client/src/lib/i18n/locales/en.ts` | **Modify** (add `editor.conflict.*` and `editor.save.conflict` keys) |
| `apps/web/client/src/lib/i18n/locales/th.ts` | **Modify** (add corresponding Thai translations) |

---

## Verification Checklist

After implementation, verify:

1. All six tests in `ConflictResolutionDialog.test.tsx` pass.
2. Simulate a conflict by opening the same markdown document in two browser tabs, editing in both, and saving. The second save should show the conflict dialog.
3. Choosing "Overwrite" saves successfully and the document reflects local changes.
4. Choosing "Reload" fetches the latest version and the editor content updates to match the server version.
5. Auto-save does not fire while the conflict dialog is open.
6. Auto-save resumes normally after choosing either option.
7. The save status indicator shows "Conflict detected" while the dialog is open.
8. Both English and Thai translations render correctly in the dialog.

---

## Implementation Notes (Post-Implementation)

### Architecture Deviation from Plan

The plan called for internal `conflictDetected` state in UnifiedDocumentSurface with a `triggerConflict` callback. During code review, this was identified as problematic because the save handler lives in the parent (DocumentManagement.tsx), making the trigger dead code.

**Revised approach**: Parent-controlled conflict via props:
- `hasConflict: boolean` — parent sets true when 409 detected
- `onSaveForce: (md: string) => void` — called on "Overwrite"
- `onReloadContent: () => void` — called on "Reload"
- `documentTitle?: string` — shown in dialog for context

This keeps conflict detection in the save handler (parent) where it belongs, while the surface only manages the UI.

### Other Changes from Review
- Used `useI18n` instead of `react-i18next` (project's custom i18n system)
- Conditional render `{hasConflict && <Dialog>}` instead of `<Dialog open={hasConflict}>` to avoid i18n provider requirement when dialog is hidden
- Removed duplicate `editor.conflict.message` key (superseded by `editor.conflict.description`)

### Actual Files Modified/Created

| File | Action |
|------|--------|
| `apps/web/client/src/components/editor/ConflictResolutionDialog.tsx` | **Created** |
| `apps/web/client/src/components/editor/ConflictResolutionDialog.test.tsx` | **Created** — 6 tests |
| `apps/web/client/src/components/editor/UnifiedDocumentSurface.tsx` | **Modified** — conflict props, auto-save pause, dialog rendering |
| `apps/web/client/src/components/editor/types.ts` | **Modified** — added conflict props to UnifiedDocumentSurfaceProps |
| `apps/web/client/src/lib/i18n/locales/en.ts` | **Modified** — added 4 conflict keys |
| `apps/web/client/src/lib/i18n/locales/th.ts` | **Modified** — added 4 Thai conflict keys |

### Test Results

All 6 dialog tests + 15 surface tests pass (21 total).