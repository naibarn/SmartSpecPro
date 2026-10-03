import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { freemem } from "node:os";

export type Spec224VerificationProfile =
  | "quick"
  | "package"
  | "integration"
  | "full";

export type Spec224VerificationResult =
  | "PASSED"
  | "CODE_FAILED"
  | "BASELINE_FAILED"
  | "RESOURCE_BLOCKED";

export type Spec224VerificationLease = {
  repositoryKey: string;
  ownerToken: string;
  fencingVersion: number;
  heartbeatAt: Date;
  expiresAt: Date;
};

export type Spec224VerificationLeaseStore = {
  acquire(input: {
    repositoryKey: string;
    ownerToken: string;
    now: Date;
    expiresAt: Date;
  }): Promise<Spec224VerificationLease | null>;
  heartbeat(input: {
    repositoryKey: string;
    ownerToken: string;
    fencingVersion: number;
    now: Date;
    expiresAt: Date;
  }): Promise<Spec224VerificationLease | null>;
  release(input: {
    repositoryKey: string;
    ownerToken: string;
    fencingVersion: number;
    now: Date;
  }): Promise<boolean>;
};

export type VerificationResourceObservation = {
  availableMemoryMiB: number | null;
  observedAt: Date;
  cgroupOomKillDelta?: number;
};

export type VerificationResourceSamplerDependencies = {
  freeMemoryBytes: () => number;
  readText: (path: string) => string;
};

function defaultReadText(path: string): string {
  return readFileSync(path, "utf8");
}

function cgroupV2Observation(
  readText: (path: string) => string
): { supported: boolean; headroomBytes: number | null; oomKillCount: number | null } {
  try {
    const current = Number(readText("/sys/fs/cgroup/memory.current").trim());
    const limitText = readText("/sys/fs/cgroup/memory.max").trim();
    const limit = limitText === "max" ? null : Number(limitText);
    const events = readText("/sys/fs/cgroup/memory.events");
    const oomLine = events.split(/\r?\n/).find(line => /^oom_kill\s+\d+$/.test(line));
    const oomKillCount = oomLine ? Number(oomLine.split(/\s+/)[1]) : null;
    return {
      supported: true,
      headroomBytes:
        Number.isFinite(current) && limit !== null && Number.isFinite(limit)
          ? Math.max(0, limit - current)
          : null,
      oomKillCount: Number.isSafeInteger(oomKillCount) ? oomKillCount : null,
    };
  } catch {
    return { supported: false, headroomBytes: null, oomKillCount: null };
  }
}

function cgroupV1Observation(
  readText: (path: string) => string
): { supported: boolean; headroomBytes: number | null; oomKillCount: number | null } {
  try {
    const current = Number(readText("/sys/fs/cgroup/memory/memory.usage_in_bytes").trim());
    const limit = Number(readText("/sys/fs/cgroup/memory/memory.limit_in_bytes").trim());
    const oomControl = readText("/sys/fs/cgroup/memory/memory.oom_control");
    const oomLine = oomControl.split(/\r?\n/).find(line => /^oom_kill\s+\d+$/.test(line));
    const oomKillCount = oomLine ? Number(oomLine.split(/\s+/)[1]) : null;
    const hasPracticalLimit = Number.isFinite(limit) && limit < 2 ** 60;
    return {
      supported: true,
      headroomBytes:
        Number.isFinite(current) && hasPracticalLimit
          ? Math.max(0, limit - current)
          : null,
      oomKillCount: Number.isSafeInteger(oomKillCount) ? oomKillCount : null,
    };
  } catch {
    return { supported: false, headroomBytes: null, oomKillCount: null };
  }
}

/** Samples host memory plus cgroup v2/v1 limits when this Node worker is containerized. */
export function createSpec224VerificationResourceSampler(
  dependencies: VerificationResourceSamplerDependencies = {
    freeMemoryBytes: freemem,
    readText: defaultReadText,
  }
): (now?: Date) => VerificationResourceObservation {
  let previousOomKillCount: number | null = null;
  return (now = new Date()) => {
    assertDate(now, "SPEC224_VERIFICATION_TIME_INVALID");
    const freeMemory = dependencies.freeMemoryBytes();
    if (!Number.isFinite(freeMemory) || freeMemory < 0) {
      throw new Error("SPEC224_VERIFICATION_RESOURCE_SAMPLE_INVALID");
    }
    const cgroup = cgroupV2Observation(dependencies.readText);
    const observation = !cgroup.supported
      ? cgroupV1Observation(dependencies.readText)
      : cgroup;
    const headroom = observation.headroomBytes === null
      ? freeMemory
      : Math.min(freeMemory, observation.headroomBytes);
    const oomKillDelta = observation.oomKillCount === null || previousOomKillCount === null
      ? undefined
      : Math.max(0, observation.oomKillCount - previousOomKillCount);
    if (observation.oomKillCount !== null) {
      previousOomKillCount = observation.oomKillCount;
    }
    return {
      availableMemoryMiB: Math.floor(headroom / (1024 * 1024)),
      observedAt: new Date(now.getTime()),
      ...(oomKillDelta === undefined ? {} : { cgroupOomKillDelta: oomKillDelta }),
    };
  };
}

