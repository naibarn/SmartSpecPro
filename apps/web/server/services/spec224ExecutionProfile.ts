import { createHash } from "node:crypto";

export type Spec224ExecutionProfile = {
  schemaVersion: "spec224.execution-profile.v1";
  profileId: string;
  version: number;
  repository: {
    sourceCommit: string;
    gitTree: string;
  };
  runtime: {
    node: string;
    pnpm: string;
    python: string;
    rustc: string;
    platform: string;
    architecture: string;
  };
  cargoTarget: string;
  workspaceManifestPaths: string[];
  entrypoints: {
    node: string[];
    python: string[];
    rust: string[];
  };
  workspaces: string[];
  moduleRoots: Array<{ prefix: string; root: string; language: "python" | "javascript" }>;
  pythonStandardLibrarySha256: string;
  sourceInputs: string[];
  dependencyManifests: {
    runtime: string[];
    testOnly: string[];
  };
  externalArtifacts: string[];
  scripts: {
    allowed: string[];
    forbidden: string[];
  };
  dynamicImports: {
    declaredLoaders: string[];
    unresolvedBehavior: "fail-closed";
  };
  requiredRunnerCapabilities: string[];
  storageClass: "non-production-immutable-test-fixture" | "restricted-object-store";
  networkRequirements: string[];
  environment: Array<{ name: string; class: "non-secret" | "secret-reference" | "runtime-secret" }>;
  protectedOperations: string[];
  profileDigest: string;
};

const RECOVERY_RUNNER_PROFILE_INPUT: ExecutionProfileInput = {
  schemaVersion: "spec224.execution-profile.v1",
  profileId: "spec224-recovery-registered-runner-nonprod",
  version: 1,
  repository: {
    sourceCommit: "08895596129d3168bb944387d76bf86b4a9b180c",
    gitTree: "ac3ee49fae33d5fba2c54aa81396950710afb88c",
  },
  runtime: {
    node: "v22.22.3",
    pnpm: "10.4.1",
    python: "3.13.5",
    rustc: "1.94.1",
    platform: "linux",
    architecture: "x86_64",
  },
  cargoTarget: "x86_64-unknown-linux-gnu",
  workspaceManifestPaths: [
    "package.json",
    "apps/web/package.json",
    "packages/agent-experience/package.json",
    "packages/db/package.json",
    "packages/local-ai-core/package.json",
    "packages/remotion-render/package.json",
    "packages/shared/package.json",
    "packages/skills/package.json",
    "packages/ui/package.json",
  ],
  entrypoints: {
    node: [
      "apps/web/server/services/jobExecutor.ts",
      "apps/web/server/services/externalAgentTaskExecutor.ts",
      "apps/web/server/services/spec224ApprovalContinuation.ts",
      "apps/web/server/services/spec224RunnerContinuationReconciler.ts",
      "apps/web/server/routes/runnerControl.ts",
    ],
    python: [
      "python-backend/app/services/approval_db_service.py",
      "python-backend/app/models/approval.py",
      "python-backend/app/models/audit_log.py",
      "python-backend/tests/integration/test_spec224_approval_postgres.py",
      "python-backend/tests/integration/test_spec224_recovery_grant_postgres.py",
    ],
    rust: ["apps/runner-app/src/main.rs"],
  },
  workspaces: [
    "apps/web",
    "packages/agent-experience",
    "packages/db",
    "packages/local-ai-core",
    "packages/remotion-render",
    "packages/shared",
    "packages/skills",
    "packages/ui",
    "apps/runner-app",
    "python-backend",
  ],
  moduleRoots: [
    { prefix: "@", root: "apps/web/client/src", language: "javascript" },
    { prefix: "@db", root: "apps/web/drizzle", language: "javascript" },
    { prefix: "@server", root: "apps/web/server", language: "javascript" },
    { prefix: "@shared", root: "apps/web/shared", language: "javascript" },
    { prefix: "app", root: "python-backend/app", language: "python" },
  ],
  pythonStandardLibrarySha256: "c882d02c4df0acfdb607c1fc81d33f4529965c5805c0d5647afd2977f33a142e",
  sourceInputs: [
    "apps/web/server/services/jobControlPlane.ts",
    "apps/web/server/services/workerJobOutboxPublisher.ts",
    "apps/web/server/services/spec224DevelopmentRunPersistence.ts",
    "apps/web/server/services/spec224AuthorizationService.ts",
    "apps/web/drizzle/schema.ts",
    "apps/web/drizzle/spec224-fresh-baseline/schema.ts",
    "apps/web/tsconfig.json",
    "tsconfig.base.json",
    "apps/runner-app/src",
    "python-backend/app/services",
    "python-backend/app/models",
    "python-backend/tests/integration/test_spec224_approval_postgres.py",
    "python-backend/tests/integration/test_spec224_recovery_grant_postgres.py",
  ],
  dependencyManifests: {
    runtime: [
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "apps/web/package.json",
      "apps/runner-app/Cargo.toml",
      "apps/runner-app/Cargo.lock",
      "python-backend/pyproject.toml",
      "python-backend/uv.lock",
    ],
    testOnly: [
      "apps/web/package.json#vitest",
      "python-backend/pyproject.toml#pytest",
    ],
  },
  externalArtifacts: [
    "pnpm-lock.yaml:resolve-required-node-artifacts",
    "apps/runner-app/Cargo.lock:resolve-linux-x86_64-runtime-artifacts",
    "python-backend/uv.lock:resolve-python-3.13-linux-x86_64-artifacts",
  ],
  scripts: {
    allowed: ["cargo check --locked --offline", "focused Spec 224 Vitest", "focused Spec 224 PostgreSQL pytest"],
    forbidden: ["package lifecycle hooks", "deployment scripts", "production migration commands", "D3.19 harness"],
  },
  dynamicImports: {
    declaredLoaders: ["Node ESM/CommonJS loaders declared by package manifests", "Python importlib literal imports", "Rust cfg-selected modules in the runtime-binary profile"],
    unresolvedBehavior: "fail-closed",
  },
  requiredRunnerCapabilities: ["agent.external_task"],
  storageClass: "non-production-immutable-test-fixture",
  networkRequirements: ["loopback PostgreSQL 15.17", "loopback Runner WSS test endpoint", "no external provider or registry at execution time"],
  environment: [
    { name: "DATABASE_URL", class: "secret-reference" },
    { name: "SPEC224_TEST_RUNNER_TOKEN", class: "runtime-secret" },
    { name: "SPEC224_PROFILE_ID", class: "non-secret" },
  ],
  protectedOperations: ["external-agent dispatch", "approval continuation", "Runner dispatch", "receipt recovery"],
};

