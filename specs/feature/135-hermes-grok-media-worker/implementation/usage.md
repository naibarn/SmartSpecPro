# Feature 135 — Hermes Grok Media Worker: Usage Guide

Built 2026-07-16 across 13 commits (`d499ae00c` … `d11d0e01b`).
**Ships dark**: every flag defaults off, model rows seed disabled, the
systemd unit is written but not installed. Nothing below is live until an
admin follows the rollout in `apps/web/docs/HERMES_MEDIA_WORKER_OPS.md`.

## What it does

Lets users generate images/videos with their own **Grok subscription**
(SuperGrok / X Premium+) instead of platform credits, by driving the pinned
Hermes Agent CLI (`hermes-agent==0.18.2`) as a controlled worker process.
It appears as ordinary "Grok via Hermes" rows in the normal media model
picker — alongside gateway (kie.ai) and MCP models — and works from all 10
Vertical Drama generation surfaces plus Media Studio.

Two deployment modes:
- **Shared server worker** — `smartspec-hermes-worker.service`, its own
  cgroup, hosting many isolated Grok connection profiles (admin-provided
  pool accounts and/or users' personal accounts).
- **Private worker** — the Smart AI Hub Worker App (Tauri) gained a Hermes
  runtime module; the OAuth token never leaves the user's machine and only
  the owner's jobs route there.

## For users

1. Settings → AI Providers → **Grok via Hermes** → Connect.
2. Acknowledge the data-transfer notice (prompts + reference images go to
   xAI under the connected account; the shared-pool scope adds a
   pool-wide-sharing notice).
3. Sign in on the **official xAI page** the app opens (SmartSpecPro never
   sees the password), enter the device code, wait for authorization.
4. Pick a "Grok via Hermes" model anywhere models are picked, choose the
   connection, generate. Results land in the Library exactly like any other
   provider, with full lineage.

Generation cost is billed to the Grok subscription. A platform fee applies
only to `server_shared` pool jobs (admin-configured; personal/private are
free).

## For operators

Everything is in `apps/web/docs/HERMES_MEDIA_WORKER_OPS.md`:
- unit install + `scripts/pair-hermes-worker.ts` (prints the token once;
  writes `hermes_shared_worker_id`), rotation procedure;
- the 9-step flag-flip go-live order and the flags-only rollback;
- kill switches, quota semantics, audit-log queries by traceId;
- the web-health-under-load verification (thresholds + owner) and the
  phase-4 gate criteria before private-worker rollout.

Admin surfaces: **Settings → Grok via Hermes** is the only place that
mutates (connect shared, quota, disable). **AdminMonitoring → Hermes** is
read-only observability (connections per scope, quota consumption,
kill-switch state, fleet readiness + hermes version).

## Architecture (where to look)

| Layer | Path |
|---|---|
| Contracts, 22 error codes (TH/EN), capability math, masking | `apps/web/shared/hermesMedia.ts` |
| Connections (table + service + router) | `drizzle/schema.ts` (`hermes_provider_connections`), `server/services/hermesConnectionService.ts`, `server/routers/hermesConnections.ts` |
| OAuth control jobs + settlement sweep | `server/services/hermesConnectionJobs.ts`, `server/hermesWorker/connectionControlHandlers.ts`, `hermesCliParsers.ts` |
| Admission + scheduler (the single submit entry point) | `server/services/hermesMediaAdmission.ts`, `hermesMediaScheduler.ts` |
| Task projection, fee reconcile, finalize, reference URLs | `server/services/hermesMediaAdapter.ts`, `hermesMediaFinalizeService.ts`, `server/routes/workerRuntime.ts` |
| Shared worker process | `server/hermesWorker/*` + `docker/systemd/smartspec-hermes-worker.service` |
| Model catalog | `scripts/seed-media-models-hermes-grok.ts`, `server/services/mediaTransportResolver.ts` |
| VD surfaces | the four `verticalDrama*` routers + `server/services/hermesMediaReferences.ts` |
| Client | `client/src/components/media/HermesConnectionPicker.tsx`, `components/settings/HermesConnectPanel.tsx`, `lib/hermesErrorPresentation.ts` |
| Worker App (Rust) | `apps/worker-app/src-tauri/src/hermes_{runtime,executor}.rs` |
| Observability | `server/services/hermesMediaObservability.ts`, `client/src/components/admin/HermesWorkerAdminPanel.tsx` |

## Guardrails worth knowing before you change this

- **Fail closed everywhere.** No silent fallback between transports, models
  or connections; connection resolution is single-pass. The two VD
  silent-fallback bugs this feature removed (ad banner, `resolveEpisodeVideoModel`)
  are regression-tested.
- **Never spread `process.env`** into the Hermes child (TS and Rust both
  allow-list). The CLI runs user-influenceable prompts.
- **Tokens live only in per-connection Hermes profiles** on worker hosts;
  the DB stores metadata only; diagnostics mask to ≤4 chars; device codes
  exist only in the `hermes_device_code` event payload.
- **Contract refs carry `assetId + sha256`, never URLs** — presigned URLs
  are minted at claim time and re-mintable mid-job.
- **`hermesMedia*` namespace only** — an unrelated agent-gateway Hermes lane
  exists (`queueHermesWorkerJob`, `hermesAgentRuntime`); a guard test
  enforces the separation.
- Job `runtimeType` follows the assigned worker; "this is a Hermes job" is
  expressed by jobType + the required claim capability.

## Known follow-ups (tracked, not blocking)

- `task_bf5fa5be` — 6 tests red on main from a concurrent session's MCP
  auto-resolve change (removed the "MCP connection is required" guard) that
  rode along in commit `b85ccd818`.
- `task_8d22477a` — systemic: `routers/library.ts` trusts user-supplied
  folder ids (the hermes finalize path validates ownership locally).
- `task_f34c6e44` — drizzle-kit 0146/0147 snapshot collision forces
  hand-written migrations repo-wide.
- ModelSelectorDialog shows hermes rows badge-only (disabled-with-reason
  needs readiness threaded as props, not new hooks in the shared dialog).
- Ad banner has no model picker at all (not even for MCP).
- One connection picker can't disambiguate simultaneous image+video hermes
  models (mirrors the existing MCP limitation).
- Reference-to-video (≤7 refs), quota history dashboard, canary Hermes
  upgrades, `server_personal` group sharing — spec phase 5.

## Tests

~1,100 tests across the feature (vitest + 117 cargo). Notable guards:
namespace separation, token-leak scan over `server/hermesWorker/**`,
admission concurrency (12 parallel submits vs cap 8 → exactly 8; includes a
permanent mutation check that a non-atomic store fails it), e2e image+video
against a fake Hermes CLI on both the TS worker and the Rust worker.
