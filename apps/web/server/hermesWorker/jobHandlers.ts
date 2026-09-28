/**
 * Feature 135 — Hermes Grok media worker (section 07): job dispatch by
 * `jobType` — the two media job types (full generation flow) plus wiring
 * the three `hermes_connection_*` control job types to the section-04
 * handler cores (behavior owned/tested there — this module only wires
 * deps and dispatches).
 *
 * No `db` import — see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
} from "../../shared/workerRuntime";
import {
  formatHermesErrorMessage,
  hermesErrorCopy,
  hermesMediaJobContractSchema,
  type HermesMediaErrorCode,
  type HermesMediaOperation,
} from "../../shared/hermesMedia";
import {
  runHermesConnectionAuthorize,
  runHermesConnectionDisconnect,
  runHermesConnectionProbe,
  type ConnectionControlDeps,
  type HermesControlOutcome,
} from "./connectionControlHandlers";
import type { ProfileStrategy } from "./hermesInstallation";
import { buildArgv, buildHermesChildEnv, buildPromptEnvelope, runHermes, type HermesSpawnFn } from "./hermesInvocation";
import {
  collectOutputs,
  HermesOutputError,
  validateMediaFile,
  type FfprobeCheckResult,
} from "./outputCollector";
import type { WorkspaceManager } from "./workspace";
import {
  HermesControlPlaneError,
  type HermesArtifactCompleteResult,
  type HermesClaimedJob,
  type HermesControlPlaneClient,
} from "./controlPlaneClient";

// ────────────────────────────────────────────────────────────────────────
// Concurrency primitives
// ────────────────────────────────────────────────────────────────────────

class AsyncSemaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  get activeCount(): number {
    return this.active;
  }

  /** True once no job is active AND nothing is queued — safe to prune this
   *  semaphore from any owning map (FIX 8). */
  get isIdle(): boolean {
    return this.active === 0 && this.queue.length === 0;
  }

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

async function withBoundedRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let retried401 = false;
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (error instanceof HermesControlPlaneError && error.status === 401 && !retried401) {
        retried401 = true;
        continue;
      }
      if (attempt >= maxAttempts) break;
    }
  }
  throw lastError;
}

// ────────────────────────────────────────────────────────────────────────
// Timeouts (spec §13.6)
// ────────────────────────────────────────────────────────────────────────

// inactivityMs deliberately equals hardMs for media jobs: the Hermes agent
// prints NOTHING between plugin startup and the final result-marker line —
// the xAI image/video tool call is silent for its entire duration — so
// "no stdout for 5 minutes" is the NORMAL shape of a healthy long
// generation, not a hang signal. The 5-minute inactivity kill made every
// video generation longer than 300s fail with "hermes exited with code
// null" while the provider was still working (observed 2026-07-20 and
// 2026-08-02). The hard wall-clock budget is the real health bound here.
const IMAGE_TIMEOUTS = { softMs: 5 * 60_000, hardMs: 10 * 60_000, inactivityMs: 10 * 60_000 };
const VIDEO_TIMEOUTS = { softMs: 15 * 60_000, hardMs: 30 * 60_000, inactivityMs: 30 * 60_000 };

function isVideoOperation(operation: HermesMediaOperation): boolean {
  return operation.startsWith("video");
}

function timeoutsForOperation(operation: HermesMediaOperation) {
  return isVideoOperation(operation) ? VIDEO_TIMEOUTS : IMAGE_TIMEOUTS;
}

// ────────────────────────────────────────────────────────────────────────
// Prior-attempt retry guard (code review FIX 9)
// ────────────────────────────────────────────────────────────────────────

/**
 * Before skipping a fresh Hermes invocation because the output dir is
 * already non-empty (avoid double quota burn), every leftover file MUST be
 * validated (the SAME magic-byte/ffprobe checks `outputCollector` applies)
 * — a truncated/corrupt leftover from a killed prior attempt must never be
 * shipped as if it were a completed result.
 */
