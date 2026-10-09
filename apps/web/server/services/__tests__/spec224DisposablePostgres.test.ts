import { afterEach, describe, expect, it } from "vitest";
import {
  assertSpec224DisposableDatabaseUrl,
  getSpec224DisposablePostgresTarget,
} from "./support/spec224DisposablePostgres";

const keys = [
  "SPEC224_TEST_RUN_ID",
  "SPEC224_TEST_PG_PORT",
  "SPEC224_TEST_PG_CONTAINER",
  "SPEC224_TEST_PG_NETWORK",
  "SPEC224_TEST_PGDATA",
  "SPEC224_TEST_PG_PROXY_PID",
  "SPEC224_TEST_DATABASE_IDENTITY",
] as const;
const saved = new Map(keys.map(key => [key, process.env[key]]));

function setSafeTarget(port = "55494") {
  const runId = "a1b2c3d4";
  process.env.SPEC224_TEST_RUN_ID = runId;
  process.env.SPEC224_TEST_PG_PORT = port;
  process.env.SPEC224_TEST_PG_CONTAINER = `codex-spec224-safe-pg-${runId}`;
  process.env.SPEC224_TEST_PG_NETWORK = `codex-spec224-safe-net-${runId}`;
  process.env.SPEC224_TEST_PGDATA = `/tmp/codex-spec224-safe-postgres-${runId}/pgdata`;
  process.env.SPEC224_TEST_PG_PROXY_PID = "1234";
  process.env.SPEC224_TEST_DATABASE_IDENTITY = `spec224-safe-${runId}|spec224_d385_test|spec224_d385_runtime|PostgreSQL 15.17`;
}

afterEach(() => {
  for (const key of keys) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("SPEC-224 disposable PostgreSQL target guard", () => {
  it("accepts only a task-scoped cluster identity and loopback port", () => {
    setSafeTarget();
    expect(getSpec224DisposablePostgresTarget()).toMatchObject({
      runId: "a1b2c3d4",
      port: 55494,
      containerName: "codex-spec224-safe-pg-a1b2c3d4",
    });
    expect(
      assertSpec224DisposableDatabaseUrl(
        "postgresql://spec224_d385_runtime@127.0.0.1:55494/spec224_d385_test"
      ).identity
    ).toContain("spec224-safe-a1b2c3d4");
  });

  it.each(["5432", "55493", "5433", "55400"])(
    "rejects shared, legacy or malformed target port %s",
    port => {
      setSafeTarget(port);
      expect(() => getSpec224DisposablePostgresTarget()).toThrow(
        "SPEC224_DISPOSABLE_POSTGRES_TARGET_INVALID"
      );
    }
  );

  it("rejects mismatched identity and non-loopback or cross-database URLs", () => {
    setSafeTarget();
    process.env.SPEC224_TEST_DATABASE_IDENTITY = "historical-container";
    expect(() => getSpec224DisposablePostgresTarget()).toThrow(
      "SPEC224_DISPOSABLE_POSTGRES_IDENTITY_INVALID"
    );
    setSafeTarget();
    for (const url of [
      "postgresql://spec224_d385_runtime@localhost:55494/spec224_d385_test",
      "postgresql://spec224_d385_runtime@127.0.0.1:5432/spec224_d385_test",
      "postgresql://postgres@127.0.0.1:55494/postgres",
    ]) {
      expect(() => assertSpec224DisposableDatabaseUrl(url)).toThrow(
        "SPEC224_TEST_DATABASE_URL_FORBIDDEN"
      );
    }
  });
});
