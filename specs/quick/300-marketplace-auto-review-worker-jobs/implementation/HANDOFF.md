# Deep Implement — Live HandOff

Generated from `deep_implement_config.json`. Read this at any time;
on resume, reconcile recorded SHA values with Git/PR state.

- State generation: `99`
- Updated (UTC): `2026-11-19T14:58:12.899185+00:00`
- Sections source: `/mnt/SmartSpecDev/projects/SmartSpecPro/specs/quick/300-marketplace-auto-review-worker-jobs/sections`
- Target checkout: `/mnt/SmartSpecDev/projects/SmartSpecPro`
- Worktree: `/mnt/SmartSpecDev/projects/SmartSpecPro`
- Latest recorded merged Main SHA: `ba3d1bac3cfe5d8f302cac5487df26f7ee34158b`
- Outcome: `NOT_ACCEPTED`
- Active section: `section-03-proof-and-deployment`
- Next action: Create a fresh video-prompt generation request for the failed run mar_71ac0520464e4d1b607b34404964851b (terminal worker job 2c1d8b1d-0035-4b75-b26a-ab48594b2853 cannot be retried in place), then verify the new job completes. Release 602 is deployed to legacy-debian-dev / smartaihub.app at source SHA ba3d1bac3cfe5d8f302cac5487df26f7ee34158b, artifact sha256:ea419bff201dec1f42e49e8169ff321c406caec1a4ccf8ec6a31452bdabf5d0e; receipt /mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-ba3d1bac3cfe5d8f302cac5487df26f7ee34158b-46699e6068c8-602.json. Dialogue fallback applies only when the full cast has one eligible lead; keep explicit speaker labels for multi-speaker dialogue.

## Sections

| Section | Stage | Owner/session | Worktree | Local checkpoint | Merged Main | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| section-01-canonical-worker-contract | checkpointed | — | — | 29bf37f576 | 895867ffd0b692f12198afc3fa3d8cfdc4be3a46 | Worker job contract, executor, and Node allowlist remain integrated. Queue cutover and recovery proof for the live Marketplace Auto Review run are recorded in sections 02 and 03. |
| section-02-auto-review-queue-cutover | checkpointed | — | — | 92f7bcd95486e7d36d8f3f27067237389e10b676 | 895867ffd0b692f12198afc3fa3d8cfdc4be3a46 | Queue cutover deployed in release smartspec-web-895867ffd0b692f12198afc3fa3d8cfdc4be3a46-1c303d8d92a8 (generation 446). Existing run mar_670133124534765cf0d36d3637b6ee89 has valid staged metadata and planReview.awaiting; no advance_run job was added after deployment. User can approve the story plan to continue; QC failure is optional and does not block it. |
| section-03-proof-and-deployment | checkpointed | codex-auto-review-shot2-prompt-conflict | /mnt/SmartSpecDev/projects/SmartSpecPro | ba3d1bac3cfe5d8f302cac5487df26f7ee34158b | ba3d1bac3cfe5d8f302cac5487df26f7ee34158b | Create a fresh video-prompt generation request for the failed run mar_71ac0520464e4d1b607b34404964851b (terminal worker job 2c1d8b1d-0035-4b75-b26a-ab48594b2853 cannot be retried in place), then verify the new job completes. Release 602 is deployed to legacy-debian-dev / smartaihub.app at source SHA ba3d1bac3cfe5d8f302cac5487df26f7ee34158b, artifact sha256:ea419bff201dec1f42e49e8169ff321c406caec1a4ccf8ec6a31452bdabf5d0e; receipt /mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/development-deployments/smartspec-web-ba3d1bac3cfe5d8f302cac5487df26f7ee34158b-46699e6068c8-602.json. Dialogue fallback applies only when the full cast has one eligible lead; keep explicit speaker labels for multi-speaker dialogue. |

## Open gaps / blockers (not automatic merge blockers)

- Provider-backed QC/media generation and full authenticated browser UAT remain outstanding; the focused worker and UI tests passed.
- Focused suite baseline failures outside this patch: MarketplaceCaptureProductDetail.autoReviewPolling.test.ts places generated AI insights after product details; StagedCheckpointReviewSurface.test.tsx prompt-only/modal submission cases (3 tests). New navigation regression and staged picker/panel tests pass.
- Live provider-backed video output for the shot 2 dialogue turn lock remains unverified; focused prompt tests and deploy health do not prove generated lip movement.
- Authenticated browser UAT remains NOT_RUN. Real canonical-queue video-prompt generation is verified 3/3 rounds on generation574; video rendering, generated lip movement, and full QC/media UAT remain outside this prompt-only proof.
- Shot 2 provider rejection and generated-video success have not been re-verified after the prompt-authoring fix; the existing approved prompt must be regenerated on the updated release.
- Existing affected runs mar_6dc357649f7121a97ab6e1f27bf0aae0 and mar_d865bac6f4e1e518d648e479e61b744b retain zero image prompts and legacy generic correction markers; after deployment, regenerate only their missing per-shot prompts.
- Post-deployment provider verification is pending: generate a fresh job for run mar_71ac0520464e4d1b607b34404964851b and confirm success; the pre-deployment failed job 2c1d8b1d-0035-4b75-b26a-ab48594b2853 remains terminal.

## Resume

1. Read this file and `deep_implement_config.json`.
2. Check current Git HEAD, actual commits, worktree ownership and PR merge status.
3. Recover any committed-but-unrecorded or merged-but-unrecorded work before replaying.
4. Continue the next incomplete step; do not reset dirty files or re-open merged PRs.
