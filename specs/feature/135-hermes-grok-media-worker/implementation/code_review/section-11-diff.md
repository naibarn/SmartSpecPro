diff --git a/apps/web/scripts/build-hermes-runtime-pack.ts b/apps/web/scripts/build-hermes-runtime-pack.ts
new file mode 100644
index 000000000..4b92cdde3
--- /dev/null
+++ b/apps/web/scripts/build-hermes-runtime-pack.ts
@@ -0,0 +1,249 @@
+#!/usr/bin/env node
+/**
+ * Feature 135 §11 — Hermes runtime pack build script.
+ *
+ * Packs do not build themselves (spec §11 objective #3): this script
+ * assembles a per-OS archive containing an uv-managed Python 3.11 runtime
+ * with `hermes-agent==0.18.2` pinned/installed, computes its sha256, and
+ * emits the manifest-entry JSON the runtime-manifest endpoint
+ * (`server/routes/workerRuntime.ts`) serves and the Worker App's
+ * `worker_app_install_hermes_runtime` Tauri command consumes
+ * (`hermes_runtime.rs::HermesRuntimeManifest`).
+ *
+ * Windows ships first (spec §1 — phase-4 gate); the macOS entry can exist
+ * with `allowed: false` until its pack is built, using the same code path.
+ *
+ * Usage (operator-run, never invoked by the app or by tests):
+ *   npx tsx scripts/build-hermes-runtime-pack.ts --os windows --version 0.1.0 \
+ *     --output-dir client/public/releases/runtime
+ *
+ * Per spec §4.2: only the pure manifest-entry builder is unit-tested here.
+ * Archive assembly (shelling out to `uv`, downloading Python, pip-installing
+ * `hermes-agent`, zipping, computing the real sha256) is NOT exercised by
+ * the test suite — it requires real network/tooling access and is an
+ * operator-run, manual-verification step.
+ */
+import { createHash } from "node:crypto";
+import { existsSync } from "node:fs";
+import fs from "node:fs/promises";
+import path from "node:path";
+import { execFile } from "node:child_process";
+import { promisify } from "node:util";
+
+const execFileAsync = promisify(execFile);
+
+/** Pinned Hermes CLI version — MUST match `hermes_runtime.rs`'s
+ *  `HERMES_PINNED_VERSION` and the CLAUDE-plan pin `hermes-agent==0.18.2`. */
+export const HERMES_PINNED_VERSION = "0.18.2";
+export const HERMES_AGENT_PIP_SPEC = `hermes-agent==${HERMES_PINNED_VERSION}`;
+
+/** Runtime ids — frozen to match `hermes_runtime.rs`'s
+ *  `HERMES_RUNTIME_ID_WINDOWS` / `HERMES_RUNTIME_ID_MACOS` and the
+ *  manifest-serving region added to `workerRuntime.ts`. */
+export const HERMES_RUNTIME_IDS = {
+  windows: "hermes-windows-x64",
+  macos: "hermes-macos-arm64",
+} as const;
+
+export type HermesPackOs = keyof typeof HERMES_RUNTIME_IDS;
+
+const SUPPORTED_OS_VALUES = Object.keys(HERMES_RUNTIME_IDS);
+
+/** Runtime-validates an `--os` CLI value (or any caller-supplied string)
+ *  against the two supported packs. Throws for anything else (spec §4.2
+ *  "unknown OS rejected"). */
+export function resolveHermesPackOs(value: string): HermesPackOs {
+  if (value === "windows" || value === "macos") {
+    return value;
+  }
+  throw new Error(
+    `build-hermes-runtime-pack: unsupported OS "${value}" (expected one of: ${SUPPORTED_OS_VALUES.join(", ")})`,
+  );
+}
+
+export interface HermesRuntimeManifestEntryInput {
+  os: string;
+  /** Pack build version (independent of the pinned Hermes CLI version). */
+  version: string;
+  archiveSha256: string;
+  archiveSizeBytes: number;
+  /** Path to the bundled Python interpreter, relative to the pack root. */
+  pythonRelativePath: string;
+  /** Path to the `hermes` CLI entry point, relative to the pack root. */
+  hermesRelativePath: string;
+  checksumFile?: string;
+  signatureFile?: string;
+  /** Defaults to `true` for windows, `false` for macos (spec §1 — Windows
+   *  ships first; the macOS id is registered but not yet buildable). */
+  allowed?: boolean;
+  denyReason?: string;
+  archiveUrl?: string;
+}
+
+export interface HermesRuntimeManifestEntry {
+  runtimeId: string;
+  version: string;
+  hermesVersion: string;
+  pythonRelativePath: string;
+  hermesRelativePath: string;
+  checksumFile: string;
+  signatureFile: string;
+  allowed: boolean;
+  denyReason?: string;
+  archiveSha256: string;
+  archiveSizeBytes: number;
+  archiveUrl?: string;
+}
+
+/**
+ * Pure manifest-entry builder — no filesystem/network access. Produces the
+ * `{ runtimeId, version, archiveSha256, allowed }` shape (plus the other
+ * `HermesRuntimeManifest` fields `hermes_runtime.rs` expects) for either
+ * supported OS id; throws for an unrecognized OS.
+ */
+export function buildHermesRuntimeManifestEntry(
+  input: HermesRuntimeManifestEntryInput,
+): HermesRuntimeManifestEntry {
+  const os = resolveHermesPackOs(input.os);
+  const runtimeId = HERMES_RUNTIME_IDS[os];
+  const allowed = input.allowed ?? os === "windows";
+
+  const entry: HermesRuntimeManifestEntry = {
+    runtimeId,
+    version: input.version,
+    hermesVersion: HERMES_PINNED_VERSION,
+    pythonRelativePath: input.pythonRelativePath,
+    hermesRelativePath: input.hermesRelativePath,
+    checksumFile: input.checksumFile ?? "SHA256SUMS",
+    signatureFile: input.signatureFile ?? "SHA256SUMS.sig",
+    allowed,
+    archiveSha256: input.archiveSha256,
+    archiveSizeBytes: input.archiveSizeBytes,
+  };
+  if (!allowed) {
+    entry.denyReason = input.denyReason ?? `${runtimeId} pack has not been built yet`;
+  }
+  if (input.archiveUrl) {
+    entry.archiveUrl = input.archiveUrl;
+  }
+  return entry;
+}
+
+async function sha256File(filePath: string): Promise<string> {
+  const hasher = createHash("sha256");
+  const buffer = await fs.readFile(filePath);
+  hasher.update(buffer);
+  return hasher.digest("hex");
+}
+
+export interface AssembleHermesRuntimePackOptions {
+  os: string;
+  version: string;
+  outputDir: string;
+  /** Injectable for tests/dry-runs — production default shells out to `uv`. */
+  runCommand?: (command: string, args: string[], cwd: string) => Promise<void>;
+}
+
+/**
+ * Assembles the per-OS Hermes runtime pack archive: a `uv`-managed Python
+ * 3.11 virtual environment with `hermes-agent==0.18.2` installed, zipped,
+ * sha256'd, with a `<archive>.manifest.json` sidecar written next to it
+ * (same convention `server/routes/workerRuntime.ts` reads for the
+ * HyperFrames pack via `readRuntimePackManifest`).
+ *
+ * NOT unit-tested end-to-end (spec §4.2) — requires real `uv`/network
+ * access. Operators run this manually; it is never invoked by the app.
+ */
+export async function assembleHermesRuntimePack(
+  options: AssembleHermesRuntimePackOptions,
+): Promise<{ archivePath: string; manifestPath: string; entry: HermesRuntimeManifestEntry }> {
+  const os = resolveHermesPackOs(options.os);
+  const runtimeId = HERMES_RUNTIME_IDS[os];
+  const stagingRoot = await fs.mkdtemp(path.join(options.outputDir, `.${runtimeId}-staging-`));
+  const runCommand =
+    options.runCommand ??
+    (async (command: string, args: string[], cwd: string) => {
+      await execFileAsync(command, args, { cwd });
+    });
+
+  try {
+    // 1. uv-managed Python 3.11 venv.
+    await runCommand("uv", ["venv", "--python", "3.11", path.join(stagingRoot, "python")], stagingRoot);
+    // 2. Pin-install hermes-agent into that venv.
+    await runCommand(
+      "uv",
+      ["pip", "install", "--python", path.join(stagingRoot, "python"), HERMES_AGENT_PIP_SPEC],
+      stagingRoot,
+    );
+
+    const pythonRelativePath =
+      os === "windows" ? "python/Scripts/python.exe" : "python/bin/python3";
+    const hermesRelativePath =
+      os === "windows" ? "python/Scripts/hermes.exe" : "python/bin/hermes";
+
+    if (!existsSync(path.join(stagingRoot, hermesRelativePath))) {
+      throw new Error(
+        `build-hermes-runtime-pack: expected hermes CLI at ${hermesRelativePath} after installing ${HERMES_AGENT_PIP_SPEC}`,
+      );
+    }
+
+    const archiveFileName = `smart-ai-hub-hermes-runtime-${runtimeId}-${options.version}.zip`;
+    const archivePath = path.join(options.outputDir, archiveFileName);
+    await runCommand("zip", ["-r", archivePath, "."], stagingRoot);
+
+    const archiveSha256 = await sha256File(archivePath);
+    const archiveSizeBytes = (await fs.stat(archivePath)).size;
+
+    const entry = buildHermesRuntimeManifestEntry({
+      os,
+      version: options.version,
+      archiveSha256,
+      archiveSizeBytes,
+      pythonRelativePath,
+      hermesRelativePath,
+    });
+
+    const manifestPath = `${archivePath}.manifest.json`;
+    await fs.writeFile(manifestPath, JSON.stringify(entry, null, 2));
+
+    return { archivePath, manifestPath, entry };
+  } finally {
+    await fs.rm(stagingRoot, { recursive: true, force: true });
+  }
+}
+
+function readFlag(argv: string[], flag: string): string | undefined {
+  const index = argv.indexOf(flag);
+  if (index === -1) return undefined;
+  return argv[index + 1];
+}
+
+async function main(): Promise<void> {
+  const argv = process.argv.slice(2);
+  const os = readFlag(argv, "--os");
+  const version = readFlag(argv, "--version");
+  const outputDir = readFlag(argv, "--output-dir") ?? "client/public/releases/runtime";
+  if (!os || !version) {
+    // eslint-disable-next-line no-console
+    console.error(
+      "Usage: tsx scripts/build-hermes-runtime-pack.ts --os <windows|macos> --version <x.y.z> [--output-dir <dir>]",
+    );
+    process.exitCode = 1;
+    return;
+  }
+  await fs.mkdir(outputDir, { recursive: true });
+  const { archivePath, manifestPath } = await assembleHermesRuntimePack({ os, version, outputDir });
+  // eslint-disable-next-line no-console
+  console.log(`Built ${archivePath}`);
+  // eslint-disable-next-line no-console
+  console.log(`Manifest ${manifestPath}`);
+}
+
+// Only run when executed directly (never on import — keeps this test-safe).
+if (import.meta.url === `file://${process.argv[1]}`) {
+  main().catch((error) => {
+    // eslint-disable-next-line no-console
+    console.error(error);
+    process.exitCode = 1;
+  });
+}
diff --git a/apps/web/server/routes/workerRuntime.ts b/apps/web/server/routes/workerRuntime.ts
index eb7d1933b..ce20926f7 100644
--- a/apps/web/server/routes/workerRuntime.ts
+++ b/apps/web/server/routes/workerRuntime.ts
@@ -99,6 +99,14 @@ const WORKER_CONNECT_POLL_INTERVAL_SECONDS = 3;
 const DEFAULT_WORKER_RUNTIME_PACK_ID = "hyperframes-wsl2";
 const SUPPORTED_WORKER_RUNTIME_PACK_IDS = new Set(["hyperframes-wsl2", "hyperframes-windows-x64"]);
 const WORKER_RUNTIME_PACK_FILE_PATTERN = /^smart-ai-hub-worker-runtime-(hyperframes-(?:wsl2|windows-x64))-(.+)\.zip$/i;
