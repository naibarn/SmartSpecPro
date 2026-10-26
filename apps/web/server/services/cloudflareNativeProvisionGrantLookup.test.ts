import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ getDb: () => ({}) }));
vi.mock("./appRuntimeConfig", () => ({ getAppRuntimeConfig: async () => ({ pythonBackendUrl: "https://approval.fixture.invalid", webGatewayToken: "fixture-service-only" }) }));
import { createCloudflareNativeProvisionRuntime } from "./cloudflareNativeProvisionExecutor";

describe("service grant lookup failures retain their actual classification", () => {
  it.each([429, 500, 503])("does not misreport HTTP %s as a missing or revoked grant", async status => {
    const fetchImpl = vi.fn(async () => Response.json({ error: "unavailable" }, { status }));
    await expect(createCloudflareNativeProvisionRuntime({ fetchImpl: fetchImpl as never }).resolveGrant("fixture"))
      .rejects.toThrow(`NATIVE_GRANT_LOOKUP_HTTP_${status}`);
    expect(fetchImpl).toHaveBeenCalledWith("https://approval.fixture.invalid/api/v1/approvals/internal/cloudflare-staging-grants/fixture",
      expect.objectContaining({ headers: { "x-internal-token": "fixture-service-only" }, redirect: "error", cache: "no-store" }));
  });
  it("keeps genuine inactive grants denied and returns only a successful grant envelope", async () => {
    for (const status of [401, 403, 404])
      expect(await createCloudflareNativeProvisionRuntime({ fetchImpl: async () => new Response(null, { status }) }).resolveGrant("fixture")).toBeNull();
    expect(await createCloudflareNativeProvisionRuntime({ fetchImpl: async () => Response.json({ grant: { id: "fixture" } }) }).resolveGrant("fixture"))
      .toEqual({ id: "fixture" });
  });
});
