# Section 03 Code Review Interview

## Review Triage

### Auto-fixed (applied without interview)

1. **HIGH: Edit mode data loading** — Changed CustomToolCreator to accept `editToolData` prop with pre-fetched data from ToolPicker instead of re-fetching via `listCustomTools` (which returned incomplete data). ToolPicker now passes the full tool object when opening edit mode.

2. **HIGH: Headers wiped on save** — Added `headersModified` state flag. Headers are only sent in the update payload when the user explicitly adds/removes headers. Added a notice about existing encrypted headers in edit mode.

3. **HIGH: AgencySidebar button** — Renamed from "Manage Custom Tools" to "Create Custom Tool" (accurate for create-only flow).

4. **MEDIUM: handleSave validation** — Added `validateStep(0)` and `validateStep(1)` checks at the top of `handleSave()`. Jumps to the first failing step if validation fails.

5. **MEDIUM: JsonSchemaEditor controlled state** — Added `useEffect` to sync `properties` state when `value` prop changes externally.

6. **MEDIUM: NodePropertyPanel heuristic** — Added `!tool.toolId.startsWith("sandbox-")` exclusion alongside the existing `builtin-` check.

7. **LOW: JsonSchemaEditor label prop** — Added optional `label` prop (defaults to "Input Schema"). Output schema editor now passes `label="Output Schema"`.

8. **LOW: Header input type** — Changed from `type="password"` to `autoComplete="off"` for better accessibility.

### Deferred (handled by other sections)

- **MEDIUM: Feature flag gating** — `AGENCY_CUSTOM_TOOLS_ENABLED` flag registration and UI gating is explicitly covered by section-23 (Feature Flags Integration). Adding it here would create a forward dependency.

### Let go (acceptable as-is)

- **MEDIUM: `confirm()` vs AlertDialog** — Native confirm works and is used in tests. A polish improvement but not blocking for this section.

- **MEDIUM: `(trpc as any)` pattern** — This pattern is used consistently across the codebase for optional tRPC namespaces. The agency router may not be registered in all environments.

- **HIGH: Test button in create mode** — The spec acknowledges "Save the tool first, then test it" as an alternative. The current implementation shows this message. A `getCustomTool` backend procedure would be needed for full unsaved testing support — this can be added as a follow-up enhancement.

- **LOW: Missing test cases** — Edit mode update routing test, SSRF error handling test, and click-opens-dialog test are nice-to-have but the core happy paths are well covered (23 tests passing).
