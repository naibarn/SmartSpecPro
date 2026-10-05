diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/acceptance-evidence-map.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/acceptance-evidence-map.md
new file mode 100644
index 000000000..347a97fc7
--- /dev/null
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/acceptance-evidence-map.md
@@ -0,0 +1,22 @@
+# Spec 266 Acceptance Evidence Map
+
+Checked in the isolated implementation worktree on 2026-10-05. This is a source/test inventory, not production certification. A local unit test proves only its stated boundary.
+
+| Spec criteria | Local owner / proof surface | Current classification | Closure evidence still required |
+|---|---|---|---|
+| 46.1–46.3 (1–21): source, rights, evidence | `intelligenceFabric/{registry,registryPersistence,contracts,sourceHealth}.ts` and focused tests | Partial; admissions and pure policy exist, authoritative activation/rights/evidence persistence remains gated | Trusted rights receipt and activation lifecycle; durable append/revocation; source-health history; runtime authorization tests |
+| 46.4–46.5 (22–31): semantics, geo/time | `intelligenceFabric/{semantic,geometry,spatialOps}.ts` and focused tests | Local calculations/contracts; canonical versioned source binding unverified | Versioned canonical input fixtures, boundary/time integration and Spec 262 projection evidence |
+| 46.6 (32–37): retrieval/index | `intelligenceFabric/resolver.ts`; Spec 229 boundary in R1.2 | Partial policy seam; managed retrieval integration unverified | Provider-backed catalog, hydration reauthorization, revocation/index watermark, deterministic numeric retrieval |
+| 46.7 (38–42): resolver | `intelligenceFabric/resolver.ts` and tests | Pure bounded resolver only | Server-owned offer/policy composition, real source execution, missing coverage and cost behavior end-to-end |
+| 46.8 (43–47): security | Contracts and focused negative tests | Local input bounds only | SSRF/egress, prompt-injection, cross-tenant cache/vector tests and secret mediation integration |
+| 46.9 (48–57): emergency | `compatibility-inventory.md`; Spec 260/262 existing owners | Authority mapping only; no new writer or renderer | Replay/compatibility tests and a live Spec 260/262 consumer proof |
+| 46.10 (58–75): research | `research{Contracts,Admission,Persistence}.ts`, `researchRunPersistence.ts` and tests | Tenant request/job admission and immutable run receipt seams exist; executor, candidate promotion, notices and full rights gates remain partial/blocked | Approved runtime composition, real run, candidate promotion admission, source/dependency graph and notice ordering proof |
+| 46.11 (76–79): migration | `compatibility-inventory.md` | Ownership map only; cutover not performed | Named source owner, replay parity, count/hash reconciliation, rollback rehearsal, compatibility suite |
+| 46.12 (80–89): portable knowledge | Spec R1.2 + Section 07 plan | Contract/ownership requirements only; canonical object persistence/runtime not verified | Schema-owner window, authorized roundtrip fixture/hash/citation proof, rights re-evaluation and Spec 278 integration |
+| §47 (production DoD 1–23) | This map plus source and runtime evidence | OPEN; no production promotion claim | Every numbered gate requires environment/provider/runtime/deployment/operator evidence as specified by §47 |
+
+## Hard gates
+
+- `orchestra/.wave-active` remains owned by the separate Wave 3 / Wave 4A work. This implementation does not change Drizzle schema, SQL migrations, journal/snapshot, apply migrations, or release the marker.
+- Repository tests, static inspection, and adapters do not prove provider rights, external executor configuration, production deployment, rollback, or live user utility.
+- Source candidates without independently reviewed endpoint, rights, cadence, schema, freshness, attribution, and operating contact remain disabled.
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/gap-audit-rounds.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/gap-audit-rounds.md
new file mode 100644
index 000000000..56e16253e
--- /dev/null
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/reviews/gap-audit-rounds.md
@@ -0,0 +1,82 @@
+# Post-implementation gap audit — Spec 266 R1.2
+
+Audits below were run after implementing the local schema-free slices across all eight sections. Each round is a separate scope pass. A clean local audit does not close external schema, rights, runtime, provider, deployment, or production gates.
+
+## Round 1/10 — Spec and acceptance coverage
+
+- Compared Spec §§46.1–46.12 and §47 against all eight section scopes and `reviews/acceptance-evidence-map.md`.
+- Re-ran `check-sections.py` and `check-ui-contracts.py`: 8/8 sections complete; UI contract checker exited successfully across 8 files.
+- Finding: no missing local section/criterion mapping. Production DoD 1–23, portable knowledge proof, and external ownership/cutover criteria remain explicitly OPEN in the acceptance map; no local evidence is promoted to production proof.
+- Fix: none required; external gates are retained as blockers in Section 08.
+
+## Round 2/10 — Caller input, receipts, and forged authority
+
+- Inspected capture/rights receipt validators and research promotion/watch boundaries; ran the focused evidence-admission and research-promotion suites (2 files, 23 tests passed).
+- Finding: untrusted candidate/artifact values cannot self-assert scan or rights approval; receipts are resolved by server-owned ports, exact watch notices are bound before write, and unknown receipt keys fail closed. Content identity is hashed and omitted from stored JSON.
+- Fix: none required in this round; durable resolver/composition implementations remain explicit external gates.
+
+## Round 3/10 — Tenant, principal, and public-scope isolation
+
+- Traced tenant scope from authenticated registry router input through source/dataset/evidence admission and research request/run persistence; ran those focused suites (4 files, 29 tests passed).
+- Finding: registry routes derive tenant from authenticated account context; evidence receipts bind tenant/source/dataset/purpose; research async remains tenant-only and public dispatch/notice delivery fails closed.
+- Fix: none required. Cross-tenant vector/cache and live principal composition remain external production gates.
+
+## Round 4/10 — Lineage closure, parent binding, and cycle safety
+
+- Rechecked evidence contract graph validation and serialized source-wide append. Every direct/transitive parent must exist in the authorized closure; each parent contract is matched to its durable row identity; concurrency coverage starts from existing revisions and rejects the second opposing edge.
+- Focused proof: evidence admission plus contract tests (2 files, 27 tests passed), including missing parent, cross-tenant/source/dataset parent mismatch, sparse arrays, and concurrent cycle attempts.
+- Finding: no remaining local lineage gap.
+- Fix: none required. Production transaction/lock adapter is not composed and remains blocked.
+
+## Round 5/10 — Immutable revisions, replay, and durable delivery
+
+- Inspected append-only revision handling and transaction ordering. Exact evidence replay is idempotent; changed capture/content/rights snapshots create a new revision; collision cannot overwrite old state. Research promotion appends canonical evidence before notice in one transaction. Notice delivery uses terminal acknowledgement and retryable lease release.
+- Focused proof: evidence admission, immutable run receipt, and research promotion tests (3 files, 28 tests passed), including ambiguous acknowledgement and duplicate delivery.
+- Finding: no remaining local mutation/dedup gap; exactly-once runtime behavior still depends on the required durable adapter contract.
+- Fix: none required.
+
+## Round 6/10 — Time, rights validity, and freshness
+
+- Rechecked observed/captured ordering, duplicate and irregular cadence handling, stale/expiry admission, rights receipt expiry, resolver freshness, and cache upper bounds. Irregular samples preserve actual instants and report absent scheduled intervals without interpolation.
+- Focused proof: evidence admission, semantic, and resolver suites (3 files, 39 tests passed).
+- Finding: no remaining local time/expiry gap.
+- Fix: none required. Provider rights lifecycle, source health history, and live clock/retention policy remain external.
+
+## Round 7/10 — Retrieval authorization, cache, index, and content hydration
+
+- Traced resolve-before-hydrate, policy version, evidence revision/hash, current generation, rights expiry, freshness/health/retention cache bounds, and explicit metadata-vs-content permission. Connector admission rejects local/IP literals; execution-time DNS/egress enforcement is documented as mandatory.
+- Focused proof: resolver plus evidence-plan tests (2 files, 24 tests passed), including future cache timestamps, expired rights, metadata-only source, revoked policy, generation drift, and stale projection.
+- Finding: no remaining local resolver gap.
+- Fix: none required. No managed Retrieval Broker/vector runtime caller is present; production reauthorization and DNS/egress proof remain open.
+
+## Round 8/10 — Research lifecycle, worker plane, and candidate promotion
+
+- Rechecked request authority and reference-only worker envelope, tenant-scoped idempotency, run/request/job binding, candidate scan/rights/provenance/schema admission, evidence-before-notice transaction order, watch dedup/retry, and public fail-closed behavior.
+- Focused proof: research contracts/admission/request/run/promotion tests (5 files, 36 tests passed).
+- Finding: local policy boundary is complete for this slice. No production executor, candidate ledger, scanner, rights authority, or outbox notice consumer is composed.
+- Fix: none required; production run/admission/notice gates remain OPEN.
+
+## Round 9/10 — Emergency authority, compatibility, and cutover safety
+
+- Traced Spec 260 source/capture/hydrology/watch/map authority and Spec 262 renderer boundaries using the compatibility inventory and existing geo-source pipeline. Confirmed the existing pipeline reauthorizes before durable writes and retains immutable capture/hydrology history.
+- Focused proof: geo-source and GeoEvidence/spatial suites (7 files, 46 tests passed).
+- Finding: no dual writer, second renderer, or authority migration was introduced. No Fabric adapter can be safely composed without the blocked trusted source/dataset/rights binding; replay parity and production consumer evidence remain open.
+- Fix: none required; compatibility and rollback gates are explicitly retained.
+
+## Round 10/10 — Admin UX, retired systems, schema gate, and verification hygiene
+
+- Focused registry-router/Admin UI tests passed (2 files, 9 tests). Existing UI keeps candidate vs pending-review states explicit and approval delegates to Spec 260 authority; no client-only Fabric activation was introduced.
+- Searched implementation paths for Agency/workpacks/OpenSandbox/sandbox_jobs/legacy `/workflows` references: no matches. `git diff --check` passed. `git diff` shows no Drizzle schema/migration/journal/snapshot changes; `.wave-active` is unchanged. No forbidden repository typecheck was run.
+- Finding: no additional local code gap. UI viewport evidence is not applicable because no UI code changed; runtime/provider/deployment/rollback and schema-owner work remain external gates.
+- Fix: none required in this round.
+
+## Audit result
+
+All eleven post-implementation audit rounds are recorded (the user-required minimum was ten). Review-discovered local MUST_FIX gaps were repaired and the affected focused suites passed. The feature is not production-complete: the open gates in Section 08 and `acceptance-evidence-map.md` remain mandatory and are not waived by these local audits.
+
+## Round 11/10 — Final review corrections after the ten-round baseline
+
+- Revisited review feedback received after Round 10. Corrected Section 06 wording to bind the blocked migration precisely to Spec 260 records → active Fabric source/dataset + authoritative rights receipt. Corrected Section 07 to distinguish Fabric pending review from the existing Spec 260 operational approval queue.
+- Added and tightened an Admin component regression for the pending operational-source flow. It asserts the exact Spec 260 PATCH path and exact status/reason body, credentials, and success state.
+- Focused UI proof: `pnpm --filter @smartspec/web exec vitest run client/src/pages/Admin/__tests__/AdminIntelligenceRegistry.test.tsx` — 1 file, 6 tests passed. Independent reviews approved the corrected Section 06 boundary and confirmed the Section 07 route/test behavior.
+- Finding: no remaining local gap in these sections. Schema/runtime/provider/deployment and operational route authorization integration gates remain open as already recorded.
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-08-migration-acceptance-and-production-gates.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-08-migration-acceptance-and-production-gates.md
index 8c7ee0484..04cc46d46 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-08-migration-acceptance-and-production-gates.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-08-migration-acceptance-and-production-gates.md
@@ -10,15 +10,44 @@ Spec 266 §§44–48, appendices A–E.

 ## Implementation

