# Section 03 — Focused verification

## Ownership

No product source ownership; verify the outputs from sections 01 and 02.

## Checks

- Node focused route tests.
- Python focused renderer tests.
- Web typecheck or touched-path type validation if applicable.
- `git diff --check`.
- Optional local browser render only when the worker URL is reachable; no real
  export enqueue or production mutation.

## Acceptance

- All required focused checks pass.
- Existing unrelated dirty files are unchanged.
- Runtime limitations and residual risks are explicit in the final report.
