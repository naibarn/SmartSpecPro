/**
 * Feature 135 — Hermes Grok media worker: connection-control job handler
 * cores. Pure functions with fully injected effects (spawn, event posting,
 * profile ops, logger, clock) so they are unit-testable now, without a
 * worker main loop, claim/heartbeat client, or real spawn/timeout/
 * cancellation machinery (all section 07). Section 11 ports this same
 * state machine to Rust against the same fixture scenarios.
 *
 * No `db` import, side-effect-free at import time — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which also
 * walks this directory.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  HERMES_AUTHORIZED_EVENT_TYPE,
  HERMES_DEVICE_CODE_EVENT_TYPE,
  maskTokenLike,
  type HermesConnectionCapabilityManifest,
  type HermesControlFailureReason,
  type HermesMediaErrorCode,
} from "../../shared/hermesMedia";
import {
  buildCapabilityManifest,
  classifyHermesFailureOutput,
  parseHermesAuthStatusOutput,
  parseHermesDeviceCodeOutput,
} from "./hermesCliParsers";
import { buildArgv, buildPromptEnvelope } from "./hermesInvocation";
import { collectOutputs, HermesOutputError, type FfprobeCheckResult } from "./outputCollector";

export interface HermesSpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ConnectionControlDeps {
  /** Section 07 wires the real invocation module in; timeout-kill escalation
   *  lives entirely inside this injected contract — a simple
   *  timeout-then-kill suffices for this section's handler cores. */
  spawnHermes(
    args: string[],
    opts: { timeoutMs: number; onStdoutLine(line: string): void },
  ): Promise<HermesSpawnResult>;
  postEvent(eventType: string, payload: Record<string, unknown>): Promise<void>;
  profileOps: {
    ensureProfile(ref: string): Promise<void>;
    removeProfile(ref: string): Promise<void>;
  };
  /** NEVER given device-code values (userCode/verificationUrl) — spec §16. */
  logger: { info(msg: string): void; warn(msg: string): void };
  clock?: () => Date;
  /**
   * Feature 135 §6.1 — optional deps for the live "test generation"
   * liveness check (`ConnectionControlInput.testGeneration`). Every field
   * below is OPTIONAL and defaults to a safe, no-real-network / fail-closed
   * behavior, so every existing caller/test — none of which ever sets
   * `testGeneration` — is completely unaffected (byte-identical behavior).
   */
  /** Defaults to the global `fetch`. Only used if the CLI reports a
   *  generated asset via a `MEDIA:`/`MEDIA_TAGS:` URL signal. */
  fetchImpl?: typeof fetch;
  /** Defaults to a fail-closed stub (no video validation) — a real
   *  `ffprobe` implementation must be injected for a video test to ever
   *  succeed, consistent with `outputCollector.ts`'s own documented
   *  fail-closed default. */
  ffprobeImpl?: (filePath: string) => Promise<FfprobeCheckResult>;
  /** Root directory under which a throwaway scratch workspace is created
   *  (`fs.mkdtemp`) for the duration of ONE generation test and destroyed
   *  immediately after output collection — defaults to `os.tmpdir()`.
   *  NEVER the real job workspace root or any Hermes profile directory. */
  testWorkspaceRoot?: string;
  /** Defaults to `"print_mode"` — matches the production default
   *  (`JobHandlersConfig.invocationTemplate`) for the real media-job spawn
   *  shape this liveness check deliberately mirrors. */
  invocationTemplate?: "print_mode" | "chat_fallback";
}

export type HermesControlOutcome =
  | { ok: true; accountHint?: string; manifest?: HermesConnectionCapabilityManifest }
  | {
      ok: false;
      errorCode: HermesMediaErrorCode;
      /** The raw `HermesControlFailureReason` string (e.g.
       *  `"oauth_session_expired"`) — section 07 propagates this verbatim
       *  into `worker_jobs.failureReason` so `hermesConnectionService.ts`'s
       *  constants-first classifiers (section-03 review carry-forward item
       *  A) actually hit their primary path instead of falling through to
       *  the legacy substring heuristics. */
      failureReason: HermesControlFailureReason;
      diagnostic: string;
      /** Feature 135 §6.1 — present ONLY when this failure originated from
       *  the OPTIONAL generation-liveness sub-step of
       *  `runHermesConnectionProbe` AND the preceding auth-status/tools/
       *  version steps had already succeeded — lets the caller still
       *  persist the already-known-good manifest (with `lastGenerationTest`
       *  recorded) instead of losing it just because the optional liveness
       *  check failed. Absent for every other failure path (unchanged). */
      manifest?: HermesConnectionCapabilityManifest;
    };

