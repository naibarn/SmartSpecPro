import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSpec224VerificationEvidence,
  classifySpec224VerificationExit,
  createSpec224VerificationResourceControl,
  createSpec224VerificationResourceSampler,
} from "../server/services/spec224VerificationResourceControl.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_REPOSITORY_ROOT = path.resolve(DEFAULT_WEB_ROOT, "../..");
const LEASE_DURATION_MS = 10 * 60 * 1000;
const PROFILE_MEMORY_MIB = Object.freeze({ quick: 512, package: 4096, integration: 6144, full: 10240 });
const WEB_CHECK_MEMORY_MIB = 10240;

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

export function resolveSpec224VerificationCommand(profile, scopes, webRoot = DEFAULT_WEB_ROOT) {
  if (!Object.hasOwn(PROFILE_MEMORY_MIB, profile)) {
    throw new Error("SPEC224_VERIFICATION_PROFILE_INVALID");
  }

  if (profile === "full") {
    return {
      state: "QUEUE_REQUIRED",
      reason: "FULL_REQUIRES_CANONICAL_WORKER_QUEUE",
      profile,
      scope: ["repository-wide build/typecheck/test"],
    };
  }

  if (profile === "quick") {
    if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 20) {
      throw new Error("SPEC224_VERIFICATION_QUICK_SCOPE_REQUIRED");
    }
    const verifiedScopes = scopes.map(scope => {
      if (typeof scope !== "string" || !scope.trim() || path.isAbsolute(scope)) {
        throw new Error("SPEC224_VERIFICATION_SCOPE_INVALID");
      }
      const absolute = path.resolve(webRoot, scope);
      if (!inside(webRoot, absolute) || !existsSync(absolute) || !statSync(absolute).isFile()) {
        throw new Error("SPEC224_VERIFICATION_SCOPE_INVALID");
      }
      const canonical = realpathSync(absolute);
      if (!inside(realpathSync(webRoot), canonical) || !/(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(canonical)) {
        throw new Error("SPEC224_VERIFICATION_SCOPE_INVALID");
      }
      return path.relative(webRoot, canonical).split(path.sep).join("/");
    });
    return {
      state: "EXECUTABLE",
      profile,
      executable: "pnpm",
      args: ["exec", "vitest", "run", "--pool=forks", "--maxWorkers=1", "--minWorkers=1", ...verifiedScopes],
      scope: verifiedScopes.map(scope => `apps/web/${scope}`),
      requiredMemoryMiB: PROFILE_MEMORY_MIB.quick,
    };
  }

  if (profile === "package") {
    if (scopes?.length && (scopes.length !== 1 || scopes[0] !== "apps/web")) {
      throw new Error("SPEC224_VERIFICATION_PACKAGE_UNSUPPORTED");
    }
    return {
      state: "EXECUTABLE",
      profile,
      executable: "pnpm",
      args: ["run", "check"],
      scope: ["apps/web:check"],
      // apps/web's check script sets the TypeScript heap to 8 GiB. The extra
      // 2 GiB is the existing full-profile process/OS allowance.
      requiredMemoryMiB: WEB_CHECK_MEMORY_MIB,
    };
  }

  if (scopes?.length && (scopes.length !== 1 || scopes[0] !== "apps/web")) {
    throw new Error("SPEC224_VERIFICATION_INTEGRATION_UNSUPPORTED");
  }
  return {
    state: "EXECUTABLE",
    profile,
    executable: "pnpm",
    args: ["run", "test:db-integration", "--", "--pool=forks", "--maxWorkers=1", "--minWorkers=1"],
    scope: ["apps/web:test:db-integration (adminTenants, marketplaceProductAffiliateLinks)"],
    requiredMemoryMiB: PROFILE_MEMORY_MIB.integration,
  };
}

function runChild(executable, args, cwd) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd, shell: false, stdio: "inherit" });
    child.once("error", error => resolve({ exitCode: null, signal: null, errorCode: error.code ?? "SPAWN_FAILED" }));
    child.once("close", (exitCode, signal) => resolve({ exitCode, signal, errorCode: null }));
  });
}

function defaultAdmit(input) {
  const store = {
    async acquire() { return null; },
    async heartbeat() { return null; },
    async release() { return false; },
  };
  return createSpec224VerificationResourceControl(store).admit(input);
}

function defaultRevision(repositoryRoot) {
  return execFileSync("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

export async function runSpec224Verification(input) {
  const command = resolveSpec224VerificationCommand(input.profile, input.scopes ?? [], input.webRoot ?? DEFAULT_WEB_ROOT);
  if (command.state === "QUEUE_REQUIRED") return command;

  const now = input.now ?? new Date();
  const resource = (input.sampleResource ?? createSpec224VerificationResourceSampler())(now);
  const admission = await (input.admit ?? defaultAdmit)({
    repositoryIdentity: input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
    ownerToken: input.ownerToken ?? randomUUID(),
    profile: command.profile,
    requiredMemoryMiB: command.requiredMemoryMiB,
    now,
    leaseDurationMs: LEASE_DURATION_MS,
    resource,
  });
  if (admission.state !== "ADMITTED") {
    return {
      state: "QUEUED_RESOURCE",
      profile: command.profile,
      scope: command.scope,
      reason: admission.reason,
      requiredMemoryMiB: admission.requiredMemoryMiB,
      availableMemoryMiB: resource.availableMemoryMiB,
      observedAt: resource.observedAt.toISOString(),
    };
  }

  const startedAt = now.toISOString();
  const outcome = await (input.spawnProcess ?? runChild)(command.executable, command.args, input.webRoot ?? DEFAULT_WEB_ROOT);
  const finishedAt = (input.finishedAt ?? new Date()).toISOString();
  const result = outcome.errorCode
    ? "BASELINE_FAILED"
    : classifySpec224VerificationExit({ exitCode: outcome.exitCode, signal: outcome.signal, oomKillDelta: resource.cgroupOomKillDelta });
  const evidence = buildSpec224VerificationEvidence({
    repositoryIdentity: input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
    revision: input.revision ?? defaultRevision(input.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT),
    profile: command.profile,
    command: { executable: command.executable, args: command.args },
    scope: command.scope,
    startedAt,
    finishedAt,
    result,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    resource: {
      availableMemoryMiB: resource.availableMemoryMiB,
      observedAt: resource.observedAt.toISOString(),
      ...(resource.cgroupOomKillDelta === undefined ? {} : { cgroupOomKillDelta: resource.cgroupOomKillDelta }),
    },
  });
  return { state: "COMPLETED", evidence, ...(outcome.errorCode ? { errorCode: outcome.errorCode } : {}) };
}

function parseCli(argv) {
  let profile;
  const scopes = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--profile") profile = argv[++index];
    else if (argv[index] === "--scope") scopes.push(argv[++index]);
    else throw new Error(`SPEC224_VERIFICATION_ARGUMENT_UNKNOWN:${argv[index]}`);
  }
  if (!profile) throw new Error("SPEC224_VERIFICATION_PROFILE_REQUIRED");
  return { profile, scopes };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const result = await runSpec224Verification({ ...parseCli(process.argv.slice(2)) });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.state === "COMPLETED") {
      process.exitCode = result.evidence.result === "PASSED" ? 0 : result.evidence.result === "RESOURCE_BLOCKED" ? 75 : 1;
    } else {
      process.exitCode = 75;
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "SPEC224_VERIFICATION_FAILED"}\n`);
    process.exitCode = 64;
  }
}
