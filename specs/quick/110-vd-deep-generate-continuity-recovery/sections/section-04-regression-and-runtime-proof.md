# Section 04 — regression and runtime proof

## Ownership

Focused verification and live read-only/approved recovery evidence.

## Targets

- focused Vitest suites
- Redis key `vd:story-job:4f157219-202f-43ed-8b5a-731cb623de65`
- PostgreSQL series `25`

## Acceptance

- Focused tests pass.
- `git diff --check` passes.
- Recovery reports whether bible/memory was written and why.
- No unrelated worktree edits are touched.
