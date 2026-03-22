# Section 07 Review — Frontend API Key Panel

**Spec:** 048-auth-token-storage-hardening / section-07-frontend-api-key-panel
**Branch:** codex/feature-044-multimodal-chat-memory
**Reviewed:** 2026-03-19

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `UserLlmKeysPanel.tsx` (no test file) | **Tests entirely absent.** The plan mandates 8 specific test stubs in `__tests__/UserLlmKeysPanel.test.tsx` and classifies them as "Write First." No test file was created — not even the scaffolding. The plan's security test ("does NOT display raw API key values in the DOM") is the most important one and is completely missing. | Create `apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx` with all 8 plan stubs implemented using mocked tRPC hooks and React Testing Library. |
| MEDIUM | `UserLlmKeysPanel.tsx:52` | **`listQuery.refetch()` instead of query invalidation.** The implementation calls `listQuery.refetch()` on `setKey` success and on `deleteKey` success. The plan specifies "invalidate the `listKeys` query." While functionally equivalent in simple cases, `refetch()` bypasses TanStack Query's cache invalidation graph and is not the correct pattern for tRPC in this codebase — other components that display the same data will not be updated. The correct pattern is `utils.userApiKeys.listKeys.invalidate()` via `trpc.useUtils()`. | Replace `listQuery.refetch()` calls with `const utils = trpc.useUtils(); ... utils.userApiKeys.listKeys.invalidate()` in both mutation `onSuccess` callbacks. |
| MEDIUM | `UserLlmKeysPanel.tsx` (entire component) | **Concurrent editing state is shared across all providers.** A single `apiKeyInput` string and a single `editingProvider` state variable are used. If the user clicks "Edit" for provider A, types a key, then clicks "Edit" for provider B (which clears `editingProvider` and resets `apiKeyInput`), the partially typed key for A is silently discarded with no warning. The bug: `setEditingProvider(id)` at line 164-166 does reset `apiKeyInput` to `""`, but the old Save button for provider A has already been replaced. The real risk is that a fast user could click Save before the state clears. This is an acceptable UX limitation only if each click of "Edit" forces closure of the prior open input — which it does (because only one provider can be in `isEditing` state at a time). The logic is actually correct but the UX should have a visual indicator that switching providers discards the pending input. No code fix strictly required, but the omission of an unsaved-changes guard is worth flagging at MEDIUM. | Optionally: before switching `editingProvider`, check `apiKeyInput.trim().length > 0` and either prompt ("Discard unsaved key?") or silently close the previous input. Not a blocking bug but a UX gap in the plan that was not addressed. |
| LOW | `Settings.tsx:1217` (rendered position) | **`UserLlmKeysPanel` is placed directly adjacent to `UserAPIKeysPanel` with no visual separator.** The diff shows `<UserLlmKeysPanel />` added immediately after `<UserAPIKeysPanel />` with only the `space-y-6` div spacing between them. The plan says "separated by a divider." The `{/* Context7 API Key */}` section below has an explicit `<div className="border-t ...">` divider; the new panel does not. | Add a `<div className="border-t border-gray-200 pt-6 mt-6">` wrapper around `<UserLlmKeysPanel />`, consistent with the Context7 section's pattern and the plan's stated requirement. |
| LOW | `UserLlmKeysPanel.tsx:69-71` | **`configuredMap` uses `listQuery.data` without handling loading/error states.** While `?? []` handles the undefined case, there is no loading skeleton and no error state rendered when `listQuery.isError` is true. All providers will silently show as "Not configured" if the query errors. Other panels in the settings page (e.g., `GoogleDrivePanel`) typically show a loading indicator or an error message. | Add `if (listQuery.isLoading) return <Skeleton ... />` and `if (listQuery.isError) return <p className="text-sm text-red-500">Failed to load keys</p>` guards before the main render, or inline error/loading indicators per provider row. |
| LOW | `UserLlmKeysPanel.tsx:43` | **`apiKeyInput` state holds the raw key value in React state throughout the editing session.** The plan explicitly warns "Never store the API key value in React state beyond the input field." Using `useState` is the idiomatic React approach here and the value IS cleared on success (line 50), but the plan's intent was to avoid persisting it in long-lived state (e.g., component-level state that survives re-renders of other parts of the tree). The current implementation is the standard controlled-input pattern and is not a practical security concern — the value lives only as long as the component is mounted and editing. However, it could be refactored to use an uncontrolled `ref` to match the plan's stated preference. This is a compliance-with-plan note, not a security bug. | No mandatory change required. If strict plan compliance is needed, convert to `useRef<HTMLInputElement>` and read `.current.value` on save. Otherwise document the deviation. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `trpc.userApiKeys.setKey` — input shape `{ provider, apiKey }` | PASS | Line 75 matches router schema exactly. |
| `trpc.userApiKeys.listKeys` — called with no input | PASS | Line 45 — no argument passed. |
| `trpc.userApiKeys.deleteKey` — input shape `{ provider }` | PASS | Line 79 matches router schema exactly. |
| `provider` values match `providerEnum` in router | PASS | `LLM_PROVIDERS` array (lines 30-35) contains `openai`, `anthropic`, `deepseek`, `google`, `openrouter` — exactly the 5 values in the router's `providerEnum`. |
| Input `type="password"` for API key field | PASS | Line 126 — `type="password"` confirmed. |
| Raw key never returned to DOM | PASS | Only `config.keyHint` (last 4 chars) is rendered (line 113). No mutation response key displayed. |
| `apiKeyInput` cleared after successful save | PASS | Line 50 — `setApiKeyInput("")` called in `onSuccess`. |
| `editingProvider` reset after save | PASS | Line 51 — `setEditingProvider(null)` called in `onSuccess`. |
| Success toast via `sonner` | PASS | Lines 49, 61 — `toast.success(...)` confirmed for both mutations. |
| Error toast via `sonner` | PASS | Lines 55, 65 — `toast.error(...)` confirmed for both mutations. |
| sessionStorage functions removed from `authService.ts` | PASS | All 5 functions (`setApiKey`, `getApiKey`, `deleteApiKey`, `listStoredApiKeys`, `hasApiKey`) and the `LLMProvider` type export removed. The `TODO` comment block is also removed. |
| No remaining imports of removed authService functions | PASS | Grep confirms zero imports of the removed functions anywhere in `apps/web/client/src/`. |
| `LLMProvider` type re-exported or replaced where needed | PASS | The type was only used internally by the removed functions. No external consumers existed per plan analysis, confirmed by grep. |
| `UserLlmKeysPanel` imported and mounted in Settings.tsx | PASS | Import at diff line 209; mounted in API tab at diff line 217. |
| `protectedProcedure` auth guard exercised by any test | FAIL | No frontend component tests exist; the section-06 review already flagged that the router tests bypass the tRPC stack. Nothing new added here. |
| All 8 plan test stubs implemented | FAIL | Test file does not exist. See HIGH finding above. |
| Radix UI component usage (`Card`, `Button`, `Input`, `Badge`) | PASS | All four used. Imports from `@/components/ui/*` pattern followed. |
| `lucide-react` icons match plan specification | PASS | Plan specifies `Key`, `Trash2`, `CheckCircle2` — all three present. `Pencil` and `Plus` icons are additional, not in conflict. |

---

### Summary

The implementation is functionally correct and secure: the input is masked, the raw key is never rendered in the DOM, all three tRPC procedures are called with the correct shapes, sessionStorage functions are fully removed, and the component is properly wired into Settings. The two blocking issues are: (1) the test file is entirely absent — this is the highest-priority fix since the plan requires it and the security DOM-exposure test is load-bearing — and (2) `listQuery.refetch()` should be replaced with `utils.userApiKeys.listKeys.invalidate()` to follow the TanStack Query / tRPC invalidation pattern used elsewhere in the codebase. The remaining findings are low-severity UX and compliance notes that do not block correctness.