export const SPEC224_RECOVERY_RUNNER_PROFILE = createSpec224ExecutionProfile(RECOVERY_RUNNER_PROFILE_INPUT);

type ExecutionProfileInput = Omit<Spec224ExecutionProfile, "profileDigest">;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new Error(`SPEC224_EXECUTION_PROFILE_INVALID:${field}`);
}

export function createSpec224ExecutionProfile(input: ExecutionProfileInput): Spec224ExecutionProfile {
  assertNonEmpty(input.profileId, "profileId");
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(input.repository.sourceCommit)) {
    throw new Error("SPEC224_EXECUTION_PROFILE_INVALID:repository.sourceCommit");
  }
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(input.repository.gitTree)) {
    throw new Error("SPEC224_EXECUTION_PROFILE_INVALID:repository.gitTree");
  }
  assertNonEmpty(input.runtime.platform, "runtime.platform");
  assertNonEmpty(input.runtime.architecture, "runtime.architecture");
  if (input.version < 1 || !Number.isSafeInteger(input.version)) {
    throw new Error("SPEC224_EXECUTION_PROFILE_INVALID:version");
  }
  for (const key of ["node", "pnpm", "python", "rustc"] as const) {
    assertNonEmpty(input.runtime[key], `runtime.${key}`);
  }
  if (![...input.entrypoints.node, ...input.entrypoints.python, ...input.entrypoints.rust].length) {
    throw new Error("SPEC224_EXECUTION_PROFILE_INVALID:entrypoints");
  }
  if (input.dynamicImports.unresolvedBehavior !== "fail-closed") {
    throw new Error("SPEC224_EXECUTION_PROFILE_INVALID:dynamicImports.unresolvedBehavior");
  }
  const base = input;
  return {
    ...base,
    schemaVersion: "spec224.execution-profile.v1",
    profileDigest: sha256(canonicalJson(base)),
  };
}

export function verifySpec224ExecutionProfile(profile: Spec224ExecutionProfile): boolean {
  if (!profile || profile.schemaVersion !== "spec224.execution-profile.v1" || !/^[a-f0-9]{64}$/.test(profile.profileDigest)) {
    return false;
  }
  const { profileDigest, ...base } = profile;
  return sha256(canonicalJson(base)) === profileDigest;
}

export function serializeSpec224ExecutionProfile(profile: Spec224ExecutionProfile): string {
  if (!verifySpec224ExecutionProfile(profile)) throw new Error("SPEC224_EXECUTION_PROFILE_DIGEST_MISMATCH");
  return `${canonicalJson(profile)}\n`;
}
