# Section 03: Export Warning UX Surfacing

## Goal

ทำให้ warning เรื่อง static export ตัด media motion กลายเป็นข้อความที่ผู้ใช้เข้าใจและใช้ตัดสินใจได้ใน export flow จริง

## Scope

- Define human-readable message mapping for `SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED`
- Surface warning in export UI using existing export warning plumbing
- Keep raw warning code available for debugging/logging if needed, butไม่ใช่ primary UX

## Likely Files

- `apps/web/client/src/components/presentation/ExportDialog.tsx`
- `apps/web/client/src/components/presentation/ExportDialog.test.tsx`
- `apps/web/client/src/pages/PresentationEditor.tsx`
- optional shared warning-copy helper if current codebase benefits from centralization

## Implementation Notes

- Prefer deduplicated summary copy, e.g. static formats flatten motion and MP4 preserves it
- If warning data is only available after export trigger/result, make sure dialog or result area can render it in the right phase
- Avoid format-specific ambiguity; mention `png`, `jpg`, `pdf` explicitly where helpful

## Acceptance Checks

- User sees a readable warning when exporting static formats from a deck with media motion
- Message explains consequence and recommended alternative (MP4)
- Existing export dialog tests still pass with the new warning block

## TDD Slice

1. Add UI test for warning summary rendering
2. Add message-format test for dedupe/grouping if multiple slides emit the same warning
3. Wire component state/props and keep existing export flow behavior intact
