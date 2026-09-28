#!/usr/bin/env node
/**
 * Feature 135 §11 — Hermes runtime pack build script.
 *
 * Packs do not build themselves (spec §11 objective #3): this script
 * assembles a per-OS archive containing an uv-managed Python 3.11 runtime
 * with `hermes-agent==0.18.2` pinned/installed, computes its sha256, and
 * emits the manifest-entry JSON the runtime-manifest endpoint
 * (`server/routes/workerRuntime.ts`) serves and the Worker App's
 * `worker_app_install_hermes_runtime` Tauri command consumes
 * (`hermes_runtime.rs::HermesRuntimeManifest`).
 *
 * Windows and macOS Apple Silicon are assembled through separate branches.
 * The macOS branch uses the native aarch64-apple-darwin Python distribution
 * and Apple Silicon wheels; it never changes or rebuilds the Windows pack.
 *
 * Usage (operator-run, never invoked by the app or by tests):
 *   npx tsx scripts/build-hermes-runtime-pack.ts --os windows --version 0.1.0 \
 *     --output-dir client/public/releases/runtime
 *
 * Per spec §4.2: only the pure manifest-entry builder is unit-tested here.
 * Archive assembly (shelling out to `uv`, downloading Python, pip-installing
 * `hermes-agent`, zipping, computing the real sha256) is NOT exercised by
 * the test suite — it requires real network/tooling access and is an
 * operator-run, manual-verification step.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Pinned Hermes CLI version — MUST match `hermes_runtime.rs`'s
 *  `HERMES_PINNED_VERSION` and the CLAUDE-plan pin `hermes-agent==0.18.2`. */
export const HERMES_PINNED_VERSION = "0.18.2";
export const HERMES_AGENT_PIP_SPEC = `hermes-agent==${HERMES_PINNED_VERSION}`;
const WINDOWS_PYTHON_BUILD = "3.11.14+20260127";
const WINDOWS_PYTHON_ARCHIVE_URL =
  `https://github.com/astral-sh/python-build-standalone/releases/download/20260127/`
  + `cpython-${WINDOWS_PYTHON_BUILD.replace("+", "%2B")}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`;
const MACOS_ARM64_PYTHON_BUILD = "3.11.14+20260127";
const MACOS_ARM64_PYTHON_ARCHIVE_URL =
  `https://github.com/astral-sh/python-build-standalone/releases/download/20260127/`
  + `cpython-${MACOS_ARM64_PYTHON_BUILD.replace("+", "%2B")}-aarch64-apple-darwin-install_only_stripped.tar.gz`;
const MACOS_ARM64_PYTHON_PLATFORM = "aarch64-apple-darwin";
const MACOS_SUPPORTED_MODELS = [
  "Apple Silicon Mac with M1",
  "Apple Silicon Mac with M2",
  "Apple Silicon Mac with M3",
  "Apple Silicon Mac with M4",
] as const;
const DISTLIB_BUILD_SPEC = "distlib==0.4.3";

/** Runtime ids — frozen to match `hermes_runtime.rs`'s
 *  `HERMES_RUNTIME_ID_WINDOWS` / `HERMES_RUNTIME_ID_MACOS` and the
 *  manifest-serving region added to `workerRuntime.ts`. */
export const HERMES_RUNTIME_IDS = {
  windows: "hermes-windows-x64",
  macos: "hermes-macos-arm64",
} as const;

export type HermesPackOs = keyof typeof HERMES_RUNTIME_IDS;

const SUPPORTED_OS_VALUES = Object.keys(HERMES_RUNTIME_IDS);

/** Runtime-validates an `--os` CLI value (or any caller-supplied string)
 *  against the two supported packs. Throws for anything else (spec §4.2
 *  "unknown OS rejected"). */
export function resolveHermesPackOs(value: string): HermesPackOs {
  if (value === "windows" || value === "macos") {
    return value;
  }
  throw new Error(
    `build-hermes-runtime-pack: unsupported OS "${value}" (expected one of: ${SUPPORTED_OS_VALUES.join(", ")})`,
  );
}

