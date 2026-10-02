import { describe, expect, it } from "vitest";
import { verifyBearerToken } from "../../_core/tokens";
import { createVerticalDramaMediaUserToken } from "../verticalDramaMediaUserToken";

describe("createVerticalDramaMediaUserToken", () => {
  it("mints a fresh scoped token instead of reusing an expired request token", async () => {
    const token = createVerticalDramaMediaUserToken({
      userId: 24,
      tenantId: "tenant-1",
      requestToken: "expired-browser-token",
    });

    expect(token).not.toBe("expired-browser-token");
    const claims = await verifyBearerToken(token);
    expect(claims.sub).toBe("24");
    expect(claims.tenantId).toBe("tenant-1");
    expect(claims.scopes).toEqual(["media:generate"]);
    expect(claims.type).toBe("access");
  });
});
