---
name: Spec 046 — Tiptap Single-Panel Markdown Editor Review
description: Review findings for planning/tiptap-markdown-editor — spec review (rounds 1-7) and section cross-consistency review
type: project
---

## Section Cross-Consistency Review (2026-03-19)

**4 of 13 sections are EMPTY stubs (single preamble line only):**
- section-01-tiptap-setup.md, section-03-editor-surface.md, section-12-conflict-dialog.md, section-13-hardening-tests.md

**Key interface contracts confirmed across sections:**
- `UnifiedDocumentSurface` prop names: `initialContent`, `onContentChange`, `onSave`, `onVersionRestore`, `onEnterEditMode`, `isSaving`, `errorMessage`, `documentId`, `updatedAt`
- `MediaInsertAttrs` discriminated union uses `type` field (not `mediaType`)
- Node views directory: `components/editor/nodeviews/` (NOT `nodes/`)
- Media extensions directory: `components/editor/extensions/`
- MediaInsertMenu: `components/editor/toolbar/MediaInsertMenu.tsx`
- Upload: section-08 uses `trpc.library.uploadFile`; section-09 paste/drop uses fetch to `/api/media-jobs/upload` — two different paths

**Cross-section naming inconsistencies:**
- `editor.toolbar.horizontalRule` (section-04) vs `editor.toolbar.divider` (section-10)
- `editor.status.*` keys (section-04) vs `editor.save.*` keys (section-10)
- Section-07 defers `editor.media.*` i18n keys to section-10, but section-10 doesn't define them
- `transformPastedText: true` (plan §4) vs `transformPastedHTML` (section-02, section-09) — different config key

**File path conflicts:**
- section-09 creates `editor/__tests__/paste-handlers.test.ts`; section-06 creates `extensions/__tests__/`. Inconsistent test directory convention.
- section-09 proposes creating `uploadMedia.ts` while section-08 creates upload logic — ownership split.

See full review report in conversation (2026-03-19).

### Verdict after Round 7: APPROVE_WITH_FIXES (3 HIGH, 2 MEDIUM, 3 LOW new findings)

### Round 7 new findings

**HIGH: `TIPTAP_EDITOR_ENABLED` absent from `featureFlags.ts` (all 3 locations)**
- Confirmed: interface, `ALLOWED_FEATURE_FLAGS` Set, and `FEATURE_FLAG_DEFAULTS` map in `apps/web/shared/featureFlags.ts` do not contain this flag.
- This blocks the rollback plan (§13.7) and the per-tenant rollout mechanism (§13.6).
- Fix: Add `tiptapEditorEnabled: boolean; // F23` to all three locations, default `false`.

**HIGH: `SafeMarkdown.tsx:70` — `ADD_ATTR` still only `["target"]`**
- `ADD_ATTR: ["target"]` at line 70. The spec-required `"data-poster"`, `"data-caption"`, `"data-asset-id"` are absent.
- This means the Phase 3 DOMPurify fix is not yet applied.

**HIGH: `SafeMarkdown.tsx:205-208 + splitByMedia()` — `MediaPart` and regex still do not carry data-* attrs**
- `MediaPart` type only has `{ kind, src }`. MEDIA_TAG_REGEX only captures group 2 (src).
- Even after ADD_ATTR fix, the attrs will be silently discarded in the splitByMedia React render path.
- Fix: Widen MediaPart type; extend regex to capture data-poster/caption/assetId; pass as props to `<video>`.
- (Note: This was listed as a Phase 3 deliverable in the spec but has not been implemented in the live file.)

**MEDIUM: `onEnterEditMode` prop contract across `DocumentPreviewPanel → UnifiedDocumentSurface` undefined**
- Spec says `onEnterEditMode` will be rerouted to toggle `UnifiedDocumentSurface`'s internal edit mode, but
  the mechanism (forwarded callback prop vs. ref imperative handle) is not defined in §4.3 or §6.4.

