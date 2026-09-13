# TDD guidance

1. Add a failing Python assertion that the Agent has `model_settings.max_tokens`
   set to 8,192 and that `chat-completions` selects the corresponding SDK API.
2. Add a failing Python assertion that a provider 402 is classified as
   `ENHANCED_PROVIDER_CREDIT_LIMIT` without raw response text.
3. Add a failing TypeScript assertion for provider model id/API style in the
   Enhanced skill input and safe classification of bridge diagnostics.
4. Implement the smallest source changes until the new tests pass.
5. Run existing Python bridge tests and the focused Enhanced Vitest file.
6. Run TypeScript parse/build checks for touched modules and `git diff --check`.

No real provider, credit, database mutation, deployment, or restart is part of
the test plan.
