<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-contracts
section-02-db-schema
section-03-connection-service-router
section-04-connection-control-jobs
section-05-admission-scheduler
section-06-task-projection-credits
section-07-shared-worker
section-08-model-catalog-transport
section-09-vd-surface-integration
section-10-client-web
section-11-worker-app
section-12-observability-hardening
END_MANIFEST -->

# Implementation Sections Index — Feature 135 Hermes Grok Media Worker

Plan: `../claude-plan.md` (§ references below) + `../claude-plan-tdd.md`.
All apps/web tests run from `apps/web` (`pnpm --dir apps/web test`);
section-11 additionally uses `cargo test` in `apps/worker-app/src-tauri`.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-contracts | - | all | Yes |
| section-02-db-schema | 01 | 03 | Yes (with 08) |
| section-08-model-catalog-transport | 01 | 09, 10 | Yes (with 02) |
| section-03-connection-service-router | 01, 02 | 04, 05, 10 | No |
| section-04-connection-control-jobs | 03 | 07, 10, 11 | Yes (with 05) |
| section-05-admission-scheduler | 01, 02, 03 | 06, 07, 09, 11 | Yes (with 04) |
| section-06-task-projection-credits | 01, 04, 05 | 07, 09 | No |
| section-07-shared-worker | 01, 04, 05, 06 | 12 | Yes (with 09) |
| section-09-vd-surface-integration | 05, 06, 08 | 10, 12 | Yes (with 07) |
| section-10-client-web | 03, 04, 08, 09 | - | Yes (with 11) |
| section-11-worker-app | 04, 05, 06 | - | Yes (with 10) |
| section-12-observability-hardening | 07, 09 | - | No |

## Execution Order

1. section-01-shared-contracts
2. section-02-db-schema, section-08-model-catalog-transport (parallel)
3. section-03-connection-service-router
4. section-04-connection-control-jobs, section-05-admission-scheduler (parallel)
5. section-06-task-projection-credits
6. section-07-shared-worker, section-09-vd-surface-integration (parallel)
7. section-10-client-web, section-11-worker-app (parallel)
8. section-12-observability-hardening

Phase-gate note: sections 09 and 10 each define TWO landable increments
(A = image / phase 2, B = video / phase 3 — see each file's "Landing
order" note). Implement and merge increment A of both before starting
increment B, so the spec §18 phase gates hold.

## Section Summaries

### section-01-shared-contracts
Plan §3. `shared/hermesMedia.ts` (job contract zod, capability manifest
type, 22 error codes with Thai/English copy, effectiveHermesCapability),
new constants in `shared/workerRuntime.ts` (2 media + 3 control job types,
claim capability, capability families), `shared/mediaModelTransport.ts`
transport union + hermes branch, `shared/featureFlags.ts` tenant flag
`hermesMediaWorker`, `server/services/hermesWorkerSettings.ts` (TTL-cached
system_settings keys incl. `hermes_shared_worker_id`,
`hermes_worker_min_version`, fee, limits) + systemSettings updateSetting
cache-clear hooks. Namespace-guard test vs the agent-gateway Hermes lane.

### section-02-db-schema
Plan §4. `hermes_provider_connections` pgTable (camelCase, scope/status
enums, partial-unique default indexes, no secret columns) + types +
immediate migration (`pnpm db:push`, journal verified).

### section-03-connection-service-router
Plan §5. `hermesConnectionService.ts` (list/startConnect/getConnectStatus/
setDefault/disconnect/probe/admin*, shared-worker discovery via
`hermes_shared_worker_id`, consent gate, ownership/tenant enforcement) +
`routers/hermesConnections.ts` (incl. getAvailability) registered in
routers.ts.

### section-04-connection-control-jobs
Plan §6. `hermesConnectionJobs.ts`: enqueue + settlement for the three
control job types; device-code event contract (`hermes_device_code`
payload, never logged); connection-row side effects (authorized /
reauth_required / entitlement_restricted); 60s terminal-state sweep
bootstrap in `_core/index.ts`; the fake `hermes` CLI test fixture (shared
by sections 07/11 tests); stdout parsers (device code, auth status,
capability probe → manifest).

### section-05-admission-scheduler
Plan §7. `hermesMediaAdmission.ts` (Redis limits incl. limit-coherence
invariant), `hermesMediaScheduler.ts` (`queueHermesMediaJob`: flags →
single-pass connection resolution → admission → shared-pool-only fee
reserve → contract parse → non-terminal-only idempotency →
runtimeType-follows-worker insert → `hermes_<jobId>` taskId), claim gating
edits in `workerRegistryService.claimWorkerJob` (required claim capability
+ connection affinity, remotion precedent).

### section-06-task-projection-credits
Plan §8–9. `hermesMediaAdapter.ts` (MediaTask projection from worker fabric
tables, ownership check, cancel), `hermes_` branch in
`mediaGenerationService.getTask`, `reconcileTaskCredits` fee-only hermes
branch, `hermesMediaFinalizeService.ts` (artifact re-validation →
media_assets + library_items + publishedItemId + lineage → completed),
claim-time reference URL minting + `POST
/api/worker-jobs/:jobId/references/urls` in `routes/workerRuntime.ts`,
terminal-state fee/status glue.

### section-07-shared-worker
Plan §10. `server/hermesWorker/` process (controlPlaneClient,
hermesInstallation + ProfileStrategy with isolation probe,
hermesInvocation — `-z`, no `file` toolset, fallback template,
outputCollector 4-signal, jobHandlers with per-connection lock, workspace
retention, main loop), systemd unit `smartspec-hermes-worker.service`,
`scripts/pair-hermes-worker.ts`, dev-only in-web drainer, fake-CLI e2e
smoke.

### section-08-model-catalog-transport
Plan §12. `scripts/seed-media-models-hermes-grok.ts` (3 rows, distinct
display names, disabled by default), `mediaTransportResolver.ts` hermes
branch + hermesConnectionId validation rule.

### section-09-vd-surface-integration
Plan §11. Generalize the two VD transport helpers to
`resolveVdMediaTransportDecision` (MCP/gateway byte-identical), wire all
10 surfaces (characters ×3, locations, episodes ×5, ad banner), the two
fail-closed remediations (`resolveEpisodeVideoModel`, ad banner),
media.ts generateImageAsync/generateVideoAsync three-way branch,
formatter `grok` family registration, reference trimming via effective
capability.

### section-10-client-web
Plan §13. `HermesConnectionPicker.tsx`, `HermesConnectPanel.tsx` (consent,
device-code UI, private-worker selector, admin sub-panel), model picker
badge/disabled-reason integration, VD panel wiring (storage keys, prop
threading through EpisodeWorkspace/EpisodePage, hydration guard), error
copy rendering.

### section-11-worker-app
Plan §14. Rust: `hermes_executor.rs`, runtime pack install command +
doctor, dispatch arm + claim hints + affinity re-check, registration
capability advertisement; server-side min-version enforcement in
`workerRegistryService`; `scripts/build-hermes-runtime-pack.ts`; React
status/device-code/update-required UI. Windows first; macOS pack follows.

### section-12-observability-hardening
Plan §15 + §17. Audit events end-to-end, provider_usage_log writes + daily
quota counters, admin fleet/connection panels, RenderJobsPage labels,
token-leak CI grep test, load assertion of admission control, docs
(run-services.sh status listing, unit install).
