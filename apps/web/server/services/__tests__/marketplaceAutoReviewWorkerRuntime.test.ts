import { describe, expect, it } from "vitest";

import { verifyBearerToken } from "../../_core/tokens";
import { createMarketplaceAutoReviewWorkerToken } from "../marketplaceAutoReviewWorkerRuntime";

describe("createMarketplaceAutoReviewWorkerToken", () => {
  it("uses the numeric web identity without the desktop-only userId claim", async () => {
    const token = createMarketplaceAutoReviewWorkerToken({
      userId: 42,
      tenantId: "tenant-1",
      runId: "run-1",
      jobId: "job-1",
    });

    const claims = await verifyBearerToken(token);
    expect(claims.sub).toBe("42");
    expect(claims.user_id).toBe(42);
    expect(claims).not.toHaveProperty("userId");
    expect(claims.tenantId).toBe("tenant-1");
    expect(claims.scopes).toEqual(["media:generate"]);
    expect(claims.type).toBe("access");
  });
});
