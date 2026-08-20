import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizedArchitecture, REMOTION_RENDER_CONTRACT_VERSION, runtimePackId, sidecarPath, stateRoot, RUNTIME_VERSION, serverUrl } from "./config.js";
import { runFile } from "./process.js";
import { discoverHermesInstallations } from "./hermesInstallDiscovery.js";

export type DoctorResult = { status: "ready" | "blocked"; checks: Array<{ id: string; status: "pass" | "error"; detail: string }>; recommendedActions: string[]; runtimeVersion?: string };
export type ExecutorReadiness = {
  status: "ready" | "blocked" | "unavailable";
  observedAt: string;
  checks: Record<string, { status: "pass" | "error" | "unknown"; reasonCode: string | null; version: string | null }>;
  blockingReasons: string[];
};
const MIN_FREE_DISK_BYTES = 2 * 1024 * 1024 * 1024;

type RuntimeManifest = {
  runtimeId?: unknown;
  runtimePlatform?: unknown;
  architecture?: unknown;
  allowed?: unknown;
  minimumOsVersion?: unknown;
  remotionPlatformContractVersion?: unknown;
  sidecarPath?: unknown;
  sidecarSha256?: unknown;
  nodePath?: unknown;
  browserPath?: unknown;
  ffmpegPath?: unknown;
  ffprobePath?: unknown;
  fontsPath?: unknown;
};

function expectedRuntimePlatform(): string {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "macos-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "macos-x64";
  return "unsupported";
}

function managedRuntimeRoot(): string {
  return path.dirname(path.dirname(sidecarPath()));
}

function safeRuntimePath(root: string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.includes(":") || normalized.split("/").includes("..")) return null;
  const resolved = path.resolve(root, normalized);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

/** Resolve a manifest-declared executable without allowing pack escape. */
export function resolveManagedRuntimePath(root: string, declaredPath: unknown): string | null {
  return safeRuntimePath(root, declaredPath);
}

export async function managedRuntimeNodePath(root = managedRuntimeRoot()): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(root, "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as RuntimeManifest;
    const nodePath = resolveManagedRuntimePath(root, manifest.nodePath);
    if (!nodePath) return null;
    await fs.access(nodePath);
    return nodePath;
  } catch {
    return null;
  }
}

