# Section 02 — safe errors and tests

- Classify provider 402/429/auth and generic runtime failures into stable
  stderr codes without Python traceback output.
- Map stable bridge codes to safe user-facing Node errors.
- Keep `deductCredits` after successful bridge completion only.
- Add Python and TypeScript regressions for the new behavior and rerun existing
  Enhanced contract tests.

Completion: focused tests, module parsing, and diff integrity pass with no
provider or database side effects.