export interface HermesRuntimeManifestEntryInput {
  os: string;
  /** Pack build version (independent of the pinned Hermes CLI version). */
  version: string;
  archiveSha256: string;
  archiveSizeBytes: number;
  /** Path to the bundled Python interpreter, relative to the pack root. */
  pythonRelativePath: string;
  /** Path to the `hermes` CLI entry point, relative to the pack root. */
  hermesRelativePath: string;
  checksumFile?: string;
  signatureFile?: string;
  /** Defaults to `true` for windows, `false` for macos. The assembler passes
   *  `allowed: true` only after a real native Mac pack has been assembled. */
  allowed?: boolean;
  denyReason?: string;
  archiveUrl?: string;
  platform?: "windows" | "macos";
  architecture?: "x86_64" | "arm64";
  supportedMacModels?: readonly string[];
  unsupportedMacArchitectures?: readonly string[];
}

export interface HermesRuntimeManifestEntry {
  runtimeId: string;
  version: string;
  hermesVersion: string;
  pythonRelativePath: string;
  hermesRelativePath: string;
  checksumFile: string;
  signatureFile: string;
  allowed: boolean;
  denyReason?: string;
  archiveSha256: string;
  archiveSizeBytes: number;
  archiveUrl?: string;
  platform?: "windows" | "macos";
  architecture?: "x86_64" | "arm64";
  supportedMacModels?: readonly string[];
  unsupportedMacArchitectures?: readonly string[];
}

/**
 * Pure manifest-entry builder — no filesystem/network access. Produces the
 * `{ runtimeId, version, archiveSha256, allowed }` shape (plus the other
 * `HermesRuntimeManifest` fields `hermes_runtime.rs` expects) for either
 * supported OS id; throws for an unrecognized OS.
 */
export function buildHermesRuntimeManifestEntry(
  input: HermesRuntimeManifestEntryInput,
): HermesRuntimeManifestEntry {
  const os = resolveHermesPackOs(input.os);
  const runtimeId = HERMES_RUNTIME_IDS[os];
  const allowed = input.allowed ?? os === "windows";

  const entry: HermesRuntimeManifestEntry = {
    runtimeId,
    version: input.version,
    hermesVersion: HERMES_PINNED_VERSION,
    pythonRelativePath: input.pythonRelativePath,
    hermesRelativePath: input.hermesRelativePath,
    checksumFile: input.checksumFile ?? "SHA256SUMS",
    signatureFile: input.signatureFile ?? "SHA256SUMS.sig",
    allowed,
    archiveSha256: input.archiveSha256,
    archiveSizeBytes: input.archiveSizeBytes,
  };
  if (!allowed) {
    entry.denyReason = input.denyReason ?? `${runtimeId} pack has not been built yet`;
  }
  if (input.archiveUrl) {
    entry.archiveUrl = input.archiveUrl;
  }
  if (input.platform) {
    entry.platform = input.platform;
  }
  if (input.architecture) {
    entry.architecture = input.architecture;
  }
  if (input.supportedMacModels) {
    entry.supportedMacModels = input.supportedMacModels;
  }
  if (input.unsupportedMacArchitectures) {
    entry.unsupportedMacArchitectures = input.unsupportedMacArchitectures;
  }
  return entry;
}

async function sha256File(filePath: string): Promise<string> {
  const hasher = createHash("sha256");
  const buffer = await fs.readFile(filePath);
  hasher.update(buffer);
  return hasher.digest("hex");
}

export interface AssembleHermesRuntimePackOptions {
  os: string;
  version: string;
  outputDir: string;
  /** Injectable for tests/dry-runs — production default shells out to `uv`. */
  runCommand?: (command: string, args: string[], cwd: string) => Promise<void>;
}

/**
 * Assembles the per-OS Hermes runtime pack archive: a `uv`-managed Python
 * 3.11 virtual environment with `hermes-agent==0.18.2` installed, zipped,
 * sha256'd, with a `<archive>.manifest.json` sidecar written next to it
 * (same convention `server/routes/workerRuntime.ts` reads for the
 * HyperFrames pack via `readRuntimePackManifest`).
 *
 * NOT unit-tested end-to-end (spec §4.2) — requires real `uv`/network
 * access. Operators run this manually; it is never invoked by the app.
 */
