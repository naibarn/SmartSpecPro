## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `NodePropertyPanel.tsx:757` | Intelligence section is not guarded by the `agencyAgenticModeEnabled` feature flag. Spec section-03 §"Consistency with Neighboring Sections" explicitly defers the flag check to section-04, but the section-04 spec confirms that the flag defaults to `true` and gates the entire agentic path. Without the guard the section is always visible regardless of flag state, which diverges from the flag-gated architecture of every other new feature in this codebase (Spec 049, 051, 052 all required this guard). Because section-04 is in the same batch-1 milestone, the guard must be wired here now or it will ship without it. | Import `useTenantFeatureFlag` and wrap the entire Intelligence `<div>` block (including its `<Separator />`) in `{agencyAgenticModeEnabled && (...)}`. |
| HIGH | `NodePropertyPanel.tsx:757` | The Intelligence section is rendered unconditionally for **all** node types inside `AgentSupervisorForm`. The component is only mounted for `agent`/`supervisor` (correct), but within the form there is no runtime guard against a `supervisor` node that an operator wants to constrain to single-shot mode only. More importantly the spec says "UI controls are only shown for `agent` and `supervisor` node types" and they are — but there is also no guard that hides the section from `supervisor` nodes if that becomes a policy requirement. The immediate defect, however, is that `onChange(ncSet(node, "executionMode", v))` merges the top-level `nodeConfig` with a shallow spread. `ncSet` returns `{ nodeConfig: { ...node.nodeConfig, executionMode: v } }` which correctly preserves sibling keys. This part is fine; no bug here. Downgraded — see note below. | No action needed on type guard. Clearing for the feature-flag issue is the priority. |
| MEDIUM | `agency.ts:1248–1268` | The backend validation for `maxReflectionCycles` converts the raw value via `Number(maxCycles)` before the integer check. If a client sends `maxCycles = 2.7`, `Number(2.7) = 2.7`, `Number.isInteger(2.7)` is `false`, so the validation correctly rejects it. However if a client sends `maxCycles = "3"` (a numeric string from a stale client), `Number("3") = 3`, `Number.isInteger(3)` is `true`, and the value is accepted as integer 3 — but it is stored as the string `"3"` (the original `nc.maxReflectionCycles` is never replaced, only validated). The orchestrator in section-02 reads this field and passes it to `clamp_to_limit()` which calls `int()`. Python `int("3")` succeeds, so this is not a crash — but storing a string where an integer is expected violates the schema contract. | In the validation block, reject non-integer-typed values outright: `if (typeof maxCycles !== "number" \|\| !Number.isInteger(maxCycles) \|\| maxCycles < 1 \|\| maxCycles > 10)`. |
| MEDIUM | `AgenticConfig.test.tsx:63–65` | `openIntelligence()` finds the button using `screen.getByText("Intelligence")`. This text also exists inside the `<span>` child of the button. `getByText` will match the deepest element containing only that text, which is the `<span>`, not the `<button>`. `fireEvent.click(span)` does bubble, so the test passes in practice — but it is fragile: if the span gains child elements, `getByText("Intelligence")` will throw a "Found multiple elements" error. The established pattern in `AgentPropertyPanel.test.tsx` uses `getByLabelText` or `getByRole("button", { name: ... })`. | Replace `screen.getByText("Intelligence")` with `screen.getByRole("button", { name: /intelligence/i })`. |
| MEDIUM | `AgenticConfig.test.tsx` (file-level) | None of the five tests assert that `onChange` is called with the correct `ncSet` payload when a control is interacted with. The spec requires "Writing (via onChange): `onChange(ncSet(node, "executionMode", value))`." All five tests cover read/display correctness only — zero tests verify write-path behavior. A regression that breaks the `onValueChange` handler would pass all five tests. | Add at minimum one test: render with `single_shot`, open Intelligence, change Execution Mode select to `"agentic"`, assert `onChange` was called with `{ nodeConfig: { executionMode: "agentic" } }`. |
| MEDIUM | `NodePropertyPanel.tsx:758` | The collapsible `<button>` for Intelligence has no `aria-expanded` attribute. All neighboring section buttons (Guardrails, MCP Servers) similarly lack it — this is a pre-existing gap — but this section is new code and is the right place to set the correct pattern. Without `aria-expanded`, screen readers announce the button as a generic button with no state. | Add `aria-expanded={intelligenceOpen}` to the button. Pattern: `<button ... aria-expanded={intelligenceOpen} aria-controls="intelligence-panel">`. |
| LOW | `AgenticConfig.test.tsx:1` | The spec's mock pattern for `AgentPropertyPanel.test.tsx` is the reference, but the new test file does not mock `McpServersPanel` using the same module path convention as the reference. The reference file uses only `vi.mock("../ToolPicker", ...)` (no McpServersPanel). The new file adds `vi.mock("../McpServersPanel", ...)` which is correct for the current component structure. No bug, but worth noting that the mock module path must be kept in sync if `McpServersPanel` is relocated. | Document the mock path dependency in a comment: `// McpServersPanel mocked because it calls backend endpoints`. |
| LOW | `NodePropertyPanel.tsx:819` | The range slider `<input type="range">` has no accessible label. The `Label` element at line 773 says "Max Reflection Cycles" but it has no `htmlFor` wiring to the input, and the input has no `id` or `aria-label`. Screen readers will not announce the label when the slider receives focus. | Add `id="max-reflection-cycles"` to the input and `htmlFor="max-reflection-cycles"` to the `<Label>`. |
| LOW | `AgenticConfig.test.tsx:102` | `screen.getByRole("slider")` will fail if Radix UI's `Select` component internally renders any element with `role="slider"` or if other sliders exist on the page. The test should be scoped more narrowly. | Use `screen.getByRole("slider", { name: /max reflection cycles/i })` after fixing the `htmlFor`/`aria-label` wiring above. |

