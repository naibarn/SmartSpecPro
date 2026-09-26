# Spec 244 R12 — Document Audit Report (Passes 133–144)

**Date:** 2026-09-25  
**Baseline:** verified mounted R11 main and companion, 132 recorded document-level design passes, A01–A144.  
**Method:** twelve separate contract-focused gap audits against R11; each yielded a distinct additive normative subsection, deterministic fixture and companion W16 slice.  
**Status:** DOCUMENT/ARCHITECTURE AUDIT ONLY. No implementation, deployed API, authenticated source, live supplier or provider certification.

## Findings and corrections

| Pass | Audit focus | Concrete issue in R11 | Implemented R12 repair | Scenario |
|---|---|---|---|---|
| 133 | Source identity spoofing and counterpart authenticity | A copied manufacturer site and an unknown marketplace seller both claim to be the official brand; separate content agreement from operator identity and purchase eligibility. | §13DM `SupplierIdentityReceipt` with explicit fail-closed path and typed receipts | A145 |
| 134 | Complex-document table, footnote and unit binding | A PDF manual table has similar variants in adjacent columns; naive span citation pairs dimensions with the wrong variant or omits a safety footnote. | §13DN `StructuredExtractionProof` with explicit fail-closed path and typed receipts | A146 |
| 135 | Search representativeness versus apparent coverage | Top-ranked online offers can dominate research despite region-specific offline channels and sponsor-biased crawler access; visited URL counts alone do not establish market coverage. | §13DO `SearchSamplingDisclosure` with explicit fail-closed path and typed receipts | A147 |
| 136 | Interval-aware multi-objective option presentation | A recommendation can dominate on midpoint price while losing under shipping, uncertainty, deadline and user-important qualitative preferences. | §13DP `RobustOptionFrontier` with explicit fail-closed path and typed receipts | A148 |
| 137 | Goal pivot changes domain and risk class | An image concept is approved for inspiration and later reused as a purchase or engineering plan without rerunning stricter validation after the goal changes. | §13DQ `IntentRiskTransitionReceipt` with explicit fail-closed path and typed receipts | A149 |
| 138 | Shared sub-research across competing solution branches | Two branches request the same expensive manual lookup; duplicate paid calls waste budget, but canceling one branch can incorrectly delete the other branch’s authorized evidence. | §13DR `SharedResearchDependencyLease` with explicit fail-closed path and typed receipts | A150 |
| 139 | Tool and provider identity at execution time | A research provider/tool advertises a new capability or schema after registration, and a silently substituted adapter could gain wider access or return incompatible results. | §13DS `CapabilitySupplyChainReceipt` with explicit fail-closed path and typed receipts | A151 |
| 140 | Post-cancel provider billing and unknown effect settlement | A paid provider charges after a task is canceled or reports an ambiguous callback, while the UI prematurely shows all reserved credits refunded or retries the external effect. | §13DT `ExternalCostReconciliationReceipt` with explicit fail-closed path and typed receipts | A152 |
| 141 | Targeted partial-edit preservation for visual and nonvisual artifacts | A user asks to change one chair in an accepted generated image, but whole-scene regeneration alters floor color, room shape, 3D geometry or other accepted components. | §13DU `ArtifactPatchPreservationContract` with explicit fail-closed path and typed receipts | A153 |
| 142 | Must-include evidence assembly before consequential decisions | A long-lived project has material contradictory findings stored correctly, but retrieval/context compression omits one at decision time and the LLM issues overconfident advice. | §13DV `DecisionContextCompletenessProof` with explicit fail-closed path and typed receipts | A154 |
| 143 | Disputed user/expert corrections without silent truth promotion | A protected human correction conflicts with instrumented observation or a later qualified reviewer; always trusting latest human edit can cement an incorrect physical or technical fact. | §13DW `CorrectionAdjudicationRecord` with explicit fail-closed path and typed receipts | A155 |
| 144 | Provider-wide quality/security incident blast-radius containment | A provider update introduces systematic corrupt dimensions or rights problems across many projects; per-project stale-source checks are too slow and can leak affected outputs into new deliveries. | §13DX `ProviderIncidentImpactManifest` with explicit fail-closed path and typed receipts | A156 |

## Review execution records

### Pass 133 — Source identity spoofing and counterpart authenticity

**Gap observed:** A copied manufacturer site and an unknown marketplace seller both claim to be the official brand; separate content agreement from operator identity and purchase eligibility.

**Correction in main spec:** §13DM requires `SupplierIdentityReceipt` and integrates with existing canonical owners.

**Verification fixture:** A145 — Fake manufacturer clone copies a correct manual and posts the lowest price; Agent keeps the technical manual claim independent from unverified merchant legitimacy and blocks any authoritative purchase/warranty assertion.

### Pass 134 — Complex-document table, footnote and unit binding

**Gap observed:** A PDF manual table has similar variants in adjacent columns; naive span citation pairs dimensions with the wrong variant or omits a safety footnote.

**Correction in main spec:** §13DN requires `StructuredExtractionProof` and integrates with existing canonical owners.

**Verification fixture:** A146 — A scanned manual places 30 kg and 15 kg under adjacent mounting modes, with a footnote excluding masonry anchors; extraction must preserve the correct column, mode and exclusion or refuse technical certification.

### Pass 135 — Search representativeness versus apparent coverage

**Gap observed:** Top-ranked online offers can dominate research despite region-specific offline channels and sponsor-biased crawler access; visited URL counts alone do not establish market coverage.

**Correction in main spec:** §13DO requires `SearchSamplingDisclosure` and integrates with existing canonical owners.

**Verification fixture:** A147 — Ten shopping results all come from one marketplace while regional dealers are unsearched; result identifies the missing channel and requests bounded follow-up instead of claiming the lowest nationwide price.