-- Migration inventories every current writer and maps accepted facts without loss.
-- No dual canonical writes; one-writer-at-a-time cutover with replay, rollback and evidence.
-- Add focused automation mapping tests to acceptance item IDs.
-- Keep source packs disabled where rights/endpoints are unverified.
+- Maintain writer/authority inventory and map each acceptance criterion to source, test, or external evidence. Identify retention and rollback impact before proposing destructive migration.
+- The active schema-owner marker blocks Drizzle schema and migration edits in this session. Do not create SQL, edit snapshot/journal, apply migrations, or remove the marker. Revisit schema-dependent acceptance after its owner releases the gate.
+- Require one-writer-at-a-time cutover with replay, count/checksum reconciliation, rollback rehearsal, and evidence retention. Do not infer cutover from an adapter or unit test.
+- Keep source packs disabled where rights/endpoints are unverified. Distinguish implemented, partial, proposed, externally blocked, and unverified.
+- Production §47 stays open until environment identity, migration ledger, source/provider rights, runtime binding, deployment SHA, observability, operator rollback, and live behavior are demonstrated.

 ## Tests

-- Migration metadata, schema/snapshot consistency, replay and rollback-plan checks.
+- Run only non-schema-destructive inventory, acceptance-map, section-validator, and diff checks while the marker is active. Migration metadata/snapshot, replay, and rollback checks wait for the designated schema-owner window and safe target environment.

 ## Acceptance

 Spec 266 §47 is not locally closable until environment and provider proof exists.
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
