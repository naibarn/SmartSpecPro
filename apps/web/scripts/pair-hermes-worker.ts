#!/usr/bin/env node
/**
 * Feature 135 — Hermes Grok media worker (section 07): one-time admin
 * pairing script.
 *
 * Drives the existing worker registration-token pairing flow (the same
 * `createWorkerRegistrationToken` -> `POST /api/workers/register` exchange
 * `server/routers/users.ts`'s `createWorkerAccessKey` procedure and the
 * browser `Worker Connect` flow both already use) to pair the shared server
 * Hermes worker:
 *
 *   1. Mints a short-lived registration token for the given tenant.
 *   2. Calls `POST /api/workers/register` (via `controlPlaneClient.register`)
 *      and obtains the worker id + a token set (`executionToken`,
 *      `uploadToken`, `refreshToken`).
 *   3. Prints the credentials ONCE — never written to the repo, the
 *      database, or `system_settings`. The operator copies them into
 *      `/etc/smartspec/hermes-worker.env` as `HERMES_WORKER_ID` and
 *      `HERMES_WORKER_TOKEN` (the `refreshToken` — the long-lived, 7-day
 *      credential `controlPlaneClient.ts` exchanges for short-lived
 *      execution/upload tokens at runtime).
 *   4. Writes the paired worker id into `system_settings` key
 *      `hermes_shared_worker_id` (category `infrastructure`) — the
 *      discovery key `startConnect` (section-03) and the scheduler
 *      (section-05) read; NEVER guessed from `runtimeType`.
 *
 * Rotation = re-run this script + swap `/etc/smartspec/hermes-worker.env` +
 * `sudo systemctl restart smartspec-hermes-worker.service` (old token
 * revoked server-side per the CLAUDE.md service-file rule — this script
 * never restarts anything itself).
 *
 * Capability advertisement (code review FIX 4): the server's admission-time
 * doctor/min-version gate reads `capabilitiesJson.hermesMedia`, which is
 * set ONLY at `/api/workers/register` time (`recordWorkerHeartbeat` merges
 * heartbeat metadata into a SEPARATE `capabilitiesJson.runtimeMetadata` key
 * instead — see `controlPlaneClient.ts`'s `heartbeat()` doc comment). The
 * shared worker process (`main.ts`) cannot re-register itself (no `db`
 * import, and it must never hold the registration-JWT signing secret —
 * see the root CLAUDE.md secret-exposure rules), so THIS script — which
 * already has full DB/JWT access as a privileged admin action — runs the
 * SAME local doctor gate (`provisionHermes`) the worker itself runs before
 * registering, so the advertised capability reflects the REAL pinned CLI
 * state at pairing time. Re-run this script after upgrading the pinned
 * `hermes-agent` version so the advertised capability stays accurate.
 *
 * Run with:
 *   npx tsx scripts/pair-hermes-worker.ts --tenant-id <id> [--base-url http://localhost:3000] \
 *     [--display-name "Shared Hermes Worker"] [--machine-id ...] [--machine-name ...]
 */
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import { createControlPlaneClient, type HermesRegisterInput } from "../server/hermesWorker/controlPlaneClient";
import { provisionHermes } from "../server/hermesWorker/hermesInstallation";
import { buildHermesChildEnv, runHermes, type HermesChildProcessLike } from "../server/hermesWorker/hermesInvocation";

