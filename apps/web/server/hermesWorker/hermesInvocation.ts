/**
 * Feature 135 — Hermes Grok media worker (section 07): deterministic prompt
 * envelope construction, argv building, and the spawn adapter (plan §10,
 * spec §13.3, §13.6).
 *
 * Invocation shape (plan §10 — supersedes spec §13.3's toolset list):
 *   `hermes -p conn_<connectionId> -z <envelope> --provider xai-oauth
 *   --model grok-build-0.1 --toolsets
 *   "image_gen"|"video_gen" --ignore-rules`
 * spawned via an argv ARRAY (no shell) — the envelope, however large or
 * adversarial its content, is always exactly one argv element, so nothing a
 * user-supplied prompt contains can ever alter argv structure (extra flags,
 * `cd`, path traversal, etc). `file` toolset is never enabled by default.
 *
 * No `db` import — see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import type { HermesMediaOperation } from "../../shared/hermesMedia";
import type { ProfileHandle } from "./hermesInstallation";

// ────────────────────────────────────────────────────────────────────────
// Child env allow-list (security fix — see code review)
// ────────────────────────────────────────────────────────────────────────

/**
 * Every Hermes child process MUST get an explicit ALLOW-LISTED env, never
 * `{...process.env, ...overlay}`. This worker process runs with
 * `apps/web/.env` loaded (`DATABASE_URL`, `JWT_SECRET`,
 * `LLM_ENCRYPTION_KEY`, `HERMES_WORKER_TOKEN`, etc) — handing that whole
 * env to a CLI agent that executes attacker-influenceable prompts would be
 * a secret-leak vector (root CLAUDE.md "Secret Exposure Prevention"). Only
 * `PATH`/`HOME` pass through unchanged; everything else must be explicitly
 * supplied via `overlay` (e.g. `HERMES_HOME` from a `ProfileHandle`).
 */
const ALLOWED_ENV_PASSTHROUGH_KEYS = ["PATH", "HOME"] as const;

export function buildHermesChildEnv(overlay: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_PASSTHROUGH_KEYS) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  env.NO_COLOR = "1";
  env.PYTHONUNBUFFERED = "1";
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

// ────────────────────────────────────────────────────────────────────────
// Prompt envelope
// ────────────────────────────────────────────────────────────────────────

export interface HermesEnvelopeReference {
  index: number;
  role: string;
  label: string;
  assetId: string;
}

export interface HermesEnvelopeContract {
  operation: HermesMediaOperation;
  prompt: string;
  references: HermesEnvelopeReference[];
}

export interface HermesEnvelopeWorkspace {
  jobId: string;
  outputDir: string;
}

// Control characters other than \n and \t — deliberately keeps ordinary
// punctuation (Thai/English text, quotes, etc) untouched.
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizePromptText(prompt: string): string {
  return prompt.replace(CONTROL_CHAR_PATTERN, "");
}

export const HERMES_RESULT_MARKER_BEGIN = "SMARTSPECPRO_RESULT_BEGIN";
export const HERMES_RESULT_MARKER_END = "SMARTSPECPRO_RESULT_END";

/**
 * Deterministic for a fixed contract (spec §13.3): job id, operation,
 * output dir, ordered reference list with roles/labels, an explicit
 * "do not reorder/substitute references" instruction, sanitized prompt,
 * and a demanded machine-readable result-block contract.
 */
export function buildPromptEnvelope(
  contract: HermesEnvelopeContract,
  workspace: HermesEnvelopeWorkspace,
): string {
  const referencesBlock =
    contract.references.length > 0
      ? contract.references
          .map((ref) => `  ${ref.index}. [${ref.role}] ${ref.label} (asset ${ref.assetId})`)
          .join("\n")
      : "  (none)";

  return [
    "SmartSpecPro Hermes media job",
    `Job ID: ${workspace.jobId}`,
    `Operation: ${contract.operation}`,
    `Output directory: ${workspace.outputDir}`,
    "References (in this exact order — do not reorder, substitute, or drop any reference):",
    referencesBlock,
    "",
    "Prompt:",
    sanitizePromptText(contract.prompt),
    "",
    "When generation is complete, print EXACTLY one line in this form (no other text on that line):",
    `${HERMES_RESULT_MARKER_BEGIN} {"status":"ok"|"error","files":["..."],"message":"..."} ${HERMES_RESULT_MARKER_END}`,
  ].join("\n");
}

// ────────────────────────────────────────────────────────────────────────
// Argv construction
// ────────────────────────────────────────────────────────────────────────

const OPERATION_TOOLSET: Record<HermesMediaOperation, "image_gen" | "video_gen"> = {
  "image.generate": "image_gen",
  "image.edit": "image_gen",
  "video.generate": "video_gen",
  "video.image_to_video": "video_gen",
  "video.reference_to_video": "video_gen",
};

const HERMES_XAI_INFERENCE_MODEL = "grok-build-0.1";

