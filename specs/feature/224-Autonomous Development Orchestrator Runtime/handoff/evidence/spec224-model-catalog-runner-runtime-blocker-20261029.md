# SPEC-224 Model Catalog Runtime Blocker — 2026-10-29

Observed against canonical source `0a31f67009fc9d9e443a8eefe0d7084c1df30e00` on 2026-10-29.

## Result

The catalog contract and Task Control UI are working as designed. The first missing boundary is the registered Linux Runner binary: it sends a fresh, applied capability snapshot with Codex readiness, but its Codex tool inventory has no `modelCatalog` field. The authorized workspace API therefore returns `modelCatalog: null`, and Task Control correctly disables Harness, Model, Reasoning Effort, and Development Start. No entitlement or freshness validation was weakened.

The live `smartspec_dev` record at `2026-10-29T00:19:25.690Z` identifies Runner `runner-f1328901deec1b147d200a818e12e4be` in tenant `tenant-001`, status `online`, fresh snapshot expiry, Codex CLI `0.165.0`, and `taskProbeState=passed`. The snapshot was acknowledged as `applied` at `2026-10-29T00:17:21.071Z`. The `codex.v1` tool entry exists, but its catalog state and account-provider fingerprint are absent.

Installed `/home/dev/.local/bin/smartaihub-runner` reports `0.2.51-spec224-probe-retry-20261028a`, has no embedded source SHA, and was last modified 2026-10-28 19:05 +07. The source commit adding account-scoped Codex catalog discovery, `5af4ab6496f87f74a09b39bb007134c9d6022e5a`, was committed at 19:41 +07 that day. The installed binary predates that source change. Current server/API source contains the authorized workspace catalog projection.

## Verification

- `pnpm --filter @smartspec/web exec vitest run --project client-jsdom client/src/components/chat/Spec224WorkspacePanel.test.tsx --maxWorkers=2` — 24/24 passed.
- `pnpm --filter @smartspec/web exec vitest run server/services/__tests__/runnerContracts.test.ts server/services/__tests__/spec224ModelSelection.test.ts server/routers/__tests__/spec226DevelopmentControl.test.ts --maxWorkers=2` — 50/50 passed.
- `CARGO_BUILD_JOBS=2 cargo test --manifest-path apps/runner-app/Cargo.toml live_codex_app_server_catalog_is_account_scoped_and_unverified -- --ignored --nocapture` — 1/1 live discovery test passed using the current authenticated Codex CLI; it discovered 8 real models and emitted catalog revision `catalog:sha256:e2b94bd4d4ee8e6411bf0e2b3ecd664f212bd6ed15bd2c919e86d517646c3ab4`.
- Persisted Task Control network evidence records `spec226DevelopmentControl.availableWorkspaces` HTTP 200. It returned the authorized read model; the missing catalog is in the Runner snapshot, not a failed tRPC catalog delivery.
- An earlier attempted test invocation accidentally selected the full Vitest workspace and was stopped; its unrelated failures/EPIPE are not counted as catalog test results.

## Independent runtime errors

The development web service is active and backs the development tunnel. Its current Runner Release settings have neither a configured GitHub repository nor a GitHub token in the service environment or `desktop_release` settings. `listLatestDesktopRunnerDownloads()` maps that missing configuration to `runner_release_github_not_configured` / HTTP 503. This endpoint serves desktop release review and is not called by `availableWorkspaces` or the model-catalog projection.

Archived Task Control network evidence shows `voiceAgents.listEnabled` returning HTTP 403 in some runs, while `spec226DevelopmentControl.availableWorkspaces` returned HTTP 200. The generic console report did not preserve a request correlation ID; the observed 403 is a separate voice-agent permission query, not the catalog request.

## Required next action

The signed Linux `local_device` Runner update channel has no current catalog-capable asset in the Dev release catalog. Use the existing authenticated Runner Releases control to configure its GitHub repository/token, build `linux` + `local_device` from `main` with `required-secret` signing, import and publish the signed update to the development catalog, and request the update for the existing Runner. Do not replace/re-enroll the Runner or install an unsigned local build.

After the Runner reports a fresh applied snapshot containing an account-bound catalog (`revision`, `observedAt`, `expiresAt`, and `accountProviderFingerprint`), verify the authorized Task Control workspace query and Playwright selection of Codex, an actually discovered model, and only that model's supported reasoning efforts. Then continue the existing SPEC-224 pilot. This evidence does not establish live model selection or Child 1/2 execution, and SPEC-224 remains incomplete.
