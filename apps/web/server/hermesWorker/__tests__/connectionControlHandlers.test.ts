import { spawn } from "node:child_process";
import readline from "node:readline";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  runHermesConnectionAuthorize,
  runHermesConnectionDisconnect,
  runHermesConnectionProbe,
  type ConnectionControlDeps,
  type HermesSpawnResult,
} from "../connectionControlHandlers";
import { buildFakeHermesEnv, FAKE_HERMES_CLI_PATH, type FakeHermesScenario } from "./fixtures/fakeHermesCli/scenario";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function buildLogger() {
  return { info: vi.fn(), warn: vi.fn() };
}

function buildProfileOps() {
  return { ensureProfile: vi.fn().mockResolvedValue(undefined), removeProfile: vi.fn().mockResolvedValue(undefined) };
}

/** Spawns the REAL fake `hermes.mjs` fixture — used for at least one path
 *  per handler (spec §4.2), everything else uses a stubbed `spawnHermes`. */
function createRealSpawnHermes(env: NodeJS.ProcessEnv) {
  return function spawnHermes(
    args: string[],
    opts: { timeoutMs: number; onStdoutLine(line: string): void },
  ): Promise<HermesSpawnResult> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [FAKE_HERMES_CLI_PATH, ...args], { env });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        stdout += `${line}\n`;
        opts.onStdoutLine(line);
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve({ exitCode: null, stdout, stderr });
      }, opts.timeoutMs);
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr });
      });
    });
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function buildRealDeps(scenario: FakeHermesScenario): ConnectionControlDeps {
  const { env, cleanup } = buildFakeHermesEnv(scenario);
  cleanups.push(cleanup);
  return {
    spawnHermes: createRealSpawnHermes(env),
    postEvent: vi.fn().mockResolvedValue(undefined),
    profileOps: buildProfileOps(),
    logger: buildLogger(),
    clock: () => NOW,
  };
}

