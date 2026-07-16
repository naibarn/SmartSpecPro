diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 5a3d3b1f6..17a8c2036 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -1617,6 +1617,27 @@ async function main() {
     console.error("[Startup] Failed to start inline render worker:", error);
   }
 
+  // Feature 135 — Hermes Grok media worker: start the 60s connection-
+  // control-job settlement sweep only when the admin flag is ON (default
+  // OFF). Mirrors the inline render worker block directly above: lazy
+  // `await import(...)` + flag-guard + try/catch so a failure to load
+  // either module (or the flag being off) never blocks the rest of
+  // startup. Settles terminal-but-unsettled hermes connection/media jobs
+  // that nobody polled (e.g. the user closed the tab mid-authorize).
+  try {
+    const { getHermesWorkerSettings } = await import("../services/hermesWorkerSettings");
+    const settings = await getHermesWorkerSettings();
+    if (settings.enabled) {
+      const { startHermesConnectionJobSweep } = await import("../services/hermesConnectionJobs");
+      startHermesConnectionJobSweep();
+      console.log("[Startup] Hermes connection-control job sweep started (admin flag ON)");
+    } else {
+      console.log("[Startup] Hermes connection-control job sweep NOT started (admin flag OFF — default)");
+    }
+  } catch (error) {
+    console.error("[Startup] Failed to start Hermes connection-control job sweep:", error);
+  }
+
   // Initialize Telegram notification queue
   try {
     const db = await getDb();
@@ -1896,6 +1917,19 @@ async function main() {
     serveStatic(app);
   }
 
+  // Warm the model registry cache from the DB BEFORE accepting traffic, so the
+  // first requests after a (re)start don't fall back to the small static model
+  // subset — which omits DB-only models (e.g. the higgsfield/magnific catalog)
+  // and would make the vertical-drama model-resolution guards falsely reject a
+  // valid user selection during the cold-start window. Non-fatal: the resolvers
+  // also tolerate an unloaded catalog (see `isDbModelCatalogLoaded`).
+  try {
+    const { refreshModelCache } = await import("../services/modelRegistry");
+    await refreshModelCache();
+  } catch (error) {
+    console.error("[Startup] Failed to warm model registry cache:", error);
+  }
+
   // Prefer PORT, else pick a free one
   const preferred = parseInt(process.env.PORT || "3000");
   const port = Number.isFinite(preferred) ? preferred : 3000;
diff --git a/apps/web/server/hermesWorker/__tests__/connectionControlHandlers.test.ts b/apps/web/server/hermesWorker/__tests__/connectionControlHandlers.test.ts
new file mode 100644
index 000000000..3bb80f87b
--- /dev/null
+++ b/apps/web/server/hermesWorker/__tests__/connectionControlHandlers.test.ts
@@ -0,0 +1,461 @@
+import { spawn } from "node:child_process";
+import readline from "node:readline";
+import { afterEach, describe, expect, it, vi } from "vitest";
+
+import {
+  runHermesConnectionAuthorize,
+  runHermesConnectionDisconnect,
+  runHermesConnectionProbe,
+  type ConnectionControlDeps,
+  type HermesSpawnResult,
+} from "../connectionControlHandlers";
+import { buildFakeHermesEnv, FAKE_HERMES_CLI_PATH, type FakeHermesScenario } from "./fixtures/fakeHermesCli/scenario";
+
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+
+function buildLogger() {
+  return { info: vi.fn(), warn: vi.fn() };
+}
+
+function buildProfileOps() {
+  return { ensureProfile: vi.fn().mockResolvedValue(undefined), removeProfile: vi.fn().mockResolvedValue(undefined) };
+}
+
+/** Spawns the REAL fake `hermes.mjs` fixture — used for at least one path
+ *  per handler (spec §4.2), everything else uses a stubbed `spawnHermes`. */
+function createRealSpawnHermes(env: NodeJS.ProcessEnv) {
+  return function spawnHermes(
+    args: string[],
+    opts: { timeoutMs: number; onStdoutLine(line: string): void },
+  ): Promise<HermesSpawnResult> {
+    return new Promise((resolve) => {
+      const child = spawn(process.execPath, [FAKE_HERMES_CLI_PATH, ...args], { env });
+      let stdout = "";
+      let stderr = "";
+      let settled = false;
+      const rl = readline.createInterface({ input: child.stdout });
+      rl.on("line", (line) => {
+        stdout += `${line}\n`;
+        opts.onStdoutLine(line);
+      });
+      child.stderr.on("data", (chunk) => {
+        stderr += chunk.toString();
+      });
+      const timer = setTimeout(() => {
+        if (settled) return;
+        settled = true;
+        child.kill("SIGKILL");
+        resolve({ exitCode: null, stdout, stderr });
+      }, opts.timeoutMs);
+      child.on("close", (code) => {
+        if (settled) return;
+        settled = true;
+        clearTimeout(timer);
+        resolve({ exitCode: code, stdout, stderr });
+      });
+    });
+  };
+}
+
+const cleanups: Array<() => void> = [];
+afterEach(() => {
+  while (cleanups.length) cleanups.pop()!();
+});
+
+function buildRealDeps(scenario: FakeHermesScenario): ConnectionControlDeps {
+  const { env, cleanup } = buildFakeHermesEnv(scenario);
+  cleanups.push(cleanup);
+  return {
+    spawnHermes: createRealSpawnHermes(env),
+    postEvent: vi.fn().mockResolvedValue(undefined),
+    profileOps: buildProfileOps(),
+    logger: buildLogger(),
+    clock: () => NOW,
+  };
+}
+
+describe("runHermesConnectionAuthorize", () => {
+  it("posts hermes_device_code exactly once, never logs the code/URL, and resolves ok:true with accountHint (real fixture)", async () => {
+    // URL + code on the SAME line, so the clean parse succeeds on the very
+    // first buffered line — this is the "clean parse" path; the
+    // raw-fallback path (URL-only or code-only lines arriving separately)
+    // is covered by its own dedicated tests below.
+    const deps = buildRealDeps({
+      authAdd: {
+        deviceCodeLines: ["Please open: https://accounts.x.ai/device and enter code WKPT-9F3H"],
+        approveAfterMs: 30,
+      },
+      authStatus: { stdoutLines: ["Status: authenticated", "Account: grok-fan@example.com"] },
+    });
+
+    const outcome = await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+
+    expect(outcome).toMatchObject({ ok: true, accountHint: "grok-fan@example.com" });
+
+    const deviceCodeCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
+    expect(deviceCodeCalls).toHaveLength(1);
+    expect(deviceCodeCalls[0][1]).toMatchObject({
+      verificationUrl: "https://accounts.x.ai/device",
+      userCode: "WKPT-9F3H",
+    });
+
+    const authorizedCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_authorized");
+    expect(authorizedCalls).toHaveLength(1);
+
+    const allLoggedText = [...(deps.logger.info as any).mock.calls, ...(deps.logger.warn as any).mock.calls]
+      .map((call: any[]) => String(call[0]))
+      .join("\n");
+    expect(allLoggedText).not.toContain("WKPT-9F3H");
+    expect(allLoggedText).not.toContain("https://accounts.x.ai/device");
+  });
+
+  it("calls ensureProfile before spawning", async () => {
+    const deps = buildRealDeps({
+      authAdd: { deviceCodeLines: ["Visit https://accounts.x.ai/device and enter ABCD-EFGH"], approveAfterMs: 10 },
+    });
+    await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    expect(deps.profileOps.ensureProfile).toHaveBeenCalledWith("conn_conn-1");
+  });
+
+  it("device-code timeout/expiry output -> typed failure HERMES_OAUTH_SESSION_EXPIRED", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({
+        exitCode: 1,
+        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\n",
+        stderr: "Error: the device code has expired\n",
+      }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_OAUTH_SESSION_EXPIRED", failureReason: "oauth_session_expired" });
+    if (!outcome.ok) {
+      expect(outcome.diagnostic).not.toContain("ABCD-EFGH");
+    }
+  });
+
+  it("denial output -> typed failure HERMES_OAUTH_DENIED", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({
+        exitCode: 1,
+        stdout: "Authorization denied by user.\n",
+        stderr: "",
+      }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_OAUTH_DENIED", failureReason: "oauth_denied" });
+  });
+
+  it("posts hermes_device_code with the raw-fallback shape when a code-like line appears without a parseable URL", async () => {
+    const postEvent = vi.fn().mockResolvedValue(undefined);
+    const spawnHermes = vi.fn()
+      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
+        opts.onStdoutLine("Your code: WKPT-9F3H (open the link shown on your other device)");
+        return { exitCode: 0, stdout: "Authorization approved.\n", stderr: "" };
+      })
+      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\nAccount: grok-fan@example.com\n", stderr: "" });
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent,
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+
+    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
+    expect(deviceCodeCalls).toHaveLength(1);
+    expect(deviceCodeCalls[0][1]).toMatchObject({ raw: expect.stringContaining("WKPT-9F3H") });
+    expect(deviceCodeCalls[0][1]).not.toHaveProperty("verificationUrl");
+    expect(deviceCodeCalls[0][1]).not.toHaveProperty("userCode");
+  });
+
+  it("does NOT post the raw-fallback event for ordinary chatter that contains no URL-like/code-like token", async () => {
+    const postEvent = vi.fn().mockResolvedValue(undefined);
+    const spawnHermes = vi.fn()
+      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
+        opts.onStdoutLine("Starting Hermes CLI authorization flow, please wait...");
+        return { exitCode: 1, stdout: "", stderr: "denied by user\n" };
+      });
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent,
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+
+    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
+    expect(deviceCodeCalls).toHaveLength(0);
+  });
+
+  it("clean-parse-after-raw does not double-post: once the raw-fallback event latches, a later clean parse (URL arrives on a subsequent line) never re-posts", async () => {
+    const postEvent = vi.fn().mockResolvedValue(undefined);
+    const spawnHermes = vi.fn()
+      .mockImplementationOnce(async (_args: string[], opts: { onStdoutLine(line: string): void }) => {
+        opts.onStdoutLine("Your code: WKPT-9F3H (open the link shown on your other device)");
+        opts.onStdoutLine("Please visit https://accounts.x.ai/device to continue");
+        return { exitCode: 0, stdout: "Authorization approved.\n", stderr: "" };
+      })
+      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\nAccount: grok-fan@example.com\n", stderr: "" });
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent,
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+
+    const deviceCodeCalls = (postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_device_code");
+    expect(deviceCodeCalls).toHaveLength(1);
+    // Still the ORIGINAL raw-fallback payload — the later clean parse never overwrote it.
+    expect(deviceCodeCalls[0][1]).toMatchObject({ raw: expect.stringContaining("WKPT-9F3H") });
+    expect(deviceCodeCalls[0][1]).not.toHaveProperty("verificationUrl");
+  });
+
+  it("diagnostic prefers stderr's first non-empty line over stdout's device-code instruction line", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({
+        exitCode: 1,
+        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\n",
+        stderr: "\nError: session revoked by user\n",
+      }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    expect(outcome.ok).toBe(false);
+    if (!outcome.ok) {
+      // Masked to first 4 chars of the STDERR line ("Erro…"), never the
+      // stdout device-code instruction line.
+      expect(outcome.diagnostic).toContain("Erro");
+      expect(outcome.diagnostic).not.toContain("ABCD-EFGH");
+      expect(outcome.diagnostic).not.toContain("Visi");
+    }
+  });
+
+  it("diagnostic falls back to the LAST non-empty stdout line (not the first) when stderr is empty", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({
+        exitCode: 1,
+        stdout: "Visit https://accounts.x.ai/device and enter ABCD-EFGH\nAuthorization denied by user.\n",
+        stderr: "",
+      }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    expect(outcome.ok).toBe(false);
+    if (!outcome.ok) {
+      // Masked to first 4 chars of the LAST stdout line ("Auth…"), not the
+      // FIRST stdout line (which would have been "Visi…").
+      expect(outcome.diagnostic).toContain("Auth");
+      expect(outcome.diagnostic).not.toContain("Visi");
+    }
+  });
+
+  it("does not post hermes_authorized when auth add fails", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "denied by user\n" }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    await runHermesConnectionAuthorize(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 5 },
+      deps,
+    );
+    const authorizedCalls = (deps.postEvent as any).mock.calls.filter((call: any[]) => call[0] === "hermes_authorized");
+    expect(authorizedCalls).toHaveLength(0);
+  });
+});
+
+describe("runHermesConnectionProbe", () => {
+  it("produces a manifest reflecting post-auth tool availability (real fixture, image tools only)", async () => {
+    const deps = buildRealDeps({
+      authStatus: { stdoutLines: ["Status: authenticated", "Account: grok-fan@example.com"] },
+      tools: { stdoutLines: ["Available tools:", "- image.generate", "- image.edit"] },
+      version: { stdoutLines: ["hermes-cli 2.4.1"] },
+    });
+
+    const outcome = await runHermesConnectionProbe(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
+      deps,
+    );
+
+    expect(outcome.ok).toBe(true);
+    if (outcome.ok) {
+      expect(outcome.manifest?.hermesVersion).toBe("hermes-cli 2.4.1");
+      expect(outcome.manifest?.probedAt).toBe(NOW.toISOString());
+      expect(outcome.manifest?.operations["image.generate"]?.enabled).toBe(true);
+      expect(outcome.manifest?.operations["video.generate"]?.enabled).toBe(false);
+      expect(outcome.manifest?.operations["video.generate"]?.reason).toBeTruthy();
+    }
+  });
+
+  it("xAI-403 scenario on auth status -> outcome classified HERMES_ENTITLEMENT_RESTRICTED", async () => {
+    const deps: ConnectionControlDeps = {
+      spawnHermes: vi.fn().mockResolvedValue({
+        exitCode: 1,
+        stdout: "",
+        stderr: "xAI API returned 403 forbidden: entitlement required\n",
+      }),
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionProbe(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
+      deps,
+    );
+    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_ENTITLEMENT_RESTRICTED", failureReason: "entitlement_restricted" });
+  });
+
+  it("xAI-403 scenario on tools listing (post-auth) -> also classified HERMES_ENTITLEMENT_RESTRICTED", async () => {
+    const spawnHermes = vi.fn()
+      .mockResolvedValueOnce({ exitCode: 0, stdout: "Status: authenticated\n", stderr: "" })
+      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "403 forbidden entitlement\n" });
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps: buildProfileOps(),
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+    const outcome = await runHermesConnectionProbe(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 30 },
+      deps,
+    );
+    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_ENTITLEMENT_RESTRICTED", failureReason: "entitlement_restricted" });
+  });
+});
+
+describe("runHermesConnectionDisconnect", () => {
+  it("runs logout THEN profile removal (order asserted via call sequence, real fixture logout)", async () => {
+    const callOrder: string[] = [];
+    const { env, cleanup } = buildFakeHermesEnv({ authLogout: { stdoutLines: ["Logged out."] } });
+    cleanups.push(cleanup);
+    const realSpawn = createRealSpawnHermes(env);
+    const spawnHermes = vi.fn().mockImplementation(async (...args: Parameters<typeof realSpawn>) => {
+      callOrder.push("spawnHermes");
+      return realSpawn(...args);
+    });
+    const profileOps = {
+      ensureProfile: vi.fn().mockResolvedValue(undefined),
+      removeProfile: vi.fn().mockImplementation(async () => {
+        callOrder.push("removeProfile");
+      }),
+    };
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps,
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    const outcome = await runHermesConnectionDisconnect(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
+      deps,
+    );
+
+    expect(outcome).toMatchObject({ ok: true });
+    expect(callOrder).toEqual(["spawnHermes", "removeProfile"]);
+  });
+
+  it("profile-removal failure -> typed failure (no silent success), logout still attempted", async () => {
+    const spawnHermes = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "Logged out.\n", stderr: "" });
+    const profileOps = {
+      ensureProfile: vi.fn().mockResolvedValue(undefined),
+      removeProfile: vi.fn().mockRejectedValue(new Error("EACCES: permission denied")),
+    };
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps,
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    const outcome = await runHermesConnectionDisconnect(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
+      deps,
+    );
+
+    expect(spawnHermes).toHaveBeenCalledTimes(1);
+    expect(profileOps.removeProfile).toHaveBeenCalledTimes(1);
+    expect(outcome.ok).toBe(false);
+    if (!outcome.ok) {
+      expect(outcome.errorCode).toBe("HERMES_PROCESS_FAILED");
+      expect(outcome.failureReason).toBe("process_failed");
+      expect(outcome.diagnostic).not.toContain("EACCES: permission denied");
+    }
+  });
+
+  it("logout failure -> typed failure, profile removal still attempted", async () => {
+    const spawnHermes = vi.fn().mockResolvedValue({ exitCode: 1, stdout: "", stderr: "invalid_grant\n" });
+    const profileOps = {
+      ensureProfile: vi.fn().mockResolvedValue(undefined),
+      removeProfile: vi.fn().mockResolvedValue(undefined),
+    };
+    const deps: ConnectionControlDeps = {
+      spawnHermes,
+      postEvent: vi.fn().mockResolvedValue(undefined),
+      profileOps,
+      logger: buildLogger(),
+      clock: () => NOW,
+    };
+
+    const outcome = await runHermesConnectionDisconnect(
+      { connectionId: "conn-1", profileReference: "conn_conn-1", timeoutSeconds: 120 },
+      deps,
+    );
+
+    expect(profileOps.removeProfile).toHaveBeenCalledTimes(1);
+    expect(outcome).toMatchObject({ ok: false, errorCode: "HERMES_REAUTH_REQUIRED", failureReason: "reauth_required" });
+  });
+});
diff --git a/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/hermes.mjs b/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/hermes.mjs
new file mode 100755
index 000000000..a6985b792
--- /dev/null
+++ b/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/hermes.mjs
@@ -0,0 +1,140 @@
+#!/usr/bin/env node
+/**
+ * Feature 135 — Hermes Grok media worker: fake `hermes` CLI test fixture.
+ *
+ * Dependency-free (node builtins only) so it can be spawned directly by
+ * path from Vitest (section 04/07 tests) AND from `cargo test` (section 11)
+ * without any package installation. Behavior for each subcommand is driven
+ * entirely by a scenario JSON file whose path is passed via the
+ * `FAKE_HERMES_SCENARIO_FILE` environment variable (see `scenario.ts`'s
+ * `buildFakeHermesEnv` helper, which writes one scenario file per test).
+ *
+ * Dispatches on argv: `-p <profile> auth add xai-oauth --no-browser`,
+ * `-p <profile> auth status xai-oauth`, `-p <profile> auth logout
+ * xai-oauth`, `-p <profile> tools`, `--version`, and an unrecognized-flag
+ * fallback (e.g. `-z`) for defensive-parsing coverage. A `generate` branch
+ * is included now (unused by section 04 itself) so the fixture is stable
+ * for sections 07/10-smoke, which drive real media-generation invocations
+ * against the same fixture.
+ */
+import fs from "node:fs";
+
+function readScenario() {
+  const file = process.env.FAKE_HERMES_SCENARIO_FILE;
+  if (!file) return {};
+  try {
+    return JSON.parse(fs.readFileSync(file, "utf-8"));
+  } catch {
+    return {};
+  }
+}
+
+function emitLines(lines) {
+  for (const line of lines ?? []) {
+    process.stdout.write(`${line}\n`);
+  }
+}
+
+function sleep(ms) {
+  return new Promise((resolve) => setTimeout(resolve, ms));
+}
+
+async function runAuthAdd(scenario) {
+  const s = scenario.authAdd ?? {};
+  emitLines(
+    s.deviceCodeLines ?? [
+      "Visit https://accounts.x.ai/device and enter code ABCD-EFGH",
+      "This code expires in 15 minutes.",
+    ],
+  );
+
+  if (s.neverApprove) {
+    // Deliberately never resolves — the caller's own timeout/kill logic
+    // (injected `spawnHermes` contract) is responsible for termination.
+    await new Promise(() => {});
+    return;
+  }
+
+  if (s.denyAfterMs !== undefined) {
+    await sleep(s.denyAfterMs);
+    emitLines(s.stdoutLines ?? ["Authorization denied by user."]);
+    if (s.stderr) process.stderr.write(s.stderr);
+    process.exitCode = s.exitCode ?? 1;
+    return;
+  }
+
+  await sleep(s.approveAfterMs ?? 20);
+  emitLines(s.stdoutLines ?? ["Authorization approved."]);
+  if (s.stderr) process.stderr.write(s.stderr);
+  process.exitCode = s.exitCode ?? 0;
+}
+
+async function runSimple(scenario, key, defaultLines) {
+  const s = scenario[key] ?? {};
+  if (s.delayMs) await sleep(s.delayMs);
+  emitLines(s.stdoutLines ?? defaultLines);
+  if (s.stderr) process.stderr.write(s.stderr);
+  process.exitCode = s.exitCode ?? 0;
+}
+
+async function runGenerate(scenario) {
+  const s = scenario.generate ?? {};
+  if (s.delayMs) await sleep(s.delayMs);
+  emitLines(s.stdoutLines ?? []);
+  if (s.markerBlock) process.stdout.write(`${s.markerBlock}\n`);
+  if (s.mediaTags) process.stdout.write(`MEDIA_TAGS:${JSON.stringify(s.mediaTags)}\n`);
+  if (s.cacheFiles) process.stdout.write(`CACHE_FILES:${JSON.stringify(s.cacheFiles)}\n`);
+  if (s.workspaceFiles) process.stdout.write(`WORKSPACE_FILES:${JSON.stringify(s.workspaceFiles)}\n`);
+  if (s.stderr) process.stderr.write(s.stderr);
+  process.exitCode = s.exitCode ?? 0;
+}
+
+async function runDefault(scenario) {
+  const s = scenario.default ?? {};
+  emitLines(s.stdoutLines ?? []);
+  process.stderr.write(s.stderr ?? "unknown hermes command\n");
+  process.exitCode = s.exitCode ?? 1;
+}
+
+async function main() {
+  const scenario = readScenario();
+  let args = process.argv.slice(2);
+  if (args[0] === "-p") {
+    // Native per-profile invocation (`hermes -p <profile> ...`) — the
+    // profile name itself does not affect fixture behavior, only the
+    // scenario file does.
+    args = args.slice(2);
+  }
+
+  if (args[0] === "--version") {
+    await runSimple(scenario, "version", ["hermes-cli 1.0.0"]);
+    return;
+  }
+  if (args[0] === "auth" && args[1] === "add") {
+    await runAuthAdd(scenario);
+    return;
+  }
+  if (args[0] === "auth" && args[1] === "status") {
+    await runSimple(scenario, "authStatus", ["Status: authenticated", "Account: grok-fan@example.com"]);
+    return;
+  }
+  if (args[0] === "auth" && args[1] === "logout") {
+    await runSimple(scenario, "authLogout", ["Logged out."]);
+    return;
+  }
+  if (args[0] === "tools") {
+    await runSimple(scenario, "tools", ["Available tools:", "- image.generate", "- image.edit"]);
+    return;
+  }
+  if (args[0] === "generate") {
+    await runGenerate(scenario);
+    return;
+  }
+
+  await runDefault(scenario);
+}
+
+main().catch((error) => {
+  process.stderr.write(`fake-hermes-cli fatal: ${error?.message ?? String(error)}\n`);
+  process.exitCode = 1;
+});
diff --git a/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/scenario.ts b/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/scenario.ts
new file mode 100644
index 000000000..57c508746
--- /dev/null
+++ b/apps/web/server/hermesWorker/__tests__/fixtures/fakeHermesCli/scenario.ts
@@ -0,0 +1,85 @@
+/**
+ * Feature 135 — Hermes Grok media worker: fake `hermes` CLI scenario types +
+ * env-builder helper, shared by this section's handler/parser tests and by
+ * sections 07/11's tests and the step-4 CI smoke.
+ *
+ * `FAKE_HERMES_CLI_PATH` points at the sibling `hermes.mjs` fixture (node
+ * builtins only, executable) — spawn it directly with
+ * `process.execPath` (or, for section 11, directly by path) plus the env
+ * returned by `buildFakeHermesEnv`.
+ */
+import fs from "node:fs";
+import os from "node:os";
+import path from "node:path";
+import { randomUUID } from "node:crypto";
+
+export interface FakeHermesCommandScenario {
+  stdoutLines?: string[];
+  stderr?: string;
+  exitCode?: number;
+  delayMs?: number;
+}
+
+export interface FakeHermesAuthAddScenario extends FakeHermesCommandScenario {
+  /** Lines emitted immediately (the device-code instructions). */
+  deviceCodeLines?: string[];
+  /** Wait this long, then emit `stdoutLines` (default: approval message)
+   *  and exit 0 — simulates the user completing the device-code flow. */
+  approveAfterMs?: number;
+  /** Wait this long, then emit `stdoutLines` (default: denial message) and
+   *  exit non-zero — simulates the user declining. Takes precedence over
+   *  `approveAfterMs` when both are set. */
+  denyAfterMs?: number;
+  /** Never resolves on its own (relies on the caller's own timeout/kill —
+   *  simulates a device code that silently expires unattended). */
+  neverApprove?: boolean;
+}
+
+/** Reserved for sections 07/10-smoke — the `generate` branch is defined now
+ *  so the fixture is a stable dependency for those later sections. */
+export interface FakeHermesGenerateScenario extends FakeHermesCommandScenario {
+  mediaTags?: string[];
+  cacheFiles?: string[];
+  workspaceFiles?: string[];
+  markerBlock?: string;
+}
+
+export interface FakeHermesScenario {
+  authAdd?: FakeHermesAuthAddScenario;
+  authStatus?: FakeHermesCommandScenario;
+  authLogout?: FakeHermesCommandScenario;
+  tools?: FakeHermesCommandScenario;
+  version?: FakeHermesCommandScenario;
+  generate?: FakeHermesGenerateScenario;
+  /** Fallback for unrecognized argv (e.g. `-z`) — defensive-parsing coverage. */
+  default?: FakeHermesCommandScenario;
+}
+
+export const FAKE_HERMES_CLI_PATH = path.resolve(import.meta.dirname, "hermes.mjs");
+
+export interface FakeHermesEnvHandle {
+  env: NodeJS.ProcessEnv;
+  scenarioFile: string;
+  cleanup(): void;
+}
+
+/**
+ * Writes `scenario` to a fresh temp JSON file (one per call — parallel
+ * tests never collide) and returns a `process.env`-shaped object pointing
+ * `FAKE_HERMES_SCENARIO_FILE` at it, plus a `cleanup()` to remove the file.
+ */
+export function buildFakeHermesEnv(scenario: FakeHermesScenario): FakeHermesEnvHandle {
+  const scenarioFile = path.join(os.tmpdir(), `fake-hermes-scenario-${randomUUID()}.json`);
+  fs.writeFileSync(scenarioFile, JSON.stringify(scenario), "utf-8");
+  return {
+    scenarioFile,
+    env: { ...process.env, FAKE_HERMES_SCENARIO_FILE: scenarioFile },
+    cleanup: () => {
+      try {
+        fs.unlinkSync(scenarioFile);
+      } catch {
+        // Already removed — fine.
+      }
+    },
+  };
+}
diff --git a/apps/web/server/hermesWorker/__tests__/hermesCliParsers.test.ts b/apps/web/server/hermesWorker/__tests__/hermesCliParsers.test.ts
new file mode 100644
index 000000000..979afe5b0
--- /dev/null
+++ b/apps/web/server/hermesWorker/__tests__/hermesCliParsers.test.ts
@@ -0,0 +1,164 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  buildCapabilityManifest,
+  classifyHermesFailureOutput,
+  parseHermesAuthStatusOutput,
+  parseHermesDeviceCodeOutput,
+  parseHermesToolsOutput,
+} from "../hermesCliParsers";
+
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+const now = () => NOW;
+
+describe("parseHermesDeviceCodeOutput", () => {
+  it("extracts verificationUrl + userCode from URL and code on the same line", () => {
+    const result = parseHermesDeviceCodeOutput(
+      "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
+      { now },
+    );
+    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
+    expect(result.userCode).toBe("ABCD-EFGH");
+  });
+
+  it("extracts verificationUrl + userCode when they are on separate lines", () => {
+    const result = parseHermesDeviceCodeOutput(
+      ["Please open: https://accounts.x.ai/device", "Then enter code: ABCD-EFGH"].join("\n"),
+      { now },
+    );
+    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
+    expect(result.userCode).toBe("ABCD-EFGH");
+  });
+
+  it("extracts from decorated (box-drawing, padded/indented) output", () => {
+    const decorated = [
+      "╔══════════════════════════════════════════╗",
+      "║ Visit https://accounts.x.ai/device        ║",
+      "║ and enter code: ABCD-EFGH                 ║",
+      "╚══════════════════════════════════════════╝",
+    ].join("\n");
+    const result = parseHermesDeviceCodeOutput(decorated, { now });
+    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
+    expect(result.userCode).toBe("ABCD-EFGH");
+  });
+
+  it("populates expiresAt when an expiry line is present", () => {
+    const result = parseHermesDeviceCodeOutput(
+      [
+        "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
+        "This code expires in 15 minutes.",
+      ].join("\n"),
+      { now },
+    );
+    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());
+  });
+
+  it("leaves expiresAt undefined when no expiry line is present", () => {
+    const result = parseHermesDeviceCodeOutput(
+      "Visit https://accounts.x.ai/device and enter ABCD-EFGH",
+      { now },
+    );
+    expect(result.expiresAt).toBeUndefined();
+  });
+
+  it("falls back to { raw } for unparseable output (no URL, no code) and never throws", () => {
+    const result = parseHermesDeviceCodeOutput(
+      "Waiting for device authorization... please check your terminal.",
+      { now },
+    );
+    expect(result.raw).toContain("Waiting for device authorization");
+    expect(result.verificationUrl).toBeUndefined();
+    expect(result.userCode).toBeUndefined();
+  });
+
+  it("never returns a half-parsed code without its URL also present — falls back to raw instead", () => {
+    const result = parseHermesDeviceCodeOutput("Enter code: ABCD-EFGH", { now });
+    expect(result.userCode).toBeUndefined();
+    expect(result.verificationUrl).toBeUndefined();
+    expect(result.raw).toContain("ABCD-EFGH");
+  });
+
+  it("never returns a URL without a code also present — falls back to raw instead", () => {
+    const result = parseHermesDeviceCodeOutput("Visit https://accounts.x.ai/device", { now });
+    expect(result.verificationUrl).toBeUndefined();
+    expect(result.raw).toContain("https://accounts.x.ai/device");
+  });
+
+  it("returns {} for a completely empty buffer", () => {
+    expect(parseHermesDeviceCodeOutput("", { now })).toEqual({});
+  });
+
+  it("prefers an xAI host when multiple URLs are present", () => {
+    const result = parseHermesDeviceCodeOutput(
+      "See docs at https://example.com/help or visit https://accounts.x.ai/device and enter ABCD-EFGH",
+      { now },
+    );
+    expect(result.verificationUrl).toBe("https://accounts.x.ai/device");
+  });
+});
+
+describe("parseHermesAuthStatusOutput", () => {
+  it("returns authorized: true with accountHint for an authenticated status", () => {
+    const result = parseHermesAuthStatusOutput("Status: authenticated\nAccount: grok-fan@example.com");
+    expect(result.authorized).toBe(true);
+    expect(result.accountHint).toBe("grok-fan@example.com");
+  });
+
+  it("returns authorized: false for a not-authenticated status", () => {
+    expect(parseHermesAuthStatusOutput("Status: not authenticated").authorized).toBe(false);
+  });
+
+  it("returns authorized: false for garbage input", () => {
+    expect(parseHermesAuthStatusOutput("asdlkfjasldkfj 1234 !!!").authorized).toBe(false);
+  });
+});
+
+describe("parseHermesToolsOutput + buildCapabilityManifest", () => {
+  it("enables only the operations whose tool identifier appears in the output", () => {
+    const ops = parseHermesToolsOutput("Available tools:\n- image.generate\n- image.edit");
+    expect(ops.sort()).toEqual(["image.edit", "image.generate"]);
+  });
+
+  it("gates video.* enabled:false with a reason when only image tools appear (post-auth)", () => {
+    const manifest = buildCapabilityManifest({
+      hermesVersion: "1.2.3",
+      toolsOutput: "Available tools:\n- image.generate\n- image.edit",
+      authStatus: { authorized: true, accountHint: "grok-fan" },
+      probedAt: NOW.toISOString(),
+    });
+    expect(manifest.hermesVersion).toBe("1.2.3");
+    expect(manifest.probedAt).toBe(NOW.toISOString());
+    expect(manifest.operations["image.generate"]?.enabled).toBe(true);
+    expect(manifest.operations["image.edit"]?.enabled).toBe(true);
+    expect(manifest.operations["video.generate"]?.enabled).toBe(false);
+    expect(manifest.operations["video.generate"]?.reason).toBeTruthy();
+    expect(manifest.operations["video.image_to_video"]?.enabled).toBe(false);
+    expect(manifest.operations["video.reference_to_video"]?.enabled).toBe(false);
+    expect(manifest.models).toEqual({ image: [], video: [] });
+  });
+});
+
+describe("classifyHermesFailureOutput", () => {
+  it("maps a 403-ish xAI error body to entitlement_restricted", () => {
+    expect(classifyHermesFailureOutput("xAI API returned 403 Forbidden: entitlement required")).toBe(
+      "entitlement_restricted",
+    );
+  });
+
+  it("maps auth-invalid/revoked output to reauth_required", () => {
+    expect(classifyHermesFailureOutput("Error: invalid_grant, session revoked")).toBe("reauth_required");
+  });
+
+  it("maps a denial phrase to oauth_denied", () => {
+    expect(classifyHermesFailureOutput("Authorization denied by user.")).toBe("oauth_denied");
+  });
+
+  it("maps an expiry/timeout phrase to oauth_session_expired", () => {
+    expect(classifyHermesFailureOutput("The device code has expired.")).toBe("oauth_session_expired");
+    expect(classifyHermesFailureOutput("Operation timed out after 900s.")).toBe("oauth_session_expired");
+  });
+
+  it("maps anything else to a generic process failure", () => {
+    expect(classifyHermesFailureOutput("hermes: unexpected internal error")).toBe("process_failed");
+  });
+});
diff --git a/apps/web/server/hermesWorker/connectionControlHandlers.ts b/apps/web/server/hermesWorker/connectionControlHandlers.ts
new file mode 100644
index 000000000..75f472e33
--- /dev/null
+++ b/apps/web/server/hermesWorker/connectionControlHandlers.ts
@@ -0,0 +1,298 @@
+/**
+ * Feature 135 — Hermes Grok media worker: connection-control job handler
+ * cores. Pure functions with fully injected effects (spawn, event posting,
+ * profile ops, logger, clock) so they are unit-testable now, without a
+ * worker main loop, claim/heartbeat client, or real spawn/timeout/
+ * cancellation machinery (all section 07). Section 11 ports this same
+ * state machine to Rust against the same fixture scenarios.
+ *
+ * No `db` import, side-effect-free at import time — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which also
+ * walks this directory.
+ */
+import {
+  HERMES_AUTHORIZED_EVENT_TYPE,
+  HERMES_DEVICE_CODE_EVENT_TYPE,
+  maskTokenLike,
+  type HermesConnectionCapabilityManifest,
+  type HermesControlFailureReason,
+  type HermesMediaErrorCode,
+} from "../../shared/hermesMedia";
+import {
+  buildCapabilityManifest,
+  classifyHermesFailureOutput,
+  parseHermesAuthStatusOutput,
+  parseHermesDeviceCodeOutput,
+} from "./hermesCliParsers";
+
+export interface HermesSpawnResult {
+  exitCode: number | null;
+  stdout: string;
+  stderr: string;
+}
+
+export interface ConnectionControlDeps {
+  /** Section 07 wires the real invocation module in; timeout-kill escalation
+   *  lives entirely inside this injected contract — a simple
+   *  timeout-then-kill suffices for this section's handler cores. */
+  spawnHermes(
+    args: string[],
+    opts: { timeoutMs: number; onStdoutLine(line: string): void },
+  ): Promise<HermesSpawnResult>;
+  postEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
+  profileOps: {
+    ensureProfile(ref: string): Promise<void>;
+    removeProfile(ref: string): Promise<void>;
+  };
+  /** NEVER given device-code values (userCode/verificationUrl) — spec §16. */
+  logger: { info(msg: string): void; warn(msg: string): void };
+  clock?: () => Date;
+}
+
+export type HermesControlOutcome =
+  | { ok: true; accountHint?: string; manifest?: HermesConnectionCapabilityManifest }
+  | {
+      ok: false;
+      errorCode: HermesMediaErrorCode;
+      /** The raw `HermesControlFailureReason` string (e.g.
+       *  `"oauth_session_expired"`) — section 07 propagates this verbatim
+       *  into `worker_jobs.failureReason` so `hermesConnectionService.ts`'s
+       *  constants-first classifiers (section-03 review carry-forward item
+       *  A) actually hit their primary path instead of falling through to
+       *  the legacy substring heuristics. */
+      failureReason: HermesControlFailureReason;
+      diagnostic: string;
+    };
+
+export interface ConnectionControlInput {
+  connectionId: string;
+  profileReference: string;
+  timeoutSeconds: number;
+}
+
+const FAILURE_REASON_TO_ERROR_CODE: Record<HermesControlFailureReason, HermesMediaErrorCode> = {
+  oauth_session_expired: "HERMES_OAUTH_SESSION_EXPIRED",
+  oauth_denied: "HERMES_OAUTH_DENIED",
+  entitlement_restricted: "HERMES_ENTITLEMENT_RESTRICTED",
+  reauth_required: "HERMES_REAUTH_REQUIRED",
+  process_failed: "HERMES_PROCESS_FAILED",
+};
+
+/**
+ * Builds a diagnostic string that is ALREADY masked — never more than 4 raw
+ * characters of any CLI output line survive into it, so it can never carry
+ * a code/URL/token even by accident.
+ *
+ * Prefers stderr's first non-empty line (that's where the actual error
+ * text lives for a well-behaved CLI); falls back to scanning stdout from
+ * the END (the LAST non-empty stdout line is far more likely to be the
+ * terminal error/denial message than the FIRST, which for the authorize
+ * flow is usually the device-code instruction line itself).
+ */
+function buildDiagnostic(reason: HermesControlFailureReason, stdout: string, stderr: string): string {
+  const stderrLine = stderr
+    .split(/\r?\n/)
+    .map((line) => line.trim())
+    .find((line) => line.length > 0);
+  if (stderrLine) return `${reason}: ${maskTokenLike(stderrLine)}`;
+
+  const stdoutLines = stdout
+    .split(/\r?\n/)
+    .map((line) => line.trim())
+    .filter((line) => line.length > 0);
+  const lastStdoutLine = stdoutLines.length > 0 ? stdoutLines[stdoutLines.length - 1] : "";
+  return `${reason}: ${maskTokenLike(lastStdoutLine)}`;
+}
+
+// A raw-fallback buffer is only worth posting once it actually contains a
+// URL-like or code-like token — not for ordinary CLI chatter that precedes
+// the real device-code line (e.g. "Starting Hermes CLI..."). Deliberately
+// mirrors (but does not import) `hermesCliParsers.ts`'s own URL/code
+// detection so the raw-fallback post fires on the same kind of content the
+// parser itself considered a genuine (if incomplete) candidate.
+const RAW_FALLBACK_URL_LIKE_PATTERN = /https?:\/\//i;
+const RAW_FALLBACK_CODE_LIKE_PATTERN = /\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?\b/;
+
+function looksLikeDeviceCodeCandidate(text: string): boolean {
+  return RAW_FALLBACK_URL_LIKE_PATTERN.test(text) || RAW_FALLBACK_CODE_LIKE_PATTERN.test(text);
+}
+
+function classifyAndBuildFailure(
+  stdout: string,
+  stderr: string,
+): { ok: false; errorCode: HermesMediaErrorCode; failureReason: HermesControlFailureReason; diagnostic: string } {
+  const combinedOutput = `${stdout}\n${stderr}`;
+  const reason = classifyHermesFailureOutput(combinedOutput);
+  return {
+    ok: false,
+    errorCode: FAILURE_REASON_TO_ERROR_CODE[reason],
+    failureReason: reason,
+    diagnostic: buildDiagnostic(reason, stdout, stderr),
+  };
+}
+
+/**
+ * Authorize flow: `ensureProfile` → spawn `hermes -p <profile> auth add
+ * xai-oauth --no-browser` → on stdout lines, defensively parse the device
+ * code → on first successful parse, post `hermes_device_code` EXACTLY ONCE
+ * (latched) → the child stays alive while the user completes the flow
+ * (bounded by `timeoutSeconds`, enforced by the injected `spawnHermes`) →
+ * on success, run `auth status`, parse `accountHint`, post
+ * `hermes_authorized` → return a success outcome. Timeout/denial output →
+ * typed failure outcome (child termination is the injected `spawnHermes`
+ * contract's responsibility).
+ */
+export async function runHermesConnectionAuthorize(
+  input: ConnectionControlInput,
+  deps: ConnectionControlDeps,
+): Promise<HermesControlOutcome> {
+  const clock = deps.clock ?? (() => new Date());
+  await deps.profileOps.ensureProfile(input.profileReference);
+  deps.logger.info(`hermes_connection_authorize: starting for connection ${input.connectionId}`);
+
+  let deviceCodePosted = false;
+  const bufferedLines: string[] = [];
+
+  const onStdoutLine = (line: string) => {
+    bufferedLines.push(line);
+    if (deviceCodePosted) return;
+    const parsed = parseHermesDeviceCodeOutput(bufferedLines.join("\n"), { now: clock });
+
+    if (parsed.verificationUrl && parsed.userCode) {
+      deviceCodePosted = true;
+      const payload: Record<string, unknown> = {
+        verificationUrl: parsed.verificationUrl,
+        userCode: parsed.userCode,
+      };
+      if (parsed.expiresAt) payload.expiresAt = parsed.expiresAt;
+      deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, payload).catch(() => {
+        // Best-effort — a dropped event-post must not crash the handler;
+        // the connection simply stays pending until the sweep/next status
+        // poll re-evaluates (never re-logged with device-code content).
+      });
+      return;
+    }
+
+    // Undocumented-format safety net (spec research B2/B3): a clean parse
+    // isn't available, but SOMETHING url-like/code-like has appeared in the
+    // buffered output — post the raw-fallback shape once (same latch) so
+    // the OAuth flow never silently hangs on a CLI output shape the parser
+    // couldn't fully structure. A later clean parse (once more lines
+    // arrive) must NOT re-post — `deviceCodePosted` already latches that.
+    if (parsed.raw && looksLikeDeviceCodeCandidate(parsed.raw)) {
+      deviceCodePosted = true;
+      deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, { raw: parsed.raw }).catch(() => {
+        // Best-effort — see comment above.
+      });
+    }
+  };
+
+  const authAddResult = await deps.spawnHermes(
+    ["-p", input.profileReference, "auth", "add", "xai-oauth", "--no-browser"],
+    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine },
+  );
+
+  if (authAddResult.exitCode !== 0) {
+    deps.logger.warn(`hermes_connection_authorize: auth add failed for connection ${input.connectionId}`);
+    return classifyAndBuildFailure(authAddResult.stdout, authAddResult.stderr);
+  }
+
+  const statusResult = await deps.spawnHermes(
+    ["-p", input.profileReference, "auth", "status", "xai-oauth"],
+    { timeoutMs: 30_000, onStdoutLine: () => {} },
+  );
+  const authStatus = parseHermesAuthStatusOutput(statusResult.stdout);
+
+  await deps.postEvent(HERMES_AUTHORIZED_EVENT_TYPE, { accountHint: authStatus.accountHint });
+  deps.logger.info(`hermes_connection_authorize: completed for connection ${input.connectionId}`);
+  return { ok: true, accountHint: authStatus.accountHint };
+}
+
+/**
+ * Probe flow: `auth status` (fails closed if not authorized/entitled) →
+ * `tools` (media tools are credential-gated, hence post-auth only) →
+ * `--version` → composes the capability manifest.
+ */
+export async function runHermesConnectionProbe(
+  input: ConnectionControlInput,
+  deps: ConnectionControlDeps,
+): Promise<HermesControlOutcome> {
+  const clock = deps.clock ?? (() => new Date());
+  deps.logger.info(`hermes_connection_probe: starting for connection ${input.connectionId}`);
+
+  const statusResult = await deps.spawnHermes(
+    ["-p", input.profileReference, "auth", "status", "xai-oauth"],
+    { timeoutMs: Math.min(input.timeoutSeconds, 30) * 1000, onStdoutLine: () => {} },
+  );
+  if (statusResult.exitCode !== 0) {
+    deps.logger.warn(`hermes_connection_probe: auth status failed for connection ${input.connectionId}`);
+    return classifyAndBuildFailure(statusResult.stdout, statusResult.stderr);
+  }
+  const authStatus = parseHermesAuthStatusOutput(statusResult.stdout);
+
+  const toolsResult = await deps.spawnHermes(
+    ["-p", input.profileReference, "tools"],
+    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine: () => {} },
+  );
+  if (toolsResult.exitCode !== 0) {
+    deps.logger.warn(`hermes_connection_probe: tools listing failed for connection ${input.connectionId}`);
+    return classifyAndBuildFailure(toolsResult.stdout, toolsResult.stderr);
+  }
+
+  const versionResult = await deps.spawnHermes(["--version"], { timeoutMs: 10_000, onStdoutLine: () => {} });
+  const hermesVersion = versionResult.stdout.trim() || "unknown";
+
+  const manifest = buildCapabilityManifest({
+    hermesVersion,
+    toolsOutput: toolsResult.stdout,
+    authStatus,
+    probedAt: clock().toISOString(),
+  });
+
+  deps.logger.info(`hermes_connection_probe: completed for connection ${input.connectionId}`);
+  return { ok: true, accountHint: authStatus.accountHint, manifest };
+}
+
+/**
+ * Disconnect flow: `auth logout` THEN profile-directory removal (order
+ * matters — asserted via call sequence in tests). A profile-removal
+ * failure is a typed failure (never silently swallowed), even though
+ * logout itself is still always attempted first.
+ */
+export async function runHermesConnectionDisconnect(
+  input: ConnectionControlInput,
+  deps: ConnectionControlDeps,
+): Promise<HermesControlOutcome> {
+  deps.logger.info(`hermes_connection_disconnect: starting for connection ${input.connectionId}`);
+
+  const logoutResult = await deps.spawnHermes(
+    ["-p", input.profileReference, "auth", "logout", "xai-oauth"],
+    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine: () => {} },
+  );
+
+  let removeError: unknown;
+  try {
+    await deps.profileOps.removeProfile(input.profileReference);
+  } catch (error) {
+    removeError = error;
+  }
+
+  if (logoutResult.exitCode !== 0) {
+    deps.logger.warn(`hermes_connection_disconnect: logout failed for connection ${input.connectionId}`);
+    return classifyAndBuildFailure(logoutResult.stdout, logoutResult.stderr);
+  }
+
+  if (removeError !== undefined) {
+    const message = removeError instanceof Error ? removeError.message : String(removeError);
+    deps.logger.warn(`hermes_connection_disconnect: profile removal failed for connection ${input.connectionId}`);
+    return {
+      ok: false,
+      errorCode: "HERMES_PROCESS_FAILED",
+      failureReason: "process_failed",
+      diagnostic: `profile_removal_failed: ${maskTokenLike(message)}`,
+    };
+  }
+
+  deps.logger.info(`hermes_connection_disconnect: completed for connection ${input.connectionId}`);
+  return { ok: true };
+}
diff --git a/apps/web/server/hermesWorker/hermesCliParsers.ts b/apps/web/server/hermesWorker/hermesCliParsers.ts
new file mode 100644
index 000000000..e48ddf7de
--- /dev/null
+++ b/apps/web/server/hermesWorker/hermesCliParsers.ts
@@ -0,0 +1,187 @@
+/**
+ * Feature 135 — Hermes Grok media worker: defensive stdout parsers for the
+ * `hermes` CLI (research B2/B3: device-code stdout format is
+ * UNDOCUMENTED — parse defensively, never throw).
+ *
+ * Pure functions, no I/O, no `db` import — this module must stay importable
+ * by the section-07 shared worker process AND unit-testable here with zero
+ * DB/process dependencies. See `server/services/__tests__/
+ * hermesMediaNamespaceGuard.test.ts`, which also walks this directory.
+ */
+import {
+  HERMES_CONTROL_FAILURE_REASONS,
+  HERMES_MEDIA_OPERATIONS,
+  type HermesConnectionCapabilityManifest,
+  type HermesControlFailureReason,
+  type HermesMediaOperation,
+} from "../../shared/hermesMedia";
+
+export interface HermesDeviceCodeParseResult {
+  verificationUrl?: string;
+  userCode?: string;
+  expiresAt?: string;
+  /** Fallback when parsing failed — raw candidate lines preserved so the UI
+   *  can still show the (untranslated) instruction text. Never logged. */
+  raw?: string;
+}
+
+export interface HermesAuthStatusParseResult {
+  authorized: boolean;
+  accountHint?: string;
+}
+
+// Box-drawing (U+2500–U+257F), block elements (U+2580–U+259F), geometric
+// shapes (U+25A0–U+25FF), and common bullet glyphs. Deliberately does NOT
+// strip plain ASCII punctuation (":", "-", ".", "/") — a user code like
+// "ABCD-EFGH" or a URL must survive stripping intact.
+const DECORATION_PATTERN = /[─-◿•]/g;
+
+function stripDecoration(line: string): string {
+  return line.replace(DECORATION_PATTERN, " ").trim();
+}
+
+const URL_PATTERN = /https:\/\/[^\s"'<>]+/g;
+const CODE_PATTERN = /\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?\b/g;
+const XAI_HOST_PATTERN = /^https:\/\/([a-z0-9-]+\.)*x\.ai\//i;
+
+/** Prefer an xAI-ish host when multiple URLs are present; accept any
+ *  https URL otherwise (spec: "do not over-fit"). */
+function pickBestUrl(urls: string[]): string | undefined {
+  if (urls.length === 0) return undefined;
+  return urls.find((url) => XAI_HOST_PATTERN.test(url)) ?? urls[0];
+}
+
+function extractExpiresAt(text: string, now: () => Date): string | undefined {
+  const isoMatch = text.match(/expires?(?:\s+at)?[:\s]+([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.Z+-]+)/i);
+  if (isoMatch) {
+    const parsed = new Date(isoMatch[1]);
+    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
+  }
+  const relMatch = text.match(/(?:expires?|valid for)\s+(?:in\s+)?(\d+)\s*(minute|min|hour|hr)s?\b/i);
+  if (relMatch) {
+    const amount = Number.parseInt(relMatch[1], 10);
+    const unit = relMatch[2].toLowerCase();
+    const ms = unit.startsWith("hour") || unit === "hr" ? amount * 60 * 60_000 : amount * 60_000;
+    return new Date(now().getTime() + ms).toISOString();
+  }
+  return undefined;
+}
+
+/**
+ * Extracts `{ verificationUrl, userCode, expiresAt }` from an accumulated
+ * buffer of `hermes auth add xai-oauth --no-browser` stdout (callers should
+ * pass the FULL buffer seen so far — URL and code frequently land on
+ * separate lines). Never throws; unparseable output falls back to
+ * `{ raw }` with the (decoration-stripped) candidate lines preserved.
+ * Never returns a userCode without at least attempting to find its URL —
+ * a code found with no URL (or vice versa) is treated as unparseable.
+ */
+export function parseHermesDeviceCodeOutput(
+  rawText: string,
+  deps: { now?: () => Date } = {},
+): HermesDeviceCodeParseResult {
+  const now = deps.now ?? (() => new Date());
+  const lines = rawText
+    .split(/\r?\n/)
+    .map(stripDecoration)
+    .filter((line) => line.length > 0);
+  if (lines.length === 0) return {};
+
+  const joined = lines.join("\n");
+  const urls = joined.match(URL_PATTERN) ?? [];
+  const verificationUrl = pickBestUrl(urls);
+
+  // Strip URL substrings before scanning for the code so no URL fragment
+  // is ever mistaken for the user code.
+  let codeSearchText = joined;
+  for (const url of urls) {
+    codeSearchText = codeSearchText.split(url).join(" ");
+  }
+  const codeMatches = codeSearchText.match(CODE_PATTERN) ?? [];
+  const userCode = codeMatches.find((candidate) => candidate.includes("-")) ?? codeMatches[0];
+
+  if (verificationUrl && userCode) {
+    const expiresAt = extractExpiresAt(joined, now);
+    return expiresAt ? { verificationUrl, userCode, expiresAt } : { verificationUrl, userCode };
+  }
+
+  return { raw: joined };
+}
+
+const AUTHORIZED_PATTERN = /\b(authenticated|authorized|logged in)\b/i;
+const NOT_AUTHORIZED_PATTERN = /\b(not authenticated|not authorized|no active session|not logged in)\b/i;
+const ACCOUNT_HINT_PATTERN = /(?:account|user|logged in as)[:\s]+([\w.@+-]+)/i;
+
+/** Parses `hermes auth status xai-oauth` stdout into
+ *  `{ authorized, accountHint? }`. Garbage/empty input → `{ authorized: false }`. */
+export function parseHermesAuthStatusOutput(text: string): HermesAuthStatusParseResult {
+  if (NOT_AUTHORIZED_PATTERN.test(text)) return { authorized: false };
+  if (!AUTHORIZED_PATTERN.test(text)) return { authorized: false };
+  const hintMatch = text.match(ACCOUNT_HINT_PATTERN);
+  return hintMatch ? { authorized: true, accountHint: hintMatch[1] } : { authorized: true };
+}
+
+/** Substring presence check against the fixed operation taxonomy — the
+ *  fake CLI (and section 07's real `hermes tools` output) list operation
+ *  identifiers verbatim (e.g. `image.generate`, `image.edit`). */
+export function parseHermesToolsOutput(text: string): HermesMediaOperation[] {
+  const found: HermesMediaOperation[] = [];
+  for (const operation of HERMES_MEDIA_OPERATIONS) {
+    if (text.includes(operation)) found.push(operation);
+  }
+  return found;
+}
+
+/**
+ * Composes the section-01 `HermesConnectionCapabilityManifest`: an
+ * operation is `enabled: true` only when its backing tool is present
+ * post-auth (`toolsOutput`); absent tools get `enabled: false` + `reason`.
+ */
+export function buildCapabilityManifest(params: {
+  hermesVersion: string;
+  toolsOutput: string;
+  authStatus: HermesAuthStatusParseResult;
+  probedAt: string;
+}): HermesConnectionCapabilityManifest {
+  const available = new Set(parseHermesToolsOutput(params.toolsOutput));
+  const operations: HermesConnectionCapabilityManifest["operations"] = {};
+  for (const operation of HERMES_MEDIA_OPERATIONS) {
+    operations[operation] = available.has(operation)
+      ? { enabled: true }
+      : {
+          enabled: false,
+          reason: params.authStatus.authorized
+            ? "Tool not available for this Hermes CLI installation post-authorization"
+            : "Connection is not authorized",
+        };
+  }
+  return {
+    hermesVersion: params.hermesVersion,
+    probedAt: params.probedAt,
+    operations,
+    // Model discovery from `hermes tools` output is out of this section's
+    // scope (no documented format yet) — left empty; a later section may
+    // extend `parseHermesToolsOutput` to populate these.
+    models: { image: [], video: [] },
+  };
+}
+
+const ENTITLEMENT_PATTERN = /\b403\b|forbidden|entitlement/i;
+const REAUTH_PATTERN = /revoked|invalid_grant|unauthorized|reauth|no active session|not authenticated/i;
+const DENIED_PATTERN = /denied|declined/i;
+const EXPIRED_PATTERN = /expired|timeout|timed out/i;
+
+/** Maps a xAI error body / stderr / stdout excerpt to one of the shared
+ *  `HERMES_CONTROL_FAILURE_REASONS` classifications. Anything unmatched
+ *  falls back to `"process_failed"` — a generic, safe default. */
+export function classifyHermesFailureOutput(text: string): HermesControlFailureReason {
+  if (ENTITLEMENT_PATTERN.test(text)) return "entitlement_restricted";
+  if (REAUTH_PATTERN.test(text)) return "reauth_required";
+  if (DENIED_PATTERN.test(text)) return "oauth_denied";
+  if (EXPIRED_PATTERN.test(text)) return "oauth_session_expired";
+  return "process_failed";
+}
+
+// Re-exported for convenience so handler code / tests need only import
+// from this module for the parser + vocabulary pairing.
+export { HERMES_CONTROL_FAILURE_REASONS };
diff --git a/apps/web/server/services/__tests__/hermesConnectionJobs.test.ts b/apps/web/server/services/__tests__/hermesConnectionJobs.test.ts
new file mode 100644
index 000000000..800eae0b5
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesConnectionJobs.test.ts
@@ -0,0 +1,736 @@
+import { describe, expect, it, vi } from "vitest";
+
+import {
+  enqueueHermesConnectionControlJob,
+  HERMES_CONTROL_JOB_PRIORITY,
+  onTerminalHermesMediaJob,
+  runHermesConnectionSettlementTick,
+  settleHermesConnectionJob,
+  startHermesConnectionJobSweep,
+  stopHermesConnectionJobSweep,
+  type HermesConnectionJobsRepo,
+} from "../hermesConnectionJobs";
+import {
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+} from "../../../shared/workerRuntime";
+import { HERMES_CONNECTION_SETTLED_EVENT_TYPE } from "../../../shared/hermesMedia";
+import type { HermesProviderConnection, Worker, WorkerJob } from "../../../drizzle/schema";
+
+const NOW = new Date("2026-06-01T12:00:00.000Z");
+const TENANT_ID = "tenant-1";
+
+function buildConnectionRow(overrides: Partial<HermesProviderConnection> = {}): HermesProviderConnection {
+  return {
+    id: "conn-1",
+    tenantId: TENANT_ID,
+    ownerUserId: 1,
+    scope: "server_personal",
+    providerType: "xai_grok",
+    adapterType: "hermes_cli",
+    authenticationType: "oauth_device_code",
+    status: "pending",
+    assignedWorkerId: "worker-1",
+    profileReference: "conn_conn-1",
+    accountLabel: null,
+    accountHint: null,
+    entitlementStatus: null,
+    capabilitiesJson: null,
+    defaultForImage: false,
+    defaultForVideo: false,
+    dailyJobQuota: null,
+    metadataJson: {},
+    createdAt: NOW,
+    authorizedAt: null,
+    lastProbeAt: null,
+    disconnectedAt: null,
+    ...overrides,
+  } as HermesProviderConnection;
+}
+
+function buildWorkerRow(overrides: Partial<Worker> = {}): Worker {
+  return {
+    id: "worker-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    runtimeType: "desktop_zeroclaw_managed",
+    workerMode: "external_runtime",
+    machineId: null,
+    machineName: null,
+    displayName: "Hermes worker",
+    status: "online",
+    runtimeVersion: "1.0.0",
+    runtimeMode: "external_managed",
+    runtimeProfileId: null,
+    policyProfileId: null,
+    externalReference: "worker-app://hermes-1",
+    dashboardUrl: null,
+    capabilitiesJson: {},
+    hardwareJson: {},
+    healthSummaryJson: {},
+    warningFlagsJson: [],
+    fileScopeMode: "workspace_scoped",
+    lastSeenAt: NOW,
+    registeredByUserId: 1,
+    createdAt: NOW,
+    updatedAt: NOW,
+    ...overrides,
+  } as Worker;
+}
+
+function buildWorkerJob(overrides: Partial<WorkerJob> = {}): WorkerJob {
+  return {
+    id: "job-1",
+    tenantId: TENANT_ID,
+    teamId: null,
+    workerId: "worker-1",
+    runtimeType: "desktop_zeroclaw_managed",
+    workflowRunId: null,
+    requestedByUserId: 1,
+    requestedByPersonaId: null,
+    requestedBySystemComponent: null,
+    jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+    status: "completed",
+    statusReason: null,
+    priority: HERMES_CONTROL_JOB_PRIORITY,
+    resourceProfile: "cpu_light",
+    capabilityRequirementsJson: { connectionId: "conn-1" },
+    inputJson: {},
+    instructionsJson: {},
+    outputJson: null,
+    failureReason: null,
+    timeoutSeconds: 900,
+    retryPolicyJson: {},
+    idempotencyKey: null,
+    leaseOwnerToken: null,
+    leaseExpiresAt: null,
+    createdAt: NOW,
+    startedAt: NOW,
+    finishedAt: NOW,
+    ...overrides,
+  } as WorkerJob;
+}
+
+function buildRepo(overrides: Partial<HermesConnectionJobsRepo> = {}): HermesConnectionJobsRepo {
+  return {
+    findJobById: vi.fn().mockResolvedValue(null),
+    findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null),
+    findWorkerById: vi.fn().mockResolvedValue(buildWorkerRow()),
+    insertJob: vi.fn().mockImplementation(async (values) => ({ id: "job-new", createdAt: NOW, ...values })),
+    listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([]),
+    appendJobEvent: vi.fn().mockResolvedValue(undefined),
+    updateConnectionRow: vi.fn(),
+    findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow()),
+    ...overrides,
+  };
+}
+
+describe("enqueueHermesConnectionControlJob", () => {
+  it("authorize: inserts with cpu_light, timeout=900, statusReason, priority, retryPolicyJson maxAttempts=1, capabilityRequirementsJson + inputJson from the section-03 builder", async () => {
+    const repo = buildRepo();
+    const connection = buildConnectionRow();
+
+    const result = await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection,
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+
+    expect(result.created).toBe(true);
+    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
+      jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+      resourceProfile: "cpu_light",
+      timeoutSeconds: 900,
+      statusReason: "hermes_connection_jobs",
+      priority: HERMES_CONTROL_JOB_PRIORITY,
+      retryPolicyJson: { maxAttempts: 1 },
+      workerId: "worker-1",
+      runtimeType: "desktop_zeroclaw_managed",
+      idempotencyKey: `${HERMES_CONNECTION_AUTH_JOB_TYPE}:conn-1`,
+      capabilityRequirementsJson: expect.objectContaining({
+        requiredClaimCapability: "hermes_media",
+        capabilityFamilies: ["hermes-media-generation"],
+        connectionId: "conn-1",
+        preferredWorkerId: "worker-1",
+      }),
+      inputJson: {
+        connectionId: "conn-1",
+        profileReference: "conn_conn-1",
+        timeoutSeconds: 900,
+      },
+    }));
+  });
+
+  it("probe: timeout=300, retryPolicyJson maxAttempts=2", async () => {
+    const repo = buildRepo();
+    await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
+      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+      timeoutSeconds: 300,
+      retryPolicyJson: { maxAttempts: 2 },
+    }));
+  });
+
+  it("disconnect: timeout=120, retryPolicyJson maxAttempts=1", async () => {
+    const repo = buildRepo();
+    await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+    expect(repo.insertJob).toHaveBeenCalledWith(expect.objectContaining({
+      jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+      timeoutSeconds: 120,
+      retryPolicyJson: { maxAttempts: 1 },
+    }));
+  });
+
+  it("never calls any admission/rate-limit-shaped repo method (only the 8 declared repo methods exist to call)", async () => {
+    const repo = buildRepo();
+    await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+    expect(repo.listTerminalUnsettledHermesJobs).not.toHaveBeenCalled();
+    expect(repo.appendJobEvent).not.toHaveBeenCalled();
+  });
+
+  it("1-concurrent-per-connection: a non-terminal control job in flight short-circuits to created:false with the existing job", async () => {
+    const existingJob = buildWorkerJob({ id: "job-existing", status: "running" });
+    const repo = buildRepo({
+      findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(existingJob),
+    });
+
+    const result = await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+
+    expect(result).toEqual({ created: false, job: existingJob });
+    expect(repo.insertJob).not.toHaveBeenCalled();
+  });
+
+  it("a terminal prior job does not block a new enqueue (repo simply returns null for non-terminal lookup)", async () => {
+    const repo = buildRepo({ findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null) });
+    const result = await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+    expect(result.created).toBe(true);
+  });
+
+  it("idempotency-key race: a real Postgres unique-violation (code 23505) re-reads and returns the winner's row instead of throwing", async () => {
+    const racedJob = buildWorkerJob({ id: "job-raced", status: "queued" });
+    const pgUniqueViolation = Object.assign(
+      new Error('duplicate key value violates unique constraint "worker_jobs_tenant_idempotency_key_unique"'),
+      { code: "23505" },
+    );
+    const repo = buildRepo({
+      insertJob: vi.fn().mockRejectedValue(pgUniqueViolation),
+      findNonTerminalControlJobForConnection: vi.fn()
+        .mockResolvedValueOnce(null) // first check: nothing in flight yet
+        .mockResolvedValueOnce(racedJob), // re-read after the unique-conflict
+    });
+
+    const result = await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+
+    expect(result).toEqual({ created: false, job: racedJob });
+  });
+
+  it("a unique-violation with no existing non-terminal job (race lost by neither party) rethrows instead of returning a fake success", async () => {
+    const pgUniqueViolation = Object.assign(
+      new Error('duplicate key value violates unique constraint "worker_jobs_tenant_idempotency_key_unique"'),
+      { code: "23505" },
+    );
+    const repo = buildRepo({
+      insertJob: vi.fn().mockRejectedValue(pgUniqueViolation),
+      findNonTerminalControlJobForConnection: vi.fn().mockResolvedValue(null),
+    });
+
+    await expect(enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    )).rejects.toBe(pgUniqueViolation);
+  });
+
+  it("a GENERIC insert error (not a unique-violation) propagates instead of being masked as an idempotency race", async () => {
+    const genericError = new Error("connection terminated unexpectedly");
+    const findNonTerminalControlJobForConnection = vi.fn().mockResolvedValue(null);
+    const repo = buildRepo({
+      insertJob: vi.fn().mockRejectedValue(genericError),
+      findNonTerminalControlJobForConnection,
+    });
+
+    await expect(enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    )).rejects.toBe(genericError);
+
+    // Only the initial pre-insert concurrency check — no race re-read
+    // triggered for a non-unique-violation error.
+    expect(findNonTerminalControlJobForConnection).toHaveBeenCalledTimes(1);
+  });
+
+  it("tenant mismatch (connection.tenantId !== params.tenantId) rejects before building/inserting anything", async () => {
+    const repo = buildRepo();
+    await expect(enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow({ tenantId: "tenant-other" }),
+        workerId: "worker-1",
+      },
+      { repo },
+    )).rejects.toThrow();
+
+    expect(repo.findNonTerminalControlJobForConnection).not.toHaveBeenCalled();
+    expect(repo.insertJob).not.toHaveBeenCalled();
+  });
+
+  it("passes tenantId through to findNonTerminalControlJobForConnection (tenant-scoped concurrency check)", async () => {
+    const repo = buildRepo();
+    await enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-1",
+      },
+      { repo },
+    );
+    expect(repo.findNonTerminalControlJobForConnection).toHaveBeenCalledWith({
+      connectionId: "conn-1",
+      tenantId: TENANT_ID,
+    });
+  });
+
+  it("throws when the target worker cannot be found", async () => {
+    const repo = buildRepo({ findWorkerById: vi.fn().mockResolvedValue(null) });
+    await expect(enqueueHermesConnectionControlJob(
+      {
+        jobType: HERMES_CONNECTION_AUTH_JOB_TYPE,
+        tenantId: TENANT_ID,
+        requestedByUserId: 1,
+        connection: buildConnectionRow(),
+        workerId: "worker-missing",
+      },
+      { repo },
+    )).rejects.toThrow();
+  });
+});
+
+describe("settleHermesConnectionJob — control job settlement (table-driven)", () => {
+  it("authorize completed -> row authorized, authorizedAt set, accountHint persisted; marker appended", async () => {
+    let state = buildConnectionRow({ status: "pending" });
+    const updateConnectionRow = vi.fn().mockImplementation(async ({ values }) => {
+      state = { ...state, ...values };
+      return state;
+    });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow,
+    });
+    const job = buildWorkerJob({
+      status: "completed",
+      outputJson: { accountHint: "grok-fan" },
+    });
+
+    const result = await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(result.settled).toBe(true);
+    expect(state.status).toBe("authorized");
+    expect(state.accountHint).toBe("grok-fan");
+    expect(repo.appendJobEvent).toHaveBeenCalledWith({
+      jobId: job.id,
+      eventType: HERMES_CONNECTION_SETTLED_EVENT_TYPE,
+      payloadJson: {},
+    });
+  });
+
+  it("authorize failed with expiry/denial reasons -> row error + typed metadataJson.lastError", async () => {
+    let state = buildConnectionRow({ status: "pending" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({ status: "failed", failureReason: "oauth_session_expired" });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).toBe("error");
+    expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
+  });
+
+  it("authorize lease-expired with no terminal event -> row error with the expiry code", async () => {
+    let state = buildConnectionRow({ status: "pending" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({ status: "expired", failureReason: null });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).toBe("error");
+    expect((state.metadataJson as any).lastError).toBe("HERMES_TIMEOUT");
+  });
+
+  it("probe completed -> capabilitiesJson = manifest, lastProbeAt set", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const manifest = { hermesVersion: "1.0", probedAt: NOW.toISOString(), operations: {}, models: { image: [], video: [] } };
+    const job = buildWorkerJob({
+      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+      status: "completed",
+      outputJson: { capabilities: manifest },
+    });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.capabilitiesJson).toEqual(manifest);
+    expect(state.lastProbeAt).toEqual(NOW);
+  });
+
+  it("probe classified 403 (constants-first, exact reason string) -> entitlement_restricted", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+      status: "failed",
+      failureReason: "entitlement_restricted",
+    });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).toBe("entitlement_restricted");
+  });
+
+  it("probe classified auth-invalid (constants-first, exact reason string) -> reauth_required", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_CONNECTION_PROBE_JOB_TYPE,
+      status: "failed",
+      failureReason: "reauth_required",
+    });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).toBe("reauth_required");
+  });
+
+  it("disconnect completed -> disconnected + disconnectedAt", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({ jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE, status: "completed" });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).toBe("disconnected");
+    expect(state.disconnectedAt).toEqual(NOW);
+  });
+
+  it("disconnect failed -> row NOT marked disconnected", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const updateConnectionRow = vi.fn().mockImplementation(async ({ values }) => {
+      state = { ...state, ...values };
+      return state;
+    });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow,
+    });
+    const job = buildWorkerJob({ jobType: HERMES_CONNECTION_DISCONNECT_JOB_TYPE, status: "failed", failureReason: "process crashed" });
+
+    await settleHermesConnectionJob(job, { repo, now: () => NOW });
+
+    expect(state.status).not.toBe("disconnected");
+    expect(updateConnectionRow).not.toHaveBeenCalled();
+  });
+
+  it("is a no-op (settled: false) for a non-terminal job", async () => {
+    const repo = buildRepo();
+    const job = buildWorkerJob({ status: "running" });
+    const result = await settleHermesConnectionJob(job, { repo });
+    expect(result.settled).toBe(false);
+    expect(repo.appendJobEvent).not.toHaveBeenCalled();
+  });
+});
+
+describe("settleHermesConnectionJob — hermes_media_* side effects", () => {
+  it("auth-classified failureReason -> connection reauth_required", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
+      status: "failed",
+      failureReason: "reauth_required",
+      capabilityRequirementsJson: {},
+      inputJson: { connectionId: "conn-1" },
+    });
+
+    const result = await settleHermesConnectionJob(job, { repo });
+
+    expect(result.settled).toBe(true);
+    expect(state.status).toBe("reauth_required");
+    expect(repo.appendJobEvent).toHaveBeenCalledTimes(1);
+  });
+
+  it("403-classified failureReason -> connection entitlement_restricted", async () => {
+    let state = buildConnectionRow({ status: "authorized" });
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
+      status: "failed",
+      failureReason: "entitlement_restricted",
+      capabilityRequirementsJson: {},
+      inputJson: { connectionId: "conn-1" },
+    });
+
+    await settleHermesConnectionJob(job, { repo });
+
+    expect(state.status).toBe("entitlement_restricted");
+  });
+
+  it("a generic (\"other\") failure has no connection-status side effect", async () => {
+    const updateConnectionRow = vi.fn();
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow({ status: "authorized" })),
+      updateConnectionRow,
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
+      status: "failed",
+      failureReason: "ffmpeg exited with code 1",
+      capabilityRequirementsJson: {},
+      inputJson: { connectionId: "conn-1" },
+    });
+
+    await onTerminalHermesMediaJob(job, { repo });
+
+    expect(updateConnectionRow).not.toHaveBeenCalled();
+  });
+
+  it("tenant mismatch (defense-in-depth) -> no connection-status side effect", async () => {
+    const updateConnectionRow = vi.fn();
+    const repo = buildRepo({
+      findConnectionById: vi.fn().mockResolvedValue(buildConnectionRow({ tenantId: "tenant-other" })),
+      updateConnectionRow,
+    });
+    const job = buildWorkerJob({
+      jobType: HERMES_MEDIA_IMAGE_JOB_TYPE,
+      status: "failed",
+      failureReason: "reauth_required",
+      tenantId: TENANT_ID,
+      capabilityRequirementsJson: {},
+      inputJson: { connectionId: "conn-1" },
+    });
+
+    await onTerminalHermesMediaJob(job, { repo });
+
+    expect(updateConnectionRow).not.toHaveBeenCalled();
+  });
+});
+
+describe("runHermesConnectionSettlementTick", () => {
+  it("settles all terminal-unsettled jobs in one tick and marks them settled", async () => {
+    let connState1 = buildConnectionRow({ id: "conn-1", status: "pending" });
+    let connState2 = buildConnectionRow({ id: "conn-2", status: "pending" });
+    const job1 = buildWorkerJob({ id: "job-1", status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" }, outputJson: { accountHint: "a" } });
+    const job2 = buildWorkerJob({ id: "job-2", status: "completed", capabilityRequirementsJson: { connectionId: "conn-2" }, outputJson: { accountHint: "b" } });
+
+    const repo = buildRepo({
+      listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([job1, job2]),
+      findConnectionById: vi.fn().mockImplementation(async ({ connectionId }) => (
+        connectionId === "conn-1" ? connState1 : connState2
+      )),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ connectionId, values }) => {
+        if (connectionId === "conn-1") connState1 = { ...connState1, ...values };
+        else connState2 = { ...connState2, ...values };
+        return connectionId === "conn-1" ? connState1 : connState2;
+      }),
+    });
+
+    await runHermesConnectionSettlementTick({ repo, now: () => NOW });
+
+    expect(connState1.status).toBe("authorized");
+    expect(connState2.status).toBe("authorized");
+    expect(repo.appendJobEvent).toHaveBeenCalledTimes(2);
+  });
+
+  it("a repo error settling one job does not abort the rest", async () => {
+    const job1 = buildWorkerJob({ id: "job-1", status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" } });
+    const job2 = buildWorkerJob({ id: "job-2", status: "completed", capabilityRequirementsJson: { connectionId: "conn-2" } });
+    let secondSettled = false;
+
+    const repo = buildRepo({
+      listTerminalUnsettledHermesJobs: vi.fn().mockResolvedValue([job1, job2]),
+      findConnectionById: vi.fn().mockImplementation(async ({ connectionId }) => {
+        if (connectionId === "conn-1") throw new Error("db exploded");
+        return buildConnectionRow({ id: "conn-2", status: "pending" });
+      }),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        secondSettled = true;
+        return buildConnectionRow({ id: "conn-2", ...values });
+      }),
+    });
+
+    await expect(runHermesConnectionSettlementTick({ repo, now: () => NOW })).resolves.toBeUndefined();
+    expect(secondSettled).toBe(true);
+  });
+
+  it("a repo error listing jobs never throws (fails closed)", async () => {
+    const repo = buildRepo({ listTerminalUnsettledHermesJobs: vi.fn().mockRejectedValue(new Error("db down")) });
+    await expect(runHermesConnectionSettlementTick({ repo })).resolves.toBeUndefined();
+  });
+
+  it("idempotent across ticks: once a job is settled it drops off the unsettled list, so a second tick performs zero additional writes", async () => {
+    let settled = false;
+    let state = buildConnectionRow({ status: "pending" });
+    const job = buildWorkerJob({ status: "completed", capabilityRequirementsJson: { connectionId: "conn-1" }, outputJson: { accountHint: "a" } });
+
+    const repo = buildRepo({
+      listTerminalUnsettledHermesJobs: vi.fn().mockImplementation(async () => (settled ? [] : [job])),
+      findConnectionById: vi.fn().mockImplementation(async () => state),
+      updateConnectionRow: vi.fn().mockImplementation(async ({ values }) => {
+        state = { ...state, ...values };
+        return state;
+      }),
+      appendJobEvent: vi.fn().mockImplementation(async () => {
+        settled = true;
+      }),
+    });
+
+    await runHermesConnectionSettlementTick({ repo, now: () => NOW });
+    await runHermesConnectionSettlementTick({ repo, now: () => NOW });
+
+    expect(repo.appendJobEvent).toHaveBeenCalledTimes(1);
+    expect(repo.updateConnectionRow).toHaveBeenCalledTimes(1);
+  });
+});
+
+describe("start/stop sweep", () => {
+  it("startHermesConnectionJobSweep / stopHermesConnectionJobSweep are idempotent and use an unref'd timer", () => {
+    const originalSetTimeout = global.setTimeout;
+    const unrefSpy = vi.fn();
+    const timeoutSpy = vi.spyOn(global, "setTimeout").mockImplementation(((fn: any, ms?: number) => {
+      const handle = originalSetTimeout(() => {}, 0);
+      (handle as any).unref = unrefSpy;
+      return handle as any;
+    }) as any);
+
+    startHermesConnectionJobSweep();
+    startHermesConnectionJobSweep(); // second call is a no-op (idempotent)
+    expect(timeoutSpy).toHaveBeenCalledTimes(1);
+    expect(unrefSpy).toHaveBeenCalledTimes(1);
+
+    stopHermesConnectionJobSweep();
+    stopHermesConnectionJobSweep(); // second call is a no-op (idempotent)
+
+    timeoutSpy.mockRestore();
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesConnectionService.test.ts b/apps/web/server/services/__tests__/hermesConnectionService.test.ts
index 3185d8d47..680496e93 100644
--- a/apps/web/server/services/__tests__/hermesConnectionService.test.ts
+++ b/apps/web/server/services/__tests__/hermesConnectionService.test.ts
@@ -808,6 +808,194 @@ describe("settleHermesConnectionFromControlJob", () => {
       expect(updateConnection).not.toHaveBeenCalled();
     });
   });
+
+  // Section-04 carry-forward item A: constants-first classification.
+  describe("constants-first failure-reason classification (section-04 carry-forward item A)", () => {
+    it("auth job: exact 'oauth_session_expired' reason -> HERMES_OAUTH_SESSION_EXPIRED (constants path)", async () => {
+      const row = buildConnectionRow({ status: "pending" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_session_expired" },
+      }, deps);
+      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
+    });
+
+    it("auth job: exact 'oauth_denied' reason -> HERMES_OAUTH_DENIED (constants path)", async () => {
+      const row = buildConnectionRow({ status: "pending" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth_denied" },
+      }, deps);
+      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_DENIED");
+    });
+
+    it("auth job: legacy substring phrasing still works (fallback path unaffected)", async () => {
+      const row = buildConnectionRow({ status: "pending" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "failed", failureReason: "oauth session expired" },
+      }, deps);
+      expect((state.metadataJson as any).lastError).toBe("HERMES_OAUTH_SESSION_EXPIRED");
+    });
+
+    it("probe job: exact 'entitlement_restricted' reason -> entitlement_restricted (constants path)", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "entitlement_restricted" },
+      }, deps);
+      expect(state.status).toBe("entitlement_restricted");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_ENTITLEMENT_RESTRICTED");
+    });
+
+    it("probe job: exact 'reauth_required' reason -> reauth_required (constants path)", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "reauth_required" },
+      }, deps);
+      expect(state.status).toBe("reauth_required");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_REAUTH_REQUIRED");
+    });
+
+    it("probe job: exact 'process_failed' reason -> other outcome, status untouched (constants path)", async () => {
+      const row = buildConnectionRow({ status: "authorized" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_PROBE_JOB_TYPE, status: "failed", failureReason: "process_failed" },
+      }, deps);
+      expect(state.status).toBe("authorized");
+      expect((state.metadataJson as any).lastError).toBe("HERMES_PROCESS_FAILED");
+    });
+  });
+
+  // Section-04 carry-forward item B: tenant defense-in-depth.
+  describe("tenant defense-in-depth (section-04 carry-forward item B)", () => {
+    it("refuses to settle when the supplied job.tenantId does not match the connection row's tenantId", async () => {
+      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
+      const updateConnection = vi.fn();
+      const deps = {
+        repo: { ...buildDeps().repo!, findConnectionById: vi.fn().mockResolvedValue(row), updateConnection },
+      };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { tenantId: "tenant-attacker", jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed" },
+      }, deps);
+
+      expect(updateConnection).not.toHaveBeenCalled();
+    });
+
+    it("settles normally when job.tenantId matches the connection row's tenantId", async () => {
+      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { tenantId: "tenant-owner", jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed", outputJson: { accountHint: "grok-fan" } },
+      }, deps);
+
+      expect(state.status).toBe("authorized");
+    });
+
+    it("settles normally when job.tenantId is omitted (backward-compatible — existing call sites unaffected)", async () => {
+      const row = buildConnectionRow({ status: "pending", tenantId: "tenant-owner" });
+      let state = { ...row };
+      const deps = {
+        repo: {
+          ...buildDeps().repo!,
+          findConnectionById: vi.fn().mockImplementation(async () => state),
+          updateConnection: vi.fn().mockImplementation(async ({ values }: any) => {
+            state = { ...state, ...values };
+            return state;
+          }),
+        },
+      };
+
+      await settleHermesConnectionFromControlJob({
+        connectionId: row.id,
+        job: { jobType: HERMES_CONNECTION_AUTH_JOB_TYPE, status: "completed", outputJson: { accountHint: "grok-fan" } },
+      }, deps);
+
+      expect(state.status).toBe("authorized");
+    });
+  });
 });
 
 describe("getHermesConnection", () => {
diff --git a/apps/web/server/services/hermesConnectionJobs.ts b/apps/web/server/services/hermesConnectionJobs.ts
new file mode 100644
index 000000000..cee8dec42
--- /dev/null
+++ b/apps/web/server/services/hermesConnectionJobs.ts
@@ -0,0 +1,539 @@
+/**
+ * Feature 135 — Hermes Grok media worker: connection-control job
+ * enqueue-and-track + the 60s terminal-state sweep.
+ *
+ * Owns:
+ *  - `enqueueHermesConnectionControlJob` — inserts one of the three control
+ *    job types (`hermes_connection_authorize` / `_probe` / `_disconnect`),
+ *    reusing section-03's `buildAuthorizeJobInsert` / `buildProbeJobInsert`
+ *    / `buildDisconnectJobInsert` verbatim (no duplicated insert-shaping
+ *    logic). Enforces the "max 1 concurrent control job per connection"
+ *    rule and NEVER calls any admission/rate-limit function — control jobs
+ *    are exempt from the media-generation rate limiter (spec §10).
+ *  - `settleHermesConnectionJob` / `runHermesConnectionSettlementTick` /
+ *    `startHermesConnectionJobSweep` / `stopHermesConnectionJobSweep` — a
+ *    60s sweep of terminal-but-unsettled `worker_jobs` rows so a job that
+ *    nobody polls (e.g. the user closed the tab mid-authorize) still
+ *    settles its connection row. Settlement for the three control job
+ *    types is NOT reimplemented here — it calls section-03's
+ *    `settleHermesConnectionFromControlJob` seam directly (the single
+ *    source of truth for that mapping). This module ADDS the
+ *    `hermes_media_*` terminal-job connection-status side effect
+ *    (`onTerminalHermesMediaJob`, extended by section 06 for fee
+ *    reconciliation) and the `hermes_connection_settled` idempotency
+ *    marker shared by both job families.
+ *
+ * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { and, desc, eq, inArray, notExists, notInArray, sql } from "drizzle-orm";
+
+import { debugError } from "../_core/logger";
+import { getDb } from "../db";
+import {
+  workerJobEvents,
+  workerJobs,
+  type HermesProviderConnection,
+  type InsertHermesProviderConnection,
+  type InsertWorkerJob,
+  type Worker,
+  type WorkerJob,
+} from "../../drizzle/schema";
+import {
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+  workerJobStatusValues,
+} from "../../shared/workerRuntime";
+import { HERMES_CONNECTION_SETTLED_EVENT_TYPE } from "../../shared/hermesMedia";
+import {
+  buildAuthorizeJobInsert,
+  buildDisconnectJobInsert,
+  buildProbeJobInsert,
+  defaultHermesConnectionRepo,
+  settleHermesConnectionFromControlJob,
+  type HermesConnectionRepo,
+} from "./hermesConnectionService";
+
+// ────────────────────────────────────────────────────────────────────────
+// Constants
+// ────────────────────────────────────────────────────────────────────────
+
+/** Above the (section-05) media-job default priority (0) — control jobs
+ *  should jump the media queue on the same worker (spec §10). */
+export const HERMES_CONTROL_JOB_PRIORITY = 50;
+
+const HERMES_CONNECTION_CONTROL_JOB_TYPES: ReadonlySet<string> = new Set([
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+]);
+
+const HERMES_MEDIA_JOB_TYPES: ReadonlySet<string> = new Set([
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+]);
+
+const ALL_HERMES_JOB_TYPES = [...HERMES_CONNECTION_CONTROL_JOB_TYPES, ...HERMES_MEDIA_JOB_TYPES];
+
+type WorkerJobStatusValue = (typeof workerJobStatusValues)[number];
+
+const TERMINAL_FAILURE_STATUSES: ReadonlySet<string> = new Set(["failed", "canceled", "expired"]);
+/** Single source of truth for "terminal" `worker_jobs.status` values — both
+ *  `findNonTerminalControlJobForConnection` (NOT IN) and
+ *  `listTerminalUnsettledHermesJobs` (IN) interpolate from this ONE set
+ *  instead of each hand-maintaining their own literal SQL list. */
+const TERMINAL_STATUSES: ReadonlySet<WorkerJobStatusValue> = new Set([
+  "completed",
+  "failed",
+  "canceled",
+  "expired",
+]);
+
+const SWEEP_INTERVAL_MS = 60_000;
+
+// ────────────────────────────────────────────────────────────────────────
+// Public types
+// ────────────────────────────────────────────────────────────────────────
+
+export interface HermesConnectionJobsRepo {
+  findJobById(jobId: string): Promise<WorkerJob | null>;
+  findNonTerminalControlJobForConnection(params: { connectionId: string; tenantId: string }): Promise<WorkerJob | null>;
+  findWorkerById(params: { tenantId: string; workerId: string }): Promise<Worker | null>;
+  insertJob(values: InsertWorkerJob): Promise<WorkerJob>;
+  listTerminalUnsettledHermesJobs(): Promise<WorkerJob[]>;
+  appendJobEvent(params: { jobId: string; eventType: string; payloadJson: Record<string, unknown> }): Promise<void>;
+  updateConnectionRow(params: {
+    tenantId?: string;
+    connectionId: string;
+    values: Partial<InsertHermesProviderConnection>;
+  }): Promise<HermesProviderConnection>;
+  findConnectionById(params: { tenantId?: string; connectionId: string }): Promise<HermesProviderConnection | null>;
+}
+
+export type HermesControlJobType =
+  | typeof HERMES_CONNECTION_AUTH_JOB_TYPE
+  | typeof HERMES_CONNECTION_PROBE_JOB_TYPE
+  | typeof HERMES_CONNECTION_DISCONNECT_JOB_TYPE;
+
+// ────────────────────────────────────────────────────────────────────────
+// Default (DB-backed) repo
+// ────────────────────────────────────────────────────────────────────────
+
+export const defaultHermesConnectionJobsRepo: HermesConnectionJobsRepo = {
+  async findJobById(jobId) {
+    const db = getDb();
+    const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
+    return row ?? null;
+  },
+
+  async findNonTerminalControlJobForConnection({ connectionId, tenantId }) {
+    const db = getDb();
+    const [row] = await db
+      .select()
+      .from(workerJobs)
+      .where(and(
+        eq(workerJobs.tenantId, tenantId),
+        inArray(workerJobs.jobType, [...HERMES_CONNECTION_CONTROL_JOB_TYPES]),
+        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
+        notInArray(workerJobs.status, [...TERMINAL_STATUSES]),
+      ))
+      .orderBy(desc(workerJobs.createdAt))
+      .limit(1);
+    return row ?? null;
+  },
+
+  async findWorkerById({ tenantId, workerId }) {
+    return defaultHermesConnectionRepo.findWorkerById({ tenantId, workerId });
+  },
+
+  async insertJob(values) {
+    const db = getDb();
+    const [row] = await db.insert(workerJobs).values(values).returning();
+    return row;
+  },
+
+  async listTerminalUnsettledHermesJobs() {
+    const db = getDb();
+    return db
+      .select()
+      .from(workerJobs)
+      .where(and(
+        inArray(workerJobs.jobType, ALL_HERMES_JOB_TYPES),
+        inArray(workerJobs.status, [...TERMINAL_STATUSES]),
+        notExists(
+          db
+            .select({ id: workerJobEvents.id })
+            .from(workerJobEvents)
+            .where(and(
+              eq(workerJobEvents.workerJobId, workerJobs.id),
+              eq(workerJobEvents.eventType, HERMES_CONNECTION_SETTLED_EVENT_TYPE),
+            )),
+        ),
+      ));
+  },
+
+  async appendJobEvent({ jobId, eventType, payloadJson }) {
+    const db = getDb();
+    await db.insert(workerJobEvents).values({ workerJobId: jobId, eventType, payloadJson });
+  },
+
+  async updateConnectionRow({ tenantId, connectionId, values }) {
+    return defaultHermesConnectionRepo.updateConnection({ tenantId, connectionId, values });
+  },
+
+  async findConnectionById({ tenantId, connectionId }) {
+    return defaultHermesConnectionRepo.findConnectionById({ tenantId, connectionId });
+  },
+};
+
+// ────────────────────────────────────────────────────────────────────────
+// Enqueue
+// ────────────────────────────────────────────────────────────────────────
+
+function buildInsertForJobType(
+  jobType: HermesControlJobType,
+  params: {
+    tenantId: string;
+    connectionId: string;
+    workerId: string;
+    runtimeType: Worker["runtimeType"];
+    requestedByUserId: number | null;
+    profileReference: string;
+  },
+): InsertWorkerJob {
+  if (jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) return buildAuthorizeJobInsert(params);
+  if (jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) return buildProbeJobInsert(params);
+  return buildDisconnectJobInsert(params);
+}
+
+/** `{ maxAttempts: 2 }` for probe (idempotent to re-run); authorize/
+ *  disconnect get `{ maxAttempts: 1 }` — device codes are single-use and a
+ *  logout/profile-removal re-run risks a confusing double-logout. */
+function retryPolicyForJobType(jobType: HermesControlJobType): Record<string, unknown> {
+  return jobType === HERMES_CONNECTION_PROBE_JOB_TYPE ? { maxAttempts: 2 } : { maxAttempts: 1 };
+}
+
+/** The unique index backing the `${jobType}:${connectionId}` idempotency
+ *  key (`drizzle/schema.ts`'s `worker_jobs_tenant_idempotency_key_unique`). */
+const WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT = "worker_jobs_tenant_idempotency_key_unique";
+
+/** True only for an actual Postgres unique-violation (SQLSTATE 23505) on
+ *  the idempotency-key index — anything else (connection drop, syntax
+ *  error, a totally unrelated constraint) must propagate to the caller
+ *  instead of being silently reinterpreted as "someone else already
+ *  enqueued this". */
+function isHermesJobIdempotencyKeyConflict(error: unknown): boolean {
+  if (!error || typeof error !== "object") return false;
+  const code = (error as { code?: unknown }).code;
+  if (code === "23505") return true;
+  const constraint = (error as { constraint?: unknown }).constraint;
+  if (typeof constraint === "string" && constraint.includes(WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT)) return true;
+  const message = (error as { message?: unknown }).message;
+  return typeof message === "string" && message.includes(WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT);
+}
+
+/**
+ * Enqueues one of the three connection-control job types. Reuses section-
+ * 03's insert builders verbatim (capabilityRequirementsJson, inputJson,
+ * timeoutSeconds are ALL theirs) and layers on this section's queue-
+ * priority / retry-policy / idempotency-key concerns.
+ *
+ * Concurrency guard: a non-terminal control job already in flight for this
+ * connection (any of the three types) short-circuits to `{ created: false,
+ * job: existing }` — a terminal prior job never blocks. The
+ * `${jobType}:${connectionId}` idempotency key is a second line of defense
+ * against a race between two concurrent enqueue calls; a unique-conflict
+ * insert re-reads and returns the row the winner created instead of
+ * throwing.
+ *
+ * NEVER calls any admission/rate-limit function — control jobs are exempt
+ * from the media-generation rate limiter (spec §10).
+ */
+export async function enqueueHermesConnectionControlJob(
+  params: {
+    jobType: HermesControlJobType;
+    tenantId: string;
+    requestedByUserId: number | null;
+    connection: HermesProviderConnection;
+    workerId: string;
+  },
+  deps: { repo?: HermesConnectionJobsRepo } = {},
+): Promise<{ created: boolean; job: WorkerJob }> {
+  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
+
+  // Defense-in-depth (mirrors `onTerminalHermesMediaJob`'s guard): never let
+  // a mismatched/forged `connection` argument enqueue a job against a
+  // different tenant than the one the caller claims to be acting for.
+  if (params.connection.tenantId !== params.tenantId) {
+    throw new Error(
+      `hermesConnectionJobs: connection ${params.connection.id} does not belong to tenant ${params.tenantId}`,
+    );
+  }
+
+  const existing = await repo.findNonTerminalControlJobForConnection({
+    connectionId: params.connection.id,
+    tenantId: params.tenantId,
+  });
+  if (existing) return { created: false, job: existing };
+
+  const worker = await repo.findWorkerById({ tenantId: params.tenantId, workerId: params.workerId });
+  if (!worker) {
+    throw new Error(`hermesConnectionJobs: worker ${params.workerId} not found for tenant ${params.tenantId}`);
+  }
+
+  const baseInsert = buildInsertForJobType(params.jobType, {
+    tenantId: params.tenantId,
+    connectionId: params.connection.id,
+    workerId: params.workerId,
+    runtimeType: worker.runtimeType,
+    requestedByUserId: params.requestedByUserId,
+    profileReference: params.connection.profileReference,
+  });
+
+  const insertValues: InsertWorkerJob = {
+    ...baseInsert,
+    statusReason: "hermes_connection_jobs",
+    priority: HERMES_CONTROL_JOB_PRIORITY,
+    retryPolicyJson: retryPolicyForJobType(params.jobType),
+    idempotencyKey: `${params.jobType}:${params.connection.id}`,
+  };
+
+  try {
+    const job = await repo.insertJob(insertValues);
+    return { created: true, job };
+  } catch (error) {
+    // Only reinterpret an ACTUAL idempotency-key unique-violation as the
+    // race — anything else (a dropped connection, an unrelated constraint,
+    // a genuine bug) must propagate instead of being masked as "no-op,
+    // someone else already enqueued this".
+    if (!isHermesJobIdempotencyKeyConflict(error)) throw error;
+    const raced = await repo.findNonTerminalControlJobForConnection({
+      connectionId: params.connection.id,
+      tenantId: params.tenantId,
+    });
+    if (raced) return { created: false, job: raced };
+    throw error;
+  }
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Settlement
+// ────────────────────────────────────────────────────────────────────────
+
+function isTerminalStatus(status: string): boolean {
+  return (TERMINAL_STATUSES as ReadonlySet<string>).has(status);
+}
+
+function extractConnectionId(job: Pick<WorkerJob, "capabilityRequirementsJson" | "inputJson">): string | null {
+  const fromCapabilities = (job.capabilityRequirementsJson as Record<string, unknown> | null | undefined)?.connectionId;
+  if (typeof fromCapabilities === "string" && fromCapabilities.length > 0) return fromCapabilities;
+  const fromInput = (job.inputJson as Record<string, unknown> | null | undefined)?.connectionId;
+  if (typeof fromInput === "string" && fromInput.length > 0) return fromInput;
+  return null;
+}
+
+/** Classifies a terminal `hermes_media_*` job's `failureReason` for the
+ *  connection-status side effect only (fee reconciliation is section 06).
+ *  Constants-first (the section-04 vocabulary), substring fallback for
+ *  anything else — mirrors `hermesConnectionService.ts`'s classifiers. */
+function classifyMediaJobFailureForConnectionEffect(
+  failureReason: string | null | undefined,
+): "reauth_required" | "entitlement_restricted" | "other" {
+  const reason = failureReason ?? "";
+  if (reason === "entitlement_restricted") return "entitlement_restricted";
+  if (reason === "reauth_required" || reason === "oauth_session_expired" || reason === "oauth_denied") {
+    return "reauth_required";
+  }
+  const lower = reason.toLowerCase();
+  if (lower.includes("403") || lower.includes("entitlement") || lower.includes("forbidden")) {
+    return "entitlement_restricted";
+  }
+  if (
+    lower.includes("reauth")
+    || lower.includes("unauthorized")
+    || lower.includes("invalid_grant")
+    || lower.includes("revoked")
+    || lower.includes("session")
+    || lower.includes("auth")
+  ) {
+    return "reauth_required";
+  }
+  return "other";
+}
+
+/**
+ * Named hook (section 06 extends it for fee reconciliation) — for now,
+ * only applies the connection-status side effect for a terminal
+ * `hermes_media_*` job with an auth-classified or 403-classified
+ * `failureReason`: `reauth_required` / `entitlement_restricted`
+ * respectively. A successful media job, or a failure classified `"other"`,
+ * has no connection-status side effect here (a single failed media job is
+ * not necessarily an auth/entitlement problem).
+ */
+export async function onTerminalHermesMediaJob(
+  job: WorkerJob,
+  deps: { repo?: HermesConnectionJobsRepo } = {},
+): Promise<void> {
+  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
+  if (!TERMINAL_FAILURE_STATUSES.has(job.status)) return;
+
+  const connectionId = extractConnectionId(job);
+  if (!connectionId) return;
+
+  const connection = await repo.findConnectionById({ tenantId: job.tenantId, connectionId });
+  if (!connection) return;
+  // Defense-in-depth (section-03 review carry-forward item B): never let a
+  // corrupted/forged job row drive a cross-tenant connection mutation.
+  if (connection.tenantId !== job.tenantId) return;
+
+  const classification = classifyMediaJobFailureForConnectionEffect(job.failureReason);
+  if (classification === "entitlement_restricted") {
+    await repo.updateConnectionRow({
+      tenantId: job.tenantId,
+      connectionId,
+      values: {
+        status: "entitlement_restricted",
+        entitlementStatus: "restricted",
+        metadataJson: { ...(connection.metadataJson ?? {}), lastError: "HERMES_ENTITLEMENT_RESTRICTED" },
+      },
+    });
+    return;
+  }
+  if (classification === "reauth_required") {
+    await repo.updateConnectionRow({
+      tenantId: job.tenantId,
+      connectionId,
+      values: {
+        status: "reauth_required",
+        metadataJson: { ...(connection.metadataJson ?? {}), lastError: "HERMES_REAUTH_REQUIRED" },
+      },
+    });
+  }
+}
+
+/** Only `findConnectionById`/`updateConnection` are ever invoked by
+ *  `settleHermesConnectionFromControlJob` — a deliberate partial-repo cast
+ *  so this module never re-implements `HermesConnectionRepo`'s full DB
+ *  surface (findConnections/insertConnection/etc). */
+function toConnectionServiceRepo(repo: HermesConnectionJobsRepo): HermesConnectionRepo {
+  return {
+    findConnectionById: (params: { tenantId?: string; connectionId: string }) => repo.findConnectionById(params),
+    updateConnection: (params: {
+      tenantId?: string;
+      connectionId: string;
+      values: Partial<InsertHermesProviderConnection>;
+    }) => repo.updateConnectionRow(params),
+  } as unknown as HermesConnectionRepo;
+}
+
+/**
+ * Settles ONE terminal job (idempotent — a job that already carries the
+ * `hermes_connection_settled` event is skipped by
+ * `listTerminalUnsettledHermesJobs`, and re-running this function against
+ * an already-settled connection row is itself a no-op via
+ * `settleHermesConnectionFromControlJob`'s own row-state guards). Also
+ * exported for `getConnectStatus`'s lazy settle and the completion hook.
+ */
+export async function settleHermesConnectionJob(
+  job: WorkerJob,
+  deps: { repo?: HermesConnectionJobsRepo; now?: () => Date } = {},
+): Promise<{ settled: boolean }> {
+  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
+  const now = deps.now ?? (() => new Date());
+
+  if (!isTerminalStatus(job.status)) return { settled: false };
+
+  const connectionId = extractConnectionId(job);
+  if (!connectionId) return { settled: false };
+
+  if (HERMES_CONNECTION_CONTROL_JOB_TYPES.has(job.jobType)) {
+    await settleHermesConnectionFromControlJob(
+      {
+        connectionId,
+        job: {
+          tenantId: job.tenantId,
+          jobType: job.jobType,
+          status: job.status,
+          failureReason: job.failureReason ?? undefined,
+          outputJson: job.outputJson ?? undefined,
+        },
+      },
+      { repo: toConnectionServiceRepo(repo), now },
+    );
+  } else if (HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
+    await onTerminalHermesMediaJob(job, { repo });
+  } else {
+    return { settled: false };
+  }
+
+  await repo.appendJobEvent({ jobId: job.id, eventType: HERMES_CONNECTION_SETTLED_EVENT_TYPE, payloadJson: {} });
+  return { settled: true };
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// 60s sweep
+// ────────────────────────────────────────────────────────────────────────
+
+/** One sweep pass: settle every terminal-but-unsettled hermes job. A repo
+ *  error on ONE job never aborts the rest. Pure/testable — no timers. */
+export async function runHermesConnectionSettlementTick(
+  deps: { repo?: HermesConnectionJobsRepo; now?: () => Date } = {},
+): Promise<void> {
+  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
+  const now = deps.now ?? (() => new Date());
+
+  let jobs: WorkerJob[];
+  try {
+    jobs = await repo.listTerminalUnsettledHermesJobs();
+  } catch (error) {
+    debugError("hermesConnectionJobs", "Failed to list terminal unsettled hermes jobs", error);
+    return;
+  }
+
+  for (const job of jobs) {
+    try {
+      await settleHermesConnectionJob(job, { repo, now });
+    } catch (error) {
+      debugError("hermesConnectionJobs", `Failed to settle hermes job ${job.id}`, error);
+      // Continue with the rest — one bad job must not abort the sweep.
+    }
+  }
+}
+
+let sweepTimer: NodeJS.Timeout | null = null;
+let sweepStopped = true;
+
+function scheduleNextSweep(delayMs: number): void {
+  sweepTimer = setTimeout(() => {
+    sweepTimer = null;
+    void runHermesConnectionSettlementTick()
+      .catch((error) => {
+        debugError("hermesConnectionJobs", "Unexpected error in hermes connection settlement tick", error);
+      })
+      .finally(() => {
+        if (!sweepStopped) scheduleNextSweep(SWEEP_INTERVAL_MS);
+      });
+  }, Math.max(0, delayMs));
+  sweepTimer.unref?.();
+}
+
+/** Starts the 60s interval sweep (idempotent — a second call while already
+ *  running is a no-op). The first tick runs on the next event-loop turn. */
+export function startHermesConnectionJobSweep(): void {
+  if (sweepTimer) return;
+  sweepStopped = false;
+  scheduleNextSweep(0);
+}
+
+/** Stops scheduling NEW ticks. Any tick already in flight is allowed to
+ *  finish naturally. Idempotent. */
+export function stopHermesConnectionJobSweep(): void {
+  sweepStopped = true;
+  if (sweepTimer) {
+    clearTimeout(sweepTimer);
+    sweepTimer = null;
+  }
+}
diff --git a/apps/web/server/services/hermesConnectionService.ts b/apps/web/server/services/hermesConnectionService.ts
index d048f0157..d2773fcc9 100644
--- a/apps/web/server/services/hermesConnectionService.ts
+++ b/apps/web/server/services/hermesConnectionService.ts
@@ -55,6 +55,13 @@ import {
 } from "../../shared/workerRuntime";
 import {
   formatHermesErrorMessage,
+  // Section-04 carry-forward item A: the shared failure-reason vocabulary
+  // that `server/hermesWorker/connectionControlHandlers.ts` emits verbatim
+  // as a job's `failureReason`. `mapAuthFailureReasonToErrorCode` /
+  // `classifyProbeFailureReason` below match these constants FIRST, keeping
+  // their pre-existing substring-sniffing heuristics only as a legacy
+  // fallback for jobs whose `failureReason` predates this vocabulary.
+  HERMES_CONTROL_FAILURE_REASONS,
   HERMES_MEDIA_ERROR_CODES,
   type HermesConnectionCapabilityManifest,
   type HermesMediaErrorCode,
@@ -305,15 +312,31 @@ function isTerminalWorkerJobStatus(status: string): boolean {
   return status === "completed" || TERMINAL_FAILURE_STATUSES.has(status);
 }
 
+/** True when `reason` is one of the frozen `HERMES_CONTROL_FAILURE_REASONS`
+ *  strings — section-04's handlers emit exactly these, so an exact match
+ *  here always wins over the legacy substring heuristics below it. */
+function isKnownControlFailureReason(
+  reason: string,
+): reason is (typeof HERMES_CONTROL_FAILURE_REASONS)[number] {
+  return (HERMES_CONTROL_FAILURE_REASONS as readonly string[]).includes(reason);
+}
+
 function mapAuthFailureReasonToErrorCode(job: {
   status: string;
   failureReason?: string | null;
 }): HermesMediaErrorCode {
   if (job.status === "expired") return "HERMES_TIMEOUT";
-  const reason = (job.failureReason ?? "").toLowerCase();
-  if (reason.includes("timeout") || reason.includes("timed out")) return "HERMES_TIMEOUT";
-  if (reason.includes("denied") || reason.includes("declined")) return "HERMES_OAUTH_DENIED";
-  if (reason.includes("expired")) return "HERMES_OAUTH_SESSION_EXPIRED";
+  const reason = job.failureReason ?? "";
+  if (isKnownControlFailureReason(reason)) {
+    if (reason === "oauth_session_expired") return "HERMES_OAUTH_SESSION_EXPIRED";
+    if (reason === "oauth_denied") return "HERMES_OAUTH_DENIED";
+  }
+  // Legacy substring fallback (jobs written before the section-04
+  // vocabulary existed).
+  const lower = reason.toLowerCase();
+  if (lower.includes("timeout") || lower.includes("timed out")) return "HERMES_TIMEOUT";
+  if (lower.includes("denied") || lower.includes("declined")) return "HERMES_OAUTH_DENIED";
+  if (lower.includes("expired")) return "HERMES_OAUTH_SESSION_EXPIRED";
   return "HERMES_PROCESS_FAILED";
 }
 
@@ -333,7 +356,26 @@ function classifyProbeFailureReason(job: {
   status: string;
   failureReason?: string | null;
 }): { outcome: ProbeFailureOutcome; errorCode: HermesMediaErrorCode } {
-  const reason = (job.failureReason ?? "").toLowerCase();
+  const rawReason = job.failureReason ?? "";
+
+  // Constants-first (section-04 carry-forward item A): the handlers emit
+  // exactly these reason strings — match them before the legacy substring
+  // heuristics further down.
+  if (isKnownControlFailureReason(rawReason)) {
+    if (rawReason === "entitlement_restricted") {
+      return { outcome: "entitlement_restricted", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" };
+    }
+    if (rawReason === "reauth_required" || rawReason === "oauth_session_expired" || rawReason === "oauth_denied") {
+      return { outcome: "reauth_required", errorCode: "HERMES_REAUTH_REQUIRED" };
+    }
+    if (rawReason === "process_failed") {
+      return { outcome: "other", errorCode: "HERMES_PROCESS_FAILED" };
+    }
+  }
+
+  // Legacy substring fallback (jobs written before the section-04
+  // vocabulary existed).
+  const reason = rawReason.toLowerCase();
   if (reason.includes("403") || reason.includes("entitlement") || reason.includes("forbidden")) {
     return { outcome: "entitlement_restricted", errorCode: "HERMES_ENTITLEMENT_RESTRICTED" };
   }
@@ -858,6 +900,11 @@ export async function getHermesConnectStatus(
         {
           connectionId: row.id,
           job: {
+            // Section-04 carry-forward item B (defense-in-depth): this
+            // lookup is already tenant-scoped above, but pass tenantId
+            // through anyway so the seam's own tenant check applies
+            // uniformly regardless of call site.
+            tenantId,
             jobType: job.jobType,
             status: job.status,
             failureReason: job.failureReason ?? undefined,
@@ -892,6 +939,13 @@ export async function settleHermesConnectionFromControlJob(
   params: {
     connectionId: string;
     job: {
+      /** Section-04 carry-forward item B (defense-in-depth): when a caller
+       *  (the sweep / completion hook) supplies the job's tenantId, this
+       *  seam refuses to settle a connection row belonging to a different
+       *  tenant — guards against a corrupted/forged job row driving a
+       *  cross-tenant connection-status mutation. Optional so existing
+       *  call sites that don't pass it are unaffected. */
+      tenantId?: string;
       jobType: string;
       status: string;
       failureReason?: string;
@@ -906,6 +960,7 @@ export async function settleHermesConnectionFromControlJob(
 
   const row = await repo.findConnectionById({ connectionId: params.connectionId });
   if (!row) return;
+  if (params.job.tenantId !== undefined && params.job.tenantId !== row.tenantId) return;
 
   const isSuccess = params.job.status === "completed";
   const isFailure = TERMINAL_FAILURE_STATUSES.has(params.job.status);
diff --git a/apps/web/shared/__tests__/hermesMedia.test.ts b/apps/web/shared/__tests__/hermesMedia.test.ts
index 2fea8ccf2..394bdcaa5 100644
--- a/apps/web/shared/__tests__/hermesMedia.test.ts
+++ b/apps/web/shared/__tests__/hermesMedia.test.ts
@@ -1,9 +1,15 @@
 import { describe, expect, it } from "vitest";
 
 import {
+  HERMES_AUTHORIZED_EVENT_TYPE,
+  HERMES_CONNECTION_SETTLED_EVENT_TYPE,
+  HERMES_CONTROL_FAILURE_REASONS,
+  HERMES_DEVICE_CODE_EVENT_TYPE,
   HERMES_MEDIA_ERROR_CODES,
   effectiveHermesCapability,
   formatHermesErrorMessage,
+  hermesAuthorizedEventPayloadSchema,
+  hermesDeviceCodeEventPayloadSchema,
   hermesErrorCopy,
   hermesMediaJobContractSchema,
   maskTokenLike,
@@ -266,3 +272,58 @@ describe("maskTokenLike", () => {
     expect(maskTokenLike(undefined)).toBe("***");
   });
 });
+
+// Section 04 §4.4 — event-contract tests (additive).
+describe("hermes connection-control event contract", () => {
+  it("event-type constants are the exact frozen strings", () => {
+    expect(HERMES_DEVICE_CODE_EVENT_TYPE).toBe("hermes_device_code");
+    expect(HERMES_AUTHORIZED_EVENT_TYPE).toBe("hermes_authorized");
+    expect(HERMES_CONNECTION_SETTLED_EVENT_TYPE).toBe("hermes_connection_settled");
+  });
+
+  it("hermesDeviceCodeEventPayloadSchema accepts the structured shape", () => {
+    const result = hermesDeviceCodeEventPayloadSchema.safeParse({
+      verificationUrl: "https://accounts.x.ai/device",
+      userCode: "ABCD-EFGH",
+      expiresAt: "2026-06-01T13:00:00.000Z",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("hermesDeviceCodeEventPayloadSchema accepts the raw-fallback shape", () => {
+    const result = hermesDeviceCodeEventPayloadSchema.safeParse({
+      raw: "Waiting for authorization... please check your terminal.",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("hermesDeviceCodeEventPayloadSchema accepts an empty object (nothing parsed yet)", () => {
+    expect(hermesDeviceCodeEventPayloadSchema.safeParse({}).success).toBe(true);
+  });
+
+  it("hermesDeviceCodeEventPayloadSchema rejects payloads with token-like extra fields (.strict())", () => {
+    const result = hermesDeviceCodeEventPayloadSchema.safeParse({
+      userCode: "ABCD-EFGH",
+      refreshToken: "should-not-be-here",
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("hermesAuthorizedEventPayloadSchema accepts an accountHint and rejects extra keys", () => {
+    expect(hermesAuthorizedEventPayloadSchema.safeParse({ accountHint: "grok-fan" }).success).toBe(true);
+    expect(hermesAuthorizedEventPayloadSchema.safeParse({}).success).toBe(true);
+    expect(
+      hermesAuthorizedEventPayloadSchema.safeParse({ accountHint: "grok-fan", authToken: "leak" }).success,
+    ).toBe(false);
+  });
+
+  it("HERMES_CONTROL_FAILURE_REASONS is the exact 5-value vocabulary in order", () => {
+    expect(HERMES_CONTROL_FAILURE_REASONS).toEqual([
+      "oauth_session_expired",
+      "oauth_denied",
+      "entitlement_restricted",
+      "reauth_required",
+      "process_failed",
+    ]);
+  });
+});
diff --git a/apps/web/shared/hermesMedia.ts b/apps/web/shared/hermesMedia.ts
index 2b145cde5..25db803e7 100644
--- a/apps/web/shared/hermesMedia.ts
+++ b/apps/web/shared/hermesMedia.ts
@@ -383,3 +383,60 @@ export function maskTokenLike(value: string | null | undefined): string {
   }
   return "***";
 }
+
+// ────────────────────────────────────────────────────────────────────────
+// Section 04 — connection-control job event contract (additive block).
+//
+// Rule (spec §16 token-leak ban): device-code payloads
+// (`hermesDeviceCodeEventPayloadSchema` shape) exist ONLY in
+// `worker_job_events.payloadJson` and the `getConnectStatus` response —
+// NEVER in worker logs, audit JSONL, or error messages. Section 12's CI
+// grep test locks this in fleet-wide; `server/hermesWorker/` handler tests
+// assert the injected logger spy is never called with a string containing
+// `userCode`/`verificationUrl`.
+// ────────────────────────────────────────────────────────────────────────
+
+/** Frozen event-type strings — `worker_job_events.eventType` values used by
+ *  this feature's connection-control jobs. Consumed by sections 03/07/10/11. */
+export const HERMES_DEVICE_CODE_EVENT_TYPE = "hermes_device_code" as const;
+export const HERMES_AUTHORIZED_EVENT_TYPE = "hermes_authorized" as const;
+export const HERMES_CONNECTION_SETTLED_EVENT_TYPE = "hermes_connection_settled" as const;
+
+export const hermesDeviceCodeEventPayloadSchema = z
+  .object({
+    verificationUrl: z.string().url().optional(),
+    userCode: z.string().min(1).optional(),
+    expiresAt: z.string().datetime().optional(),
+    // Fallback when defensive stdout parsing failed — still never logged.
+    raw: z.string().optional(),
+  })
+  .strict();
+
+export type HermesDeviceCodeEventPayload = z.infer<typeof hermesDeviceCodeEventPayloadSchema>;
+
+export const hermesAuthorizedEventPayloadSchema = z
+  .object({
+    accountHint: z.string().optional(),
+  })
+  .strict();
+
+export type HermesAuthorizedEventPayload = z.infer<typeof hermesAuthorizedEventPayloadSchema>;
+
+/**
+ * Shared failure-reason vocabulary (section-03 review carry-forward item A).
+ * `server/hermesWorker/connectionControlHandlers.ts` emits EXACTLY these
+ * strings as a job's `failureReason` / outcome `classification`; both
+ * `hermesConnectionService.ts`'s classifiers and
+ * `hermesConnectionJobs.ts`'s media-job side-effect classifier match these
+ * constants FIRST, keeping their prior substring-sniffing heuristics only
+ * as a legacy fallback for jobs written before this vocabulary existed.
+ */
+export const HERMES_CONTROL_FAILURE_REASONS = [
+  "oauth_session_expired",
+  "oauth_denied",
+  "entitlement_restricted",
+  "reauth_required",
+  "process_failed",
+] as const;
+
+export type HermesControlFailureReason = (typeof HERMES_CONTROL_FAILURE_REASONS)[number];
