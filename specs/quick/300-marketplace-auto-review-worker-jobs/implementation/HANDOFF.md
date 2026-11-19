# Deep Implement — Live HandOff

Generated from `deep_implement_config.json`. Read this at any time;
on resume, reconcile recorded SHA values with Git/PR state.

- State generation: `94`
- Updated (UTC): `2026-11-19T07:39:44.470474+00:00`
- Sections source: `/mnt/SmartSpecDev/projects/SmartSpecPro/specs/quick/300-marketplace-auto-review-worker-jobs/sections`
- Target checkout: `/mnt/SmartSpecDev/projects/SmartSpecPro`
- Worktree: `/mnt/SmartSpecDev/projects/SmartSpecPro`
- Latest recorded merged Main SHA: `63b3890d9369cfb01b45ca547c0213d6cc13591b`
- Outcome: `NOT_ACCEPTED`
- Active section: `section-03-proof-and-deployment`
- Next action: Speaker/person boxes now align to the natural image frame and can be redrawn, nudged, or resized; edits persist into the detection data used by video-prompt generation. Integrated at 63b3890d9369cfb01b45ca547c0213d6cc13591b. Esbuild syntax checks passed; tests and typecheck were not run. Deployment remains pending: env-validator returned deploy_ready=false in heuristic mode without an apps/web/.env-validator.json. Verify a target-aware manifest against legacy service configuration, rerun deploy preflight, then release this exact SHA to legacy-debian-dev.

## Sections

| Section | Stage | Owner/session | Worktree | Local checkpoint | Merged Main | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| section-01-canonical-worker-contract | checkpointed | — | — | 29bf37f576 | 895867ffd0b692f12198afc3fa3d8cfdc4be3a46 | Worker job contract, executor, and Node allowlist remain integrated. Queue cutover and recovery proof for the live Marketplace Auto Review run are recorded in sections 02 and 03. |
| section-02-auto-review-queue-cutover | checkpointed | — | — | 92f7bcd95486e7d36d8f3f27067237389e10b676 | 895867ffd0b692f12198afc3fa3d8cfdc4be3a46 | Queue cutover deployed in release smartspec-web-895867ffd0b692f12198afc3fa3d8cfdc4be3a46-1c303d8d92a8 (generation 446). Existing run mar_670133124534765cf0d36d3637b6ee89 has valid staged metadata and planReview.awaiting; no advance_run job was added after deployment. User can approve the story plan to continue; QC failure is optional and does not block it. |
| section-03-proof-and-deployment | checkpointed | codex-auto-review-video-budget-4096 | /mnt/SmartSpecDev/projects/SmartSpecPro | 63b3890d9369cfb01b45ca547c0213d6cc13591b | 63b3890d9369cfb01b45ca547c0213d6cc13591b | Speaker/person boxes now align to the natural image frame and can be redrawn, nudged, or resized; edits persist into the detection data used by video-prompt generation. Integrated at 63b3890d9369cfb01b45ca547c0213d6cc13591b. Esbuild syntax checks passed; tests and typecheck were not run. Deployment remains pending: env-validator returned deploy_ready=false in heuristic mode without an apps/web/.env-validator.json. Verify a target-aware manifest against legacy service configuration, rerun deploy preflight, then release this exact SHA to legacy-debian-dev. |

## Open gaps / blockers (not automatic merge blockers)

- Provider-backed QC/media generation and full authenticated browser UAT remain outstanding; the focused worker and UI tests passed.
- Focused suite baseline failures outside this patch: MarketplaceCaptureProductDetail.autoReviewPolling.test.ts places generated AI insights after product details; StagedCheckpointReviewSurface.test.tsx prompt-only/modal submission cases (3 tests). New navigation regression and staged picker/panel tests pass.
- Live provider-backed video output for the shot 2 dialogue turn lock remains unverified; focused prompt tests and deploy health do not prove generated lip movement.
- Authenticated browser UAT remains NOT_RUN. Real canonical-queue video-prompt generation is verified 3/3 rounds on generation574; video rendering, generated lip movement, and full QC/media UAT remain outside this prompt-only proof.
- Deployment preflight is blocked by env-validator: no target-aware apps/web/.env-validator.json; heuristic mode reports deploy_ready=false with 39 missing and 2 empty example variables. Current release: legacy-debian-dev / smartaihub.app generation 601 at revision 8797e4da; release controller status confirms the configured rollback source.

## Resume

1. Read this file and `deep_implement_config.json`.
2. Check current Git HEAD, actual commits, worktree ownership and PR merge status.
3. Recover any committed-but-unrecorded or merged-but-unrecorded work before replaying.
4. Continue the next incomplete step; do not reset dirty files or re-open merged PRs.
