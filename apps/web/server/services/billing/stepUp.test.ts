import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";
import type { Request } from "express";

vi.mock("./runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn(async () => ({
    BILLING_PHASE2_REQUIRE_STEP_UP: true,
    BILLING_PHASE2_STEP_UP_SECRET: "step-up-secret",
  })),
}));

import { assertBillingStepUpIfRequired } from "./stepUp";

function buildRequest(headers: Record<string, string>): Request {
  return { headers } as unknown as Request;
}

describe("billing step-up", () => {
  it("accepts a signed step-up proof when a secret is configured", async () => {
    const expiresAt = String(Date.now() + 5 * 60 * 1000);
    const material = `42:enable_auto_renew:${expiresAt}`;
    const sig = crypto.createHmac("sha256", "step-up-secret").update(material).digest("hex");

    await expect(assertBillingStepUpIfRequired({
      req: buildRequest({
        "x-billing-step-up-user": "42",
        "x-billing-step-up-action": "enable_auto_renew",
        "x-billing-step-up-exp": expiresAt,
        "x-billing-step-up-sig": sig,
      }),
      action: "enable_auto_renew",
      actorUserId: 42,
    })).resolves.toBeUndefined();
  });

  it("rejects when no valid recent or signed proof is present", async () => {
    await expect(assertBillingStepUpIfRequired({
      req: buildRequest({}),
      action: "enable_auto_renew",
      actorUserId: 42,
    })).rejects.toThrow(/Recent step-up authentication required/i);
  });
});
