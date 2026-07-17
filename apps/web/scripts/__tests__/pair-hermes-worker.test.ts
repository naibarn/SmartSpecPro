/**
 * Feature 135 — Hermes Grok media worker (section 07): `pair-hermes-worker.ts`
 * unit tests. Only argument parsing and the settings-write call are tested
 * here (with fully injected deps) — the live pairing HTTP exchange is
 * explicitly NOT exercised (per the section spec).
 */
import { describe, expect, it, vi } from "vitest";

import { parsePairHermesWorkerArgs, runPairHermesWorker } from "../pair-hermes-worker";

describe("parsePairHermesWorkerArgs", () => {
  it("parses required and optional flags", () => {
    const args = parsePairHermesWorkerArgs([
      "--tenant-id", "tenant-123",
      "--display-name", "My Shared Worker",
      "--base-url", "https://smartaihub.app",
      "--machine-id", "machine-1",
      "--machine-name", "prod-box",
    ]);
    expect(args).toEqual({
      tenantId: "tenant-123",
      displayName: "My Shared Worker",
      baseUrl: "https://smartaihub.app",
      machineId: "machine-1",
      machineName: "prod-box",
    });
  });

  it("applies defaults when optional flags are omitted", () => {
    const args = parsePairHermesWorkerArgs(["--tenant-id", "tenant-123"]);
    expect(args.displayName).toBe("Shared Hermes Worker");
    expect(args.baseUrl).toBe("http://localhost:3000");
    expect(args.machineId).toBeUndefined();
  });

  it("throws when --tenant-id is missing", () => {
    expect(() => parsePairHermesWorkerArgs(["--base-url", "http://localhost:3000"])).toThrow(/--tenant-id/);
  });
});

describe("runPairHermesWorker", () => {
  it("mints a registration token, registers, prints once, and writes hermes_shared_worker_id — with fully injected deps", async () => {
    const printed: string[] = [];
    const writeSharedWorkerIdSetting = vi.fn(async (_workerId: string) => {});
    const registerWorker = vi.fn(async () => ({
      workerId: "worker-abc",
      tokens: { executionToken: "exec-token", uploadToken: "upload-token", refreshToken: "refresh-token" },
    }));
    const mintRegistrationToken = vi.fn(() => "registration-token-xyz");
    const runDoctorProbe = vi.fn(async () => ({ doctorOk: false, hermesVersion: "unknown" }));

    const result = await runPairHermesWorker(["--tenant-id", "tenant-1", "--base-url", "https://smartaihub.app"], {
      mintRegistrationToken,
      runDoctorProbe,
      registerWorker,
      writeSharedWorkerIdSetting,
      print: (line) => printed.push(line),
    });

    expect(result).toEqual({ workerId: "worker-abc" });
    expect(mintRegistrationToken).toHaveBeenCalledTimes(1);
    expect(runDoctorProbe).toHaveBeenCalledTimes(1);
    expect(registerWorker).toHaveBeenCalledTimes(1);
    expect(registerWorker.mock.calls[0][0]).toMatchObject({
      baseUrl: "https://smartaihub.app",
      registrationToken: "registration-token-xyz",
    });
    expect(writeSharedWorkerIdSetting).toHaveBeenCalledTimes(1);
    expect(writeSharedWorkerIdSetting).toHaveBeenCalledWith("worker-abc");
    expect(printed.some((line) => line.includes("HERMES_WORKER_TOKEN=refresh-token"))).toBe(true);
    expect(printed.some((line) => line.includes("HERMES_WORKER_ID=worker-abc"))).toBe(true);
  });

  it("regression (FIX 4): flows the REAL doctor-probe result into the registration payload — not hardcoded false/unknown", async () => {
    const registerWorker = vi.fn(async () => ({
      workerId: "worker-real",
      tokens: { executionToken: "e", uploadToken: "u", refreshToken: "r" },
    }));
    const runDoctorProbe = vi.fn(async () => ({ doctorOk: true, hermesVersion: "0.18.2" }));

    await runPairHermesWorker(["--tenant-id", "tenant-1"], {
      mintRegistrationToken: () => "registration-token-xyz",
      runDoctorProbe,
      registerWorker,
      writeSharedWorkerIdSetting: async () => {},
      print: () => {},
    });

    expect(registerWorker.mock.calls[0][0].payload).toMatchObject({
      doctorOk: true,
      hermesVersion: "0.18.2",
    });
  });
});