**MEDIUM: `parseMarkdownToTiptap` / `countNodes` still only referenced in a code comment (§9.3)**
- Not listed as exports in §4.1 `TiptapMarkdownBridge.ts` description.
- Carried from Round 5 LOW; remains unresolved.

**LOW: `DocumentPreviewPanel.tsx` is 627 lines, not "628 lines" as spec §2 states.**
**LOW: `transformPastedHTML` config location ambiguous — spec shows it inside `Markdown.configure()` but it is a `useEditor()` `editorProps` option.**
**LOW: Flag name inconsistency — spec uses `TIPTAP_EDITOR_ENABLED` (screaming snake) in §13.6/§13.7 but featureFlags.ts keys are camelCase; should use `tiptapEditorEnabled` throughout.**

### Round 7 security notes
- `data-poster` carrying `javascript:` URL is not caught by `sanitizeUrls()` (which only handles markdown link syntax). Risk is implementation-time — implementer must URL-validate before using `data-poster` as a `poster` prop.
- Video src allowlist (§8.4) has no concrete implementation specification in `videoExtension.ts`.
- `transformPastedHTML` must explicitly DOMPurify the pasted HTML; spec does not require this.

### Verdict after Round 5 (FINAL): PASS — ready for implementation

### Round 5 findings (polish pass)

All 3 Round-4 open issues resolved in spec:
- HIGH (splitByMedia fix) — Phase 3 deliverable for SafeMarkdown.tsx now explicitly lists: widen `MediaPart`, fix regex, pass attrs to React elements. Spec is now correct; implementation task is well-defined.
- MEDIUM (TableRow/Cell/Header in §7.2) — FIXED. All 3 are imported and in extensions array (spec lines 476-478, 500-502).
- MEDIUM (isEditorTabDirty refactor) — §10.4 now explicitly lists all 3 call sites. Slight ambiguity remains ("อาจลบได้") but not blocking — implementer can choose at coding time.

Remaining low-severity gaps (not blocking):
- §9.3 `parseMarkdownToTiptap` and `countNodes` undefined — minor; clearly these are helpers in `TiptapMarkdownBridge.ts`.
- Dirty-state contract ("อาจ") is advisory-level ambiguity, acceptable.
- No feature flag strategy for A/B rollout; risk accepted per §13.6 which calls for feature flag during Phase 3.
- No rollback plan section (revert to MarkdownFileEditor fallback not documented as explicit step).
- `tiptap-markdown` bundle size not quantified beyond "~50KB estimate".

### Verdict after Round 4 (FINAL): CONDITIONAL_PASS (3 issues remain — 1 HIGH, 2 MEDIUM)

### Round 4 new findings

**HIGH: `splitByMedia()` fix is STILL incomplete — spec acknowledges problem but the fix description is wrong**
- Spec §5.5 note says: "Note: `splitByMedia()` ใน SafeMarkdown bypass DOMPurify สำหรับ media tags — ต้องตรวจสอบว่า `data-*` attrs ถูก preserve ใน regex extraction path ด้วย"
- This is the correct diagnosis, BUT the spec only instructs Phase 3 to add `ADD_ATTR` to DOMPurify config (line 69). It does NOT include a deliverable to extend `splitByMedia()` regex or `MediaPart` type to carry `data-poster`/`data-caption`/`data-asset-id`.
- Confirmed live: `MEDIA_TAG_REGEX` at SafeMarkdown.tsx:210 only captures tag + src. `MediaPart` union only has `{ kind, src }`. No data-* attrs captured.
- Phase 3 deliverable for `SafeMarkdown.tsx` must be expanded to include: (a) widen `MediaPart` to include optional `poster?`, `caption?`, `assetId?`; (b) extend regex or use a DOM parser to extract those attrs; (c) pass them to the React `<video>`/`<audio>` elements rendered in the media path.

