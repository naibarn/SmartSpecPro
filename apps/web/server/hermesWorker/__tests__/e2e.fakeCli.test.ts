/**
 * Feature 135 — Hermes Grok media worker (section 07): delivery-gate
 * fake-CLI end-to-end smoke (TDD §16). Exercises the REAL `hermesInvocation`
 * spawn adapter against the shared fake `hermes` CLI fixture (a real child
 * process — the fixture, never the real Hermes binary) plus the REAL
 * `jobHandlers`/`outputCollector`/`workspace` modules, with an in-memory
 * fake control-plane client standing in for the HTTP server. No real
 * network, DB, or Hermes — CI-safe.
 *
 * Two scenarios (spec §20 delivery criteria): (a) image generation, (b)
 * video generation (stubbed `ffprobe`) — "video generation completes via a
 * shared server worker".
 */
import fs from "node:fs/promises";
import syncFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE } from "../../../shared/workerRuntime";
import { FAKE_HERMES_CLI_PATH, buildFakeHermesEnv, type FakeHermesScenario } from "./fixtures/fakeHermesCli/scenario";
import { createNativeProfileStrategy } from "../hermesInstallation";
import type { HermesChildProcessLike, HermesSpawnFn } from "../hermesInvocation";
import { createJobHandlers } from "../jobHandlers";
import { createWorkspaceManager } from "../workspace";
import type { HermesArtifactCompleteResult, HermesClaimedJob, HermesControlPlaneClient } from "../controlPlaneClient";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const MP4_BYTES = Buffer.from("fake mp4 container bytes for the e2e smoke");

/** Wraps a `HermesSpawnFn` so every invocation goes through the fixture's
 *  `generate` branch (the real production argv uses `-z`, which the
 *  fixture treats as an unrecognized-flag defensive-parsing case by
 *  design — see the fixture's own doc comment — so the harness routes to
 *  `generate` explicitly rather than editing the shared fixture file).
 *
 * Also stages the "Hermes-produced" output file into the workspace's
 * `output/` dir synchronously BEFORE spawning — real Hermes would have
 * written it as part of running; the dependency-free fixture only
 * announces the marker referencing it via stdout. Staging happens at
 * SPAWN time (not before `handlers.handle()` is even called), so
 * `jobHandlers`'s prior-attempt short-circuit never skips the real
 * fake-CLI subprocess invocation this smoke exists to exercise. */
function createFakeCliSpawnImpl(
  scenarioEnv: NodeJS.ProcessEnv,
  stageOutput: (cwd: string) => void,
): HermesSpawnFn {
  return (argv, opts) => {
    stageOutput(opts.cwd);
    const child = spawn(process.execPath, [FAKE_HERMES_CLI_PATH, "generate", ...argv], {
      cwd: opts.cwd,
      env: { ...opts.env, ...scenarioEnv },
    });
    return child as unknown as HermesChildProcessLike;
  };
}

/** Minimal in-memory control plane + task-projection stand-in — models
 *  claim -> progress events -> artifact init/complete -> (stubbed)
 *  finalize -> task reaches "completed", without any real HTTP/DB. */
function createFakeControlPlane(job: HermesClaimedJob) {
  const events: Array<{ eventType: string; payloadJson: Record<string, unknown> }> = [];
  const artifacts: HermesArtifactCompleteResult["artifact"][] = [];
  let taskStatus: "pending" | "processing" | "completed" | "failed" = "pending";

  const client: HermesControlPlaneClient = {
    register: async () => {
      throw new Error("not exercised by this smoke");
    },
    heartbeat: async () => {},
    claim: async () => ({ job, queueDepth: 0 }),
    postEvent: async (_jobId, event) => {
      events.push({ eventType: event.eventType, payloadJson: event.payloadJson ?? {} });
      if (event.eventType === "generating") taskStatus = "processing";
      return { accepted: true, replayed: false, job: {} };
    },
    initArtifact: async (_jobId, payload) => ({
      key: `artifacts/${payload.fileName}`,
      method: "presigned",
      storageRef: `storage://${payload.fileName}`,
      uploadUrl: "https://upload.test/put",
    }),
    completeArtifact: async (_jobId, payload) => {
      const artifact = { storageRef: payload.storageRef, checksumSha256: payload.checksumSha256, sizeBytes: payload.sizeBytes };
      artifacts.push(artifact);
      // Stubbed finalize: the server's `finalizeHermesMediaArtifact` (section
      // 06, out of scope here) re-validates + registers a library row and
      // flips the task to "completed" — this stub models only the
      // observable end-state this smoke owns: the projected task reaching
      // "completed" once a checksummed artifact has been recorded.
      taskStatus = "completed";
      return { created: true, artifact };
    },
    refreshReferenceUrls: async () => [],
  };

  return {
    client,
    events,
    artifacts,
    getTaskStatus: () => taskStatus,
  };
}

async function mkRoots() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-e2e-ws-"));
  const profileRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-e2e-profile-"));
  return { workspaceRoot, profileRoot };
}

