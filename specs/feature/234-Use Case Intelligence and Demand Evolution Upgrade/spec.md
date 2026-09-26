---
spec_id: 234
title: SmartAIHub Use Case Intelligence and Demand Evolution Upgrade
revision: 3.0
status: R3 SECOND TEN-PASS REVIEWED DESIGN — live schema/production certification pending
created: 2026-09-23
reviewed: 2026-09-24
suggested_repository_path: specs/feature/234-use-case-intelligence-demand-evolution-upgrade/spec.md
baseline: Spec 212 design/corpus baseline; preserve any verified deployed contracts and original R20/corpus lineage, but do not infer runtime import or certification from the repository documents
owners: Use Case Intelligence / Marketplace / Capability Lab / Product Intelligence
companions: ["Spec 212 design/corpus baseline pending runtime verification", "Spec 233", "Spec 220", "Spec 229", "Spec 228", "Spec 221", "Spec 209", "Spec 214", "Spec 215", "Spec 226"]
optional_downstream_integrations: ["Spec 235"]
implementation_strategy: additive-adapter-shadow-canary
risk_class: medium-high
---

# Spec 234 — SmartAIHub Use Case Intelligence & Demand Evolution Upgrade

**Revision:** R3 second ten-pass hardening; source-alignment corrections supersede conflicting R1/R2 status wording.

**Scope:** Extend the Spec 212 Use Case/Marketplace/Capability Lab design and any runtime contracts that are proven present with privacy-governed user-demand clustering, reuse-first solution matching, approved new use-case admission, and capability-release re-evaluation. **This is not a revision of Spec 212 or a request to reimplement any verified deployed contract; the first implementation step must fail closed if the expected Spec 212 runtime owner is absent.**

## 0. Baseline freeze / non-negotiable rules

- Spec 212's R20 corpus and design contracts are available as a historical baseline in this checkout, but a deployed API, database schema, stable `use_case_id` registry, imported corpus, benchmark evidence and publication workflow are **not proven by those documents alone**. Preserve each contract only after its current source/migration/deployment owner is verified; otherwise keep this upgrade in design/adapter-only state and do not mint IDs.
- Before coding, inspect the actual deployed Spec 212 schema/services/registry/corpus digest, existing dedup/capability-validation and admin UI. Reuse current admission/publication APIs; create versioned adapters only for truly missing contracts. Any incompatible migration requires an independently approved expand/migrate/contract plan.
- Spec 233 owns private Project Memory, Need/Gap Registry and Product Evolution approval. Spec 234 owns **the upgrade boundary** that turns eligible, approved Need/Gap candidates into Spec 212-compatible Use Case/Variant actions. Spec 212 remains the authority for final Use Case identity, validation, certification, Marketplace publication and variant lineage.
- Spec 229 is the only Retrieval Broker. Spec 220 is authorization/privacy authority. Specs 209/214/215 own authoring/node/compiler/runtime. Spec 234 shall not create a parallel retrieval engine, canonical use-case table, compiler, execution queue or product backlog.
- **No private question, user research, unpublished private Workflow or tenant-specific secret becomes a platform-level demand signal automatically.** Project-level evolution may remain wholly private; platform-level aggregation requires policy eligibility and owner authorization.
- Spec 224 is currently in progress. No direct Spec 234→224 integration. Development proposals flow through Spec 233 → future Spec 235 after its explicit integration gate.

## 1. Problem, goal and non-goals

Users phrase similar goals differently. Existing catalog coverage may be excellent yet remain difficult to discover; conversely user needs may expose composition, Skill, workflow, UI or platform gaps. The upgrade should recognize true semantic identity, propose reuse, reveal gaps and improve recommendations **without minting a new Use Case for every chat utterance**.

Deliverables: `UseCaseDemandBridge`, `CanonicalNeedMatcher`, `SolutionCoverageEvaluator`, `CapabilityReleaseImpactWorker`, `UseCaseEvolutionReviewUI`, evaluation corpus, audit events and versioned Spec 212 adapter. Non-goals: replacing existing marketplace, changing existing UC IDs, crawling all private chats, reembedding all 2,930 examples after every release, releasing unverified AI-generated workflows.

## 2. Data-contract boundaries

All contracts are additive envelopes and SHALL map to verified deployed Spec 212 identifiers before promotion.