export type VerificationAdmission =
  | {
      state: "ADMITTED";
      profile: Spec224VerificationProfile;
      repositoryKey: string;
      lease: Spec224VerificationLease | null;
      requiredMemoryMiB: number;
    }
  | {
      state: "QUEUED_RESOURCE";
      profile: Spec224VerificationProfile;
      repositoryKey: string;
      lease: null;
      requiredMemoryMiB: number;
      reason:
        | "INSUFFICIENT_MEMORY_HEADROOM"
        | "RESOURCE_SAMPLE_UNAVAILABLE"
        | "RECENT_OOM_KILL"
        | "FULL_VERIFICATION_ALREADY_LEASED";
    };

const PROFILE_MEMORY_MIB: Record<Spec224VerificationProfile, number> = {
  quick: 512,
  package: 4096,
  integration: 6144,
  // Covers the configured 8-GiB web typecheck heap plus process/OS headroom.
  full: 10_240,
};
const RESOURCE_SAMPLE_MAX_AGE_MS = 60_000;

function assertProfile(profile: Spec224VerificationProfile): void {
  if (!Object.hasOwn(PROFILE_MEMORY_MIB, profile)) {
    throw new Error("SPEC224_VERIFICATION_PROFILE_INVALID");
  }
}

function assertLeaseDuration(durationMs: number): void {
  if (
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1_000 ||
    durationMs > 3_600_000
  ) {
    throw new Error("SPEC224_VERIFICATION_LEASE_DURATION_INVALID");
  }
}

function assertDate(value: Date, code: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(code);
  }
}

function repositoryKey(identity: string): string {
  const normalized = identity.trim();
  if (!normalized || normalized.length > 512) {
    throw new Error("SPEC224_VERIFICATION_REPOSITORY_INVALID");
  }
  return `repo:${createHash("sha256").update(normalized, "utf8").digest("hex")}`;
}

function resourceAdmissionFailure(
  profile: Spec224VerificationProfile,
  observation: VerificationResourceObservation,
  now: Date,
  requiredMemoryMiB = PROFILE_MEMORY_MIB[profile]
): VerificationAdmission["reason"] | null {
  const required = requiredMemoryMiB;
  const oomDelta = observation.cgroupOomKillDelta ?? 0;
  if (!Number.isSafeInteger(oomDelta) || oomDelta < 0) {
    throw new Error("SPEC224_VERIFICATION_RESOURCE_SAMPLE_INVALID");
  }
  if (profile !== "quick" && oomDelta > 0) return "RECENT_OOM_KILL";
  if (observation.availableMemoryMiB === null) {
    return profile === "quick" ? null : "RESOURCE_SAMPLE_UNAVAILABLE";
  }
  if (
    !Number.isFinite(observation.availableMemoryMiB) ||
    observation.availableMemoryMiB < 0
  ) {
    throw new Error("SPEC224_VERIFICATION_RESOURCE_SAMPLE_INVALID");
  }
  const sampleAgeMs = now.getTime() - observation.observedAt.getTime();
  if (sampleAgeMs < 0 || sampleAgeMs > RESOURCE_SAMPLE_MAX_AGE_MS) {
    return profile === "quick" ? null : "RESOURCE_SAMPLE_UNAVAILABLE";
  }
  return observation.availableMemoryMiB < required
    ? "INSUFFICIENT_MEMORY_HEADROOM"
    : null;
}

