# Section 04 — verification

Ownership: focused test additions and verification report only.

Run service, router, job, and client tests; run `git diff --check`; run focused TypeScript checks where available. Keep baseline-wide typecheck, browser, provider, migration application, deployment, and production evidence separate. Verify the migration SQL is parseable and does not alter existing rows destructively.