```ts
type AdmissionClass = 'MATCH_EXISTING'|'VARIANT_OF_EXISTING'|'RELATED_ONLY'|'NEW_CANDIDATE'|'INSUFFICIENT_EVIDENCE';
type DemandVisibility = 'PROJECT_ONLY'|'SHARED_PROJECT'|'TENANT_ELIGIBLE'|'PLATFORM_ELIGIBLE';
interface UseCaseDemandCandidate {
  candidateId: string; tenantId: string; projectRef?: string;
  canonicalNeedRef: string; goal: string; desiredOutcome: string;
  constraints: string[]; permittedSourceRefs: string[];
  visibility: DemandVisibility; privacyPolicyVersion: string;
  sourceDigest: string; sourceConsentRef?: string;
  createdAt: string; schemaVersion: string;
}
interface DemandResolution {
  candidateId: string; admissionClass: AdmissionClass;
  existingUseCaseIds: string[]; existingVariantRefs: string[];
  composableCapabilityRefs: string[]; missingCapabilityRefs: string[];
  unsupportedAssumptions: string[]; evidenceRefs: string[];
  coverageStatus: 'SUPPORTED'|'COMPOSABLE'|'PARTIAL'|'PLANNED'|'UNSUPPORTED'|'UNKNOWN';
  registryVersion: string; snapshotTime: string; policyVersion: string;
  duplicateFingerprint: string; needsHumanReview: boolean;
}
interface UseCaseAdmissionReceipt {
  bridgeRequestId: string; canonicalNeedRef: string;
  existingOrNewUseCaseId?: string; approvedVariantRefs: string[];
  sourceEligibilityProofRef: string; spec212AdmissionReceiptRef: string;
  publishedVersion?: string; state: 'REJECTED'|'LINKED'|'DRAFT'|'PUBLISHED';
}
```

Stored local candidate refs may remain private in Spec 233; Spec 234 should persist only minimal bridge state, receipts and approved-safe projections. User count is **not** a claim about distinct demand unless deduplicated by eligible stable principals; do not allow deanonymization of rare needs through an admin UI.

## 3. Reuse-first resolution pipeline

1. Validate project/tenant scope and explicit permission to process the candidate; reject or retain privately where central processing is ineligible.
2. Normalize paraphrases in Thai, English and mixed language; preserve goal, side effects, privacy/security semantics and critical constraints. Keep immutable input digest and model/profile version.
3. Retrieve candidate existing Use Cases through Spec 229; use exact IDs/keywords before semantic retrieval when available. The output is candidate evidence, **not** a final identity assignment.
4. Deterministically compare against current Spec 212 semantic-identity rules and versioned registry; invoke a domain-aware reviewer for materially different outcome, side effects, privacy or data requirements.
5. Attempt existing certified Solution Variants, then composition of available Skills/Workflow Node contracts; require current compatibility, entitlement, health and tenant-specific provider availability.
6. Check Spec 233 private/eligible pending and approved gap records plus active future Spec 235 development links. Distinguish `SAME_NEED`, `RELATED_NEED`, `SAME_PRIMITIVE_DIFFERENT_GOAL`, and `TRUE_NEW_GAP`.
7. Return a transparent `DemandResolution` with supporting evidence, coverage unknowns, feasible workaround and low-change improvement path. Existing-but-hidden capabilities should yield a discoverability fix rather than development.
8. Only after explicit approval through established Spec 212 admission APIs may a canonical Use Case identity or Solution Variant be published. Preserve R20 numbering and lineage; newly admitted IDs must be assigned by the canonical service, not invented by LLM or Spec 234.

Model suggestions may enrich synonyms/categories, never set policy, permission, certified readiness, ledger or marketplace publication state. Keep exact title/code identifiers searchable even when paraphrase embeddings are evicted.

## 4. Demand clustering and dedup

Canonical-need equivalence requires matching desired outcome and materially matching side effects, safety/privacy semantics, target domain and core constraints; semantic similarity alone is insufficient. Group examples by intent but preserve different experiments/variants when users genuinely request different algorithms. Support merge, unmerge, supersedes and false-positive review with immutable audit history. Recheck clusters when normalizer/model versions change. Do not count multiple turns from one user as independent demand by default; apply anti-spam and tenant-fair aggregation.

Do not emit admin demand analytics for private/rare sensitive requests unless privacy and aggregation thresholds are satisfied, with authorized declassification if relevant. A private Project may still show its owner a private gap and implement it privately. The possibility of cross-user reuse is **not** a license to share private research.

## 5. Capability release / impact-aware update

Subscribe to signed/versioned Capability Registry release, revocation, version-change and availability events, with transactional outbox or an existing reliable event contract. Maintain reverse dependency refs from capability→affected Use Case/Variant/gap/project, not one embedding per combination. On release:

- select affected Use Cases/Variants by dependency graph and compatibility predicates;
- validate availability, contracts, model/provider profile, locale, entitlement, billing and runtime evidence;
- enqueue bounded impact jobs under canonical `worker_jobs` with idempotency key `(capability_id, version, affected_usecase_id, evaluator_profile)`;
- update **candidate** readiness and invoke existing Spec 212 validation/re-certification for publication status;
- ask Spec 229 to refresh only changed searchable projections;
- notify Spec 233 of policy-eligible gap-fulfilment receipts, never of unverified self-declared capability claims.

