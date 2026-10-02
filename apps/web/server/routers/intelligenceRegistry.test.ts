import { describe, expect, it, vi } from "vitest";
import { createIntelligenceRegistryRouter } from "./intelligenceRegistry";

function setup(overrides: Record<string, unknown> = {}) {
  const service = {
    listPendingReviewSources: vi.fn(async (input: any) => [input.scope]),
    getPendingReviewSource: vi.fn(async (input: any) => ({ id: input.sourceId, tenantId: input.scope.tenantId })),
    admitPendingReviewSource: vi.fn(async (input: any) => ({ created: true, source: { id: input.source.id, tenantId: input.scope.tenantId, status: "pending_review" } })),
    listPendingReviewDatasets: vi.fn(async (input: any) => [input]),
    admitPendingReviewDataset: vi.fn(async (input: any) => ({ created: true, dataset: { id: input.dataset.id, tenantId: input.scope.tenantId, status: "disabled" } })),
    listEvidence: vi.fn(async (input: any) => [input]),
    ...overrides,
  };
  const caller = createIntelligenceRegistryRouter(service as any).createCaller({
    user: { id: 51, currentTenantId: "account-tenant" },
    tenantId: "branding-tenant",
    req: { ip: "127.0.0.1" },
  } as any);
  return { caller, service };
}

describe("intelligenceRegistry protected onboarding API", () => {
  it("exposes the researched candidate catalog to admins without activating candidates", async () => {
    const router = createIntelligenceRegistryRouter({} as any);
    const admin = router.createCaller({ user: { id: 1, role: "admin" } } as any);
    const candidates = await admin.listCandidateCatalog();
    expect(candidates.status).toBe("CANDIDATE_CATALOG_ONLY");
    expect(candidates.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "th-rid-river-levels", endpointEvidence: "UNVERIFIED", rightsStatus: "UNVERIFIED" }),
      expect.objectContaining({ sourceId: "th-tmd-weather-warnings", endpointEvidence: "UNVERIFIED", rightsStatus: "UNVERIFIED" }),
    ]));

    const tenantUser = router.createCaller({ user: { id: 2, role: "user", currentTenantId: "tenant-2" } } as any);
    await expect(tenantUser.listCandidateCatalog()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("derives tenant scope from authenticated account and only admits review states", async () => {
    const { caller, service } = setup();
    await caller.listPendingSources();
    await caller.submitSourceForReview({ source: { id: "source-1" }, tenantId: "attacker-tenant" } as any).catch(() => undefined);
    await caller.submitSourceForReview({ source: { id: "source-1" } });

    expect(service.listPendingReviewSources).toHaveBeenCalledWith({ scope: { tenantId: "account-tenant" } });
    expect(service.admitPendingReviewSource).toHaveBeenCalledWith({ scope: { tenantId: "account-tenant" }, source: { id: "source-1" } });
    expect("submitEvidenceForReview" in caller).toBe(false);
  });

  it("requires authentication and tenant scope", async () => {
    const router = createIntelligenceRegistryRouter({
      listPendingReviewSources: vi.fn(), getPendingReviewSource: vi.fn(), admitPendingReviewSource: vi.fn(),
      listPendingReviewDatasets: vi.fn(), admitPendingReviewDataset: vi.fn(), listEvidence: vi.fn(),
    } as any);
    const anonymous = router.createCaller({ user: null, tenantId: null } as any);
    await expect(anonymous.listPendingSources()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const noTenant = router.createCaller({ user: { id: 51, currentTenantId: null }, tenantId: null } as any);
    await expect(noTenant.listPendingSources()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates identifiers and maps persistence errors without disclosing internals", async () => {
    const { caller } = setup({ listPendingReviewSources: vi.fn(async () => { throw new Error("postgres password=secret"); }) });
    await expect(caller.getPendingSource({ sourceId: "bad id" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.listPendingSources()).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Registry service unavailable" });
  });
});
