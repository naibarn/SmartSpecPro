I now have all the context needed. Here is the section content.

# Section 01: Tiptap Setup

## Overview

This section covers the foundational setup for the Tiptap-based markdown editor: installing npm packages, creating base ProseMirror styles (`editor.css`), and verifying React 19 compatibility with `immediatelyRender: false`. No editor components are built here -- this section only establishes the dependency foundation and visual baseline that all subsequent sections depend on.

**Blocks**: sections 02, 03, 04, 05, 06 (all subsequent editor work depends on these packages being installed and styles being present).

**Dependencies**: None -- this is the first section and can be executed standalone.

---

## Tests (Write First)

All test files live under `apps/web/client/src/components/editor/` alongside the source they test. The vitest config at `/home/dev/projects/SmartSpecPro/apps/web/vitest.config.ts` already includes `client/src/**/*.test.tsx` in its glob and maps `.test.tsx` files to `jsdom` environment.

### File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx`

This test validates that the Tiptap packages are correctly installed, that the editor can be instantiated with React 19 without crashing, and that `immediatelyRender: false` prevents StrictMode double-initialization issues.

```
Test: useEditor() with immediatelyRender: false returns an Editor instance (not null)
Test: useEditor() with StarterKit creates an editor that accepts setContent() without error
Test: useEditor() with immediatelyRender: false does not throw in React.StrictMode
Test: editor.getHTML() returns valid HTML after setContent("<p>Hello</p>")
Test: editor.isEditable is false by default when editable: false is passed
Test: editor.isEditable is true when editable: true is passed
Test: editor CSS file can be imported without errors (smoke test)
```

The test file should:

1. Import `useEditor` from `@tiptap/react` and `StarterKit` from `@tiptap/starter-kit`.
2. Use `renderHook` from `@testing-library/react` to test the hook.
3. Wrap in `React.StrictMode` for the StrictMode test.
4. Pass `immediatelyRender: false` in every `useEditor` call -- this is mandatory for React 19.
5. Each test should be a short hook render that asserts on the returned editor instance.

The CSS smoke test should simply `import "../editor.css"` and assert no error is thrown. This verifies the file exists and has valid syntax.

---

## Implementation Details

### Step 1: Install Tiptap Packages

Run from `/home/dev/projects/SmartSpecPro/apps/web`:

```bash
pnpm add @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header @tiptap/extension-underline @tiptap/extension-placeholder @tiptap/suggestion tiptap-markdown @tiptap/pm tippy.js
```

Package purposes:

| Package | Purpose |
|---------|---------|
| `@tiptap/react` | React bindings (`useEditor`, `EditorContent`, `ReactNodeViewRenderer`) |
| `@tiptap/starter-kit` | Bundle: paragraph, heading, bold, italic, strike, code, codeBlock, blockquote, bulletList, orderedList, listItem, horizontalRule, hardBreak, history |
| `@tiptap/extension-image` | Base image node (extended in section 06 with caption/alignment/assetId) |
| `@tiptap/extension-link` | Link marks with `openOnClick: false` |
| `@tiptap/extension-table` | Table node (resizable) |
| `@tiptap/extension-table-row` | Table row node (required by table) |
| `@tiptap/extension-table-cell` | Table cell node (required by table) |
| `@tiptap/extension-table-header` | Table header cell node (required by table) |
| `@tiptap/extension-underline` | Underline mark (serializes as `<u>` in markdown via `html: true`) |
| `@tiptap/extension-placeholder` | Placeholder text when editor is empty (uses i18n string) |
| `@tiptap/suggestion` | Suggestion/autocomplete framework (used for slash commands in section 05) |
| `tiptap-markdown` | Markdown parse/serialize bridge (core of section 02) |
| `@tiptap/pm` | ProseMirror core re-exports (needed for direct PM access in extensions) |

Version constraints: All `@tiptap/*` packages should be `^2.x`. `tiptap-markdown` should be `^0.8.x`. These are compatible with the project's React 19.2.1 when `immediatelyRender: false` is used.