A released capability MAY remain unavailable for a specific tenant or private runner. Declared, deployed, health-verified and independently certified statuses SHALL be presented separately. Revocation/unhealthy status must invalidate stale recommendation readiness and in-flight preflight approvals.

## 6. Solution recommendations and action interface

A product chat answer may link existing relevant menu/action, start a certified variant where authorized, offer a compliant alternative, ask for missing inputs or propose a private gap. It MUST NOT advertise a `Create app`/`Run` control when its entitlement/availability checks fail. New ideas are not existing functionality. Show estimated cost, uncertainty, dependency/license/ownership and input data required where relevant; cost estimates are not charge authority.

Publish versioned `UseCaseSolutionProjection` and `UseCaseImpactReceipt` to Spec 233/Product Intelligence, with explicit evidence confidence and `NOT_YET_VERIFIED` states. Spec 229 may index these projections, but cannot be the canonical registry. Do not route product recommendations through code-search-only mechanisms.

## 7. UI/API requirements

Owner Project UI: grouped needs, linked existing Use Cases, private candidate status, alternatives, associated research refs, opt-in promotion and correction controls. Admin (policy-eligible only): candidate review, linked existing catalog, dedup/merge/unmerge, unknown coverage, impacted certified variants, approval, audit and rollback. Creator/Marketplace: approved bilingual candidate drafts and dependency-aware version changes. Mobile/tablet: review and approve/decline must be usable without canvas/desktop; detailed comparison may deep-link to Web. Do not expose private research snippets in cross-user analytics.

All mutations are authorized server-side; a UI badge cannot authorize development or publication.

## 8. Incremental implementation without disturbing Spec 212

| Gate | Delivery | Exit evidence |
|---|---|---|
| P234.0 | Audit actual deployed Spec 212 contracts/corpus; identity/corpus checksum baseline | Documented baseline + no duplicate tables/routes |
| P234.1 | Read-only semantic candidate resolution + private project UX | Paraphrase, side-effect, privacy negative test suites pass |
| P234.2 | Reuse-first composition + current availability checks | No new Skill created where a certified existing variant suffices |
| P234.3 | Governed candidate bridge to existing Spec 212 admission | Approval receipts, idempotency and rollback verified |
| P234.4 | Capability release reverse-impact worker | Targeted refresh with no full corpus regeneration |
| P234.5 | Admin demand review, metrics and shadow/canary launch | Leakage/redaction, rate-limit, cost and rollback gates |

Roll out read-only first, then owner-private suggestions, then only policy-eligible admin aggregation, then admission. Feature flag per tenant; return legacy Spec 212 search behavior if extension fails. Do not change certified legacy output semantics in the first release.

## 9. Acceptance tests / blockers

Mandatory test matrix:

- Five Thai/English paraphrases with one goal map to one eligible canonical need, without conflating distinct side effects or sensitive domains.
- Existing certified matching variant → `MATCH_EXISTING`, zero new UC and zero new Skill/Workflow.
- Existing separate compatible components → `COMPOSABLE`, proposed workflow pending normal Spec 215 compile/eval.
- Unverified/similarity-only candidate → `INSUFFICIENT_EVIDENCE` or `UNKNOWN`, not `SUPPORTED`.
- Existing in-development private gap → link/reuse where authorized, do not leak cross-project existence.
- Unauthorized private source → no central ingestion, provider forwarding, admin demand signal or trace leak.
- Approved new UC → Spec 212 canonical API assigns ID; legacy 2,930 ID semantics and bilingual version history unchanged.
- Newly shipped capability → only affected variants revalidated; unrelated indexed entities unchanged.
- Revoked capability → previously supported solution becomes unavailable where applicable, with audit.
- Event replay and duplicate callback → one linked/admitted record and idempotent impact updates.
- Spec 224 integration unavailable → bridge reports a pending development request to Spec 233, never mutates Spec 224.
- Degraded Spec 229 → exact/catalog fallback and honest uncertainty, no fake absence claims.

**DoD:** shipped only after backward-compatibility tests against live Spec 212 baseline, privacy isolation, seeded corpus fixtures, negative tests, admin/owner usability, reliable events and rollback success. A successful design review is not production certification.

## 10. Repository/numbering controls

The numbering `234` is provisional until checking the live main branch, authoritative Spec registry and open PR/worktrees. A collision requires STOP and coordinated renumbering; never overwrite a different Spec. Keep Spec 212 R20 (or verified actual deployed baseline) immutable. The retired file `spec-212-r21-living-use-case-demand-alignment.md` from the preliminary Spec 233 pack must **not** be merged as a Spec 212 revision; its desired additions are superseded by this independent Spec 234.

---

# Revision 2 — Ten-Pass Production Hardening (Normative)

