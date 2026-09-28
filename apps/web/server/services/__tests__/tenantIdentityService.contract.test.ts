import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildTenantMoveTargetHash, TENANT_MOVE_CONFIRMATION } from "../tenantIdentityService";

const tenantTransferSource = readFileSync(new URL("../tenantDataTransfer.ts", import.meta.url), "utf8");
const tenantTransferRouterSource = readFileSync(new URL("../../routers/tenantDataTransfer.ts", import.meta.url), "utf8");

describe("Feature 189 tenant move command identity", () => {
  it("is stable for retries and changes when the target changes", () => {
    const input = { userId: 10, targetTenantId: "tenant-b", reason: "approved move", confirmation: TENANT_MOVE_CONFIRMATION };
    expect(buildTenantMoveTargetHash(input)).toBe(buildTenantMoveTargetHash({ ...input }));
    expect(buildTenantMoveTargetHash(input)).not.toBe(buildTenantMoveTargetHash({ ...input, targetTenantId: "tenant-c" }));
  });

  it("keeps transfer resume lifecycle ownership in Feature 186", () => {
    expect(tenantTransferSource).toContain("resumeReviewGatedJobInTransaction");
    expect(tenantTransferSource).not.toContain("const updated = await tx.update(workerJobs)");
  });

  it("creates the transfer operation through the Feature 186 canonical job port", () => {
    expect(tenantTransferSource).toContain("createCanonicalJobInTransaction");
    expect(tenantTransferSource).toContain("enforceCanonicalJobAdmissionInTransaction");
    expect(tenantTransferSource).toContain("admissionAlreadyChecked: true");
    expect(tenantTransferSource).toContain('expectedOperationStatus: "previewed"');
    expect(tenantTransferSource).not.toContain("tx.insert(workerJobs)");
  });

  it("keeps transfer routes fail-closed until the rollout flag is explicitly enabled", () => {
    expect(tenantTransferRouterSource).toContain("FEATURE_189_TRANSFER_ENABLED");
    expect(tenantTransferRouterSource).toContain('code: "PRECONDITION_FAILED"');
    expect(tenantTransferRouterSource).toContain("rateLimitedTransferDomainAdminProcedure");
    expect(tenantTransferRouterSource).toContain("transferDomainAdminProcedure");
  });
});