### Step 2: Create the Editor CSS File

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/editor.css`

This file provides ProseMirror base styles scoped under `.tiptap-editor` to prevent leaking into the rest of the app. The project uses Tailwind 4 with `@apply` directives. The existing CSS pattern can be seen in `/home/dev/projects/SmartSpecPro/apps/web/client/src/index.css` which imports Tailwind.

The CSS file should define styles for the following, all scoped under `.tiptap-editor .ProseMirror`:

**Typography:**
- `h1`: large heading size (e.g., `text-3xl font-bold`), with bottom margin
- `h2`: medium heading (e.g., `text-2xl font-semibold`)
- `h3`: smaller heading (e.g., `text-xl font-semibold`)
- `h4`: smallest heading (e.g., `text-lg font-medium`)
- `p`: standard paragraph spacing (margin-bottom)

**Lists:**
- `ul`: bullet list with disc markers, left padding
- `ol`: ordered list with decimal markers, left padding
- `li`: list item spacing

**Block elements:**
- `blockquote`: left border (e.g., 3px solid border-left), left padding, italic or muted text color
- `pre > code`: code block with background color, padding, rounded corners, monospace font, overflow-x auto
- `code` (inline): background color, padding, rounded, monospace font, slightly smaller text
- `hr`: horizontal rule with muted border color, vertical margin

**Tables:**
- `table`: full width, border-collapse
- `th`, `td`: border, padding
- `th`: bold, background tint

**Links:**
- `a`: primary color, underline on hover

**Placeholder:**
- `.ProseMirror p.is-editor-empty:first-child::before`: placeholder text using `content: attr(data-placeholder)`, muted color, float left, pointer-events none

**Focus:**
- `.ProseMirror:focus`: `outline: none` (the editor container handles focus styling)

**General:**
- `.ProseMirror`: minimum height (e.g., `min-h-[200px]`), padding, prose-like max width or full width

All color values should use CSS custom properties already defined in the project's theme (e.g., `var(--muted-foreground)`, `var(--border)`, `var(--primary)`, `var(--muted)`). Check `/home/dev/projects/SmartSpecPro/apps/web/client/src/index.css` for the available theme variables.

### Step 3: Create the Editor Directory Structure

Create the directory that all editor components will live in:

```
apps/web/client/src/components/editor/
├── editor.css                  (this section)
├── __tests__/
│   └── tiptap-setup.test.tsx   (this section)
├── TiptapMarkdownBridge.ts     (section 02)
├── TiptapEditor.tsx            (section 03)
├── UnifiedDocumentSurface.tsx  (section 03)
├── SourceModePanel.tsx         (section 03)
├── EditorToolbar.tsx           (section 04)
├── SlashCommandMenu.tsx        (section 05)
├── extensions/                 (section 06)
│   ├── imageExtension.ts
│   ├── videoExtension.ts
│   ├── audioExtension.ts
│   └── mediaSerializationRules.ts
├── nodeviews/                  (section 07)
│   ├── ImageNodeView.tsx
│   ├── VideoNodeView.tsx
│   ├── AudioNodeView.tsx
│   └── MediaSelectionOverlay.tsx
├── MediaInsertMenu.tsx         (section 08)
└── ConflictResolutionDialog.tsx (section 12)
```

Only `editor.css` and the test file are created in this section. The directory structure is listed here for context.

### Step 4: Import editor.css

The CSS file must be imported somewhere in the component tree to take effect. It should be imported by `TiptapEditor.tsx` when that component is created in section 03. For now, the CSS file just needs to exist and be syntactically valid.

Do NOT import it in `index.css` -- it should be lazy-loaded with the editor component to avoid loading ProseMirror styles on pages that do not use the editor.

### Step 5: React 19 Compatibility Validation

The critical compatibility concern is documented in the plan's risk register: "React 19 StrictMode + Tiptap crash" (Likelihood: LOW, Impact: HIGH).

The mitigation is `immediatelyRender: false` passed to `useEditor()`. This option tells Tiptap not to synchronously render the ProseMirror view during the initial React render, which avoids conflicts with React 19's stricter effect lifecycle.

Every usage of `useEditor()` in the entire feature (sections 03, 05, 06, and any test files) MUST include `immediatelyRender: false`. The test in this section validates this works.

If the tests in this section fail (editor instance is null, StrictMode crashes), the Tiptap version may need pinning or patching before proceeding to section 02. This is the "spike" mentioned in the plan.

---

## Verification Checklist

After completing this section, verify:

1. `pnpm install` succeeds without peer dependency conflicts in `/home/dev/projects/SmartSpecPro/apps/web`
2. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run client/src/components/editor/__tests__/tiptap-setup.test.tsx` passes all tests
3. `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check` (TypeScript) passes -- Tiptap types resolve correctly
4. The `editor.css` file exists and contains valid CSS with `.tiptap-editor .ProseMirror` scoping
5. No changes to any existing files other than `package.json` and `pnpm-lock.yaml`

---

## Key File Paths

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/package.json` | Modified (new dependencies added) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/editor.css` | Created |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/editor/__tests__/tiptap-setup.test.tsx` | Created |

---

## Known Considerations

- The project has a React version resolution issue in the monorepo: root `node_modules` has React 18 (from `reactflow`), while `apps/web` has React 19.2.1. The test setup file at `/home/dev/projects/SmartSpecPro/apps/web/client/src/test-setup.ts` handles this with a custom module resolution hook. Tiptap packages should resolve React from `apps/web/node_modules/react` thanks to pnpm workspace hoisting and the vitest `resolve.dedupe` config.
- The vitest config at `/home/dev/projects/SmartSpecPro/apps/web/vitest.config.ts` already inlines `react`, `react-dom`, and `@testing-library` deps via `server.deps.inline`. Tiptap packages may also need to be added to this array if they fail to resolve React correctly during tests. If tests fail with "Cannot find module 'react'" from within a Tiptap package, add `/@tiptap/` to the inline regex array.
- The `@tiptap/pm` package re-exports ProseMirror internals. It is needed to avoid duplicate ProseMirror instances when custom extensions access `prosemirror-*` APIs directly. Always import ProseMirror types from `@tiptap/pm` rather than installing `prosemirror-*` packages directly.