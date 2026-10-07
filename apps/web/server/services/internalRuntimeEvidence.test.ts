import { describe, expect, it, vi } from "vitest";

const migration = { status: "OBSERVED", source: "drizzle.__drizzle_migrations", observedAt: "2026-10-07T12:00:00.000Z", value: { databaseIdentity: "db/public" } };
const credentialState = {
  profiles: { deployment: { configured: true } },
  runtime: { workerUrlConfigured: false, runtimeTokenConfigured: false },
};

vi.mock("./drizzleMigrationEvidence", () => ({ getDrizzleMigrationEvidence: vi.fn(async () => migration) }));
vi.mock("./runtimeHealthMonitor", () => ({ collectRuntimeHealthEvidence: vi.fn(() => ({ status: "OBSERVED", value: { readiness: "UNKNOWN" } })) }));
vi.mock("./applicationReadiness", () => ({ evaluateApplicationReadiness: vi.fn(async () => ({ status: "ready", checks: { db: "ok" }, observedAt: "2026-10-07T12:00:00.000Z", evidenceSource: "application_readiness_probe" })) }));
vi.mock("./cloudflareCredentialCenter", () => ({ getCloudflareCredentialCenterState: vi.fn(async () => credentialState) }));

import { getInternalRuntimeEvidence } from "./internalRuntimeEvidence";

describe("internal runtime evidence aggregation", () => {
  it("combines normalized internal sources without exposing provider secrets or claiming production verification", async () => {
    const result = await getInternalRuntimeEvidence({ db: {} as never, now: new Date("2026-10-07T12:00:00.000Z") });
    expect(result).toMatchObject({ scope: "INTERNAL_RUNTIME_ONLY", migration, runtime: { status: "OBSERVED", readiness: { status: "READY", evidenceSource: "application_readiness_probe" } },
      providerConfiguration: { cloudflareDeployment: { status: "CONFIGURED" } }, externalRuntimeVerification: "NOT_VERIFIED" });
    expect(JSON.stringify(result)).not.toContain("plaintext-provider-token");
    expect(JSON.stringify(result)).not.toContain("credential-value");
  });

  it("reports not configured when neither credential center nor runtime secret references are configured", async () => {
    credentialState.profiles.deployment.configured = false;
    await expect(getInternalRuntimeEvidence({ db: {} as never })).resolves.toMatchObject({
      providerConfiguration: { cloudflareDeployment: { status: "NOT_CONFIGURED" } },
    });
  });
});
