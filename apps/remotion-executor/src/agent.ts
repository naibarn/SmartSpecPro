import crypto from "node:crypto";
import { loadCredential, loadOrCreateDeviceIdentity, saveCredential } from "./credentials.js";
import { pollConnect, refreshTokenWithProof, startConnect, type DeviceProofMaterial } from "./controlPlane.js";
import { normalizedArchitecture, PROTOCOL, REMOTION_CAPABILITY_FAMILIES, REMOTION_RENDER_CONTRACT_VERSION, runtimePackId, RUNTIME_VERSION, serverUrl } from "./config.js";
import { ensureRuntimePack } from "./runtimeProvisioner.js";
import { discoverHermesInstallations } from "./hermesInstallDiscovery.js";
import path from "node:path";
import { doctor, toExecutorReadiness } from "./doctor.js";

const ACCESS_KEY = "access-token";
const REFRESH_KEY = "refresh-token";
const DEVICE_KEY = "device-id";

async function runtimeSource(): Promise<"existing_hermes_install" | "managed_runtime_pack"> {
  const explicitSidecar = process.env.SMARTAIHUB_REMOTION_SIDECAR?.trim();
  if (!explicitSidecar) return "managed_runtime_pack";
  const sidecar = path.resolve(explicitSidecar);
  const candidates = await discoverHermesInstallations();
  return candidates.some((candidate) => {
    const root = path.resolve(candidate.root);
    return sidecar === root || sidecar.startsWith(`${root}${path.sep}`);
  }) ? "existing_hermes_install" : "managed_runtime_pack";
}

function platformMetadata() {
  const hostPlatform = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const installationMode = process.platform === "win32" ? "windows_native" : process.platform === "darwin" ? "macos_native" : "linux_native";
  return { hostPlatform, runtimePlatform: hostPlatform, installationMode } as const;
}

async function registrationPayload(identity: DeviceProofMaterial, readiness: Awaited<ReturnType<typeof doctor>>) {
  const source = await runtimeSource();
  const platform = platformMetadata();
  const runtimeMetadata = {
    executorVersion: RUNTIME_VERSION,
    packId: runtimePackId(),
    packVersion: RUNTIME_VERSION,
    runtimeSource: source,
    hostPlatform: platform.hostPlatform,
    runtimePlatform: platform.runtimePlatform,
    architecture: normalizedArchitecture(),
    installationMode: platform.installationMode,
    platformContractVersion: REMOTION_RENDER_CONTRACT_VERSION,
    rendererPolicyVersion: "remotion-1",
    maxConcurrency: 1,
    manifestChecksum: null,
  };
  const capabilities = {
    capabilityFamilies: [...REMOTION_CAPABILITY_FAMILIES],
    claimCapability: `remotion-render-contract-${REMOTION_RENDER_CONTRACT_VERSION}`,
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
  };
  return {
    compatibility: { ...PROTOCOL, runtimeVersion: RUNTIME_VERSION },
    runtimeType: "remotion_executor",
    workerMode: "per_user",
    displayName: `Remotion Executor (${process.platform})`,
    externalReference: `remotion-executor://${identity.deviceId}`,
    runtimeMode: "native_constrained",
    machineId: identity.deviceId,
    machineName: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "local-executor",
    capabilitiesJson: capabilities,
    hardwareJson: { platform: process.platform, architecture: process.arch },
    healthSummaryJson: toExecutorReadiness(readiness),
    warningFlagsJson: [],
    runtimeMetadataJson: runtimeMetadata,
    fileScopeMode: "workspace_scoped",
    deviceBinding: {
      deviceId: identity.deviceId,
      machineFingerprint: identity.machineFingerprint,
      publicKey: identity.publicKey,
    },
  };
}

export async function connect(): Promise<void> {
  await ensureRuntimePack();
  const readiness = await doctor();
  if (readiness.status !== "ready") throw new Error("executor_doctor_blocked");
  const identity = await loadOrCreateDeviceIdentity(await loadCredential(DEVICE_KEY) ?? undefined);
  const started = await startConnect(await registrationPayload(identity, readiness));
  const deviceCode = String(started.deviceCode ?? "");
  if (!deviceCode) throw new Error("connect_start_missing_device_code");
  console.log(`Open ${String(started.verificationUriComplete ?? started.verificationUri ?? serverUrl())}`);
  console.log(`Approval code: ${String(started.userCode ?? "")}`);
  const interval = Math.max(2, Number(started.interval ?? 3)) * 1000;
  const deadline = Date.now() + Math.min(15 * 60_000, Number(started.expiresIn ?? 900) * 1000);
  while (Date.now() < deadline) {
    const result = await pollConnect(deviceCode);
    if (result.status === "approved" && result.tokens && typeof result.tokens === "object") {
      const tokens = result.tokens as Record<string, unknown>;
      await saveCredential(ACCESS_KEY, String(tokens.executionToken));
      await saveCredential(REFRESH_KEY, String(tokens.refreshToken));
      await saveCredential("upload-token", String(tokens.uploadToken));
      await saveCredential("worker-id", String((result.worker as Record<string, unknown>)?.id ?? ""));
      console.log("SmartAIHub Remotion Executor connected.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error("connect_approval_timeout");
}

export async function credentials(): Promise<{ workerId: string; accessToken: string; uploadToken: string; refreshToken: string; device: DeviceProofMaterial }> {
  let accessToken = await loadCredential(ACCESS_KEY);
  const refresh = await loadCredential(REFRESH_KEY);
  let refreshTokenValue = refresh;
  let uploadToken = await loadCredential("upload-token");
  const workerId = await loadCredential("worker-id");
  if (!accessToken || !refresh || !uploadToken || !workerId) throw new Error("executor_not_connected");
  if (accessToken.split(".").length !== 3) throw new Error("stored_access_token_invalid");
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1]!, "base64url").toString("utf8")) as { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now() + 60_000) {
      const identity = await loadOrCreateDeviceIdentity(await loadCredential(DEVICE_KEY) ?? undefined);
      const next = await refreshTokenWithProof(refresh, identity);
      const tokens = next.tokens as Record<string, unknown>;
      accessToken = String(tokens.executionToken);
      await saveCredential(ACCESS_KEY, accessToken);
      refreshTokenValue = String(tokens.refreshToken);
      await saveCredential(REFRESH_KEY, refreshTokenValue);
      uploadToken = String(tokens.uploadToken);
      await saveCredential("upload-token", uploadToken);
    }
  } catch { throw new Error("stored_access_token_invalid"); }
  const identity = await loadOrCreateDeviceIdentity(await loadCredential(DEVICE_KEY) ?? undefined);
  return { workerId, accessToken, uploadToken, refreshToken: refreshTokenValue!, device: identity };
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
