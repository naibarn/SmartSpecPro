import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runtime: { pythonBackendUrl: "http://python.test" },
  token: "internal-test-token",
}));

vi.mock("../appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn(async () => mocks.runtime),
  getPreferredInternalToken: vi.fn(async () => mocks.token),
}));

import { validateSpec224RecoveryGrant } from "../spec224RecoveryGrantValidator";

const request = {
  grantId: "grant-224-1",
  tenantId: "tenant-224",
  sourceCommit: "a".repeat(40),
  sourceSha256: "b".repeat(64),
  workpackageId: "WP-RECOVERY-04",
  operation: "protected_dispatch",
  path: "apps/web/server/services/externalAgentTaskExecutor.ts",
  runtimeScope: "node-control-plane",
  environmentScope: "isolated-non-production",
};

const contract = {
  schemaVersion: "spec224.recovery-grant-validation.v1",
  result: "REQUIRES_REMOTE_TRUST",
  valid: false,
  grantId: request.grantId,
  grantVersion: 1,
  scopeDigest: "c".repeat(64),
  validatedAt: "2026-09-30T00:00:00Z",
};

describe("Spec 224 Python recovery-grant validator adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("accepts only the versioned typed canonical response", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(contract), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(validateSpec224RecoveryGrant(request)).resolves.toMatchObject({
      result: "REQUIRES_REMOTE_TRUST",
      grantId: request.grantId,
    });
    expect(
      JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    ).toMatchObject({
      schemaVersion: "spec224.recovery-grant-validation.v1",
    });
    await validateSpec224RecoveryGrant(
      Object.assign({}, request, { schemaVersion: "v0" })
    );
    expect(
      JSON.parse(fetchMock.mock.calls[1][1]?.body as string).schemaVersion
    ).toBe("spec224.recovery-grant-validation.v1");
  });

  it.each([
    [
      "validator unavailable",
      async () => {
        throw new Error("offline");
      },
    ],
    ["malformed JSON", async () => new Response("not-json", { status: 200 })],
    [
      "wrong schema version",
      async () =>
        new Response(JSON.stringify({ ...contract, schemaVersion: "v0" }), {
          status: 200,
        }),
    ],
    [
      "forged grant identity",
      async () =>
        new Response(
          JSON.stringify({
            ...contract,
            result: "VALID",
            valid: true,
            grantId: "other",
          }),
          { status: 200 }
        ),
    ],
    [
      "unknown result",
      async () =>
        new Response(
          JSON.stringify({ ...contract, result: "ALLOWED", valid: true }),
          { status: 200 }
        ),
    ],
    [
      "unexpected response field",
      async () =>
        new Response(
          JSON.stringify({ ...contract, callerSaysGrantValid: true }),
          {
            status: 200,
          }
        ),
    ],
  ])("fails closed when %s", async (_label, responder) => {
    vi.stubGlobal("fetch", vi.fn(responder as never));
    await expect(validateSpec224RecoveryGrant(request)).resolves.toMatchObject({
      result: "UNKNOWN",
    });
  });

  it("fails closed when internal authorization is not configured", async () => {
    mocks.token = "";
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(validateSpec224RecoveryGrant(request)).resolves.toMatchObject({
      result: "UNKNOWN",
    });
    expect(fetch).not.toHaveBeenCalled();
    mocks.token = "internal-test-token";
  });
});
