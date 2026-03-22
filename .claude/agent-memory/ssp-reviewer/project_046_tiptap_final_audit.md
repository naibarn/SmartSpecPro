---
name: Feature 046 Tiptap Editor — Final Audit (Ultimate Pass)
description: New findings from the ultimate final audit pass of the 13-section Tiptap plan
type: project
---

## Verdict: APPROVE_WITH_FIXES

7 new findings. No prior findings re-reported. All HIGH are genuine blockers.

**Why:** Plan is in excellent shape. New findings are mostly subtle implementation traps or one real bug in the S11 mediaParts render path, plus a security gap in the S12 conflict detection logic.

---

### New Findings

**HIGH — S11: `mediaParts` render path is bypassed — data-* fixes never execute**
- `SafeMarkdown.tsx` line 241-244: `splitByMedia()` returns `MediaPart[]` only when `<video>` or `<audio>` tags are detected in the raw `children` string. BUT line 246-250: `sanitizedContent` is computed from `sanitizeContent(sanitizeUrls(children))` — separately. The plan's S11 fix (Change 1: DOMPurify ADD_ATTR whitelist) only helps if the `<video>` passes through DOMPurify. But since line 269 routes into the `mediaParts` branch BEFORE the sanitized content path, the DOMPurify ADD_ATTR fix is irrelevant to media rendering — media tags are split out BEFORE DOMPurify ever runs. The correct fix target is the `splitByMedia` regex + `MediaPart` type (Changes 2 & 3), plus the render block at lines 273-306. S11's plan is correct about what to change, but the rationale in Change 1 is wrong — the ADD_ATTR doesn't need to be changed for the mediaParts render path because DOMPurify never sees media tags. This is a spec explanation bug, not a fatal error, but a developer following Change 1 as the primary fix will be confused when it has no visible effect.
- Fix: Clarify in S11 that Change 1 (ADD_ATTR) is needed ONLY for the non-media code path (lines 300-303 where text parts pass through `sanitizeContent`). The actual media rendering fix is entirely in Changes 2, 3, and 4.

**HIGH — S12: Conflict detection via string-matching "version conflict" is fragile**
- S12 Step 3: "check if the error message contains 'version conflict' (case-insensitive). This matches the existing pattern from `DocumentManagement.tsx` line 725." This approach relies on matching an error string that could change with any tRPC refactor. The correct pattern is to check the tRPC error's `data.code` or catch a typed error class. If the tRPC error shape changes (e.g., the error message is translated server-side, or the procedure is refactored to use a different error format), the conflict dialog will silently stop showing. Fix: Import and `instanceof`-check the `LibraryMarkdownVersionConflictError` class directly, or rely on a specific tRPC error code rather than substring matching.

**MEDIUM — S09: `handlePaste` has a structural async race condition**
- S09 correctly notes: "The upload is async but `handlePaste` must return synchronously. The pattern is to call `event.preventDefault()`, start the async upload, and return `true`." But the code stub shows `editor.chain().setImage()` called inside the async callback — yet `editor` is captured via a ref (`editorRef.current`). If the user closes the document or unmounts the component before the upload resolves, `editorRef.current` will be null (if the ref is cleared on unmount), and the `.chain().setImage()` call will throw. The plan does not mention an unmount guard. Fix: Add `if (!editorRef.current || editorRef.current.isDestroyed) return;` before calling chain commands in the async upload callback.

**MEDIUM — S05: Slash command table row has malformed columns for `audio` item**
- S05 table line 115: `| \`audio\` | Audio | Audio | เสียง | media | ... |` — the table has 6 columns but the audio row has 7 pipe-delimited values (extra "Audio" literal before "เสียง"). This is a copy-paste error. Minor but would confuse an implementor parsing the table. Fix: Remove the duplicate "Audio" column: `| \`audio\` | Audio | เสียง | media | ... |`.

**MEDIUM — S03 + S10: `initialContent` prop change on version restore is unhandled**
- S03 says: "When `initialContent` changes (version restore), re-parse." But `UnifiedDocumentSurface` must decide whether to re-parse `initialContent` on every prop change or only on explicit signals. If the parent passes the content string as a prop and it changes due to a server refetch (e.g., after the user edits, auto-save fires, server returns updated content, and the parent re-passes the new server content), the editor content will be reset mid-editing. The plan does not specify how to distinguish a "version restore" re-parse from a benign re-render where `initialContent` hasn't meaningfully changed. Fix: S03 should document that `initialContent` must only be applied on mount OR when an explicit `resetKey` prop (or similar) changes. A simple `useEffect` with `[initialContent]` as the dependency is dangerous. Use a ref to track whether the content was explicitly restored via `onVersionRestore`, and only then re-parse.

**LOW — S08: `uploadMedia.ts` will NOT be created by S08 — S09 depends on a file that may not exist**
- S08 says the upload logic uses `trpc.library.uploadFile` (tRPC mutation inside the React component). S09 says it uses `uploadMedia.ts` which posts to `/api/media-jobs/upload` (FormData fetch). These are two different upload endpoints with different semantics. S09 says "this module may already exist from Section 08; extend if needed" — but S08 never creates `uploadMedia.ts` as a standalone module; it embeds upload logic inside the `MediaInsertMenu` React component. The file S09 depends on does not exist after S08 completes. Fix: Either S08 must extract its upload logic into a shared `uploadMedia.ts` as a concrete deliverable, or S09 must create it from scratch. The section dependency says S09 depends on S08, but the handoff is not explicit. Add `uploadMedia.ts` to S08's Files to Create table.

**LOW — F23 flag numbering is correct but flag purpose is misrepresented**
- S10 checklist item 13 adds `tiptapEditorEnabled: false` with the note: "This flag is for git-revert reference only, not for per-tenant rollout (user chose switch-all)." However, featureFlags.ts currently has F22 as `orchestratorEnabled` (confirmed). F23 is correct. The concern is: adding a permanent feature flag that is hardcoded to `false` but never checked in application code is technical debt from day one. If the flag is `false` and never read, it has no function and could mislead future developers. Fix: Either (a) do not add this flag to featureFlags.ts — instead, document the rollback procedure in a comment in `DocumentPreviewPanel.tsx` near the lazy import, or (b) actually use the flag to conditionally render `UnifiedDocumentSurface` vs `MarkdownFileEditor` in `DocumentPreviewPanel.tsx`. Option (b) is safer and makes the flag meaningful.

**How to apply:** Fix HIGH items before beginning S11 and S12 implementation respectively. MEDIUM items are pre-merge fixes. LOW items can be addressed during S10/S13 polish.