**Date:** 2026-09-24. **Precedence:** R3 supersedes any conflicting R1/R2 contract, status, admission, eligibility or integration statement. This is an additive upgrade around the Spec 212 design/corpus baseline, not a revision of Spec 212. Runtime behavior is not assumed merely from a design document; the Spec 212 owner must be discovered and verified before any write path. Spec 235 is an optional downstream consumer, never a build-time or schema prerequisite for P234.0–P234.5.

## R2.1 Ownership, dependency DAG and deployed-contract discovery [Audit 01]

The build-time order is: existing Spec 212/Capability Registry/Spec 220 authorization + Spec 229 retrieval → Spec 233 eligible Need projection when available → Spec 234 read-only resolution → governed admission into **existing Spec 212**. Product Evolution handoff via 235 is an optional later output; it is not required to search, classify, certify or admit Use Cases. Spec 233 P0–P4 never waits for 234. No bidirectional synchronous call is permitted across the 233 ↔ 234 boundary; use bounded request/response for discovery and versioned asynchronous domain events for lifecycle updates.

P234.0 SHALL produce a signed or otherwise tamper-evident deployment-specific `Spec212ContractInventory` describing actual API/schema versions, installed identity rules, canonical corpus digest and import count, publication/validation endpoints, status mapping, capability evidence requirements and adapter gaps. Contract inventory is a discovery artifact, **not** permission to create missing 212 endpoints in place. Missing admission APIs keep R2 in read-only/export mode; provider unavailable is `UNKNOWN`, not `UNSUPPORTED`.

## R2.2 Typed source eligibility and minimization [Audit 02]

An eligible signal requires distinct grants for: private-project matching; authorized shared-project use; tenant-level counting; cross-tenant/platform demand aggregation; and external-provider processing. Grants SHALL name purpose, resource revision or bounded category, principal/tenant, policy revision, ACL epoch, validity window, approved projection digest and allowed recipients. Library storage permission alone does not authorize demand mining. Every query, cluster merge, UI render, provider egress and admission calls Spec 220's **current** policy; stale grants fail closed. Eligibility SHALL be reevaluated on owner withdrawal, source deletion, group removal or tenant transfer.

For cross-tenant analysis, transmit only approved declassified need projections where product policy expressly authorizes reuse; never hash, embed or leak raw sensitive user questions in shared indexes. Use scoped opaque candidate IDs and keyed, versioned tenant-local fingerprints for private duplicate detection. A fingerprint is not an identity credential or grounds for sharing; no cross-tenant membership oracle through search/count endpoints. Retention and deletion of derived vectors/receipts follow Spec 229/233 source lineage and policy; public artifacts affected by withdrawal are quarantined for lawful provenance review rather than silently retained or falsely promised removed from external providers.

The R1 `sourceConsentRef?` is a **backward-compatible wire field, not optional policy evidence** for eligible aggregation: the validator MUST enforce the following discriminated contract before processing:

```ts
type EligibilityGate =
  | { visibility: 'PROJECT_ONLY'; projectAccessProofRef: string }
  | { visibility: 'SHARED_PROJECT'; groupGrantRef: string; currentAclEpoch: string }
  | { visibility: 'TENANT_ELIGIBLE'|'PLATFORM_ELIGIBLE';
      sourceConsentRef: string; eligibilityProofRef: string;
      permittedPurpose: string; validUntil: string; currentAclEpoch: string };
```

A missing proof produces `PRIVATE_ONLY/ELIGIBILITY_UNKNOWN`; it must not be repaired by inferring consent from an upload or chat reply.

## R2.3 Canonical identity, multilingual stability and negative matches [Audit 03]

Reuse requires evaluation of `(goal, desired outcome, target domain, side effects, critical constraints, privacy/security posture)` against deployed Spec 212 identity semantics. Thai, English, mixed Thai-English and paraphrases are tested under pinned normalizer/embedding versions. Use an exact-ID/keyword lane before semantic candidates; semantics may retrieve related results but SHALL NOT mint `use_case_id`, resolve cross-tenant duplicates or override a materially distinct outcome. Material change in target population, high-risk domain, input provenance, data locality, privacy or side effects creates a **new candidate identity** or related/successor relation, subject to Spec 212 authority. Model upgrades initiate shadow reclustering and owner-visible merge/unmerge review; never mass-rewrite published IDs.

Decision evidence records `candidate_source_digest`, normalizer version, query/embedding profile, registry snapshot revision, existing UC/variant revisions, evidence quality and the human review outcome. Distinct experiments that share one platform primitive may remain distinct Use Cases or variants. Negative fixtures MUST include same words/different permissions, same goal/different side effects, multiple languages, private versus public sources and hazardous research requiring specialist controls.

## R2.4 Consistent coverage states and availability matrix [Audit 04]

