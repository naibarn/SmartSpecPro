# Section 05 — Verification

## Ownership

Own focused test orchestration, parse checks, diff integrity, and evidence capture.

## Checks

- Run all new/updated shared, router, pipeline, and component tests.
- Run browser-safe jsdom tests for UI modules.
- Run targeted esbuild/TypeScript parse checks.
- Run `git diff --check` and inspect changed-file scope.
- Confirm no provider, credit, or production mutation occurred.

## Acceptance

All focused tests pass; no episode UI contract regression; legacy pair repair and
effective-DNA provenance are observable in fixtures; unrelated dirty files remain
untouched.

## Evidence (2026-09-06)

- 46 focused shared/UI tests passed.
- esbuild parse checks passed for both affected routers and the Characters panel.
- `git diff --check` passed.
- Full TypeScript check remains blocked by pre-existing unrelated errors/OOM at the
  default heap; the 8 GiB run reports no errors in the affected twin files.
- Local PostgreSQL was unavailable, so no live row repair or media/credit action ran.
