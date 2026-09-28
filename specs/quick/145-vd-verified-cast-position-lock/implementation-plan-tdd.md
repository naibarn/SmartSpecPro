# TDD plan

1. Add pure-helper tests that first fail for Shot 5 ordering, duplicate slots,
   asset mismatch, and display-name-to-key resolution.
2. Add prompt-service regressions where generated `frame_analysis` contradicts a
   verified lock; expect rejection after the existing correction retry. Assert the
   exact lock appears in the user prompt.
3. Add router tests proving prompt and paid-render preconditions occur before
   generation/credit calls, and proving mutation ownership/roster validation.
4. Add component tests for missing/stale/valid lock states, select uniqueness,
   unclear-image guidance, save callback, and disabled credit actions.
5. Run focused Vitest files, target-file TypeScript diagnostics, and
   `git diff --check`. Record unrelated repository baseline failures separately.
