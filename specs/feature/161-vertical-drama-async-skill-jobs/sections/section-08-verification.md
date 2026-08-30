# Section 08 — Verification and regression guards

Add focused server and jsdom tests for each job family, billing and ownership. Add a source-level regression test that the named public router mutations no longer directly call the expensive LLM service functions. Run focused tests, changed-file diagnostics, `npm --workspace apps/web run check` where feasible, and `git diff --check`. Record separately whether OpenRouter, browser, deployment, migration and production checks were actually run.
