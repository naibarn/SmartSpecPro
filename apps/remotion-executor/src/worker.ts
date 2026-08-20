import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { credentials } from "./agent.js";
import { normalizedArchitecture, REMOTION_CAPABILITY_FAMILIES, REMOTION_RENDER_CLAIM_CAPABILITY, REMOTION_RENDER_CONTRACT_VERSION, runtimePackId, sidecarPath, workspaceRoot } from "./config.js";
import { uploadArtifact, workerRequest } from "./controlPlane.js";
import { ensureRuntimePack } from "./runtimeProvisioner.js";
import { discoverHermesInstallations } from "./hermesInstallDiscovery.js";
import { doctor, managedRuntimeNodePath, toExecutorReadiness } from "./doctor.js";

async function runtimeSource(): Promise<"existing_hermes_install" | "managed_runtime_pack"> {
  const explicitSidecar = process.env.SMARTAIHUB_REMOTION_SIDECAR?.trim();
  if (!explicitSidecar) return "managed_runtime_pack";
  const sidecar = path.resolve(explicitSidecar);
  const candidates = await discoverHermesInstallations();
  return candidates.some((candidate) => sidecar.startsWith(`${path.resolve(candidate.root)}${path.sep}`))
    ? "existing_hermes_install"
    : "managed_runtime_pack";
}

type Job = { id: string; inputJson: Record<string, unknown>; leaseOwnerToken: string; assignmentAttempt?: string };

async function freeDiskBytes(): Promise<number | null> {
  try {
    const stat = await fs.statfs(workspaceRoot());
    const bytes = Number(stat.bavail) * Number(stat.bsize);
    return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
}

async function render(job: Job): Promise<string> {
  const root = await fs.mkdtemp(path.join(workspaceRoot(), `${job.id}-`));
  const payloadPath = path.join(root, "payload.json");
  const outputDir = path.join(root, "output");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(payloadPath, JSON.stringify(job.inputJson), { mode: 0o600 });
  const rendererNode = process.env.SMARTAIHUB_REMOTION_SIDECAR?.trim()
    ? process.execPath
    : await managedRuntimeNodePath() ?? process.execPath;
  const child = spawn(rendererNode, [sidecarPath(), "render-video", "--payload", payloadPath, "--workspace", root, "--output-dir", outputDir], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise<number>((resolve) => child.on("close", (value) => resolve(value ?? 1)));
  if (code !== 0) throw new Error(`remotion_render_failed:${stderr.slice(-500)}`);
  const event = stdout.split(/\r?\n/).filter((line) => line.includes("SMARTAIHUB_EVENT")).map((line) => line.slice(line.indexOf("{")).trim()).map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } }).filter(Boolean).find((value) => value?.eventType === "completed");
  const outputPath = typeof event?.outputPath === "string"
    ? path.resolve(path.isAbsolute(event.outputPath) ? event.outputPath : outputDir, event.outputPath)
    : path.join(outputDir, "render.mp4");
  const outputRoot = `${path.resolve(outputDir)}${path.sep}`;
  if (!outputPath.startsWith(outputRoot)) throw new Error("remotion_output_path_outside_workspace");
  await fs.access(outputPath);
  return outputPath;
}

export async function runWorker(): Promise<void> {
  await ensureRuntimePack();
  const readiness = await doctor();
  if (readiness.status !== "ready") throw new Error("executor_doctor_blocked");
  let auth = await credentials();
  const source = await runtimeSource();
  const heartbeat = async () => workerRequest(`/api/workers/${auth.workerId}/heartbeat`, auth.accessToken, {
    compatibility: { protocolVersion: "2026-04-06", runtimeFamilySchemaVersion: "2026-04-08", runtimeProfileSchemaVersion: "2026-04-08", runtimeVersion: "remotion-executor-0.1.0" },
    runtimeType: "remotion_executor", status: "online", currentJobCount: 0, queueDepth: 0, freeDiskBytes: await freeDiskBytes(), metricsJson: {}, warningsJson: [],
    runtimeMetadataJson: {
      executorVersion: "remotion-executor-0.1.0",
      packId: runtimePackId(),
      packVersion: "remotion-executor-0.1.0",
      runtimeSource: source,
      hostPlatform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
      runtimePlatform: process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux",
      architecture: normalizedArchitecture(),
      installationMode: process.platform === "win32" ? "windows_native" : process.platform === "darwin" ? "macos_native" : "linux_native",
      platformContractVersion: REMOTION_RENDER_CONTRACT_VERSION,
      rendererPolicyVersion: "remotion-1",
      maxConcurrency: 1,
      manifestChecksum: null,
      executorCapabilityProfileJson: {
        capabilityFamilies: [...REMOTION_CAPABILITY_FAMILIES],
        claimCapability: REMOTION_RENDER_CLAIM_CAPABILITY,
        containers: ["mp4"],
        codecs: ["h264"],
        maxWidth: 16_384,
        maxHeight: 16_384,
        maxDurationInFrames: 2_000_000,
        maxConcurrency: 1,
        supportsChromiumRendering: true,
        supportsFfmpegProbe: true,
        supportsFfmpegPostPass: true,
        supportsFontMaterialization: true,
      },
      executorReadinessJson: toExecutorReadiness(await doctor()),
    },
  }, auth.device);
  await heartbeat();
  for (;;) {
    auth = await credentials();
    const claimed = await workerRequest<{ job?: Job; queueDepth?: number }>(`/api/workers/${auth.workerId}/jobs/claim`, auth.accessToken, { maxJobs: 1, capabilityHints: [...REMOTION_CAPABILITY_FAMILIES, REMOTION_RENDER_CLAIM_CAPABILITY] }, auth.device);
    if (!claimed.job) { await new Promise((resolve) => setTimeout(resolve, 3_000)); await heartbeat(); continue; }
    const job = claimed.job;
    try {
      const outputPath = await render(job);
      auth = await credentials();
      await workerRequest(`/api/worker-jobs/${job.id}/events`, auth.accessToken, { eventType: "job.progress", payloadJson: { stage: "upload_artifacts", message: "Uploading verified Remotion output" }, sequenceNumber: 1, leaseOwnerToken: job.leaseOwnerToken, assignmentAttempt: job.assignmentAttempt ?? null }, auth.device);
      await uploadArtifact({ jobId: job.id, token: auth.accessToken, uploadToken: auth.uploadToken, filePath: outputPath, leaseOwnerToken: job.leaseOwnerToken, assignmentAttempt: job.assignmentAttempt ?? "1", device: auth.device });
      await workerRequest(`/api/worker-jobs/${job.id}/events`, auth.accessToken, { eventType: "job.completed", payloadJson: { outputPath: "uploaded", verificationState: "worker_uploaded" }, sequenceNumber: 2, leaseOwnerToken: job.leaseOwnerToken, assignmentAttempt: job.assignmentAttempt ?? null }, auth.device);
    } catch (error) {
      await workerRequest(`/api/worker-jobs/${job.id}/events`, auth.accessToken, { eventType: "job.failed", payloadJson: { errorCode: "executor_failed", message: error instanceof Error ? error.message.slice(0, 500) : "executor_failed" }, sequenceNumber: 99, leaseOwnerToken: job.leaseOwnerToken, assignmentAttempt: job.assignmentAttempt ?? null }, auth.device).catch(() => {});
    }
  }
}
