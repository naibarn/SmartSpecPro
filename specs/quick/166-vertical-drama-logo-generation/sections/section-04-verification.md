# Section 04 — Verification and convergence

## Ownership

Own verification artifacts only; do not modify unrelated dirty files.

## Checks

- Focused shared/router/UI tests and affected TypeScript check.
- Review changed diff for tenant isolation, URL durability, duplicate submit, and stale polling handling.
- Browser evidence at mobile/tablet/desktop if dev server and authenticated fixture are available; otherwise mark skipped with blocker.
- Record gap closure and review convergence in Orchestra artifacts.
