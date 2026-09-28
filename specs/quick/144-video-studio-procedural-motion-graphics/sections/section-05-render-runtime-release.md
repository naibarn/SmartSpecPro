# Section 05 — Render, Runtime and Release

## Ownership

Own final integration, worker/runtime compatibility, GL configuration, parity tests,
render smoke, observability and release decision. Do not silently accept stale workers.

## Target files

- `packages/remotion-render/src/*`
- `apps/worker-app/*` only if the contract/runtime actually changes
- `apps/web/server/services/queueRemotionRenderVideoJob.ts`
- worker registry/heartbeat and render tests
- release manifest and dashboard assets only after the implementation passes gates

## TDD/verification expectations

Run focused schema/compiler/renderer tests, Player/render parity, preview/final MP4
smoke, Three.js GL smoke, worker claim/heartbeat/retry proof and a production-safe
contract compatibility check. Report unrelated full-suite failures separately.

## Acceptance

The final worker claims and renders a project containing all three visual families,
subtitle timing remains correct, and the output is not blank/black. Old projects still
render. A runtime release is created only if the dependency or contract changed.

## Risks

Prepared runtime or artifact health is not proof of job claimability. Keep strict
version matching and require observed worker claim/retry before declaring release ready.