export function createSpec224VerificationResourceControl(
  store: Spec224VerificationLeaseStore
) {
  return {
    async assess(input: {
      repositoryIdentity: string;
      profile: Spec224VerificationProfile;
      /** A command-specific floor may raise, but never lower, the profile default. */
      requiredMemoryMiB?: number;
      now: Date;
      resource: VerificationResourceObservation;
    }): Promise<VerificationAdmission> {
      assertDate(input.now, "SPEC224_VERIFICATION_TIME_INVALID");
      assertDate(input.resource.observedAt, "SPEC224_VERIFICATION_RESOURCE_TIME_INVALID");
      assertProfile(input.profile);

      const key = repositoryKey(input.repositoryIdentity);
      const requiredMemoryMiB = input.requiredMemoryMiB ?? PROFILE_MEMORY_MIB[input.profile];
      if (
        !Number.isSafeInteger(requiredMemoryMiB) ||
        requiredMemoryMiB < PROFILE_MEMORY_MIB[input.profile] ||
        requiredMemoryMiB > 1_048_576
      ) {
        throw new Error("SPEC224_VERIFICATION_RESOURCE_REQUIREMENT_INVALID");
      }
      const failure = resourceAdmissionFailure(
        input.profile,
        input.resource,
        input.now,
        requiredMemoryMiB
      );
      if (failure) {
        return {
          state: "QUEUED_RESOURCE",
          profile: input.profile,
          repositoryKey: key,
          lease: null,
          requiredMemoryMiB,
          reason: failure,
        };
      }

      return {
        state: "ADMITTED",
        profile: input.profile,
        repositoryKey: key,
        lease: null,
        requiredMemoryMiB,
      };
    },

    async admit(input: {
      repositoryIdentity: string;
      ownerToken: string;
      profile: Spec224VerificationProfile;
      requiredMemoryMiB?: number;
      now: Date;
      leaseDurationMs: number;
      resource: VerificationResourceObservation;
    }): Promise<VerificationAdmission> {
      assertDate(input.now, "SPEC224_VERIFICATION_TIME_INVALID");
      assertProfile(input.profile);
      if (!input.ownerToken.trim() || input.ownerToken.length > 128) {
        throw new Error("SPEC224_VERIFICATION_OWNER_INVALID");
      }
      assertLeaseDuration(input.leaseDurationMs);
      const assessment = await this.assess(input);
      if (assessment.state !== "ADMITTED") return assessment;

      // Only FULL consumes the repository-wide verification lease. Smaller
      // scopes remain independently schedulable while a full check is active.
      if (input.profile !== "full") return assessment;

      const expiresAt = new Date(input.now.getTime() + input.leaseDurationMs);
      const lease = await store.acquire({
        repositoryKey: assessment.repositoryKey,
        ownerToken: input.ownerToken,
        now: input.now,
        expiresAt,
      });
      if (!lease) {
        return {
          state: "QUEUED_RESOURCE",
          profile: input.profile,
          repositoryKey: assessment.repositoryKey,
          lease: null,
          requiredMemoryMiB: assessment.requiredMemoryMiB,
          reason: "FULL_VERIFICATION_ALREADY_LEASED",
        };
      }
      return {
        state: "ADMITTED",
        profile: input.profile,
        repositoryKey: assessment.repositoryKey,
        lease,
        requiredMemoryMiB: assessment.requiredMemoryMiB,
      };
    },

    async heartbeat(input: {
      repositoryIdentity: string;
      ownerToken: string;
      fencingVersion: number;
      now: Date;
      leaseDurationMs: number;
    }): Promise<Spec224VerificationLease | null> {
      assertDate(input.now, "SPEC224_VERIFICATION_TIME_INVALID");
      assertLeaseDuration(input.leaseDurationMs);
      if (!input.ownerToken.trim() || input.ownerToken.length > 128) {
        throw new Error("SPEC224_VERIFICATION_OWNER_INVALID");
      }
      if (!Number.isSafeInteger(input.fencingVersion) || input.fencingVersion < 1) {
        throw new Error("SPEC224_VERIFICATION_FENCE_INVALID");
      }
      return store.heartbeat({
        repositoryKey: repositoryKey(input.repositoryIdentity),
        ownerToken: input.ownerToken,
        fencingVersion: input.fencingVersion,
        now: input.now,
        expiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
      });
    },

    async release(input: {
      repositoryIdentity: string;
      ownerToken: string;
      fencingVersion: number;
      now: Date;
    }): Promise<boolean> {
      assertDate(input.now, "SPEC224_VERIFICATION_TIME_INVALID");
      return store.release({
        repositoryKey: repositoryKey(input.repositoryIdentity),
        ownerToken: input.ownerToken,
        fencingVersion: input.fencingVersion,
        now: input.now,
      });
    },
  };
}

/** Runtime-ready variant that samples host/cgroup memory for every admission. */
export function createSampledSpec224VerificationResourceControl(
  store: Spec224VerificationLeaseStore,
  sampleResource: (now?: Date) => VerificationResourceObservation =
    createSpec224VerificationResourceSampler()
) {
  const control = createSpec224VerificationResourceControl(store);
  return {
    heartbeat: control.heartbeat,
    release: control.release,
    assess(
      input: Omit<Parameters<typeof control.assess>[0], "resource">
    ): Promise<VerificationAdmission> {
      return control.assess({ ...input, resource: sampleResource(input.now) });
    },
    admit(
      input: Omit<Parameters<typeof control.admit>[0], "resource">
    ): Promise<VerificationAdmission> {
      return control.admit({ ...input, resource: sampleResource(input.now) });
    },
  };
}

