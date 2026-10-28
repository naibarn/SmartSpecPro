import { describe, expect, it } from "vitest";
import { resolveApplicationDatabaseUrl } from "./devDatabaseTarget";

describe("development database selection", () => {
  const dev = "postgresql://smartspec_dev@localhost/smartspec_dev";
  const base = { NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development", DATABASE_URL: dev };

  it("defaults to the isolated development database", () => {
    expect(resolveApplicationDatabaseUrl(base)).toBe(dev);
  });

  it("fails closed when a development runtime has no matching environment marker", () => {
    expect(() => resolveApplicationDatabaseUrl({ NODE_ENV: "development", DATABASE_URL: "postgresql://smartspec@localhost/smartspec" }))
      .toThrow("DEVELOPMENT_ENVIRONMENT_MARKER_REQUIRED");
    expect(() => resolveApplicationDatabaseUrl({ NODE_ENV: "production", SMARTSPEC_ENVIRONMENT: "development", DATABASE_URL: "postgresql://smartspec@localhost/smartspec" }))
      .toThrow("DEVELOPMENT_ENVIRONMENT_MARKER_REQUIRED");
  });

  it("rejects the production database in the default development mode", () => {
    expect(() => resolveApplicationDatabaseUrl({ ...base, DATABASE_URL: "postgresql://smartspec@localhost/smartspec" }))
      .toThrow("DEVELOPMENT_MODE_REQUIRES_ISOLATED_DEV_DATABASE");
  });

  it("requires a development-scoped role as well as a development database name", () => {
    expect(() => resolveApplicationDatabaseUrl({ ...base, DATABASE_URL: "postgresql://smartspec@localhost/smartspec_dev" }))
      .toThrow("DEVELOPMENT_MODE_REQUIRES_ISOLATED_DEV_DATABASE");
  });

  it("accepts only loopback disposable test databases in the explicit test mode", () => {
    expect(resolveApplicationDatabaseUrl({ NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "disposable-test", DATABASE_URL: "postgresql://dev@127.0.0.1:5432/miniapp_full_runtime_test" }))
      .toBe("postgresql://dev@127.0.0.1:5432/miniapp_full_runtime_test");
    expect(() => resolveApplicationDatabaseUrl({ NODE_ENV: "development", SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "disposable-test", DATABASE_URL: "postgresql://smartspec@localhost/smartspec" }))
      .toThrow("DISPOSABLE_TEST_DATABASE_REQUIRED");
  });

  it("rejects the legacy unguarded shared-production selector", () => {
    expect(() => resolveApplicationDatabaseUrl({ ...base, SMARTSPEC_DEV_DATABASE_MODE: "shared-production",
      DATABASE_URL: "postgresql://smartspec@localhost/smartspec" })).toThrow("DEVELOPMENT_DATABASE_MODE_DENIED");
  });

  it("requires a separately configured production debug credential", () => {
    expect(() => resolveApplicationDatabaseUrl({ ...base, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly" }))
      .toThrow("PRODUCTION_DEBUG_READONLY_DATABASE_URL_REQUIRED");
  });

  it("accepts only the dedicated read-only production role and enforces read-only sessions", () => {
    const selected = resolveApplicationDatabaseUrl({ ...base, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec_debug_ro@localhost/smartspec" });
    const url = new URL(selected);
    expect(url.pathname).toBe("/smartspec");
    expect(url.searchParams.get("options")).toContain("default_transaction_read_only=on");
    expect(() => resolveApplicationDatabaseUrl({ ...base, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec@localhost/smartspec" }))
      .toThrow("PRODUCTION_DEBUG_REQUIRES_DEDICATED_READONLY_ROLE");
  });

  it("does not permit production app instances to change targets through the dev selector", () => {
    expect(resolveApplicationDatabaseUrl({ NODE_ENV: "production", SMARTSPEC_ENVIRONMENT: "production",
      SMARTSPEC_DEV_DATABASE_MODE: "production-readonly", DATABASE_URL: "postgresql://runtime@db/app",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec_debug_ro@localhost/smartspec" }))
      .toBe("postgresql://runtime@db/app");
  });
});
