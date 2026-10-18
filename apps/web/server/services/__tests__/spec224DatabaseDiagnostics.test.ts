import { beforeEach, describe, expect, it, vi } from "vitest";

const migrationEvidenceMock = vi.hoisted(() => vi.fn());

vi.mock("../drizzleMigrationEvidence", () => ({
  getDrizzleMigrationEvidence: migrationEvidenceMock,
}));

import { getSpec224DatabaseDiagnostics } from "../spec224DatabaseDiagnostics";
import { getSpec224BackendRuntimeIdentity } from "../spec224BackendRuntimeIdentity";

const expectedHash = "a".repeat(64);

function mockDb(results: unknown[]) {
  const execute = vi.fn(async () => {
    const result = results.shift();
    if (result instanceof Error) throw result;
    return result;
  });
  return { execute } as any;
}

function migrationEvidence() {
  return {
    status: "OBSERVED",
    observedAt: "2026-10-18T00:00:00.000Z",
    value: {
      currentState: "PARTIALLY_APPLIED",
      expectedMigrations: [
        { tag: "0395_spec224_external_runtime_job_type", hash: expectedHash },
      ],
      appliedMigrations: [
        { tag: "0388_prior", hash: "b".repeat(64), appliedAt: 10 },
      ],
      pendingMigrations: [
        { tag: "0395_spec224_external_runtime_job_type", hash: expectedHash },
      ],
      observedAppliedHead: {
        tag: "0388_prior",
        hash: "b".repeat(64),
        appliedAt: 10,
      },
      executionReconciliation: { state: "PENDING" },
      latestExecution: { result: "APPLIED" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  migrationEvidenceMock.mockResolvedValue(migrationEvidence());
});

describe("getSpec224DatabaseDiagnostics", () => {
  it("returns allowlisted DB identity, migration, enum and failed-run correlation without secrets", async () => {
    const db = mockDb([
      [
        {
          database_name: "smartspec",
          schema_name: "public",
          effective_role: "app_reader",
          server_address: "10.0.0.2",
          server_port: 5432,
          cluster_name: "dev-db",
          server_version: "15.17",
        },
      ],
      [{ labels: ["local_llm_worker", "external_runtime"] }],
      [{ active_candidates: 0 }],
      [
        {
          trace_id: "trace-123",
          created_at: "2026-10-17T23:00:00.000Z",
          run_id: "run-123",
          error_code: "DB_ENUM_MISSING",
          backend_environment: "production",
          backend_revision: "0123456789abcdef0123456789abcdef01234567",
          backend_instance_id: "web-1",
        },
      ],
    ]);

    const result = await getSpec224DatabaseDiagnostics({
      db,
      env: {
        APP_ENV: "production",
        RELEASE: "0123456789abcdef0123456789abcdef01234567",
        SMARTSPEC_RUNTIME_ID: "web-2",
        DATABASE_URL: "postgres://secret-user:secret-password@example/db",
        CLOUDFLARE_API_TOKEN: "secret-token",
      },
      now: new Date("2026-10-18T00:00:00.000Z"),
    });

    expect(result.backend).toEqual({
      environment: "production",
      runtimeRevision: "0123456789abcdef0123456789abcdef01234567",
      instanceId: "web-2",
    });
    expect(result.database).toMatchObject({
      name: "smartspec",
      schema: "public",
      effectiveRole: "app_reader",
    });
    expect(result.database.instanceFingerprint).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
    expect(result.migrationLedger).toMatchObject({
      status: "OBSERVED",
      currentState: "PARTIALLY_APPLIED",
      target0395: "PENDING",
      pendingCount: 1,
      unknownAppliedCount: 0,
    });
    expect(result.workerRuntimeType).toEqual({
      exists: true,
      labels: ["local_llm_worker", "external_runtime"],
    });
    expect(result.migrationConcurrency).toEqual({
      status: "OBSERVED",
      activeCandidates: 0,
    });
    expect(result.runCreationErrorCorrelation).toMatchObject({
      traceId: "trace-123",
      runId: "run-123",
      backendInstanceId: "web-1",
      instanceCorrelation: "EXACT_INSTANCE",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /secret-password|secret-token|postgres:\/\//
    );
    expect(Object.keys(result).sort()).toEqual(
      [
        "backend",
        "database",
        "migrationConcurrency",
        "migrationLedger",
        "observedAt",
        "runCreationErrorCorrelation",
        "runCreationErrorCorrelationStatus",
        "workerRuntimeType",
      ].sort()
    );
  });

  it("marks historical failures without runtime metadata as trace-only", async () => {
    const db = mockDb([
      [
        {
          database_name: "smartspec",
          schema_name: "public",
          effective_role: "app_reader",
          server_address: null,
          server_port: null,
          cluster_name: null,
          server_version: "15.17",
        },
      ],
      [],
      [{ active_candidates: 0 }],
      [
        {
          trace_id: "trace-old",
          created_at: "2026-10-17T23:00:00.000Z",
          run_id: "run-old",
          error_code: "DB_ENUM_MISSING",
          backend_environment: null,
          backend_revision: null,
          backend_instance_id: null,
        },
      ],
    ]);
    const result = await getSpec224DatabaseDiagnostics({
      db,
      env: { NODE_ENV: "test" },
    });
    expect(result.runCreationErrorCorrelation).toMatchObject({
      traceId: "trace-old",
      instanceCorrelation: "TRACE_ONLY",
      backendInstanceId: null,
    });
  });

  it("tolerates a database without the audit table", async () => {
    const db = mockDb([
      [
        {
          database_name: "smartspec",
          schema_name: "public",
          effective_role: "app_reader",
          server_address: null,
          server_port: null,
          cluster_name: null,
          server_version: "15.17",
        },
      ],
      [],
      [{ active_candidates: 0 }],
      Object.assign(new Error("missing audit relation"), { code: "42P01" }),
    ]);
    const result = await getSpec224DatabaseDiagnostics({
      db,
      env: { NODE_ENV: "test" },
    });
    expect(result.runCreationErrorCorrelation).toBeNull();
    expect(result.runCreationErrorCorrelationStatus).toBe("TABLE_UNAVAILABLE");
    expect(result.workerRuntimeType).toEqual({ exists: false, labels: [] });
  });

  it("uses only allowlisted runtime variables and a process instance fallback", () => {
    expect(
      getSpec224BackendRuntimeIdentity({
        APP_ENV: "staging",
        RELEASE: "rev:42",
        SMARTSPEC_RUNTIME_ID: "executor-2",
        DATABASE_URL: "must-not-appear",
      })
    ).toEqual({
      environment: "staging",
      runtimeRevision: "rev:42",
      instanceId: "executor-2",
    });
    expect(
      getSpec224BackendRuntimeIdentity({
        NODE_ENV: "production",
        RELEASE: "bad value",
        SMARTSPEC_RUNTIME_ID: "bad id",
      })
    ).toMatchObject({
      environment: "production",
      runtimeRevision: null,
    });
  });
});
