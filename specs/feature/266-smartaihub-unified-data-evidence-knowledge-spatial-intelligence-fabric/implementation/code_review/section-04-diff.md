diff --git a/apps/web/server/services/decisionIntelligence/evidencePlan.test.ts b/apps/web/server/services/decisionIntelligence/evidencePlan.test.ts
index 1eda2b201..9d425c715 100644
--- a/apps/web/server/services/decisionIntelligence/evidencePlan.test.ts
+++ b/apps/web/server/services/decisionIntelligence/evidencePlan.test.ts
@@ -8,7 +8,7 @@ const offer = {
     contractVersion: "spec266-source-health-v1" as const, sourceId: "source-1", datasetId: "dataset-1", offerId: "offer-1",
     assessedAt: "2026-10-01T00:50:00.000Z", validUntil: "2026-10-01T01:05:00.000Z",
     dimensions: { connectivity: "healthy" as const, schema: "healthy" as const, semantic: "healthy" as const, freshness: "healthy" as const, rights: "healthy" as const, placement: "healthy" as const, index: "healthy" as const },
-  }, rights: { status: "granted" as const, commercialUse: true, redistributable: true },
+  }, rights: { status: "granted" as const, commercialUse: true, redistributable: true, contentHydrationAllowed: false, policyVersion: "rights-r1" }, healthPolicyVersion: "rights-r1",
   acl: { allowed: true, authorizationScope: "PUBLIC" as const }, estimatedCost: { kind: "known" as const, credits: 3 },
   estimatedLatencyMs: 100, qualityScore: 0.8, placement: "cloudflare", mode: "query" as const,
 };