export function classifySpec224VerificationExit(input: {
  exitCode?: number | null;
  signal?: string | null;
  stderr?: string | null;
  oomKillDelta?: number;
  scope?: "candidate" | "baseline";
}): Spec224VerificationResult {
  const stderr = input.stderr ?? "";
  const resourceFailure =
    input.exitCode === 137 ||
    input.signal === "SIGKILL" ||
    (input.oomKillDelta ?? 0) > 0 ||
    /(?:heap out of memory|allocation failed - javascript heap|reached heap limit|oom-kill|out of memory|memory cgroup out of memory)/i.test(
      stderr
    );
  if (resourceFailure) return "RESOURCE_BLOCKED";
  if (input.exitCode === 0 && !input.signal) return "PASSED";
  return input.scope === "baseline" ? "BASELINE_FAILED" : "CODE_FAILED";
}

export type Spec224VerificationEvidence = {
  schemaVersion: "spec224.verification-evidence.v1";
  repositoryKey: string;
  revision: string;
  profile: Spec224VerificationProfile;
  command: { executable: string; args: string[] };
  scope: string[];
  startedAt: string;
  finishedAt: string;
  result: Spec224VerificationResult;
  exitCode: number | null;
  signal: string | null;
  resource: {
    availableMemoryMiB: number | null;
    observedAt: string;
    cgroupOomKillDelta?: number;
  };
};

function redactCommandArgument(value: string): string {
  return value
    .replace(/((?:--)?[a-z0-9._-]*(?:api[_-]?key|token|password|secret|authorization|credential|cookie)[a-z0-9._-]*=)\S+/gi, "$1[REDACTED]")
    .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [REDACTED]");
}

function safeCommandArgs(args: string[]): string[] {
  const output: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    output.push(redactCommandArgument(argument));
    if (
      /^--?[a-z0-9._-]*(?:api[_-]?key|token|password|secret|authorization|credential|cookie)[a-z0-9._-]*$/i.test(argument) &&
      index + 1 < args.length
    ) {
      output.push("[REDACTED]");
      index += 1;
    }
  }
  return output;
}

export function buildSpec224VerificationEvidence(input: {
  repositoryIdentity: string;
  revision: string;
  profile: Spec224VerificationProfile;
  command: { executable: string; args: string[] };
  scope: string[];
  startedAt: string;
  finishedAt: string;
  result: Spec224VerificationResult;
  exitCode: number | null;
  signal?: string | null;
  resource: {
    availableMemoryMiB: number | null;
    observedAt: string;
    cgroupOomKillDelta?: number;
  };
}): Spec224VerificationEvidence {
  assertProfile(input.profile);
  if (
    !["PASSED", "CODE_FAILED", "BASELINE_FAILED", "RESOURCE_BLOCKED"].includes(
      input.result
    )
  ) {
    throw new Error("SPEC224_VERIFICATION_RESULT_INVALID");
  }
  if (
    input.resource.availableMemoryMiB !== null &&
    (!Number.isFinite(input.resource.availableMemoryMiB) ||
      input.resource.availableMemoryMiB < 0)
  ) {
    throw new Error("SPEC224_VERIFICATION_RESOURCE_SAMPLE_INVALID");
  }
  const started = Date.parse(input.startedAt);
  const finished = Date.parse(input.finishedAt);
  const observed = Date.parse(input.resource.observedAt);
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    !Number.isFinite(observed) ||
    finished < started
  ) {
    throw new Error("SPEC224_VERIFICATION_EVIDENCE_TIME_INVALID");
  }
  if (
    !input.command.executable.trim() ||
    !input.revision.trim() ||
    input.scope.length > 200 ||
    input.command.args.length > 100 ||
    input.scope.some(scope => !scope.trim() || scope.length > 512)
  ) {
    throw new Error("SPEC224_VERIFICATION_EVIDENCE_INVALID");
  }
  return {
    schemaVersion: "spec224.verification-evidence.v1",
    repositoryKey: repositoryKey(input.repositoryIdentity),
    revision: input.revision,
    profile: input.profile,
    command: {
      executable: redactCommandArgument(input.command.executable),
      args: safeCommandArgs(input.command.args),
    },
    scope: [...input.scope],
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date(finished).toISOString(),
    result: input.result,
    exitCode: input.exitCode,
    signal: input.signal ?? null,
    resource: {
      ...input.resource,
      observedAt: new Date(observed).toISOString(),
    },
  };
}
