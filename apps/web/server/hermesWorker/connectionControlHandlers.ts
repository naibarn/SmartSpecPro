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
    };

export interface ConnectionControlInput {
  connectionId: string;
  profileReference: string;
  timeoutSeconds: number;
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
    ["-p", input.profileReference, "auth", "add", "xai-oauth", "--no-browser"],
    { timeoutMs: input.timeoutSeconds * 1000, onStdoutLine },
  );

  if (authAddResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_authorize: auth add failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(authAddResult.stdout, authAddResult.stderr);
  }

  const statusResult = await deps.spawnHermes(
    ["-p", input.profileReference, "auth", "status", "xai-oauth"],
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
    ["-p", input.profileReference, "auth", "status", "xai-oauth"],
    { timeoutMs: Math.min(input.timeoutSeconds, 30) * 1000, onStdoutLine: () => {} },
  );
  if (statusResult.exitCode !== 0) {
    deps.logger.warn(`hermes_connection_probe: auth status failed for connection ${input.connectionId}`);
    return classifyAndBuildFailure(statusResult.stdout, statusResult.stderr);
  }
  const authStatus = parseHermesAuthStatusOutput(statusResult.stdout);

  const toolsResult = await deps.spawnHermes(
    ["-p", input.profileReference, "tools"],
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
    ["-p", input.profileReference, "auth", "logout", "xai-oauth"],
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
