# Section 03 — Verification

Ownership:

- focused Node/Python/UI test files
- `orchestra/ui-browser-evidence.md` only if browser execution is available

Tasks:

- Cover all new router fields and security behavior.
- Cover Python DB decryption and environment fallback.
- Cover tenant flag synchronization.
- Cover EN/TH UI and action states.
- Run targeted typecheck and Meta tests.
- Inspect the final diff for unrelated dirty-tree overlap.

Acceptance:

- Focused tests pass.
- Typecheck passes or any pre-existing failure is isolated with evidence.
- No new secret appears in snapshots, logs, or responses.
- Browser evidence is pass or explicitly skipped with reason.
