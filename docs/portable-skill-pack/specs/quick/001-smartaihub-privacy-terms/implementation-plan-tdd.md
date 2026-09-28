# TDD Guidance

1. Add content-module tests first; they should fail until both locale documents and the renderer
   contract exist.
2. Assert section ID parity, minimum section coverage, verified contact facts, and absence of
   banned legacy claims.
3. Implement the content module and pages.
4. Run the focused content test and, if practical, a jsdom page render test using a mocked
   `useScopedTranslation` locale.
5. Run Prettier/check formatting, `git diff --check`, and changed-file TypeScript diagnostics.