export async function assembleHermesRuntimePack(
  options: AssembleHermesRuntimePackOptions,
): Promise<{ archivePath: string; manifestPath: string; entry: HermesRuntimeManifestEntry }> {
  const os = resolveHermesPackOs(options.os);
  const runtimeId = HERMES_RUNTIME_IDS[os];
  const outputDir = path.resolve(options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  const stagingRoot = await fs.mkdtemp(path.join(outputDir, `.${runtimeId}-staging-`));
  const runCommand =
    options.runCommand ??
    (async (command: string, args: string[], cwd: string) => {
      await execFileAsync(command, args, { cwd });
    });

  try {
    let pythonRelativePath: string;
    let hermesRelativePath: string;
    if (os === "windows") {
      // A Linux host cannot create a real Windows venv with `uv venv`.
      // Assemble from the pinned python-build-standalone distribution,
      // resolve Windows wheels explicitly, then create a native distlib
      // console launcher. This keeps the published pack genuinely runnable
      // on Windows instead of relabeling a Linux venv.
      const pythonArchive = path.join(stagingRoot, ".python-windows.tar.gz");
      await runCommand("curl", ["-L", "--fail", "--silent", "--show-error", "-o", pythonArchive, WINDOWS_PYTHON_ARCHIVE_URL], stagingRoot);
      await runCommand("tar", ["-xzf", pythonArchive, "-C", stagingRoot], stagingRoot);
      await fs.rm(pythonArchive, { force: true });

      await runCommand(
        "uv",
        [
          "pip",
          "install",
          "--target",
          path.join(stagingRoot, "python", "Lib", "site-packages"),
          "--python-platform",
          "x86_64-pc-windows-msvc",
          "--python-version",
          "3.11",
          "--only-binary",
          ":all:",
          HERMES_AGENT_PIP_SPEC,
        ],
        stagingRoot,
      );

      const buildTools = path.join(stagingRoot, ".build-tools");
      await runCommand("uv", ["pip", "install", "--target", buildTools, DISTLIB_BUILD_SPEC], stagingRoot);
      const launcherScript = [
        "from pathlib import Path",
        "import sys",
        "sys.path.insert(0, sys.argv[1])",
        "from distlib.scripts import ScriptMaker",
        "root = Path(sys.argv[2])",
        "launcher = (Path(sys.argv[1]) / 'distlib' / 't64.exe').read_bytes()",
        "maker = ScriptMaker(None, str(root))",
        "maker._is_nt = True",
        "maker._get_launcher = lambda kind: launcher",
        "maker.executable = 'python.exe'",
        "maker.variants = {''}",
        "maker.set_mode = False",
        "maker.make('hermes = hermes_cli.main:main')",
      ].join("\n");
      await runCommand(
        "python3",
        ["-c", launcherScript, buildTools, path.join(stagingRoot, "python")],
        stagingRoot,
      );
      await fs.rm(buildTools, { recursive: true, force: true });
      pythonRelativePath = "python/python.exe";
      hermesRelativePath = "python/hermes.exe";
    } else {
      // A Linux host cannot create a runnable macOS venv with `uv`.
      // Extract the official native Apple Silicon Python distribution, then
      // resolve only aarch64-apple-darwin wheels. This keeps the archive
      // genuinely runnable on M-series Macs instead of relabeling Linux files.
      const pythonArchive = path.join(stagingRoot, ".python-macos-arm64.tar.gz");
      await runCommand("curl", ["-L", "--fail", "--silent", "--show-error", "-o", pythonArchive, MACOS_ARM64_PYTHON_ARCHIVE_URL], stagingRoot);
      await runCommand("tar", ["-xzf", pythonArchive, "-C", stagingRoot], stagingRoot);
      await fs.rm(pythonArchive, { force: true });

      const sitePackages = path.join(stagingRoot, "python", "lib", "python3.11", "site-packages");
      await fs.mkdir(sitePackages, { recursive: true });
      await runCommand(
        "uv",
        [
          "pip",
          "install",
          "--target",
          sitePackages,
          "--python-platform",
          MACOS_ARM64_PYTHON_PLATFORM,
          "--python-version",
          "3.11",
          "--only-binary",
          ":all:",
          "--link-mode",
          "copy",
          HERMES_AGENT_PIP_SPEC,
        ],
        stagingRoot,
      );

      // `uv pip --target` installs package modules but does not create a
      // target-platform console script. Invoke Hermes by module through the
      // bundled native interpreter so there is no Linux shebang in the pack.
      const launcherPath = path.join(stagingRoot, "python", "bin", "hermes");
      await fs.writeFile(
        launcherPath,
        [
          "#!/bin/sh",
          "set -eu",
          'SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)',
          'exec "$SCRIPT_DIR/python3" -m hermes_cli "$@"',
          "",
        ].join("\n"),
      );
      await fs.chmod(launcherPath, 0o755);
      await runCommand("test", ["-x", path.join(stagingRoot, "python", "bin", "python3")], stagingRoot);
      pythonRelativePath = "python/bin/python3";
      hermesRelativePath = "python/bin/hermes";
    }

    if (!existsSync(path.join(stagingRoot, hermesRelativePath))) {
      throw new Error(
        `build-hermes-runtime-pack: expected hermes CLI at ${hermesRelativePath} after installing ${HERMES_AGENT_PIP_SPEC}`,
      );
    }

    const archiveFileName = `smart-ai-hub-hermes-runtime-${runtimeId}-${options.version}.zip`;
    const archivePath = path.join(outputDir, archiveFileName);

    // The Worker App requires manifest.json INSIDE the archive after
    // extraction. Archive digest/size are intentionally omitted here to
    // avoid a self-referential checksum; the sidecar below carries those.
    const installManifest = buildHermesRuntimeManifestEntry({
      os,
      version: options.version,
      archiveSha256: "",
      archiveSizeBytes: 0,
      pythonRelativePath,
      hermesRelativePath,
      ...(os === "macos"
        ? {
            allowed: true,
            platform: "macos" as const,
            architecture: "arm64" as const,
            supportedMacModels: MACOS_SUPPORTED_MODELS,
            unsupportedMacArchitectures: ["x86_64 (Intel)"],
          }
        : {}),
    });
    const {
      archiveSha256: _archiveSha256,
      archiveSizeBytes: _archiveSizeBytes,
      archiveUrl: _archiveUrl,
      ...installManifestWithoutArchive
    } = installManifest;
    await fs.writeFile(
      path.join(stagingRoot, "manifest.json"),
      JSON.stringify(installManifestWithoutArchive, null, 2),
    );

    const zipScript = [
      "from pathlib import Path",
      "from zipfile import ZIP_DEFLATED, ZipFile",
      "root = Path(sys.argv[1])",
      "archive = Path(sys.argv[2])",
      "with ZipFile(archive, 'w', ZIP_DEFLATED, allowZip64=True) as output:",
      "    for item in sorted(root.rglob('*')):",
      "        if item.is_file():",
      "            output.write(item, item.relative_to(root).as_posix())",
    ].join("\n");
    await runCommand("python3", ["-c", `import sys\n${zipScript}`, stagingRoot, archivePath], stagingRoot);

    const archiveSha256 = await sha256File(archivePath);
    const archiveSizeBytes = (await fs.stat(archivePath)).size;

    const entry = buildHermesRuntimeManifestEntry({
      os,
      version: options.version,
      archiveSha256,
      archiveSizeBytes,
      pythonRelativePath,
      hermesRelativePath,
      ...(os === "macos"
        ? {
            allowed: true,
            platform: "macos" as const,
            architecture: "arm64" as const,
            supportedMacModels: MACOS_SUPPORTED_MODELS,
            unsupportedMacArchitectures: ["x86_64 (Intel)"],
          }
        : {}),
    });

    const manifestPath = `${archivePath}.manifest.json`;
    await fs.writeFile(manifestPath, JSON.stringify(entry, null, 2));

    return { archivePath, manifestPath, entry };
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

function readFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const os = readFlag(argv, "--os");
  const version = readFlag(argv, "--version");
  const outputDir = readFlag(argv, "--output-dir") ?? "client/public/releases/runtime";
  if (!os || !version) {
    // eslint-disable-next-line no-console
    console.error(
      "Usage: tsx scripts/build-hermes-runtime-pack.ts --os <windows|macos> --version <x.y.z> [--output-dir <dir>]",
    );
    process.exitCode = 1;
    return;
  }
  await fs.mkdir(outputDir, { recursive: true });
  const { archivePath, manifestPath } = await assembleHermesRuntimePack({ os, version, outputDir });
  // eslint-disable-next-line no-console
  console.log(`Built ${archivePath}`);
  // eslint-disable-next-line no-console
  console.log(`Manifest ${manifestPath}`);
}

// Only run when executed directly (never on import — keeps this test-safe).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
