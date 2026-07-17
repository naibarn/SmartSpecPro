# Interview: Feature 135 Hermes Grok Media Worker

Date: 2026-07-16
Rounds: 1 (spec.md v1.4 already resolved most decisions through 4 review passes; only open business/priority questions were asked)

## Q1 — Platform fee policy (V1)

**Q:** Should V1 charge platform credits per Hermes job? (Generation cost is already paid by the connected Grok subscription — this is about our platform fee.)

**A: เก็บ fee เฉพาะ shared pool** — charge a small platform fee ONLY for jobs running on `server_shared` (admin-provided pool) connections. `server_personal` and `private_worker` jobs are free (0 credits).

**Implication:** the fee reserve/reconcile path (workerBillingService) is exercised in V1 for shared-pool jobs; fee amount is an admin setting; scope-conditional fee logic must be tested. Spec §14's "optional fee, default 0" becomes: default fee applies to server_shared only; other scopes hard-default 0.

## Q2 — Primary connection scopes on the shared server worker

**Q:** Which Grok account types will the shared server worker host as the primary use case? (multi-select; selected ones get validated first in production)

**A: ทั้งสองแบบ** — BOTH `server_personal` (each user's own Grok account hosted on the server worker) AND `server_shared` (admin-provided central accounts shared by everyone).

**Implication:** neither scope can be deferred; Phase 1-2 must deliver connect flows + admission control for both. The `hermes_worker_server_personal_enabled` flag still exists but both scopes are launch-blocking.

## Q3 — Shared worker deployment target

**Q:** Where does the shared Hermes worker deploy?

**A: Server production เดิม** — same production host, as the separate systemd unit `smartspec-hermes-worker.service` with MemoryMax/CPUQuota resource limits (no new infrastructure).

**Implication:** unit file lives in `docker/systemd/`, managed like the other smartspec units; RAM budget must be sized against the host's existing allocation (web MemoryHigh=1280M precedent); Hermes child concurrency default stays low (2).

## Q4 — Worker App platform order

**Q:** Platform order for the private Hermes module in Smart AI Hub Worker App?

**A: Windows ก่อน แล้วค่อย macOS** — Windows first (matching feature 124's HyperFrames pattern), macOS follows within the same feature.

## Auto-Decisions (technical — decided from research, not asked)

- **Hermes pin:** `hermes-agent==0.18.2` (PyPI), Python 3.11 via uv-managed venv inside the worker's installation dir. Never `hermes update` in production. (claude-research.md B1/B6)
- **Profile isolation:** native Hermes profiles (`hermes profile create conn_<id>`, per-run `-p conn_<id>`) under an isolated `HERMES_HOME` root per worker — both mechanisms verified in CLI docs; env-only isolation is the fallback. (B3)
- **Non-interactive invocation:** `hermes -z` (script-pure stdout) preferred over `chat -q`; args via argv array; `--ignore-user-config` for determinism. (B3)
- **Output collection trust order:** SMARTSPECPRO_RESULT marker block → workspace ./output scan → `MEDIA:<url>` tag parse → `$HERMES_HOME/cache/{images,videos}` scan. (B4)
- **Naming:** all new symbols use `hermesMedia*` / `hermes_media_*` to avoid collision with the existing agent-gateway lane (`queueHermesWorkerJob`, `hermesAgentRuntime` flag). (A-warning)
- **Enqueue/billing template:** `queueDesktopVideoAssemblyJob` (billed variant) for shared-pool jobs; `queueVerticalDramaFfmpegAssemblyJob` (free variant) shape for personal/private. (A1)
- **Task projection:** mirror `mcpMediaAdapter` (`MediaTask` with `resultUrl` singular, `hermes_` taskId prefix, memory map + DB row, stale reconciler bootstrap). (A4)
- **Schema/router/picker:** copy `userMcpConnections` (incl. partial-unique default indexes), `mcpConnections` router shape, `McpConnectionPicker` props/value format. (A3)
- **Flags:** tenant flag `hermesMediaWorker` in shared/featureFlags.ts + global admin toggles in system_settings via renderWorkerSettings.ts pattern. (A8)
- **Seeding:** new `scripts/seed-media-models-hermes-grok.ts` upsert preserving isEnabled; configJson `transport:"hermes_worker"`. (A9)
- **Tests:** vitest with injected-repo pattern (no DB) for scheduler/adapter; fake in-memory worker_jobs table for the worker tick; Rust in-file #[cfg(test)]. (A7)
