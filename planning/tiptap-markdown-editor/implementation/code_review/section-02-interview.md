# Section 02 Code Review Interview

## Auto-fixes Applied
1. **HIGH — StarterKit `link: false, underline: false`**: Initially removed per review, but tests revealed Tiptap v3 StarterKit DOES bundle Link and Underline (duplicate extension warnings). Restored with updated comment clarifying this is v3-specific.
2. **HIGH — `immediatelyRender: false`**: Not applicable to core `Editor` class — this is a `useEditor()` React hook option only. Omitted for headless editors. The TS type system confirms it: `EditorOptions` doesn't include it.
3. **MEDIUM — Duplicate `JSONContent` import/export**: Consolidated to `import type { JSONContent }` + `export type { JSONContent }` (two lines, both needed since re-export alone doesn't create local binding).
4. **MEDIUM — `setContent` 3-arg call**: Updated to Tiptap v3 API — `setContent(doc, { parseOptions: { preserveWhitespace: "full" } })`.
5. **MEDIUM — `editor.storage.markdown` type**: Cast to `Record<string, any>` since `tiptap-markdown` extends storage dynamically.
6. **Bug fix — serialize image test**: Image node was nested inside `paragraph`, which violates ProseMirror schema. Moved to top-level `doc.content`.

## Let Go
- MEDIUM — `getDefaultExtensions` extension name assertions (nice-to-have, not blocking)
- LOW — table assertion `>=` vs exact (functionally correct)
- LOW — double parse call in graceful test (minor perf, not a bug)
- LOW — `it.skip` vs `it.todo` (preference, both communicate intent)
