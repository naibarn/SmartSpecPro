# Section 11 — GitHub Release Sync and Admin Build Control

## Goal

Make the manual Runner workflow produce a real optional GitHub Release and
provide an admin-only SmartAIHub control path that dispatches, monitors and
syncs the release into the catalog from Section 10. GitHub details remain an
admin configuration concern and never become a normal-user download contract.

## Ownership and files

- `.github/workflows/runner-release.yml`
- `scripts/verify-runner-release-workflow.mjs`
- `apps/web/shared/runnerReleaseBuilds.ts`
- `apps/web/server/services/runnerReleaseBuildService.ts`
- `apps/web/server/routes/runnerReleases.ts`
- `apps/web/server/services/desktopReleaseSettings.ts`
- `apps/web/client/src/features/desktop-releases/DesktopReleaseConfigPanel.tsx`
- `apps/web/client/src/features/desktop-releases/RunnerReleaseAdminPanel.tsx`
- focused service/route/component tests for build dispatch and sync

## Workflow contract

Keep `workflow_dispatch` as the only trigger. Add explicit inputs for
`release_notes` and a publish/release decision. Keep the four native targets,
produce a package and raw executable for each, and emit unique manifest and
checksum filenames so a publish job can upload all assets without collisions.
The API and workflow MUST reject `publish=true` with `unsigned-review`; only
`required-secret` signing may enter the public release/sync path.
The publish job may use the GitHub-hosted `gh` CLI and `GITHUB_TOKEN` only when
the manual `publish` input is true; it must not deploy Cloudflare.

Use the selected checkout commit, not the workflow default SHA, in every
manifest. The release tag is `runner-v<version>`. The container job emits a
versioned manifest with an explicit image digest field and remains a handoff to
Feature 204.

## Server build/sync contract

Add typed request/status/history schemas, including a persisted `publish`
decision on each build. The admin route dispatches the
configured Runner workflow using the existing encrypted GitHub settings,
stores a durable build context in the dedicated Runner release build table,
polls the workflow run and, after a successful published run, resolves the
`runner-v<version>` release through the GitHub API server-side.

Sync must download each expected package/raw/checksum/container-manifest asset, recompute and
validate SHA-256, verify signature metadata when required, persist the asset
through Section 10 and mark portal sync complete only after the requested
platform set is complete. Retry release-not-ready and transient download
failures with the existing bounded reconciler pattern; never retry permanent
validation or authorization failures indefinitely.

Add a separate admin workflow-name setting defaulting to
`runner-release.yml`, while reusing the existing repository/ref/token storage
and redaction rules. Normal catalog/latest/download responses never include
this configuration.

## TDD steps

1. Extend the workflow static test to require raw update assets, release notes,
   `runner-v` tagging, publish-only release creation and no Cloudflare deploy.
2. Add service tests for dispatch input mapping, selected commit metadata,
   release asset selection, transient sync retry, hash mismatch rejection and
   successful catalog persistence.
3. Implement workflow and build service with the existing GitHub API client
   conventions, storing durable status after each meaningful transition.
4. Add admin route tests for role checks, no-token failure, status/history and
   sync error redaction.
5. Add the admin Runner release panel and focused component tests for build,
   sync, publish and failed states.
6. Run workflow verification, focused server tests and the focused UI test.

## Acceptance

- Artifact-only manual runs never create a GitHub Release or enter the public catalog.
- Publish runs create exactly one `runner-v<version>` release with all selected
  assets and unique filenames.
- SmartAIHub can sync a published release without a browser contacting GitHub.
- A failed sync leaves the build visible as failed/retryable and never marks a
  partial release as public.
- Worker App release workflows remain byte/semantic unchanged.