---

### Contract Compliance

| Requirement | Status | Notes |
|---|---|---|
| `executionMode` values match section-02 backend (`"single_shot"`, `"agentic"`) | PASS | Exact string match confirmed. |
| `planningStrategy` values match section-02 backend (`"basic"`, `"cot"`, `"react"`) | PASS | Exact string match confirmed. |
| `maxReflectionCycles` range (1–10) matches section-02 `clamp_to_limit` bounds | PASS | Slider min/max and server validation both use 1–10. |
| `showReasoning` boolean matches section-02 field name | PASS | Field name and type match. Note from section-02 review: section-02 never reads `showReasoning` (MEDIUM-1 there) — the UI adds controls for a field the backend ignores. This is a cross-section contract gap, not a section-03 bug, but the reviewer notes the round-trip is currently a no-op. |
| `ncGet`/`ncSet` helpers used for all reads/writes | PASS | All four fields use the helpers correctly. |
| `Brain` icon imported from `lucide-react` | PASS | Added to existing import line at line 9 of the diff. |
| `intelligenceOpen` state added alongside other collapsible state variables | PASS | Added at line 18 of diff, consistent with `kbOpen`, `guardrailsOpen`, `mcpServersOpen`. |
| `Separator` added between Intelligence and Guardrails sections | PASS | Present at line 112 of diff. |
| Backward compatibility: no existing `nodeConfig` fields broken | PASS | `ncSet` uses spread, preserving all sibling keys. New fields are optional with safe defaults. |
| Backend `superRefine` validation uses same `ctx.addIssue()` pattern as existing checks | PASS | Placed inside the existing `if (["agent", "supervisor"].includes(data.nodeType))` block correctly. |
| Feature flag gate (`agencyAgenticModeEnabled`) applied to Intelligence section | FAIL | No feature flag check present. Section-03 spec defers this to section-04 but section-04 is in the same batch and the flag guard must ship with the UI, not after it. |
| Test: renders execution mode dropdown for agent nodes | PASS | Test at line 72. |
| Test: shows agentic sub-options when agentic mode selected | PASS | Test at line 78. |
| Test: hides agentic sub-options when standard mode selected | PASS | Test at line 88. |
| Test: slider range is 1-10 | PASS | Test at line 97. |
| Test: shows cost warning banner | PASS | Test at line 107. |
| Test: write-path (`onChange` called with correct payload) | FAIL | No write-path assertions in any test. |

---

### Summary

The implementation is structurally sound: the Intelligence collapsible section follows the established patterns in `NodePropertyPanel.tsx` exactly, the `ncGet`/`ncSet` helpers are used correctly for all four fields, the Zod backend validation is additive and placed correctly inside the existing `superRefine` block, and all five spec-required test cases are present. Two blocking issues must be fixed before merge: the `agencyAgenticModeEnabled` feature flag gate is absent (the section is always visible regardless of flag state, violating the flag-gated architecture required by all prior specs in this codebase), and the test suite has zero write-path assertions (a regression in any `onValueChange` handler would pass all five tests). Three medium findings cover fragile test selectors, a type inconsistency in the backend numeric validation, and missing `aria-expanded` on the collapsible toggle.