export interface PairHermesWorkerArgs {
  tenantId: string;
  displayName: string;
  baseUrl: string;
  machineId?: string;
  machineName?: string;
  envFile?: string;
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

export function parsePairHermesWorkerArgs(argv: string[]): PairHermesWorkerArgs {
  const tenantId = readFlag(argv, "--tenant-id");
  if (!tenantId) {
    throw new Error("pair-hermes-worker: --tenant-id is required");
  }
  // Do not name this flag `--env-file`: Node 20+ reserves that option and
  // consumes it before tsx can pass it to this script.
  const envFile = readFlag(argv, "--credential-file");
  return {
    tenantId,
    displayName: readFlag(argv, "--display-name") ?? "Shared Hermes Worker",
    baseUrl: readFlag(argv, "--base-url") ?? "http://localhost:3000",
    machineId: readFlag(argv, "--machine-id"),
    machineName: readFlag(argv, "--machine-name"),
    ...(envFile ? { envFile } : {}),
  };
}

export interface PairHermesWorkerRegisterResult {
  workerId: string;
  tokens: { executionToken: string; uploadToken: string; refreshToken: string };
}

export interface PairHermesWorkerDoctorResult {
  doctorOk: boolean;
  hermesVersion: string;
  reason?: string;
}

export interface PairHermesWorkerDeps {
  /** Mints a short-lived (30m) worker REGISTRATION token for the tenant —
   *  wraps `server/services/workerAuthService.ts`'s `createWorkerRegistrationToken`. */
  mintRegistrationToken(args: PairHermesWorkerArgs): Promise<string> | string;
  /** Runs the SAME local doctor gate (`provisionHermes`) the worker itself
   *  runs — see the file-top comment (code review FIX 4). Real
   *  `doctorOk`/`hermesVersion` flow into the registration payload so the
   *  server's admission-time gate reflects reality. */
  runDoctorProbe(args: PairHermesWorkerArgs): Promise<PairHermesWorkerDoctorResult>;
  /** Performs the actual `POST /api/workers/register` exchange. */
  registerWorker(params: {
    baseUrl: string;
    registrationToken: string;
    payload: HermesRegisterInput;
  }): Promise<PairHermesWorkerRegisterResult>;
  /** Writes `system_settings` key `hermes_shared_worker_id` (category
   *  `infrastructure`) — the ONLY thing this script persists. */
  writeSharedWorkerIdSetting(workerId: string): Promise<void>;
  /** Writes the worker refresh credential to an operator-selected protected
   *  environment file. Used by automated pairing so secrets never cross
   *  stdout/stderr. */
  writeWorkerEnvFile(params: {
    envFile: string;
    workerId: string;
    refreshToken: string;
  }): Promise<void>;
  print(line: string): void;
}

function assertSingleLineSecret(name: string, value: string): void {
  if (!value || /[\r\n]/.test(value)) {
    throw new Error(`pair-hermes-worker: invalid ${name}`);
  }
}

function buildDefaultDeps(): PairHermesWorkerDeps {
  return {
    async mintRegistrationToken(args) {
      // Lazy `await import(...)` — this script must not pull in
      // `workerAuthService.ts` (and transitively the DB) unless actually
      // invoked with real deps (mirrors the lazy-import convention used by
      // `systemSettings.ts`'s admin toggle hooks).
      const { createWorkerRegistrationToken } = await import("../server/services/workerAuthService");
      const { getWorkerAccessPermissionScopesForPreset } = await import("../shared/workerAccessKeys");
      return createWorkerRegistrationToken(
        {
          tenantId: args.tenantId,
          runtimeType: "hermes_agent_gateway",
          externalReference: `hermes://${args.machineId ?? "shared"}/${Date.now()}`,
          permissionPreset: "operator_basic",
          permissionScopes: getWorkerAccessPermissionScopesForPreset("operator_basic"),
        },
        "30m",
      );
    },
    async runDoctorProbe(args) {
      const hermesBinaryPath = process.env.HERMES_BINARY_PATH || "hermes";
      const hermesHomeRoot = process.env.HERMES_HOME_ROOT || "/var/lib/smartspec-hermes-worker/profiles";
      const expectedVersion = process.env.HERMES_EXPECTED_VERSION || "0.18.2";
      const spawnImpl = (argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) =>
        spawn(hermesBinaryPath, argv, { cwd: opts.cwd, env: opts.env }) as unknown as HermesChildProcessLike;
      try {
        const provisioned = await provisionHermes(
          { hermesHomeRoot, expectedVersion },
          {
            spawnHermes: async (probeArgs, probeOpts) => {
              const result = await runHermes({
                argv: probeArgs,
                cwd: process.cwd(),
                env: buildHermesChildEnv(probeOpts.env),
                timeouts: { hardMs: probeOpts.timeoutMs, inactivityMs: probeOpts.timeoutMs },
                spawnImpl,
              });
              return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
            },
          },
        );
        return { doctorOk: provisioned.doctorOk, hermesVersion: provisioned.version };
      } catch (error) {
        void args;
        return {
          doctorOk: false,
          hermesVersion: "unknown",
          reason: `local doctor probe failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    async registerWorker({ baseUrl, registrationToken, payload }) {
      const client = createControlPlaneClient({ baseUrl, workerId: "pending-registration", refreshToken: "unused-before-registration" });
      const result = await client.register({ bearerToken: registrationToken, payload });
      return { workerId: result.workerId, tokens: result.tokens };
    },
    async writeSharedWorkerIdSetting(workerId) {
      const { getDb } = await import("../server/db");
      const { systemSettings } = await import("../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = getDb();
      const existing = await db
        .select()
        .from(systemSettings)
        .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, "hermes_shared_worker_id")))
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(systemSettings)
          .set({ value: workerId, updatedAt: new Date() })
          .where(eq(systemSettings.id, existing[0].id));
      } else {
        await db.insert(systemSettings).values({
          category: "infrastructure",
          key: "hermes_shared_worker_id",
          value: workerId,
          isSensitive: false,
          description: "Feature 135 — worker id of the paired shared Hermes worker (written by scripts/pair-hermes-worker.ts)",
        });
      }
    },
    async writeWorkerEnvFile({ envFile, workerId, refreshToken }) {
      assertSingleLineSecret("worker id", workerId);
      assertSingleLineSecret("refresh token", refreshToken);
      const hermesBinaryPath =
        process.env.HERMES_BINARY_PATH
        || "/var/lib/smartspec-hermes-worker/hermes/bin/hermes";
      const refreshTokenFile =
        process.env.HERMES_WORKER_TOKEN_FILE
        || "/var/lib/smartspec-hermes-worker/state/refresh-token";
      assertSingleLineSecret("Hermes binary path", hermesBinaryPath);
      assertSingleLineSecret("Hermes refresh token file", refreshTokenFile);

      const handle = await open(envFile, "w", 0o600);
      try {
        await handle.chmod(0o600);
        await handle.writeFile(
          [
            `HERMES_WORKER_ID=${workerId}`,
            `HERMES_WORKER_TOKEN=${refreshToken}`,
            `HERMES_BINARY_PATH=${hermesBinaryPath}`,
            `HERMES_WORKER_TOKEN_FILE=${refreshTokenFile}`,
            "",
          ].join("\n"),
          { encoding: "utf8" },
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    print(line) {
      console.log(line);
    },
  };
}

export async function runPairHermesWorker(
  argv: string[],
  overrides: Partial<PairHermesWorkerDeps> = {},
): Promise<{ workerId: string }> {
  const args = parsePairHermesWorkerArgs(argv);
  const deps: PairHermesWorkerDeps = { ...buildDefaultDeps(), ...overrides };

  const registrationToken = await deps.mintRegistrationToken(args);
  const doctor = await deps.runDoctorProbe(args);
  deps.print(`Local doctor probe: hermesVersion=${doctor.hermesVersion} doctorOk=${doctor.doctorOk}${doctor.reason ? ` (${doctor.reason})` : ""}`);

  const result = await deps.registerWorker({
    baseUrl: args.baseUrl,
    registrationToken,
    payload: {
      displayName: args.displayName,
      externalReference: `hermes://${args.machineId ?? "shared"}/${args.tenantId}`,
      runtimeVersion: "0.1.0",
      machineId: args.machineId ?? null,
      machineName: args.machineName ?? null,
      maxConcurrentJobs: 2,
      // Real values from the local doctor gate (code review FIX 4) — NOT
      // hardcoded. Re-run this script after upgrading the pinned Hermes CLI
      // so the server's admission-time gate reflects reality.
      doctorOk: doctor.doctorOk,
      hermesVersion: doctor.hermesVersion,
      hermesReason: doctor.reason,
    },
  });

  deps.print(`Paired Hermes worker id: ${result.workerId}`);
  if (args.envFile) {
    await deps.writeWorkerEnvFile({
      envFile: args.envFile,
      workerId: result.workerId,
      refreshToken: result.tokens.refreshToken,
    });
    deps.print(`Credentials written securely to ${args.envFile}; token output suppressed.`);
  } else {
    deps.print("Place the following into /etc/smartspec/hermes-worker.env (root-owned, mode 0600):");
    deps.print(`HERMES_WORKER_ID=${result.workerId}`);
    deps.print(`HERMES_WORKER_TOKEN=${result.tokens.refreshToken}`);
    deps.print("This is the ONLY time these values are printed — they are never written to the repo, the database, or system_settings.");
  }

  await deps.writeSharedWorkerIdSetting(result.workerId);
  deps.print(`Wrote system_settings.hermes_shared_worker_id = ${result.workerId}`);

  return { workerId: result.workerId };
}

const isMainModule = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  runPairHermesWorker(process.argv.slice(2)).catch((error) => {
    console.error("[pair-hermes-worker] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