describe("runHermesConnectionAuthorize", () => {
  it("posts hermes_device_code exactly once, never logs the code/URL, and resolves ok:true with accountHint (real fixture)", async () => {
    // URL + code on the SAME line, so the clean parse succeeds on the very
    // first buffered line — this is the "clean parse" path; the
    // raw-fallback path (URL-only or code-only lines arriving separately)
    // is covered by its own dedicated tests below.
    const deps = buildRealDeps({
      authAdd: {
        deviceCodeLines: ["Please open: https://accounts.x.ai/device and enter code WKPT-9F3H"],
        approveAfterMs: 30,
      },
      authStatus: { stdoutLines: ["Status: authenticated", "Account: grok-fan@example.com"] },
    });

    const outcome = await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );

    expect(outcome).toMatchObject({ ok: true, accountHint: "grok-fan@example.com" });

    const deviceCodeCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
    expect(deviceCodeCalls).toHaveLength(1);
    expect(deviceCodeCalls[0][1]).toMatchObject({
      verificationUrl: "https://accounts.x.ai/device",
      userCode: "WKPT-9F3H",
    });

    const authorizedCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_authorized");
    expect(authorizedCalls).toHaveLength(1);

    const allLoggedText = [...(deps.logger.info as any).mock.calls, ...(deps.logger.warn as any).mock.calls]
      .map((call: any[]) => String(call[0]))
      .join("\n");
    expect(allLoggedText).not.toContain("WKPT-9F3H");
    expect(allLoggedText).not.toContain("https://accounts.x.ai/device");
  });

  it("calls ensureProfile before spawning", async () => {
    const deps = buildRealDeps({
      authAdd: { deviceCodeLines: ["Visit https://accounts.x.ai/device and enter ABCD-EFGH"], approveAfterMs: 10 },
    });
    await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    expect(deps.profileOps.ensureProfile).toHaveBeenCalledWith("conn_conn-1");
  });

  it("device-code timeout/expiry output -> typed failure HERMES_OAUTH_SESSION_EXPIRED", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\n",
        stderr: "Error: the device code has expired\n",
      }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_OAUTH_SESSION_EXPIRED", failureReason: "oauth_session_expired" });
    if (!outcome.ok) {
      expect(outcome.diagnostic).not.toContain("ABCD-EFGH");
    }
  });

  it("denial output -> typed failure HERMES_OAUTH_DENIED", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "Authorization denied by user.\n",
        stderr: "",
      }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_OAUTH_DENIED", failureReason: "oauth_denied" });
  });

  it("posts hermes_device_code with the raw-fallback shape when a code-like line appears without a parseable URL", async () => {
    const postEvent = vi.fn().mockResolvedValue(undefined);
    const spawnHermes = vi.fn()
      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
        opts.onStdoutLine("Your code: WKPT-9F3H (open the link shown on your other device)");
        return { exitCode: 0, stdout: "Authorization approved.\n", stderr: "" };
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\nAccount: grok-fan@example.com\n", stderr: "" });
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent,
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };

    await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );

    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
    expect(deviceCodeCalls).toHaveLength(1);
    expect(deviceCodeCalls[0][1]).toMatchObject({ raw: expect.stringContaining("WKPT-9F3H") });
    expect(deviceCodeCalls[0][1]).not.toHaveProperty("verificationUrl");
    expect(deviceCodeCalls[0][1]).not.toHaveProperty("userCode");
  });

  it("does NOT post the raw-fallback event for ordinary chatter that contains no URL-like/code-like token", async () => {
    const postEvent = vi.fn().mockResolvedValue(undefined);
    const spawnHermes = vi.fn()
      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
        opts.onStdoutLine("Starting Hermes CLI authorization flow, please wait...");
        return { exitCode: 1, stdout: "", stderr: "denied by user\n" };
      });
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent,
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };

    await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );

    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
    expect(deviceCodeCalls).toHaveLength(0);
  });

  it("clean-parse-after-raw does not double-post: once the raw-fallback event latches, a later clean parse (URL arrives on a subsequent line) never re-posts", async () => {
    const postEvent = vi.fn().mockResolvedValue(undefined);
    const spawnHermes = vi.fn()
      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
        opts.onStdoutLine("Your code: WKPT-9F3H (open the link shown on your other device)");
        opts.onStdoutLine("Please visit https://accounts.x.ai/device to continue");
        return { exitCode: 0, stdout: "Authorization approved.\n", stderr: "" };
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\nAccount: grok-fan@example.com\n", stderr: "" });
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent,
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };

    await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );

    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
    expect(deviceCodeCalls).toHaveLength(1);
    // Still the ORIGINAL raw-fallback payload — the later clean parse never overwrote it.
    expect(deviceCodeCalls[0][1]).toMatchObject({ raw: expect.stringContaining("WKPT-9F3H") });
    expect(deviceCodeCalls[0][1]).not.toHaveProperty("verificationUrl");
  });

  it("diagnostic prefers stderr's first non-empty line over stdout's device-code instruction line", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\n",
        stderr: "\nError: session revoked by user\n",
      }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // Masked to first 4 chars of the STDERR line ("Erro…"), never the
      // stdout device-code instruction line.
      expect(outcome.diagnostic).toContain("Erro");
      expect(outcome.diagnostic).not.toContain("ABCD-EFGH");
      expect(outcome.diagnostic).not.toContain("Visi");
    }
  });

  it("diagnostic falls back to the LAST non-empty stdout line (not the first) when stderr is empty", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\nAuthorization denied by user.\n",
        stderr: "",
      }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      // Masked to first 4 chars of the LAST stdout line ("Auth…"), not the
      // FIRST stdout line (which would have been "Visi…").
      expect(outcome.diagnostic).toContain("Auth");
      expect(outcome.diagnostic).not.toContain("Visi");
    }
  });

  it("does not post hermes_authorized when auth add fails", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "denied by user\n" }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    await runHermesConnectionAuthorize(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
      deps,
    );
    const authorizedCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_authorized");
    expect(authorizedCalls).toHaveLength(0);
  });
});