The R1 `coverageStatus` remains a **coarse compatibility projection** only. R2 introduces versioned `CapabilityCoverageDetail`: `match = EXISTING | COMPOSED | REQUIRES_CONFIGURATION | NEW_CAPABILITY | UNKNOWN`; `engineering = NOT_NEEDED | PROPOSED | IN_PROGRESS | VERIFIED`; `release = NOT_RELEASED | RELEASED | REVOKED`; `runtime = NOT_DEPLOYED | DEPLOYED | HEALTH_VERIFIED | DEGRADED`; `principalAvailability = AVAILABLE | BLOCKED_POLICY | BLOCKED_ENTITLEMENT | BLOCKED_LOCATION | BLOCKED_DEPENDENCY | UNKNOWN`; and `snapshotRevision`, `policyEpoch`, `environment`, `providerProfile`, `ttl`, `evidenceRefs`.

A candidate may be marked `SUPPORTED` only when the actual target principal/environment has eligible entitlement, current health/certification at the required tier and a concrete callable path; `COMPOSABLE` requires a compiled, contract-checked Spec 215 plan or equivalent domain-certified composition. Missing/expired attestations produce `UNKNOWN`, never `SUPPORTED`. Internal current-status snapshots stay in the authoritative Capability Registry; 234 persists a TTL-bounded evaluation and not a parallel capability truth table. Recheck immediately before a run, publication or owner-visible `Ready` badge.

## R2.5 Conflict-free admission, consent withdrawal and lineage [Audit 05]

The only canonical admission API is the one actually found in Spec 212. `AdmissionIntent` includes `bridge_request_id`, `eligible_projection_ref/digest`, `principal/project/tenant`, `use_case_match_refs`, `proposed_change`, `locale_variants`, `approval_receipt_ref`, `consent_snapshot_ref`, `source_policy_epoch`, `expected_catalog_revision`, `idempotency_key` and expiration. Stage a proposed **draft** using an optimistic version precondition; final canonical ID/variant attribution is supplied by 212's authoritative receipt only. No `PUBLISHED` bridge state until its publication receipt is observed and independently refreshed against current 212 state. A denial or stale catalog returns conflict/re-review without auto-retrying into a new duplicate identity.

Owner withdrawal during review fences all pending admissions, shared projections and in-flight reindex jobs. If already published, quarantine affected metadata/derived public text and perform provenance/rights review with existing Marketplace policy before revision, delisting or retention. Never retroactively change historical audit receipts or falsely promise deletion of data already delivered to authorized external recipients. Publish compensation events and re-evaluate dependent 233 plans when a draft/variant is rejected, reverted, merged or revoked.

## R2.6 Event family, exact-once effects and dependency traversal [Audit 06]

The shared `SAH-EVOLUTION-1` envelope is a canonical **cross-spec exchange contract**, not a new job or lifecycle authority:

```ts
interface EvolutionEventV1 {
  schemaVersion: '1.0'; eventId: string;
  eventType: 'NEED_ELIGIBLE'|'NEED_WITHDRAWN'|'CAPABILITY_RELEASE_VERIFIED'|
    'CAPABILITY_REVOKED'|'USE_CASE_ADMISSION_ACCEPTED'|'USE_CASE_WITHDRAWN'|
    'PROPOSAL_APPROVED'|'PROPOSAL_REVOKED'|'DEV_HANDOFF_ACKED'|
    'DEV_FINAL_VERIFY_OBSERVED'|'CAPABILITY_AVAILABLE';
  publisherAuthority: 'SPEC_233'|'CAPABILITY_REGISTRY'|'SPEC_212'|'SPEC_224'|'RELEASE_OWNER'|'SPEC_234'|'SPEC_235';
  aggregateId: string; aggregateRevision: string;
  tenantId: string; projectId?: string; visibility: 'PROJECT'|'TENANT'|'PLATFORM';
  aclEpoch: string; policyVersion: string; eligibilityProofRef?: string;
  sourceRef: string; payloadDigest: string; causalEventId?: string;
  occurredAt: string; idempotencyKey: string; retentionClass: string;
}
```

Event signatures or authenticated transport identity SHALL validate the declared publisher against an allowlist; a consumer never trusts `publisherAuthority` solely because a JSON field says so. Spec 234 may consume only eligible 233 projections and verified registry releases; `CAPABILITY_AVAILABLE` requires a separately authorized release-owner attestation, not a Spec 224 final result. Deliver through existing transactional outbox/`worker_jobs`, at-least-once with consumer inbox dedup, aggregate revision fencing, poison-message quarantine, replay cursor and monotonic transitions. A backfill does not re-admit already canonical 212 IDs. Large dependency maps belong in bounded/paginated SQL relation projections; include tombstone/supersedes edges and policy-scope filters, not a multiplicative vector per capability × user × case.