export interface ConnectionControlInput {
  connectionId: string;
  profileReference: string;
  timeoutSeconds: number;
  /** Feature 135 §6.1 — optional live "test generation" liveness check,
   *  appended AFTER the existing auth-status/tools/version probe steps
   *  (`runHermesConnectionProbe` only). Absent => today's behavior,
   *  byte-identical (see the regression test asserting this). */
  testGeneration?: "image" | "video";
}

const FAILURE_REASON_TO_ERROR_CODE: Record<HermesControlFailureReason, HermesMediaErrorCode> = {
  oauth_session_expired: "HERMES_OAUTH_SESSION_EXPIRED",
  oauth_denied: "HERMES_OAUTH_DENIED",
  entitlement_restricted: "HERMES_ENTITLEMENT_RESTRICTED",
  reauth_required: "HERMES_REAUTH_REQUIRED",
  process_failed: "HERMES_PROCESS_FAILED",
};

/**
 * Builds a diagnostic string that is ALREADY masked — never more than 4 raw
 * characters of any CLI output line survive into it, so it can never carry
 * a code/URL/token even by accident.
 *
 * Prefers stderr's first non-empty line (that's where the actual error
 * text lives for a well-behaved CLI); falls back to scanning stdout from
 * the END (the LAST non-empty stdout line is far more likely to be the
 * terminal error/denial message than the FIRST, which for the authorize
 * flow is usually the device-code instruction line itself).
 */
function buildDiagnostic(reason: HermesControlFailureReason, stdout: string, stderr: string): string {
  const stderrLine = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (stderrLine) return `${reason}: ${maskTokenLike(stderrLine)}`;

  const stdoutLines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastStdoutLine = stdoutLines.length > 0 ? stdoutLines[stdoutLines.length - 1] : "";
  return `${reason}: ${maskTokenLike(lastStdoutLine)}`;
}

// A raw-fallback buffer is only worth posting once it actually contains a
// URL-like or code-like token — not for ordinary CLI chatter that precedes
// the real device-code line (e.g. "Starting Hermes CLI..."). Deliberately
// mirrors (but does not import) `hermesCliParsers.ts`'s own URL/code
// detection so the raw-fallback post fires on the same kind of content the
// parser itself considered a genuine (if incomplete) candidate.
const RAW_FALLBACK_URL_LIKE_PATTERN = /https?:\/\//i;
const RAW_FALLBACK_CODE_LIKE_PATTERN = /\b[A-Z0-9]{4,8}(?:-[A-Z0-9]{4,8})?\b/;

function looksLikeDeviceCodeCandidate(text: string): boolean {
  return RAW_FALLBACK_URL_LIKE_PATTERN.test(text) || RAW_FALLBACK_CODE_LIKE_PATTERN.test(text);
}

