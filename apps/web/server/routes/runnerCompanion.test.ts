import { describe, expect, it } from "vitest";
import { hashJti } from "../_core/revocation";
import { isValidRunnerCompanionBinding } from "./runnerCompanion";
import { RUNNER_COMPANION_CLIENT_ID } from "../_core/deviceAuthRoutes";

const deviceId = "companion-installation-test";

function auth(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    mode: "bearer" as const,
    sub: "user-open-id",
    scopes: ["runner:companion:read"],
    tenantId: "tenant-a",
    userId: 42,
    tokenUse: "desktop_session",
    clientId: RUNNER_COMPANION_CLIENT_ID,
    audience: RUNNER_COMPANION_CLIENT_ID,
    sessionId: "session-a",
    deviceIdHash: hashJti(deviceId),
    ...overrides,
  };
}

describe("runner companion transport binding", () => {
  it("accepts only the exact user, tenant, session, device and read scope binding", () => {
    expect(isValidRunnerCompanionBinding(auth(), deviceId)).toBe(true);
  });

  it("accepts the bounded read plus canonical Chat scope", () => {
    expect(
      isValidRunnerCompanionBinding(
        auth({ scopes: ["runner:companion:read", "llm:chat"] }),
        deviceId,
      ),
    ).toBe(true);
  });

  it.each([
    ["wrong device", "other-installation", {}],
    ["wrong audience", deviceId, { audience: "other-client" }],
    ["runner control token", deviceId, { tokenUse: "runner_control" }],
    [
      "extra scope",
      deviceId,
      { scopes: ["runner:companion:read", "mcp:write"] },
    ],
    ["missing tenant", deviceId, { tenantId: "" }],
    ["missing session", deviceId, { sessionId: "" }],
  ])("rejects %s", (_label, presentedDevice, overrides) => {
    expect(
      isValidRunnerCompanionBinding(auth(overrides), presentedDevice)
    ).toBe(false);
  });
});