@@ -20,7 +20,7 @@ const requirement: PlannedRequirement = {

 describe("buildEvidencePlan", () => {
   it("binds eligible offers by reference and reports explicit missing requirements", () => {
-    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", maxCostCredits: 5 });
+    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1", maxCostCredits: 5 });
     expect(plan.bindings).toEqual([{ requirementId: "river-depth", offerId: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1" }]);
     expect(plan.missing).toEqual([]);
     expect(plan.estimatedCostCredits).toBe(3);
@@ -28,7 +28,7 @@ describe("buildEvidencePlan", () => {
   });

   it("keeps unknown-cost candidates visible but does not admit them into an automatic plan", () => {
-    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "unknown" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC" });
+    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "unknown" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
     expect(plan.bindings).toEqual([]);
     expect(plan.missing[0]).toMatchObject({ requirementId: "river-depth", code: "COST_REVIEW_REQUIRED", candidateOfferIds: ["offer-1"] });
     expect(plan.estimatedCostCredits).toBe(0);
@@ -36,31 +36,31 @@ describe("buildEvidencePlan", () => {
   });

   it("treats a cost above the caller's authorized budget as a missing gap", () => {
-    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "known", credits: 6 } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", maxCostCredits: 5 });
+    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "known", credits: 6 } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1", maxCostCredits: 5 });
     expect(plan.bindings).toEqual([]);
     expect(plan.missing[0]?.code).toBe("COST_LIMIT_EXCEEDED");
     expect(plan.estimatedCostCredits).toBe(0);
   });

   it("requires an explicit budget before admitting a paid offer", () => {
-    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC" });
+    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
     expect(plan.bindings).toEqual([]);
     expect(plan.missing[0]).toMatchObject({ code: "COST_REVIEW_REQUIRED", candidateOfferIds: ["offer-1"] });
     expect(plan.readiness).toBe("blocked");
-    const free = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "zero" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC" });
+    const free = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "zero" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
     expect(free.readiness).toBe("ready");
   });

   it("rejects duplicate requirement ids and does not imply public scope", () => {
-    expect(() => buildEvidencePlan({ requirements: [requirement, requirement], offers: [offer], now: new Date(), authorizationScope: "PUBLIC" })).toThrow("EVIDENCE_PLAN_INVALID");
-    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z") });
+    expect(() => buildEvidencePlan({ requirements: [requirement, requirement], offers: [offer], now: new Date(), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" })).toThrow("EVIDENCE_PLAN_INVALID");
+    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), currentPolicyVersion: "rights-r1" });
     expect(plan.missing[0]?.code).toBe("AUTHORIZATION_SCOPE_REQUIRED");
   });

   it("rejects malformed DataRequirement content even when called outside ResearchRequest parsing", () => {
     expect(() => buildEvidencePlan({
       requirements: [{ ...requirement, requirement: { semanticType: "flood.depth", minimumCoverage: -0.2 } }],
-      offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC",
+      offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1",
     })).toThrow("DATA_REQUIREMENT_INVALID");
   });
 });
diff --git a/apps/web/server/services/decisionIntelligence/evidencePlan.ts b/apps/web/server/services/decisionIntelligence/evidencePlan.ts
index e1b2b6c51..2f9d3a454 100644
--- a/apps/web/server/services/decisionIntelligence/evidencePlan.ts
+++ b/apps/web/server/services/decisionIntelligence/evidencePlan.ts
@@ -13,6 +13,8 @@ export interface EvidencePlanInput {
   readonly now: Date;
   readonly authorizationScope?: "PUBLIC" | "TENANT";
   readonly tenantId?: string;
+  /** Server-resolved policy revision used to reauthorize every planned offer. */
+  readonly currentPolicyVersion: string;
   readonly maxCostCredits?: number;
   readonly allowedPlacements?: readonly string[];
 }
@@ -31,6 +33,7 @@ export interface EvidencePlan {

 function validate(input: EvidencePlanInput): void {
   if (input.requirements.length > 100 || input.offers.length > 2_000 ||
+    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(input.currentPolicyVersion) ||
     (input.maxCostCredits !== undefined && (!Number.isFinite(input.maxCostCredits) || input.maxCostCredits < 0))) {
     throw new Error("EVIDENCE_PLAN_INVALID");
   }
@@ -61,6 +64,7 @@ export function buildEvidencePlan(input: EvidencePlanInput): EvidencePlan {
       authorizationScope: input.authorizationScope,
       tenantId: input.tenantId,
       allowedPlacements: input.allowedPlacements,
+      currentPolicyVersion: input.currentPolicyVersion,
     });
     const pricedEligible = resolution.eligible.filter(offer => offer.estimatedCost.kind !== "unknown");
     const affordable = pricedEligible.find(offer => {
diff --git a/apps/web/server/services/intelligenceFabric/resolver.test.ts b/apps/web/server/services/intelligenceFabric/resolver.test.ts
index 084580dc0..aa017aa04 100644
--- a/apps/web/server/services/intelligenceFabric/resolver.test.ts
+++ b/apps/web/server/services/intelligenceFabric/resolver.test.ts
@@ -1,5 +1,12 @@
 import { describe, expect, it } from "vitest";
-import { resolveDataRequirement, type DataOffer, type DataRequirement } from "./resolver";
+import {
+  authorizeRetrievalProjection,
+  evaluateRetrievalCache,
+  resolveDataRequirement,
+  validateConnectorUrl,
+  type DataOffer,
+  type DataRequirement,
+} from "./resolver";

 const requirement: DataRequirement = {
   semanticType: "flood.depth",
@@ -17,7 +24,9 @@ function offer(overrides: Partial<DataOffer> = {}): DataOffer {
     geographyRefs: ["TH-10"],
     temporalCoverage: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
     freshness: { observedAt: "2026-09-30T00:00:00.000Z", staleAfterSeconds: 172800 },
-    rights: { status: "granted", commercialUse: true, redistributable: true },
+    evidence: { revision: 3, contentHash: "a".repeat(64) },
+    rights: { status: "granted", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r1", validUntil: "2026-10-01T00:10:00.000Z", retentionUntil: "2026-10-01T00:20:00.000Z" },
+    healthPolicyVersion: "rights-r1",
     acl: { allowed: true, authorizationScope: "PUBLIC" },
     estimatedCost: { kind: "known", credits: 0 },
     estimatedLatencyMs: 200,
@@ -28,6 +37,8 @@ function offer(overrides: Partial<DataOffer> = {}): DataOffer {
   };
   return {
     ...base,
+    rights: { ...base.rights, ...overrides.rights },
+    evidence: Object.prototype.hasOwnProperty.call(overrides, "evidence") ? overrides.evidence : base.evidence,
     sourceHealth: overrides.sourceHealth ?? {
       contractVersion: "spec266-source-health-v1",
       sourceId: base.sourceRef,
@@ -40,13 +51,23 @@ function offer(overrides: Partial<DataOffer> = {}): DataOffer {
   };
 }

+function options(overrides: Partial<Parameters<typeof resolveDataRequirement>[2]> = {}) {
+  return {
+    now: new Date("2026-10-01T00:00:00.000Z"),
+    authorizationScope: "PUBLIC" as const,
+    currentPolicyVersion: "rights-r1",
+    currentIndexGeneration: "generation-1",
+    ...overrides,
+  };
+}
+
 describe("resolveDataRequirement", () => {
   it("selects eligible offers by quality then known cost while keeping unknown cost distinct", () => {
     const result = resolveDataRequirement(requirement, [
       offer({ id: "unknown-cost", estimatedCost: { kind: "unknown" }, qualityScore: 0.8 }),
       offer({ id: "cheap", estimatedCost: { kind: "known", credits: 1 }, qualityScore: 0.8 }),
       offer({ id: "free", estimatedCost: { kind: "known", credits: 0 }, qualityScore: 0.8 }),
-    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });
+    ], options());

     expect(result.selected?.id).toBe("free");
     expect(result.eligible.map(item => item.id)).toEqual(["free", "cheap", "unknown-cost"]);
@@ -56,7 +77,7 @@ describe("resolveDataRequirement", () => {
   it("fails closed for ACL, rights, geography, semantics, stale and unhealthy offers", () => {
     const offers = [
       offer({ id: "acl", acl: { allowed: false, authorizationScope: "PUBLIC" } }),
-      offer({ id: "rights", rights: { status: "unknown", commercialUse: true, redistributable: true } }),
+      offer({ id: "rights", rights: { status: "unknown", commercialUse: true, redistributable: true, contentHydrationAllowed: false, policyVersion: "rights-r1" } }),
       offer({ id: "geo", geographyRefs: ["TH-11"] }),
       offer({ id: "semantic", semanticTypes: ["rainfall.total"] }),
       offer({ id: "stale", freshness: { observedAt: "2026-01-01T00:00:00.000Z", staleAfterSeconds: 60 } }),
@@ -68,9 +89,7 @@ describe("resolveDataRequirement", () => {
       } }),
     ];

-    const result = resolveDataRequirement(requirement, offers, {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    });
+    const result = resolveDataRequirement(requirement, offers, options());
     expect(result.satisfied).toBe(false);
     expect(result.selected).toBeUndefined();
     expect(result.unsatisfiedReason).toBe("NO_ELIGIBLE_OFFER");
@@ -80,33 +99,23 @@ describe("resolveDataRequirement", () => {
   });

   it("does not treat an omitted tenant as public authorization", () => {
-    const result = resolveDataRequirement(requirement, [offer()], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: undefined,
-    });
+    const result = resolveDataRequirement(requirement, [offer()], options({ authorizationScope: undefined }));
     expect(result.satisfied).toBe(false);
     expect(result.rejections[0]?.code).toBe("AUTHORIZATION_SCOPE_REQUIRED");
   });

   it("accepts only the matching tenant-owned offer and rejects another tenant's offer", () => {
     const tenantOffer = offer({ acl: { allowed: true, authorizationScope: "TENANT", tenantId: "tenant-a" } });
-    const own = resolveDataRequirement(requirement, [tenantOffer], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "TENANT", tenantId: "tenant-a",
-    });
-    const other = resolveDataRequirement(requirement, [tenantOffer], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "TENANT", tenantId: "tenant-b",
-    });
+    const own = resolveDataRequirement(requirement, [tenantOffer], options({ authorizationScope: "TENANT", tenantId: "tenant-a" }));
+    const other = resolveDataRequirement(requirement, [tenantOffer], options({ authorizationScope: "TENANT", tenantId: "tenant-b" }));

     expect(own).toMatchObject({ satisfied: true, selected: { id: "offer-1" } });
     expect(other).toMatchObject({ satisfied: false, rejections: [{ code: "AUTHORIZATION_SCOPE_MISMATCH" }] });
   });

   it("applies rights changes from the current offer snapshot and fails closed after revocation", () => {
-    const revoked = resolveDataRequirement(requirement, [offer({ rights: { status: "forbidden", commercialUse: true, redistributable: true } })], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    });
-    const unverified = resolveDataRequirement(requirement, [offer({ rights: { status: "unknown", commercialUse: true, redistributable: true } })], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    });
+    const revoked = resolveDataRequirement(requirement, [offer({ rights: { status: "forbidden", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r1" } })], options());
+    const unverified = resolveDataRequirement(requirement, [offer({ rights: { status: "unknown", commercialUse: true, redistributable: true, contentHydrationAllowed: false, policyVersion: "rights-r1" } })], options());

     expect(revoked).toMatchObject({ satisfied: false, rejections: [{ code: "RIGHTS_FORBIDDEN" }] });
     expect(unverified).toMatchObject({ satisfied: false, rejections: [{ code: "RIGHTS_UNVERIFIED" }] });
@@ -114,9 +123,9 @@ describe("resolveDataRequirement", () => {

   it("honors explicit commercial, redistribution and budget requirements", () => {
     const result = resolveDataRequirement({ ...requirement, commercialUseRequired: true, redistributableRequired: true, maximumCostCredits: 2 }, [
-      offer({ id: "noncommercial", rights: { status: "granted", commercialUse: false, redistributable: true } }),
+      offer({ id: "noncommercial", rights: { status: "granted", commercialUse: false, redistributable: true, contentHydrationAllowed: false, policyVersion: "rights-r1" } }),
       offer({ id: "over-budget", estimatedCost: { kind: "known", credits: 3 } }),
-    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });
+    ], options());
     expect(result.satisfied).toBe(false);
     expect(result.rejections.map(item => item.code)).toEqual(expect.arrayContaining(["COMMERCIAL_USE_FORBIDDEN", "COST_LIMIT_EXCEEDED"]));
   });
@@ -126,7 +135,7 @@ describe("resolveDataRequirement", () => {
       offer({ id: "negative-cost", estimatedCost: { kind: "known", credits: -1 } }),
       offer({ id: "bad-quality", qualityScore: Number.POSITIVE_INFINITY }),
       offer({ id: "disallowed-placement", placement: "origin-only" }),
-    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC", allowedPlacements: ["cloudflare"] });
+    ], options({ allowedPlacements: ["cloudflare"] }));
     expect(result.eligible).toEqual([]);
     expect(result.rejections.map(item => item.code)).toEqual(expect.arrayContaining(["OFFER_INVALID", "PLACEMENT_UNAVAILABLE"]));
   });
@@ -135,7 +144,7 @@ describe("resolveDataRequirement", () => {
     const result = resolveDataRequirement({ semanticType: "flood.depth" }, [
       offer({ temporalCoverage: { from: "2026-10-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }),
       offer({ id: "noncanonical", temporalCoverage: { from: "2026-09-01", to: "2026-10-01T00:00:00.000Z" } }),
-    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });
+    ], options());
     expect(result.eligible).toEqual([]);
     expect(result.rejections).toEqual([{ offerId: "offer-1", code: "OFFER_INVALID" }, { offerId: "noncanonical", code: "OFFER_INVALID" }]);
   });
@@ -147,32 +156,24 @@ describe("resolveDataRequirement", () => {
       dimensions: { connectivity: "healthy", schema: "healthy", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "degraded" },
     } });
     const discovery = offer({ mode: "discovery", sourceHealth: { ...query.sourceHealth, offerId: "discovery-offer" }, id: "discovery-offer" });
-    const queryResult = resolveDataRequirement(requirement, [query], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
-    const discoveryResult = resolveDataRequirement(requirement, [discovery], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
+    const queryResult = resolveDataRequirement(requirement, [query], options({ now: new Date("2026-10-01T00:01:00.000Z") }));
+    const discoveryResult = resolveDataRequirement(requirement, [discovery], options({ now: new Date("2026-10-01T00:01:00.000Z") }));
     expect(queryResult.eligible.map(item => item.id)).toEqual(["offer-1"]);
     expect(discoveryResult.rejections).toEqual([{ offerId: "discovery-offer", code: "SOURCE_INDEX_UNHEALTHY" }]);
   });

   it("reports malformed health separately from generic offer shape errors", () => {
     const missingHealth = { ...offer(), sourceHealth: undefined } as never;
-    const result = resolveDataRequirement(requirement, [missingHealth], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    });
+    const result = resolveDataRequirement(requirement, [missingHealth], options());
     expect(result.rejections).toEqual([{ offerId: "offer-1", code: "SOURCE_HEALTH_UNVERIFIED" }]);
   });

   it("rejects malformed or sparse DataRequirement values at the resolver boundary", () => {
-    expect(() => resolveDataRequirement({ ...requirement, minimumCoverage: 1.1 }, [offer()], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    })).toThrow("DATA_REQUIREMENT_INVALID");
-    expect(() => resolveDataRequirement({ ...requirement, temporal: { from: "2026-10-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }, [offer()], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    })).toThrow("DATA_REQUIREMENT_INVALID");
+    expect(() => resolveDataRequirement({ ...requirement, minimumCoverage: 1.1 }, [offer()], options())).toThrow("DATA_REQUIREMENT_INVALID");
+    expect(() => resolveDataRequirement({ ...requirement, temporal: { from: "2026-10-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }, [offer()], options())).toThrow("DATA_REQUIREMENT_INVALID");
     const sparseFields = new Array(2);
     sparseFields[0] = "depth";
-    expect(() => resolveDataRequirement({ ...requirement, requiredFields: sparseFields }, [], {
-      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
-    })).toThrow("DATA_REQUIREMENT_INVALID");
+    expect(() => resolveDataRequirement({ ...requirement, requiredFields: sparseFields }, [], options())).toThrow("DATA_REQUIREMENT_INVALID");
   });

   it("quarantines only the offer whose source health assessment reports schema drift", () => {
@@ -182,8 +183,74 @@ describe("resolveDataRequirement", () => {
       dimensions: { connectivity: "healthy", schema: "degraded", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "healthy" },
     } });
     const healthy = offer({ id: "unrelated-dataset", datasetRef: "unrelated-dataset" });
-    const result = resolveDataRequirement(requirement, [drifted, healthy], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
+    const result = resolveDataRequirement(requirement, [drifted, healthy], options({ now: new Date("2026-10-01T00:01:00.000Z") }));
     expect(result.eligible.map(item => item.id)).toEqual(["unrelated-dataset"]);
     expect(result.rejections).toEqual([{ offerId: "dataset-drifted", code: "SOURCE_SCHEMA_DRIFT" }]);
   });
+
+  it("requires an exact current policy version before ranking an offer", () => {
+    const mismatched = resolveDataRequirement(requirement, [offer({ healthPolicyVersion: "rights-r0" })], options());
+    const staleRights = resolveDataRequirement(requirement, [offer({ rights: { status: "granted", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r0" } })], options());
+    expect(mismatched.rejections).toEqual([{ offerId: "offer-1", code: "POLICY_VERSION_MISMATCH" }]);
+    expect(staleRights.rejections).toEqual([{ offerId: "offer-1", code: "POLICY_VERSION_MISMATCH" }]);
+    const expiredRights = resolveDataRequirement(requirement, [offer({ rights: { ...offer().rights, validUntil: "2026-09-30T23:59:59.000Z" } })], options());
+    expect(expiredRights.rejections).toEqual([{ offerId: "offer-1", code: "RIGHTS_EXPIRED" }]);
+  });
+
+  it("reauthorizes vector candidates before hydration and keeps deterministic retrieval independent of index health", () => {
+    const indexed = offer({ mode: "discovery" });
+    const projection = {
+      offerId: indexed.id, sourceRef: indexed.sourceRef, datasetRef: indexed.datasetRef,
+      authorizationScope: "PUBLIC" as const, policyVersion: "rights-r1", indexGeneration: "generation-1",
+      indexedAt: "2026-10-01T00:00:00.000Z", evidenceRevision: 3, evidenceContentHash: "a".repeat(64), contentMode: "metadata" as const,
+    };
+    expect(authorizeRetrievalProjection(requirement, indexed, options(), projection)).toMatchObject({ ok: true, mode: "metadata" });
+    expect(authorizeRetrievalProjection(requirement, offer({ rights: { ...offer().rights, contentHydrationAllowed: false } }), options(), { ...projection, contentMode: "content" })).toMatchObject({ ok: false, code: "RIGHTS_FORBIDDEN" });
+    expect(authorizeRetrievalProjection(requirement, offer({ rights: { status: "forbidden", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r1" } }), options(), projection)).toMatchObject({ ok: false, code: "RIGHTS_FORBIDDEN" });
+    const deterministic = offer({ sourceHealth: { ...offer().sourceHealth, dimensions: { ...offer().sourceHealth.dimensions, index: "degraded" } } });
+    expect(authorizeRetrievalProjection(requirement, deterministic, options(), { ...projection, contentMode: "content" })).toMatchObject({ ok: true, mode: "content" });
+  });
+
+  it("rejects stale or cross-tenant cache entries after current authorization", () => {
+    const cached = {
+      offerId: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1", authorizationScope: "PUBLIC" as const,
+      policyVersion: "rights-r1", cachedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-10-01T00:01:00.000Z",
+    };
+    expect(evaluateRetrievalCache(requirement, offer(), options({ now: new Date("2026-10-01T00:00:30.000Z") }), cached)).toMatchObject({ ok: true, ageSeconds: 30 });
+    expect(evaluateRetrievalCache(requirement, offer(), options({ now: new Date("2026-10-01T00:02:00.000Z") }), cached)).toMatchObject({ ok: false, code: "CACHE_EXPIRED" });
+    expect(evaluateRetrievalCache(requirement, offer(), options(), { ...cached, cachedAt: "2026-10-01T00:00:01.000Z" })).toMatchObject({ ok: false, code: "CACHE_INVALID" });
+    expect(evaluateRetrievalCache(requirement, offer({ rights: { status: "forbidden", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r1" } }), options(), cached)).toMatchObject({ ok: false, code: "RIGHTS_FORBIDDEN" });
+  });
+
+  it("caps cache validity at the trusted freshness, health, rights, and retention bounds", () => {
+    const cached = {
+      offerId: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1", authorizationScope: "PUBLIC" as const,
+      policyVersion: "rights-r1", cachedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-10-01T00:10:01.000Z",
+    };
+    expect(evaluateRetrievalCache(requirement, offer(), options(), cached)).toMatchObject({ ok: false, code: "CACHE_INVALID" });
+    expect(evaluateRetrievalCache(requirement, offer({ rights: { status: "granted", commercialUse: true, redistributable: true, contentHydrationAllowed: true, policyVersion: "rights-r1", validUntil: "2026-10-01T00:10:00.000Z", retentionUntil: undefined } }), options(), { ...cached, expiresAt: "2026-10-01T00:01:00.000Z" })).toMatchObject({ ok: false, code: "CACHE_INVALID" });
+    expect(evaluateRetrievalCache(requirement, offer({ sourceHealth: { ...offer().sourceHealth, validUntil: "2026-10-01T00:00:45.000Z" } }), options(), { ...cached, expiresAt: "2026-10-01T00:01:00.000Z" })).toMatchObject({ ok: false, code: "CACHE_INVALID" });
+    expect(evaluateRetrievalCache(requirement, offer({ freshness: { observedAt: "2026-10-01T00:00:00.000Z", staleAfterSeconds: 30 } }), options({ now: new Date("2026-10-01T00:00:31.000Z") }), { ...cached, expiresAt: "2026-10-01T00:00:30.000Z" })).toMatchObject({ ok: false, code: "OFFER_STALE" });
+  });
+
+  it("hydrates only a projection bound to current generation and canonical evidence identity", () => {
+    const projection = {
+      offerId: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1", authorizationScope: "PUBLIC" as const,
+      policyVersion: "rights-r1", indexGeneration: "generation-1", indexedAt: "2026-10-01T00:00:00.000Z",
+      evidenceRevision: 3, evidenceContentHash: "a".repeat(64), contentMode: "content" as const,
+    };
+    expect(authorizeRetrievalProjection(requirement, offer(), options(), projection)).toMatchObject({ ok: true });
+    expect(authorizeRetrievalProjection(requirement, offer(), options({ currentIndexGeneration: "generation-2" }), projection)).toMatchObject({ ok: false, code: "PROJECTION_SCOPE_MISMATCH" });
+    expect(authorizeRetrievalProjection(requirement, offer(), options(), { ...projection, evidenceRevision: 2 })).toMatchObject({ ok: false, code: "PROJECTION_SCOPE_MISMATCH" });
+    expect(authorizeRetrievalProjection(requirement, offer({ evidence: undefined }), options(), projection)).toMatchObject({ ok: false, code: "PROJECTION_SCOPE_MISMATCH" });
+  });
+
+  it("fails closed for connector URLs outside the HTTPS egress allowlist or carrying secrets", () => {
+    expect(validateConnectorUrl("https://api.example.com/v1/data", ["api.example.com"])).toMatchObject({ ok: true });
+    expect(validateConnectorUrl("http://api.example.com/v1/data", ["api.example.com"])).toMatchObject({ ok: false, code: "CONNECTOR_URL_FORBIDDEN" });
+    expect(validateConnectorUrl("https://127.0.0.1/admin", ["api.example.com"])).toMatchObject({ ok: false, code: "CONNECTOR_URL_FORBIDDEN" });
+    expect(validateConnectorUrl("https://localhost/admin", ["localhost"])).toMatchObject({ ok: false, code: "CONNECTOR_URL_FORBIDDEN" });
+    expect(validateConnectorUrl("https://[::1]/admin", ["api.example.com"])).toMatchObject({ ok: false, code: "CONNECTOR_URL_FORBIDDEN" });
+    expect(validateConnectorUrl("https://api.example.com/v1/data?access_token=secret", ["api.example.com"])).toMatchObject({ ok: false, code: "CONNECTOR_URL_FORBIDDEN" });
+  });
 });
diff --git a/apps/web/server/services/intelligenceFabric/resolver.ts b/apps/web/server/services/intelligenceFabric/resolver.ts
index 9347efd2e..d5219cee4 100644
--- a/apps/web/server/services/intelligenceFabric/resolver.ts
+++ b/apps/web/server/services/intelligenceFabric/resolver.ts
@@ -45,13 +45,25 @@ export interface DataOffer {
   readonly geographyRefs: readonly string[];
   readonly temporalCoverage: { readonly from?: string; readonly to?: string };
   readonly freshness: { readonly observedAt?: string; readonly staleAfterSeconds: number };
+  /** Canonical immutable evidence identity used to verify a hydrated index hit. */
+  readonly evidence?: { readonly revision: number; readonly contentHash: string };
   /** Short-lived server snapshot bound to exactly this source/dataset offer. */
   readonly sourceHealth: SourceHealthAssessment;
   readonly rights: {
     readonly status: "granted" | "forbidden" | "unknown";
     readonly commercialUse: boolean;
     readonly redistributable: boolean;
+    /** Explicit server-resolved permission to hydrate indexed content. */
+    readonly contentHydrationAllowed: boolean;
+    /** Server-resolved rights/ACL policy revision used to create this offer. */
+    readonly policyVersion: string;
+    /** Server-resolved upper bound for retaining a cache entry, if granted. */
+    readonly retentionUntil?: string;
+    /** Server-resolved upper bound for using this rights grant in cache. */
+    readonly validUntil?: string;
   };
+  /** Policy revision bound to the short-lived health assessment for this offer. */
+  readonly healthPolicyVersion: string;
   readonly acl: {
     readonly allowed: boolean;
     readonly authorizationScope: "PUBLIC" | "TENANT";
@@ -75,7 +87,8 @@ export type OfferRejectionCode =
   | "OFFER_STALE" | "SOURCE_UNAVAILABLE" | "COVERAGE_INSUFFICIENT"
   | "REQUIRED_FIELDS_MISSING" | "COST_LIMIT_EXCEEDED" | "PRIVACY_CLASS_MISMATCH" | "PLACEMENT_UNAVAILABLE" | "OFFER_INVALID"
   | "SOURCE_HEALTH_UNVERIFIED" | "SOURCE_HEALTH_SCOPE_MISMATCH" | "SOURCE_HEALTH_EXPIRED" | "SOURCE_DEGRADED" | "SOURCE_STALE"
-  | "SOURCE_SCHEMA_DRIFT" | "SOURCE_SEMANTIC_DRIFT" | "SOURCE_RIGHTS_HEALTH_FAILED" | "SOURCE_PLACEMENT_UNAVAILABLE" | "SOURCE_INDEX_UNHEALTHY";
+  | "SOURCE_SCHEMA_DRIFT" | "SOURCE_SEMANTIC_DRIFT" | "SOURCE_RIGHTS_HEALTH_FAILED" | "SOURCE_PLACEMENT_UNAVAILABLE" | "SOURCE_INDEX_UNHEALTHY"
+  | "POLICY_VERSION_MISMATCH" | "RIGHTS_EXPIRED";

 export interface OfferRejection {
   readonly offerId: string;
@@ -87,6 +100,10 @@ export interface ResolveDataRequirementOptions {
   readonly authorizationScope?: "PUBLIC" | "TENANT";
   readonly tenantId?: string;
   readonly allowedPlacements?: readonly string[];
+  /** Resolved by the server from current policy state, never from a vector hit. */
+  readonly currentPolicyVersion: string;
+  /** Current trusted index generation; required before hydrating index content. */
+  readonly currentIndexGeneration?: string;
 }

 export interface DataRequirementResolution {
@@ -97,6 +114,49 @@ export interface DataRequirementResolution {
   readonly unsatisfiedReason?: "NO_ELIGIBLE_OFFER" | "AUTHORIZATION_SCOPE_REQUIRED";
 }

+export interface RetrievalProjection {
+  readonly offerId: string;
+  readonly sourceRef: string;
+  readonly datasetRef: string;
+  readonly authorizationScope: "PUBLIC" | "TENANT";
+  readonly tenantId?: string;
+  readonly policyVersion: string;
+  readonly indexGeneration: string;
+  readonly indexedAt: string;
+  /** Immutable evidence identity that was indexed. */
+  readonly evidenceRevision: number;
+  readonly evidenceContentHash: string;
+  /** Metadata may be discoverable when content indexing is prohibited. */
+  readonly contentMode: "metadata" | "content";
+}
+
+export interface RetrievalCacheEntry {
+  readonly offerId: string;
+  readonly sourceRef: string;
+  readonly datasetRef: string;
+  readonly authorizationScope: "PUBLIC" | "TENANT";
+  readonly tenantId?: string;
+  readonly policyVersion: string;
+  readonly cachedAt: string;
+  readonly expiresAt: string;
+}
+
+export type RetrievalAuthorization =
+  | { readonly ok: true; readonly mode: "metadata" | "content" }
+  | { readonly ok: false; readonly code: OfferRejectionCode | "PROJECTION_INVALID" | "PROJECTION_SCOPE_MISMATCH" | "CACHE_INVALID" | "CACHE_EXPIRED" };
+
+export type RetrievalCacheEvaluation =
+  | { readonly ok: true; readonly ageSeconds: number }
+  | { readonly ok: false; readonly code: OfferRejectionCode | "CACHE_INVALID" | "CACHE_EXPIRED" };
+
+export type ConnectorUrlValidation =
+  | { readonly ok: true; readonly url: string }
+  | { readonly ok: false; readonly code: "CONNECTOR_URL_FORBIDDEN" };
+
+const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
+const SECRET_QUERY_KEY = /(?:api[_-]?key|authorization|cookie|credential|password|secret|token)/i;
+const MAX_OFFERS = 100;
+
 function isValidInstant(value: string | undefined): value is string {
   return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
     Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
@@ -118,7 +178,7 @@ function isValidOffer(offer: DataOffer): boolean {
     (offer.coverageScore !== undefined && (!Number.isFinite(offer.coverageScore) || offer.coverageScore < 0 || offer.coverageScore > 1)) ||
     !offer.freshness || !Number.isFinite(offer.freshness.staleAfterSeconds) || offer.freshness.staleAfterSeconds < 0 ||
     !offer.temporalCoverage || typeof offer.temporalCoverage !== "object" ||
-    !offer.rights || !["granted", "forbidden", "unknown"].includes(offer.rights.status) || typeof offer.rights.commercialUse !== "boolean" || typeof offer.rights.redistributable !== "boolean" ||
+    !offer.rights || !["granted", "forbidden", "unknown"].includes(offer.rights.status) || typeof offer.rights.commercialUse !== "boolean" || typeof offer.rights.redistributable !== "boolean" || typeof offer.rights.contentHydrationAllowed !== "boolean" || !ID.test(offer.rights.policyVersion) || !ID.test(offer.healthPolicyVersion) ||
     !offer.acl || typeof offer.acl.allowed !== "boolean" || !["PUBLIC", "TENANT"].includes(offer.acl.authorizationScope) ||
     typeof offer.placement !== "string" || !offer.placement ||
     !["query", "materialize", "cache", "discovery"].includes(offer.mode) || !offer.estimatedCost || !["zero", "known", "estimated", "unknown"].includes(offer.estimatedCost.kind)) return false;
@@ -126,9 +186,23 @@ function isValidOffer(offer: DataOffer): boolean {
     (!Number.isFinite(offer.estimatedCost.credits) || offer.estimatedCost.credits < 0)) return false;
   if (offer.temporalCoverage && [offer.temporalCoverage.from, offer.temporalCoverage.to].some(value => value !== undefined && !isValidInstant(value))) return false;
   if (offer.temporalCoverage?.from && offer.temporalCoverage.to && Date.parse(offer.temporalCoverage.from) > Date.parse(offer.temporalCoverage.to)) return false;
+  if ([offer.rights.validUntil, offer.rights.retentionUntil].some(value => value !== undefined && !isValidInstant(value))) return false;
   return true;
 }

+function isValidResolutionOptions(options: ResolveDataRequirementOptions): boolean {
+  return Boolean(options) && options.now instanceof Date && Number.isFinite(options.now.getTime()) && ID.test(options.currentPolicyVersion) &&
+    (options.currentIndexGeneration === undefined || ID.test(options.currentIndexGeneration)) &&
+    (options.authorizationScope === undefined || options.authorizationScope === "PUBLIC" || options.authorizationScope === "TENANT") &&
+    (options.authorizationScope !== "TENANT" || (typeof options.tenantId === "string" && ID.test(options.tenantId)));
+}
+
+function offerId(value: unknown): string {
+  return value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" && ID.test((value as { id: string }).id)
+    ? (value as { id: string }).id
+    : "invalid-offer";
+}
+
 function temporalCovers(
   coverage: DataOffer["temporalCoverage"],
   required: DataRequirement["temporal"],
@@ -158,6 +232,8 @@ function rejectOffer(
   if (!offer.acl.allowed) return "ACL_DENIED";
   if (offer.rights.status === "unknown") return "RIGHTS_UNVERIFIED";
   if (offer.rights.status !== "granted") return "RIGHTS_FORBIDDEN";
+  if (offer.rights.policyVersion !== options.currentPolicyVersion || offer.healthPolicyVersion !== options.currentPolicyVersion) return "POLICY_VERSION_MISMATCH";
+  if (offer.rights.validUntil && Date.parse(offer.rights.validUntil) <= options.now.getTime()) return "RIGHTS_EXPIRED";
   if (requirement.commercialUseRequired && !offer.rights.commercialUse) return "COMMERCIAL_USE_FORBIDDEN";
   if (requirement.redistributableRequired && !offer.rights.redistributable) return "REDISTRIBUTION_FORBIDDEN";
   if (!offer.semanticTypes.includes(requirement.semanticType)) return "SEMANTIC_MISMATCH";
@@ -211,13 +287,14 @@ export function resolveDataRequirement(
   offers: readonly DataOffer[],
   options: ResolveDataRequirementOptions,
 ): DataRequirementResolution {
-  if (!options.now || !Number.isFinite(options.now.getTime())) throw new Error("RESOLUTION_TIME_INVALID");
+  if (!isValidResolutionOptions(options)) throw new Error("RESOLUTION_OPTIONS_INVALID");
   if (!parseDataRequirement(requirement).ok) throw new Error("DATA_REQUIREMENT_INVALID");
+  if (!Array.isArray(offers) || offers.length > MAX_OFFERS || offers.some((offer, index) => !Object.prototype.hasOwnProperty.call(offers, index))) throw new Error("DATA_OFFERS_INVALID");
   if (!options.authorizationScope) {
     return {
       satisfied: false,
       eligible: [],
-      rejections: offers.map(offer => ({ offerId: offer.id, code: "AUTHORIZATION_SCOPE_REQUIRED" })),
+      rejections: offers.map(offer => ({ offerId: offerId(offer), code: "AUTHORIZATION_SCOPE_REQUIRED" })),
       unsatisfiedReason: "AUTHORIZATION_SCOPE_REQUIRED",
     };
   }
@@ -226,7 +303,7 @@ export function resolveDataRequirement(
   const rejections: OfferRejection[] = [];
   for (const offer of offers) {
     const code = rejectOffer(requirement, offer, options);
-    if (code) rejections.push({ offerId: offer.id, code });
+    if (code) rejections.push({ offerId: offerId(offer), code });
     else eligible.push(offer);
   }

@@ -248,3 +325,94 @@ export function resolveDataRequirement(
     ...(eligible.length ? {} : { unsatisfiedReason: "NO_ELIGIBLE_OFFER" as const }),
   };
 }
+
+/**
+ * A search index hit is discovery metadata only. This checks the hit against
+ * the current catalog offer before metadata or content can be hydrated.
+ */
+export function authorizeRetrievalProjection(
+  requirement: DataRequirement,
+  offer: DataOffer,
+  options: ResolveDataRequirementOptions,
+  projection: RetrievalProjection,
+): RetrievalAuthorization {
+  const resolved = resolveDataRequirement(requirement, [offer], options);
+  if (!resolved.satisfied) return { ok: false, code: resolved.rejections[0]?.code ?? "PROJECTION_INVALID" };
+  if (!projection || typeof projection !== "object" || !ID.test(projection.offerId) || !ID.test(projection.sourceRef) || !ID.test(projection.datasetRef) ||
+    !ID.test(projection.policyVersion) || !ID.test(projection.indexGeneration) || !isValidInstant(projection.indexedAt) ||
+    !Number.isSafeInteger(projection.evidenceRevision) || projection.evidenceRevision < 1 || !/^[a-f0-9]{64}$/i.test(projection.evidenceContentHash) ||
+    (projection.authorizationScope !== "PUBLIC" && projection.authorizationScope !== "TENANT") ||
+    (projection.authorizationScope === "TENANT" && (!projection.tenantId || !ID.test(projection.tenantId))) ||
+    (projection.contentMode !== "metadata" && projection.contentMode !== "content")) return { ok: false, code: "PROJECTION_INVALID" };
+  if (!offer.evidence || !Number.isSafeInteger(offer.evidence.revision) || offer.evidence.revision < 1 || !/^[a-f0-9]{64}$/i.test(offer.evidence.contentHash) ||
+    !options.currentIndexGeneration || projection.indexGeneration !== options.currentIndexGeneration ||
+    projection.offerId !== offer.id || projection.sourceRef !== offer.sourceRef || projection.datasetRef !== offer.datasetRef ||
+    projection.evidenceRevision !== offer.evidence.revision || projection.evidenceContentHash !== offer.evidence.contentHash ||
+    projection.authorizationScope !== options.authorizationScope || projection.tenantId !== options.tenantId || projection.policyVersion !== options.currentPolicyVersion) {
+    return { ok: false, code: "PROJECTION_SCOPE_MISMATCH" };
+  }
+  if (projection.contentMode === "content" && !offer.rights.contentHydrationAllowed) return { ok: false, code: "RIGHTS_FORBIDDEN" };
+  return { ok: true, mode: projection.contentMode };
+}
+
+/** Rechecks authorization first, then reports cache age without exposing cached payload. */
+export function evaluateRetrievalCache(
+  requirement: DataRequirement,
+  offer: DataOffer,
+  options: ResolveDataRequirementOptions,
+  entry: RetrievalCacheEntry,
+): RetrievalCacheEvaluation {
+  const resolved = resolveDataRequirement(requirement, [offer], options);
+  if (!resolved.satisfied) return { ok: false, code: resolved.rejections[0]?.code ?? "CACHE_INVALID" };
+  if (!entry || typeof entry !== "object" || !ID.test(entry.offerId) || !ID.test(entry.sourceRef) || !ID.test(entry.datasetRef) || !ID.test(entry.policyVersion) ||
+    !isValidInstant(entry.cachedAt) || !isValidInstant(entry.expiresAt) || (entry.authorizationScope !== "PUBLIC" && entry.authorizationScope !== "TENANT") ||
+    (entry.authorizationScope === "TENANT" && (!entry.tenantId || !ID.test(entry.tenantId)))) return { ok: false, code: "CACHE_INVALID" };
+  if (entry.offerId !== offer.id || entry.sourceRef !== offer.sourceRef || entry.datasetRef !== offer.datasetRef || entry.authorizationScope !== options.authorizationScope ||
+    entry.tenantId !== options.tenantId || entry.policyVersion !== options.currentPolicyVersion || Date.parse(entry.expiresAt) <= Date.parse(entry.cachedAt) || Date.parse(entry.cachedAt) > options.now.getTime()) return { ok: false, code: "CACHE_INVALID" };
+  const observedAt = offer.freshness.observedAt;
+  const freshnessExpiresAt = isValidInstant(observedAt)
+    ? Date.parse(observedAt) + offer.freshness.staleAfterSeconds * 1_000
+    : undefined;
+  const cacheBounds = [freshnessExpiresAt, offer.sourceHealth.validUntil, offer.rights.validUntil, offer.rights.retentionUntil]
+    .map(value => typeof value === "number" ? value : isValidInstant(value) ? Date.parse(value) : undefined);
+  if (cacheBounds.some(value => value === undefined)) return { ok: false, code: "CACHE_INVALID" };
+  const cacheValidUntil = Math.min(...cacheBounds as number[]);
+  if (Date.parse(entry.expiresAt) > cacheValidUntil) return { ok: false, code: "CACHE_INVALID" };
+  if (cacheValidUntil <= options.now.getTime()) return { ok: false, code: "CACHE_EXPIRED" };
+  if (Date.parse(entry.expiresAt) <= options.now.getTime()) return { ok: false, code: "CACHE_EXPIRED" };
+  return { ok: true, ageSeconds: Math.max(0, (options.now.getTime() - Date.parse(entry.cachedAt)) / 1_000) };
+}
+
+/**
+ * URL-only connector admission. DNS resolution and network execution remain
+ * outside this pure boundary; the execution runtime must resolve DNS and
+ * enforce egress against the approved destination policy after resolution.
+ */
+export function validateConnectorUrl(value: unknown, allowedHosts: readonly string[]): ConnectorUrlValidation {
+  if (typeof value !== "string" || value.length > 2_048 || !Array.isArray(allowedHosts) || allowedHosts.length === 0 || allowedHosts.length > 64) {
+    return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
+  }
+  const hosts = new Set<string>();
+  for (let index = 0; index < allowedHosts.length; index += 1) {
+    const host = allowedHosts[index];
+    if (!Object.prototype.hasOwnProperty.call(allowedHosts, index) || typeof host !== "string" || !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/i.test(host) || host.includes("..") || isForbiddenConnectorHost(host)) {
+      return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
+    }
+    hosts.add(host.toLowerCase());
+  }
+  try {
+    const url = new URL(value);
+    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || isForbiddenConnectorHost(url.hostname) || !hosts.has(url.hostname.toLowerCase()) ||
+      [...url.searchParams.keys()].some(key => SECRET_QUERY_KEY.test(key))) return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
+    return { ok: true, url: url.toString() };
+  } catch {
+    return { ok: false, code: "CONNECTOR_URL_FORBIDDEN" };
+  }
+}
+
+function isForbiddenConnectorHost(value: string): boolean {
+  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
+  if (host === "localhost" || host.endsWith(".localhost") || host.includes(":")) return true;
+  const parts = host.split(".");
+  return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
+}
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-04-data-resolution-and-retrieval.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-04-data-resolution-and-retrieval.md
index d762fdf61..cadd621bc 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-04-data-resolution-and-retrieval.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-04-data-resolution-and-retrieval.md
@@ -10,18 +10,52 @@ Spec 266 §§22–31, 46.6–46.8.

 ## Implementation

-- Resolver validates direct DataRequirement callers at its boundary, returns eligible offers and bounded reasons, and never converts unknown cost or missing data to zero.
-- Resolver requires a current SourceHealth assessment scoped to the exact source, dataset and offer; health drift quarantines that offer without affecting unrelated offers. Vector/index health applies only to discovery offers, not deterministic query offers.
-- Offer time coverage uses canonical UTC instants and rejects inverted intervals even when the requirement does not request a time window.
-- Rank only after server-side authorization, rights, semantics, geography/time, freshness, quality and privacy gates.
-- Vector/search results are discovery only; reauthorize before hydration and deterministic numeric retrieval.
-- Revocation and deletion invalidate caches/indexes without mutating evidence history.
+- In `resolver.ts`, validate direct DataRequirement callers at the boundary, bound rejection detail, preserve unknown cost/coverage, and require health bound to the exact source/dataset/offer and current policy version.
+- Apply authorization, tenant scope, rights, semantics, geography/time, freshness, quality, placement, and privacy gates before ranking. Use canonical UTC instants and reject inverted offer windows even when the caller omitted a desired window.
+- Keep Vectorize/search as discovery. Reauthorize before hydration or deterministic numeric retrieval; deterministic queries remain available when index health fails.
+- Bound query plans, provider fan-out, and cache lifetime by rights, freshness, and retention. Revocation/deletion invalidates projections and cache only, never immutable evidence.
+- Keep connector input untrusted; reject unsafe URL resolution/SSRF and secret-bearing query or error content.

 ## Tests

-- Cross-tenant isolation, revoked rights, malformed direct requirements, per-offer health quarantine, injection/SSRF, stale vectors and cost ordering.
-- Pure resolver proof accepts a TENANT offer only for its matching tenant and rejects currently forbidden or unknown rights snapshots before ranking.
+- Extend `resolver.test.ts` with direct-input, scope/rights, health isolation, time, unknown-cost, index-outage, stale projection, revocation, cache, and SSRF/injection cases.

 ## Acceptance

 Spec 266 §§46.6–46.8, especially resolver criteria 38–42.
+## UI/UX Contract
+
+### Target User / JTBD
+- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.
+
+### Existing Pattern Reference
+- N/A: no user-facing surface is added by this section.
+
+### Surface Inventory
+- N/A: no route/page/dialog/form/table is added.
+
+### Component Map
+- N/A: no client component is added.
+
+### State Matrix
+- N/A: no browser state is added.
+
+### Responsive Matrix
+- N/A: no browser layout is added.
+
+### Accessibility Acceptance
+- N/A: no user-facing control is added.
+
+### Copy Contract
+- N/A: no user-facing copy is added.
+
+### Browser Evidence Required
+- N/A: no browser-visible changes are planned in this section.
+
+## Implementation evidence (2026-10-05)
+
+- Pure resolver inputs are validated at the boundary and bind offers to a current policy version and independently scoped health. Index health gates vector discovery only; deterministic source retrieval remains separate.
+- Vector candidates are reauthorized before hydration and must match the current canonical evidence revision/hash and index generation. Cached candidates are rechecked against current rights/authorization and expiry, with expiry capped by source freshness, health, rights validity, and retention. Connector URLs require HTTPS plus exact host allowlisting, reject credential-bearing query strings and local/IP-literal hosts; runtime DNS/egress enforcement remains required.
+- Progressive evidence planning propagates the server-resolved policy version to the resolver.
+- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/resolver.test.ts server/services/decisionIntelligence/evidencePlan.test.ts` — 2 files, 24 tests passed after review fixes, including cache timestamp, rights expiry, metadata-only hydration and generation/hash checks; `DataOffer` statically requires the content-hydration policy field. `git diff --check` passed.
+- External gate: no managed Retrieval Broker/vector runtime currently composes these pure contracts in this slice; live ACL/cache/index revocation and provider SSRF/egress proof remain open.