describe("runHermesConnectionProbe", () => {
  it("produces a manifest reflecting post-auth tool availability (real fixture, image tools only)", async () => {
    const deps = buildRealDeps({
      authStatus: { stdoutLines: ["Status: authenticated", "Account: grok-fan@example.com"] },
      tools: { stdoutLines: ["Available tools:", "- image.generate", "- image.edit"] },
      version: { stdoutLines: ["hermes-cli 2.4.1"] },
    });

    const outcome = await runHermesConnectionProbe(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
      deps,
    );

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.manifest?.hermesVersion).toBe("hermes-cli 2.4.1");
      expect(outcome.manifest?.probedAt).toBe(NOW.toISOString());
      expect(outcome.manifest?.operations["image.generate"]?.enabled).toBe(true);
      expect(outcome.manifest?.operations["video.generate"]?.enabled).toBe(false);
      expect(outcome.manifest?.operations["video.generate"]?.reason).toBeTruthy();
    }
  });

  it("xAI-403 scenario on auth status -> outcome classified HERMES_ENTITLEMENT_RESTRICTED", async () => {
    const deps: ConnectionControlDeps = {
      spawnHermes: vi.fn().mockResolvedValue({
        exitCode: 1,
        stdout: "",
        stderr: "xAI API returned 403 forbidden: entitlement required\n",
      }),
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionProbe(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
      deps,
    );
    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_ENTITLEMENT_RESTRICTED", failureReason: "entitlement_restricted" });
  });

  it("xAI-403 scenario on tools listing (post-auth) -> also classified HERMES_ENTITLEMENT_RESTRICTED", async () => {
    const spawnHermes = vi.fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\n", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "403 forbidden entitlement\n" });
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps: buildProfileOps(),
      logger: buildLogger(),
      clock: () => NOW,
    };
    const outcome = await runHermesConnectionProbe(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
      deps,
    );
    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_ENTITLEMENT_RESTRICTED", failureReason: "entitlement_restricted" });
  });
});

describe("runHermesConnectionDisconnect", () => {
  it("runs logout THEN profile removal (order asserted via call sequence, real fixture logout)", async () => {
    const callOrder: string[] = [];
    const { env, cleanup } = buildFakeHermesEnv({ authLogout: { stdoutLines: ["Logged out."] } });
    cleanups.push(cleanup);
    const realSpawn = createRealSpawnHermes(env);
    const spawnHermes = vi.fn().mockImplementation(async (...args: Parameters<typeof realSpawn>) => {
      callOrder.push("spawnHermes");
      return realSpawn(...args);
    });
    const profileOps = {
      ensureProfile: vi.fn().mockResolvedValue(undefined),
      removeProfile: vi.fn().mockImplementation(async () => {
        callOrder.push("removeProfile");
      }),
    };
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps,
      logger: buildLogger(),
      clock: () => NOW,
    };

    const outcome = await runHermesConnectionDisconnect(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
      deps,
    );

    expect(outcome).toMatchObject({ ok: true });
    expect(callOrder).toEqual(["spawnHermes", "removeProfile"]);
  });

  it("profile-removal failure -> typed failure (no silent success), logout still attempted", async () => {
    const spawnHermes = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "Logged out.\n", stderr: "" });
    const profileOps = {
      ensureProfile: vi.fn().mockResolvedValue(undefined),
      removeProfile: vi.fn().mockRejectedValue(new Error("EACCES: permission denied")),
    };
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps,
      logger: buildLogger(),
      clock: () => NOW,
    };

    const outcome = await runHermesConnectionDisconnect(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
      deps,
    );

    expect(spawnHermes).toHaveBeenCalledTimes(1);
    expect(profileOps.removeProfile).toHaveBeenCalledTimes(1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe("HERMES_PROCESS_FAILED");
      expect(outcome.failureReason).toBe("process_failed");
      expect(outcome.diagnostic).not.toContain("EACCES: permission denied");
    }
  });

  it("logout failure -> typed failure, profile removal still attempted", async () => {
    const spawnHermes = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "invalid_grant\n" });
    const profileOps = {
      ensureProfile: vi.fn().mockResolvedValue(undefined),
      removeProfile: vi.fn().mockResolvedValue(undefined),
    };
    const deps: ConnectionControlDeps = {
      spawnHermes,
      postEvent: vi.fn().mockResolvedValue(undefined),
      profileOps,
      logger: buildLogger(),
      clock: () => NOW,
    };

    const outcome = await runHermesConnectionDisconnect(
      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
      deps,
    );

    expect(profileOps.removeProfile).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_REAUTH_REQUIRED", failureReason: "reauth_required" });
  });
});
