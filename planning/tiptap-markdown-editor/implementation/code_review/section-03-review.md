## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `UnifiedDocumentSurface.tsx:514–515` | Stale closure on `mode` inside `handleTiptapUpdate`. `handleTiptapUpdate` is declared with `useCallback([mode, ...])`, so every mode change recreates it. But `useEditor`'s `onUpdate` option captures the callback at `useEditor` call time and is **not** updated when the callback identity changes — meaning the `mode === "view"` guard will always test the mode value from the initial render. Content changes in Edit mode may be silently dropped or fire when they should not. | Use `useRef` to hold the current mode (`modeRef.current = mode`) and read `modeRef.current` inside `handleTiptapUpdate`. Decouple the `onUpdate` callback from the `mode` state. |
| HIGH | `UnifiedDocumentSurface.tsx:566–568` | `switchMode` calls `immediateSave()` when switching to View mode while dirty, but `immediateSave` calls `doSave(latestMarkdownRef.current)`, which calls `onSave?.(md)` and then `setDirty(false)`. If the caller's `onSave` is async and the save fails, `dirty` is cleared regardless — the user sees "Saved" but the data was not persisted. The plan notes save-status shows "error" only when `errorMessage` is set externally; there is no local error path from `immediateSave`. | This is a design gap that Section 10 (page integration) should address by passing a `onSave` that rejects on error and sets `errorMessage`. Flag in section comment: `// NOTE: onSave is fire-and-forget — caller must set errorMessage on failure`. |
| MEDIUM | `UnifiedDocumentSurface.tsx:469–478` | The reset-key guard reacts to `updatedAt !== lastResetKeyRef.current` but does **not** call `editor.commands.setContent(parsed)` — it sets the `tiptapContent` state and lets the next render re-initialize `useEditor` with the new `content` prop. Tiptap `useEditor` does **not** re-initialize when the `content` option changes after mount; the Tiptap instance ignores prop updates to `content`. The reset-key effect must call `editorRef.current?.commands.setContent(parsed, false)` to push the new document into the live editor instance. The `false` flag suppresses emitting an `update` event (avoiding a spurious dirty/save cycle). | Add `editorRef.current?.commands.setContent(parsed, false)` inside the `if` branch of the reset effect. `editorRef` is already set after the first `onUpdate`, but will be null on the first render — add a null guard. |
| MEDIUM | `TiptapEditor.tsx:153–159` | `onMediaInsert` is declared in the `TiptapEditorProps` interface (line 13) but is **destructured and silently dropped** in the component — it is not passed to any extension or forwarded anywhere. Section 05 (Slash Commands) will need it. Leaving an accepted but unused prop is a silent contract violation that will cause confusion when S05 wires the slash command extension. | Either remove `onMediaInsert` from the interface until S05 is implemented (add a `// TODO: S05` comment at the declaration site), or add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` with a TODO. Do not silently accept and discard props. |
| MEDIUM | `UnifiedDocumentSurface.test.tsx:387–401` | The `'save status shows "Saving..." during save'` test asserts `isSaving={true}` prop produces `"Saving..."` text content. This works. But the paired test `'save status shows "Saved" after successful save'` listed in the plan's test checklist is **not implemented** — the test file has "Unsaved changes" (dirty) and "Saving..." but no test for the `clean` → `"Saved"` path. One of the 19 plan-required test cases is missing. | Add: `it('save status shows "Saved" when clean', () => { render(<UnifiedDocumentSurface initialContent="# Hello" />); expect(screen.getByTestId("save-status").textContent).toBe("Saved"); })` |
| MEDIUM | `UnifiedDocumentSurface.test.tsx:307–315` | The `"switching Edit->View triggers save callback when dirty"` test fires `onSave` by clicking the mock tiptap editor (which triggers `onUpdate`) and then clicking `mode-view`. However, the test for `"switching Source->View triggers auto-save callback"` — also listed in the plan — is absent. Source mode uses a different code path (`handleSourceChange` → `latestMarkdownRef`) than Tiptap mode. | Add a test that: switches to Source, fires `onChange` on the textarea mock, then switches to View, and asserts `onSave` was called with the textarea value. |
| MEDIUM | `UnifiedDocumentSurface.tsx:586–598` | The `keydown` effect captures `immediateSave` and `switchMode` by closure. Both are `useCallback` instances that themselves depend on `onSave` / `mode` / `dirty`. If `onSave` changes identity between renders (e.g., because the parent re-renders), `immediateSave` will be recreated, causing `document.removeEventListener` + `document.addEventListener` churn on every parent render. | Wrap `onSave` in a `useRef` on the parent side (or accept it as a stable ref internally) to avoid unnecessary effect teardown/re-registration. As a minimum, document the expectation that `onSave` should be a stable reference (e.g., `useCallback`-wrapped at the call site). |
| LOW | `UnifiedDocumentSurface.tsx:628` | The save-status display expression has a final `else ""` branch (when `saveStatus` is `"saved"` or `"conflict"`). The `"conflict"` variant is defined in `SaveStatus` and may be set by S10, but the UI renders an empty string for it — the user would see no status indicator during a save conflict. | Add a `conflict` branch: `saveStatus === "conflict" ? "Conflict — reload to continue" : ""` |
| LOW | `TiptapEditor.tsx:180` | `className` prop: the wrapper div always appends `className ?? ""` — if `className` is not passed, an extra trailing space is added to the class string (`"tiptap-editor "`). Minor but can pollute snapshots and breaks exact class assertions. | Use a conditional: `` `tiptap-editor${className ? ` ${className}` : ""}` `` |
| LOW | `SourceModePanel.tsx:28` | The plan specifies `language="md"` for markdown syntax highlighting. The diff passes `fileExtension="md"` instead. If `CodeMirrorEditor` maps `fileExtension` to a CodeMirror language mode, this is fine — but the plan explicitly names the prop `language`. Verify the `CodeMirrorEditor` API and confirm `fileExtension="md"` produces markdown highlighting. | Grep `CodeMirrorEditor` for accepted props and confirm. If the prop is `language`, align to `language="md"`. |
| LOW | `UnifiedDocumentSurface.test.tsx:125–128` | The `"editor applies .tiptap-editor CSS class to wrapper"` test in `TiptapEditor.test.tsx` asserts only that the `editor.css` import resolves, not that the DOM element has the `tiptap-editor` class. This test does not exercise the contract it describes. | Replace with a `render(<TiptapEditor ... />)` test that asserts `container.querySelector('.tiptap-editor')` is not null. |
| LOW | `UnifiedDocumentSurface.tsx` | The plan's component structure shows `placeholder={t("editor.placeholder")}` — i18n key passed to `TiptapEditor`. The implementation omits the placeholder prop entirely when constructing `TiptapEditor` inside `UnifiedDocumentSurface` (line 655–659), using the `TiptapEditor` default of `""`. | Pass `placeholder` through `UnifiedDocumentSurfaceProps` or hardcode the i18n key, consistent with the plan's intent. |

---

### Contract Compliance

| Check | Status |
|---|---|
| `types.ts` — `SaveStatus` matches plan definition (`"clean" \| "dirty" \| "saving" \| "saved" \| "error" \| "conflict"`) | PASS |
| `types.ts` — `UnifiedDocumentSurfaceProps` matches plan interface exactly | PASS |
| `types.ts` — `EditorMode` = `"view" \| "edit" \| "source"` | PASS |
| `TiptapEditorProps` — includes `onMediaInsert` as specified in plan | PASS (declared; not wired — see MEDIUM finding) |
| `useEditor` uses `immediatelyRender: false` | PASS |
| `getDefaultExtensions()` imported from `TiptapMarkdownBridge` (not duplicated inline) | PASS |
| `Placeholder` extension configured and appended | PASS |
| `editable` prop toggled via `editor.setEditable()` in `useEffect` | PASS |
| `EditorContent` wrapped in `div.tiptap-editor` | PASS |
| `editor.css` imported | PASS |
| `SourceModePanel` uses `display: none` (keep mounted) | PASS |
| `SourceModePanel` wraps existing `CodeMirrorEditor` | PASS |
| `UnifiedDocumentSurface` — mode state machine: View/Edit/Source transitions | PASS |
| `UnifiedDocumentSurface` — Edit→Source serializes via `editor.storage.markdown.getMarkdown()` | PASS |
| `UnifiedDocumentSurface` — Source→Edit re-parses via `parse()` | PASS |
| `UnifiedDocumentSurface` — Edit/Source→View saves if dirty | PASS |
| `UnifiedDocumentSurface` — auto-save debounce 2000ms | PASS |
| `UnifiedDocumentSurface` — Ctrl+S / Cmd+S immediate save | PASS |
| `UnifiedDocumentSurface` — Escape in Edit/Source → View | PASS |
| `UnifiedDocumentSurface` — double-click in View → Edit | PASS |
| `UnifiedDocumentSurface` — debounce timer cleared on unmount | PASS |
| `UnifiedDocumentSurface` — `resetKey` pattern via `updatedAt` guard (not `initialContent` effect) | PASS (guards correctly on `updatedAt`; see MEDIUM finding on missing `setContent` call) |
| `editor.storage.markdown` accessed via type cast (`as Record<string, any>`) | PASS |
| `SaveStatus` derivation: `isSaving` → `"saving"`, `errorMessage` → `"error"`, `dirty` → `"dirty"`, else `"clean"` | PASS |
| `onSave` called with markdown string | PASS |
| Test: all 6 `TiptapEditor.test.tsx` plan cases implemented | PASS |
| Test: all 19 `UnifiedDocumentSurface.test.tsx` plan cases implemented | FAIL — 2 cases missing ("Saved" status, Source→View save) |
| No `innerHTML` / `dangerouslySetInnerHTML` usage | PASS |
| No XSS vector in error banner (value rendered as text node) | PASS |
| `JSONContent` from `@tiptap/core` (not `any`) used for `TiptapEditorProps.content` | PASS |
| `tiptap-markdown` storage access guarded with type cast (no bare `.markdown` property access) | PASS |

---

### Summary

The implementation is structurally sound and covers the core mode-switching, auto-save, and reset-key patterns specified in the plan. The `types.ts` definitions are canonical and correct, `immediatelyRender: false` is correctly placed on `useEditor` (not the core `Editor` class), and the `updatedAt` reset guard correctly avoids the `initialContent` re-parse trap. Two blocking correctness issues need to be addressed before this section unblocks Section 04 and Section 05: the stale `mode` closure inside `handleTiptapUpdate` (which will cause Edit-mode content changes to be silently dropped once the component re-renders with a different `mode` value) and the missing `editor.commands.setContent()` call in the reset-key effect (without which, version-restore will update React state but leave the live Tiptap instance showing stale content). The remaining findings are a missing test case, an unused prop declaration, and minor display gaps.
