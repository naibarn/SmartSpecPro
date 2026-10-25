import { describe, expect, it, vi } from "vitest";
import { verifyCloudflareIngressInBrowser } from "./cloudflareIngressAcceptance";
const input = {
  jobId: "11111111-1111-4111-8111-111111111111",
  requesterUserId: 17,
  tenantId: "tenant-a",
  receipt: {
    routeId: "a".repeat(32),
    deploymentId: "22222222-2222-4222-8222-222222222222",
    versionId: "33333333-3333-4333-8333-333333333333",
  },
};
const headers = {
  "content-type": "application/json",
  "x-smartaihub-ingress": "cloudflare-worker",
  "x-smartaihub-application-runtime": "linux-origin",
};
function fixture(
  options: {
    wrongUser?: boolean;
    unauthorized?: boolean;
    missingIdentity?: boolean;
  } = {}
) {
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url).startsWith("/")).toBe(true);
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    let value: any;
    if (url === "/health") value = { status: "ok" };
    else if (url === "/trpc/auth.me")
      value = {
        result: {
          data: {
            json: options.unauthorized
              ? null
              : {
                  id: options.wrongUser ? 18 : 17,
                  currentTenantId: "tenant-a",
                },
          },
        },
      };
    else if (url === "/trpc/users.getPreferences")
      value = { result: { data: { json: {} } } };
    else {
      expect(url).toBe(
        "/trpc/infrastructure.recordCloudflareProductionIngressAcceptance"
      );
      value = { result: { data: { json: { recorded: true } } } };
    }
    return new Response(JSON.stringify(value), {
      headers: options.missingIdentity
        ? { "content-type": "application/json" }
        : headers,
    });
  });
}
describe("Existing Owner browser ingress acceptance without session replay", () => {
  it("checks the real edge path/session and records an authenticated canonical observation", async () => {
    const fetcher = fixture();
    await expect(
      verifyCloudflareIngressInBrowser(input, fetcher)
    ).resolves.toEqual({ passed: true });
    const calls = fetcher.mock.calls;
    expect(calls).toHaveLength(4);
    expect(JSON.parse(String(calls[3][1]?.body))).toEqual({
      json: { jobId: input.jobId, receipt: input.receipt, passed: true },
    });
  });
  it.each([{ wrongUser: true }, { unauthorized: true }])(
    "reports failure for an incorrect or missing session %j",
    async options => {
      const fetcher = fixture(options);
      await expect(
        verifyCloudflareIngressInBrowser(input, fetcher)
      ).resolves.toEqual({ passed: false });
      expect(
        JSON.parse(String(fetcher.mock.calls.at(-1)?.[1]?.body)).json.passed
      ).toBe(false);
    }
  );
  it("does not accept a healthy Linux response without Worker serving identity", async () => {
    await expect(
      verifyCloudflareIngressInBrowser(
        input,
        fixture({ missingIdentity: true })
      )
    ).rejects.toThrow("INGRESS_LIVE_PATH_FAILED");
  });
});