## R2.7 Demand privacy, fair counting and anti-spam [Audit 07]

Separate `mention_count`, eligible `distinct_principal_count` and `distinct_tenant_count`, with duplicate turns from the same source episode collapsed by a documented window and scope. Do not expose exact rare cohort counts, example quotes, embeddings or private project IDs to Admin or global analytics; minimum cohort/privacy thresholds are approved by Spec 220 governance and may suppress a cluster entirely. Aggregate exports MUST be insensitive to repeated querying or small cohort differencing, with rate limits and audited purpose. Global roadmap signals are **opt-in / eligible only**, and declassified public proposals should not retain reversible pointers to private research accessible to general Admin users.

Anti-spam gates include rate-limiting per principal and tenant, source trust weighting, replay detection and manual correction. Dedup false-positive/false-negative samples from each supported language are independently reviewed; usage is a prioritization input, not evidence that a speculative scientific hypothesis is true.

## R2.8 Index lifecycle and re-evaluation isolation [Audit 08]

All discovery uses Spec 229, including archived metadata/exact lookup when detailed vectors are evicted. Never conclude `NEW_CANDIDATE` because an index is cold, provider sync is paused or retrieval was partial. Before classifying a truly new gap, check the current authoritative 212 registry and authorized 233 planned/approved work. An affected Use Case refresh SHALL use a snapshot of capability + dependency version and policy epoch; stale jobs are discarded after rechecking registry revision. Selective reindex must emit provider-specific generation, source digest and mutation receipts; maintain tombstones to exclude withdrawn material immediately.

For any R2-backed AI Search index, files kept in canonical archive MUST be outside the include paths or explicitly excluded from scheduled sync. R2 source retention does not authorize permanent AI Search indexing. Reconciler tests SHALL wait through an actual sync boundary so a deleted Vector cannot be silently re-created by a connected R2 source. Official reference: https://developers.cloudflare.com/ai-search/configuration/data-source/r2/ and https://developers.cloudflare.com/ai-search/configuration/indexing/syncing/ .

## R2.9 Operator UI, economics, degraded operation and rollout [Audit 09]

Owner UI shows only eligible local need suggestions, provenance, privacy scope, existing-use-case comparison, `UNKNOWN` reasons, expected data inputs, owner approval, and lifecycle history. Admin UI receives aggregate-safe signals, compatibility evidence, false-merge correction, UC admission preview, reverse-impact diff, signed policy decisions and immutable audit links; it SHALL NOT offer a privilege-escalating one-click public promotion of a private source. All screens must work on mobile/tablet without requiring graph/canvas editing. Help-only and discoverability-only fixes use existing 196/226/228 surfaces, not developer handoff by default.

Set per-tenant and platform budgets for embedding/clustering, candidate verification, impact fan-out and external analysis. Prioritize interactive queries above background refresh; use bounded batch/backpressure, cancellation and dead-letter queues under existing 195/232 execution authority. When 233 eligible events, 229 retrieval or a provider are down, preserve legacy 212 catalog/search. When 235 is unavailable, a valid private unmet need remains queued in 233 with honest status and a manual review path, without generating a fictitious development task.

## R2.10 Independent certification and change-management gates [Audit 10]

P234.0–P234.5 require separate evidence packages; documentation completion alone is not production certification. Required suites: (a) old deployed 212 API/schema/corpus snapshot remains unchanged with feature flag off; (b) 100% of high-risk negative identity/privacy fixtures avoid unsafe merges and unauthorized disclosures; (c) replay of an admission intent 10× creates at most one canonical ID/variant; (d) authorization and consent revocation at every pipeline step blocks any further provider or public exposure; (e) release/revoke event races cannot leave a stale `SUPPORTED` recommendation; (f) cross-tenant/project enumeration tests produce no existence oracle; (g) cold catalog/exact lookup preserves classification or emits explicit `UNKNOWN`; (h) canary accuracy/latency/cost thresholds are calibrated against actual 212 baseline before promotion, with named product and privacy sign-off; (i) original 212 benchmark lineage remains stable; (j) disabling 234 instantly restores the old UI/routing without rewriting 212 content.

Maintain a versioned conformance test for the 233 eligible-projection event, 212 admission adapter, 220 policy decision, 229 retrieval result and optional 235 proposal association. Hold only the affected P234 slice when a companion contract is unavailable; do not block ongoing 224 baseline development or unrelated existing 212 operations. Before merge, check authoritative Git spec registry/default branch/open PRs/worktrees for number collisions and for changes already introduced by other teams.

# Revision 3 — Second Ten-Pass Systems & Future-Extensibility Hardening (Normative)

**Revision intent:** R3 preserves the verified portion of the Spec 212 design/corpus baseline and all R2 guarantees while closing additional gaps discovered by a second independent 10-pass review. Where R3 conflicts with R2, R3 controls only the new/clarified Spec 234 behavior; it never rewrites Spec 212.

