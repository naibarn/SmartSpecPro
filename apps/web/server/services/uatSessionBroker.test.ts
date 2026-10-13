import { describe, expect, it } from "vitest";
import { assertUatBrokerEnvironment } from "./uatSessionBroker";

const localDev = {
  nodeEnv: "development",
  enabled: "true",
  databaseUrl: "postgresql://dev:ignored@127.0.0.1:5432/smartspec",
};

describe("Codex UAT session broker guard", () => {
  it("allows only explicitly enabled local development databases", () => {
    expect(() => assertUatBrokerEnvironment(localDev)).not.toThrow();
  });

  it("cannot be enabled in production", () => {
    expect(() => assertUatBrokerEnvironment({ ...localDev, nodeEnv: "production" }))
      .toThrow("UAT_BROKER_DISABLED_IN_PRODUCTION");
  });

  it("rejects an untrusted remote database", () => {
    expect(() => assertUatBrokerEnvironment({
      ...localDev,
      databaseUrl: "postgresql://dev:ignored@db.example.invalid:5432/smartspec",
    })).toThrow("UAT_BROKER_LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  });

  it("rejects missing opt-in and non-development database names", () => {
    expect(() => assertUatBrokerEnvironment({ ...localDev, enabled: undefined }))
      .toThrow("UAT_BROKER_NOT_ENABLED");
    expect(() => assertUatBrokerEnvironment({
      ...localDev,
      databaseUrl: "postgresql://dev:ignored@localhost:5432/customer_data",
    })).toThrow("UAT_BROKER_LOCAL_DEVELOPMENT_DATABASE_REQUIRED");
  });
});
