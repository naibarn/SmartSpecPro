import { describe, expect, it } from "vitest";
import {
  buildHermesRuntimeManifestEntry,
  HERMES_PINNED_VERSION,
  HERMES_RUNTIME_IDS,
  resolveHermesPackOs,
} from "../build-hermes-runtime-pack";

describe("resolveHermesPackOs", () => {
  it("accepts the two supported OS ids", () => {
    expect(resolveHermesPackOs("windows")).toBe("windows");
    expect(resolveHermesPackOs("macos")).toBe("macos");
  });

  it("rejects an unknown OS", () => {
    expect(() => resolveHermesPackOs("linux")).toThrow(/unsupported OS/);
  });
});

describe("buildHermesRuntimeManifestEntry", () => {
  const baseInput = {
    version: "0.1.0",
    archiveSha256: "a".repeat(64),
    archiveSizeBytes: 123_456,
    pythonRelativePath: "python/Scripts/python.exe",
    hermesRelativePath: "python/Scripts/hermes.exe",
  };

  it("produces the windows manifest entry, allowed by default", () => {
    const entry = buildHermesRuntimeManifestEntry({ ...baseInput, os: "windows" });

    expect(entry.runtimeId).toBe(HERMES_RUNTIME_IDS.windows);
    expect(entry.runtimeId).toBe("hermes-windows-x64");
    expect(entry.version).toBe("0.1.0");
    expect(entry.hermesVersion).toBe(HERMES_PINNED_VERSION);
    expect(entry.archiveSha256).toBe("a".repeat(64));
    expect(entry.allowed).toBe(true);
    expect(entry.denyReason).toBeUndefined();
  });

  it("produces the macos manifest entry, NOT allowed until built (spec §1)", () => {
    const entry = buildHermesRuntimeManifestEntry({
      ...baseInput,
      os: "macos",
      pythonRelativePath: "python/bin/python3",
      hermesRelativePath: "python/bin/hermes",
    });

    expect(entry.runtimeId).toBe(HERMES_RUNTIME_IDS.macos);
    expect(entry.runtimeId).toBe("hermes-macos-arm64");
    expect(entry.allowed).toBe(false);
    expect(entry.denyReason).toMatch(/has not been built yet/);
  });

  it("allows the macos arm64 entry only when the assembler marks a real pack ready", () => {
    const entry = buildHermesRuntimeManifestEntry({
      ...baseInput,
      os: "macos",
      pythonRelativePath: "python/bin/python3",
      hermesRelativePath: "python/bin/hermes",
      allowed: true,
      platform: "macos",
      architecture: "arm64",
      supportedMacModels: ["Apple Silicon Mac with M1"],
      unsupportedMacArchitectures: ["x86_64 (Intel)"],
    });

    expect(entry.allowed).toBe(true);
    expect(entry.denyReason).toBeUndefined();
    expect(entry.platform).toBe("macos");
    expect(entry.architecture).toBe("arm64");
    expect(entry.unsupportedMacArchitectures).toEqual(["x86_64 (Intel)"]);
  });

  it("lets a caller explicitly override `allowed`", () => {
    const entry = buildHermesRuntimeManifestEntry({ ...baseInput, os: "windows", allowed: false, denyReason: "rollback" });
    expect(entry.allowed).toBe(false);
    expect(entry.denyReason).toBe("rollback");
  });

  it("rejects an unknown OS", () => {
    expect(() => buildHermesRuntimeManifestEntry({ ...baseInput, os: "linux" })).toThrow(/unsupported OS/);
  });
});