function classifyAndBuildFailure(
  stdout: string,
  stderr: string,
): { ok: false; errorCode: HermesMediaErrorCode; failureReason: HermesControlFailureReason; diagnostic: string } {
  const combinedOutput = `${stdout}\n${stderr}`;
  const reason = classifyHermesFailureOutput(combinedOutput);
  return {
    ok: false,
    errorCode: FAILURE_REASON_TO_ERROR_CODE[reason],
    failureReason: reason,
    diagnostic: buildDiagnostic(reason, stdout, stderr),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Feature 135 §6.1 — live "test generation" liveness check.
// ────────────────────────────────────────────────────────────────────────

/** Hard per-step bounds (spec-requested): 120s for an image test, 240s for a
 *  video test — deliberately smaller than `HERMES_CONNECTION_PROBE_TIMEOUT_
 *  SECONDS` (300s) so a hung generation test cannot itself force the whole
 *  probe job into lease/timeout expiry. */
const GENERATION_TEST_TIMEOUT_MS: Record<"image" | "video", number> = {
  image: 120_000,
  video: 240_000,
};

/** A tiny, fixed, non-adversarial prompt — this is a liveness/entitlement
 *  check, never a real user request. Zero references (both `image.generate`
 *  and `video.generate` allow 0..0 references per `HERMES_OPERATION_
 *  REFERENCE_BOUNDS`), smallest output count (1). */
const GENERATION_TEST_PROMPT =
  "SmartSpecPro connectivity check: generate one minimal test asset, then stop.";

interface GenerationTestRecord {
  assetType: "image" | "video";
  ok: boolean;
  at: string;
  errorCode?: HermesMediaErrorCode;
}

interface GenerationTestResult {
  record: GenerationTestRecord;
  /** Set only when the generation attempt failed — lets the caller decide
   *  whether to fail the OVERALL probe outcome (entitlement/reauth) or
   *  merely annotate the manifest (other/transient failures still flow
   *  through the SAME vocabulary — no new codes). */
  failure?: { errorCode: HermesMediaErrorCode; failureReason: HermesControlFailureReason; diagnostic: string };
}

async function createThrowawayTestWorkspace(
  root: string,
): Promise<{ outputDir: string; tmpDir: string; cleanup(): Promise<void> }> {
  const base = await fs.mkdtemp(path.join(root, "hermes-gen-test-"));
  const outputDir = path.join(base, "output");
  const tmpDir = path.join(base, "tmp");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(tmpDir, { recursive: true });
  return {
    outputDir,
    tmpDir,
    cleanup: async () => {
      await fs.rm(base, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/**
 * Runs ONE minimal, bounded, best-effort real generation through the exact
 * same envelope/argv shape the real media-job spawn uses (`buildPromptEnvelope`
 * / `buildArgv`), via the SAME `deps.spawnHermes` contract every other probe
 * step already uses (no new spawn machinery). Any produced artifact is
 * collected ONLY to prove a signal exists — via `collectOutputs`, reusing the
 * exact same magic-byte/ffprobe validation the real media pipeline
 * applies — then the throwaway scratch workspace is deleted immediately.
 * This function NEVER uploads, registers, or finalizes anything: those
 * capabilities are simply not present in `ConnectionControlDeps` at all, so
 * there is no code path here that could reach them even accidentally.
 *
 * Best-effort by construction: every failure mode (non-zero exit / timeout-
 * kill / output-collection rejection / an unexpected thrown error) is
 * classified into the existing vocabulary and returned — this function
 * itself never throws.
 */
async function runGenerationLivenessTest(
  assetType: "image" | "video",
  input: ConnectionControlInput,
  deps: ConnectionControlDeps,
  clock: () => Date,
): Promise<GenerationTestResult> {
  const startedAt = clock();
  const failRecord = (errorCode: HermesMediaErrorCode): GenerationTestRecord => ({
    assetType,
    ok: false,
    at: clock().toISOString(),
    errorCode,
  });

  let workspace: { outputDir: string; tmpDir: string; cleanup(): Promise<void> } | null = null;
  try {
    // Created BEFORE the envelope/argv are built so the CLI is told the
    // REAL absolute output directory to write into (the fake-CLI fixture
    // used by this section's tests ignores this text entirely and is
    // driven purely by its injected scenario — but a real Hermes CLI needs
    // a genuine path here).
    workspace = await createThrowawayTestWorkspace(deps.testWorkspaceRoot ?? os.tmpdir());

    const envelope = buildPromptEnvelope(
      {
        operation: `${assetType}.generate`,
        prompt: GENERATION_TEST_PROMPT,
        references: [],
      },
      { jobId: `hermes-test-${input.connectionId}`, outputDir: workspace.outputDir },
    );
    const argv = buildArgv({
      profile: {},
      operation: `${assetType}.generate`,
      template: deps.invocationTemplate ?? "print_mode",
      enableFileToolset: false,
      envelope,
    });

    const spawnResult = await deps.spawnHermes(argv, {
      timeoutMs: GENERATION_TEST_TIMEOUT_MS[assetType],
      onStdoutLine: () => {},
    });

    if (spawnResult.exitCode !== 0) {
      const classified = classifyAndBuildFailure(spawnResult.stdout, spawnResult.stderr);
      return {
        record: failRecord(classified.errorCode),
        failure: {
          errorCode: classified.errorCode,
          failureReason: classified.failureReason,
          diagnostic: classified.diagnostic,
        },
      };
    }

    try {
      await collectOutputs({
        invocation: { stdout: spawnResult.stdout },
        workspace: { outputDir: workspace.outputDir, tmpDir: workspace.tmpDir },
        cacheDirs: [],
        jobWindow: { startedAt, endedAt: clock() },
        expected: { kind: assetType, count: 1 },
        fetchImpl: deps.fetchImpl,
        ffprobeImpl: deps.ffprobeImpl,
      });
      return { record: { assetType, ok: true, at: clock().toISOString() } };
    } catch (error) {
      const errorCode: HermesMediaErrorCode =
        error instanceof HermesOutputError ? error.code : "HERMES_PROCESS_FAILED";
      const message = error instanceof Error ? error.message : String(error);
      return {
        record: failRecord(errorCode),
        failure: {
          errorCode,
          failureReason: "process_failed",
          diagnostic: `generation_test_output_invalid: ${maskTokenLike(message)}`,
        },
      };
    }
  } catch (error) {
    // Defense-in-depth — this liveness check must classify, never throw.
    const message = error instanceof Error ? error.message : String(error);
    return {
      record: failRecord("HERMES_PROCESS_FAILED"),
      failure: {
        errorCode: "HERMES_PROCESS_FAILED",
        failureReason: "process_failed",
        diagnostic: `generation_test_unexpected_error: ${maskTokenLike(message)}`,
      },
    };
  } finally {
    // Always discard the throwaway workspace — never uploaded, never
    // registered, never finalized; best-effort, never throws.
    await workspace?.cleanup();
  }
}

/**
 * Authorize flow: `ensureProfile` → spawn `hermes -p <profile> auth add
 * xai-oauth --no-browser` → on stdout lines, defensively parse the device
 * code → on first successful parse, post `hermes_device_code` EXACTLY ONCE
 * (latched) → the child stays alive while the user completes the flow
 * (bounded by `timeoutSeconds`, enforced by the injected `spawnHermes`) →
 * on success, run `auth status`, parse `accountHint`, post
 * `hermes_authorized` → return a success outcome. Timeout/denial output →
 * typed failure outcome (child termination is the injected `spawnHermes`
 * contract's responsibility).
 */
export async function runHermesConnectionAuthorize(
  input: ConnectionControlInput,
  deps: ConnectionControlDeps,
): Promise<HermesControlOutcome> {
  const clock = deps.clock ?? (() => new Date());
  await deps.profileOps.ensureProfile(input.profileReference);
  deps.logger.info(`hermes_connection_authorize: starting for connection ${input.connectionId}`);

  let deviceCodePosted = false;
  const bufferedLines: string[] = [];

  const onStdoutLine = (line: string) => {
    bufferedLines.push(line);
    if (deviceCodePosted) return;
    const parsed = parseHermesDeviceCodeOutput(bufferedLines.join("\n"), { now: clock });

    if (parsed.verificationUrl && parsed.userCode) {
      deviceCodePosted = true;
      const payload: Record<string, unknown> = {
        verificationUrl: parsed.verificationUrl,
        userCode: parsed.userCode,
      };
      if (parsed.expiresAt) payload.expiresAt = parsed.expiresAt;
      deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, payload).catch(() => {
        // Best-effort — a dropped event-post must not crash the handler;
        // the connection simply stays pending until the sweep/next status
        // poll re-evaluates (never re-logged with device-code content).
      });
      return;
    }

    // Undocumented-format safety net (spec research B2/B3): a clean parse
    // isn't available, but SOMETHING url-like/code-like has appeared in the
    // buffered output — post the raw-fallback shape once (same latch) so
    // the OAuth flow never silently hangs on a CLI output shape the parser
    // couldn't fully structure. A later clean parse (once more lines
    // arrive) must NOT re-post — `deviceCodePosted` already latches that.
    if (parsed.raw && looksLikeDeviceCodeCandidate(parsed.raw)) {
      deviceCodePosted = true;
      deps.postEvent(HERMES_DEVICE_CODE_EVENT_TYPE, { raw: parsed.raw }).catch(() => {
        // Best-effort — see comment above.
      });
    }
  };

  const authAddResult = await deps.spawnHermes(
    ["auth", "add", "xai-oauth", "--no-browser"],
    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine },
  );

  if (authAddResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_authorize: auth add failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(authAddResult.stdout, authAddResult.stderr);
  }

  const statusResult = await deps.spawnHermes(
    ["auth", "status", "xai-oauth"],
    { timeoutMs: 30_000, onStdoutLine: () => {} },
  );
  const authStatus = parseHermesAuthStatusOutput(statusResult.stdout);

  await deps.postEvent(HERMES_AUTHORIZED_EVENT_TYPE, { accountHint: authStatus.accountHint });
  deps.logger.info(`hermes_connection_authorize: completed for connection ${input.connectionId}`);
  return { ok: true, accountHint: authStatus.accountHint };
}

/**
 * Probe flow: `auth status` (fails closed if not authorized/entitled) →
 * `tools` (media tools are credential-gated, hence post-auth only) →
 * `--version` → composes the capability manifest.
 */
export async function runHermesConnectionProbe(
  input: ConnectionControlInput,
  deps: ConnectionControlDeps,
): Promise<HermesControlOutcome> {
  const clock = deps.clock ?? (() => new Date());
  deps.logger.info(`hermes_connection_probe: starting for connection ${input.connectionId}`);

  const statusResult = await deps.spawnHermes(
    ["auth", "status", "xai-oauth"],
    { timeoutMs: Math.min(input.timeoutSeconds, 30) * 1000, onStdoutLine: () => {} },
  );
  if (statusResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_probe: auth status failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(statusResult.stdout, statusResult.stderr);
  }
  const authStatus = parseHermesAuthStatusOutput(statusResult.stdout);

  const toolsResult = await deps.spawnHermes(
    // `hermes tools` is interactive in current Hermes releases. The
    // documented `status --all` command is safe for a headless worker and
    // includes the available image/video generation categories.
    ["status", "--all"],
    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine: () => {} },
  );
  if (toolsResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_probe: tools listing failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(toolsResult.stdout, toolsResult.stderr);
  }

  const versionResult = await deps.spawnHermes(["--version"], { timeoutMs: 10_000, onStdoutLine: () => {} });
  const hermesVersion = versionResult.stdout.trim() || "unknown";

  const manifest = buildCapabilityManifest({
    hermesVersion,
    toolsOutput: toolsResult.stdout,
    authStatus,
    probedAt: clock().toISOString(),
  });

  // Feature 135 §6.1 — optional live "test generation" liveness check.
  // Absent `testGeneration` => every line below is skipped, so this branch
  // can never change behavior for any existing caller/test (regression gate
  // asserts byte-identical output for the absent case).
  if (input.testGeneration) {
    const testOutcome = await runGenerationLivenessTest(input.testGeneration, input, deps, clock);
    const manifestWithTest: HermesConnectionCapabilityManifest = {
      ...manifest,
      lastGenerationTest: testOutcome.record,
    };

    if (testOutcome.failure) {
      deps.logger.warn(
        `hermes_connection_probe: generation test failed for connection ${input.connectionId} (${testOutcome.failure.errorCode})`,
      );
      // Only entitlement/reauth classifications flip the OVERALL probe
      // outcome to a failure (mirroring the existing auth-status/tools
      // 403-classification behavior above) — a transient/process-level
      // generation-test failure still leaves the probe itself successful
      // (auth/tools/version all genuinely succeeded), with the failure
      // recorded in `manifest.lastGenerationTest` for the UI instead.
      if (
        testOutcome.failure.failureReason === "entitlement_restricted"
        || testOutcome.failure.failureReason === "reauth_required"
        || testOutcome.failure.failureReason === "oauth_session_expired"
        || testOutcome.failure.failureReason === "oauth_denied"
      ) {
        return {
          ok: false,
          errorCode: testOutcome.failure.errorCode,
          failureReason: testOutcome.failure.failureReason,
          diagnostic: testOutcome.failure.diagnostic,
          manifest: manifestWithTest,
        };
      }
    }

    deps.logger.info(`hermes_connection_probe: completed for connection ${input.connectionId}`);
    return { ok: true, accountHint: authStatus.accountHint, manifest: manifestWithTest };
  }

  deps.logger.info(`hermes_connection_probe: completed for connection ${input.connectionId}`);
  return { ok: true, accountHint: authStatus.accountHint, manifest };
}

/**
 * Disconnect flow: `auth logout` THEN profile-directory removal (order
 * matters — asserted via call sequence in tests). A profile-removal
 * failure is a typed failure (never silently swallowed), even though
 * logout itself is still always attempted first.
 */
export async function runHermesConnectionDisconnect(
  input: ConnectionControlInput,
  deps: ConnectionControlDeps,
): Promise<HermesControlOutcome> {
  deps.logger.info(`hermes_connection_disconnect: starting for connection ${input.connectionId}`);

  const logoutResult = await deps.spawnHermes(
    ["auth", "logout", "xai-oauth"],
    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine: () => {} },
  );

  let removeError: unknown;
  try {
    await deps.profileOps.removeProfile(input.profileReference);
  } catch (error) {
    removeError = error;
  }

  if (logoutResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_disconnect: logout failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(logoutResult.stdout, logoutResult.stderr);
  }

  if (removeError !== undefined) {
    const message = removeError instanceof Error ? removeError.message : String(removeError);
    deps.logger.warn(`hermes_connection_disconnect: profile removal failed for connection ${input.connectionId}`);
    return {
      ok: false,
      errorCode: "HERMES_PROCESS_FAILED",
      failureReason: "process_failed",
      diagnostic: `profile_removal_failed: ${maskTokenLike(message)}`,
    };
  }

  deps.logger.info(`hermes_connection_disconnect: completed for connection ${input.connectionId}`);
  return { ok: true };
}