+// Feature 135 §11 — Hermes runtime pack ids, additive and independent of the
+// HyperFrames pack family above (own file-name pattern, own manifest shape,
+// own allow-gate). Windows ships first (spec §1); the macOS id is
+// "registered" here (resolvable via the manifest endpoint) even before its
+// pack is built — see `findLatestHermesRuntimePack`/`defaultHermesManifestEntry`.
+const HERMES_RUNTIME_PACK_IDS = new Set(["hermes-windows-x64", "hermes-macos-arm64"]);
+const HERMES_RUNTIME_PACK_FILE_PATTERN =
+  /^smart-ai-hub-hermes-runtime-(hermes-(?:windows-x64|macos-arm64))-(.+)\.zip$/i;
 const DENIED_RUNTIME_SIDECAR_SHA256 = new Set([
   // Placeholder sidecar from early runtime pack scaffolding.
   "f04671084625130d4ed59f89ebb29000a411247ed2e8491ecfa3216b6e9e0774",
@@ -562,6 +570,66 @@ function findLatestAllowedRuntimePack(releaseDirs: string[], runtimeId = DEFAULT
   })[0] ?? null;
 }
 
+// ────────────────────────────────────────────────────────────────────────
+// Feature 135 §11 — Hermes runtime pack manifest serving. Deliberately does
+// NOT reuse `isOfficialRuntimePackManifest`/`findLatestAllowedRuntimePack`
+// (those encode HyperFrames-specific manifest fields like `hyperframesVersion`);
+// the Hermes pack (built by `apps/web/scripts/build-hermes-runtime-pack.ts`)
+// has its own manifest shape (`hermes_runtime.rs::HermesRuntimeManifest`).
+// ────────────────────────────────────────────────────────────────────────
+
+function findLatestHermesRuntimePack(releaseDirs: string[], runtimeId: string) {
+  const candidates: Array<{
+    fileName: string;
+    filePath: string;
+    runtimeId: string;
+    version: string;
+    updatedAt: string;
+    sizeBytes: number;
+  }> = [];
+  for (const releaseDir of releaseDirs) {
+    if (!fs.existsSync(releaseDir)) continue;
+    for (const fileName of fs.readdirSync(releaseDir)) {
+      const match = fileName.match(HERMES_RUNTIME_PACK_FILE_PATTERN);
+      if (!match?.[1] || !match?.[2]) continue;
+      if (match[1] !== runtimeId) continue;
+      const filePath = path.join(releaseDir, fileName);
+      const stat = fs.statSync(filePath);
+      if (!stat.isFile()) continue;
+      candidates.push({
+        fileName,
+        filePath,
+        runtimeId: match[1],
+        version: match[2],
+        updatedAt: stat.mtime.toISOString(),
+        sizeBytes: stat.size,
+      });
+    }
+  }
+  return candidates.sort((left, right) => {
+    const versionCompare = right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" });
+    return versionCompare || right.updatedAt.localeCompare(left.updatedAt);
+  })[0] ?? null;
+}
+
+/** Synthesized manifest for a "registered but not yet built" Hermes pack
+ *  (spec §1 — the macOS id exists with `allowed: false` until its pack
+ *  ships). Includes every field `HermesRuntimeManifest` requires in Rust so
+ *  `fetch_runtime_manifest` still parses successfully. */
+function defaultHermesManifestEntry(runtimeId: string): Record<string, unknown> {
+  return {
+    runtimeId,
+    version: "0.0.0",
+    hermesVersion: "0.0.0",
+    pythonRelativePath: "",
+    hermesRelativePath: "",
+    checksumFile: "SHA256SUMS",
+    signatureFile: "SHA256SUMS.sig",
+    allowed: false,
+    denyReason: `${runtimeId} runtime pack has not been published yet`,
+  };
+}
+
 function requireBearerToken(req: Request): string {
   const token = extractBearerTokenFromRequest(req);
   if (!token) {
@@ -704,6 +772,42 @@ export function registerWorkerRuntimeRoutes(
       try {
         res.setHeader("Cache-Control", "no-store");
         const runtimeId = String(req.query.runtimeId || DEFAULT_WORKER_RUNTIME_PACK_ID).trim();
+
+        // Feature 135 §11 — Hermes runtime pack ids are served by this same
+        // endpoint but resolved independently of the HyperFrames pack logic
+        // below (see `findLatestHermesRuntimePack`'s doc comment).
+        if (HERMES_RUNTIME_PACK_IDS.has(runtimeId)) {
+          const hermesPack = findLatestHermesRuntimePack(runtimePackReleaseDirs, runtimeId);
+          if (!hermesPack) {
+            res.json(defaultHermesManifestEntry(runtimeId));
+            return;
+          }
+          const hermesManifest = readRuntimePackManifest(hermesPack.filePath);
+          if (!hermesManifest || hermesManifest.allowed !== true) {
+            res.json({
+              ...(hermesManifest ?? defaultHermesManifestEntry(runtimeId)),
+              runtimeId,
+              allowed: false,
+            });
+            return;
+          }
+          const hermesManifestArchiveSha256 = stringField(hermesManifest.archiveSha256).toLowerCase();
+          const hermesArchiveSha256 = /^[a-f0-9]{64}$/.test(hermesManifestArchiveSha256)
+            ? hermesManifestArchiveSha256
+            : sha256File(hermesPack.filePath);
+          res.json({
+            ...hermesManifest,
+            runtimeId: hermesManifest.runtimeId ?? hermesPack.runtimeId,
+            version: hermesManifest.version ?? hermesPack.version,
+            archiveFileName: hermesPack.fileName,
+            archiveSha256: hermesArchiveSha256,
+            archiveSizeBytes: hermesPack.sizeBytes,
+            archiveUrl: `/api/workers/runtime-pack/download/${encodeURIComponent(hermesPack.fileName)}`,
+            updatedAt: hermesPack.updatedAt,
+          });
+          return;
+        }
+
         if (!SUPPORTED_WORKER_RUNTIME_PACK_IDS.has(runtimeId)) {
           sendApiError(res, 404, "runtime_pack_not_found", `Runtime pack is not available for ${runtimeId}`, "not_found_error");
           return;
@@ -757,6 +861,29 @@ export function registerWorkerRuntimeRoutes(
       try {
         res.setHeader("Cache-Control", "no-store");
         const fileName = path.basename(String(req.params.fileName || ""));
+
+        // Feature 135 §11 — Hermes runtime pack downloads, resolved
+        // independently of the HyperFrames pack logic below (own file-name
+        // pattern/allow-gate; see `findLatestHermesRuntimePack`).
+        const hermesMatch = fileName.match(HERMES_RUNTIME_PACK_FILE_PATTERN);
+        if (hermesMatch?.[1] && HERMES_RUNTIME_PACK_IDS.has(hermesMatch[1])) {
+          const hermesPack = findLatestHermesRuntimePack(runtimePackReleaseDirs, hermesMatch[1]);
+          if (!hermesPack || hermesPack.fileName !== fileName) {
+            sendApiError(res, 404, "runtime_pack_not_found", "Hermes runtime pack file was not found", "not_found_error");
+            return;
+          }
+          const hermesManifest = readRuntimePackManifest(hermesPack.filePath);
+          if (!hermesManifest || hermesManifest.allowed !== true) {
+            sendApiError(res, 409, "runtime_pack_not_allowed", "Hermes runtime pack is not allowed for download", "invalid_request_error");
+            return;
+          }
+          res.setHeader("Content-Type", "application/zip");
+          res.setHeader("Content-Length", String(hermesPack.sizeBytes));
+          res.setHeader("Content-Disposition", `attachment; filename="${hermesPack.fileName.replace(/"/g, "")}"`);
+          fs.createReadStream(hermesPack.filePath).pipe(res);
+          return;
+        }
+
         const runtimeMatch = fileName.match(WORKER_RUNTIME_PACK_FILE_PATTERN);
         if (!runtimeMatch?.[1] || !SUPPORTED_WORKER_RUNTIME_PACK_IDS.has(runtimeMatch[1])) {
           sendApiError(res, 400, "invalid_runtime_pack_file", "Invalid runtime pack file name", "invalid_request_error");
@@ -1023,6 +1150,11 @@ export function registerWorkerRuntimeRoutes(
           status: worker.status,
           workerId: worker.id,
           lastSeenAt: worker.lastSeenAt ?? null,
+          // Feature 135 §11 — surfaces workerRegistryService.ts's
+          // `enforceHermesMinVersion` warning (persisted in
+          // `warningFlagsJson`) so the Worker App can render an "update
+          // required" banner from this same heartbeat round-trip.
+          warningFlagsJson: Array.isArray(worker.warningFlagsJson) ? worker.warningFlagsJson : [],
         });
       } catch (error) {
         handleWorkerRouteError(error, res);
diff --git a/apps/web/server/services/workerRegistryService.ts b/apps/web/server/services/workerRegistryService.ts
index 75069137e..cee2e6af9 100644
--- a/apps/web/server/services/workerRegistryService.ts
+++ b/apps/web/server/services/workerRegistryService.ts
@@ -92,6 +92,7 @@ import {
   sanitizeWorkerPayload,
   sanitizeWorkerWarningFlags,
 } from "./workerPayloadSanitizer";
+import { getHermesWorkerSettings } from "./hermesWorkerSettings";
 
 const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
 
@@ -126,6 +127,89 @@ const HERMES_FABRIC_JOB_TYPES: ReadonlySet<string> = new Set([
 function isHermesFabricJobType(jobType: string): boolean {
   return HERMES_FABRIC_JOB_TYPES.has(jobType);
 }
+
+// ────────────────────────────────────────────────────────────────────────
+// Feature 135 §11 — server-side `hermes_worker_min_version` enforcement.
+// Applied at BOTH registration and heartbeat ingestion (never exempted by
+// runtimeType — the shared unit and Worker Apps are equally in scope). Pure
+// helper: no DB/network access, exported for `workerRegistryService.
+// hermesMinVersion.test.ts`.
+// ────────────────────────────────────────────────────────────────────────
+
+/** Extracts the numeric dotted segments from a version-ish string (e.g.
+ *  `"hermes-cli 0.18.2"` -> `[0, 18, 2]`). Non-numeric text around/between
+ *  segments is ignored rather than causing a parse failure. */
+function extractVersionSegments(raw: string): number[] {
+  const match = raw.match(/(\d+(?:\.\d+)*)/);
+  const versionText = match ? match[1] : raw;
+  return versionText.split(".").map((segment) => {
+    const parsed = Number.parseInt(segment, 10);
+    return Number.isFinite(parsed) ? parsed : 0;
+  });
+}
+
+/** Numeric-segment-wise comparison (NOT lexicographic) — `0.18.2` vs
+ *  `0.18.10` must correctly resolve `0.18.2 < 0.18.10`. Returns a negative
+ *  number when `a < b`, positive when `a > b`, `0` when equal. */
+function compareVersionsNumeric(a: string, b: string): number {
+  const segmentsA = extractVersionSegments(a);
+  const segmentsB = extractVersionSegments(b);
+  const length = Math.max(segmentsA.length, segmentsB.length);
+  for (let index = 0; index < length; index += 1) {
+    const diff = (segmentsA[index] ?? 0) - (segmentsB[index] ?? 0);
+    if (diff !== 0) return diff < 0 ? -1 : 1;
+  }
+  return 0;
+}
+
+export interface HermesMinVersionEnforcementResult {
+  capabilitiesJson: Record<string, unknown>;
+  belowMinimum: boolean;
+  warning?: string;
+}
+
+/**
+ * Forces `capabilitiesJson.hermesMedia.advertised = false` (+ a `reason`
+ * naming the minimum) when `hermesMedia.hermesVersion` is below
+ * `minVersion`. No-ops (returns the input capabilities untouched) when:
+ *  - `capabilitiesJson.hermesMedia` is absent (no crash, no synthesized
+ *    capability — never invents a hermesMedia block that wasn't offered),
+ *  - `hermesMedia.hermesVersion` is missing/blank, or
+ *  - `minVersion` is blank (`""` = no floor — `hermesWorkerSettings.ts`'s
+ *    documented default).
+ */
+export function enforceHermesMinVersion(
+  capabilitiesJson: unknown,
+  minVersion: string,
+): HermesMinVersionEnforcementResult {
+  const base: Record<string, unknown> = isPlainObject(capabilitiesJson) ? { ...capabilitiesJson } : {};
+  const hermesMedia = isPlainObject(base.hermesMedia) ? (base.hermesMedia as Record<string, unknown>) : null;
+  const hermesVersion = typeof hermesMedia?.hermesVersion === "string" ? hermesMedia.hermesVersion.trim() : "";
+  const trimmedMinVersion = (minVersion ?? "").trim();
+
+  if (!hermesMedia || !hermesVersion || !trimmedMinVersion) {
+    return { capabilitiesJson: base, belowMinimum: false };
+  }
+
+  if (compareVersionsNumeric(hermesVersion, trimmedMinVersion) >= 0) {
+    return { capabilitiesJson: base, belowMinimum: false };
+  }
+
+  const warning = `Hermes runtime version ${hermesVersion} is below the required minimum ${trimmedMinVersion}. Update the Worker App or shared worker runtime pack.`;
+  return {
+    capabilitiesJson: {
+      ...base,
+      hermesMedia: {
+        ...hermesMedia,
+        advertised: false,
+        reason: `below_minimum_version:${trimmedMinVersion}`,
+      },
+    },
+    belowMinimum: true,
+    warning,
+  };
+}
+
 const RECLAIMABLE_JOB_STATUSES: WorkerJobStatus[] = [
   "claimed",
   "preparing",
@@ -1120,6 +1204,18 @@ export async function registerWorker(
     input.auth.tenantId,
     input.payload.externalReference,
   );
+  const mergedCapabilitiesJson = mergeRuntimeMetadata(
+    {
+      ...(isPlainObject(input.payload.capabilitiesJson) ? input.payload.capabilitiesJson : {}),
+      ...(hasDelegatedSpendCaps ? { delegatedSpendCaps } : {}),
+    },
+    effectiveRuntimeMetadataWithAccessPolicy,
+  );
+  // Feature 135 §11 — server-side hermes_worker_min_version enforcement
+  // (applies regardless of runtimeType — the shared unit and Worker Apps
+  // alike). Absent hermesMedia block or absent setting ⇒ no-op.
+  const hermesMinVersion = (await getHermesWorkerSettings()).minHermesVersion;
+  const hermesEnforcement = enforceHermesMinVersion(mergedCapabilitiesJson, hermesMinVersion);
   const nextValues = {
     tenantId: input.auth.tenantId,
     teamId: input.payload.teamId ?? input.auth.teamId ?? null,
@@ -1135,13 +1231,7 @@ export async function registerWorker(
     policyProfileId: policyProfile?.id ?? null,
     externalReference: input.payload.externalReference,
     dashboardUrl: sanitizeDashboardUrl(input.payload.dashboardUrl ?? null),
-    capabilitiesJson: mergeRuntimeMetadata(
-      {
-        ...(isPlainObject(input.payload.capabilitiesJson) ? input.payload.capabilitiesJson : {}),
-        ...(hasDelegatedSpendCaps ? { delegatedSpendCaps } : {}),
-      },
-      effectiveRuntimeMetadataWithAccessPolicy,
-    ),
+    capabilitiesJson: hermesEnforcement.capabilitiesJson,
     hardwareJson: sanitizeWorkerPayload(input.payload.hardwareJson) as Record<string, unknown>,
     healthSummaryJson: buildWorkerHealthSummary(
       input.payload.healthSummaryJson,
@@ -1149,7 +1239,11 @@ export async function registerWorker(
       input.payload.compatibility,
       effectiveRuntimeMetadata,
     ),
-    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningFlagsJson),
+    warningFlagsJson: sanitizeWorkerWarningFlags(
+      hermesEnforcement.warning
+        ? [...sanitizeWorkerWarningFlags(input.payload.warningFlagsJson), hermesEnforcement.warning]
+        : input.payload.warningFlagsJson,
+    ),
     fileScopeMode: input.payload.fileScopeMode,
     lastSeenAt: new Date(),
     registeredByUserId: input.auth.registeredByUserId ?? null,
@@ -1230,20 +1324,32 @@ export async function recordWorkerHeartbeat(
     worker.status === "disabled" || worker.status === "draining"
       ? worker.status
       : input.payload.status;
+  const mergedHeartbeatCapabilitiesJson = mergeRuntimeMetadata(
+    worker.capabilitiesJson,
+    input.payload.runtimeMetadataJson ?? {},
+  );
+  // Feature 135 §11 — same rule as registration: a worker registered before
+  // an admin raised `hermes_worker_min_version` gets demoted on its next
+  // heartbeat (never exempted by runtimeType). The warning is surfaced on
+  // the returned/persisted `warningFlagsJson` — section-12 wires it into
+  // the heartbeat HTTP response's warning field.
+  const hermesMinVersion = (await getHermesWorkerSettings()).minHermesVersion;
+  const hermesEnforcement = enforceHermesMinVersion(mergedHeartbeatCapabilitiesJson, hermesMinVersion);
   const updatedWorker = await repo.updateWorker(worker.id, {
     status: nextStatus,
     runtimeVersion: input.payload.compatibility.runtimeVersion,
-    capabilitiesJson: mergeRuntimeMetadata(
-      worker.capabilitiesJson,
-      input.payload.runtimeMetadataJson ?? {},
-    ),
+    capabilitiesJson: hermesEnforcement.capabilitiesJson,
     healthSummaryJson: buildWorkerHealthSummary(
       worker.healthSummaryJson,
       worker.runtimeType,
       input.payload.compatibility,
       input.payload.runtimeMetadataJson ?? {},
     ),
-    warningFlagsJson: sanitizeWorkerWarningFlags(input.payload.warningsJson),
+    warningFlagsJson: sanitizeWorkerWarningFlags(
+      hermesEnforcement.warning
+        ? [...sanitizeWorkerWarningFlags(input.payload.warningsJson), hermesEnforcement.warning]
+        : input.payload.warningsJson,
+    ),
     lastSeenAt: new Date(),
   });
 
diff --git a/apps/worker-app/src-tauri/src/control_plane.rs b/apps/worker-app/src-tauri/src/control_plane.rs
index e1b6a36b2..986614731 100644
--- a/apps/worker-app/src-tauri/src/control_plane.rs
+++ b/apps/worker-app/src-tauri/src/control_plane.rs
@@ -10,6 +10,44 @@ pub const WORKER_RUNTIME_FAMILY_SCHEMA_VERSION: &str = "2026-04-08";
 pub const WORKER_RUNTIME_PROFILE_SCHEMA_VERSION: &str = "2026-04-08";
 pub const WORKER_RUNTIME_TYPE: &str = "desktop_zeroclaw_managed";
 pub const HYPERFRAMES_CAPABILITY: &str = "hyperframes_final_composite";
+/// Feature 135 §11 — matches `HERMES_MEDIA_CAPABILITY_FAMILY` in
+/// `hermes_executor.rs` (frozen to `apps/web/shared/workerRuntime.ts`'s
+/// `HERMES_MEDIA_CAPABILITY_FAMILIES[0]`).
+pub const HERMES_MEDIA_CAPABILITY: &str = "hermes-media-generation";
+
+/// Feature 135 §11 — registration-time Hermes readiness input. Kept as its
+/// own struct (rather than extra `build_registration_payload` positional
+/// params) so callers that have no Hermes doctor yet (i.e. it hasn't been
+/// installed) can pass `HermesRegistrationInfo::not_installed()`.
+#[derive(Debug, Clone)]
+pub struct HermesRegistrationInfo {
+    pub ready: bool,
+    pub reason: String,
+    pub hermes_version: Option<String>,
+}
+
+impl HermesRegistrationInfo {
+    pub fn not_installed() -> Self {
+        Self {
+            ready: false,
+            reason: "hermes_not_installed".into(),
+            hermes_version: None,
+        }
+    }
+
+    pub fn from_doctor(doctor: &DoctorSummary, hermes_version: Option<String>) -> Self {
+        let ready = doctor.status == "ready";
+        Self {
+            ready,
+            reason: if ready {
+                "doctor_passed".into()
+            } else {
+                "doctor_not_ready".into()
+            },
+            hermes_version,
+        }
+    }
+}
 
 #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
 #[serde(rename_all = "camelCase")]
@@ -57,6 +95,24 @@ pub fn build_registration_payload(
     settings: &WorkerAppSettings,
     doctor: &DoctorSummary,
     device_binding: WorkerDeviceBinding,
+) -> WorkerAppRegistrationPayload {
+    build_registration_payload_with_hermes(
+        settings,
+        doctor,
+        device_binding,
+        &HermesRegistrationInfo::not_installed(),
+    )
+}
+
+/// Feature 135 §11 — same payload as `build_registration_payload`, plus
+/// `capabilitiesJson.hermesMedia = { capability, advertised, reason,
+/// hermesVersion }`, gated on the Hermes doctor exactly like `hyperframes`
+/// is gated on its own doctor.
+pub fn build_registration_payload_with_hermes(
+    settings: &WorkerAppSettings,
+    doctor: &DoctorSummary,
+    device_binding: WorkerDeviceBinding,
+    hermes: &HermesRegistrationInfo,
 ) -> WorkerAppRegistrationPayload {
     let ready = doctor.status == "ready";
     let machine_name = machine_name();
@@ -112,6 +168,12 @@ pub fn build_registration_payload(
                 "advertised": ready,
                 "reason": if ready { "doctor_passed" } else { "doctor_not_ready" },
             },
+            "hermesMedia": {
+                "capability": HERMES_MEDIA_CAPABILITY,
+                "advertised": hermes.ready,
+                "reason": hermes.reason,
+                "hermesVersion": hermes.hermes_version,
+            },
             "workerApp": {
                 "sharingMode": settings.sharing_mode,
                 "acceptJobs": settings.accept_jobs && ready,
@@ -244,6 +306,86 @@ mod tests {
             ready_payload.capabilities_json["hyperframes"]["advertised"],
             true
         );
+        // Feature 135 §11 — hermesMedia defaults to not-advertised when the
+        // caller doesn't pass Hermes readiness info at all.
+        assert_eq!(
+            blocked_payload.capabilities_json["hermesMedia"]["advertised"],
+            false
+        );
+        assert_eq!(
+            blocked_payload.capabilities_json["hermesMedia"]["capability"],
+            "hermes-media-generation"
+        );
+    }
+
+    #[test]
+    fn registration_advertises_hermes_media_only_when_hermes_doctor_is_ready() {
+        let settings = WorkerAppSettings {
+            accept_jobs: true,
+            ..WorkerAppSettings::default()
+        };
+        let ready_hyperframes = DoctorSummary {
+            status: "ready".into(),
+            checks: vec![],
+            recommended_actions: vec![],
+            official_hyperframes_runtime: None,
+            runtime_kind: None,
+        };
+        let hermes_blocked = DoctorSummary {
+            status: "blocked".into(),
+            checks: vec![],
+            recommended_actions: vec!["Install the Hermes runtime pack".into()],
+            official_hyperframes_runtime: None,
+            runtime_kind: Some("hermes".into()),
+        };
+        let hermes_ready = DoctorSummary {
+            status: "ready".into(),
+            checks: vec![],
+            recommended_actions: vec![],
+            official_hyperframes_runtime: None,
+            runtime_kind: Some("hermes".into()),
+        };
+        let device_binding = WorkerDeviceBinding {
+            device_id: "wdev_test".into(),
+            machine_fingerprint: "machine_test".into(),
+            public_key: "-----BEGIN PUBLIC KEY-----\\ntest\\n-----END PUBLIC KEY-----".into(),
+        };
+
+        let blocked_payload = build_registration_payload_with_hermes(
+            &settings,
+            &ready_hyperframes,
+            device_binding.clone(),
+            &HermesRegistrationInfo::from_doctor(&hermes_blocked, None),
+        );
+        let ready_payload = build_registration_payload_with_hermes(
+            &settings,
+            &ready_hyperframes,
+            device_binding,
+            &HermesRegistrationInfo::from_doctor(&hermes_ready, Some("hermes-cli 0.18.2".into())),
+        );
+
+        assert_eq!(
+            blocked_payload.capabilities_json["hermesMedia"]["advertised"],
+            false
+        );
+        assert_eq!(
+            blocked_payload.capabilities_json["hermesMedia"]["reason"],
+            "doctor_not_ready"
+        );
+        assert_eq!(
+            ready_payload.capabilities_json["hermesMedia"]["advertised"],
+            true
+        );
+        assert_eq!(
+            ready_payload.capabilities_json["hermesMedia"]["hermesVersion"],
+            "hermes-cli 0.18.2"
+        );
+        // Registering hermes readiness must never disturb the independent
+        // hyperframes gate.
+        assert_eq!(
+            ready_payload.capabilities_json["hyperframes"]["advertised"],
+            true
+        );
     }
 
     #[test]
diff --git a/apps/worker-app/src-tauri/src/hermes_runtime.rs b/apps/worker-app/src-tauri/src/hermes_runtime.rs
new file mode 100644
index 000000000..80c076a0b
--- /dev/null
+++ b/apps/worker-app/src-tauri/src/hermes_runtime.rs
@@ -0,0 +1,394 @@
+//! Feature 135 §11 — Hermes runtime pack manifest, install-layout resolution,
+//! and `hermes_doctor()`.
+//!
+//! Mirrors the shape of `runtime_manifest.rs`'s HyperFrames manifest/doctor
+//! (installed-vs-bundled resolution, `DoctorSummary`/`DoctorCheck` reuse) but
+//! is otherwise independent: hermes-ness is a distinct runtime pack family
+//! served by the same `/api/workers/runtime-pack/manifest` endpoint under the
+//! two runtime ids below (see `apps/web/server/routes/workerRuntime.ts`'s
+//! manifest-serving region and `apps/web/scripts/build-hermes-runtime-pack.ts`).
+use serde::{Deserialize, Serialize};
+use serde_json::json;
+use std::fs;
+use std::path::{Path, PathBuf};
+
+use crate::runtime_manifest::{DoctorCheck, DoctorSummary};
+
+/// Runtime ids — frozen strings, kept in lockstep with the server-side
+/// manifest-serving region (`workerRuntime.ts`) and the pack build script
+/// (`build-hermes-runtime-pack.ts`). Windows ships first (spec §1); the
+/// macOS id is registered `allowed: false` until its pack is built.
+pub const HERMES_RUNTIME_ID_WINDOWS: &str = "hermes-windows-x64";
+pub const HERMES_RUNTIME_ID_MACOS: &str = "hermes-macos-arm64";
+
+/// Pinned Hermes CLI version (`hermes-agent==0.18.2` — spec §15 version-skew
+/// policy). Doctor readiness requires the queried `hermes --version` output
+/// to contain this exact string; a mismatch degrades (not blocks) readiness
+/// since an old-but-functional Hermes pack can still run jobs the server's
+/// own `hermes_worker_min_version` enforcement (`workerRegistryService.ts`)
+/// will separately gate.
+pub const HERMES_PINNED_VERSION: &str = "0.18.2";
+
+#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
+#[serde(rename_all = "camelCase")]
+pub struct HermesRuntimeManifest {
+    pub runtime_id: String,
+    pub version: String,
+    /// Pinned `hermes-agent` version this pack bundles (informational — the
+    /// authoritative pin check is against `HERMES_PINNED_VERSION`).
+    pub hermes_version: String,
+    /// Path (relative to the pack root) to the bundled Python interpreter.
+    pub python_relative_path: String,
+    /// Path (relative to the pack root) to the `hermes` CLI entry point.
+    pub hermes_relative_path: String,
+    pub checksum_file: String,
+    pub signature_file: String,
+    pub allowed: bool,
+    #[serde(default)]
+    pub deny_reason: Option<String>,
+    #[serde(default)]
+    pub archive_url: Option<String>,
+    #[serde(default)]
+    pub archive_sha256: Option<String>,
+    #[serde(default)]
+    pub archive_size_bytes: Option<u64>,
+}
+
+pub fn read_hermes_runtime_manifest(manifest_path: &Path) -> Result<HermesRuntimeManifest, String> {
+    fs::read_to_string(manifest_path)
+        .map_err(|error| error.to_string())
+        .and_then(|contents| {
+            serde_json::from_str::<HermesRuntimeManifest>(&contents)
+                .map_err(|error| error.to_string())
+        })
+}
+
+/// Installed-vs-bundled resolution (mirrors `runtime_manifest::runtime_pack_paths`,
+/// simplified: there is no bundled hermes pack shipped inside app resources —
+/// Windows ships via explicit download through `worker_app_install_hermes_runtime`
+/// — so the installed copy under the app data dir is the only location).
+pub fn hermes_runtime_pack_paths(app_data_dir: &Path) -> (PathBuf, PathBuf) {
+    let root = app_data_dir.join("hermes-runtime");
+    (root.join("manifest.json"), root)
+}
+
+/// Result of probing `<hermes-executable> --version`.
+pub type HermesVersionQuery = Result<String, String>;
+
+pub fn hermes_doctor_from_manifest_path(
+    manifest_path: &Path,
+    pack_root: &Path,
+    profile_root: &Path,
+    query_version: impl Fn(&Path) -> HermesVersionQuery,
+) -> DoctorSummary {
+    let manifest = match read_hermes_runtime_manifest(manifest_path) {
+        Ok(manifest) => manifest,
+        Err(error) => {
+            return DoctorSummary {
+                status: "blocked".into(),
+                checks: vec![DoctorCheck {
+                    id: "hermes_runtime_manifest".into(),
+                    status: "error".into(),
+                    message: format!("Hermes runtime manifest is unavailable: {error}"),
+                    details_json: json!({ "path": manifest_path.to_string_lossy() }),
+                }],
+                recommended_actions: vec!["Install the Hermes runtime pack".into()],
+                official_hyperframes_runtime: None,
+                runtime_kind: Some("hermes".into()),
+            };
+        }
+    };
+    hermes_doctor_from_manifest(&manifest, pack_root, profile_root, query_version)
+}
+
+/// `hermes_doctor()` — checks: python present, `hermes --version` == pin,
+/// profile root writable (spec §11 5.1). Manifest `allowed: false` short-
+/// circuits to `blocked` before any other check runs.
+pub fn hermes_doctor_from_manifest(
+    manifest: &HermesRuntimeManifest,
+    pack_root: &Path,
+    profile_root: &Path,
+    query_version: impl Fn(&Path) -> HermesVersionQuery,
+) -> DoctorSummary {
+    let mut checks = Vec::new();
+    let mut recommended_actions = Vec::new();
+
+    checks.push(DoctorCheck {
+        id: "hermes_runtime_manifest".into(),
+        status: if manifest.allowed { "ok" } else { "error" }.into(),
+        message: if manifest.allowed {
+            format!("Hermes runtime pack {} is allowed.", manifest.version)
+        } else {
+            manifest
+                .deny_reason
+                .clone()
+                .unwrap_or_else(|| "Hermes runtime pack is denied by policy.".into())
+        },
+        details_json: json!({ "runtimeId": manifest.runtime_id, "version": manifest.version }),
+    });
+    if !manifest.allowed {
+        recommended_actions.push("Install an allowed Hermes runtime pack version".into());
+        return DoctorSummary {
+            status: "blocked".into(),
+            checks,
+            recommended_actions,
+            official_hyperframes_runtime: None,
+            runtime_kind: Some("hermes".into()),
+        };
+    }
+
+    let python_path = pack_root.join(&manifest.python_relative_path);
+    let hermes_path = pack_root.join(&manifest.hermes_relative_path);
+
+    let python_present = python_path.is_file();
+    checks.push(DoctorCheck {
+        id: "hermes_python_present".into(),
+        status: if python_present { "ok" } else { "error" }.into(),
+        message: if python_present {
+            "Bundled Python runtime is present.".into()
+        } else {
+            "Bundled Python runtime is missing from the Hermes runtime pack.".into()
+        },
+        details_json: json!({ "pythonPath": python_path.to_string_lossy() }),
+    });
+    if !python_present {
+        recommended_actions
+            .push("Reinstall the Hermes runtime pack (missing bundled Python).".into());
+    }
+
+    let (version_status, version_message, queried_version) = match query_version(&hermes_path) {
+        Ok(output) => {
+            let trimmed = output.trim().to_string();
+            if trimmed.contains(HERMES_PINNED_VERSION) {
+                (
+                    "ok",
+                    format!("hermes --version reports the pinned {HERMES_PINNED_VERSION}."),
+                    Some(trimmed),
+                )
+            } else {
+                (
+                    "warn",
+                    format!(
+                        "hermes --version reported \"{trimmed}\", expected the pinned {HERMES_PINNED_VERSION}."
+                    ),
+                    Some(trimmed),
+                )
+            }
+        }
+        Err(error) => (
+            "error",
+            format!("Unable to run hermes --version: {error}"),
+            None,
+        ),
+    };
+    checks.push(DoctorCheck {
+        id: "hermes_version".into(),
+        status: version_status.into(),
+        message: version_message,
+        details_json: json!({ "expected": HERMES_PINNED_VERSION, "reported": queried_version }),
+    });
+    if version_status == "warn" {
+        recommended_actions.push(format!(
+            "Update the Hermes runtime pack to the pinned version {HERMES_PINNED_VERSION}."
+        ));
+    } else if version_status == "error" {
+        recommended_actions
+            .push("Reinstall the Hermes runtime pack (hermes binary is not runnable).".into());
+    }
+
+    let profile_root_writable = ensure_writable_dir(profile_root);
+    checks.push(DoctorCheck {
+        id: "hermes_profile_root_writable".into(),
+        status: if profile_root_writable { "ok" } else { "error" }.into(),
+        message: if profile_root_writable {
+            "Hermes profile root is writable.".into()
+        } else {
+            "Hermes profile root is not writable.".into()
+        },
+        details_json: json!({ "profileRoot": profile_root.to_string_lossy() }),
+    });
+    if !profile_root_writable {
+        recommended_actions.push("Grant write access to the Hermes profile directory.".into());
+    }
+
+    let has_error = checks.iter().any(|check| check.status == "error");
+    let has_warn = checks.iter().any(|check| check.status == "warn");
+    DoctorSummary {
+        status: if has_error {
+            "blocked"
+        } else if has_warn {
+            "degraded"
+        } else {
+            "ready"
+        }
+        .into(),
+        checks,
+        recommended_actions,
+        official_hyperframes_runtime: None,
+        runtime_kind: Some("hermes".into()),
+    }
+}
+
+fn ensure_writable_dir(dir: &Path) -> bool {
+    if fs::create_dir_all(dir).is_err() {
+        return false;
+    }
+    let probe = dir.join(".write_probe");
+    match fs::write(&probe, b"ok") {
+        Ok(_) => {
+            let _ = fs::remove_file(&probe);
+            true
+        }
+        Err(_) => false,
+    }
+}
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    fn manifest(allowed: bool) -> HermesRuntimeManifest {
+        HermesRuntimeManifest {
+            runtime_id: HERMES_RUNTIME_ID_WINDOWS.into(),
+            version: "0.1.0".into(),
+            hermes_version: HERMES_PINNED_VERSION.into(),
+            python_relative_path: "python/python.exe".into(),
+            hermes_relative_path: "python/Scripts/hermes.exe".into(),
+            checksum_file: "SHA256SUMS".into(),
+            signature_file: "SHA256SUMS.sig".into(),
+            allowed,
+            deny_reason: None,
+            archive_url: None,
+            archive_sha256: None,
+            archive_size_bytes: None,
+        }
+    }
+
+    fn write_python(root: &Path, manifest: &HermesRuntimeManifest) {
+        let python_path = root.join(&manifest.python_relative_path);
+        fs::create_dir_all(python_path.parent().unwrap()).unwrap();
+        fs::write(&python_path, b"fake python").unwrap();
+    }
+
+    #[test]
+    fn doctor_is_ready_when_python_pin_and_profile_root_all_pass() {
+        let dir = tempfile::tempdir().unwrap();
+        let pack_root = dir.path().join("pack");
+        let profile_root = dir.path().join("profiles");
+        let manifest = manifest(true);
+        write_python(&pack_root, &manifest);
+
+        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
+            Ok("hermes-cli 0.18.2".to_string())
+        });
+
+        assert_eq!(summary.status, "ready");
+        assert!(profile_root.is_dir());
+    }
+
+    #[test]
+    fn doctor_degrades_on_version_mismatch_and_names_the_pin() {
+        let dir = tempfile::tempdir().unwrap();
+        let pack_root = dir.path().join("pack");
+        let profile_root = dir.path().join("profiles");
+        let manifest = manifest(true);
+        write_python(&pack_root, &manifest);
+
+        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
+            Ok("hermes-cli 0.17.0".to_string())
+        });
+
+        assert_eq!(summary.status, "degraded");
+        let version_check = summary
+            .checks
+            .iter()
+            .find(|check| check.id == "hermes_version")
+            .unwrap();
+        assert_eq!(version_check.status, "warn");
+        assert!(version_check.message.contains(HERMES_PINNED_VERSION));
+    }
+
+    #[test]
+    fn doctor_blocks_when_hermes_binary_is_missing_or_unrunnable() {
+        let dir = tempfile::tempdir().unwrap();
+        let pack_root = dir.path().join("pack");
+        let profile_root = dir.path().join("profiles");
+        let manifest = manifest(true);
+        write_python(&pack_root, &manifest);
+
+        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
+            Err("no such file or directory".to_string())
+        });
+
+        assert_eq!(summary.status, "blocked");
+        assert!(summary
+            .checks
+            .iter()
+            .any(|check| check.id == "hermes_version" && check.status == "error"));
+    }
+
+    #[test]
+    fn doctor_blocks_when_python_is_missing_from_the_pack() {
+        let dir = tempfile::tempdir().unwrap();
+        let pack_root = dir.path().join("pack");
+        let profile_root = dir.path().join("profiles");
+        let manifest = manifest(true);
+        // Intentionally do not write the python binary.
+
+        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
+            Ok("hermes-cli 0.18.2".to_string())
+        });
+
+        assert_eq!(summary.status, "blocked");
+        assert!(summary
+            .checks
+            .iter()
+            .any(|check| check.id == "hermes_python_present" && check.status == "error"));
+    }
+
+    #[test]
+    fn manifest_allowed_false_blocks_doctor_before_other_checks_run() {
+        let dir = tempfile::tempdir().unwrap();
+        let pack_root = dir.path().join("pack");
+        let profile_root = dir.path().join("profiles");
+        let mut manifest = manifest(false);
+        manifest.deny_reason = Some("macOS pack has not shipped yet".into());
+        write_python(&pack_root, &manifest);
+
+        let summary = hermes_doctor_from_manifest(&manifest, &pack_root, &profile_root, |_path| {
+            panic!("query_version must not run once the manifest denies the pack");
+        });
+
+        assert_eq!(summary.status, "blocked");
+        assert_eq!(summary.checks.len(), 1);
+        assert!(summary
+            .recommended_actions
+            .iter()
+            .any(|action| action.contains("allowed Hermes runtime pack")));
+    }
+
+    #[test]
+    fn missing_manifest_file_reports_blocked_doctor() {
+        let dir = tempfile::tempdir().unwrap();
+        let summary = hermes_doctor_from_manifest_path(
+            &dir.path().join("manifest.json"),
+            &dir.path().join("pack"),
+            &dir.path().join("profiles"),
+            |_path| Ok("hermes-cli 0.18.2".to_string()),
+        );
+
+        assert_eq!(summary.status, "blocked");
+        assert!(summary
+            .recommended_actions
+            .contains(&"Install the Hermes runtime pack".to_string()));
+    }
+
+    #[test]
+    fn runtime_pack_paths_resolve_under_the_app_data_dir() {
+        let dir = tempfile::tempdir().unwrap();
+        let (manifest_path, root) = hermes_runtime_pack_paths(dir.path());
+
+        assert_eq!(root, dir.path().join("hermes-runtime"));
+        assert_eq!(manifest_path, dir.path().join("hermes-runtime/manifest.json"));
+    }
+}
diff --git a/apps/worker-app/src-tauri/src/worker_loop.rs b/apps/worker-app/src-tauri/src/worker_loop.rs
index a49934e25..619c019e5 100644
--- a/apps/worker-app/src-tauri/src/worker_loop.rs
+++ b/apps/worker-app/src-tauri/src/worker_loop.rs
@@ -1,6 +1,7 @@
 use serde::{Deserialize, Serialize};
 use serde_json::{json, Value};
 use sha2::{Digest, Sha256};
+use std::collections::HashMap;
 use std::fs;
 use std::path::{Path, PathBuf};
 use std::process::{Child, Command, Stdio};
@@ -8,12 +9,20 @@ use std::sync::{
     atomic::{AtomicBool, Ordering},
     Arc, Mutex,
 };
-use std::time::{Duration, Instant};
+use std::time::{Duration, Instant, SystemTime};
 use tauri::async_runtime::JoinHandle;
 
 use crate::credentials::clear_connection;
 use crate::diagnostics::append_diagnostic_event;
 use crate::executor_state::{ExecutorState, ExecutorStatus};
+use crate::hermes_executor::{
+    build_production_refresh_closure, download_and_verify_reference, execute_hermes_media_job_core,
+    production_fetch_reference, production_ffprobe, run_hermes_connection_authorize,
+    run_hermes_connection_disconnect, run_hermes_connection_probe, spawn_hermes_process,
+    HermesControlOutcome, HermesFailure, HermesMediaJobDeps, HermesProfileStore,
+    RealHermesControlDeps, HERMES_MEDIA_CLAIM_CAPABILITY,
+};
+use crate::hermes_runtime::{hermes_doctor_from_manifest_path, hermes_runtime_pack_paths, read_hermes_runtime_manifest};
 use crate::runtime_manifest::{
     doctor_from_manifest_path, read_runtime_pack_manifest, runtime_pack_paths,
     sidecar_path_from_manifest, DoctorSummary,
@@ -27,11 +36,97 @@ use crate::worker_control_plane::{
 use crate::worker_executor::{
     build_failure_event, build_progress_event_plan, build_required_artifact_uploads,
     build_sidecar_command, build_sidecar_manifest, build_worker_job_display_metadata,
-    compact_json_artifact_metadata, prepare_hyperframes_execution_plan,
-    validate_final_video_artifact, ClaimedWorkerJob, SidecarCommandPlan, WorkerEventPlan,
-    HYPERFRAMES_FINAL_VIDEO_MIN_BYTES, HYPERFRAMES_JOB_TYPE,
+    classify_job_type, compact_json_artifact_metadata, prepare_hyperframes_execution_plan,
+    sanitize_segment, validate_final_video_artifact, ClaimedWorkerJob, SidecarCommandPlan,
+    WorkerEventPlan, WorkerJobKind, HYPERFRAMES_FINAL_VIDEO_MIN_BYTES, HYPERFRAMES_JOB_TYPE,
 };
 
+/// Feature 135 §11 — hermes has its own single-job slot, independent of the
+/// render (HyperFrames) slot(s) governed by `max_concurrent_jobs`. Default 1
+/// per spec §11 5.3 ("1 hermes job max; render throughput unaffected").
+const HERMES_MEDIA_MAX_CONCURRENT_JOBS: u32 = 1;
+
+/// Feature 135 §11 — claim `capability_hints` construction. Render hints are
+/// included only when the render (HyperFrames) doctor is ready; `hermes_media`
+/// is appended only when this worker's Hermes doctor is ready. Both gates are
+/// independent — a worker with only one runtime installed still claims that
+/// runtime's jobs (this is what unblocks a hermes-only worker: previously
+/// `worker_loop_tick` bailed out entirely whenever the render doctor wasn't
+/// ready, before ever reaching this call).
+pub fn build_worker_claim_capability_hints(render_ready: bool, hermes_media_advertised: bool) -> Vec<String> {
+    let mut hints = Vec::new();
+    if render_ready {
+        hints.push("hyperframes-final-composite".to_string());
+        hints.push(HYPERFRAMES_JOB_TYPE.to_string());
+    }
+    if hermes_media_advertised {
+        hints.push(HERMES_MEDIA_CLAIM_CAPABILITY.to_string());
+    }
+    hints
+}
+
+/// Slot accounting: a second hermes job is never claimed concurrently while
+/// one is already running; render slot availability (`max_concurrent_jobs`)
+/// is entirely independent of hermes activity.
+pub fn can_claim_hermes_media_job(hermes_jobs_active: u32) -> bool {
+    hermes_jobs_active < HERMES_MEDIA_MAX_CONCURRENT_JOBS
+}
+
+pub fn can_claim_render_job(render_jobs_active: u32, max_concurrent_jobs: u32) -> bool {
+    render_jobs_active < max_concurrent_jobs.max(1)
+}
+
+/// Feature 135 §11 FIX 1 — resolves the hermes doctor (python present,
+/// `hermes --version` == pin, profile root writable) from the app data dir
+/// and folds it into the claim `capability_hints`, in ONE call so the
+/// wiring is directly testable end-to-end (real filesystem + injected
+/// version-query closure — no network).
+pub fn resolve_hermes_doctor(
+    app_data_dir: &Path,
+    query_version: impl Fn(&Path) -> Result<String, String>,
+) -> DoctorSummary {
+    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
+    let profile_root = app_data_dir.join("hermes-profiles");
+    hermes_doctor_from_manifest_path(&manifest_path, &pack_root, &profile_root, query_version)
+}
+
+/// Combines a fresh hermes doctor probe with the pure hint builder — the
+/// integration-level seam `resolve_hermes_doctor_and_hints_ready_vs_degraded`
+/// exercises directly (real filesystem doctor computation, no network).
+pub fn resolve_hermes_claim_hints(
+    app_data_dir: &Path,
+    render_ready: bool,
+    query_version: impl Fn(&Path) -> Result<String, String>,
+) -> (Vec<String>, DoctorSummary) {
+    let doctor = resolve_hermes_doctor(app_data_dir, query_version);
+    let hints = build_worker_claim_capability_hints(render_ready, doctor.status == "ready");
+    (hints, doctor)
+}
+
+/// Caches the hermes doctor probe so the loop does not shell out to
+/// `hermes --version` on every 10s tick (spec: "cache it per tick or per N
+/// ticks — don't shell out every loop").
+struct HermesDoctorCache {
+    checked_at: Instant,
+    doctor: DoctorSummary,
+}
+
+const HERMES_DOCTOR_REFRESH_INTERVAL: Duration = Duration::from_secs(60);
+
+fn hermes_doctor_cached(app_data_dir: &Path, cache: &mut Option<HermesDoctorCache>) -> DoctorSummary {
+    let needs_refresh = cache
+        .as_ref()
+        .map_or(true, |existing| existing.checked_at.elapsed() >= HERMES_DOCTOR_REFRESH_INTERVAL);
+    if needs_refresh {
+        let doctor = resolve_hermes_doctor(app_data_dir, crate::commands::query_hermes_version);
+        *cache = Some(HermesDoctorCache {
+            checked_at: Instant::now(),
+            doctor,
+        });
+    }
+    cache.as_ref().expect("cache is populated above").doctor.clone()
+}
+
 const IDLE_CLAIM_INTERVAL: Duration = Duration::from_secs(10);
 const ACTIVE_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
 const CLAIM_WATCHDOG_TIMEOUT: Duration = Duration::from_secs(20);
@@ -291,6 +386,13 @@ async fn run_worker_loop(
 ) {
     set_executor_polling(&executor, "Worker loop started.");
     let mut stopped_for_terminal_error = false;
+    // Feature 135 §11 — one profile store per loop lifetime (restored from
+    // disk so `verify_connection_affinity` survives a restart) and a
+    // doctor cache so hermes readiness isn't re-probed every tick.
+    let hermes_profiles = Arc::new(Mutex::new(HermesProfileStore::from_existing_root(
+        app_data_dir.join("hermes-profiles"),
+    )));
+    let mut hermes_doctor_cache: Option<HermesDoctorCache> = None;
     while !cancel.load(Ordering::Relaxed) {
         let _ = crate::commands::try_refresh_connection_if_needed(&app_data_dir, &connection).await;
 
@@ -301,6 +403,8 @@ async fn run_worker_loop(
             &app_data_dir,
             &connection,
             &cancel,
+            &hermes_profiles,
+            &mut hermes_doctor_cache,
         )
         .await;
         if let Err(error) = tick_result {
@@ -359,6 +463,8 @@ async fn worker_loop_tick(
     app_data_dir: &Path,
     connection: &Arc<Mutex<WorkerLoopConnection>>,
     cancel: &Arc<AtomicBool>,
+    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
+    hermes_doctor_cache: &mut Option<HermesDoctorCache>,
 ) -> Result<(), String> {
     let settings_snapshot = settings
         .lock()
@@ -377,8 +483,16 @@ async fn worker_loop_tick(
         true,
         &effective_runtime_dir,
     );
-    let runtime_ready = doctor.status == "ready";
-    let accepts_jobs = settings_snapshot.accept_jobs && runtime_ready;
+    let render_ready = doctor.status == "ready";
+
+    // Feature 135 §11 FIX 1 — hermes doctor probed (cached, see
+    // `HERMES_DOCTOR_REFRESH_INTERVAL`) and folded into both the heartbeat's
+    // `acceptJobs`/`claimEnabled` signal and the claim's capability hints.
+    let hermes_doctor = hermes_doctor_cached(app_data_dir, hermes_doctor_cache);
+    let hermes_ready = hermes_doctor.status == "ready";
+
+    let any_runtime_ready = render_ready || hermes_ready;
+    let accepts_jobs = settings_snapshot.accept_jobs && any_runtime_ready;
     let connection_snapshot = clone_connection(connection)?;
     heartbeat(
         executor,
@@ -396,7 +510,7 @@ async fn worker_loop_tick(
         );
         return Ok(());
     }
-    if !runtime_ready {
+    if !any_runtime_ready {
         set_executor_error(executor, runtime_block_message(&doctor));
         return Ok(());
     }
@@ -410,10 +524,7 @@ async fn worker_loop_tick(
         connection_snapshot,
         WorkerClaimRequest {
             max_jobs,
-            capability_hints: vec![
-                "hyperframes-final-composite".into(),
-                HYPERFRAMES_JOB_TYPE.into(),
-            ],
+            capability_hints: build_worker_claim_capability_hints(render_ready, hermes_ready),
         },
         CLAIM_WATCHDOG_TIMEOUT,
     )
@@ -434,17 +545,55 @@ async fn worker_loop_tick(
         return Ok(());
     };
 
-    execute_hyperframes_job(
-        executor,
-        resource_dir,
-        app_data_dir,
-        connection,
-        job,
-        &doctor,
-        &settings_snapshot,
-        cancel,
-    )
-    .await
+    match classify_job_type(&job.job_type) {
+        WorkerJobKind::Hyperframes => {
+            execute_hyperframes_job(
+                executor,
+                resource_dir,
+                app_data_dir,
+                connection,
+                job,
+                &doctor,
+                &settings_snapshot,
+                cancel,
+            )
+            .await
+        }
+        WorkerJobKind::HermesMediaImage | WorkerJobKind::HermesMediaVideo => {
+            execute_hermes_media_job(
+                executor,
+                app_data_dir,
+                connection,
+                job,
+                &hermes_doctor,
+                hermes_profiles,
+                &settings_snapshot,
+            )
+            .await
+        }
+        WorkerJobKind::HermesConnectionAuthorize
+        | WorkerJobKind::HermesConnectionProbe
+        | WorkerJobKind::HermesConnectionDisconnect => {
+            execute_hermes_control_job(app_data_dir, connection, job, hermes_profiles).await
+        }
+        WorkerJobKind::Unknown => {
+            // The server offered a job type this Worker App build does not
+            // know how to execute — fail explicitly rather than silently
+            // assuming it's a HyperFrames render (the prior, section-11-era
+            // behavior, back when this dispatch only ever knew one job kind).
+            let failure = build_failure_event(
+                &job,
+                FAILURE_EVENT_SEQUENCE_NUMBER,
+                "unsupported_job_type",
+                &format!("Worker App does not support job type: {}", job.job_type),
+            );
+            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
+            Err(format!(
+                "worker received an unsupported job type: {}",
+                job.job_type
+            ))
+        }
+    }
 }
 
 async fn claim_worker_job_with_watchdog(
@@ -508,10 +657,29 @@ async fn heartbeat(
             "serviceMode": if settings.start_with_windows { "auto_start_requested" } else { "foreground" },
         }),
     );
-    send_worker_heartbeat(connection, &payload).await?;
+    let response = send_worker_heartbeat(connection, &payload).await?;
+    apply_hermes_heartbeat_warning(executor, &response.warning_flags_json);
     Ok(())
 }
 
+/// Feature 135 §11 FIX 4 — surfaces the server's `hermes_worker_min_version`
+/// enforcement warning (see `workerRegistryService.ts::enforceHermesMinVersion`)
+/// from the heartbeat response into `ExecutorState.hermes`, which
+/// `src/main.tsx`'s "update required" banner already renders.
+fn find_hermes_update_warning(warnings: &[String]) -> Option<String> {
+    warnings
+        .iter()
+        .find(|warning| warning.starts_with("Hermes runtime version"))
+        .cloned()
+}
+
+fn apply_hermes_heartbeat_warning(executor: &Arc<Mutex<ExecutorState>>, warnings: &[String]) {
+    let reason = find_hermes_update_warning(warnings);
+    if let Ok(mut executor) = executor.lock() {
+        executor.set_hermes_update_required(reason.is_some(), reason);
+    }
+}
+
 fn runtime_block_message(doctor: &DoctorSummary) -> String {
     let preferred_check_ids = [
         "wsl2_browser_dependencies",
@@ -561,6 +729,303 @@ fn runtime_block_message(doctor: &DoctorSummary) -> String {
     parts.join(" ")
 }
 
+// ────────────────────────────────────────────────────────────────────────
+// Feature 135 §11 FIX 1/2 — hermes media job dispatch, wired to REAL
+// production deps (spawn_hermes_process, reqwest reference download/refresh,
+// upload_worker_artifact_file, report_worker_job_event) via
+// `execute_hermes_media_job_core`. All blocking + `block_on`-bridged network
+// I/O runs inside `spawn_blocking` (never on the main async executor thread).
+// ────────────────────────────────────────────────────────────────────────
+
+async fn execute_hermes_media_job(
+    executor: &Arc<Mutex<ExecutorState>>,
+    app_data_dir: &Path,
+    connection: &Arc<Mutex<WorkerLoopConnection>>,
+    job: ClaimedWorkerJob,
+    hermes_doctor: &DoctorSummary,
+    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
+    settings: &WorkerAppSettings,
+) -> Result<(), String> {
+    set_executor_job(executor, &job);
+    let connection_snapshot = clone_connection(connection)?;
+
+    let result =
+        execute_hermes_media_job_inner(app_data_dir, &connection_snapshot, &job, hermes_doctor, hermes_profiles, settings)
+            .await;
+
+    match &result {
+        Ok(()) => {
+            set_executor_last_job(
+                executor,
+                &job,
+                "success",
+                "Hermes media job completed and artifacts uploaded.",
+                None,
+            );
+            set_executor_complete(executor, "Hermes media job completed and artifacts uploaded.");
+        }
+        Err(error) => {
+            let failure = build_failure_event(&job, FAILURE_EVENT_SEQUENCE_NUMBER, "hermes_media_failed", error);
+            let _ = send_event_with_refresh(app_data_dir, connection, &job.id, failure).await;
+            let error_msg = format!("Hermes media job failed: {error}");
+            set_executor_last_job(executor, &job, "error", &error_msg, None);
+            set_executor_error(executor, error_msg);
+        }
+    }
+    result
+}
+
+async fn execute_hermes_media_job_inner(
+    app_data_dir: &Path,
+    connection: &WorkerLoopConnection,
+    job: &ClaimedWorkerJob,
+    hermes_doctor: &DoctorSummary,
+    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
+    settings: &WorkerAppSettings,
+) -> Result<(), String> {
+    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
+    let manifest = read_hermes_runtime_manifest(&manifest_path)
+        .map_err(|error| format!("hermes runtime manifest unavailable: {error}"))?;
+    let hermes_executable = pack_root.join(&manifest.hermes_relative_path);
+
+    let effective_runtime_dir = if settings.runtime_dir.trim().is_empty() {
+        app_data_dir.to_path_buf()
+    } else {
+        PathBuf::from(settings.runtime_dir.trim())
+    };
+    // Reuses the render runtime pack's own bundled ffprobe (spec §2.2) —
+    // NOTE (deviation): this resolves the non-managed-WSL layout only; when
+    // `settings.uses_wsl2_runtime()` the real ffprobe lives inside the WSL
+    // filesystem and needs the same `wsl.exe` bridging `build_sidecar_command`
+    // uses for HyperFrames. That bridging is not replicated here.
+    let ffprobe_name = if settings.uses_wsl2_runtime() { "ffprobe" } else { "ffprobe.exe" };
+    let ffprobe_executable = effective_runtime_dir.join("runtime-pack").join("bin").join(ffprobe_name);
+
+    let workspace_base = if !settings.workspace_dir.trim().is_empty() {
+        PathBuf::from(settings.workspace_dir.trim())
+    } else {
+        app_data_dir.join("worker-workspace")
+    };
+    fs::create_dir_all(&workspace_base)
+        .map_err(|error| format!("failed to create hermes workspace: {error}"))?;
+    let hermes_workspace_root = workspace_base.join("hermes-jobs");
+
+    let job_started_at = SystemTime::now();
+    let job_segment = sanitize_segment(&job.id);
+    let tmp_dir = hermes_workspace_root.join(&job_segment).join("tmp");
+
+    let forbidden_roots = {
+        let profiles = hermes_profiles
+            .lock()
+            .map_err(|_| "hermes profile store lock poisoned".to_string())?;
+        vec![profiles.root().to_path_buf()]
+    };
+
+    let job_owned = job.clone();
+    let doctor_owned = hermes_doctor.clone();
+    let profiles_arc = hermes_profiles.clone();
+    let workspace_root_owned = hermes_workspace_root.clone();
+    let cache_dirs: Vec<PathBuf> = Vec::new();
+
+    let reference_urls = job.reference_urls.clone();
+    let refresh_closure = build_production_refresh_closure(
+        connection.clone(),
+        job.id.clone(),
+        job.lease_owner_token.clone(),
+    );
+    let download_reference =
+        move |reference: &crate::hermes_executor::HermesJobReference| -> Result<PathBuf, HermesFailure> {
+            let url = reference_urls
+                .iter()
+                .find(|entry| entry.asset_id == reference.asset_id)
+                .map(|entry| entry.url.clone())
+                .ok_or_else(|| HermesFailure {
+                    code: "HERMES_REFERENCE_DOWNLOAD_FAILED".to_string(),
+                    message: format!("no referenceUrl for asset {}", reference.asset_id),
+                })?;
+            download_and_verify_reference(
+                &reference.asset_id,
+                &url,
+                &reference.sha256,
+                &tmp_dir,
+                &production_fetch_reference,
+                &refresh_closure,
+            )
+        };
+
+    let spawn_closure = move |argv: &[String], cwd: &Path, env: &HashMap<String, String>, timeout_ms: u64| {
+        spawn_hermes_process(&hermes_executable, argv, cwd, env, timeout_ms, &mut |_line: &str| {})
+    };
+    let ffprobe_closure = production_ffprobe(ffprobe_executable);
+
+    let connection_for_upload = connection.clone();
+    let job_for_upload = job.clone();
+    let mut upload_fn = move |output: &crate::hermes_executor::CollectedOutput| -> Result<(), String> {
+        let artifact_type = if output.kind == "video" {
+            "hermes_media_video"
+        } else {
+            "hermes_media_image"
+        };
+        let file_name = output
+            .path
+            .file_name()
+            .and_then(|name| name.to_str())
+            .unwrap_or("output.bin")
+            .to_string();
+        let content_type = output.content_type.clone();
+        let path = output.path.clone();
+        let connection = connection_for_upload.clone();
+        let job = job_for_upload.clone();
+        tauri::async_runtime::block_on(async move {
+            upload_worker_artifact_file(
+                &connection,
+                &job.id,
+                artifact_type,
+                &path,
+                &file_name,
+                &content_type,
+                &job.lease_owner_token,
+                &job.assignment_attempt,
+                json!({}),
+            )
+            .await
+            .map(|_| ())
+        })
+    };
+
+    let connection_for_progress = connection.clone();
+    let job_for_progress = job.clone();
+    let mut sequence_number: u32 = 1;
+    let mut emit_fn = move |stage: &str| {
+        let connection = connection_for_progress.clone();
+        let job = job_for_progress.clone();
+        let stage = stage.to_string();
+        let seq = sequence_number;
+        sequence_number = sequence_number.saturating_add(1);
+        let _ = tauri::async_runtime::block_on(async move {
+            report_worker_job_event(
+                &connection,
+                &job.id,
+                &WorkerJobEventPayload {
+                    event_type: "job.progress".to_string(),
+                    payload_json: json!({ "stage": stage }),
+                    sequence_number: Some(seq),
+                    lease_owner_token: job.lease_owner_token.clone(),
+                    assignment_attempt: Some(job.assignment_attempt.clone()),
+                },
+            )
+            .await
+        });
+    };
+
+    let blocking_result = tauri::async_runtime::spawn_blocking(move || {
+        let profiles_guard = profiles_arc.lock().map_err(|_| HermesFailure {
+            code: "HERMES_PROCESS_FAILED".to_string(),
+            message: "hermes profile store lock poisoned".to_string(),
+        })?;
+        let mut deps = HermesMediaJobDeps {
+            download_reference: &download_reference,
+            spawn: &spawn_closure,
+            ffprobe: &ffprobe_closure,
+            upload_artifact: &mut upload_fn,
+            emit_stage: &mut emit_fn,
+        };
+        execute_hermes_media_job_core(
+            &job_owned,
+            &doctor_owned,
+            &profiles_guard,
+            &workspace_root_owned,
+            &cache_dirs,
+            &forbidden_roots,
+            job_started_at,
+            &mut deps,
+        )
+    })
+    .await;
+
+    let outcome: Result<Vec<crate::hermes_executor::CollectedOutput>, HermesFailure> = match blocking_result {
+        Ok(inner_result) => inner_result,
+        Err(join_error) => Err(HermesFailure {
+            code: "HERMES_PROCESS_FAILED".to_string(),
+            message: format!("hermes media job task failed: {join_error}"),
+        }),
+    };
+
+    outcome
+        .map(|_collected| ())
+        .map_err(|failure| format!("[{}] {}", failure.code, failure.message))
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Feature 135 §11 FIX 1/2 — hermes connection-control job dispatch
+// (authorize/probe/disconnect), wired to `RealHermesControlDeps`.
+// ────────────────────────────────────────────────────────────────────────
+
+async fn execute_hermes_control_job(
+    app_data_dir: &Path,
+    connection: &Arc<Mutex<WorkerLoopConnection>>,
+    job: ClaimedWorkerJob,
+    hermes_profiles: &Arc<Mutex<HermesProfileStore>>,
+) -> Result<(), String> {
+    let connection_snapshot = clone_connection(connection)?;
+    let connection_id = job
+        .capability_requirements_json
+        .get("connectionId")
+        .and_then(Value::as_str)
+        .ok_or_else(|| "hermes control job is missing capabilityRequirementsJson.connectionId".to_string())?
+        .to_string();
+    let profile_reference = format!("conn_{connection_id}");
+
+    let (manifest_path, pack_root) = hermes_runtime_pack_paths(app_data_dir);
+    let manifest = read_hermes_runtime_manifest(&manifest_path)
+        .map_err(|error| format!("hermes runtime manifest unavailable: {error}"))?;
+    let hermes_executable = pack_root.join(&manifest.hermes_relative_path);
+
+    // Control jobs have a generous default timeout ceiling; the device-code
+    // authorize flow is bounded by the job's own `assignmentAttempt` lease
+    // lifetime server-side, not by this local ceiling.
+    let timeout_ms: u64 = 15 * 60 * 1000;
+    let deps = RealHermesControlDeps {
+        hermes_executable,
+        connection: connection_snapshot,
+        job_id: job.id.clone(),
+        lease_owner_token: job.lease_owner_token.clone(),
+        assignment_attempt: job.assignment_attempt.clone(),
+        profiles: hermes_profiles.clone(),
+        app_data_dir: app_data_dir.to_path_buf(),
+        timeout_ms,
+    };
+
+    let job_type = job.job_type.clone();
+    let outcome = tauri::async_runtime::spawn_blocking(move || match classify_job_type(&job_type) {
+        WorkerJobKind::HermesConnectionAuthorize => {
+            run_hermes_connection_authorize(&connection_id, &profile_reference, timeout_ms / 1000, &deps)
+        }
+        WorkerJobKind::HermesConnectionProbe => {
+            run_hermes_connection_probe(&connection_id, &profile_reference, timeout_ms / 1000, &deps)
+        }
+        WorkerJobKind::HermesConnectionDisconnect => {
+            run_hermes_connection_disconnect(&connection_id, &profile_reference, timeout_ms / 1000, &deps)
+        }
+        _ => HermesControlOutcome::Failure {
+            error_code: "HERMES_PROCESS_FAILED".to_string(),
+            failure_reason: "process_failed".to_string(),
+            diagnostic: "unreachable: non-control job type dispatched to control-job executor".to_string(),
+        },
+    })
+    .await
+    .map_err(|error| format!("hermes control job task failed: {error}"))?;
+
+    match outcome {
+        HermesControlOutcome::Success { .. } => Ok(()),
+        HermesControlOutcome::Failure {
+            error_code,
+            diagnostic,
+            ..
+        } => Err(format!("[{error_code}] {diagnostic}")),
+    }
+}
+
 async fn execute_hyperframes_job(
     executor: &Arc<Mutex<ExecutorState>>,
     resource_dir: &Path,
@@ -1807,6 +2272,101 @@ mod tests {
     use crate::credentials::ensure_device_proof_material;
     use crate::worker_control_plane::WorkerApiTokens;
 
+    #[test]
+    fn hermes_update_warning_is_extracted_from_heartbeat_response_warnings() {
+        assert_eq!(
+            find_hermes_update_warning(&[
+                "some unrelated warning".to_string(),
+                "Hermes runtime version 0.17.0 is below the required minimum 0.18.2.".to_string(),
+            ]),
+            Some("Hermes runtime version 0.17.0 is below the required minimum 0.18.2.".to_string())
+        );
+        assert_eq!(find_hermes_update_warning(&["unrelated".to_string()]), None);
+        assert_eq!(find_hermes_update_warning(&[]), None);
+    }
+
+    #[test]
+    fn claim_hints_include_hermes_media_only_when_advertised() {
+        let without_hermes = build_worker_claim_capability_hints(true, false);
+        assert!(!without_hermes.contains(&"hermes_media".to_string()));
+        assert!(without_hermes.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
+
+        let with_hermes = build_worker_claim_capability_hints(true, true);
+        assert!(with_hermes.contains(&"hermes_media".to_string()));
+        // Render hints are unaffected by the hermes gate.
+        assert!(with_hermes.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
+        assert!(with_hermes.contains(&"hyperframes-final-composite".to_string()));
+    }
+
+    #[test]
+    fn render_hints_are_excluded_when_render_doctor_is_not_ready_but_hermes_is() {
+        // FIX 1 — a hermes-only worker (no HyperFrames runtime installed)
+        // must still be able to claim hermes jobs; render hints must not be
+        // advertised while its own doctor is not ready.
+        let hermes_only = build_worker_claim_capability_hints(false, true);
+        assert!(!hermes_only.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
+        assert!(!hermes_only.contains(&"hyperframes-final-composite".to_string()));
+        assert!(hermes_only.contains(&"hermes_media".to_string()));
+
+        let neither_ready = build_worker_claim_capability_hints(false, false);
+        assert!(neither_ready.is_empty());
+    }
+
+    #[test]
+    fn resolve_hermes_claim_hints_reflects_a_real_doctor_computation() {
+        // FIX 1 — "with doctor ready the claim sends the hermes_media hint;
+        // with doctor degraded it doesn't" against the REAL doctor pipeline
+        // (real filesystem manifest/profile-root checks), not just the pure
+        // hint builder in isolation.
+        let dir = tempfile::tempdir().unwrap();
+        let app_data_dir = dir.path().join("app-data");
+        let (manifest_path, pack_root) = crate::hermes_runtime::hermes_runtime_pack_paths(&app_data_dir);
+        fs::create_dir_all(manifest_path.parent().unwrap()).unwrap();
+        let python_relative_path = "python/python.exe";
+        fs::create_dir_all(pack_root.join("python")).unwrap();
+        fs::write(pack_root.join(python_relative_path), b"fake python").unwrap();
+        fs::write(
+            &manifest_path,
+            serde_json::to_vec(&serde_json::json!({
+                "runtimeId": "hermes-windows-x64",
+                "version": "0.1.0",
+                "hermesVersion": "0.18.2",
+                "pythonRelativePath": python_relative_path,
+                "hermesRelativePath": "python/Scripts/hermes.exe",
+                "checksumFile": "SHA256SUMS",
+                "signatureFile": "SHA256SUMS.sig",
+                "allowed": true,
+            }))
+            .unwrap(),
+        )
+        .unwrap();
+
+        let (ready_hints, ready_doctor) = resolve_hermes_claim_hints(&app_data_dir, true, |_path| {
+            Ok("hermes-cli 0.18.2".to_string())
+        });
+        assert_eq!(ready_doctor.status, "ready");
+        assert!(ready_hints.contains(&"hermes_media".to_string()));
+
+        let (degraded_hints, degraded_doctor) = resolve_hermes_claim_hints(&app_data_dir, true, |_path| {
+            Ok("hermes-cli 0.10.0".to_string())
+        });
+        assert_eq!(degraded_doctor.status, "degraded");
+        assert!(!degraded_hints.contains(&"hermes_media".to_string()));
+        // Render hint is untouched by the hermes gate either way.
+        assert!(degraded_hints.contains(&HYPERFRAMES_JOB_TYPE.to_string()));
+    }
+
+    #[test]
+    fn hermes_slot_accounting_allows_one_concurrent_job_independent_of_render_slots() {
+        assert!(can_claim_hermes_media_job(0));
+        assert!(!can_claim_hermes_media_job(1));
+
+        // Render slot availability never depends on hermes activity.
+        assert!(can_claim_render_job(0, 1));
+        assert!(!can_claim_render_job(1, 1));
+        assert!(can_claim_render_job(1, 2));
+    }
+
     #[test]
     fn terminal_worker_auth_errors_are_not_retryable() {
         assert!(is_terminal_worker_auth_error(
@@ -1854,6 +2414,7 @@ mod tests {
             lease_owner_token: "lease-1".into(),
             assignment_attempt: "attempt-1".into(),
             input_json: json!({}),
+            ..Default::default()
         };
 
         let event = build_sidecar_keepalive_event(
@@ -1883,6 +2444,7 @@ mod tests {
             lease_owner_token: "lease-1".into(),
             assignment_attempt: "attempt-1".into(),
             input_json: json!({}),
+            ..Default::default()
         };
         let parsed = parse_sidecar_worker_event_line(
             r#"SMARTAIHUB_EVENT {"eventType":"shot.render.started","stage":"render_browser_css","shotId":"shot-6","shotIndex":5,"shotTotal":8,"percent":55,"message":"Rendering shot 6/8"}"#,