async function hasValidPriorOutput(
  outputDir: string,
  kind: "image" | "video",
  ffprobeImpl: ((filePath: string) => Promise<FfprobeCheckResult>) | undefined,
): Promise<boolean> {
  let entries: string[];
  try {
    entries = await fs.readdir(outputDir);
  } catch {
    return false;
  }
  if (entries.length === 0) return false;
  for (const entry of entries) {
    try {
      await validateMediaFile(path.join(outputDir, entry), kind, ffprobeImpl);
    } catch {
      return false;
    }
  }
  return true;
}

/** Removes every entry inside `dir` (never the directory itself) — best
 *  effort, never throws. Used to clear an invalid leftover before a fresh
 *  invocation so the subsequent workspace-scan collection signal never
 *  picks up stale/corrupt files alongside (or instead of) fresh output. */
async function clearDirectoryContents(dir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    entries.map((entry) => fs.rm(path.join(dir, entry), { recursive: true, force: true }).catch(() => {})),
  );
}

// ────────────────────────────────────────────────────────────────────────
// Deps
// ────────────────────────────────────────────────────────────────────────

export interface JobHandlersConfig {
  /** Global max concurrent Hermes children (default 2, env override at the
   *  main.ts call site). */
  globalMaxConcurrent?: number;
  invocationTemplate: "print_mode" | "chat_fallback";
  enableFileToolset: boolean;
  /** The shared root under which every connection's profile directory
   *  lives — passed to `collectOutputs` as the single forbidden root that
   *  covers ANY connection (not just the current job's). */
  profileRoot: string;
}

export interface JobHandlersDeps {
  client: HermesControlPlaneClient;
  strategy: ProfileStrategy;
  workspaceManager: WorkspaceManager;
  spawnImpl: HermesSpawnFn;
  fetchImpl?: typeof fetch;
  ffprobeImpl?: (filePath: string) => Promise<FfprobeCheckResult>;
  now?: () => Date;
  logger?: { info(msg: string): void; warn(msg: string): void; error(msg: string): void };
  controlHandlers?: {
    authorize: typeof runHermesConnectionAuthorize;
    probe: typeof runHermesConnectionProbe;
    disconnect: typeof runHermesConnectionDisconnect;
  };
  config: JobHandlersConfig;
}

export interface JobHandlers {
  handle(job: HermesClaimedJob): Promise<void>;
  activeCount(): number;
  /** IDs of every job currently inside `handle()` (queued-on-lock included).
   *  `main.ts` reports these in each heartbeat — the control plane renews
   *  job leases only when `currentJobCount > 0`, so a long-running
   *  device-code authorize (user takes minutes to approve) with an empty
   *  heartbeat would let its lease lapse and get re-claimed mid-flow,
   *  issuing a second, conflicting device code. */
  activeJobIds(): string[];
}

const NOOP_LOGGER = { info() {}, warn() {}, error() {} };