export async function managedRuntimeDoctor(root = managedRuntimeRoot()): Promise<Pick<DoctorResult, "status" | "checks" | "recommendedActions">> {
  const checks: DoctorResult["checks"] = [];
  const actions: string[] = [];
  const manifestPath = path.join(root, "manifest.json");
  let manifest: RuntimeManifest;
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) throw new Error("manifest_too_large");
    manifest = JSON.parse(raw) as RuntimeManifest;
  } catch {
    checks.push({ id: "runtime_manifest", status: "error", detail: "Managed runtime manifest is missing or invalid" });
    actions.push("Install a verified SmartAIHub runtime pack.");
    return { status: "blocked", checks, recommendedActions: actions };
  }

  const expectedPlatform = expectedRuntimePlatform();
  if (expectedPlatform === "unsupported") {
    checks.push({ id: "runtime_manifest", status: "error", detail: "This host platform/architecture is not a supported standalone executor target" });
    actions.push("Run the Windows 11 or macOS native executor on a supported target.");
    return { status: "blocked", checks, recommendedActions: actions };
  }
  const manifestReady = manifest.allowed === true
    && manifest.runtimeId === runtimePackId()
    && manifest.runtimePlatform === expectedPlatform
    && manifest.architecture === normalizedArchitecture()
    && manifest.remotionPlatformContractVersion === REMOTION_RENDER_CONTRACT_VERSION;
  checks.push({
    id: "runtime_manifest",
    status: manifestReady ? "pass" : "error",
    detail: manifestReady ? `Verified ${String(manifest.runtimeId)} runtime manifest` : "Runtime manifest platform, architecture, allow policy, or contract does not match this host",
  });
  if (!manifestReady) actions.push("Install the matching signed runtime pack for this platform and architecture.");

  const requiredAssets = [
    ["runtime_node", manifest.nodePath],
    ["runtime_browser", manifest.browserPath],
    ["runtime_ffmpeg", manifest.ffmpegPath],
    ["runtime_ffprobe", manifest.ffprobePath],
    ["runtime_fonts", manifest.fontsPath],
  ] as const;
  for (const [id, declaredPath] of requiredAssets) {
    const resolved = safeRuntimePath(root, declaredPath);
    let available = false;
    if (resolved) {
      try {
        const realRoot = await fs.realpath(root);
        const realPath = await fs.realpath(resolved);
        available = realPath === realRoot || realPath.startsWith(`${realRoot}${path.sep}`);
        if (available) await fs.access(realPath);
      } catch { available = false; }
    }
    checks.push({ id, status: available ? "pass" : "error", detail: available ? "Runtime asset available" : "Runtime asset is missing or escapes the runtime pack" });
    if (!available) actions.push(`Install or repair the managed runtime asset for ${id}.`);
  }

  const declaredSidecar = safeRuntimePath(root, manifest.sidecarPath);
  let sidecarReady = false;
  const expectedSidecar = path.join(root, "remotion-sidecar", "render.mjs");
  if (declaredSidecar && path.resolve(declaredSidecar) === path.resolve(expectedSidecar)) {
    try {
      const digest = crypto.createHash("sha256").update(await fs.readFile(declaredSidecar)).digest("hex");
      sidecarReady = typeof manifest.sidecarSha256 === "string" && digest === manifest.sidecarSha256.toLowerCase();
    } catch { sidecarReady = false; }
  }
  checks.push({ id: "remotion_sidecar_hash", status: sidecarReady ? "pass" : "error", detail: sidecarReady ? "Remotion sidecar checksum matches manifest" : "Remotion sidecar checksum is missing or invalid" });
  if (!sidecarReady) actions.push("Install a runtime pack whose Remotion sidecar matches the signed manifest.");

  const probes: Array<[string, unknown, string[]]> = [
    ["runtime_node_probe", manifest.nodePath, ["--version"]],
    ["runtime_browser_probe", manifest.browserPath, ["--version"]],
    ["runtime_ffmpeg_probe", manifest.ffmpegPath, ["-version"]],
    ["runtime_ffprobe_probe", manifest.ffprobePath, ["-version"]],
  ];
  for (const [id, declaredPath, args] of probes) {
    const resolved = safeRuntimePath(root, declaredPath);
    const probe = resolved ? await runFile(resolved, args).catch(() => ({ code: 1, stdout: "", stderr: "" })) : { code: 1, stdout: "", stderr: "" };
    const passed = probe.code === 0;
    checks.push({ id, status: passed ? "pass" : "error", detail: passed ? "Runtime executable probe passed" : "Runtime executable probe failed" });
    if (!passed) actions.push(`Repair the managed runtime executable for ${id}.`);
  }
  return {
    status: checks.every((check) => check.status === "pass") ? "ready" : "blocked",
    checks,
    recommendedActions: actions,
  };
}

