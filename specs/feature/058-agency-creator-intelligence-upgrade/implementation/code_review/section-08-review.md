# Section 08 — Frontend Suggestions UI: Code Review

**Feature:** 058-agency-creator-intelligence-upgrade
**Section:** 08 — Frontend Suggestions UI
**Reviewer:** SSP Reviewer Agent (CMD-8)
**Date:** 2026-03-24

---

## Summary

The implementation covers the major structural goals of Section 08: suggestion state, polling ingestion, suggestion card rendering, Save as Template dialog, phase stepper update, and tRPC type extension. However it deviates from the spec on two security-relevant points — the `Apply` button is entirely absent (replaced by a mislabelled `Skip` button), and the `change` field from the Python backend is forwarded raw in the tRPC return type — and has several lower-severity gaps in test coverage and edge-case handling.

---

## Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `AutoCreateAgencyModal.tsx:124–136` | **`Apply` button replaced by `Skip`-only button — `handleApplySuggestion` not implemented.** The spec's Section 08 §4 (Security: F03) requires a dedicated `handleApplySuggestion` calling `trpc.agency.applySuggestion.mutate()` with a whitelist-only payload. The diff shows only a `Skip` button that calls `setAppliedSuggestions(prev => new Set(prev).add(i))` and renders "Noted". There is no Apply action, no `applySuggestion` tRPC call, and the feature advertised in the UI ("Recommended Improvements") is therefore read-only. The `appliedSuggestions` Set is also mislabelled — it tracks dismissals, not applications. | Implement `handleApplySuggestion` per spec §4. Add `applySuggestion` tRPC procedure (or flag as explicitly deferred with a tracking comment). Rename `appliedSuggestions` → `dismissedSuggestions` to match actual semantics. |
| HIGH | `agency.ts:2921–2939` | **`change` field forwarded raw from Python backend to client.** `safeData` is cast with `as { ... }` and the TypeScript type for `suggestions[]` does not include `change`, but the Python backend stores `change` in every suggestion dict (line 1540 of `agency_creator_task.py`). Because the cast is `as`-only (no Zod parse), the actual runtime object passed to the client still contains `change: { capability: "...", toolId: "...", executionMode: "..." }`. Spec §4 explicitly warns: "CRITICAL: Never forward raw LLM `change` payload to saveBuilder." While there is no saveBuilder call today (Apply is not implemented), the raw payload is already being surfaced to the browser, creating the injection vector the spec was designed to prevent. | Add a Zod schema to parse the suggestions array in `autoCreateStatus` and explicitly exclude the `change` key: `z.array(z.object({ category: z.string(), title: z.string(), description: z.string(), impact: z.string(), targetNodeId: z.string().optional() }))`. Use `.parse()` not `as`. |
| MEDIUM | `AutoCreateAgencyModal.tsx:64–71` | **`onCreated` callback is never called automatically on completion.** The original code called `onCreated(status.agencyId)` when status became `completed`. The new code stores `agencyId` in state and requires the user to click "Open in Agency Editor". This is a deliberate UX change (noted in a comment), but the `onCreated` prop contract is undocumented and callers (e.g. `AgencyBuilder.tsx`) may rely on the auto-call to trigger navigation or state refresh. The spec does not explicitly sanction this behavioural change. | Confirm with product that callers do not depend on immediate `onCreated` invocation. If callers are tolerant, the deferred approach is fine — but the comment should state that `onCreated` is now user-triggered, not automatic. |
| MEDIUM | `AutoCreateAgencyModal.tsx:185` | **`createdAgencyId` null-check is duplicated but not type-narrowed consistently.** The Save button is `disabled={!templateName.trim() \|\| !createdAgencyId \|\| ...}` yet the `onClick` handler also guards with `if (!createdAgencyId ...)`. Functionally safe, but the inner guard is dead code when the button is properly disabled. More importantly, if `saveAsTemplateMutation.mutateAsync` is `null` (the `?? { mutateAsync: null }` fallback pattern), the button is disabled, but this pattern means tRPC type safety is bypassed — a regression from the access pattern that uses `trpc.agency.saveAsTemplate.useMutation()` directly. | Prefer `trpc.agency?.saveAsTemplate?.useMutation?.()` defensive chain only during initial integration; once confirmed available, use the direct typed call. Document the `?? { mutateAsync: null }` pattern with a comment explaining why it is safe here. |
| MEDIUM | `AutoCreateAgencyModal.tsx:196` | **`catch` block swallows all errors silently.** The `catch {}` (empty catch) on the Save template mutation suppresses the error before `toast.error` is shown — at least the error is surfaced to the user via toast, but no structured error logging occurs. If the tRPC mutation throws a typed error (e.g., 403 ownership mismatch from Section 06), the user sees the same generic "Failed to save template" message. | Log the error at `warn` level before the toast, e.g. `console.warn("saveAsTemplate failed", e)` or use the structured logger. |
| MEDIUM | `AutoCreateAgencyModal.tsx:113–138` | **Suggestion `title` and `description` fields rendered unsanitised.** Although the Python backend truncates `title` to 50 chars and `description` to 200 chars (LLM output), the values are inserted directly into JSX as `{s.title}` and `{s.description}`. React's JSX escapes text node content for XSS, so `<script>` injection is blocked. However `s.category` and `s.impact` are rendered inside `<Badge>` components as children — these are also text nodes and are safe. The one risk is if a future change renders any of these as `dangerouslySetInnerHTML` or as an attribute. Overall the current code is safe, but the absence of Zod validation (see HIGH-2) means a malformed Python response could pass unexpected types (e.g., a number or object) and break rendering. | Accept as safe for now contingent on HIGH-2 (Zod parse) being fixed, which provides the structural guarantee. |
| LOW | `AutoCreateSuggestions.test.tsx:284–301` | **Phase stepper test is a constant-assertion no-op.** `expect(container).toBeDefined()` trivially passes. The test comment acknowledges this: "This test verifies the PHASES constant indirectly." The PHASES array change (removing `interview`, adding `suggest`) is not tested at all — a future revert would not be caught. | Either export `PHASES` for direct assertion, or drive the modal into `taskStatus = "processing"` with a mock timer/status to verify the stepper renders "Suggest" and not "Interview". |
| LOW | `AutoCreateSuggestions.test.tsx:303–337` | **Suggestion data structure test is a plain-value assertion with no component rendering.** Tests construct a local array and assert its own values — this tests nothing about the component's parsing or rendering logic. | Replace with a render test that passes `suggestions` into the completed-state view. Since internal state is not injectable via props today, this requires either extracting the suggestion card to a sub-component or exposing a test-only prop. |
| LOW | `agency.ts:377–417` | **Out-of-scope `builtin-meta-channels` tool added in section-08 diff.** This tool definition belongs to the Meta Channels feature (Spec 058-meta-channels), not the Frontend Suggestions UI section. The diff includes it in the section-08 change, which conflates concerns and makes the section diff harder to review independently. | Confirm this was intentionally bundled here. If so, note it in the section PR description. If accidental, move to the meta-channels implementation. |
| LOW | `agency_creator.py:456–458` | **`get_suggestions` is called on every poll when `hasSuggestions` is true.** Status is polled on a short interval (5 s default). Between the moment `hasSuggestions` is set and the client clearing the poll, two or three Redis reads of the suggestion list may occur. This is harmless for correctness but wasteful. | The existing `if pollRef.current) clearInterval(pollRef.current)` call already runs before this code path (line 63 in the diff), so in practice at most one extra poll can occur. Acceptable as-is. |

