import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { nativeProvisionNamespace } from "./cloudflareNativeProvisionContract";
import { HTTP_IMAGE_BASES, HTTP_IMAGE_CONNECTOR, httpImageProvisionGrantSchema, httpImageProvisionPlanDigest, httpImageProvisionPlanSchema } from "./cloudflareHttpImageProvisionContract";

const sourceSha = "a".repeat(40);
const plan = { namespace: nativeProvisionNamespace("tenant-test", "project-test"), runtime: "node-http" as const, sourceSha,
  buildId: sourceSha + "-11111111-1111-4111-8111-111111111111", configurationExpiresAt: "2026-10-21T12:00:00.000Z",
  buildBudgetSeconds: 180 as const, maxImageBytes: 1073741824 as const, maxPublishedImages: 1 as const };

describe("canonical HTTP image operation contract", () => {
  it("agrees with the Python approval and fixed builder on digest and pinned bases", () => {
    const root = resolve(import.meta.dirname, "../../../..");
    const output = execFileSync("python3", ["-c", `import sys,json;sys.path.insert(0,'python-backend');sys.path.insert(0,'apps/web/scripts')
from app.services.cloudflare_http_image_provision_contract import validate_plan,plan_digest
from build_cloudflare_http_image import BASES,CONNECTOR
print(json.dumps({'digest':plan_digest(validate_plan(json.load(sys.stdin))),'bases':BASES,'connector':CONNECTOR}))`], {
      cwd: root, input: JSON.stringify(plan), encoding: "utf8", timeout: 5000,
    });
    expect(JSON.parse(output)).toEqual({ digest: httpImageProvisionPlanDigest(plan), bases: HTTP_IMAGE_BASES, connector: HTTP_IMAGE_CONNECTOR });
  });
  it.each([{ command: "arbitrary" }, { maxPublishedImages: 2 }, { buildBudgetSeconds: 181 }, { maxImageBytes: 2147483648 },
    { runtime: "arbitrary" }, { buildId: "b".repeat(40) + plan.buildId.slice(40) }])("does not authorize caller-selected recipe or budget expansion", change => {
    expect(httpImageProvisionPlanSchema.safeParse({ ...plan, ...change }).success).toBe(false);
  });
  it("binds the namespace to the exact owner tenant/project and denies production", () => {
    const grant = { schemaVersion: "cloudflare.staging-http-image-provision-grant.v1", grantRef: "22222222-2222-4222-8222-222222222222",
      tenantId: "tenant-test", projectId: "project-test", requesterUserId: 1, executorId: "cf-staging-executor:test",
      jobId: "33333333-3333-4333-8333-333333333333", accountRef: "b".repeat(32), targetId: "smartspec-cloudflare-staging", environment: "staging",
      actions: ["provision"], plan, planDigest: httpImageProvisionPlanDigest(plan), expiresAt: plan.configurationExpiresAt, revokedAt: null };
    expect(httpImageProvisionGrantSchema.safeParse(grant).success).toBe(true);
    for (const change of [{ tenantId: "foreign" }, { environment: "production" }, { actions: ["deploy"] }, { planDigest: "c".repeat(64) }]) {
      expect(httpImageProvisionGrantSchema.safeParse({ ...grant, ...change }).success).toBe(false);
    }
  });
});