export interface BuildArgvParams {
  profile: Pick<ProfileHandle, "profileArg">;
  operation: HermesMediaOperation;
  template: "print_mode" | "chat_fallback";
  /** `file` toolset is NEVER included unless this deployment config escape
   *  hatch is explicitly set — spec §4.2. */
  enableFileToolset: boolean;
  envelope: string;
}

/** Builds the invocation argv ARRAY (never a shell string) — the envelope
 *  (however adversarial) is always exactly one element. */
export function buildArgv(params: BuildArgvParams): string[] {
  const baseToolset = OPERATION_TOOLSET[params.operation];
  const toolsets = params.enableFileToolset ? `${baseToolset},file` : baseToolset;

  const argv: string[] = [];
  if (params.profile.profileArg) {
    argv.push("-p", params.profile.profileArg);
  }
  if (params.template === "print_mode") {
    argv.push(
      "-z",
      params.envelope,
      "--provider",
      "xai-oauth",
      "--model",
      HERMES_XAI_INFERENCE_MODEL,
      "--toolsets",
      toolsets,
      "--ignore-rules",
    );
  } else {
    argv.push(
      "chat",
      "-q",
      "-Q",
      "--provider",
      "xai-oauth",
      "--model",
      HERMES_XAI_INFERENCE_MODEL,
      "--toolsets",
      toolsets,
      "--ignore-rules",
      params.envelope,
    );
  }
  return argv;
}

// ────────────────────────────────────────────────────────────────────────
// Spawn adapter
// ────────────────────────────────────────────────────────────────────────

export interface HermesChildProcessLike {
  stdout?: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
  stderr?: { on(event: "data", listener: (chunk: Buffer | string) => void): void } | null;
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  kill(signal?: NodeJS.Signals): boolean;
}

export type HermesSpawnFn = (
  argv: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => HermesChildProcessLike;

export interface HermesInvocationTimeouts {
  /** Soft timeout — logged/reported via `onSoftTimeout`, never kills. */
  softMs?: number;
  /** Hard wall-clock timeout — kills the child. */
  hardMs: number;
  /** No-output inactivity timeout — kills the child; reset on any stdout/stderr chunk. */
  inactivityMs: number;
  /** Grace period between SIGTERM and SIGKILL escalation. Default 5000ms. */
  graceMs?: number;
}

export interface RunHermesParams {
  argv: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeouts: HermesInvocationTimeouts;
  onStdoutLine?: (line: string) => void;
  onSoftTimeout?: () => void;
  /** Cooperative cancellation — abort() triggers the same SIGTERM→grace→SIGKILL escalation. */
  signal?: AbortSignal;
  spawnImpl: HermesSpawnFn;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface InvocationResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killedBy?: "hard" | "inactivity" | "cancel";
}

const DEFAULT_GRACE_MS = 5_000;

export async function runHermes(params: RunHermesParams): Promise<InvocationResult> {
  const setTimeoutImpl = params.setTimeoutImpl ?? setTimeout;
  const clearTimeoutImpl = params.clearTimeoutImpl ?? clearTimeout;
  const graceMs = params.timeouts.graceMs ?? DEFAULT_GRACE_MS;

  const child = params.spawnImpl(params.argv, { cwd: params.cwd, env: params.env });

  let stdout = "";
  let stderr = "";
  let killedBy: InvocationResult["killedBy"];
  let settled = false;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;
  let softTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;

  return new Promise<InvocationResult>((resolve) => {
    function clearAllTimers(): void {
      if (inactivityTimer) clearTimeoutImpl(inactivityTimer);
      if (hardTimer) clearTimeoutImpl(hardTimer);
      if (softTimer) clearTimeoutImpl(softTimer);
      if (graceTimer) clearTimeoutImpl(graceTimer);
    }

    function scheduleInactivity(): void {
      if (inactivityTimer) clearTimeoutImpl(inactivityTimer);
      inactivityTimer = setTimeoutImpl(() => escalate("inactivity"), params.timeouts.inactivityMs);
    }

    function escalate(reason: NonNullable<InvocationResult["killedBy"]>): void {
      if (settled || killedBy) return;
      killedBy = reason;
      child.kill("SIGTERM");
      graceTimer = setTimeoutImpl(() => {
        if (!settled) child.kill("SIGKILL");
      }, graceMs);
    }

    hardTimer = setTimeoutImpl(() => escalate("hard"), params.timeouts.hardMs);
    if (params.timeouts.softMs !== undefined) {
      softTimer = setTimeoutImpl(() => params.onSoftTimeout?.(), params.timeouts.softMs);
    }
    scheduleInactivity();

    params.signal?.addEventListener("abort", () => escalate("cancel"));

    child.stdout?.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      scheduleInactivity();
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) params.onStdoutLine?.(line);
      }
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      scheduleInactivity();
    });
    child.on("exit", (code) => {
      settled = true;
      clearAllTimers();
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut: killedBy !== undefined,
        ...(killedBy ? { killedBy } : {}),
      });
    });
  });
}
