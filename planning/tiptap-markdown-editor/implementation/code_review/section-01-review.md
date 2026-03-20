# Section 01 Review — Tiptap Setup

**Reviewer**: CMD-8 (SmartSpecPro Reviewer Agent)
**Date**: 2026-03-19
**Diff**: `planning/tiptap-markdown-editor/implementation/code_review/section-01-diff.md`
**Plan**: `planning/tiptap-markdown-editor/sections/section-01-tiptap-setup.md`

---

## Review Report

### Verdict: REQUEST_CHANGES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `apps/web/package.json:249–261` | All `@tiptap/*` packages installed at `^3.20.4`, but the plan mandates `^2.x`. Tiptap v3 is a major version with breaking API changes. `tiptap-markdown` is installed at `^0.9.0` but the plan mandates `^0.8.x`. These versions have not been validated for React 19 compatibility under the plan's stated constraints. | Pin all `@tiptap/*` packages to `^2.x` (e.g., `^2.11.0` which is the latest stable v2) and `tiptap-markdown` to `^0.8.x`. If v3 is intentionally chosen, update the plan, confirm React 19 compatibility, and re-validate the `tiptap-markdown` v3 serialization API (the plan explicitly notes this as an unresolved risk at v0.8). |
| MEDIUM | `apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx:59–61` | Test 4 (`editor.getHTML() returns valid HTML after setContent`) calls `result.current?.commands.setContent(...)` and `result.current?.getHTML()` via optional chaining. If `result.current` is `null` (editor failed to initialize), both calls silently short-circuit and `html` is `undefined`. `expect(undefined).toContain(...)` will throw a matcher error rather than clearly surfacing the underlying initialization failure. | Assert `result.current` is non-null before calling methods, or use `act()` to flush effects and assert on the non-nullable result. Pattern: `const editor = result.current; expect(editor).not.toBeNull(); editor!.commands.setContent("<p>Hello</p>"); expect(editor!.getHTML()).toContain("<p>Hello</p>");` |
| MEDIUM | `apps/web/client/src/components/editor/editor.css:185–192` | The `.tiptap-editor .ProseMirror code` rule (inline code) applies to ALL `<code>` elements including those inside `<pre>`. Since `pre > code` is declared first and `code` is declared later with broader specificity match, inside a `<pre>` both rules apply. This will double-apply `background-color: var(--muted)` and the monospace font stack redundantly, but more importantly the `padding: 0.125rem 0.375rem` and `border-radius: 0.25rem` from the inline rule will override the block-level padding/radius from `pre > code` for code inside pre blocks, ruining the code block appearance. | Add `.tiptap-editor .ProseMirror pre code { background-color: transparent; padding: 0; border-radius: 0; font-size: inherit; }` after the `code` rule to explicitly reset inline-code styles when inside a `pre` block. |
| MEDIUM | `apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx:87` | The CSS smoke test uses `await expect(import("../editor.css")).resolves.not.toThrow()`. The `.resolves.not.toThrow()` matcher tests that the Promise resolves (not rejects) — it does NOT check that the import throws during execution. A missing `editor.css` file will cause the dynamic import to reject, which this test would catch. However, a CSS file with invalid syntax that causes a Vite transform error will also reject the Promise, so the test is functionally correct. The concern is that `.resolves.not.toThrow()` reads confusingly — a rejected Promise causes `.resolves` to fail the test, not `.not.toThrow()`. | Change to `await expect(import("../editor.css")).resolves.toBeDefined()` for clarity. Both are functionally equivalent but `.resolves.toBeDefined()` is the conventional Vitest pattern for "dynamic import succeeded". |
| LOW | `apps/web/client/src/components/editor/editor.css` (missing rule) | The plan specifies `.ProseMirror` should have a `max-width` or `width: 100%` declaration to ensure prose-like behavior. The diff has `min-height` and `padding` on `.tiptap-editor .ProseMirror` but no explicit width constraint. ProseMirror will naturally fill its container but the plan calls this out explicitly as part of the "General" styles. | Add `width: 100%` to the `.tiptap-editor .ProseMirror` rule, or note in the plan that full-width behavior is inherited from the container. |
| LOW | `apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx:86–88` | Test 7 (CSS smoke test) is the only `async` test and uses a dynamic `import()`. If the vitest environment does not support CSS module resolution for static `.css` files in the `jsdom` environment, this test may fail with "Failed to resolve import" even if the CSS file exists and is valid. The plan's "Known Considerations" section warns about modules that may need adding to `server.deps.inline`. | Verify `vitest.config.ts` handles `.css` imports in `jsdom` (Vite processes CSS via the transform pipeline, so this should work, but confirm). If it fails, fall back to a static `import "../editor.css"` at the top of the test file (non-dynamic) and assert the test module loads without error. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| All 13 packages from plan installed | PARTIAL | 12 of 13 packages present. `tiptap-markdown` IS installed (as `^0.9.0` not `^0.8.x`). All packages accounted for. Version constraint violations flagged as HIGH above. |
| `@tiptap/*` at `^2.x` | FAIL | Installed at `^3.20.4`. Plan explicitly requires `^2.x`. |
| `tiptap-markdown` at `^0.8.x` | FAIL | Installed at `^0.9.0`. Plan explicitly requires `^0.8.x`. |
| CSS scoped under `.tiptap-editor .ProseMirror` | PASS | Every rule in `editor.css` is correctly scoped. No bare ProseMirror selectors that could leak. |
| CSS: Typography (h1–h4, p) | PASS | All 5 elements present with correct font-size, weight, and margin. |
| CSS: Lists (ul, ol, li) | PASS | All 3 selectors present with correct markers and padding. |
| CSS: Blockquote | PASS | `border-left: 3px solid var(--border)`, `padding-left`, `color: var(--muted-foreground)`, `font-style: italic`. All correct. |
| CSS: `pre > code` (code block) | PASS | Background, padding, radius, monospace font, `overflow-x: auto` all present. |
| CSS: inline `code` | PASS (with caveat) | Present, but double-styling issue with `pre > code` — flagged MEDIUM above. |
| CSS: `hr` | PASS | `border-top: 1px solid var(--border)`, vertical margin present. |
| CSS: Tables (table, th, td) | PASS | `border-collapse: collapse`, `width: 100%`, `border`, `padding`, `font-weight: 600`, `background-color: var(--muted)` on `th`. All correct. |
| CSS: Links (a, a:hover) | PASS | `color: var(--primary)`, `text-decoration: underline` on hover. Correct. |
| CSS: Placeholder selector | PASS | `.ProseMirror p.is-editor-empty:first-child::before` with `content: attr(data-placeholder)`, `color: var(--muted-foreground)`, `float: left`, `height: 0`, `pointer-events: none`. All required properties present. |
| CSS: `.ProseMirror:focus` | PASS | `outline: none` present. Also `outline: none` in the base rule is redundant but harmless. |
| CSS: theme CSS variables only (no hardcoded colors) | PASS | All colors use `var(--border)`, `var(--muted)`, `var(--muted-foreground)`, `var(--primary)`. No hardcoded hex or rgb values. |
| No `@apply` directives used | PASS | CSS uses raw property values, not Tailwind `@apply`. Consistent with ProseMirror CSS conventions (Tailwind `@apply` in external CSS can have specificity issues). |
| All 7 plan tests implemented | PASS | All 7 test descriptions from the plan are present and `immediatelyRender: false` is in every `useEditor()` call. |
| `immediatelyRender: false` in every `useEditor()` call | PASS | All 6 `useEditor()` calls in the test file include `immediatelyRender: false`. |
| `renderHook` used for hook tests | PASS | All hook tests use `renderHook` from `@testing-library/react`. |
| StrictMode wrapper test implemented | PASS | Test 3 wraps with `React.StrictMode` via the `wrapper` option. |
| No changes to existing files beyond `package.json` and lock file | PASS | Diff only adds `editor.css`, `tiptap-setup.test.tsx`, and modifies `package.json` / `package-lock.json`. No existing files modified. |
| CSS not imported in `index.css` | PASS | No change to `index.css` in the diff. CSS import deferred to section 03 as specified. |

---

### Summary

The implementation is structurally sound: all 7 tests are present, `immediatelyRender: false` is applied consistently, and the CSS file covers every required section with correct scope and CSS variable usage. However, there is one blocking issue that must be resolved before proceeding to section 02: the Tiptap packages are installed at `^3.20.4` (major version 3) rather than the plan-specified `^2.x`, and `tiptap-markdown` at `^0.9.0` rather than `^0.8.x`. These version choices have not been validated for this project and the `tiptap-markdown` v3 serialization API for custom nodes was explicitly called out in the cross-section audit as unresolved. Two additional MEDIUM issues should be fixed before section 02 proceeds: the `pre code` double-styling bug in `editor.css` (which will visibly break code block rendering) and the fragile null-safety pattern in test 4.
