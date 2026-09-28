import os from "node:os";
import path from "node:path";

function envPath(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function serverUrl(): string {
  const raw = envPath("SMARTAIHUB_SERVER_URL") ?? "https://smartaihub.app";
  const url = new URL(raw);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocal) throw new Error("SMARTAIHUB_SERVER_URL must use HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("SMARTAIHUB_SERVER_URL must not contain credentials or query data");
  return url.toString().replace(/\/$/, "");
}

export function stateRoot(): string {
  if (process.platform === "win32") {
    return path.join(envPath("LOCALAPPDATA") ?? envPath("APPDATA") ?? os.tmpdir(), "SmartAIHub", "RemotionExecutor");
  }
  if (process.platform === "darwin") {
    return path.join(envPath("HOME") ?? os.tmpdir(), "Library", "Application Support", "SmartAIHub", "RemotionExecutor");
  }
  return path.join(envPath("XDG_STATE_HOME") ?? path.join(envPath("HOME") ?? os.tmpdir(), ".local", "state"), "smartaihub", "remotion-executor");
}

export function workspaceRoot(): string {
  return path.join(stateRoot(), "workspaces");
}

export function sidecarPath(): string {
  const explicit = envPath("SMARTAIHUB_REMOTION_SIDECAR");
  if (explicit) return explicit;
  return path.join(envPath("SMARTAIHUB_RUNTIME_PACK_ROOT") ?? path.join(stateRoot(), "runtime-pack"), "remotion-sidecar", "render.mjs");
}

export const RUNTIME_VERSION = "remotion-executor-0.1.0";
export const REMOTION_RENDER_CONTRACT_VERSION = "2026-08-04.2";
export const REMOTION_RENDER_CLAIM_CAPABILITY = `remotion-render-contract-${REMOTION_RENDER_CONTRACT_VERSION}`;
export const REMOTION_CAPABILITY_FAMILIES = [
  "remotion-render",
  "chromium-render",
  "ffmpeg-probe",
  "vertical-drama-audio-dsp",
  "vertical-drama-demucs-gpu",
] as const;
export const VERTICAL_DRAMA_AUDIO_REPAIR_JOB_TYPE = "vd_audio_surgical_repair" as const;
export const VERTICAL_DRAMA_AUDIO_CAPABILITY_FAMILIES = [
  "vertical-drama-audio-dsp",
  "vertical-drama-demucs-gpu",
] as const;
export const PROTOCOL = {
  protocolVersion: "2026-04-06",
  runtimeFamilySchemaVersion: "2026-04-08",
  runtimeProfileSchemaVersion: "2026-04-08",
};

export function runtimePackId(): string {
  if (process.platform === "win32" && process.arch === "x64") return "remotion-executor-windows-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "remotion-executor-macos-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "remotion-executor-macos-x64";
  throw new Error("unsupported_executor_platform");
}

export function normalizedArchitecture(): "x64" | "arm64" {
  if (process.arch === "x64") return "x64";
  if (process.arch === "arm64") return "arm64";
  throw new Error("unsupported_executor_architecture");
}
