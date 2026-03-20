# Section 01 Code Review Interview

## Interview Decision: Tiptap Version
- **Issue**: HIGH — Tiptap v3.20.4 installed instead of plan-specified v2.x
- **Decision**: User chose to **keep v3**. All 7 tests pass including React 19 StrictMode. Plan will be updated to reflect v3.

## Auto-fixes Applied
1. **MEDIUM — `pre code` double-styling**: Added `.tiptap-editor .ProseMirror pre code` reset rule to prevent inline code styles from breaking code blocks.
2. **MEDIUM — Test 4 null assertion**: Changed optional chaining to explicit `expect(editor).not.toBeNull()` + non-null assertion for clearer failure messages.
3. **LOW — width: 100%**: Added `width: 100%` to `.ProseMirror` base rule as specified in plan.

## Let Go
- CSS smoke test syntax (`resolves.not.toThrow()` vs `resolves.toBeDefined()`) — functionally equivalent, not worth changing.
- CSS import concern — tests pass, confirming vitest handles `.css` imports correctly.