## R3.1 Source lifecycle, invalidation and reconstructability [Audit 01]

A demand resolution is valid only while its cited evidence remains authorized and semantically current. Every `UseCaseDemandCandidate`, cluster decision, coverage decision and admission recommendation SHALL carry source revision/digest, ACL/policy epoch, extraction/normalizer profile and `validUntil` or revalidation rule where applicable. Source deletion, consent withdrawal, project deletion, supersession, material edit or access-policy change MUST emit or be discoverable as an invalidation signal.

Spec 234 SHALL NOT retain private source text merely to preserve a past cluster. It MAY retain privacy-safe immutable receipts/digests necessary for audit, subject to retention policy. If canonical evidence has been archived by Spec 233/229, a future review MUST rehydrate/re-read the authorized source before making a new semantic claim. A missing source results in `EVIDENCE_UNAVAILABLE`/`REQUIRES_REVALIDATION`, not silent reuse of a stale embedding. Reconstructed evidence SHALL pin the new source revision and never pretend it is byte-identical to an older source.

## R3.2 Concurrent admission, cluster merge and optimistic concurrency [Audit 02]

Two admins, workers or tenants can discover the same need concurrently. Admission, merge/unmerge, successor creation and variant linking MUST use canonical Spec 212 transactional/optimistic concurrency or a versioned Spec 234 bridge lock keyed by the canonical identity candidate; no process may allocate a Use Case ID independently. Requests SHALL carry `expected_registry_revision`/equivalent. A conflict triggers read-latest → recompute → retry/review, never last-write-wins semantic corruption.

Cluster operations are reversible and versioned. Merge SHALL preserve prior member IDs and source lineage; unmerge SHALL restore prior membership without recreating deleted private evidence. A concurrently published equivalent Use Case changes a pending `NEW_CANDIDATE` to `MATCH_EXISTING`/`VARIANT_OF_EXISTING` after re-evaluation rather than creating a duplicate.

## R3.3 Multilingual semantic drift and ontology/version governance [Audit 03]

Thai, English, mixed-language, transliterated Thai, domain jargon, acronyms and model/product names are first-class. Canonical identity MUST be language-independent; localized phrasing is a projection. Normalizer, taxonomy/ontology, embedding, reranker and translation profile versions SHALL be recorded independently. Upgrading any profile triggers bounded shadow re-evaluation against a frozen multilingual golden corpus before new clustering decisions can become authoritative.

The test corpus MUST include semantic negatives: same nouns but different desired outcomes, same outcome but materially different privacy/safety side effects, and culturally/domain-specific terms whose literal translation changes intent. Human corrections become labeled evaluation examples, not automatic global rules. Locale absence MUST degrade to `INSUFFICIENT_EVIDENCE`, not forced English normalization.

## R3.4 Trust, prompt-injection and evidence-quality boundary [Audit 04]

User text, uploaded documents, marketplace descriptions, reviews and retrieved content are untrusted evidence. They can describe a need but cannot alter system instructions, authorization, scoring weights, admission policy, tool grants or publication state. Spec 234 SHALL consume Spec 229 evidence with provenance/trust labels and apply field-level allowlists before passing content to normalization/classification models.

Coverage confidence SHALL separate retrieval confidence, semantic-identity confidence, capability-readiness evidence and human-review status. A high vector score never upgrades `UNKNOWN` to `SUPPORTED`; only authoritative capability/runtime evidence can do so. Malicious or contradictory evidence is retained as evidence with a dispute state where policy permits, not concatenated into a single asserted fact.

## R3.5 Privacy-preserving demand analytics and rare-pattern protection [Audit 05]

Platform demand analytics MUST operate only on explicitly eligible projections. Aggregation policy SHALL define configurable minimum cohort size, time window, tenant contribution cap, sensitive-domain exclusions and suppression for rare/highly identifying combinations. Exact user/project counts, source excerpts and tenant names SHALL NOT be exposed merely because a candidate is `PLATFORM_ELIGIBLE`.

Counts distinguish `eligible_events`, `eligible_principals`, `eligible_tenants`, `repeat_interest`, and `implemented_private_only`; they are never collapsed into a single popularity number. Product prioritization MAY use these signals but Spec 234 SHALL NOT rank people, infer protected/sensitive traits, or convert private research novelty into a platform roadmap signal without explicit authorization. Withdrawal removes future contribution and triggers recomputation where the privacy policy requires it; audit receipts may remain only under authorized retention.

## R3.6 Dependency graph, impact propagation and cycle control [Audit 06]

Capability→UseCase→Variant→Workflow/Skill dependency edges SHALL be typed (`REQUIRES`, `OPTIONAL`, `ALTERNATIVE`, `BLOCKS`, `SUPERSEDES`) and versioned. Impact traversal MUST enforce maximum depth/node budgets, visited-set cycle detection and causal idempotency. One capability release cannot recursively re-certify the entire catalog without an explicit bounded plan.

