import { describe, expect, it } from "vitest";
import { mapResearchNeedToRequest } from "../decisionIntelligence/researchAdapter";
import { admitResearchRequest, assertResearchRequestAuthority, buildIntelligenceResearchJobDefinition, buildResearchRequestPersistenceSnapshot, hashResearchIdempotencyKey, IntelligenceResearchPersistenceError } from "./researchPersistence";

const need = { researchNeedId: "need-1", decisionProjectRef: "project-1", factorRef: "flood-risk", reason: "LOW_COVERAGE" as const, materiality: "high" as const, preferredMode: "EVIDENCE_ACQUISITION" as const, dataRequirement: { semanticType: "flood.depth", geography: { kind: "region", ref: "TH-10" }, temporal: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, maximumCostCredits: 12, required: true }, maxCostCredits: 80, maxExternalCost: 50, maxWallTimeSeconds: 500, maxSources: 40, policyRef: "policy-1" };
const authority = { authorizationScope: "TENANT" as const, tenantId: "tenant-1", requestedBy: "user-1", resolvedProjectId: "project-1", activePolicy: { ref: "policy-1", privacyClass: "tenant_private", maxCostCredits: 20, maxExternalCost: 10, maxWallTimeSeconds: 120, maxSources: 8 }, platformCeilings: { maxCostCredits: 15, maxExternalCost: 8, maxWallTimeSeconds: 90, maxSources: 5 } };
const serverAuthority = { authorizationScope: "TENANT" as const, tenantId: "tenant-1", requestedBy: "user-1", projectId: "project-1", consumerKind: "DECISION_ANALYSIS" as const, consumerRef: "need-1", privacyClass: "tenant_private", outputPolicyRef: "policy-1", maxCostCredits: 15, maxExternalCost: 8, maxWallTimeSeconds: 90, maxSources: 5, publicResearchAllowed: false };

describe("Spec 266 research persistence admission", () => {
  it("hashes idempotency keys without persisting the raw token and emits a reference-only canonical job", () => {
    const mapped = mapResearchNeedToRequest(need, authority);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const { request } = mapped.value;
    assertResearchRequestAuthority(request, serverAuthority);
    const hash = hashResearchIdempotencyKey(request.idempotencyKey);
    const job = buildIntelligenceResearchJobDefinition(request, hash);
    const persistenceSnapshot = buildResearchRequestPersistenceSnapshot(request, hash);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(job).toMatchObject({
      contractVersion: "spec266-research-v1",
      jobType: "intelligence.research.execute",
      tenantId: "tenant-1",
      executionClass: "long",
      input: { contractVersion: "spec266-research-v1", researchRequestId: request.researchRequestId },
    });
    expect(JSON.stringify(job.input)).not.toContain(request.idempotencyKey);
    expect(persistenceSnapshot).not.toHaveProperty("idempotencyKey");
    expect(persistenceSnapshot.idempotencyKeyHash).toBe(hash);
    expect(job.retryPolicy.deadlineMs).toBe(90_000);
  });

  it("does not dispatch public research through a worker that requires tenant identity", () => {
    const { tenantId: _tenantId, ...publicBase } = authority;
    const mapped = mapResearchNeedToRequest(need, {
      ...publicBase,
      authorizationScope: "PUBLIC",
      activePolicy: { ...authority.activePolicy, publicResearchAllowed: true },
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const { tenantId: _serverTenant, ...publicAuthorityBase } = serverAuthority;
    const publicServerAuthority = { ...publicAuthorityBase, authorizationScope: "PUBLIC" as const, publicResearchAllowed: true };
    assertResearchRequestAuthority(mapped.value.request, publicServerAuthority);
    expect(() => buildIntelligenceResearchJobDefinition(mapped.value.request, "a".repeat(64)))
      .toThrowError(IntelligenceResearchPersistenceError);
  });

  it("runs admission inside the provided database transaction and fails closed before creating a public job", async () => {
    const { tenantId: _tenantId, ...publicBase } = authority;
    const mapped = mapResearchNeedToRequest(need, {
      ...publicBase,
      authorizationScope: "PUBLIC",
      activePolicy: { ...authority.activePolicy, publicResearchAllowed: true },
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    let transactionUsed = false;
    let inserted: Record<string, unknown> | undefined;
    const query = {
      insert: () => ({
        values: (values: Record<string, unknown>) => ({
          onConflictDoNothing: () => ({ returning: async () => { inserted = values; return [{ id: values.id }]; } }),
        }),
      }),
    };
    await expect(admitResearchRequest({
      database: {
        transaction: async callback => {
          transactionUsed = true;
          return callback(query);
        },
      },
      request: mapped.value.request,
      authority: { ...serverAuthority, authorizationScope: "PUBLIC" as const, tenantId: undefined, publicResearchAllowed: true },
      runtimeAvailable: true,
    })).rejects.toMatchObject({ code: "RESEARCH_PUBLIC_ASYNC_UNSUPPORTED" });
    expect(transactionUsed).toBe(true);
    expect(inserted?.requestJson).not.toHaveProperty("idempotencyKey");
  });

  it("does not create an unusable durable job until the server binds the research runtime", async () => {
    const mapped = mapResearchNeedToRequest(need, authority);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    let insertAttempted = false;
    await expect(admitResearchRequest({
      database: {
        transaction: async callback => callback({ insert: () => { insertAttempted = true; throw new Error("unexpected insert"); } }),
      },
      request: mapped.value.request,
      authority: serverAuthority,
      runtimeAvailable: false,
    })).rejects.toMatchObject({ code: "RESEARCH_RUNTIME_NOT_CONFIGURED" });
    expect(insertAttempted).toBe(false);
  });

  it("rejects tenant or principal fields forged away from server authority before persistence", () => {
    const mapped = mapResearchNeedToRequest(need, authority);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(() => assertResearchRequestAuthority(mapped.value.request, { ...serverAuthority, tenantId: "other-tenant" }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
    expect(() => assertResearchRequestAuthority(mapped.value.request, { ...serverAuthority, requestedBy: "other-user" }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
    expect(() => assertResearchRequestAuthority(mapped.value.request, { ...serverAuthority, projectId: "another-project" }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
    expect(() => assertResearchRequestAuthority(mapped.value.request, { ...serverAuthority, authorizationScope: "PUBLIC", tenantId: undefined }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
    expect(() => assertResearchRequestAuthority(mapped.value.request, { ...serverAuthority, maxSources: 2 }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
    expect(() => assertResearchRequestAuthority({ ...mapped.value.request, preferredProviderIds: ["provider-a"] }, { ...serverAuthority, allowedProviderIds: ["another-provider"] }))
      .toThrowError(expect.objectContaining({ code: "RESEARCH_AUTHORITY_MISMATCH" }));
  });
});
