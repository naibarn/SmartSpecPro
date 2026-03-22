# Section 08 Review — Phase 2 Tests: UserLlmKeysPanel

**Spec:** 048-auth-token-storage-hardening / section-08-phase2-tests
**Branch:** codex/feature-044-multimodal-chat-memory
**Reviewed:** 2026-03-19

---

## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `UserLlmKeysPanel.test.tsx:127–149` | **Delete test is fragile and tests the wrong thing.** The test finds delete buttons by filtering out all buttons with non-empty `textContent`, then fires a click on `deleteButtons[0]` and asserts `provider: "openai"`. This relies on DOM order: openai being the first provider in `LLM_PROVIDERS` that has a configured key in the mock. The `configuredMap` is built from `listQuery.data` and providers are rendered in `LLM_PROVIDERS` order, so openai does come first — but this is an implicit positional dependency. More critically, the filtering logic at line 137–142 is convoluted: it builds a `knownTexts` Set of button elements (not strings), then checks `!knownTexts.has(btn)` — but `knownTexts` contains button elements from `getAllByText`, not the same objects returned by `getAllByRole`. The `Set.has()` check will always return false (different object references), making the filter reduce to purely the `textContent === ""` check. The test passes only because it happens to work via that last condition. Replace with `screen.getByRole("button", { name: /delete openai/i })` if the button has an accessible label, or add `data-testid="delete-openai"` to the component and query by testid. |
| MEDIUM | `UserLlmKeysPanel.test.tsx:166–177` | **Security DOM test is structurally weak.** The test asserts `html` does not contain `"sk-full-key"` and `"apiKeyEncrypted"`. Neither string appears anywhere in the component or the mock data — `"sk-full-key"` is a literal the test invented, not a value injected through the mock, and `"apiKeyEncrypted"` is a DB column name that would never be in the DOM. The test will pass trivially even if the component is completely broken. A meaningful security test would: (1) set mock data to include a `keyHint` and a plausible `rawKey` value (e.g., `"sk-proj-SECRETVALUE1234"`) in the query return, (2) render, and (3) assert the DOM does NOT contain the full key string but DOES contain only the hint. Without injecting an actual secret value into the mock data, this test cannot catch a regression where the server accidentally returns the full key and the component renders it. |
| MEDIUM | `UserLlmKeysPanel.test.tsx:14–46` | **`useMutation` mock fires `onSuccess` synchronously and unconditionally.** The mock calls `opts.onSuccess({}, args[0])` immediately in the `mutate` function body. This means mutations never appear to fail and never appear to be pending — `isPending` is always hardcoded `false`. There are no tests for error paths (e.g., what happens when `setKey` fires `onError`) even though the component renders a `toast.error(...)` in that case. The section-07 review flagged missing error-state tests; this section does not add them. At minimum, add one test that verifies `toast.error` is called when `onError` fires. |
| LOW | `UserLlmKeysPanel.test.tsx:163` | **Toast message assertion uses literal `"deepseek key saved"` without confirming it matches the component's `toast.success` format string.** The component produces `` `${variables.provider} key saved` `` (line 45 of the component). For `provider: "deepseek"` this yields `"deepseek key saved"` — so the assertion matches. However, if the provider label is ever changed in `LLM_PROVIDERS` (e.g., to `"DeepSeek"`), the assertion would still pass because the toast uses the `id` from the mutation variables, not the display label. This is actually correct behavior — noting only that the test should document this intent. No code change required, but add a comment. |
| LOW | `UserLlmKeysPanel.test.tsx:82–105` | **Provider count is asserted via hardcoded text matches instead of the canonical `LLM_PROVIDERS` constant.** The test at line 82 names all 5 providers literally. If a provider is added or renamed in the component, the test will fail with a cryptic "Unable to find element" error rather than a clear assertion failure. Minor but worth noting. |

---

### Contract Compliance

| Check | Status | Notes |
|---|---|---|
| `trpc.userApiKeys.listKeys.useQuery` mocked and exercised | PASS | Default mock returns 2 configured providers across all tests. |
| `trpc.userApiKeys.setKey.useMutation` — input shape `{ provider, apiKey }` | PASS | Line 121–124 asserts exact shape. |
| `trpc.userApiKeys.deleteKey.useMutation` — input shape `{ provider }` | PASS | Line 147–149 asserts exact shape. |
| `trpc.useUtils` → `userApiKeys.listKeys.invalidate()` called after mutations | PASS | `mockInvalidate` is set up and invocation is verifiable — **but no test actually asserts `mockInvalidate` was called.** The section-07 MEDIUM finding about `listQuery.refetch()` is now resolved (component uses `invalidate`), but no test guards this correct behavior. |
| Input `type="password"` verified | PASS | Line 187 — `getAttribute("type") === "password"`. Meaningful test. |
| Raw key never in DOM | PARTIAL | Test exists but is structurally weak (see MEDIUM finding above). |
| Loading state renders skeletons | PASS | Lines 190–201 — `isLoading: true` path covered. |
| Error state renders message | PASS | Lines 203–213 — `isError: true` path covered. |
| `onError` toast path tested | FAIL | No test exercises mutation failure. |
| `mockInvalidate` called after save | FAIL | Cache invalidation is not asserted in any test despite being the correct pattern. |

---

### Summary

The test file resolves the HIGH blocking issue identified in the section-07 review — a file now exists and covers 8 scenarios. The most significant problems are (1) the delete button test uses a broken `Set.has()` filter that works only incidentally, not by design, and will silently mismatch if button structure changes; and (2) the security DOM-exposure test is not meaningful because it checks for strings that were never present in the mock data to begin with. Fixing the delete test to use a stable query (testid or accessible name) and injecting a real secret string into the mock for the DOM-exposure assertion would make this a solid, trustworthy test suite. The missing `mockInvalidate` assertion and absent `onError` path tests are secondary gaps that should be added but do not block correctness.
