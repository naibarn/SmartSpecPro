import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWithCredential } = vi.hoisted(() => ({ mockWithCredential: vi.fn() }));
vi.mock("./cloudflareCredentialCenter", () => ({ withCloudflareCredential: mockWithCredential }));
import { getCloudflareContainerInstanceEvidence, getCloudflareWorkerDeploymentEvidence } from "./cloudflareRuntimeEvidence";

describe("Cloudflare runtime evidence adapters", () => {
  beforeEach(() => mockWithCredential.mockReset());

  it("reports missing encrypted provider configuration without claiming health", async () => {
    mockWithCredential.mockResolvedValue({ configured: false });
    await expect(getCloudflareWorkerDeploymentEvidence({ db: {} as never, accountId: "acct", scriptName: "worker" })).resolves.toMatchObject({ status: "NOT_CONFIGURED", value: null });
  });

  it("normalizes Worker deployment versions from authenticated provider output", async () => {
    mockWithCredential.mockImplementation(async (...args: unknown[]) => {
      const operation = args.find(value => typeof value === "function") as (token: string) => Promise<unknown>;
      if (!operation) return { configured: false };
      return { configured: true, value: await operation("secret-token") };
    });
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret-token");
      return new Response(JSON.stringify({ success: true, result: { deployments: [{ id: "deployment-1", created_on: "2026-10-07T10:00:00Z", versions: [{ version_id: "version-1", percentage: 100 }] }] } }), { status: 200 });
    });
    const result = await getCloudflareWorkerDeploymentEvidence({ db: {} as never, accountId: "acct", scriptName: "worker", fetchImpl });
    expect(result).toMatchObject({ status: "OBSERVED", value: { deploymentId: "deployment-1", versions: [{ versionId: "version-1", percentage: 100 }] } });
  });

  it("maps denied access and preserves unavailable Container instance fields as null", async () => {
    mockWithCredential.mockImplementation(async (...args: unknown[]) => {
      const operation = args.find(value => typeof value === "function") as (token: string) => Promise<unknown>;
      if (!operation) return { configured: false };
      return { configured: true, value: await operation("token") };
    });
    const denied = await getCloudflareWorkerDeploymentEvidence({ db: {} as never, accountId: "acct", scriptName: "worker", fetchImpl: async () => new Response("{}", { status: 403 }) });
    expect(denied.status).toBe("PERMISSION_DENIED");
    const container = await getCloudflareContainerInstanceEvidence({ db: {} as never, accountId: "acct", applicationId: "app", fetchImpl: async () => new Response(JSON.stringify({ success: true, result: [{ id: "instance-1" }] }), { status: 200 }) });
    expect(container).toMatchObject({ status: "OBSERVED", value: { instances: [{ id: "instance-1", image: null, status: null, state: null, updatedAt: null }] } });
  });
});