export function createJobHandlers(deps: JobHandlersDeps): JobHandlers {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? NOOP_LOGGER;
  const globalSemaphore = new AsyncSemaphore(deps.config.globalMaxConcurrent ?? 2);
  const connectionLocks = new Map<string, AsyncSemaphore>();
  const activeJobIds = new Set<string>();

  function lockFor(connectionId: string): AsyncSemaphore {
    let lock = connectionLocks.get(connectionId);
    if (!lock) {
      lock = new AsyncSemaphore(1);
      connectionLocks.set(connectionId, lock);
    }
    return lock;
  }

  async function handle(job: HermesClaimedJob): Promise<void> {
    activeJobIds.add(job.id);
    try {
      if (job.jobType === HERMES_MEDIA_IMAGE_JOB_TYPE || job.jobType === HERMES_MEDIA_VIDEO_JOB_TYPE) {
        await handleMediaJob(job);
        return;
      }
      if (
        job.jobType === HERMES_CONNECTION_AUTH_JOB_TYPE ||
        job.jobType === HERMES_CONNECTION_PROBE_JOB_TYPE ||
        job.jobType === HERMES_CONNECTION_DISCONNECT_JOB_TYPE
      ) {
        await handleControlJob(job);
        return;
      }
      logger.warn(`hermesWorker jobHandlers: no dispatch for job type ${job.jobType}`);
    } finally {
      activeJobIds.delete(job.id);
    }
  }

  async function handleMediaJob(job: HermesClaimedJob): Promise<void> {
    const connectionId = String(
      (job.capabilityRequirementsJson as Record<string, unknown> | undefined)?.connectionId ?? "",
    );
    // Acquire the PER-CONNECTION lock first, THEN the global semaphore — a
    // job merely waiting on its own connection's lock must never hold a
    // global concurrency slot hostage (that would starve a DIFFERENT
    // connection's job even though the global max hasn't really been
    // reached by actively-running work).
    const releaseConnection = await lockFor(connectionId).acquire();
    try {
      const releaseGlobal = await globalSemaphore.acquire();
      try {
        await runMediaJob(job, connectionId);
      } finally {
        releaseGlobal();
      }
    } finally {
      releaseConnection();
      // FIX 8: prune an idle connection lock so `connectionLocks` doesn't
      // grow unbounded across the worker's lifetime (one entry per
      // connection ID ever seen, otherwise). Safe: `isIdle` is checked
      // AFTER release, synchronously, with no `await` in between — any
      // waiter already queued for this exact connection already holds its
      // own reference to THIS semaphore object (from its own earlier
      // `lockFor(connectionId)` call) and is unaffected by the map delete;
      // a future job for the same connection just gets a fresh semaphore.
      const lock = connectionLocks.get(connectionId);
      if (lock?.isIdle) {
        connectionLocks.delete(connectionId);
      }
    }
  }

  async function runMediaJob(job: HermesClaimedJob, connectionId: string): Promise<void> {
    const contract = hermesMediaJobContractSchema.parse(job.inputJson);
    const workspace = await deps.workspaceManager.create(job.id);
    const leaseOwnerToken = job.leaseOwnerToken;
    const assignmentAttempt = job.assignmentAttempt ?? null;
    let sequenceNumber = 1;

    const postStage = async (stage: string, payloadJson: Record<string, unknown> = {}) => {
      await deps.client.postEvent(job.id, {
        eventType: stage,
        payloadJson,
        leaseOwnerToken,
        assignmentAttempt,
        sequenceNumber: sequenceNumber++,
      });
    };

    const reportFailure = async (code: HermesMediaErrorCode, detail?: string) => {
      await deps.client
        .postEvent(job.id, {
          eventType: "job.failed",
          payloadJson: { code, failureReason: formatHermesErrorMessage(code, detail) },
          leaseOwnerToken,
          assignmentAttempt,
          sequenceNumber: sequenceNumber++,
        })
        .catch((error) => logger.error(`hermesWorker: failed to post job.failed for ${job.id}: ${String(error)}`));
      await deps.workspaceManager.settleFailed(job.id).catch(() => {});
      // Defense-in-depth: a code whose global copy claims retryable===true
      // (e.g. reference-download transience) is STILL reported terminal
      // here — transient retries already happened inside this handler
      // (bounded download attempts) before this point was ever reached.
      void hermesErrorCopy(code);
    };

    try {
      await postStage("downloading_references");

      let referenceUrls = job.referenceUrls ?? [];
      const downloadedRefs: Array<{ index: number; role: string; label: string; assetId: string; localPath: string }> = [];
      // assetId -> minted public URL, captured during the download loop so the
      // envelope can hand the agent a URL the xAI server can actually fetch.
      const referenceUrlByAssetId = new Map<string, string>();

      for (const ref of contract.references) {
        let entry = referenceUrls.find((candidate) => candidate.assetId === ref.assetId);
        const isExpired = entry ? Date.parse(entry.expiresAt) < now().getTime() : true;
        if (!entry || isExpired) {
          referenceUrls = await deps.client.refreshReferenceUrls(job.id, { leaseOwnerToken, assignmentAttempt });
          entry = referenceUrls.find((candidate) => candidate.assetId === ref.assetId);
        }
        if (!entry) {
          await reportFailure("HERMES_REFERENCE_DOWNLOAD_FAILED", `missing reference URL for asset ${ref.assetId}`);
          return;
        }

        let bytes: Buffer | null = null;
        let lastError: unknown;
        for (let attempt = 0; attempt < 2 && !bytes; attempt += 1) {
          try {
            const response = await (deps.fetchImpl ?? fetch)(entry.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            bytes = Buffer.from(await response.arrayBuffer());
          } catch (error) {
            lastError = error;
          }
        }
        if (!bytes) {
          await reportFailure(
            "HERMES_REFERENCE_DOWNLOAD_FAILED",
            lastError instanceof Error ? lastError.message : String(lastError),
          );
          return;
        }

        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== ref.sha256) {
          await reportFailure("HERMES_REFERENCE_DOWNLOAD_FAILED", `checksum mismatch for reference ${ref.assetId}`);
          return;
        }

        const localPath = path.join(workspace.inputDir, `ref-${ref.index}.bin`);
        await fs.writeFile(localPath, bytes);

        try {
          // Pre-spawn format validation (spec §13.2) — reuses the SAME
          // validators `outputCollector` applies to outputs. A reference
          // that passes sha256 but fails magic-byte/dimension/size checks
          // is rejected HERE, before Hermes is ever spawned.
          await validateMediaFile(localPath, "image", deps.ffprobeImpl);
        } catch {
          // Code review FIX 7 — retryability decision: this is a PERMANENT
          // condition (the asset's bytes are corrupt/wrong-format; the
          // exact same bytes will fail identically on any retry), so it
          // must NOT use `HERMES_REFERENCE_DOWNLOAD_FAILED`
          // (`hermesErrorCopy(...).retryable === true`) — that would
          // incorrectly offer the end user a "try again" affordance for
          // something deterministically un-retryable. The frozen 22-code
          // list (`shared/hermesMedia.ts`) has no dedicated
          // "reference format invalid" code, and adding one is out of
          // scope for this section. `HERMES_OUTPUT_INVALID`
          // (non-retryable: "the output file is invalid or unusable") is
          // the closest existing fit — a reference IS a file being run
          // through the exact same magic-byte/dimension/ffprobe validators
          // outputs get; this is a deliberate, documented reuse, not an
          // output-collection failure.
          await reportFailure("HERMES_OUTPUT_INVALID", `reference ${ref.assetId} failed format validation`);
          return;
        }

        downloadedRefs.push({ index: ref.index, role: ref.role, label: ref.label, assetId: ref.assetId, localPath });
        referenceUrlByAssetId.set(ref.assetId, entry.url);
      }

      await postStage("starting_hermes");
      const profile = await deps.strategy.ensureProfile({ tenantId: job.tenantId, connectionId });

      const envelope = buildPromptEnvelope(
        {
          operation: contract.operation,
          prompt: contract.prompt,
          references: contract.references.map((ref) => ({
            index: ref.index,
            role: ref.role,
            label: ref.label,
            assetId: ref.assetId,
            url: referenceUrlByAssetId.get(ref.assetId),
          })),
          settings: {
            model: contract.settings.model ?? null,
            aspectRatio: contract.settings.aspectRatio ?? null,
            durationSeconds: contract.settings.durationSeconds ?? null,
            resolution: contract.settings.resolution ?? null,
          },
        },
        { jobId: job.id, outputDir: workspace.outputDir },
      );
      const argv = buildArgv({
        profile,
        operation: contract.operation,
        template: deps.config.invocationTemplate,
        enableFileToolset: deps.config.enableFileToolset,
        envelope,
      });

      await postStage("generating");

      // Before a generation retry, check the workspace for a completed
      // first attempt (avoid double quota burn) — a non-empty output dir
      // MIGHT mean an earlier run already produced valid files. Every
      // leftover file is VALIDATED (magic bytes / ffprobe — the same
      // checks `outputCollector` applies) before being trusted; a
      // truncated/corrupt leftover (e.g. from a killed prior attempt) must
      // never be shipped as if it were a completed result — fall through
      // to a fresh invocation instead.
      const priorOutputKind = isVideoOperation(contract.operation) ? "video" : "image";
      const priorOutputValid = await hasValidPriorOutput(workspace.outputDir, priorOutputKind, deps.ffprobeImpl);
      if (!priorOutputValid) {
        // A truncated/corrupt leftover must not linger for the SUBSEQUENT
        // workspace-scan collection signal to (wrongly) pick up alongside
        // (or instead of) whatever this fresh invocation actually produces.
        await clearDirectoryContents(workspace.outputDir);
      }
      const startedAt = now();
      const invocation =
        priorOutputValid
          ? { exitCode: 0, stdout: "", stderr: "", timedOut: false }
          : await runHermes({
              argv,
              cwd: workspace.root,
              // SECURITY: allow-listed env ONLY — never `{...process.env}`.
              // This process runs with `apps/web/.env` loaded (DATABASE_URL,
              // JWT_SECRET, LLM_ENCRYPTION_KEY, HERMES_WORKER_TOKEN); the
              // Hermes child executes attacker-influenceable prompts and
              // must never see any of that.
              env: buildHermesChildEnv(profile.env),
              timeouts: timeoutsForOperation(contract.operation),
              spawnImpl: deps.spawnImpl,
            });
      const endedAt = now();

      if (invocation.exitCode !== 0) {
        await reportFailure("HERMES_PROCESS_FAILED", `hermes exited with code ${invocation.exitCode}`);
        return;
      }

      await postStage("collecting_output");
      const cacheDirs = [path.join(profile.homeDir, "cache", "images"), path.join(profile.homeDir, "cache", "videos")];
      let collected;
      try {
        collected = await collectOutputs({
          invocation,
          workspace: { outputDir: workspace.outputDir, tmpDir: workspace.tmpDir },
          cacheDirs,
          forbiddenRoots: [deps.config.profileRoot],
          jobWindow: { startedAt, endedAt },
          expected: {
            kind: isVideoOperation(contract.operation) ? "video" : "image",
            count: contract.settings.outputCount ?? 1,
          },
          fetchImpl: deps.fetchImpl,
          ffprobeImpl: deps.ffprobeImpl,
        });
      } catch (error) {
        if (error instanceof HermesOutputError) {
          await reportFailure(error.code, error.message);
          return;
        }
        throw error;
      }

      await postStage("validating_output");
      // `collectOutputs` already performed type validation for every file
      // above — this stage event exists for observability/progress parity
      // with `instructionsJson.requiredProgressStages`.

      await postStage("uploading");
      const artifactType = isVideoOperation(contract.operation) ? "video" : "image";
      let lastArtifact: HermesArtifactCompleteResult | null = null;
      for (const output of collected) {
        const bytes = await fs.readFile(output.path);
        const checksum = createHash("sha256").update(bytes).digest("hex");
        const init = await withBoundedRetry(() =>
          deps.client.initArtifact(job.id, {
            artifactType,
            fileName: path.basename(output.path),
            contentType: output.contentType,
            sizeBytes: output.sizeBytes,
            checksumSha256: checksum,
            leaseOwnerToken,
            assignmentAttempt,
          }),
        );
        if (init.method === "presigned" && init.uploadUrl) {
          // FIX (code review): `fetch` does NOT throw on 4xx/5xx — the PUT
          // response must be checked explicitly, with the SAME bounded
          // retry `initArtifact`/`completeArtifact` get, or a failed
          // upload silently reports the job "completed" with zero bytes
          // actually stored.
          const uploadUrl = init.uploadUrl;
          try {
            await withBoundedRetry(async () => {
              const response = await (deps.fetchImpl ?? fetch)(uploadUrl, {
                method: "PUT",
                headers: { "content-type": output.contentType },
                body: bytes,
              });
              if (!response.ok) {
                throw new Error(`artifact PUT failed with HTTP ${response.status}`);
              }
              return response;
            });
          } catch (error) {
            await reportFailure("HERMES_UPLOAD_FAILED", error instanceof Error ? error.message : String(error));
            return;
          }
        }
        lastArtifact = await withBoundedRetry(() =>
          deps.client.completeArtifact(job.id, {
            artifactType,
            storageRef: init.storageRef,
            checksumSha256: checksum,
            sizeBytes: output.sizeBytes,
            contentType: output.contentType,
            leaseOwnerToken,
            assignmentAttempt,
          }),
        );
      }
      void lastArtifact;

      await deps.client.postEvent(job.id, {
        eventType: "job.completed",
        payloadJson: {},
        leaseOwnerToken,
        assignmentAttempt,
        sequenceNumber: sequenceNumber++,
      });
      await deps.workspaceManager.settleCompleted(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`hermesWorker: media job ${job.id} failed unexpectedly: ${message}`);
      await reportFailure("HERMES_PROCESS_FAILED", message);
    }
  }

  async function handleControlJob(job: HermesClaimedJob): Promise<void> {
    const capability = (job.capabilityRequirementsJson as Record<string, unknown> | undefined) ?? {};
    const input = (job.inputJson as Record<string, unknown> | undefined) ?? {};
    const connectionId = String(capability.connectionId ?? input.connectionId ?? "");
    const profileReference = String(input.profileReference ?? `conn_${connectionId}`);
    const timeoutSeconds = job.timeoutSeconds ?? 120;
    const leaseOwnerToken = job.leaseOwnerToken;
    const assignmentAttempt = job.assignmentAttempt ?? null;
    let sequenceNumber = 1;

    await deps.client.postEvent(job.id, {
      eventType: "job.running",
      payloadJson: { stage: "starting_hermes_control" },
      leaseOwnerToken,
      assignmentAttempt,
      sequenceNumber: sequenceNumber++,
    });

    // Pre-fetch the profile handle so the control-job spawn gets the SAME
    // per-connection `HERMES_HOME` isolation env media jobs get (idempotent
    // — `profileOps.ensureProfile` below still calls `ensureProfile` again
    // with the section-04-supplied `profileReference`, which is a cheap
    // no-op `mkdir -p`).
    const profile = await deps.strategy.ensureProfile({ tenantId: job.tenantId, connectionId });

    const controlDeps: ConnectionControlDeps = {
      spawnHermes: async (args, opts) => {
        const result = await runHermes({
          argv: args,
          cwd: process.cwd(),
          // SECURITY: allow-listed env ONLY — see the media-job invocation
          // site's comment above for the rationale.
          env: buildHermesChildEnv(profile.env),
          timeouts: { hardMs: opts.timeoutMs, inactivityMs: opts.timeoutMs },
          onStdoutLine: opts.onStdoutLine,
          spawnImpl: deps.spawnImpl,
        });
        return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
      },
      postEvent: async (eventType, payload) => {
        await deps.client.postEvent(job.id, {
          eventType,
          payloadJson: payload,
          leaseOwnerToken,
          assignmentAttempt,
          sequenceNumber: sequenceNumber++,
        });
      },
      profileOps: {
        ensureProfile: async (ref) => {
          await deps.strategy.ensureProfile({ tenantId: job.tenantId, connectionId: ref });
        },
        removeProfile: async (ref) => {
          await deps.strategy.removeProfile({ tenantId: job.tenantId, connectionId: ref });
        },
      },
      logger: { info: logger.info.bind(logger), warn: logger.warn.bind(logger) },
    };

    const handlers = deps.controlHandlers ?? {
      authorize: runHermesConnectionAuthorize,
      probe: runHermesConnectionProbe,
      disconnect: runHermesConnectionDisconnect,
    };

    let outcome: HermesControlOutcome;
    if (job.jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) {
      outcome = await handlers.authorize({ connectionId, profileReference, timeoutSeconds }, controlDeps);
    } else if (job.jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) {
      outcome = await handlers.probe({ connectionId, profileReference, timeoutSeconds }, controlDeps);
    } else {
      outcome = await handlers.disconnect({ connectionId, profileReference, timeoutSeconds }, controlDeps);
    }

    await deps.client.postEvent(job.id, {
      eventType: outcome.ok ? "job.completed" : "job.failed",
      payloadJson: outcome.ok
        ? { accountHint: outcome.accountHint, capabilities: outcome.manifest }
        : { failureReason: outcome.failureReason, diagnostic: outcome.diagnostic },
      leaseOwnerToken,
      assignmentAttempt,
      sequenceNumber: sequenceNumber++,
    });
  }

  return {
    handle,
    activeCount: () => globalSemaphore.activeCount,
    activeJobIds: () => Array.from(activeJobIds),
  };
}
