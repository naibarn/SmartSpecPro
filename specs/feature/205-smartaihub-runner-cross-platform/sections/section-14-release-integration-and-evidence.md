# Section 14 — Release Integration and Evidence

## Goal

Close the cross-section implementation with focused verification, spec/plan
consistency, release workflow evidence and explicit external gates.

## Owned documentation and checks

- `scripts/verify-runner-release-workflow.mjs`
- `specs/feature/205-smartaihub-runner-cross-platform/implementation/section-status.md`
- `specs/feature/205-smartaihub-runner-cross-platform/implementation/completion.md`
- `specs/feature/205-smartaihub-runner-cross-platform/implementation/review.md`
- `specs/feature/205-smartaihub-runner-cross-platform/implementation/evidence.json`
- `specs/feature/205-smartaihub-runner-cross-platform/reviews/release-management-audit-2026-09-18.md`

## Verification matrix

Run only focused commands:

```text
cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check
cargo test --manifest-path apps/runner-app/Cargo.toml
npm --workspace @smartspec/web test -- drizzle/schema.test.ts server/services/__tests__/runnerReleaseCatalog.test.ts server/routes/__tests__/runnerReleases.test.ts server/routes/__tests__/runnerControl.test.ts server/services/__tests__/runnerContracts.test.ts
npm --workspace @smartspec/web test -- client/src/features/runner-releases/__tests__/RunnerReleasePanel.test.tsx client/src/features/desktop-releases/__tests__/DesktopReleaseConfigPanel.test.tsx
node scripts/verify-runner-release-workflow.mjs
git diff --check
```

Do not run repository-wide `npm run typecheck`. If a focused compiler probe is
needed, target only changed server modules and record the command/output.

## Audit rounds

Perform at least ten explicit comparison rounds covering: spec-to-code,
workflow trigger/publish, catalog/storage, API auth, update idempotency, Rust
version/update, Dashboard UX, Worker separation, Cloudflare 204 boundary and
rollback/evidence. Fix every concrete gap found, then rerun affected focused
checks. Record unresolved native host, GitHub secret, target account,
Cloudflare deployment or browser-environment gates as unverified rather than
passing.

## Acceptance

The implementation docs contain exact commands and outcomes, no completion
claim is made without fresh output, and the dirty worktree's unrelated changes
remain unstaged and untouched.
