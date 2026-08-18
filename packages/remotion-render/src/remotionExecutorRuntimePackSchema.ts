import { z } from "zod";

export const REMOTION_EXECUTOR_RUNTIME_PACK_IDS = [
  "remotion-executor-windows-x64",
  "remotion-executor-macos-arm64",
  "remotion-executor-macos-x64",
] as const;

/** Signed, platform-specific manifest shared by the release tooling, API and executor. */
export const remotionExecutorRuntimePackManifestSchema = z.object({
  schemaVersion: z.literal("2026-08-16.1").default("2026-08-16.1"),
  runtimeId: z.enum(REMOTION_EXECUTOR_RUNTIME_PACK_IDS),
  runtimePackId: z.string().trim().min(1).max(128).optional(),
  version: z.string().trim().min(1).max(64),
  runtimeKind: z.literal("standalone_remotion_executor"),
  runtimePlatform: z.enum(["windows", "macos", "linux"]),
  platform: z.enum(["windows", "macos", "linux"]).optional(),
  architecture: z.enum(["x64", "x86_64", "arm64"]),
  executionEnvironment: z.enum(["native", "wsl2"]).default("native"),
  allowed: z.boolean(),
  denyReason: z.string().trim().max(512).nullable().optional(),
  nodePath: z.string().trim().min(1).max(512).optional(),
  browserPath: z.string().trim().min(1).max(512).optional(),
  ffmpegPath: z.string().trim().min(1).max(512).optional(),
  ffprobePath: z.string().trim().min(1).max(512).optional(),
  fontsPath: z.string().trim().min(1).max(512).optional(),
  sidecarPath: z.string().trim().min(1).max(512).optional(),
  sidecarSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  remotionRenderPackageVersion: z.string().trim().min(1).max(64).optional(),
  platformContractVersion: z.string().trim().min(1).max(64).optional(),
  rendererPolicyVersion: z.string().trim().min(1).max(64).optional(),
  checksumFile: z.string().trim().min(1).max(256).optional(),
  checksumSignatureFile: z.string().trim().min(1).max(256).optional(),
  signingAlgorithm: z.literal("ed25519").optional(),
  archiveSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  archiveSizeBytes: z.number().int().positive().optional(),
  archiveSignature: z.string().trim().min(1).max(16_384).optional(),
  archiveFileName: z.string().trim().min(1).max(512).optional(),
  archiveEntries: z.array(z.string().trim().min(1).max(512)).max(100_000).optional(),
}).strict().superRefine((manifest, ctx) => {
  const expectedArchitecture = manifest.runtimeId.endsWith("arm64") ? "arm64" : manifest.runtimeId.endsWith("x64") ? "x64" : null;
  const normalizedArchitecture = manifest.architecture === "x86_64" ? "x64" : manifest.architecture;
  if (expectedArchitecture && normalizedArchitecture !== expectedArchitecture) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["architecture"], message: "Runtime pack architecture does not match runtimeId" });
  }
  const expectedPlatform = manifest.runtimeId.includes("windows") ? "windows" : "macos";
  if (manifest.runtimePlatform !== expectedPlatform) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["runtimePlatform"], message: "Runtime pack platform does not match runtimeId" });
  }
  if (manifest.allowed && !manifest.archiveSignature) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["archiveSignature"], message: "Allowed runtime packs require an archive signature" });
  }
});

export type RemotionExecutorRuntimePackManifest = z.infer<typeof remotionExecutorRuntimePackManifestSchema>;
