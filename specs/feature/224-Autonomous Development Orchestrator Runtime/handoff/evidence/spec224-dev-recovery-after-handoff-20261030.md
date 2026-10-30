# SPEC-224 Development Release Recovery After Handoff-only Changes

- Observed at: `2026-10-30T10:47:00Z`.
- Status: development release and production isolation verified; live owner Goal remains pending.
- Integrated/deployed source SHA: `bb5c0746a3935acb0f6a8fb6fa11bda48ac0006d`.

## Recovery defect and fix

A handoff-only commit after a dev deployment advances `HEAD` without changing runtime source. The previous dev launcher required the pinned artifact source SHA to equal `HEAD`, so a service restart after a documentation-only commit would reject a valid artifact. The launcher now accepts an older artifact only when its source is an ancestor of `HEAD` and every intervening path is under `specs/**/handoff/**`. Divergent commits, non-ancestor sources, and any intervening runtime/source path remain rejected. Focused unit coverage checks exact SHA acceptance, handoff-only ancestor acceptance, and runtime/diverged rejection.

## Development release proof

- Command: `pnpm run release:dev:web`.
- Build status: `BUILD_PASSED`; canonical source `refs/heads/main` at the SHA above.
- Build receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/bb5c0746a3935acb0f6a8fb6fa11bda48ac0006d-a0f781b0-6094-4ba3-b8cd-ad01b37c9dc1.json`.
- Artifact: `sha256:fa7453245cd2cc0714e466b1e0447fc8bba729afde30777c0a36e0d119a0263d` at `/mnt/SmartSpecDev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/bb5c0746a3935acb0f6a8fb6fa11bda48ac0006d-build/apps/web/dist`.
- Development service: user unit `smartspec-dev-web.service`, port `3100`; development tunnel `smartspec-dev-tunnel.service`; domain `aimarkethubs.com`.
- Runtime record reports the artifact source SHA and dev service identity. Local health, development API readiness, public `/healthz`, and public `/chat` returned HTTP 200. Public `index-DU1CNC1c.js` SHA-256 `c7d27fb21b718c77e365f3d88d44a9cc51ef9019ae36a6f042ef0bbed5d28b38` matched the immutable artifact.
- Production preservation fingerprint before and after: `f1aed6fad0627b16ccfd2552a65eb5a65083424aa0515687a2b575116822e75b`; generation-251 pointer and production units were preserved.

## Acceptance boundary

This release contains the Guided First Run and recovery changes; it does not claim authenticated Admin UAT or a live execution. No Goal, Approval, DevelopmentRun, Job, Attempt, grant, or simulated receipt was created. Maintain `FEATURE_DEPLOYED / LIVE_GOAL_PENDING` until a genuine owner-approved Goal produces real Child 1/2 receipts, settlement, and Independent Final Verify.
