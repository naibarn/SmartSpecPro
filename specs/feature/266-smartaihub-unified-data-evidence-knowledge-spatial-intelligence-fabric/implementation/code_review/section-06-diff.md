diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-06-emergency-profile-compatibility.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-06-emergency-profile-compatibility.md
index 29bcc84f9..ff5c58fe5 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-06-emergency-profile-compatibility.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-06-emergency-profile-compatibility.md
@@ -10,14 +10,49 @@ Spec 266 §§34–37, 46.9 and compatibility items 48–57, 78–79, 85.

 ## Implementation

-- Reuse existing 260/262-owned records and map them losslessly to Fabric references.
-- Keep all unverified Thailand source candidates disabled until rights, endpoint, cadence and schema are independently verified.
-- Do not dual-write or perform destructive ownership migration; cut over one source only after replay proof and explicit operator procedure.
+- Use read-only adapters over 260/262-owned source, hydrology, capture, watch, and MapLibre projection records; map stable references without copying authority or changing write paths.
+- Keep unverified Thailand source candidates inactive until endpoint, rights, cadence, schema, freshness, attribution, and operating contact evidence is independently reviewed.
+- No dual-write or destructive migration. Any operator-authorized per-source cutover requires replay parity, count/checksum reconciliation, correction/stale handling, rollback steps, and a named owner.
+- Preserve current renderer and emergency workflow owners. No second renderer, incident/task authority, or local capture authority.

 ## Tests

-- Compatibility projections, source-class preservation, no dual-writer assertions, correction and stale-data handling.
+- Adapter tests prove reference/projection fidelity, source-class preservation, no dual writer, correction handling, staleness, and disabled unverified providers.

 ## Acceptance

 Spec 266 §46.9 plus §46.11 items 78–79 and §46.12 item 85.
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
+- Compatibility inventory confirms the current Spec 260 source, immutable capture, hydrology observation, watch, map-projection, and Spec 262 renderer owners. The existing refresh path reauthorizes source/policy before durable effects, hash-verifies captures, and appends normalized observations idempotently.
+- No Fabric dual writer, duplicate renderer, or source cutover was added. Because no server-owned binding from Spec 260 emergency source/capture records to an active Fabric source/dataset with an authoritative rights receipt, nor an approved migration window, exists in this branch, a live adapter is not composed; the current records remain authoritative.
+- Focused compatibility proof: `pnpm --filter @smartspec/web exec vitest run server/services/geoSources/contracts.test.ts server/services/geoSources/acquisitionJob.test.ts server/services/geoSources/refreshPipeline.test.ts server/services/geoSources/drizzlePersistence.test.ts server/services/geoSources/registry.test.ts server/services/intelligenceFabric/semantic.test.ts server/services/intelligenceFabric/spatialOps.test.ts` — 7 files, 46 tests passed. Production parity, source-by-source replay, and live 260/262 consumer proof remain open.
