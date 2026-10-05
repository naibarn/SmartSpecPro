diff --git a/apps/web/server/services/decisionIntelligence/researchAdapter.test.ts b/apps/web/server/services/decisionIntelligence/researchAdapter.test.ts
index 25560c14c..e47f9b7a0 100644
--- a/apps/web/server/services/decisionIntelligence/researchAdapter.test.ts
+++ b/apps/web/server/services/decisionIntelligence/researchAdapter.test.ts
@@ -17,10 +17,30 @@ describe("mapResearchNeedToRequest", () => {
   it("rejects missing policy, mismatched tenant, changed project authority, and unknown mode", () => {
     expect(mapResearchNeedToRequest(need, { ...authority, activePolicy: undefined })).toMatchObject({ ok: false, code: "RESEARCH_POLICY_UNAVAILABLE" });
     expect(mapResearchNeedToRequest(need, { ...authority, tenantId: undefined })).toMatchObject({ ok: false, code: "RESEARCH_AUTHORITY_INVALID" });
+    expect(mapResearchNeedToRequest(need, { ...authority, resolvedProjectId: undefined as never })).toMatchObject({ ok: false, code: "RESEARCH_AUTHORITY_INVALID" });
     expect(mapResearchNeedToRequest({ ...need, decisionProjectRef: "other-project" }, authority)).toMatchObject({ ok: false, code: "RESEARCH_PROJECT_SCOPE_MISMATCH" });
     expect(mapResearchNeedToRequest({ ...need, preferredMode: "FREEFORM" as never }, authority)).toMatchObject({ ok: false, code: "RESEARCH_MODE_UNSUPPORTED" });
   });
 
+  it("does not accept caller-supplied evidence or source authority when canonicalizing a need", () => {
+    const untrustedNeed = {
+      ...need,
+      tenantId: "attacker-tenant",
+      requestedBy: "attacker-user",
+      sourceId: "attacker-source",
+      rightsPolicyRef: "attacker-rights",
+      evidenceItems: [{ id: "forged-evidence", verificationState: "authority_verified" }],
+    } as typeof need & Record<string, unknown>;
+    const result = mapResearchNeedToRequest(untrustedNeed, authority);
+
+    expect(result.ok).toBe(true);
+    if (!result.ok) return;
+    expect(result.value.request).toMatchObject({ tenantId: authority.tenantId, requestedBy: authority.requestedBy });
+    expect(result.value.request).not.toHaveProperty("sourceId");
+    expect(result.value.request).not.toHaveProperty("rightsPolicyRef");
+    expect(result.value.request).not.toHaveProperty("evidenceItems");
+  });
+
   it("allows public scope only with explicit server-side public research policy", () => {
     const { tenantId: _tenantId, ...publicAuthorityBase } = authority;
     const publicAuthority = { ...publicAuthorityBase, authorizationScope: "PUBLIC" as const, activePolicy: { ...authority.activePolicy!, publicResearchAllowed: true } };
diff --git a/apps/web/server/services/intelligenceFabric/contracts.test.ts b/apps/web/server/services/intelligenceFabric/contracts.test.ts
index c7354a6a1..147d831c0 100644
--- a/apps/web/server/services/intelligenceFabric/contracts.test.ts
+++ b/apps/web/server/services/intelligenceFabric/contracts.test.ts
@@ -16,6 +16,13 @@ describe("parseEvidenceItem", () => {
     expect(parseEvidenceItem(evidence)).toEqual({ ok: true, value: evidence });
   });
 
+  it("rejects unknown evidence contract versions", () => {
+    expect(parseEvidenceItem({ ...evidence, contractVersion: "spec266-evidence-v99" })).toMatchObject({
+      ok: false,
+      code: "EVIDENCE_CONTRACT_INVALID",
+    });
+  });
+
   it("requires explicit public or tenant scope", () => {
     const { authorizationScope: _scope, ...withoutScope } = evidence;
     expect(parseEvidenceItem(withoutScope)).toMatchObject({ ok: false, code: "EVIDENCE_SCOPE_INVALID" });
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/compatibility-inventory.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/compatibility-inventory.md
index ade53f3c3..cd9ab76db 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/compatibility-inventory.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/compatibility-inventory.md
@@ -1,6 +1,6 @@
-# Spec 266 Compatibility Inventory: Specs 260 and 262
+# Spec 266 Compatibility Inventory: Runtime Inspection and Normative Ownership Map
 
-Checked against the current SmartSpecPro worktree on 2026-10-02. This inventory identifies owners and integration boundaries; it does not authorize cutover or a second registry.
+Checked against the Spec 266 isolated worktree on 2026-10-05. This inventory identifies owners and integration boundaries; it does not authorize cutover or a second registry. Spec 278 source artifacts were not present in this worktree, so only the ownership contract stated in Spec 266 R1.2 was verified.
 
 | Capability | Current authority | Write / execution path | Spec 266 relationship | Cutover status |
 | --- | --- | --- | --- | --- |
@@ -10,6 +10,11 @@ Checked against the current SmartSpecPro worktree on 2026-10-02. This inventory
 | Source refresh | Canonical `worker_jobs` and outbox with the server-owned `geo.source.refresh` job type | `acquisitionJob.ts` admits a deduplicated refresh; the Postgres node worker dispatches to the injected geo-source runtime and pipeline | Fabric may add request/evidence envelopes but cannot create a second queue, executor selection path or transport authority | Registered execution seam; runtime availability is composition-dependent |
 | User geospatial watches | `emergency_geo_watches` plus `emergency_geo_watch_transitions` | Authenticated `spec260EmergencyEdge.ts` routes create/list/update/revoke watches with tenant+owner checks, expiry, idempotency and audit | Fabric may supply versioned spatial/temporal signals; it does not own watch lifecycle or notifications | Current watch tables/routes remain authoritative |
 | Public emergency map | Spec 260 public emergency map API and established public projection | `EmergencyPublicMap.tsx` consumes public map items; `emergencyMapFeatures.ts` converts authorized public items to GeoJSON; chat handoff uses the shared map-context envelope | `GeoEvidenceFeature` is a typed projection boundary only; renderer integration must preserve Spec 260 authority and public redaction | No 266 feature store or renderer cutover |
+| Decision projects and methodology | Spec 265 Decision Intelligence (normative ownership mapping only; implementation not inspected) | Per Spec 266 R1.2 §2.3; no new runtime claim in this inventory | Consume 266 DataRequirement/DataOffer/Evidence references; 265 retains project/template/scenario/analysis authority | No 266 project or analysis writer |
+| Portable app/package | Spec 261 SPAAS (normative ownership mapping only; implementation not inspected) | Per Spec 266 R1.2 §2.4 and Appendix C; no new runtime claim in this inventory | Packs can be referenced by a Mini App; 266 does not define a second app runtime | No package authority transfer |
+| Canonical knowledge semantics and rights | Spec 266 | Shared source/evidence/knowledge semantics and admission policy | Own stable knowledge object identities, provenance, rights, verification, and exchange semantics | No alternate provider or search authority |
+| Portable Mini App knowledge runtime | Spec 278 (normative ownership mapping only; implementation not inspected) | Per Spec 266 R1.2 §§2.4 and Appendix C: managed/portable/connected/external adapters, SQLite/FTS5 local reference provider, Portable Knowledge Bundle mechanics, and provider capability negotiation | Must preserve 266 identities, lineage, rights, and re-entry admission | No local SQLite/FTS5 runtime in 266 |
+| SmartAIHub-managed retrieval | Spec 229 Retrieval Broker (normative ownership mapping only; implementation not inspected) | Per Spec 266 R1.2 §2.4; no new runtime claim in this inventory | 266 supplies authorized canonical references and rebuildable projections; search results require reauthorization | No alternate Retrieval Broker |
 
 ## Authority checks
 
@@ -17,6 +22,9 @@ Checked against the current SmartSpecPro worktree on 2026-10-02. This inventory
 - Spec 266 geometry/semantic/spatial helpers are pure calculations. They do not persist canonical emergency records or publish alerts.
 - The only asynchronous refresh authority identified above is `worker_jobs` plus outbox. Research execution is registered on the same canonical control plane, not a new queue.
 - No source catalog, capture, hydrology, watch, map API, or renderer cutover is claimed. Existing Spec 260/262 records and public emergency authority remain canonical.
+- Spec 265 owns decision methodology and analysis state; 261 owns package execution; 278 owns portable Mini App provider/runtime mechanics; 229 owns managed retrieval implementation. Spec 266 is the semantic, rights, provenance, and admission authority only.
+- Knowledge export/import must preserve stable identity/source anchors and re-run current rights and authorization checks. A bundle or vector index is never the canonical database.
+- Schema-backed portable knowledge object persistence and provider migration are not verified by this compatibility inventory; the active schema-owner marker blocks schema edits in the current session.
 
 ## Files inspected
 
@@ -25,3 +33,4 @@ Checked against the current SmartSpecPro worktree on 2026-10-02. This inventory
 - `apps/web/server/services/geoSources/refreshPipeline.ts`, `acquisitionJob.ts`, and `drizzlePersistence.ts` — authorized refresh, canonical job admission, and current append-only persistence ports.
 - `apps/web/server/jobs/feature186JobTypes.ts` — server-owned Postgres node job allow-list.
 - `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`, `emergencyMapFeatures.ts`, and shared emergency map-context contracts — public renderer/projection and chat handoff.
+- Spec 266 R1.2 §§2.3–2.5, Appendix C, and §46.12 — ownership contract for Specs 265/261/278/229. These sections were used as normative input only; no Spec 278 implementation code was inspected.
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-01-authority-and-contracts.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-01-authority-and-contracts.md
index f72de87c7..b89785319 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-01-authority-and-contracts.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-01-authority-and-contracts.md
@@ -10,17 +10,51 @@ Spec 266 §§2–4, 6, 44–45 Phase 0, 46.11–46.12, Appendix A–E; cross-ref
 
 ## Implementation
 
-- Produce a checked compatibility inventory for `emergencyIntelSources`, captures, hydrology stations/observations, geo watches, refresh route/job, and renderer projection.
-- Inventory is recorded in [`compatibility-inventory.md`](../compatibility-inventory.md); it records current owners and explicit no-cutover/no-dual-write boundaries.
-- Add runtime schemas/types with explicit contract versions and public-vs-tenant scope; reject omitted/ambiguous authorization scope.
-- Establish stable reference mapping rules and fail-closed unknown versions.
-- Preserve worker_jobs/outbox as the only durable asynchronous job authority.
+- Verify `compatibility-inventory.md` for emergency sources/captures, hydrology, geo watches, refresh jobs, MapLibre projections, Decision Intelligence, SPAAS, and Spec 278 ownership.
+- In `server/services/intelligenceFabric/contracts.ts` and `researchContracts.ts`, maintain explicit versions, reference-only bounded payloads, mandatory PUBLIC/TENANT scope, and detached nested snapshots.
+- In `decisionIntelligence/researchAdapter.ts`, map consumers into the canonical request without copying evidence authority into caller payloads.
+- Fail closed on unknown versions and unresolved authority. Preserve `worker_jobs` plus transactional outbox as the sole async authority.
 
 ## Tests
 
-- Contract parsing rejects unknown version, missing scope, oversized identifiers, and secret-bearing payloads.
-- Compatibility inventory test or validation proves no second registry/write authority was added.
+- Extend `contracts.test.ts`, `researchContracts.test.ts`, and adapter tests for unknown version/scope, size limits, secret fields, sparse arrays, and mutation after parse.
+- Validate compatibility ownership and assert no duplicate writer or retired-system entry point was introduced.
 
 ## Acceptance
 
 Relevant clauses are §§46.11–46.12 items 76–87. No database ownership cutover in this section.
+## Completed evidence
+
+- Updated the compatibility inventory with inspected runtime ownership for Specs 260/262 and explicit normative-only ownership mappings for Specs 261/265/278/229. Spec 278 implementation was not inspected; its local SQLite/FTS5 provider, bundle mechanics, and capability negotiation are recorded from the Spec 266 R1.2 contract only.
+- Existing parser coverage plus new focused cases proves explicit scope/version, secret/bounds rejection, sparse arrays, detached snapshots, missing server project authority rejection, and rejection of caller-supplied source/rights/evidence authority. No production writer or route changed in this section.
+- Compatibility delta validation: only `researchAdapter.test.ts` changed under application source; `git diff --cached --unified=0 -- 'apps/web/**/*.ts'` contained no retired-system call pattern (`work/request`, `workpacks`, `/workflows`, `OpenSandbox`, `sandbox_jobs`, `Agency`). No new writer was introduced.
+- Verification: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/contracts.test.ts server/services/intelligenceFabric/researchContracts.test.ts server/services/decisionIntelligence/researchAdapter.test.ts` — 3 files, 27 tests passed; `git diff --check` passed.
+
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