---

## Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `suggestions[]` type added to `autoCreateStatus` return type | PARTIAL | Type is present but lacks `change` exclusion; raw `change` field passes through at runtime |
| `applySuggestion` tRPC procedure defined | FAIL | Not present in diff; spec §4 requires it |
| `handleApplySuggestion` implemented | FAIL | Not in diff; only Skip/Noted flow exists |
| Phase stepper updated (interview removed, suggest added) | PASS | Lines 20–28 of diff |
| Suggestions parsed from poll response | PASS | Lines 63–65 of diff |
| `createdAgencyId` captured, `onCreated` deferred | PASS | Lines 67–71 of diff |
| Save as Template calls `saveAsTemplate` mutation | PASS | Lines 189–194 of diff |
| `handleClose` resets all new state | PASS | Lines 79–84 of diff |
| Python `get_suggestions` isolated in separate Redis key | PASS | Confirmed in task file |
| Python `get_suggestions` returned only on `completed` + `hasSuggestions` | PASS | Lines 456–458 of diff |
| `change` field stripped before client response | FAIL | `change` key present in Python dict, TypeScript `as` cast does not strip it |
| XSS via suggestion text content | PASS (conditional) | Safe with React text nodes; conditional on Zod parse fix |

---

## Verdict: CONDITIONAL PASS

The UX scaffolding is in place and the non-security aspects of the feature are correctly implemented. The two HIGH findings must be resolved before merge:

1. **The `Apply` button and `handleApplySuggestion` are absent.** The entire apply-suggestion flow from spec §4 is missing. The section cannot be considered complete without it, or an explicit documented deferral to a follow-on section.

2. **The `change` field is not stripped from the suggestions payload returned to the browser.** The TypeScript type annotation omits it, but the runtime object contains it. A Zod parse is required to enforce the boundary.

The MEDIUM finding on `onCreated` callback deferral should be verified against callers before merge.
