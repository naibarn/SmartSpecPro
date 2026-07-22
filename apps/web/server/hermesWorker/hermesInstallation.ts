/**
 * Feature 135 — Hermes Grok media worker (section 07): pinned installation
 * provisioning, `ProfileStrategy`, the profile-isolation probe, and the
 * flag-composition probe (plan §10 / spec §8.3, §13.3).
 *
 * `ProfileStrategy` isolates one Hermes provider connection's auth state
 * from every other connection's — see the filesystem layout in the section
 * spec §2.4:
 *
 *   profiles/tenant_<tenantId>/conn_<connectionId>/{home/.hermes, locks, logs}
 *
 * Two strategies:
 *  - `native_profile` (primary): trusts the pinned CLI's own `-p <name>`
 *    profile flag for isolation, ADDITIONALLY setting a per-connection
 *    `HERMES_HOME` as defense in depth.
 *  - `per_connection_home` (fallback): used when the isolation probe shows
 *    `-p` alone does not reliably separate auth state — relies solely on
 *    the per-connection `HERMES_HOME` directory, never passing `-p`.
 *
 * Both strategies produce paths strictly confined under the configured
 * root; `removeProfile` refuses anything that resolves outside it.
 *
 * No `db` import, side-effect-free at import time — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

import { parseHermesAuthStatusOutput } from "./hermesCliParsers";

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const MANAGED_XAI_MEDIA_CONFIG = {
  image_gen: { provider: "xai" },
  video_gen: { provider: "xai" },
};

export interface ProfileHandle {
  /** `["-p", profileArg]` should be prepended to argv when set (native
   *  strategy only — the fallback strategy never sets this). */
  profileArg?: string;
  /** Environment overlay (always includes a per-connection `HERMES_HOME`). */
  env: Record<string, string>;
  homeDir: string;
  locksDir: string;
}

export interface ProfileStrategy {
  kind: "native_profile" | "per_connection_home";
  ensureProfile(ref: { tenantId: string; connectionId: string }): Promise<ProfileHandle>;
  removeProfile(ref: { tenantId: string; connectionId: string }): Promise<void>;
}

function sanitizeSegment(value: string, label: string): string {
  if (!SEGMENT_PATTERN.test(value)) {
    throw new Error(`Invalid ${label} for Hermes profile path: ${value}`);
  }
  return value;
}

function profileDirsFor(root: string, tenantId: string, connectionId: string) {
  const t = sanitizeSegment(tenantId, "tenantId");
  const c = sanitizeSegment(connectionId, "connectionId");
  const base = path.join(root, `tenant_${t}`, `conn_${c}`);
  return {
    base,
    homeDir: path.join(base, "home"),
    locksDir: path.join(base, "locks"),
    logsDir: path.join(base, "logs"),
    profileArg: `conn_${c}`,
  };
}