export async function doctor(): Promise<DoctorResult> {
  const checks: DoctorResult["checks"] = [];
  const actions: string[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  checks.push({ id: "node", status: nodeMajor >= 22 ? "pass" : "error", detail: `Node ${process.versions.node}` });
  checks.push({ id: "platform", status: process.platform === "win32" || process.platform === "darwin" ? "pass" : "error", detail: `${process.platform}/${process.arch}` });
  try { new URL(serverUrl()); checks.push({ id: "server_url", status: "pass", detail: "HTTPS control plane configured" }); } catch { checks.push({ id: "server_url", status: "error", detail: "Invalid or insecure server URL" }); actions.push("Set SMARTAIHUB_SERVER_URL to the HTTPS SmartAIHub origin."); }
  try {
    await fs.mkdir(path.join(stateRoot(), "workspaces"), { recursive: true });
    const disk = await fs.statfs(stateRoot());
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const enoughDisk = Number.isFinite(freeBytes) && freeBytes >= MIN_FREE_DISK_BYTES;
    checks.push({ id: "state_root", status: enoughDisk ? "pass" : "error", detail: enoughDisk ? `Protected app state directory available (${freeBytes} bytes free)` : "Insufficient free disk space for a render workspace" });
    if (!enoughDisk) actions.push("Free at least 2 GiB in the executor workspace volume.");
  } catch { checks.push({ id: "state_root", status: "error", detail: "Cannot inspect or create app state directory" }); actions.push("Grant the app access to its per-user application data directory."); }
  try { await fs.access(sidecarPath()); checks.push({ id: "remotion_sidecar", status: "pass", detail: "Remotion sidecar found" }); } catch { checks.push({ id: "remotion_sidecar", status: "error", detail: "Signed Remotion runtime pack is not installed" }); actions.push("Run setup to install the verified SmartAIHub runtime pack."); }
  if (!process.env.SMARTAIHUB_REMOTION_SIDECAR?.trim() && process.platform !== "linux") {
    const managed = await managedRuntimeDoctor();
    checks.push(...managed.checks);
    actions.push(...managed.recommendedActions);
  }
  const hermes = await discoverHermesInstallations();
  const hermesAvailable = hermes.some((candidate) => candidate.executable);
  const managedPackReady = checks.some((check) => check.id === "runtime_manifest" && check.status === "pass")
    && checks.some((check) => check.id === "runtime_browser_probe" && check.status === "pass")
    && checks.some((check) => check.id === "runtime_ffmpeg_probe" && check.status === "pass")
    && checks.some((check) => check.id === "runtime_ffprobe_probe" && check.status === "pass");
  checks.push({ id: "hermes_install", status: hermesAvailable || managedPackReady ? "pass" : "error", detail: hermesAvailable ? "Known Hermes installation detected" : managedPackReady ? "No Hermes installation needed; managed SmartAIHub runtime is ready" : "No known Hermes installation detected" });
  if (!hermesAvailable && !managedPackReady) actions.push("Install Hermes CLI/Hermes One or continue with the managed SmartAIHub runtime pack.");
  if (process.platform === "darwin") { const probe = await runFile("security", ["help"]); checks.push({ id: "keychain", status: probe.code === 0 ? "pass" : "error", detail: "macOS Keychain command available" }); }
  if (process.platform === "win32") { const probe = await runFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"]); checks.push({ id: "dpapi", status: probe.code === 0 ? "pass" : "error", detail: "Windows protected credential support available" }); }
  return { status: checks.every((check) => check.status === "pass") ? "ready" : "blocked", checks, recommendedActions: actions, runtimeVersion: RUNTIME_VERSION } as DoctorResult;
}

const checkReasonCodes: Record<string, string> = {
  runtime_browser: "browser_missing",
  runtime_browser_probe: "browser_incompatible",
  runtime_ffmpeg: "ffmpeg_missing",
  runtime_ffmpeg_probe: "ffmpeg_incompatible",
  runtime_ffprobe: "ffprobe_missing",
  runtime_ffprobe_probe: "ffprobe_incompatible",
  runtime_fonts: "font_set_incomplete",
  state_root: "low_disk",
  keychain: "credential_store_unavailable",
  dpapi: "credential_store_unavailable",
  runtime_manifest: "manifest_invalid",
  platform: "platform_unsupported",
  remotion_sidecar_hash: "contract_mismatch",
  server_url: "contract_mismatch",
};

export function toExecutorReadiness(result: DoctorResult): ExecutorReadiness {
  const checks: ExecutorReadiness["checks"] = {};
  const blockingReasons = new Set<string>();
  for (const check of result.checks) {
    const passed = check.status === "pass";
    const reasonCode = passed ? null : checkReasonCodes[check.id] ?? "manifest_invalid";
    checks[check.id] = { status: passed ? "pass" : "error", reasonCode, version: null };
    if (reasonCode) blockingReasons.add(reasonCode);
  }
  const status = result.status === "ready" ? "ready" : "blocked";
  return {
    status,
    observedAt: new Date().toISOString(),
    checks: {
      browser: checks.runtime_browser_probe ?? checks.remotion_sidecar_hash ?? { status: "error", reasonCode: "browser_missing", version: null },
      ffmpeg: checks.runtime_ffmpeg_probe ?? { status: "error", reasonCode: "ffmpeg_missing", version: null },
      ffprobe: checks.runtime_ffprobe_probe ?? { status: "error", reasonCode: "ffprobe_missing", version: null },
      fontSet: checks.runtime_fonts ?? { status: "error", reasonCode: "font_set_incomplete", version: null },
      diskFloor: checks.state_root ?? { status: "pass", reasonCode: null, version: null },
      credentialStore: checks.keychain ?? checks.dpapi ?? { status: "error", reasonCode: "credential_store_unavailable", version: null },
      manifestIntegrity: checks.runtime_manifest ?? checks.remotion_sidecar_hash ?? { status: "error", reasonCode: "manifest_invalid", version: null },
      contractCompatibility: checks.remotion_sidecar_hash ?? { status: "error", reasonCode: "contract_mismatch", version: null },
    },
    blockingReasons: Array.from(blockingReasons),
  };
}