Revocation and downgrade propagation are as important as release promotion. If an upstream capability becomes unavailable, impacted cases transition to candidate degraded/partial state and invoke existing Spec 212 certification rules; Spec 234 never edits certified status directly. Composite solutions record the exact dependency set used for evaluation so future changes can target only affected variants.

## R3.7 Operational SLOs, backpressure, dead-letter and reconciliation [Audit 07]

Spec 234 SHALL expose measurable health for intake lag, dedup latency, impact-evaluation lag, failed/retried events, privacy suppression, stale evidence, registry conflicts and Spec 212 admission latency. Interactive user resolution and background catalog re-evaluation use separate quotas/priorities so a mass capability release cannot starve chat traffic.

Event consumers use bounded retries and a durable dead-letter/reconciliation path under canonical job infrastructure. `processed` means the deterministic side effect is committed or safely deduplicated, not merely that an LLM call returned. Scheduled reconciliation compares bridge receipts with canonical Spec 212 identities/variants and Spec 233 candidate states, repairing missing derived state without inventing authority. Operator replay requires scoped authorization and preserves original event identity plus replay reason.

## R3.8 Outcome feedback, usefulness evidence and non-self-fulfilling learning [Audit 08]

After a Use Case/Variant is published, Spec 234 MAY collect privacy-governed outcome signals such as discovery success, selected solution, execution completion, user correction, abandonment and explicit usefulness feedback. These are evidence for future evaluation, not automatic proof that the semantic cluster or solution is correct. Popularity cannot substitute for quality/certification.

Feedback loops MUST guard against self-reinforcement: recommendations shown more often naturally receive more selections. Offline evaluation and controlled exploration from Spec 222 MAY advise ranking experiments, but promotion remains governed by Spec 212/233 policy. Preserve counterfactual/position metadata where feasible, separate user preference from runtime success, and allow users/admins to correct a misclassified need without deleting historical evidence.

## R3.9 Portability, future domain expansion and specialized-verifier hooks [Audit 09]

The canonical Need/Use Case bridge SHALL remain domain-neutral and support future specialized domains (scientific research, regulated enterprise, simulation, education, media, commerce) through versioned policy/evaluator plugins rather than hard-coded domain columns. A specialized verifier can add evidence requirements and block publication but cannot bypass Spec 220 authorization, Spec 212 identity/certification or Spec 229 retrieval boundaries.

Export/import of eligible catalog intelligence SHALL use versioned schemas, stable IDs, provenance and explicit visibility; private demand evidence is excluded unless separately authorized. Unknown future artifact/capability types are represented through extensible typed refs plus capability descriptors, not by weakening validation to arbitrary JSON. Schema readers MUST ignore optional unknown fields safely while rejecting unknown security-critical semantics.

## R3.10 Release gates, rollback and second-cycle certification [Audit 10]

R3 implementation progresses through: (P234.0) deployed-contract inventory; (P234.1) read-only shadow matching; (P234.2) private/project recommendations; (P234.3) eligible demand clustering; (P234.4) bounded Spec 212 admission bridge; (P234.5) capability-impact re-evaluation; (P234.6) outcome feedback. Each phase has an independent feature flag/kill switch and rollback that removes Spec 234 effects without deleting canonical Spec 212 entities already validly published.

Mandatory R3 certification adds: source deletion/rehydration; concurrent duplicate admission; normalizer/embedding version drift; prompt-injection corpus; rare-demand suppression; dependency cycle/fan-out storm; dead-letter replay; feedback-selection bias; specialized verifier denial; rollback after partial admission; plus all R2 tests. Failure of Spec 233, 229, 234 analytics or optional 235 MUST NOT corrupt or disable any verified Spec 212 Marketplace surface. Production enablement requires runtime evidence from the deployed contracts; document review alone is insufficient.

## R3 consolidated invariants

1. Spec 212 remains the canonical Use Case/Variant authority and is never retroactively rewritten.
2. Spec 234 stores only bridge/derived state and reconstructable, policy-eligible evidence.
3. Semantic similarity is candidate evidence, never identity truth.
4. Private demand cannot become platform analytics/public catalog without explicit eligibility.
5. Source deletion/revocation invalidates dependent derived decisions and triggers bounded revalidation.
6. Concurrent admission cannot allocate duplicate canonical identities.
7. Capability release and revocation both propagate through bounded typed dependency graphs.
8. Retrieval/model/taxonomy changes are versioned and shadow-certified before affecting authoritative decisions.
9. Feedback improves evaluation but never self-promotes catalog or development work.
10. Spec 235 remains optional downstream; Spec 234 can operate safely without it.