function baseJob(jobType: string, id: string, operation: string): HermesClaimedJob {
  return {
    id,
    jobType,
    tenantId: "tenant-1",
    inputJson: {
      contractVersion: 1,
      operation,
      connectionId: "conn-e2e",
      prompt: "a cat wearing a hat",
      settings: { model: "grok-imagine", outputCount: 1 },
      references: [],
      traceId: "trace-e2e",
    },
    instructionsJson: {
      requiredProgressStages: [
        "downloading_references",
        "starting_hermes",
        "generating",
        "collecting_output",
        "validating_output",
        "uploading",
      ],
    },
    capabilityRequirementsJson: { connectionId: "conn-e2e" },
    retryPolicyJson: { maxAttempts: 2 },
    timeoutSeconds: 600,
    leaseOwnerToken: "lease-e2e",
    leaseExpiresAt: null,
    assignmentAttempt: "attempt-e2e",
    referenceUrls: [],
  };
}

describe("Hermes shared worker — fake-CLI e2e smoke", () => {
  let workspaceRoot: string;
  let profileRoot: string;

  beforeEach(async () => {
    ({ workspaceRoot, profileRoot } = await mkRoots());
  });
  afterEach(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
    await fs.rm(profileRoot, { recursive: true, force: true });
  });

  it("completes an IMAGE generation job end to end via the fake CLI", async () => {
    const job = baseJob(HERMES_MEDIA_IMAGE_JOB_TYPE, "job-e2e-image", "image.generate");

    const scenario: FakeHermesScenario = {
      generate: { markerBlock: 'SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["result.png"]} SMARTSPECPRO_RESULT_END' },
    };
    const fakeEnv = buildFakeHermesEnv(scenario);

    const { client, events, artifacts, getTaskStatus } = createFakeControlPlane(job);
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createFakeCliSpawnImpl(fakeEnv.env, (cwd) => {
        const outputDir = path.join(cwd, "output");
        syncFs.mkdirSync(outputDir, { recursive: true });
        syncFs.writeFileSync(path.join(outputDir, "result.png"), PNG_BYTES);
      }),
      fetchImpl: (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch,
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    try {
      const claimed = await client.claim({});
      expect(claimed.job).not.toBeNull();
      await handlers.handle(claimed.job!);

      const stageNames = events.map((event) => event.eventType);
      expect(stageNames).toEqual([
        "downloading_references",
        "starting_hermes",
        "generating",
        "collecting_output",
        "validating_output",
        "uploading",
        "job.completed",
      ]);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].checksumSha256).toBe(
        (await import("node:crypto")).createHash("sha256").update(PNG_BYTES).digest("hex"),
      );
      expect(getTaskStatus()).toBe("completed");
    } finally {
      fakeEnv.cleanup();
    }
  });

  it("completes a VIDEO generation job end to end via the fake CLI (stubbed ffprobe)", async () => {
    const job = baseJob(HERMES_MEDIA_VIDEO_JOB_TYPE, "job-e2e-video", "video.generate");

    const scenario: FakeHermesScenario = {
      generate: { markerBlock: 'SMARTSPECPRO_RESULT_BEGIN {"status":"ok","files":["clip.mp4"]} SMARTSPECPRO_RESULT_END' },
    };
    const fakeEnv = buildFakeHermesEnv(scenario);

    const { client, events, artifacts, getTaskStatus } = createFakeControlPlane(job);
    const strategy = createNativeProfileStrategy({ root: profileRoot });
    const workspaceManager = createWorkspaceManager({ root: workspaceRoot });
    const handlers = createJobHandlers({
      client,
      strategy,
      workspaceManager,
      spawnImpl: createFakeCliSpawnImpl(fakeEnv.env, (cwd) => {
        const outputDir = path.join(cwd, "output");
        syncFs.mkdirSync(outputDir, { recursive: true });
        syncFs.writeFileSync(path.join(outputDir, "clip.mp4"), MP4_BYTES);
      }),
      fetchImpl: (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch,
      ffprobeImpl: async () => ({ ok: true, hasVideoStream: true, hasAudioStream: false, durationSec: 3.5 }),
      config: { globalMaxConcurrent: 2, invocationTemplate: "print_mode", enableFileToolset: false, profileRoot },
    });

    try {
      const claimed = await client.claim({});
      expect(claimed.job).not.toBeNull();
      await handlers.handle(claimed.job!);

      const stageNames = events.map((event) => event.eventType);
      expect(stageNames).toEqual([
        "downloading_references",
        "starting_hermes",
        "generating",
        "collecting_output",
        "validating_output",
        "uploading",
        "job.completed",
      ]);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].checksumSha256).toBe(
        (await import("node:crypto")).createHash("sha256").update(MP4_BYTES).digest("hex"),
      );
      expect(getTaskStatus()).toBe("completed");
    } finally {
      fakeEnv.cleanup();
    }
  });
});
