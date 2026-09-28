import { describe, expect, it, vi } from "vitest";

const { checkAndIncrementQuota } = vi.hoisted(() => ({
  checkAndIncrementQuota: vi.fn(),
}));
vi.mock("../../services/apiKeyQuotaService", () => ({
  checkAndIncrementQuota,
}));

import { quotaMiddleware } from "../quotaMiddleware";

describe("quotaMiddleware PostgreSQL failure behavior", () => {
  it("fails closed with 503 when quota storage fails", async () => {
    checkAndIncrementQuota.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    const next = vi.fn();
    const response = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await quotaMiddleware()(
      { auth: { mode: "api_key", apiKeyId: "key", tenantId: "tenant" } } as any,
      response as any,
      next
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
