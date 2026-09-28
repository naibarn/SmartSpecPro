#!/usr/bin/env node
/**
 * Feature 135 — Hermes Grok media worker (section 07): process entry point.
 *
 * Runs as its own systemd unit (`docker/systemd/smartspec-hermes-worker.service`)
 * — NEVER part of `smartspec-web.service` (spec §8.1 non-negotiable process
 * rule). Speaks the worker control plane purely over HTTP
 * (`controlPlaneClient.ts`) — this file (and everything under
 * `server/hermesWorker/`) imports only `shared/`, its sibling modules, and
 * the HTTP client. NO `db` import anywhere in this directory — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 *
 * All runtime configuration comes from environment variables (provisioned
 * via the unit's `EnvironmentFile=/etc/smartspec/hermes-worker.env`,
 * written by an operator after running `scripts/pair-hermes-worker.ts`):
 *
 *   HERMES_WORKER_TOKEN       refresh token minted at pairing time (required)
 *   HERMES_WORKER_ID          worker id minted at pairing time (required)
 *   HERMES_WORKER_BASE_URL    control-plane base URL (default http://localhost:3000)
 *   HERMES_HOME_ROOT          profile root (default /var/lib/smartspec-hermes-worker/profiles)
 *   HERMES_WORKSPACE_ROOT     job workspace root (default /var/lib/smartspec-hermes-worker/jobs)
 *   HERMES_BINARY_PATH        pinned CLI binary path (default "hermes")
 *   HERMES_EXPECTED_VERSION   doctor-gate version substring (default "0.18.2")
 *   HERMES_MAX_CONCURRENT_JOBS  global child cap (default 2)
 *   HERMES_ENABLE_FILE_TOOLSET  "true" to widen the default toolset (default off)
 *   HERMES_MIN_FREE_DISK_BYTES  claim refusal threshold (default 2GiB)
 */
import { spawn } from "node:child_process";

import { HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY } from "../../shared/workerRuntime";
import { debugError, debugLog } from "../_core/logger";
import { createControlPlaneClient } from "./controlPlaneClient";
import { provisionHermes, type HermesProbeSpawnResult } from "./hermesInstallation";
import { buildHermesChildEnv, runHermes, type HermesChildProcessLike, type HermesSpawnFn } from "./hermesInvocation";
import { hermesFfprobe } from "./ffprobeRunner";
import { createJobHandlers } from "./jobHandlers";
import { persistHermesRefreshToken, readHermesRefreshToken } from "./refreshTokenStore";
import { createWorkspaceManager } from "./workspace";

const LOG_CATEGORY = "hermesWorker";

const POLL_INTERVAL_MS = 3_000;
const DEFAULT_MIN_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024;

function readEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : fallback;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required to start the Hermes shared worker`);
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createNodeSpawnImpl(hermesBinaryPath: string): HermesSpawnFn {
  return (argv, opts) => spawn(hermesBinaryPath, argv, { cwd: opts.cwd, env: opts.env }) as unknown as HermesChildProcessLike;
}

async function spawnForProbe(
  spawnImpl: HermesSpawnFn,
  args: string[],
  opts: { env?: Record<string, string>; timeoutMs: number },
): Promise<HermesProbeSpawnResult> {
  const result = await runHermes({
    argv: args,
    cwd: process.cwd(),
    // SECURITY: allow-listed env ONLY — this process has `apps/web/.env`
    // loaded (DATABASE_URL, JWT_SECRET, LLM_ENCRYPTION_KEY,
    // HERMES_WORKER_TOKEN); provisioning probes must never see any of it.
    env: buildHermesChildEnv(opts.env),
    timeouts: { hardMs: opts.timeoutMs, inactivityMs: opts.timeoutMs },
    spawnImpl,
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

export async function runHermesSharedWorker(): Promise<void> {
  const baseUrl = readEnv("HERMES_WORKER_BASE_URL", "http://localhost:3000");
  const workerId = requireEnv("HERMES_WORKER_ID");
  const bootstrapRefreshToken = requireEnv("HERMES_WORKER_TOKEN");
  const refreshTokenFile = readEnv(
    "HERMES_WORKER_TOKEN_FILE",
    "/var/lib/smartspec-hermes-worker/state/refresh-token",
  );
  const refreshToken = await readHermesRefreshToken(refreshTokenFile, bootstrapRefreshToken);
  const hermesHomeRoot = readEnv("HERMES_HOME_ROOT", "/var/lib/smartspec-hermes-worker/profiles");
  const workspaceRoot = readEnv("HERMES_WORKSPACE_ROOT", "/var/lib/smartspec-hermes-worker/jobs");
  const hermesBinaryPath = readEnv("HERMES_BINARY_PATH", "hermes");
  const expectedVersion = readEnv("HERMES_EXPECTED_VERSION", "0.18.2");
  const maxConcurrent = Number.parseInt(readEnv("HERMES_MAX_CONCURRENT_JOBS", "2"), 10) || 2;
  const enableFileToolset = process.env.HERMES_ENABLE_FILE_TOOLSET === "true";
  const minFreeDiskBytes = Number.parseInt(
    readEnv("HERMES_MIN_FREE_DISK_BYTES", String(DEFAULT_MIN_FREE_DISK_BYTES)),
    10,
  ) || DEFAULT_MIN_FREE_DISK_BYTES;

  const spawnImpl = createNodeSpawnImpl(hermesBinaryPath);
  const provisioned = await provisionHermes(
    { hermesHomeRoot, expectedVersion },
    { spawnHermes: (args, opts) => spawnForProbe(spawnImpl, args, opts) },
  );

  debugLog(
    LOG_CATEGORY,
    `provisioned hermes ${provisioned.version} (doctorOk=${provisioned.doctorOk}, strategy=${provisioned.strategy.kind}, template=${provisioned.invocationTemplate})`,
  );

  // Structured logger wired into `jobHandlers` — without this, its internal
  // `logger.info/warn/error` silently no-op through the module's
  // NOOP_LOGGER default, leaving zero trace of job-level failures.
  const logger = {
    info: (msg: string) => debugLog(LOG_CATEGORY, msg),
    warn: (msg: string) => debugLog(LOG_CATEGORY, `WARN: ${msg}`),
    error: (msg: string) => debugError(LOG_CATEGORY, msg),
  };

  const client = createControlPlaneClient({
    baseUrl,
    workerId,
    refreshToken,
    persistRefreshToken: (nextRefreshToken) =>
      persistHermesRefreshToken(refreshTokenFile, nextRefreshToken),
  });
  const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
  const handlers = createJobHandlers({
    client,
    strategy: provisioned.strategy,
    workspaceManager,
    spawnImpl,
    // MUST be wired: `outputCollector`'s default prober fails closed, so
    // omitting this rejects EVERY video output as "failed ffprobe video
    // validation" no matter how valid the file is (bug found 2026-08-02).
    ffprobeImpl: (filePath) => hermesFfprobe(filePath),
    logger,
    config: {
      globalMaxConcurrent: maxConcurrent,
      invocationTemplate: provisioned.invocationTemplate,
      enableFileToolset,
      profileRoot: hermesHomeRoot,
    },
  });

  // Capability observability (FIX 4 — see `controlPlaneClient.heartbeat`'s
  // doc comment): the admission-time doctor/min-version gate reads
  // `capabilitiesJson.hermesMedia`, which is set ONLY at `register()` time
  // (a privileged, DB-backed action `main.ts` cannot perform — it has no
  // `db` import and must never hold the registration JWT signing secret).
  // `pair-hermes-worker.ts` now runs the SAME `provisionHermes` doctor gate
  // locally before registering, so the advertised capability reflects
  // reality at pairing time; operators re-run it after upgrading the
  // pinned Hermes CLI. This heartbeat field is best-effort visibility only.
  const runtimeMetadataJson = {
    hermesMedia: {
      hermesVersion: provisioned.version,
      doctorOk: provisioned.doctorOk,
      advertised: provisioned.doctorOk,
      capability: "hermes-media-generation",
      reason: provisioned.doctorOk ? null : "hermes doctor gate did not pass",
      strategy: provisioned.strategy.kind,
      invocationTemplate: provisioned.invocationTemplate,
    },
  };

  let draining = false;
  const drain = () => {
    draining = true;
    debugLog(LOG_CATEGORY, "SIGTERM received — draining (active jobs finish, no new claims)");
  };
  process.on("SIGTERM", drain);
  process.on("SIGINT", drain);

  while (!draining) {
    try {
      const freeDiskBytes = await workspaceManager.freeDiskBytes();
      // Real active job IDs, never a hardcoded [] — the control plane only
      // renews this worker's job leases when the heartbeat reports
      // `currentJobCount > 0`. An empty report during a long device-code
      // authorize let the lease lapse at DEFAULT_LEASE_TTL_MS and the job
      // get re-claimed mid-flow with a second, conflicting device code.
      const activeJobIds = handlers.activeJobIds();
      await client.heartbeat({ freeDiskBytes, activeJobIds, runtimeMetadataJson }).catch((error) => {
        debugError(LOG_CATEGORY, "heartbeat failed", error);
      });

      if (freeDiskBytes < minFreeDiskBytes) {
        debugLog(LOG_CATEGORY, `refusing to claim — free disk ${freeDiskBytes} below threshold ${minFreeDiskBytes}`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      // Claim backpressure (FIX 6): never out-claim the global concurrency
      // cap — a job merely queued here (not yet started) would otherwise
      // let its lease expire before `handlers.handle()` even begins,
      // duplicating work and wasting Grok quota.
      if (handlers.activeCount() >= maxConcurrent) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const claimResult = await client.claim({ capabilityHints: [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY] });
      if (claimResult.job) {
        const claimedJobId = claimResult.job.id;
        void handlers.handle(claimResult.job).catch((error) => {
          debugError(LOG_CATEGORY, `job ${claimedJobId} handling failed`, error);
        });
      } else {
        await sleep(POLL_INTERVAL_MS);
      }

      await workspaceManager.sweep().catch(() => {});
    } catch (error) {
      debugError(LOG_CATEGORY, "loop error", error);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  runHermesSharedWorker().catch((error) => {
    debugError(LOG_CATEGORY, "fatal", error);
    process.exit(1);
  });
}