async function ensureProfileDirs(dirs: ReturnType<typeof profileDirsFor>): Promise<void> {
  await fs.mkdir(path.join(dirs.homeDir, ".hermes"), { recursive: true, mode: 0o700 });
  await fs.mkdir(dirs.locksDir, { recursive: true });
  await fs.mkdir(dirs.logsDir, { recursive: true });
  await fs.writeFile(path.join(dirs.homeDir, "config.yaml"), yaml.dump(MANAGED_XAI_MEDIA_CONFIG), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function assertWithinRoot(root: string, candidate: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to operate on a Hermes profile path outside its root: ${candidate}`);
  }
}

export function createNativeProfileStrategy(cfg: { root: string }): ProfileStrategy {
  return {
    kind: "native_profile",
    async ensureProfile({ tenantId, connectionId }) {
      const dirs = profileDirsFor(cfg.root, tenantId, connectionId);
      await ensureProfileDirs(dirs);
      return {
        profileArg: dirs.profileArg,
        env: { HERMES_HOME: dirs.homeDir },
        homeDir: dirs.homeDir,
        locksDir: dirs.locksDir,
      };
    },
    async removeProfile({ tenantId, connectionId }) {
      const dirs = profileDirsFor(cfg.root, tenantId, connectionId);
      assertWithinRoot(cfg.root, dirs.base);
      await fs.rm(dirs.base, { recursive: true, force: true });
    },
  };
}

export function createPerConnectionHomeStrategy(cfg: { root: string }): ProfileStrategy {
  return {
    kind: "per_connection_home",
    async ensureProfile({ tenantId, connectionId }) {
      const dirs = profileDirsFor(cfg.root, tenantId, connectionId);
      await ensureProfileDirs(dirs);
      return {
        env: { HERMES_HOME: dirs.homeDir },
        homeDir: dirs.homeDir,
        locksDir: dirs.locksDir,
      };
    },
    async removeProfile({ tenantId, connectionId }) {
      const dirs = profileDirsFor(cfg.root, tenantId, connectionId);
      assertWithinRoot(cfg.root, dirs.base);
      await fs.rm(dirs.base, { recursive: true, force: true });
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Probes
// ────────────────────────────────────────────────────────────────────────

export interface HermesProbeSpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface HermesProbeDeps {
  spawnHermes(
    args: string[],
    opts: { env?: Record<string, string>; timeoutMs: number },
  ): Promise<HermesProbeSpawnResult>;
}

/**
 * Verifies the pinned CLI's `-p <profile>` flag actually isolates auth
 * state: authorize a throwaway probe profile A, then check auth status on a
 * DIFFERENT throwaway probe profile B (separate `HERMES_HOME`s). If B
 * reports authorized, `-p` alone leaked state across profiles — isolation
 * has failed and the fallback strategy must be used.
 */
export async function runHermesProfileIsolationProbe(
  deps: HermesProbeDeps,
): Promise<{ isolated: boolean }> {
  const authorize = await deps.spawnHermes(["-p", "__probe_a", "auth", "add", "xai-oauth", "--no-browser"], {
    timeoutMs: 5_000,
  });
  const check = await deps.spawnHermes(["-p", "__probe_b", "auth", "status", "xai-oauth"], {
    timeoutMs: 5_000,
  });
  const probeOutput = `${authorize.stdout}\n${authorize.stderr}\n${check.stdout}\n${check.stderr}`;
  if (
    authorize.exitCode === 2
    || check.exitCode === 2
    || /invalid choice|unknown option|unrecognized argument|invalid option/i.test(probeOutput)
  ) {
    return { isolated: false };
  }
  const authStatus = parseHermesAuthStatusOutput(check.stdout);
  return { isolated: check.exitCode === 0 && !authStatus.authorized };
}

const FLAG_PARSE_ERROR_PATTERN = /invalid choice|unknown option|unrecognized argument|invalid option|not compatible/i;

/**
 * Probes whether `-z` (print/one-shot mode) composes with
 * `--provider/--toolsets/-p` on the pinned CLI. A non-zero exit paired with
 * flag-parse-error-shaped output means the flags don't compose — the
 * adapter must fall back to the `chat -q -Q` template.
 */
export async function runHermesFlagCompositionProbe(
  deps: HermesProbeDeps,
  options: { includeProfileArg?: boolean } = {},
): Promise<{ template: "print_mode" | "chat_fallback" }> {
  const profileArgs = options.includeProfileArg === false ? [] : ["-p", "__probe_flags"];
  const result = await deps.spawnHermes(
    [...profileArgs, "-z", "--provider", "xai-oauth", "--toolsets", "image_gen", "--ignore-user-config", "probe"],
    { timeoutMs: 5_000 },
  );
  const incompatible = result.exitCode !== 0 && FLAG_PARSE_ERROR_PATTERN.test(`${result.stdout}\n${result.stderr}`);
  return { template: incompatible ? "chat_fallback" : "print_mode" };
}

export interface ProvisionHermesConfig {
  hermesHomeRoot: string;
  expectedVersion?: string;
}

export interface ProvisionHermesResult {
  version: string;
  doctorOk: boolean;
  strategy: ProfileStrategy;
  invocationTemplate: "print_mode" | "chat_fallback";
}

/**
 * Runs the version check, isolation probe, and flag-composition probe, and
 * selects the `ProfileStrategy` accordingly. `doctorOk` gates whether
 * registration may advertise the `hermesMedia` capability (spec §6.2 —
 * "registration advertises `hermesMedia` capability only when this doctor
 * pass succeeds").
 */
export async function provisionHermes(
  cfg: ProvisionHermesConfig,
  deps: HermesProbeDeps,
): Promise<ProvisionHermesResult> {
  const versionResult = await deps.spawnHermes(["--version"], { timeoutMs: 10_000 });
  const version = versionResult.stdout.trim() || "unknown";
  const isolation = await runHermesProfileIsolationProbe(deps);
  const flagComposition = await runHermesFlagCompositionProbe(deps, {
    includeProfileArg: isolation.isolated,
  });
  const strategy = isolation.isolated
    ? createNativeProfileStrategy({ root: cfg.hermesHomeRoot })
    : createPerConnectionHomeStrategy({ root: cfg.hermesHomeRoot });
  const doctorOk =
    versionResult.exitCode === 0 && (cfg.expectedVersion ? version.includes(cfg.expectedVersion) : true);

  return {
    version,
    doctorOk,
    strategy,
    invocationTemplate: flagComposition.template,
  };
}
