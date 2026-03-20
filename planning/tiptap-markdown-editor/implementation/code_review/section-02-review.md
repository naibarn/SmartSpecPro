# Section 02 — Markdown Bridge: Code Review

**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-19
**Files reviewed:**
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.ts` (new, 86 lines)
- `apps/web/client/src/components/editor/TiptapMarkdownBridge.test.ts` (new, 241 lines)

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `TiptapMarkdownBridge.ts:295–300` | `createHeadlessEditor()` is missing `immediatelyRender: false`. The plan explicitly mandates this option for React 19 compatibility (section-02 spec line 169, section-01 review confirmed it as mandatory for every `Editor` instantiation). Without it, headless editor creation in a jsdom environment or under React 19's StrictMode can trigger synchronous DOM rendering or double-initialization side effects. | Add `immediatelyRender: false` to the `Editor` constructor options object. |
| HIGH | `TiptapMarkdownBridge.ts:275–293` | `StarterKit.configure({ link: false, underline: false })` references options that do not exist in StarterKit's configuration type. StarterKit does not bundle `Link` or `Underline` — those are separate packages. Passing unknown keys to `.configure()` is silently ignored by Tiptap but the comment is actively misleading ("Disable extensions we configure separately"). This will confuse future maintainers into thinking StarterKit was previously including them. | Remove the `link: false` and `underline: false` keys entirely. They have no effect. The comment should be deleted or replaced with an accurate note stating that `Link` and `Underline` are third-party extensions configured below. |
| MEDIUM | `TiptapMarkdownBridge.ts:265–266` | `JSONContent` is both re-exported (`export type { JSONContent }`) and imported for internal use in the same file with a second `import type { JSONContent }` statement. This dual declaration is redundant and may produce a lint warning depending on TypeScript/ESLint configuration. | Remove the `import type { JSONContent }` line (line 266). The `export type { JSONContent }` re-export (line 265) already makes `JSONContent` available in scope via `@tiptap/core`. Alternatively, keep the import and drop the separate `export type` in favour of `export type { JSONContent } from "@tiptap/core"` as a single combined statement (which is what the plan specifies at spec line 204). |
| MEDIUM | `TiptapMarkdownBridge.ts:332–334` | `serialize()` calls `editor.commands.setContent(doc, false, { preserveWhitespace: "full" })`. The third argument to `setContent` is `ParseOptions` from ProseMirror, and `preserveWhitespace` is a valid ProseMirror option — however, passing `"full"` (string) rather than `true` (boolean) may not be correct for all ProseMirror versions. More critically, the second argument `false` disables the `emitUpdate` event, which is correct, but combined with `preserveWhitespace: "full"`, this can cause the parser to retain extraneous whitespace nodes that then get re-serialized as extra blank lines. This is a round-trip fidelity risk that should be tested explicitly. | Test `serialize(parse("# H"))` and verify no trailing blank lines are introduced. If extra whitespace appears, remove the `{ preserveWhitespace: "full" }` option — the default ProseMirror whitespace handling is appropriate for rich-text documents. Add a round-trip test asserting `serialize(parse("# H")).trim() === "# H"` to lock in this behavior. |
| MEDIUM | `TiptapMarkdownBridge.test.ts:241–247` | The `getDefaultExtensions` test only asserts that the returned array is non-empty. The plan specifies that `getDefaultExtensions()` is the single source of truth for the extension stack; a minimal structural test should verify that at least the named extensions (StarterKit, Table, Markdown) are present by checking the `name` property of each returned extension object. If an extension is accidentally dropped, this test will still pass. | Extend the test to assert that the extensions array contains entries with names matching `"StarterKit"` (or `"paragraph"` from StarterKit), `"table"`, and `"tiptap-markdown"` (or whatever name the `Markdown` extension registers). This is the minimum viable contract test for the single source of truth claim. |
| LOW | `TiptapMarkdownBridge.test.ts:70–76` | The table parse test asserts `rows.length >= 2` but the input `"| h1 | h2 |\n|---|---|\n| a | b |"` produces exactly 2 rows (header + data). The `>=` guard is appropriate for resilience but slightly obscures the intended contract. | Change to `toBe(2)` to document the exact expected structure, or add a comment explaining why `>=` is used. |
| LOW | `TiptapMarkdownBridge.test.ts:127–131` | The "parses unknown HTML gracefully" test calls `parse("<div>unknown html</div>")` twice — once inside `expect(...).not.toThrow()` and once to inspect the result. The double call creates two headless editors, which doubles the setup/teardown cost and means the test is validating two separate editor invocations rather than the same one. | Assign the result to a variable outside the `expect(() => ...).not.toThrow()` pattern, or use a try/catch approach, so only one editor is created. |
| LOW | `TiptapMarkdownBridge.test.ts:93–95` | Video/audio skip tests use `it.skip(...)` with the comment `// Video/audio tests depend on section 06 custom extensions`. The plan specifies the comment should reference section 06 explicitly, which is done — but `it.skip` will show as a "skipped" test in CI output with no explanation. Consider using `it.todo(...)` instead, which Vitest renders differently (as a pending intent rather than a skipped test), making it clearer that these are planned work rather than deliberately excluded tests. | Change `it.skip(...)` to `it.todo(...)` for all 3 video/audio tests (lines 93, 102, 113 for parse; line 170 for serialize). This is a conventions preference, not a blocking issue. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `parse(markdown, extensions?)` exported | PASS | Correct signature, optional extensions parameter present. |
| `serialize(doc, extensions?)` exported | PASS | Correct signature. |
| `getDefaultExtensions()` exported | PASS | Exported and used as single source of truth. |
| `JSONContent` re-exported | PASS (with caveat) | Re-exported but implementation has a duplicate import — see MEDIUM finding. |
| Headless editor pattern (create → use → destroy) | PASS | `try/finally` in both `parse()` and `serialize()` guarantees `editor.destroy()` is always called. |
| `editor.destroy()` always called (no memory leak) | PASS | `try/finally` blocks on lines 312–318 and 329–338 are correct. Destroy is called even if `setContent` or `getMarkdown` throws. |
| `immediatelyRender: false` in headless editor | FAIL | Missing from `createHeadlessEditor()` — see HIGH finding. |
| Extension stack matches plan specification | PARTIAL | StarterKit (heading levels 1–4 correct), Image, Link (openOnClick: false), Table (resizable: true), TableRow, TableCell, TableHeader, Underline, Markdown (html: true, transformPastedText: true) — all present. Spurious `link: false` / `underline: false` keys in StarterKit config are harmless but incorrect — see HIGH finding. |
| `html: true` on Markdown extension | PASS | Line 289. |
| `transformPastedText: true` on Markdown extension | PASS | Line 290. |
| Empty string input handled (`null` guard) | PASS | `const md = markdown ?? ""` on line 309. |
| `null`/`undefined` guarded | PASS | `??` coalescing handles null/undefined. |
| Video/audio tests skipped with section-06 reference | PASS | 4 tests skipped (3 parse, 1 serialize). All have comment referencing section 06. |
| Round-trip tests present | PASS | 5 round-trip tests covering heading, inline formatting, bullet list, blockquote, and image. |
| Test environment set to jsdom | PASS | `// @vitest-environment jsdom` pragma on line 7 — matches plan's acknowledgment that tiptap-markdown may require jsdom. |
| All parse test cases from plan implemented | PASS | All 11 plan-specified parse tests are present (8 active + 3 skipped). |
| All serialize test cases from plan implemented | PASS | All 3 plan-specified serialize tests are present (2 active + 1 skipped). |

---

### Summary

The implementation is structurally sound. The headless editor pattern is implemented correctly with `try/finally` ensuring no memory leaks, all three public functions are exported with the correct signatures, and the extension stack matches the plan specification. Two issues require fixes before merge: the missing `immediatelyRender: false` option in `createHeadlessEditor()` (mandated by every prior section's conventions), and the incorrect/misleading `link: false` / `underline: false` keys in `StarterKit.configure()` (these keys do not exist in StarterKit and the comment is false). The duplicate `JSONContent` import/export should also be consolidated. No blocking issues with test coverage or the skip annotation strategy.