**MEDIUM: `@tiptap/extension-table-row/cell/header` listed in §7.1 packages but NOT imported in §7.2 config block**
- §7.1 lists 4 table packages: `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`.
- §7.2 imports only `Table from "@tiptap/extension-table"` and calls `Table.configure({ resizable: true })`.
- In Tiptap, `Table` extension requires `TableRow`, `TableCell`, and `TableHeader` to be explicitly registered in the extensions array — `Table.configure()` alone does NOT include them.
- Missing: `import TableRow from "@tiptap/extension-table-row"` etc., and all three must appear in the `extensions` array. Without this, table functionality will not work at runtime.

**MEDIUM: `isEditorTabDirty` / `markdownDraftByDocId` refactor risk is underspecified**
- Confirmed live: `isEditorTabDirty(tabId)` reads `markdownDraftByDocId[tabId].value !== .savedValue`. This drives both `hasUnsavedTabs` (the `beforeunload` guard) and the dirty-dot indicator on editor tabs (lines 1662, 2116).
- Spec §10.4 says to "ปรับ `markdownDraftByDocId` dirty-state ให้ sync กับ Tiptap `onUpdate` callback" but does not specify the new contract: does `markdownDraftByDocId` remain the source of truth for dirty state, or does a new Tiptap-native flag replace it? If replaced, `isEditorTabDirty` must also change, and its callers at lines 1662 and 2116 (tab close confirm, tab dirty dot) must be updated. The spec does not list these lines/callers in Phase 3 deliverables.

**LOW (confirmed fixed): `DocumentVersionHistory` guard**
- Previous round finding: `DocumentPreviewPanel.tsx:259` suppresses `DocumentVersionHistory` for `previewType === "markdown"`. Spec §4.2 notes: "DocumentPreviewPanel ปัจจุบัน suppress version history เมื่อ `previewType === 'markdown'` (ให้ MarkdownFileEditor จัดการเอง) — pattern นี้คงเดิม: `DocumentVersionHistory` ย้ายเข้าไปใน `UnifiedDocumentSurface` แทน". This is now explicitly addressed — the guard stays, version history moves inside the new surface. RESOLVED.

**LOW (confirmed fixed): `ADD_ATTR` vs `ALLOW_DATA_ATTR` security scope**
- Spec §5.5 now correctly specifies `ADD_ATTR: ["data-poster", "data-caption", "data-asset-id"]` with a comment that `ALLOW_DATA_ATTR` stays false. RESOLVED.

**LOW (confirmed fixed): Source Mode → View save behavior**
- §6.4 now explicitly states: "ทุกครั้งที่ออกจาก mode ที่มีการแก้ไข (Edit หรือ Source) ต้อง auto-save ก่อน". RESOLVED.

### Verdict after Round 3: CONDITIONAL_PASS (2 blocking gaps remain)

### Key confirmed facts (all rounds)
- `MarkdownFileEditor.tsx` is 937 lines (PASS — matches spec claim).
- `DocumentPreviewPanel.tsx` is 628 lines (correct in spec).
- `DocumentManagement.tsx` is 2344+ lines (correct in spec).
- MarkdownFileEditor is lazy-imported only in `DocumentPreviewPanel.tsx:21`.
- DocumentManagement.tsx passes `markdownEditorOnly` AND `markdownFullHeight` props to DocumentPreviewPanel.
- Current `insertVideoFromLibrary` inserts raw `<video src="...">` HTML — the EXISTING stored format. SafeMarkdown already handles `<video>` and `<audio>` via its `splitByMedia()` regex.
- SafeMarkdown's DOMPurify allowlist includes `"video"` and `"audio"` in ALLOWED_TAGS.

### Round 1 issues — all FIXED in Round 2
- HIGH (FIXED): `<smart-video>` replaced with standard `<video>`/`<audio>`.
- HIGH (FIXED): DocumentManagement.tsx page-level split-panel addressed in §2.5 + §10.4.
- MEDIUM (FIXED): DocumentPreviewPanel line count corrected.
- MEDIUM (FIXED): `onEnterEditMode` asymmetry acknowledged and fixed.
- LOW (FIXED): DocumentManagement.tsx line count shows "2344+".
- LOW (FIXED): React 19 risk in §13.5.

