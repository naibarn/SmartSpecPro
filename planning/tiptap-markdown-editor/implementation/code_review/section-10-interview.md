# Section 10 Code Review Interview

## Auto-fixes Applied

### 1. Fix misleading `onEnterEditMode` comment (HIGH)
- **Finding**: Comment said "handles mode switch internally" but the callback is a notification FROM the surface, not a command TO it.
- **Fix**: Updated to `/* No-op: preview panel removed in S10; surface manages mode internally */`
- **Status**: Applied

### 2. Add missing i18n keys (MEDIUM)
- **Finding**: `editor.toolbar.strikethrough`, `editor.toolbar.divider`, `editor.toolbar.table` missing from both en.ts and th.ts.
- **Fix**: Added all three keys with English and Thai translations.
- **Status**: Applied

## Let Go (Not in scope / pre-existing)

### 3. `uploadStatusById.get` potential undefined (HIGH)
- **Reason**: Pre-existing code, not changed in this section. The `toProvisionalDocumentItem` call existed before S10.
- **Decision**: Out of scope for this section.

### 4. `ids: [1]` sentinel in uploadStatusQuery (HIGH)
- **Reason**: Pre-existing code with `enabled` guard preventing actual query. Not introduced by S10.
- **Decision**: Out of scope.

### 5. `editor.save.conflict` value discrepancy (MEDIUM)
- **Reason**: Minor wording difference ("Conflict detected" vs "Document modified elsewhere"). Both are valid. Section 12 will use the `editor.conflict.*` keys for the full dialog.
- **Decision**: Acceptable as-is.

### 6. Out-of-scope changes in diff (MEDIUM)
- **Reason**: These are from prior branch work on the same branch. The diff compares against HEAD which includes many other features.
- **Decision**: Not relevant to section-10 review.

### 7. Mobile tab test placeholder (MEDIUM)
- **Reason**: TypeScript compiler catches type mismatches. The `as const` assertion on the tab array ensures compile-time safety. The real test is `pnpm check` passing.
- **Decision**: Acceptable for now; hardening tests in S13 can strengthen this.

### 8. LOW findings (resize math comment, processingMeta, replace dialog text)
- **Reason**: All pre-existing or cosmetic. Not actionable for S10.
- **Decision**: Let go.