### Pass 136 — Interval-aware multi-objective option presentation

**Gap observed:** A recommendation can dominate on midpoint price while losing under shipping, uncertainty, deadline and user-important qualitative preferences.

**Correction in main spec:** §13DP requires `RobustOptionFrontier` and integrates with existing canonical owners.

**Verification fixture:** A148 — A fast local supplier is more expensive but reliable, while a cheaper remote supplier has uncertain delivery; system exposes the trade-off and does not auto-select by mean price.

### Pass 137 — Goal pivot changes domain and risk class

**Gap observed:** An image concept is approved for inspiration and later reused as a purchase or engineering plan without rerunning stricter validation after the goal changes.

**Correction in main spec:** §13DQ requires `IntentRiskTransitionReceipt` and integrates with existing canonical owners.

**Verification fixture:** A149 — User turns a previously approved decorative mockup into a wall-mounted installation plan; current branch becomes conditional until site measurement, specialist checks and new effect-scoped approvals complete.

### Pass 138 — Shared sub-research across competing solution branches

**Gap observed:** Two branches request the same expensive manual lookup; duplicate paid calls waste budget, but canceling one branch can incorrectly delete the other branch’s authorized evidence.

**Correction in main spec:** §13DR requires `SharedResearchDependencyLease` and integrates with existing canonical owners.

**Verification fixture:** A150 — Two branches share one authorized manual parse; user cancels branch A while branch B still needs the result. B proceeds once, A loses its derivative access, and cost is attributed by actual authorized receipts.

### Pass 139 — Tool and provider identity at execution time

**Gap observed:** A research provider/tool advertises a new capability or schema after registration, and a silently substituted adapter could gain wider access or return incompatible results.

**Correction in main spec:** §13DS requires `CapabilitySupplyChainReceipt` and integrates with existing canonical owners.

**Verification fixture:** A151 — An external harness changes its declared file-system scope after an update; execution is blocked and the old allowed read-only research path remains available without granting the new scope.

### Pass 140 — Post-cancel provider billing and unknown effect settlement

**Gap observed:** A paid provider charges after a task is canceled or reports an ambiguous callback, while the UI prematurely shows all reserved credits refunded or retries the external effect.

**Correction in main spec:** §13DT requires `ExternalCostReconciliationReceipt` and integrates with existing canonical owners.

**Verification fixture:** A152 — Video provider completes charge after cancellation but callback is lost; user sees canceled task and pending charge separately, retry cannot double-purchase, and final ledger reconciles the later invoice.

### Pass 141 — Targeted partial-edit preservation for visual and nonvisual artifacts

**Gap observed:** A user asks to change one chair in an accepted generated image, but whole-scene regeneration alters floor color, room shape, 3D geometry or other accepted components.

**Correction in main spec:** §13DU requires `ArtifactPatchPreservationContract` and integrates with existing canonical owners.

**Verification fixture:** A153 — Only the chair should change in a selected image; returned edit recolors the approved floor and moves the door, so system flags the regression and retains the accepted version while offering local compositing or optional 3D.

### Pass 142 — Must-include evidence assembly before consequential decisions

**Gap observed:** A long-lived project has material contradictory findings stored correctly, but retrieval/context compression omits one at decision time and the LLM issues overconfident advice.

**Correction in main spec:** §13DV requires `DecisionContextCompletenessProof` and integrates with existing canonical owners.

**Verification fixture:** A154 — A prior expert warning about a load limit is old and ranks below recent marketing pages; proposed installation cannot become verified until the required warning is retrieved or explicitly reported inaccessible.

### Pass 143 — Disputed user/expert corrections without silent truth promotion

**Gap observed:** A protected human correction conflicts with instrumented observation or a later qualified reviewer; always trusting latest human edit can cement an incorrect physical or technical fact.

**Correction in main spec:** §13DW requires `CorrectionAdjudicationRecord` and integrates with existing canonical owners.

**Verification fixture:** A155 — User manually corrects a beam dimension, while a later survey report disagrees; system preserves both sources and requests reconciled measurement rather than overwriting either or approving the build.

### Pass 144 — Provider-wide quality/security incident blast-radius containment

**Gap observed:** A provider update introduces systematic corrupt dimensions or rights problems across many projects; per-project stale-source checks are too slow and can leak affected outputs into new deliveries.

**Correction in main spec:** §13DX requires `ProviderIncidentImpactManifest` and integrates with existing canonical owners.

**Verification fixture:** A156 — A media provider silently changes a model and begins altering product labels in approved ads; affected versions are identified, new unsafe releases paused, each tenant sees only its impacted assets and validated re-generation can resume by canary.

## R12 cross-spec invariants

- Specs 1–213 remain frozen; Spec 224 active implementation is untouched, with any approved product-development handoff solely through the separately certified Spec 235 bridge.
- Feature 196/226 handles scoped Chat commands; Spec 240 Mini Chat is deployed/contract verified before enabling embedded actions and never borrows publisher privileges.
- Spec 233 remains Living Project/goal/decision authority; Spec 229 owns retrieval; Spec 220 permission; Spec 207 money; worker_jobs physical job truth; R2/Library durable assets and Vectorize searchable projection.
- Research, code/harness, image, video and 3D branches remain independent, optional modalities with shared claims/goal and validation boundaries; no domain-specific mandatory 3D.
- New control-plane receipts are scoped projections/contracts, not parallel source-of-truth data stores, agent runtimes or finance ledgers.

## Implementation and review limitations

R12 is a proposed specification revision. Do not equate accepted Markdown fixtures with passing tests or production certification. Authoritative numbering, actual deployed schemas, external provider rights and contracts, human/domain certifications, feature flags, staged canary and chaos tests remain unverified in this document-only review.