### Round 2 issues — fixed or carried into Round 3
- HIGH (FIXED): `ALLOW_DATA_ATTR` — SafeMarkdown.tsx now listed in modified files, `ALLOW_DATA_ATTR: true` in Phase 3 deliverable. However: see Round 3 HIGH finding — the fix is incomplete.
- MEDIUM (FIXED): `isPreviewFullWidth` + `previewPanelWidth` now explicitly called out for removal in §10.4 and Phase 3.
- MEDIUM (FIXED): i18n keys added to Phase 3 deliverables.
- LOW (FIXED): `markdownDraftByDocId` and `beforeunload` guard now addressed in §10.4.
- LOW (FIXED): Extension naming inconsistency resolved (VideoExtension, AudioExtension throughout).

### Round 3 new findings — BLOCKING

**HIGH: `DocumentVersionHistory` guard not addressed**
- `DocumentPreviewPanel.tsx:259`: `{previewType !== "markdown" && documentId ? <DocumentVersionHistory ...> : null}`
- This guard means version history is NEVER shown for markdown files via the existing outer header.
- The spec places Version History inside `DocumentEditorHeader` (§4.2) but never removes the guard from `DocumentPreviewPanel`.
- Post-Phase 3, when `UnifiedDocumentSurface` (with `DocumentEditorHeader`) is mounted for markdown files, the outer panel header will still suppress version history due to this guard.
- Fix: Phase 3 deliverable must include removing the `previewType !== "markdown"` guard from `DocumentPreviewPanel`, or explicitly move the `DocumentVersionHistory` mount entirely inside `DocumentEditorHeader`.

**HIGH: `ALLOW_DATA_ATTR: true` does NOT fix data-* preservation in SafeMarkdown**
- `SafeMarkdown.tsx:210-236`: `splitByMedia()` intercepts `<video>` and `<audio>` tags BEFORE DOMPurify runs.
- The regex `/<(video|audio)\b[^>]*\bsrc="([^"]*)"[^>]*>/g` only captures the `src` attribute.
- `data-poster`, `data-caption`, `data-asset-id` are discarded at the regex split stage.
- Setting `ALLOW_DATA_ATTR: true` in DOMPurify config (line 69) is irrelevant for this path.
- Fix: `splitByMedia()` must be extended to extract and pass through the three data attributes to the rendered React element. The spec must add this to Phase 3 deliverables for SafeMarkdown.tsx.

### Round 3 new findings — NON-BLOCKING

**MEDIUM: Table serialization risk is Phase 1 scope, not Phase 4**
- Tables listed as supported in §5.1 (Phase 1).
- `tiptap-markdown` table serialization caveat acknowledged in §7.2 but deferred to Phase 4 testing.
- Risk: if table round-trip is broken, it's discovered late. Move table serialization test to Phase 1.

**MEDIUM: `parseMarkdownToTiptap` undefined in §9.3**
- `serializeAndValidate()` calls `parseMarkdownToTiptap(markdown)` but this function is never defined in the spec.
- `TiptapMarkdownBridge.ts` presumably exports it but no interface is shown.
- Implementors cannot satisfy this contract without guessing.

**MEDIUM: `ALLOW_DATA_ATTR: true` security scope too broad**
- Should use `ADD_ATTR: [..., "data-poster", "data-caption", "data-asset-id"]` instead of enabling all data-* globally.
- Low immediate risk (no Alpine/Stimulus on page) but better practice.

**LOW: `BubbleMenu.tsx` has no Phase assignment**
- Listed in §4.1 and §14 new files but not in any Phase 1/2/3 deliverable.
- Only mentioned in Phase 4 narrative. Should be made explicit.

**LOW: Source Mode → View transition save behavior undefined**
- §6.4 mode transitions don't address whether Source Mode exit triggers auto-save.
- Edit Mode has 2s debounce; Source Mode save behavior is unspecified.
