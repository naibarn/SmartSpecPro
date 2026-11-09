# Section 03: Proof and Deployment

## Goal

Verify the canonical worker lifecycle and make the integrated fix available on the existing development target.

## Ownership

- Tests and release evidence under task-owned paths only; no unrelated changes.

## TDD / verification

- Run the focused tests listed by the changed modules and `git diff --check`.
- Run the repository's fast integration gate, stage only owned source/test/plan paths, commit and push/integrate to `origin/main`.
- Verify the integrated SHA, then release with `pnpm run release:web:linux -- --target legacy-debian-dev --required-integrated-revision <sha>`.
- Verify the target and public health/runtime revision at `smartaihub.app`.

## Acceptance

- Tests pass; no local full TypeScript check is run.
- Main and `origin/main` match the integrated SHA.
- The Debian development runtime reports healthy on the new revision; no Cloudflare/production target is touched.
