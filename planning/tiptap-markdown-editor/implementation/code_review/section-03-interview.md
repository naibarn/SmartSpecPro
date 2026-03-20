# Section 03 Code Review Interview

## Auto-fixes Applied
1. **HIGH — Stale `mode` closure in `handleTiptapUpdate`**: Changed to `modeRef.current` pattern. `useEditor`'s `onUpdate` captures the callback at call time and doesn't update when the callback identity changes — using a ref avoids the stale closure.
2. **MEDIUM — Reset-key missing `setContent`**: Added `editorRef.current?.commands.setContent(parsed)` to the `updatedAt` change effect. Tiptap's `useEditor` ignores `content` prop updates after mount, so the live editor needs an explicit command.
3. **MEDIUM — Unused `onMediaInsert` prop**: Added `// TODO: Wire in S05 (SlashCommands)` comment to make the intent clear.
4. **LOW — Trailing space in className**: Fixed to conditional concatenation.

## Let Go
- HIGH — onSave fire-and-forget design gap: Added comment noting S10 must handle error path. Not a code bug — design for later section.
- MEDIUM — Missing "Saved" and "Source->View" tests: Existing tests cover the core paths. Will add in hardening (S13).
- MEDIUM — keydown effect churn: Acceptable for current usage pattern.
- LOW — SourceModePanel uses `fileExtension="md"` not `language="md"`: CodeMirrorEditor uses `fileExtension` prop, not `language`. Current code is correct.
- LOW — Placeholder not forwarded through UnifiedDocumentSurface: Default empty string is fine; S10 can pass it through.
