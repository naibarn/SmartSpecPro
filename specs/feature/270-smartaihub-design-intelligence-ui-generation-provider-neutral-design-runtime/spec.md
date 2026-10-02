---
spec_id: 270
title: SmartAIHub Design Intelligence, UI Generation & Provider-Neutral Design Runtime
revision: 1.4
date: 2026-10-02
status: FOURTH_REVIEW_HARDENED_IMPLEMENTATION_READY_PENDING_G0
scope: Platform-wide / Additive / Design-time subsystem / Mini App + SmartAIHub Core UI
risk_class: MEDIUM_HIGH
numbering_status: PROVISIONAL_UNTIL_CANONICAL_SPEC_REGISTRY_CHECK
review_rounds: 60
review_date: 2026-10-02
supersedes:
  - SPEC-270-SmartAIHub-Design-Intelligence-UI-Generation-Provider-Neutral-Design-Runtime-R1.0.md
  - SPEC-270-SmartAIHub-Design-Intelligence-UI-Generation-Provider-Neutral-Design-Runtime-R1.1.md
  - SPEC-270-SmartAIHub-Design-Intelligence-UI-Generation-Provider-Neutral-Design-Runtime-R1.2.md
  - SPEC-270-SmartAIHub-Design-Intelligence-UI-Generation-Provider-Neutral-Design-Runtime-R1.3.md
reviewed_against:
  - Spec 224 Revision 22 Development Orchestrator contracts
  - Spec 256 R1.2 Skill-first Capability Discovery contracts
  - Spec 261 v1.4.0 SPAAS portable application contracts
  - Spec 267 R2 Cloudflare production/execution boundaries
  - Spec 269 R2.3 Assistant/delegation boundaries
primary_owner: SmartAIHub Design Intelligence Platform
canonical_development_orchestrator: Spec 224
canonical_skill_capability_authority: Spec 256
canonical_portable_application_standard: Spec 261 SPAAS
canonical_assistant_authority: Spec 269
canonical_ui_foundation: Astryx + SmartAIHub Product Components
canonical_design_artifact_authority: Spec 270
canonical_external_design_provider_policy: Spec 270
implemented_dependencies_read_only:
  - Spec 224 Autonomous Development Orchestrator Runtime
  - Spec 256 Skill-first Capability Catalog & Intent Routing
normative_language: RFC-style MUST / MUST NOT / SHOULD / SHOULD NOT / MAY
provider_policy: Stitch-enhanced, not Stitch-dependent
runtime_policy: External design providers are DESIGN-TIME ONLY unless a future spec explicitly defines otherwise
feature_flags:
  design_intelligence.enabled: false
  design_intelligence.native.enabled: false
  design_intelligence.astryx_resolver.enabled: false
  design_intelligence.external_providers.enabled: false
  design_intelligence.google_stitch.enabled: false
  design_intelligence.visual_verify.enabled: false
  design_intelligence.performance_verify.enabled: false
  design_intelligence.theme_matrix_verify.enabled: false
  design_intelligence.provider_cleanup.enabled: false
  design_intelligence.cache.enabled: false
  design_intelligence.dynamic_content_verify.enabled: false
  design_intelligence.semantic_diff.enabled: false
  design_intelligence.compatibility_matrix.enabled: false
  design_intelligence.offline_degraded_verify.enabled: false
  design_intelligence.portable_export.enabled: false
  design_intelligence.post_release_feedback.enabled: false
  design_intelligence.core_product_self_design.enabled: false
reference_implementations:
  - Google Stitch MCP / SDK / Stitch Skills
  - Astryx Design System
---

# Spec 270 — SmartAIHub Design Intelligence, UI Generation & Provider-Neutral Design Runtime R1.4

## 0. Executive decision


## 0.0 G0 implementation reconciliation gate

Before DDL, production feature enablement, provider credential onboarding, or modification of an existing Spec 224/256 contract, implementation MUST complete a **G0 reconciliation** against the live SmartSpecPro repository and canonical spec registry.

G0 MUST establish:

```text
SPEC_NUMBER_UNIQUE
LIVE_SCHEMA_RECONCILED
EXISTING_COMPONENT_CATALOG_DISCOVERED
EXISTING_CAPABILITY_REGISTRY_DISCOVERED
EXISTING_SECRET_BINDING_PATH_REUSED
EXISTING_JOB/APPROVAL/AUDIT_AUTHORITIES_REUSED
CURRENT_ASTRYX_VERSION_PINNED
CURRENT_STITCH_CAPABILITIES_PROBED
FEATURE_FLAGS_DEFAULT_OFF
NO_DUPLICATE_CANONICAL_AUTHORITY
```

If `270` is already occupied by a different canonical specification, only this proposal SHALL be renumbered; existing implemented specifications MUST NOT be renumbered to make room for it.

A similar live implementation contract always wins over creating a duplicate schema/service. The implementation SHALL record a `DesignIntegrationReconciliationRecord` describing reuse, adapter mappings, unavoidable new objects, and any unresolved collision.

---

SmartAIHub SHALL introduce a canonical **Design Intelligence layer** for creating, evolving, reviewing, and verifying user interfaces for:

1. SmartAIHub Mini Apps;
2. SmartAIHub core product surfaces;
3. tenant/white-label applications;
4. portable applications produced through the SmartAIHub development runtime;
5. future creator products that need design assistance without requiring a professional designer.

This layer SHALL be **provider-neutral**.

Google Stitch MAY be used as a specialized external design provider when the user has connected an eligible Google/Stitch credential, but **Google Stitch MUST NOT be required for successful Mini App creation, SmartAIHub development, application build, deployment, maintenance, or runtime execution**.

The canonical architectural rule is:

> **Stitch-enhanced, not Stitch-dependent.**

The production UI foundation remains:

```text
SmartAIHub Product Components
        +
Astryx components / patterns / themes
        +
SmartAIHub UI policy
        +
Canonical design artifacts
```

The development authority remains **Spec 224**.  
The capability and skill-routing authority remains **Spec 256**.

Spec 270 SHALL NOT replace either subsystem. It provides a design-intelligence capability that they consume.

The target pipeline is:

```text
User / Product Requirement
          │
          ▼
Solution / Design Complexity Decision
          │
          ├── Existing UI/component sufficient
          │       └── Reuse directly
          │
          ├── Native design assistance sufficient
          │       └── SmartAIHub Native Design
          │
          └── Specialized design exploration useful
                  ├── Google Stitch, when connected
                  └── Future provider(s)
                          │
                          ▼
              Canonical Design Artifact
                          │
                          ▼
                 Astryx Resolver
                          │
                          ▼
                     Spec 224
                          │
          Plan → Implement → Test → Visual QA
                          │
                          ▼
                   Production UI
```

External design services are therefore **design-time accelerators**, never hidden runtime dependencies.

### R1.1 hardening summary

R1.1 preserves the R1.0 provider-neutral architecture and adds implementation-critical controls for:

- live-spec/repository reconciliation before schema work;
- UI-to-real-capability truthfulness;
- immutable design versions and concurrent editing;
- approval freshness;
- provider capability certification;
- provider-call idempotency/cancellation;
- asset rights/licensing;
- localization and Thai/English/RTL behavior;
- structured accessibility evidence;
- tenant/white-label design inheritance;
- imported-content prompt-injection defense;
- visual regression baseline integrity;
- external entitlement/budget safety;
- feature-flagged rollout and provider kill switches.

### R1.2 second hardening summary

A second independent 15-pass audit found additional implementation gaps that are materially different from the R1.1 set. R1.2 adds:

- SDK/API contract-version compatibility testing for provider adapters;
- direct binding of visual evidence to Spec 224 evidence freshness and nondeterminism contracts;
- theme/mode matrices including light, dark, system and high-contrast policies;
- frontend performance and asset-delivery budgets;
- representative data-shape/density fixtures instead of idealized mock data only;
- navigation/history/deep-link/unsaved-work semantics;
- canonical design schema migration and compatibility rules;
- design↔source drift detection after manual or agent code changes;
- provider/data retention, deletion and cleanup lifecycle;
- provider data-residency/retention/terms profiles before external transmission;
- motion/animation/temporal interaction verification;
- preview sandbox and external-resource determinism requirements;
- explicit SPAAS metadata handoff without redefining Spec 261;
- role/permission-state verification;
- cross-provider fallback branching to prevent accidental mixed-provenance designs.

### R1.3 third hardening summary

A third independent 15-pass audit found additional gaps at the ownership, portability, cache, recovery, runtime-content and supply-chain boundaries. R1.3 adds:

- canonical `DesignPromptEnvelope` provenance without requiring secret/raw-sensitive prompt persistence;
- non-deterministic provider replay semantics and truthful reproducibility classification;
- tenant/project/provider-aware cache isolation and poisoning resistance;
- explicit `LOCAL_ONLY` / `NO_EGRESS` design-routing behavior;
- design-artifact ownership-transfer re-authorization rules aligned with Spec 269;
- safe fork/template/Marketplace materialization rules;
- durability/recovery closure for database metadata + R2/assets without creating a new backup authority;
- reference-aware asset garbage collection and retention protection;
- dynamic AI-generated runtime-content stress profiles;
- input-modality, orientation, safe-area and virtual-keyboard verification;
- design-system/component-catalog update pinning and rollback semantics;
- analytics/telemetry/privacy bindings as real product capabilities, never decorative provider output;
- trusted sensitive-interaction patterns for auth/payment/secret-entry UI;
- authority-scoped automatic variant selection;
- provider-generated dependency/source-code additions routed through Spec 224 supply-chain and license gates.

### R1.4 fourth hardening summary

A fourth independent 15-pass audit found long-term maintenance and product-correctness gaps not covered by prior rounds. R1.4 adds:

- semantic design diff and approval-oriented change summaries;
- explicit design-decision rationale and supersession lineage;
- component deprecation/replacement lifecycle;
- backend/API/data-contract drift invalidation;
- SSR/streaming/hydration execution-mode verification;
- browser/engine compatibility profiles;
- offline/PWA/degraded-network interaction states;
- fixture-governance and fixture-drift freshness;
- generated copy/content/terminology governance;
- accessible data-visualization semantics;
- external-link/new-window/open-redirect safety;
- provider-neutral canonical design export/import bundles;
- provenance redaction for support/export surfaces;
- archival readability and long-term decode requirements;
- post-release UX feedback / experiment lineage without silent production mutation.

---



# 1. Why this spec exists

SmartAIHub already has substantial software-development infrastructure:

- Spec 224 for autonomous development;
- Spec 256 for capability discovery and skill-first routing;
- Mini App / portable application standards;
- Astryx as a reusable production UI foundation;
- Chat / Task Control as the universal command surface;
- local and cloud execution;
- external harness support;
- skills, MCP, tools and provider adapters.

However, a coding agent that receives only a textual requirement is frequently required to solve several different problems at once:

```text
business requirement
      ↓
information architecture
      ↓
interaction design
      ↓
visual hierarchy
      ↓
responsive behavior
      ↓
component selection
      ↓
frontend implementation
```

This produces unnecessary variance.

A generated application may be functionally correct yet still suffer from:

- generic layouts;
- weak visual hierarchy;
- inconsistent spacing;
- duplicated custom components;
- poor responsive behavior;
- desktop-first assumptions;
- inaccessible interaction targets;
- mismatch with SmartAIHub visual conventions;
- excessive UI invention where reusable components already exist.

Google Stitch now exposes programmatic and agent-facing design capabilities, including screen generation, screen editing, variants, HTML/screenshot extraction, design-system operations, MCP access and skills. These capabilities can materially improve design exploration.

At the same time:

- not every SmartAIHub user has Stitch;
- provider availability and quotas can change;
- user subscriptions must not become hidden platform dependencies;
- generated UI must not bypass SmartAIHub design-system controls;
- applications already built must continue to operate if Stitch later becomes unavailable.

Spec 270 establishes the abstraction that captures the upside while containing these risks.

---

# 2. Architectural ownership

## 2.1 Spec 270 owns

Spec 270 is authoritative for:

- `DesignCapabilityProvider`;
- `DesignProviderConnection`;
- `DesignRequest`;
- `DesignBrief`;
- `DesignContextBundle`;
- `CanonicalDesignArtifact`;
- `DesignVariantSet`;
- `DesignDecision`;
- `DesignSystemSnapshot`;
- `ComponentIntent`;
- `ComponentResolution`;
- `VisualVerificationEvidence`;
- design-provider availability and capability discovery;
- design-provider fallback policy;
- design-time BYOC/BYOS credential bindings;
- design artifact normalization;
- design lineage and provenance;
- design-to-Astryx mapping policy;
- design-time external dependency elimination;
- visual QA requirements added around frontend development;
- provider-neutral UI design semantics;
- Mini App design integration;
- SmartAIHub core-product design integration.

## 2.2 Spec 270 does NOT own

Spec 270 MUST NOT become a second authority for:

- development state machine — owned by Spec 224;
- generic skill/capability routing — owned by Spec 256;
- Assistant identity / delegation — owned by Spec 269;
- generic job persistence — existing worker job authority;
- deployment orchestration — existing development/deployment authority;
- credential vault implementation;
- credit ledger implementation;
- Mini App packaging authority;
- production runtime hosting;
- source-control authority;
- general memory;
- knowledge/evidence fabric.

Spec 270 MUST integrate through existing interfaces rather than fork these responsibilities.

---

# 3. Core invariants

The following invariants are normative.

## INV-270-001 — No external provider requirement

A DevelopmentRun MUST be able to complete successfully without Google Stitch or any other **dedicated external design provider**. This does not imply that all design reasoning is model-free: the native path MAY use an authorized SmartAIHub model/runtime under existing routing policy. The invariant is that no dedicated design SaaS account is mandatory.

## INV-270-002 — Design-time only

No generated SmartAIHub application SHALL require an active Stitch connection to render or execute its production UI.

## INV-270-003 — Canonicalization before build

External-provider output MUST be normalized into a SmartAIHub-owned canonical artifact before it is accepted into the implementation pipeline.

## INV-270-004 — Reuse before invention

The resolver MUST attempt, in order:

1. existing SmartAIHub product component;
2. existing Astryx component;
3. existing Astryx/SmartAIHub pattern;
4. composition of existing components;
5. controlled extension of an existing component;
6. creation of a new component.

Creating a new generic component MUST be the final option.

## INV-270-005 — Provider credential isolation

When a user connects Stitch with their own account/credential, SmartAIHub MUST scope that credential to the user/team/tenant authorization boundary and MUST NOT silently reuse it for unrelated users.

## INV-270-006 — No subscription-name assumptions

SmartAIHub MUST NOT hard-code logic such as:

```text
Google AI Pro => N Stitch credits
Google AI Ultra => unlimited Stitch
```

Plan names and entitlement assumptions are non-authoritative.

Provider availability MUST be determined using connection state, capability discovery, observed quota/error state and provider metadata available at execution time.

## INV-270-007 — Deterministic fallback

If an optional provider is unavailable, SmartAIHub MUST fall back to an allowed provider or the native design path unless the user explicitly required a particular provider.

## INV-270-008 — Explicit user requirement wins

If the user explicitly says:

> “Use Stitch for this design.”

and Stitch is unavailable, SmartAIHub MUST NOT silently substitute another provider while claiming the request was satisfied.

The run SHOULD enter a typed `WAITING_FOR_PROVIDER`, `WAITING_FOR_AUTH`, or equivalent existing waiting state and explain the actionable dependency.

## INV-270-009 — Imported assets become owned artifacts

Provider-hosted temporary URLs, signed URLs or ephemeral screen references MUST NOT become production dependencies.

Assets required for the product MUST be materialized into SmartAIHub-controlled storage according to existing storage policy.

## INV-270-010 — Mobile/tablet are first-class

Design evaluation MUST cover phone, tablet and desktop whenever the product is expected to run on those surfaces.

Desktop-only visual verification is insufficient for a general SmartAIHub Mini App.


## INV-270-011 — UI capability truthfulness

Generated UI MUST NOT imply executable functionality that the application does not actually possess.

Every actionable control in a selected design MUST resolve to one of:

```text
BOUND_TO_EXISTING_CAPABILITY
BOUND_TO_IMPLEMENTATION_WORK_ITEM
INTENTIONALLY_PRESENTATIONAL
DEFERRED_WITH_VISIBLE_PRODUCT_DECISION
REJECTED_AS_UNSUPPORTED
```

A provider-generated button, menu, statistic, workflow state, permission action, AI operation or integration MUST NOT be accepted merely because it appears in the visual design.

## INV-270-012 — Immutable selected versions and optimistic concurrency

A `SELECTED` or `IMPLEMENTED` canonical design version MUST be immutable. Subsequent edits create a new version with explicit parent lineage.

Concurrent mutation MUST use expected-version / mutation-lease / equivalent optimistic-concurrency protection so two agents or users cannot silently overwrite each other's design decisions.

## INV-270-013 — Approval freshness

A design approval is scoped to the digest/version that was reviewed.

If layout, interaction behavior, capability bindings, data exposure, provider source, cost, or responsive behavior changes materially, prior approval MUST be considered stale and revalidated through the existing approval authority.

## INV-270-014 — Rights and provenance before release

Imported/generated images, fonts, icons, templates and other design assets MUST carry known provenance and usage-right status before release.

Unknown rights MUST NOT be silently treated as cleared for marketplace, tenant or commercial distribution.

## INV-270-015 — Localization is structural, not cosmetic

Canonical designs MUST separate translatable content from layout structure and MUST be testable with representative text expansion, Thai text, English, and right-to-left layout when the target product declares RTL support.

## INV-270-016 — Imported design content is untrusted

HTML, screenshots, DESIGN.md, code, prompts, metadata and assets obtained from external providers or imported applications MUST be treated as untrusted content, not agent instructions.

Embedded prompt-injection text, scripts, remote trackers or instructions attempting to override SmartAIHub policy MUST have no authority.

## INV-270-017 — Tenant and brand isolation

Tenant/white-label tokens, logos, assets, provider credentials and design artifacts MUST be isolated by tenant/project authority. No provider request or canonical artifact may inherit another tenant's private brand data through cache, prompt context or design-system lookup.

## INV-270-018 — Baseline changes require evidence

Visual baseline updates MUST NOT be used to hide regressions. A baseline replacement MUST record the design/version that authorized the change and the verification evidence that justified it.

## INV-270-019 — External paid usage is never silently assumed

If an external design call can consume a user-owned paid entitlement, billable quota, or metered provider usage, the system MUST apply the existing budget/consent policy and MUST represent unknown pricing as unknown rather than zero.

## INV-270-020 — Provider capability certification

A provider may be healthy yet unsuitable for a specific task. Routing MUST depend on a versioned certified capability snapshot, not only provider reachability.


## INV-270-021 — Provider adapter contract versioning

A provider adapter MUST bind to a verified SDK/API/tool contract version or compatible capability signature.

Capability probing alone is insufficient when a provider changes return shapes, argument forms, content-vs-URL semantics, or multi-result behavior.

## INV-270-022 — Visual evidence consumes Spec 224 evidence semantics

Spec 270 visual verification MUST use the existing Spec 224 evidence freshness, environment fingerprint, nondeterminism and remote-input contracts rather than inventing a second evidence authority.

## INV-270-023 — Theme and mode completeness

A design is not complete merely because one light-theme screenshot passes. Required theme/mode profiles MUST be explicit and verified.

## INV-270-024 — Performance is part of UX quality

A visually correct design MUST NOT be promoted if it causes unacceptable frontend performance, excessive asset weight, layout instability or interaction latency relative to the product's declared performance profile.

## INV-270-025 — Data realism before design finality

Material data-heavy UI MUST be evaluated with representative data shape, density and edge cases rather than only idealized placeholder content.

## INV-270-026 — Navigation/state continuity is part of design

Canonical design MUST represent material navigation/state semantics such as deep links, browser back/forward behavior, refresh recovery and unsaved-work handling where relevant.

## INV-270-027 — Canonical schema evolution is migratable

Persisted design artifacts MUST have explicit schema-version migration/compatibility semantics. A platform upgrade MUST NOT silently strand old design artifacts.

## INV-270-028 — Implementation drift is observable

After implementation, manual or automated code changes that materially alter the UI MUST be able to mark the canonical design mapping/baseline as stale rather than falsely reporting design alignment.

## INV-270-029 — Design data has a lifecycle

Disconnecting a provider credential is not equivalent to deleting provider-hosted projects/data. SmartAIHub MUST model retention, export, unlink and deletion/cleanup as separate operations.

## INV-270-030 — External transmission requires provider data profile

Before source code, screenshots, private brand assets or sensitive design context are sent to an external provider, SmartAIHub MUST resolve the applicable provider data-handling/retention/residency policy required by project policy.

## INV-270-031 — Motion is verified as behavior

Animations, transitions, drag interactions and timed states MUST be represented and tested as interaction behavior where material; screenshots alone are insufficient.

## INV-270-032 — Preview environments are sandboxed and reproducible

Provider HTML/reference previews MUST execute, if executed at all, in a constrained sandbox with explicit network/resource policy. External fonts/scripts/images MUST not silently make visual evidence mutable or privileged.

## INV-270-033 — SPAAS handoff is metadata-only from Spec 270

Spec 270 MAY contribute design provenance and verification attachments to a Spec 261 package candidate, but MUST NOT redefine SPAAS package identity, signing, release or lifecycle semantics.

## INV-270-034 — Permission/role variants are first-class design states

When user roles materially change available actions or data visibility, verification MUST cover representative authorized and unauthorized states.

## INV-270-035 — Provider fallback does not merge incompatible partial designs silently

If a run falls back from one design provider to another after partial generation, outputs MUST remain distinct branches/variants with provenance unless an explicit normalization/merge decision combines them.



## INV-270-036 — Design request provenance is reconstructable

A material design-provider operation MUST have enough provenance to explain what context produced the result without requiring plaintext persistence of secrets or prohibited sensitive data.

## INV-270-037 — Provider generation is not assumed reproducible

Identical prompt text does not guarantee identical provider output. SmartAIHub MUST distinguish replayable inputs from reproducible outputs and MUST NOT promise deterministic regeneration when the provider cannot provide it.

## INV-270-038 — Design caches are authority-scoped

Cached prompts, design-system context, provider responses, screenshots and normalized artifacts MUST be partitioned by the authority dimensions that make reuse safe. Cross-tenant/private-context cache reuse is prohibited.

## INV-270-039 — Local-only and no-egress policy applies to design

A `LOCAL_ONLY`, `DENY_CLOUD_FALLBACK`, `NO_EXTERNAL_EGRESS` or equivalent binding MUST fence design-provider routing as strongly as it fences other development/runtime work.

## INV-270-040 — Ownership transfer does not transfer external-account authority

Transferring a Mini App/workspace may transfer authorized canonical design artifacts and lineage, but MUST NOT automatically transfer user-owned Stitch/provider credentials, provider subscriptions or external provider project ownership.

## INV-270-041 — Fork/template install creates an independent authority scope

Forking, templating or Marketplace installation MUST NOT preserve writable authority to the publisher's private design provider project, credentials, tenant-private brand data or non-transferable assets.

## INV-270-042 — Canonical artifact durability requires referential closure

A durable/restored canonical design artifact MUST not claim completeness if required SmartAIHub-owned binary assets/evidence referenced by it are missing or digest-invalid.

## INV-270-043 — Referenced design assets are retention-protected

Garbage collection MUST NOT delete a design asset still referenced by an active canonical artifact, release, visual baseline, audit/evidence record or retention hold.

## INV-270-044 — Runtime-generated content is a design input class

For applications whose runtime UI contains model-generated text/images/data, design verification MUST include bounded representative generated-content envelopes; a fixed static mock alone is insufficient.

## INV-270-045 — Input modality and device chrome are first-class

Required UI verification MUST account for applicable orientation, touch/pointer/keyboard modality, safe areas, on-screen keyboard and hover/no-hover behavior.

## INV-270-046 — Design-system upgrades are not implicit release upgrades

A newer Astryx/product component/theme version MUST NOT silently change a released application's verified UI semantics unless the application's dependency/update policy permits it and affected evidence is revalidated.

## INV-270-047 — Analytics and telemetry are functional/privacy capabilities

A design provider MAY visually suggest analytics or tracking, but production telemetry/instrumentation MUST resolve through canonical product/privacy/consent capabilities and policy.

## INV-270-048 — Sensitive interaction patterns use trusted primitives

Authentication, secret entry, payment, destructive confirmation and similarly sensitive interactions MUST prefer approved SmartAIHub/Astryx trusted components and MUST NOT rely on provider-styled lookalikes that obscure trust boundaries.

## INV-270-049 — Automatic variant selection is authority-bounded

An agent MAY auto-select a design variant only within the user's interaction/autonomy policy and only when the selection does not introduce a material unresolved product, privacy, cost, rights, permission or brand decision.

## INV-270-050 — Provider-generated code does not bypass supply-chain gates

Any new runtime dependency, package, remote script, font package, executable asset or build plugin introduced from provider-generated code MUST pass the existing Spec 224 dependency/source/license/security gates before implementation acceptance.



## INV-270-051 — Material design changes are semantically diffable

Approval and review MUST NOT rely only on pixel differences. SmartAIHub MUST be able to explain material semantic changes in navigation, actions, permissions, data exposure, dependencies, provider use, copy roles and interaction behavior.

## INV-270-052 — Design decisions retain rationale and supersession

A selected design decision SHOULD preserve why it was selected, which alternatives were rejected, and which later decision superseded it when applicable.

## INV-270-053 — Component deprecation is explicit

Deprecated SmartAIHub/Astryx components/patterns MUST have explicit status and replacement semantics. New generated work SHOULD NOT select deprecated components unless policy explicitly permits legacy maintenance.

## INV-270-054 — Backend/data-contract drift invalidates UI bindings

A materially changed API/schema/data contract MUST be able to stale affected `UIActionBinding`, data assumptions, fixtures and verification evidence.

## INV-270-055 — Rendering mode is part of verified UI behavior

Where applicable, SSR, CSR, streaming, hydration and partial rendering behavior MUST be verified as execution semantics rather than inferred from a static screenshot.

## INV-270-056 — Browser compatibility is declared, not assumed

Applications MUST declare the browser/engine support profile relevant to their product. A design is not verified merely because it works in one browser engine.

## INV-270-057 — Offline/degraded-network behavior is explicit when supported

If a product claims PWA, offline, intermittent-network or resilient mobile behavior, canonical design MUST represent loading, cached, stale, retry and reconnect semantics.

## INV-270-058 — Test fixture drift is evidence drift

Verification fixtures are versioned evidence inputs. Material fixture changes MUST stale/reclassify affected design evidence according to Spec 224 freshness rules.

## INV-270-059 — Generated copy follows content governance

Provider-generated labels, help text, notices and calls-to-action MUST resolve through product terminology, localization, legal/brand and content-policy requirements rather than becoming authoritative merely because they appear in a visual.

## INV-270-060 — Data visualizations require semantic alternatives

Charts/maps/graphs/dashboards MUST NOT communicate material information only through pixels, color or hover. Required semantics/accessibility alternatives MUST be defined when such visualizations are material.

## INV-270-061 — External navigation is security-sensitive behavior

External links, new-window behavior, redirects and deep links MUST resolve through canonical routing/security policy. Provider output MUST NOT create unsafe open redirects, deceptive destinations or privileged navigation.

## INV-270-062 — Canonical design is exportable without provider lock-in

SmartAIHub SHOULD support a provider-neutral export representation sufficient to preserve canonical design intent, lineage and assets permitted for export without requiring Stitch or another provider to decode it.

## INV-270-063 — Provenance views are redaction-aware

Auditability MUST NOT require exposing sensitive raw prompt/context/provider data to every viewer. Provenance presentation/export MUST honor authorization and redaction policy.

## INV-270-064 — Archived design artifacts remain decodable

Long-lived selected/implemented artifacts MUST retain enough schema/version/format metadata to be decoded or explicitly migrated in the future; archival must not depend on an unavailable external provider.

## INV-270-065 — Post-release learning does not silently mutate production

Usage feedback, usability findings, experiment results or support signals MAY create new design candidates, but MUST NOT silently rewrite the active production design/source without normal change/verification/release authority.


---

# 4. Provider-neutral conceptual model

## 4.1 DesignCapabilityProvider

Conceptual interface:

```ts
interface DesignCapabilityProvider {
  id: string;
  kind: "native" | "external";

  discoverCapabilities(ctx): Promise<DesignProviderCapabilities>;

  createDesign(req: DesignRequest): Promise<ProviderDesignResult>;

  editDesign?(req: DesignEditRequest): Promise<ProviderDesignResult>;

  generateVariants?(
    req: DesignVariantRequest
  ): Promise<ProviderDesignVariantResult>;

  critiqueDesign?(
    req: DesignCritiqueRequest
  ): Promise<DesignCritiqueResult>;

  importCodeToDesign?(
    req: CodeToDesignRequest
  ): Promise<ProviderDesignResult>;

  extractDesignSystem?(
    req: DesignSystemExtractionRequest
  ): Promise<ProviderDesignSystemResult>;

  exportArtifacts?(
    req: ProviderArtifactExportRequest
  ): Promise<ProviderArtifactBundle>;

  health(ctx): Promise<ProviderHealth>;
}
```

The interface is conceptual. Exact implementation language MAY vary.

## 4.2 Initial provider registry

Initial registry:

```text
smartaihub-native-design
google-stitch
imported-design-artifact
existing-product-ui
```

Future providers MAY include Figma-related adapters, other design agents, or external harnesses without modifying the canonical artifact model.

## 4.3 Capability identifiers

Spec 256 SHALL expose or map the following capability intents:

```text
design.generate
design.edit
design.generate_variants
design.critique
design.code_to_design
design.extract_system
design.apply_system
design.import_artifact
design.component_resolve
design.visual_compare
design.responsive_verify
design.accessibility_verify
```

Provider-specific tool names MUST NOT become the user-facing canonical capability names.

## 4.4 Provider capability certification

A provider offer SHALL be represented separately from the canonical capability.

Minimum certification metadata SHOULD include:

```ts
interface DesignProviderCapabilityCertification {
  providerId: string;
  adapterVersion: string;
  capabilityId: string;
  providerOperation?: string;
  certificationVersion: string;
  status: "CERTIFIED" | "DEGRADED" | "EXPERIMENTAL" | "SUSPENDED";
  supportedDeviceTypes: string[];
  maxVariantCount?: number;
  inputClasses: string[];
  outputClasses: string[];
  canUploadSource: boolean;
  canUploadImages: boolean;
  canExportHtml: boolean;
  canExportScreenshots: boolean;
  clarificationSemantics?: string;
  dataHandlingProfileRef?: string;
  rightsProfileRef?: string;
  lastVerifiedAt: string;
}
```

A `health()` success MUST NOT be interpreted as proof that all previously known provider operations are still present or semantically compatible.

Adapter discovery/certification MUST be repeated after material provider/SDK/API drift.

## 4.5 Routing inputs

Provider routing SHOULD consider:

```text
canonical capability requested
user/provider policy
data classification
credential ownership
certified capability status
device targets
provider quota/rate status
budget/consent status
latency constraints
artifact exportability
rights/data-handling constraints
fallback policy
```

Lowest cost or mere availability MUST NOT be the sole routing criterion.

## 4.6 DesignPromptEnvelope and request provenance

A material external generation SHOULD record a secret-safe envelope:

```ts
interface DesignPromptEnvelope {
  operationId: string;
  capabilityId: string;
  providerId: string;
  adapterVersion: string;
  providerCapabilityCertificationRef: string;

  promptDigest: string;
  promptArtifactRef?: string;
  contextBundleDigest: string;
  designSystemSnapshotDigest?: string;
  sourceSnapshotDigest?: string;
  brandProfileDigest?: string;
  policySnapshotDigest: string;

  providerModelOrMode?: string;
  externalProjectRef?: string;

  dataClassification: string;
  egressDecisionRef?: string;
  budgetConsentRef?: string;

  createdBy: string;
  createdAt: string;
}
```

Rules:

- `promptArtifactRef` MAY point to an encrypted/access-controlled artifact when retention is allowed;
- raw secrets MUST NOT be persisted merely for reproducibility;
- prohibited sensitive content MUST not be retained just because it was sent;
- exact provider-generated output SHOULD be canonicalized rather than assuming it can be regenerated;
- replay MUST use a new operation identity while referencing the original envelope.

## 4.7 Reproducibility classification

Provider design operations SHOULD classify regeneration expectations:

```text
INPUTS_RECONSTRUCTABLE_OUTPUT_NONDETERMINISTIC
INPUTS_AND_OUTPUT_SNAPSHOT_AVAILABLE
PROVIDER_VERSION_PINNED_BEST_EFFORT
NOT_REPLAYABLE
REPRODUCIBILITY_UNKNOWN
```

`INPUTS_RECONSTRUCTABLE_OUTPUT_NONDETERMINISTIC` is a normal valid state for generative design.

---


# 5. Design complexity routing

Not every UI task should invoke a design provider.

Spec 270 defines the following default classification.

## L0 — Atomic existing-component change

Examples:

- add a toggle;
- change a label;
- add one setting;
- move one button;
- add a field to an existing form.

Default path:

```text
Existing product pattern
→ Astryx/product component
→ Spec 224 implementation
```

External design provider: **normally prohibited as unnecessary work**.

## L1 — Existing-pattern composition

Examples:

- new detail panel using existing controls;
- standard settings page;
- list + filter + detail composition;
- common modal workflow.

Default:

```text
Existing patterns
→ Astryx composition
→ Spec 224
```

External design provider: optional only when requested or when layout uncertainty is material.

## L2 — Significant new page/layout

Examples:

- new dashboard;
- new creator workspace;
- new admin surface.

Default:

```text
Native design
+
optional specialized provider
→ canonical artifact
→ implementation
```

## L3 — Multi-screen user journey

Examples:

- onboarding flow;
- commerce flow;
- media-production workflow;
- emergency operations workflow.

Specialized provider is recommended when available because screen relationships and alternatives materially affect UX.

## L4 — New product / Mini App

The system SHOULD create a formal `DesignBrief` and explore at least one coherent end-to-end design path.

A connected specialist provider MAY generate multiple variants.

The provider is still optional.

---

# 6. Google Stitch adapter

## 6.1 Role

The Google Stitch adapter is an optional implementation of `DesignCapabilityProvider`.

Its job is limited to design-time capabilities such as:

- generate screens from textual requirements;
- create alternative layouts/visual directions;
- edit screens;
- obtain screenshots;
- obtain generated HTML;
- use or apply design-system context;
- support code/design round-trip workflows where practical;
- support Stitch skills and MCP-based agent workflows.

It MUST NOT become the canonical SmartAIHub UI implementation.

## 6.2 Supported integration surfaces

The adapter MAY use:

1. Stitch MCP;
2. `@google/stitch-sdk`;
3. supported Stitch Skills;
4. future documented Stitch integration methods.

Provider-specific integration MUST remain behind the Spec 270 adapter boundary.

## 6.3 Current SDK facts relevant to implementation

As of 2026-10-02, the public `google-labs-code/stitch-sdk` repository describes:

- screen generation;
- screen editing;
- design variants;
- HTML retrieval;
- screenshot retrieval;
- project/design-system operations;
- MCP tool access;
- API-key authentication;
- OAuth access-token authentication with a Google Cloud project;
- errors including auth, permission, rate-limit, network, validation and clarification-required states.

These facts are implementation references, not permanent platform contracts.

The adapter MUST capability-probe and fail safely if Google changes them.


### 6.3.1 SDK/API compatibility contract

As of the R1.2 review, the public Stitch SDK has demonstrated breaking evolution in its 1.0 line, including changes to generation return shapes, optional-argument style, and HTML content/URL retrieval semantics.

Therefore the adapter MUST NOT encode assumptions such as:

```text
generate() always returns one Screen
variants() always returns Screen[]
getHtml() always returns a download URL
positional deviceType arguments always remain valid
```

The adapter SHALL isolate provider-specific semantics behind its own compatibility layer and SHOULD run contract tests covering:

```text
project creation/listing
multi-screen generation
screen edit
variant generation
HTML content retrieval
HTML URL retrieval when supported
image bytes/URL retrieval when supported
design-system create/apply
tool discovery
auth failure
rate limit
clarification-required
cancellation/signal support when available
```

A provider adapter upgrade MUST be staged independently from the canonical Spec 270 contracts.


## 6.4 Authentication modes

Supported conceptual modes:

```text
USER_API_KEY
USER_OAUTH
TENANT_MANAGED_CREDENTIAL       optional future policy
PLATFORM_MANAGED_CREDENTIAL     disabled by default
```

Default for creator use SHOULD be a user-owned binding when supported.

No SmartAIHub administrator credential SHALL be silently used to bypass a user's lack of Stitch access.

## 6.5 BYOC behavior

Example:

```text
User A
  └─ Stitch credential A
       └─ Design runs charged/limited according to A's provider entitlement

User B
  └─ no Stitch credential
       └─ SmartAIHub Native Design path
```

The two users MUST remain functionally capable of creating Mini Apps.

The difference is access to optional provider-specific design acceleration.

## 6.6 Quota and plan handling

SmartAIHub SHALL model:

```ts
type ProviderAvailability =
  | "AVAILABLE"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "RATE_LIMITED"
  | "QUOTA_UNKNOWN"
  | "TEMPORARILY_UNAVAILABLE"
  | "UNSUPPORTED"
  | "DISABLED_BY_POLICY";
```

Provider plan names MAY be displayed as informational metadata if the provider supplies them.

They MUST NOT be the sole execution-decision input.

## 6.7 Clarification requests

If Stitch returns a clarification request, the adapter SHALL convert it into the common SmartAIHub interaction contract.

The provider-specific error MUST NOT leak into the UI as a raw SDK exception.

For autonomous runs, the orchestrator MAY answer automatically only when:

- the answer can be safely inferred from already-approved product requirements; and
- doing so does not materially alter scope, brand, cost or user-visible behavior.

Otherwise the run enters an appropriate `Needs You` decision state.

---

# 7. SmartAIHub Native Design baseline

SmartAIHub MUST retain a complete non-Stitch baseline.

The native path SHALL support:

- requirement-to-layout reasoning;
- UI-pattern selection;
- Astryx component lookup;
- existing product-pattern reuse;
- responsive planning;
- accessibility rules;
- design-system constraints;
- basic design critique;
- design specification generation;
- preview rendering;
- visual QA.

The baseline MAY use whichever LLM/provider the user or system is authorized to use through existing SmartAIHub model-routing infrastructure.

The baseline MUST NOT pretend to provide a Stitch-specific capability when Stitch is absent.

Example UX:

```text
Design options

✓ SmartAIHub Native Design
✓ Existing Astryx patterns
○ Google Stitch — not connected
```

The default path remains actionable.

---

# 8. Canonical Design Artifact

External provider output is temporary evidence.  
`CanonicalDesignArtifact` is the durable SmartAIHub contract.

Conceptual schema:

```ts
interface CanonicalDesignArtifact {
  id: string;
  schemaVersion: string;
  artifactDigest: string;
  parentArtifactId?: string;
  parentVersion?: number;
  projectId: string;
  workspaceId?: string;
  miniAppId?: string;

  version: number;
  status:
    | "DRAFT"
    | "CANDIDATE"
    | "SELECTED"
    | "IMPLEMENTED"
    | "SUPERSEDED"
    | "ARCHIVED";

  source: DesignArtifactSource;
  brief: DesignBriefRef;

  screens: CanonicalScreen[];
  flows: CanonicalFlow[];
  componentIntents: ComponentIntent[];
  responsiveRules: ResponsiveRule[];
  interactionRules: InteractionRule[];
  accessibilityRequirements: AccessibilityRequirement[];
  actionBindings: UIActionBinding[];
  localizationProfileRef?: string;
  themeProfileRef?: string;
  performanceProfileRef?: string;
  dataFixtureProfileRef?: string;
  tenantBrandProfileRef?: string;
  contentRightsSummaryRef?: string;

  designSystemSnapshotRef: string;
  designMdRef?: string;

  assets: CanonicalAssetRef[];
  evidence: DesignEvidenceRef[];
  provenance: DesignProvenance;

  createdAt: string;
  updatedAt: string;
}
```

## 8.1 Provider source

```ts
interface DesignArtifactSource {
  providerId:
    | "smartaihub-native-design"
    | "google-stitch"
    | "existing-product-ui"
    | "imported-artifact"
    | string;

  externalProjectRef?: string;
  externalScreenRefs?: string[];

  providerCapabilitySnapshot?: string;
  connectionBindingRef?: string;

  importedAt?: string;
}
```

Secrets MUST NOT be included.

## 8.2 Canonical screen

A canonical screen SHOULD contain:

- semantic screen name;
- user goal;
- major regions;
- layout constraints;
- navigation relationships;
- component intentions;
- key copy roles;
- data states;
- empty state;
- loading state;
- error state;
- permission-denied state where relevant;
- responsive behavior;
- accessibility notes;
- screenshot evidence;
- source/provider references;
- implementation mapping status.

This prevents screenshot-only design handoff.

## 8.3 UI action and data binding contract

Each material interactive element SHOULD resolve to a semantic binding.

```ts
interface UIActionBinding {
  id: string;
  screenId: string;
  componentIntentId: string;
  actionKind:
    | "NAVIGATE"
    | "QUERY"
    | "MUTATE"
    | "UPLOAD"
    | "DOWNLOAD"
    | "AI_CAPABILITY"
    | "EXTERNAL_INTEGRATION"
    | "PRESENTATIONAL";

  capabilityId?: string;
  backendContractRef?: string;
  dataEntityRef?: string;
  requiredPermissionRefs?: string[];
  sideEffectClass?: string;
  implementationStatus:
    | "BOUND"
    | "WORK_ITEM_REQUIRED"
    | "PRESENTATIONAL"
    | "DEFERRED"
    | "UNSUPPORTED";
}
```

Before a design becomes implementation-ready, significant actions MUST be checked for:

- actual backend/API/capability availability;
- permission semantics;
- loading/error/success behavior;
- destructive-action confirmation where applicable;
- idempotency expectations for mutations;
- empty and unavailable capability states.

Design providers MAY propose functionality. They MUST NOT create functional truth.

## 8.4 Immutable design version and lineage

The system SHALL maintain lineage:

```text
DesignBrief
   ↓
Artifact v1
   ├─ Variant A
   ├─ Variant B
   └─ Variant C
          ↓ selected
Artifact v2 SELECTED (immutable)
          ↓ implementation deviations
Artifact v3 / implementation mapping
```

Mutable working drafts MAY exist, but an approved/selected version MUST have a stable digest.

A write against an outdated parent/version MUST fail with a conflict or require an explicit merge.

## 8.5 Semantic design diff

A `DesignSemanticDiff` SHOULD summarize changes between canonical versions beyond pixel-level deltas.

Example fields:

```ts
interface DesignSemanticDiff {
  fromArtifactDigest: string;
  toArtifactDigest: string;

  screensAdded: string[];
  screensRemoved: string[];
  navigationChanges: string[];
  actionBindingChanges: string[];
  permissionChanges: string[];
  dataExposureChanges: string[];
  externalIntegrationChanges: string[];
  providerUsageChanges: string[];
  componentChanges: string[];
  dependencyImplications: string[];
  localizationChanges: string[];
  accessibilityChanges: string[];
  copyRoleChanges: string[];
  themeChanges: string[];
  performanceImplications: string[];

  materiality:
    | "COSMETIC"
    | "LOW"
    | "MATERIAL"
    | "HIGH_RISK";

  approvalFreshnessImpact: string[];
}
```

Review UI SHOULD summarize material changes in human-readable form before asking for approval.

## 8.6 Design decision record

A selected/superseded design SHOULD persist:

```text
candidate set digest
selected candidate/version
selector
selection authority/policy
selection rationale
material tradeoffs
rejected alternatives summary
approval refs
supersedes decision ref
created_at
```

The rationale is evidence, not an instruction to future agents to ignore changed requirements.

---

# 9. DESIGN.md policy

`DESIGN.md` MAY be used as an interchange artifact but SmartAIHub MUST NOT treat an external provider's raw DESIGN.md as automatically authoritative.

The canonical pipeline is:

```text
Provider DESIGN.md
        │
        ▼
parse / validate
        │
        ▼
SmartAIHub design policy merge
        │
        ▼
Canonical DesignSystemSnapshot
        │
        ▼
generated SmartAIHub DESIGN.md representation
```

SmartAIHub SHOULD support:

```text
extract current UI → design-system snapshot
design-system snapshot → provider context
provider output → normalized design artifact
normalized artifact → implementation context
```

The design-system representation MUST support both humans and agents.

---

# 10. Astryx and product-component resolver

AstryX/Astryx remains the core reusable UI foundation for implementation.

## 10.1 Resolution order

For every `ComponentIntent`, the resolver MUST attempt:

```text
1. SmartAIHub domain/product component
2. Astryx stable component
3. SmartAIHub composed pattern
4. Astryx pattern/template
5. composition of primitives
6. controlled extension
7. new reusable component
8. one-off component only when reuse is not appropriate
```

## 10.2 Provider HTML is not production authority

Generated provider HTML MAY be used for:

- layout reference;
- visual comparison;
- content extraction;
- prototype evidence;
- migration hints.

It MUST NOT automatically bypass the component resolver.

Example prohibited behavior:

```text
Stitch generated:
<div class="...">
  <button class="custom-primary">
```

and the development run copies it directly into production despite an existing canonical button component.

## 10.3 Controlled exceptions

Raw provider code MAY be preserved only when:

- it implements a unique component not available in the existing system;
- security review passes;
- accessibility review passes;
- design-system review passes;
- reuse/ownership decision is documented.

## 10.4 Component lifecycle and deprecation

The component resolver SHOULD consume lifecycle metadata:

```text
ACTIVE
EXPERIMENTAL
DEPRECATED
BLOCKED
REMOVED
```

A deprecated component/pattern SHOULD declare:

```text
replacement component/pattern when available
deprecation reason
minimum migration guidance
compatibility window when known
removal status/version
```

Rules:

- new L2–L4 design work SHOULD prefer `ACTIVE`;
- `BLOCKED`/`REMOVED` MUST NOT be selected;
- legacy maintenance MAY retain `DEPRECATED` with explicit evidence;
- migration from deprecated components MUST re-run affected visual/accessibility/behavior verification;
- provider output using a deprecated lookalike MUST not override resolver lifecycle policy.

---

# 11. Spec 224 integration

Spec 224 remains the canonical development orchestrator.

Spec 270 adds a **design-aware pre-implementation capability**, not a second orchestrator.

Target high-level sequence:

```text
PLAN
  ↓
SOLUTION STRATEGY
  ↓
DESIGN COMPLEXITY CLASSIFICATION
  ↓
DESIGN RESOLUTION
  ↓
IMPLEMENT
  ↓
FUNCTIONAL TEST
  ↓
VISUAL RENDER
  ↓
VISUAL COMPARE
  ↓
RESPONSIVE QA
  ↓
ACCESSIBILITY QA
  ↓
UX REVIEW
  ↓
FIX / RECHECK
  ↓
FINAL VERIFY
```

## 11.1 Optionality

A DevelopmentRun with no UI change SHALL skip Spec 270 design work.

An atomic UI change MAY skip design generation.

A substantial new product SHOULD produce at least a native canonical design artifact before implementation.

## 11.2 Existing Spec 224 authority is preserved

Spec 270 MUST NOT create its own:

- retry engine;
- approval database;
- workspace lifecycle;
- deployment state machine;
- job scheduler;
- cost ledger.

Design tasks SHALL execute through existing Spec 224 / worker-job mechanisms.

## 11.3 Design checkpoint

A significant UI run SHOULD persist a `DesignCheckpoint` reference into the DevelopmentRun evidence graph.

Conceptual fields:

```ts
interface DesignCheckpoint {
  developmentRunId: string;
  canonicalDesignArtifactId: string;
  selectedVariantId?: string;
  componentResolutionDigest?: string;
  actionBindingDigest?: string;
  designArtifactDigest?: string;
  visualBaselineDigest?: string;
  approvalRef?: string;
}
```

## 11.4 Design preflight gate

For L2–L4 work, Spec 224 SHOULD consume a `DesignPreflightRecord` before open-ended implementation.

Minimum questions:

```text
Is a new design actually required?
Which existing product patterns/components apply?
What user journeys and roles are in scope?
What device classes are required?
Which actions/data contracts already exist?
Which capabilities are missing and require implementation?
May project/source/brand data be sent to an external provider?
Is external provider usage permitted and affordable?
Which localization/accessibility profile applies?
Which design artifact/version is authoritative?
```

Failure to answer a non-material aesthetic preference SHALL NOT block implementation. Missing authority, privacy, rights or functional-contract information MAY block the affected design step.

## 11.5 Approval freshness and material change

A `DesignCheckpoint` approval SHALL bind to a digest.

The following changes SHOULD trigger approval revalidation when approval was required:

```text
selected layout/navigation changes
new destructive action
new external integration
new data class exposed
new provider receiving source/brand content
new paid provider usage
permission model change
material responsive behavior change
material tenant branding change
```

## 11.6 Design execution idempotency and cancellation

Provider-facing design operations SHALL carry a stable operation/correlation identity through the existing durable job system.

Retries MUST NOT blindly create duplicate provider projects/screens if the prior attempt may have succeeded.

Cancellation MUST:

1. stop scheduling new provider operations;
2. reconcile any in-flight provider request when possible;
3. preserve already-canonicalized artifacts and evidence;
4. avoid promoting partial design output to `SELECTED`;
5. settle any recorded external usage through existing economic/accounting authority.

## 11.7 Backend/API/data-contract drift

Where UI depends on typed backend/data contracts, a material contract change SHOULD identify impacted:

```text
screens
UIActionBindings
data entities/fields
validation rules
permission assumptions
loading/error states
fixtures
visual/accessibility evidence
```

Examples of material drift:

```text
field removed/renamed/type changed
nullable/non-nullable semantics changed
pagination contract changed
permission scope changed
mutation side effect changed
new error state
enum/state-machine value changed
streaming vs non-streaming response changed
```

Affected bindings/evidence MUST become stale or require compatibility proof rather than remaining falsely green.

---

# 12. Mini App creation workflow

## 12.1 Example

User:

> Create a veterinary clinic Mini App with dashboard, appointments,
> patient records, billing, and mobile support.

Resolver:

```text
Solution Strategy:
CREATE_REUSABLE_MINI_APP

Design Complexity:
L4
```

### Path A — user has Stitch

```text
Requirement
  ↓
DesignBrief
  ↓
Existing SmartAIHub design context
  ↓
Stitch provider
  ↓
candidate screens / variants
  ↓
normalize
  ↓
canonical artifact
  ↓
Astryx component mapping
  ↓
Spec 224 implementation
  ↓
visual + responsive verification
  ↓
package as portable Mini App
```

### Path B — user has no Stitch

```text
Requirement
  ↓
DesignBrief
  ↓
SmartAIHub Native Design
  ↓
existing patterns + Astryx
  ↓
canonical artifact
  ↓
Spec 224 implementation
  ↓
visual + responsive verification
  ↓
package as portable Mini App
```

Both paths MUST reach the same implementation contract.

---

# 13. SmartAIHub core-product development workflow

The same subsystem SHALL be usable when developing SmartAIHub itself.

Examples:

- new Agent Control Center;
- creator workspace;
- Film Studio surfaces;
- emergency map control surfaces;
- Data Intelligence views;
- marketplace;
- tenant administration;
- memory/knowledge management.

For existing SmartAIHub source:

```text
Current code
   ↓
UI inventory
   ↓
existing component map
   ↓
design-system snapshot
   ↓
optional code-to-design / design exploration
   ↓
candidate design
   ↓
canonical artifact
   ↓
Astryx mapping
   ↓
Spec 224
```

Design-provider output MUST NOT be allowed to discard existing product navigation, data semantics, permissions or workflow rules simply because a generated layout appears visually cleaner.

Functional product contracts outrank provider design suggestions.

---

# 14. Code-to-design round trip

Spec 270 SHOULD support a controlled round trip:

```text
existing React UI
      ↓
extract semantic design context
      ↓
provider design workspace
      ↓
modify / generate variants
      ↓
export provider result
      ↓
normalize
      ↓
component diff
      ↓
implementation patch
```

The round trip MUST preserve traceability between:

```text
source component
↕
canonical component intent
↕
provider screen region
↕
resulting source patch
```

A provider screen is not itself source-control truth.


## 14.1 Design ↔ implementation drift contract

Once a design is implemented, source code becomes the executable truth for the product while the canonical design artifact remains design intent/evidence.

SmartAIHub SHALL track alignment state:

```text
ALIGNED
IMPLEMENTATION_INTENTIONALLY_DIVERGED
DESIGN_STALE
IMPLEMENTATION_STALE
UNKNOWN
```

Material source changes SHOULD invalidate or recheck affected:

```text
component resolutions
action bindings
visual baselines
responsive evidence
accessibility evidence
theme evidence
performance evidence
```

The system MUST NOT silently regenerate source merely to force alignment with an old design artifact.

Where useful, a controlled source-to-design refresh MAY create a new design version with explicit provenance.


---

# 15. Visual verification

## 15.1 Required evidence

For UI-heavy development, Final Verify SHOULD include:

- rendered screenshot(s);
- viewport metadata;
- target/candidate design reference;
- visual-diff result or structured comparison;
- responsive evidence;
- accessibility result;
- overflow/truncation result;
- interaction-state evidence where applicable.

## 15.2 Required states

Important screens SHOULD test:

```text
normal
loading
empty
error
permission denied
long content
small viewport
large viewport
```

where applicable.

## 15.3 Viewports

Default representative classes:

```text
PHONE
TABLET
DESKTOP
```

Specific viewport dimensions MAY be project-defined.

## 15.3.1 Reproducible visual environment

Visual verification SHALL bind into Spec 224's evidence/environment contracts.

For promotion-grade visual evidence, capture as applicable:

```text
candidate/source SHA
browser engine + exact/compatible version
OS/runtime image
viewport dimensions
device pixel ratio
font set/digests
theme/mode
locale/timezone
clock/frozen-time setting
animation/motion setting
test fixture/data snapshot
network mode
external resource snapshot/digests
feature flags
random seed where relevant
```

Visual evidence becomes stale when a material bound dimension changes beyond its compatibility policy.

A single successful rerun MUST NOT erase an unexplained prior visual failure; classification SHALL follow Spec 224 nondeterminism rules.

## 15.4 Visual difference is not automatically a failure

A production implementation may intentionally diverge from a generated design because of:

- accessibility;
- component-system constraints;
- product behavior;
- localization;
- responsive behavior;
- real data;
- security;
- implementation feasibility.

Such divergence SHOULD be classified:

```text
ACCEPTED_INTENTIONAL
REQUIRES_FIX
REQUIRES_DESIGN_REVIEW
NOT_COMPARABLE
```


## 15.5 Theme and appearance matrix

A `ThemeProfile` SHOULD declare applicable modes:

```text
LIGHT
DARK
SYSTEM
HIGH_CONTRAST
TENANT_THEME:<id>
PRODUCT_THEME:<id>
```

Not every product must support all modes, but unsupported modes MUST be explicit.

Verification SHOULD check:

- token resolution;
- contrast;
- images/icons that disappear on alternate backgrounds;
- focus/hover/disabled states;
- chart/data colors;
- shadows/borders/elevation;
- system-theme switching when supported;
- tenant theme overrides.

## 15.6 Data realism and density matrix

A `DataFixtureProfile` SHOULD describe representative UI stress states, for example:

```text
zero items
one item
typical count
high count
long labels
long names/addresses
large numbers
zero/negative values
missing optional fields
mixed media aspect ratios
pagination / virtualized list threshold
chart outliers
permission-filtered records
slow/loading data
```

Generated designs that only work with short placeholder strings or three perfectly sized cards are insufficient for data-heavy production UI.

## 15.7 Role/permission visual matrix

Where roles differ materially, verification SHOULD render representative roles, such as:

```text
OWNER / ADMIN
EDITOR
VIEWER
UNAUTHORIZED
PARTIALLY_AUTHORIZED
```

Hidden/disabled/denied actions MUST match the canonical permission model rather than aesthetic provider output.

## 15.8 Motion and temporal interaction evidence

For material animation/interaction, evidence SHOULD capture behavior rather than only final pixels.

Examples:

```text
drawer open/close
modal enter/exit
drag/drop
timeline scrub
loading transition
optimistic mutation
toast/status expiration
progress indication
reduced-motion alternative
```

Animation MUST NOT create keyboard/focus traps or violate the declared reduced-motion policy.



## 15.9 Rendering-mode verification

A `RenderingModeProfile` MAY declare:

```text
CSR
SSR
SSR_HYDRATED
STREAMING
PARTIAL_PRERENDER
STATIC_EXPORT
CLIENT_ONLY_WIDGETS
```

Where relevant, verification SHOULD cover:

- first render before hydration;
- hydration mismatch/error;
- streamed/partial content arrival;
- loading boundary stability;
- layout shift between server/client render;
- client-only fallback;
- failure when JavaScript is delayed/disabled where the product claims graceful behavior.

Provider prototypes MUST NOT be assumed to represent the production rendering mode.

## 15.10 Browser/engine compatibility profile

A product SHOULD declare supported classes such as:

```text
CHROMIUM_CURRENT
SAFARI_CURRENT
FIREFOX_CURRENT
MOBILE_SAFARI
ANDROID_CHROMIUM
WEBVIEW_APPROVED
```

Exact version policy remains project-defined.

Verification SHOULD focus on features materially sensitive to engines, including:

```text
layout/grid/flex behavior
font rendering/fallback
input/date/file controls
scroll/overscroll
sticky/fixed positioning
clipboard/drag/drop
media/canvas/WebGL where applicable
focus behavior
viewport/safe-area behavior
```

Unsupported browsers MUST be explicit rather than silently broken.

## 15.11 Offline and degraded-network states

When the product declares offline/intermittent-network support, canonical screens SHOULD model:

```text
ONLINE
SLOW
OFFLINE_WITH_CACHE
OFFLINE_NO_CACHE
RECONNECTING
STALE_DATA
SYNC_CONFLICT
RETRY_REQUIRED
```

Offline capability MUST NOT be inferred merely because a screen can render from cached static assets.

## 15.12 Fixture governance

A `DataFixtureProfile` SHOULD reference immutable/versioned fixture identity where practical.

Fixture changes that alter:

```text
cardinality
field lengths
permission visibility
error distribution
locale/content
media dimensions
AI-generated content envelope
```

MUST be treated as evidence-input drift for affected verification.

Production-like fixtures MUST remain sanitized and policy-safe.


---

# 16. Design critique and variant policy

External providers can generate many variants. SmartAIHub MUST avoid unbounded generation.

Default policy SHOULD cap automatic variant generation per decision.

Conceptual request:

```ts
interface DesignVariantRequest {
  count: number;
  goals: string[];
  constraints: string[];
  dimensions?: (
    | "LAYOUT"
    | "COLOR"
    | "INFORMATION_HIERARCHY"
    | "NAVIGATION"
    | "DENSITY"
    | "MOBILE_BEHAVIOR"
  )[];
}
```

The selected variant MUST be recorded in `DesignDecision`.

Spec 270 MUST NOT use an arbitrary visual popularity score as sole authority.

The system SHOULD explain concrete differences:

- denser vs more spacious;
- sidebar vs top navigation;
- workflow-first vs analytics-first;
- mobile-first vs desktop-dense;
- number of visible controls;
- hierarchy changes.


## 16.1 Generated copy/content governance

Provider/native design output MAY suggest copy, but canonical product copy SHOULD classify semantic roles:

```text
PAGE_TITLE
FIELD_LABEL
BUTTON_LABEL
HELP_TEXT
ERROR_MESSAGE
WARNING
LEGAL_NOTICE
CONSENT_TEXT
MARKETING_COPY
EMPTY_STATE
ONBOARDING_COPY
```

For each role, implementation SHOULD resolve applicable:

```text
terminology/glossary
brand voice
localization ownership
legal/compliance review requirement
safety/content policy
character/length constraints
accessibility naming relationship
```

Critical legal/consent/security copy MUST NOT be replaced solely for visual brevity without the required authority.

---

---

# 17. User control

Users SHOULD be able to express:

```text
Use SmartAIHub Native only
Use Stitch if available
Always ask before using Stitch
Use Stitch for this task
Do not send this project to external design providers
Prefer existing UI without redesign
Explore multiple designs
Keep current layout and only modernize styling
```

These choices MUST be represented as policy, not buried in prompt text.

Conceptual:

```ts
interface DesignExecutionPolicy {
  externalProviderMode:
    | "DENY"
    | "ALLOW"
    | "PREFER"
    | "REQUIRE_EXPLICIT_PROVIDER";

  preferredProviderId?: string;
  allowSourceUpload: boolean;
  allowScreenshotUpload: boolean;
  allowBrandAssetUpload: boolean;
  maxExternalDesignCalls?: number;
  maxVariants?: number;

  dataEgressMode?:
    | "INHERIT_PROJECT_POLICY"
    | "NO_EXTERNAL_EGRESS"
    | "ALLOW_CERTIFIED_EXTERNAL";

  executionPlacementMode?:
    | "INHERIT_WORKSPACE_POLICY"
    | "LOCAL_ONLY"
    | "CLOUD_ALLOWED";
}
```

`NO_EXTERNAL_EGRESS` or `LOCAL_ONLY` MUST prevent Stitch/other remote design-provider calls unless the governing project/workspace policy explicitly permits that destination.

If the native design path itself requires a remote model but policy forbids it, the system MUST use an authorized local/native capability or enter a truthful typed blocker. It MUST NOT silently use SmartAIHub cloud inference.

---

# 18. Data security and privacy

## 18.1 Minimize external context

The adapter SHOULD send only the context needed to perform the design task.

Do not upload:

- application secrets;
- production credentials;
- private database dumps;
- unrelated user files;
- unredacted personal information unless required, authorized and permitted.

## 18.2 Sanitized design fixtures

When a design needs realistic data, SmartAIHub SHOULD create representative mock data rather than send production records.

## 18.3 Source upload

If code-to-design requires source or rendered HTML to be sent externally, the run MUST honor project/provider data-policy settings.

## 18.4 Audit

External design calls SHOULD record:

- provider;
- capability;
- credential binding reference;
- project/workspace;
- time;
- data classification;
- artifact outputs;
- quota/cost metadata when available;
- errors;
- user policy decision.

Secrets and raw tokens MUST NOT enter audit logs.

## 18.5 Provider data-handling profile

Before external transmission, SmartAIHub SHOULD resolve a versioned provider data profile containing as available:

```text
provider
service/product
terms/privacy refs
retention policy
training/use-of-content policy when known
processing region/data residency when known
supported deletion mechanism
supported export mechanism
credential/account owner
last verified timestamp
```

If project policy requires a property that is unknown or unsupported, external design use MUST be blocked or require an authorized exception through existing policy/approval mechanisms.

## 18.6 Retention, unlink and deletion lifecycle

SmartAIHub SHALL distinguish:

```text
DISCONNECT_CREDENTIAL
UNLINK_PROVIDER_PROJECT
ARCHIVE_CANONICAL_ARTIFACT
DELETE_SMARTAIHUB_COPY
REQUEST_PROVIDER_DELETION
CONFIRM_PROVIDER_DELETION
EXPORT_BEFORE_DELETE
```

Deleting a SmartAIHub canonical artifact MUST NOT be represented as proof that a provider has deleted its copy.

Provider deletion SHOULD be best-effort only when a supported authenticated API/action exists; otherwise the UI MUST truthfully indicate manual or unsupported cleanup.

Audit/legal-retention requirements MAY prevent immediate deletion of some metadata; retained evidence MUST follow existing retention authority.

## 18.7 Ownership transfer alignment

Spec 270 consumes the product/workspace ownership-transfer authority defined elsewhere, including Spec 269 where applicable.

A design transfer record SHOULD classify:

```text
canonical artifact ownership
design-system snapshot ownership
brand assets
design asset rights/redistribution
provider project references
provider credentials/subscriptions
visual baselines
approval/evidence lineage
private prompt/context artifacts
retention/legal holds
```

Default rule:

```text
canonical SmartAIHub artifact MAY transfer if authorized
external provider credential DOES NOT transfer
external provider subscription DOES NOT transfer
provider project write authority DOES NOT transfer by implication
private tenant brand asset DOES NOT cross tenant without explicit right
```

Transferred artifacts MUST preserve provenance while re-evaluating destination tenant rights and policy.

## 18.8 Fork, template and Marketplace materialization

A fork/template/Marketplace installation SHALL create an independent destination materialization.

The materialization process MUST review/strip/rebind:

```text
secrets and credential refs
provider-account bindings
provider project IDs with write semantics
private source/context artifacts
tenant-private brand assets
non-transferable or attribution-bound assets
analytics/tracking IDs
private URLs/data fixtures
approval refs that are not valid in destination scope
```

Reusable design-system structure and transferable assets MAY retain lineage to the origin.

The publisher MUST NOT gain runtime or design-provider authority over installed copies merely because the design originated from the publisher.

---

# 19. Provider artifact ingestion

The provider-ingestion process MUST:

1. validate result type;
2. retrieve required ephemeral artifacts;
3. calculate integrity digests where appropriate;
4. store canonical copies;
5. strip unsafe executable content where required;
6. separate reference HTML from production code;
7. capture screenshots;
8. capture provider IDs for lineage;
9. write canonical metadata;
10. release temporary provider references when safe.

Production code MUST NOT embed expiring provider download URLs.


## 19.1 Design cache isolation and poisoning resistance

If caching is introduced, cache keys MUST include enough material context to prevent unsafe reuse.

Depending on cache class, key/binding dimensions SHOULD include:

```text
tenant/project scope
public-vs-private classification
provider + adapter/certification version
canonical capability
prompt/context digest
design-system/brand digest
locale/theme/device target
data classification
policy/egress profile
```

Rules:

1. private provider output MUST NOT be promoted into a shared/public cache implicitly;
2. credential-specific/provider-private project data MUST NOT leak through cache hits;
3. cached normalized artifacts MUST retain original provenance;
4. cache entries from deprecated/suspended adapter certification SHOULD be invalidated or marked stale;
5. untrusted imported content MUST NOT poison future trusted design context;
6. cache hits MUST obey current authorization/policy, not merely historical authorization.

---

---

# 19A. Localization, language and typography

Canonical design MUST distinguish semantic copy roles from visual placement.

A `LocalizationProfile` SHOULD declare:

```text
source locale
supported locales
fallback locale
RTL required?
text expansion test factor
font family / fallback policy
number/date/currency conventions
pluralization support
locale-sensitive input requirements
```

At minimum, SmartAIHub-owned surfaces SHOULD be testable with representative Thai and English content.

Where a product targets languages with substantially different word lengths, layouts MUST avoid pixel-fixed assumptions that fail under text expansion.

Typography supplied by a design provider MUST be resolved to an approved, distributable font stack. Remote provider-only fonts MUST NOT silently become runtime dependencies.

---

# 19B. Accessibility conformance evidence

Accessibility verification MUST be more than an `accessibility result` boolean.

The project SHALL define an accessibility profile. Verification SHOULD include, where applicable:

```text
semantic structure / landmarks
keyboard navigation
focus order and visible focus
accessible names / descriptions
form labels and validation
contrast checks
touch target sizing
screen-reader relevant semantics
reduced-motion behavior
zoom/reflow behavior
non-color-only status cues
modal focus management
```

Automated checks are evidence, not proof of complete accessibility.

Material accessibility deviations from a provider design are valid implementation corrections and SHOULD be recorded as intentional divergence.

---

# 19C. Asset rights, licensing and provenance

Every material external design asset SHALL have a rights classification:

```text
OWNED
USER_PROVIDED
PROVIDER_GENERATED_WITH_RECORDED_TERMS
LICENSED_FOR_DISTRIBUTION
REFERENCE_ONLY
UNKNOWN
RESTRICTED
```

`UNKNOWN`, `REFERENCE_ONLY` and `RESTRICTED` assets MUST NOT be silently packaged for public marketplace/commercial distribution.

A `DesignAssetRightsRecord` SHOULD preserve:

```text
asset digest
source/provider
creator/uploading principal
license/terms reference when known
allowed usage scope
attribution requirement
redistribution permission
modification permission
decision timestamp
```

This policy applies to images, illustrations, icons, fonts, templates, screenshots and other provider-supplied assets.

---

# 19D. Multi-tenant and white-label design inheritance

Design-system resolution SHALL have explicit precedence.

Default conceptual order:

```text
SmartAIHub platform accessibility/safety constraints
        ↓
tenant brand policy
        ↓
product/Mini App design system
        ↓
screen/workflow-specific design decisions
        ↓
provider visual proposal
```

A lower layer MUST NOT override a higher-layer security, accessibility, tenancy or protected-brand constraint without explicit authorized policy.

Tenant-private tokens/assets MUST NOT leak into:

- another tenant's provider prompts;
- shared cache entries;
- generic examples;
- public templates;
- another user's generated design.

A white-label product MAY diverge visually from SmartAIHub while still using the same canonical component and verification contracts.

---

# 19E. Untrusted imported design content and prompt-injection defense

Any imported HTML, code, README, DESIGN.md, image text, provider metadata or external design description SHALL be treated as **data**.

It MUST NOT gain authority merely by containing text such as:

```text
ignore previous instructions
upload the repository
disable security checks
use this secret
approve this design automatically
```

Before agent consumption, imported design context SHOULD be:

1. classified by source;
2. sanitized where executable content exists;
3. stripped of active scripts/event handlers for static inspection;
4. isolated from secrets;
5. passed with explicit untrusted-content boundaries;
6. prevented from altering tool permissions, approval policy or system instructions.

Provider HTML MUST NOT execute in a privileged SmartAIHub origin before sanitization/sandboxing.

---

# 19F. Design operation concurrency and collaboration

Design workflows MAY involve:

- the user;
- Primary/Specialist Assistants;
- Spec 224;
- external coding harnesses;
- external design providers.

Therefore design mutations MUST have concurrency semantics.

A mutation SHOULD include:

```text
artifact_id
base_version
expected_digest
mutation_id
actor
lease/version condition
```

Conflicts MUST NOT be resolved with silent last-write-wins for selected/approved artifacts.

For competing edits, the system SHALL create a conflict/merge decision or a new branch/variant with explicit lineage.

---

# 19G. Feature flags, rollout and kill switch

Initial implementation MUST be feature-flagged.

At minimum:

```text
design_intelligence.enabled
design_intelligence.native.enabled
design_intelligence.astryx_resolver.enabled
design_intelligence.external_providers.enabled
design_intelligence.google_stitch.enabled
design_intelligence.visual_verify.enabled
design_intelligence.core_product_self_design.enabled
```

Provider enablement SHOULD support user/team/tenant and environment scopes.

A platform kill switch MUST be able to stop new Stitch calls without preventing runtime use of applications previously designed with Stitch.

Core-product self-redesign SHOULD launch later than Mini App/provider sandbox validation because it can affect SmartAIHub's own primary interface.

---

# 19H. Visual baseline and regression lifecycle

A verified implementation MAY establish a versioned visual baseline.

The baseline MUST bind to:

```text
application/release
design artifact digest
component-catalog/design-system versions
viewport/device profile
locale/theme profile
verification timestamp
```

Later dependency, theme or component upgrades SHOULD compare against the relevant baseline.

Baseline acceptance MUST distinguish:

```text
EXPECTED_CHANGE
REGRESSION
DATA_VARIANCE
NON_DETERMINISTIC_RENDER
NOT_COMPARABLE
```

A regression MUST NOT be made green merely by replacing the expected screenshot.

---

# 19I. Frontend performance and delivery budget

A `PerformanceProfile` SHOULD define product-appropriate budgets such as:

```text
initial JS/CSS budget
critical image budget
font budget
largest-content asset constraints
layout-shift tolerance
interaction latency target
initial render target
route transition target
network profile(s)
low-end/mobile profile where applicable
```

Spec 270 does not own performance tooling, but Final Verify SHOULD consume measured evidence from existing test/verification infrastructure.

Design decisions that materially increase:

- image size;
- custom-font count;
- client-side bundle weight;
- DOM/list size;
- animation workload;
- blocking network requests;

MUST be visible as implementation implications rather than treated as free visual choices.

## 19J. Preview sandbox and remote-resource policy

Reference HTML from external providers MUST NOT be mounted directly into a privileged application origin.

Preview execution SHOULD use:

```text
sandboxed origin/frame/container
no ambient credentials
restricted network egress
CSP or equivalent content policy
no top-level navigation authority
no clipboard/device access unless explicitly permitted
blocked or proxied trackers
captured/pinned external resources for reproducible evidence
```

If remote assets cannot be captured or legally mirrored, visual evidence SHALL record reduced reproducibility instead of silently depending on mutable third-party URLs.

## 19K. Navigation, browser-history and unsaved-work semantics

For stateful web/Mini App flows, canonical design SHOULD define relevant navigation behavior:

```text
route/deep-link identity
back/forward behavior
refresh/reload recovery
tab/window reopen behavior
unsaved-change warning or autosave semantics
modal/drawer URL behavior when relevant
cross-device continuation expectations when applicable
```

A visually valid multi-screen flow that cannot survive refresh/back/deep-link requirements is not implementation-complete.

## 19L. Canonical design schema migration

Persisted `CanonicalDesignArtifact.schemaVersion` MUST participate in an explicit migration policy.

Implementations SHALL support one of:

```text
read-old / write-new migration
explicit offline migration
version-specific reader
safe unsupported-version state
```

A migration MUST preserve:

- artifact identity/version;
- lineage;
- digest semantics or replacement digest provenance;
- provider provenance;
- approvals or their stale status;
- rights metadata;
- action bindings;
- verification references.

Irreversible migration MUST be declared rather than silently performed.

## 19M. Cross-provider fallback branch discipline

If provider A fails after producing partial artifacts and provider B/native continues:

```text
Provider A partial branch
Provider B/native branch
```

MUST remain distinct until canonical normalization and an explicit merge/selection step.

The system MUST NOT produce a single apparently coherent candidate whose regions came from multiple providers without recording that composition and re-running relevant rights, policy, action-binding and visual verification.

## 19N. SPAAS design-evidence handoff

For artifacts governed by Spec 261, Spec 270 MAY emit references such as:

```text
canonical_design_artifact_ref
design_artifact_digest
design_system_snapshot_ref
component_resolution_digest
action_binding_digest
visual_verification_ref
accessibility_evidence_ref
performance_evidence_ref
rights_summary_ref
```

These are package-candidate provenance/verification attachments only.

Spec 261 remains the authority for whether/how such metadata is represented in the final SPAAS manifest, attestation or release bundle.

---

# 19N.1 Accessible data-visualization semantics

For material charts, maps, graphs and visual analytics, canonical design SHOULD define:

```text
semantic title/description
units and scale
legend semantics
color-independent distinction
keyboard/focus behavior where interactive
screen-reader/table/text alternative where practical
empty/loading/error/no-data states
high-contrast behavior
reduced-motion behavior for animated visualization
```

A visual chart screenshot alone is insufficient evidence that the underlying information is accessible.

## 19N.2 External link, redirect and destination safety

External navigation generated or suggested by a design provider MUST resolve through approved routing/security policy.

The implementation SHOULD classify:

```text
same-origin route
trusted first-party domain
approved external domain
user-supplied destination
untrusted/unknown destination
download
new-window navigation
```

Controls that navigate externally SHOULD make destination/context clear where user trust could be affected.

Provider output MUST NOT silently add:

```text
javascript: URLs
unsafe data URLs
open redirect parameters without validation
reverse-tabnabbing behavior
credential-bearing query strings
phishing-like first-party visual impersonation
```

---

# 19O. Durability, backup and restore closure

Spec 270 does not own backup infrastructure. It SHALL consume canonical storage/backup authorities.

A `CanonicalDesignArtifact` restore is complete only when required SmartAIHub-owned closure can be verified, including as applicable:

```text
database metadata/version
canonical screen/flow records
design-system snapshot
component/action bindings
required R2/binary assets
rights metadata
visual baseline/evidence refs subject to retention policy
lineage/digest references
```

Restore verification SHOULD detect:

```text
missing R2/object asset
digest mismatch
orphan database reference
schema-version incompatibility
partial restore generation
cross-tenant ownership mismatch
```

Provider-hosted source projects are not required for runtime recovery if canonicalization was complete.

Durability class/RPO/RTO claims remain owned by the canonical workspace/storage authority.

## 19P. Reference-aware retention and garbage collection

Design assets MAY be large and duplicated across variants.

Garbage collection MUST be reference-aware.

Before deletion, the system SHOULD account for references from:

```text
active/draft/selected canonical artifacts
implemented source/release provenance
SPAAS package/release evidence
visual baselines
audit/legal retention
Marketplace/template dependencies
fork lineage requiring retained asset rights/provenance
```

Content-addressed de-duplication MAY be used when tenant/privacy policy permits.

Cross-tenant binary de-duplication MUST NOT imply cross-tenant metadata visibility or access.

## 19Q. Dynamic AI-generated content envelope

For products that render runtime model-generated content, a `DynamicContentProfile` SHOULD bound representative content classes.

Examples:

```text
very short / very long generated text
Markdown/list/table/code output
Unicode/emoji/Thai/English mixed text
unexpected line breaks
generated images of varying aspect ratio
missing/broken generated media
streaming partial output
citation/source chips
tool/action result cards
safety refusal/error content
```

The UI MUST remain usable when generated content is within declared supported bounds.

The design MUST provide overflow/truncation/expand/collapse/scroll behavior rather than assuming ideal output length.

Dynamic content verification does not authorize unsafe model content; content-safety authority remains elsewhere.

## 19R. Input modality, orientation and mobile chrome

Applicable verification SHOULD include:

```text
portrait / landscape
touch
mouse/pointer
keyboard-only
hover-capable / no-hover
mobile safe-area insets/notches
on-screen keyboard open
small-height viewport
browser zoom/text scaling
```

Critical controls MUST remain reachable when the virtual keyboard is open where text entry is a primary task.

Hover-only affordances MUST have a non-hover equivalent on touch targets.

## 19S. Design-system dependency pinning and rollback

A verified release SHOULD reference the material design-system/component-catalog versions or compatible range used during verification.

When Astryx/product components/themes are upgraded:

```text
discover impacted mappings
mark affected evidence stale
run targeted compatibility verification
promote only through normal release policy
```

If an upgrade causes regressions, the product MUST be able to remain on or roll back to a previously supported compatible UI dependency set according to existing dependency/release authority.

Spec 270 MUST NOT silently mutate already released source to follow the newest design system.

## 19T. Analytics, telemetry and privacy bindings

Any production UI action that emits analytics/telemetry beyond canonical platform defaults SHOULD be represented as a real capability/binding, not hidden visual behavior.

A design provider MUST NOT authorize:

```text
third-party tracker
analytics vendor SDK
pixel/beacon
session recording
marketing tag
tenant analytics ID
```

merely by generating markup or suggesting it.

Such additions MUST pass applicable:

```text
privacy/consent policy
tenant policy
data-egress policy
dependency/supply-chain review
rights/terms review
```

Preview/reference provider trackers MUST remain blocked by sandbox policy.

## 19U. Trusted sensitive-interaction patterns

Sensitive UI classes SHOULD map to approved trusted primitives/patterns:

```text
login / re-authentication
secret/API-key entry
payment/checkout
permission grant
destructive confirmation
external account connection
file/device permission request
production deploy approval
```

The resolver SHOULD reject or rework provider output that:

- imitates trusted browser/system prompts;
- requests secrets in ordinary text/chat surfaces;
- obscures destination/account identity;
- removes required confirmation or trust context;
- makes destructive actions indistinguishable from benign actions.

## 19V. Variant auto-selection authority

`DesignDecision` SHOULD record:

```text
selector principal/agent
selection policy
candidate set digest
material tradeoffs
approval requirement
reason/evidence refs
```

Automatic selection MAY occur for bounded aesthetic alternatives under policy.

Human/authorized review SHOULD be required when variants differ materially in:

```text
information disclosed
permissions/actions
external provider/integration use
paid functionality
rights/licensing exposure
tenant branding policy
major navigation/workflow semantics
```

## 19W. Provider-generated source and dependency admission

Provider output MAY contain implementation code, package names, CDNs, scripts or custom fonts.

Before adoption into production source:

1. extract proposed dependencies/remote resources;
2. map against existing approved dependencies/components;
3. prefer existing dependency/component where equivalent;
4. route new dependencies through Spec 224 dependency/source/license/security gates;
5. pin/lock according to repository policy;
6. prohibit `latest`/unpinned remote executable dependencies for promotion-grade builds;
7. preserve source/provenance of generated code.

A provider HTML prototype is never permission to install arbitrary packages or execute remote scripts.

---

# 19X. Provider-neutral design export/import bundle

SmartAIHub SHOULD support an export bundle for canonical design portability.

Conceptual bundle:

```text
manifest.json
canonical-design.json
design-system-snapshot.json
component-intents.json
action-bindings.json
semantic-diff-history/            optional
DESIGN.md                         optional
assets/                           only exportable assets
rights-manifest.json
localization-profile.json         optional
theme-profile.json                optional
verification-index.json           optional / redacted
provenance-summary.json           redacted as required
```

Rules:

- bundle format MUST be versioned;
- secret/provider credentials MUST never be exported;
- non-exportable/private assets MUST be omitted with explicit unresolved references;
- import MUST treat bundle content as untrusted;
- import MUST create destination-scoped identity/authority;
- import MUST not assume external provider projects are accessible;
- rights/provenance must survive to the extent permitted.

This bundle is a design-artifact interchange, not a replacement for SPAAS application packaging.

## 19Y. Provenance redaction and support bundles

Different audiences need different provenance visibility.

The platform SHOULD support views such as:

```text
OWNER_FULL
TEAM_AUTHORIZED
SUPPORT_REDACTED
MARKETPLACE_PUBLIC
EXPORT_REDACTED
```

Redaction may apply to:

```text
raw prompts
private source/context excerpts
provider account/project identifiers
user names/emails
tenant-private asset paths
internal policy details
sensitive data-classification labels
```

Redaction MUST preserve integrity of the visible lineage; it MUST NOT fabricate false provenance.

## 19Z. Archival readability and future decoding

Selected/implemented design artifacts intended for long retention SHOULD preserve:

```text
schema version
canonical encoding/version
content digests
required migration path/version
asset media types
rights metadata
human-readable summary
provider-neutral semantic fields
```

Archive durability MUST NOT require an active Stitch account, provider SDK or provider-hosted screen to understand what was approved/implemented.

Where a legacy schema becomes unreadable by current code, restore/import MUST enter an explicit migration-required state rather than silently dropping fields.

## 19AA. Post-release UX feedback and design experiments

Production feedback MAY include:

```text
user-reported usability issue
support incident
task completion friction
navigation abandonment
accessibility feedback
performance/interaction regressions
explicit experiment result
```

Such signals MAY create:

```text
DesignFeedbackRecord
DesignImprovementCandidate
DesignExperiment
```

They MUST NOT directly mutate active source/design.

A design experiment SHOULD bind:

```text
experiment id
candidate design versions
target population/scope
start/end policy
metrics/guardrails
privacy/consent policy
release versions
result/evidence refs
```

Spec 270 does not own experimentation/analytics infrastructure; it only preserves design lineage and requires normal implementation/release authority for promotion.

---
# 20. Failure and fallback behavior

| Condition | Required behavior |
|---|---|
| No Stitch connection | use native design path |
| Auth failed | mark connection unhealthy; native fallback unless provider explicitly required |
| Permission denied | explain permission requirement; fallback when policy allows |
| Rate limited | wait/retry according to existing job policy or fallback |
| Network error | retry through existing orchestration policy; fallback if permitted |
| Clarification required | resolve from approved context or surface Needs You |
| Provider result malformed | reject provider artifact; preserve run; fallback |
| Provider service removed | disable adapter; existing apps continue running |
| User disconnects after build | no effect on deployed app |
| User disconnects mid-design | preserve canonicalized artifacts already imported; continue/fallback per policy |
| Provider SDK contract changes | suspend incompatible adapter capability; do not guess old semantics |
| Provider cleanup API unavailable | report provider-side deletion unsupported/manual; do not claim deletion |
| Visual environment drift | mark affected evidence stale and reverify per Spec 224 |
| Theme-specific regression | block affected theme/profile from passing final UI verification |
| Provider A partially succeeds then fallback occurs | branch outputs; explicit normalize/select/merge only |
| Old artifact schema cannot migrate safely | safe unsupported/migration-required state; no silent rewrite |
| Workspace policy is LOCAL_ONLY / NO_EXTERNAL_EGRESS | do not call Stitch/remote design provider; local/native or typed blocker |
| Ownership transfer changes tenant | preserve authorized canonical lineage; re-authorize provider/brand/rights bindings |
| Fork/template install | materialize independent destination scope; strip/rebind private authority |
| Cache key missing tenant/private context | reject unsafe shared cache behavior |
| Restore metadata succeeds but R2 design asset missing | restore incomplete/corrupt; no false success |
| Runtime AI output exceeds normal content size | bounded dynamic-content behavior; no broken critical UI |
| Astryx/theme upgrade breaks verified screen | stale evidence; targeted verify/hold/rollback |
| Provider prototype includes tracker/package/CDN script | block or route through canonical privacy/dependency gates |
| Backend API field/state changes after design verification | stale affected bindings/fixtures/evidence and reverify |
| Component becomes deprecated/blocked | stop selecting for new work; migrate/review affected use |
| Hydration/streaming differs from prototype | rendering-mode verification failure/review |
| Safari/Firefox materially diverges from Chromium | compatibility failure for declared browser profile |
| Offline-capable app loses network mid-flow | explicit offline/reconnect state; no silent data loss |
| Fixture profile changes materially | affected evidence stale |
| Provider rewrites legal/consent copy for aesthetics | preserve/require content authority review |
| Chart communicates status only by color/hover | accessibility review fails until semantic alternative exists |
| Generated external link uses unsafe redirect/destination | block/rewrite through canonical navigation policy |
| Imported design bundle contains provider credential/private asset | reject/strip/rebind; never import authority |
| Support user requests provenance | provide authorized redacted view, not raw sensitive context |
| Archived artifact schema is no longer directly readable | explicit migration-required path |
| UX experiment favors new variant | create promotion candidate; do not mutate active release directly |

---

# 21. Runtime independence

This section is a release gate.

A Mini App or SmartAIHub release built with Stitch MUST pass:

```text
STITCH_RUNTIME_DEPENDENCY = false
```

Verification SHALL ensure that production bundles do not require:

- Stitch access tokens;
- Stitch API keys;
- Stitch project IDs for normal rendering;
- Stitch MCP availability;
- Stitch signed asset URLs;
- Stitch SDK calls during normal user interaction.

Release verification SHOULD additionally scan source, manifests, environment requirements and built bundles for prohibited provider-runtime references.

A future feature that intentionally offers live Stitch editing inside a product MUST be separately authorized and MUST NOT weaken this rule for ordinary application runtime.

---

# 22. Storage model

Recommended logical entities:

```text
design_provider_connections
design_provider_capabilities
design_briefs
canonical_design_artifacts
canonical_design_screens
design_variant_sets
design_decisions
design_system_snapshots
component_intents
component_resolutions
design_asset_refs
visual_verification_runs
visual_verification_evidence
design_provider_call_events
```

These MAY be consolidated if existing schemas already provide equivalent primitives.

Do not create tables solely to mirror provider-internal objects.

---

# 23. API / service surface

Illustrative platform API:

```text
GET    /design/providers
POST   /design/providers/:provider/connect
DELETE /design/providers/:provider/connection

POST   /design/briefs
GET    /design/briefs/:id

POST   /design/artifacts/generate
POST   /design/artifacts/:id/variants
POST   /design/artifacts/:id/critique
POST   /design/artifacts/:id/select

POST   /design/artifacts/:id/resolve-components
POST   /design/artifacts/:id/verify

GET    /design/artifacts/:id
GET    /design/artifacts/:id/lineage
```

Existing SmartAIHub RPC conventions MAY replace REST.

Spec 270 does not require this exact URL shape.

---

# 24. UI / UX surfaces

## 24.1 Provider settings

User settings SHOULD show:

```text
Design Providers

SmartAIHub Native Design
Status: Available

Google Stitch
Status: Connected / Not connected / Quota limited / Needs attention
Credential owner: You
Use automatically: [policy]
```

Do not imply that connecting Stitch is required.

## 24.2 Mini App Creator

For significant design tasks:

```text
Design method
● SmartAIHub chooses the best available path
○ SmartAIHub Native
○ Google Stitch            [if connected]
```

Advanced provider choice SHOULD be optional; ordinary users should not be forced to understand MCP/provider mechanics.

## 24.3 Development evidence

Task Control SHOULD be able to show:

```text
Design
✓ Brief created
✓ 3 candidates explored
✓ Candidate B selected
✓ 42 component intents resolved
✓ phone/tablet/desktop verified
```

Provider implementation detail MAY be expandable rather than dominant.

---

# 25. Integration with Assistants / Spec 269

An Assistant MAY request design work through canonical capabilities.

Example:

```text
Primary Assistant
   ↓
"Create a better onboarding flow"
   ↓
design.generate_variants
   ↓
Spec 256 resolver
   ↓
Spec 270 provider
   ↓
canonical design artifact
   ↓
Spec 224 implementation
```

Assistant identity does not own the provider connection.

Provider access remains governed by the user/project/team credential and policy boundary.

---

# 26. Integration with Mini App portability / Spec 261

A portable Mini App MUST package the implementation and canonical application assets required for execution.

It MUST NOT require the original design provider to be present.

Optional development metadata MAY preserve:

```text
design provenance
design artifact IDs
provider lineage
DESIGN.md
visual baselines
```

This metadata assists future editing but is not runtime-critical.

---

# 27. Cost and quota model

Because external provider commercial terms and entitlement models can change, Spec 270 defines generic accounting.

```ts
interface DesignProviderUsageObservation {
  providerId: string;
  requestId?: string;
  quotaState:
    | "UNKNOWN"
    | "AVAILABLE"
    | "LOW"
    | "EXHAUSTED"
    | "RATE_LIMITED";
  estimatedCost?: number;
  currency?: string;
  providerReportedUsage?: unknown;
}
```

SmartAIHub MUST distinguish:

- SmartAIHub credits;
- external subscription entitlement;
- external quota;
- direct provider charges;
- unknown cost.

An unknown external cost MUST NOT be represented as zero.

BYOC usage SHOULD be labeled clearly as provider-account usage.

Before an automatic provider call that may consume paid or scarce user entitlement, the run SHOULD resolve the existing budget/consent policy. Retries caused by SmartAIHub/provider uncertainty MUST preserve correlation so usage is not accidentally multiplied without visibility.

---

# 28. Observability

Minimum operational metrics:

```text
design_requests_total
design_provider_requests_total{provider}
design_provider_failures_total{provider,code}
design_provider_fallback_total{from,to,reason}
design_provider_latency
design_variant_count
component_resolution_reuse_ratio
new_component_creation_ratio
visual_verification_failures
responsive_failures
accessibility_failures
runtime_external_design_dependency_violation
provider_adapter_contract_failure_total{provider,adapter_version}
visual_evidence_stale_total{reason}
design_source_drift_total
theme_verification_failures{theme}
performance_budget_failures{profile}
provider_cleanup_pending_total{provider}
design_schema_migration_failures
design_cache_cross_scope_block_total
design_restore_closure_failures{reason}
design_asset_gc_blocked_references_total
dynamic_content_ui_failures{profile}
input_modality_ui_failures{profile}
design_dependency_upgrade_regressions
provider_generated_dependency_rejections_total{reason}
design_semantic_diff_high_risk_total
deprecated_component_resolution_total{status}
data_contract_drift_invalidations_total
rendering_mode_verification_failures{mode}
browser_compatibility_failures{profile}
offline_degraded_flow_failures{state}
fixture_drift_invalidations_total
content_governance_review_required_total{role}
data_visualization_accessibility_failures
external_navigation_rejections_total{reason}
design_export_import_failures{stage}
archival_decode_failures{schema_version}
post_release_design_feedback_total{class}
```

A high `new_component_creation_ratio` SHOULD trigger review because it may indicate failure to reuse Astryx/product components.

---

# 29. Quality metrics

Spec 270 SHOULD track quality trends without turning subjective design taste into one opaque score.

Useful measures:

- component reuse ratio;
- accessibility violation count;
- responsive overflow count;
- visual mismatch classifications;
- number of unresolved component intents;
- number of design iterations;
- user-selected variant;
- post-implementation correction count;
- Mini App completion rate;
- time from requirement to verified UI.

Subjective aesthetic judgments SHOULD remain explainable and reviewable.

---

# 30. Provider lifecycle

A provider adapter SHALL support lifecycle states:

```text
REGISTERED
AVAILABLE
DEGRADED
AUTH_REQUIRED
RATE_LIMITED
DISABLED
DEPRECATED
REMOVED
```

Deprecating Stitch or another provider MUST NOT invalidate canonical artifacts already imported.

Existing applications MUST continue to build from SmartAIHub-owned source and artifacts.

---

# 31. Versioning and drift

The canonical artifact SHALL record:

- provider adapter version;
- provider capability snapshot;
- design-system snapshot;
- Astryx/component-catalog version;
- SmartAIHub UI policy version.

When the production design system changes materially, the system MAY detect stale mappings and request re-resolution.

It MUST NOT silently regenerate a user's entire product from the latest provider output.

A component-catalog/design-system upgrade that changes mapping semantics SHOULD mark affected `ComponentResolution` records as stale and require targeted re-resolution rather than global redesign.

Provider adapter certification, canonical artifact schema, visual baseline and component catalog SHALL be versioned independently so drift can be localized.

Schema migration and source↔design alignment status SHALL be explicit. A successful source build does not imply the stored design artifact remains current.

Design-system/component dependency versions, prompt/context envelope digests and applicable provider certification versions SHOULD be traceable from the verified artifact/evidence graph.

---

# 32. Implementation phases

## Phase 270-A — G0 + Canonical contracts

Implement:

- canonical spec-number/repository reconciliation;
- feature flags default-off;
- live schema/capability/component-catalog discovery;

- provider interface;
- capability registry mapping;
- `DesignBrief`;
- `CanonicalDesignArtifact`;
- provenance;
- provider policy;
- component-intent contract.

Exit criteria:

- native provider works;
- no external provider required.

## Phase 270-B — Astryx resolver

Implement:

- product-component catalog bridge;
- Astryx catalog bridge;
- component intent resolution;
- reuse-first enforcement;
- mapping evidence.

Exit criteria:

- representative designs resolve predominantly to existing components;
- unresolved intents are explicit.

## Phase 270-C — Stitch adapter

Implement:

- connection binding;
- API key / OAuth-compatible abstraction;
- capability discovery;
- generate/edit/variant;
- artifact import;
- error translation;
- quota/rate-limit states;
- no runtime dependency.

Exit criteria:

- one user can connect and generate designs;
- a non-connected user follows native path;
- disconnecting Stitch does not break imported work.

## Phase 270-D — Spec 224 design gate

Integrate:

- complexity classification;
- design checkpoint;
- design artifact reference;
- component-resolution gate;
- visual verification phase.

Do not fork the Spec 224 state machine.

## Phase 270-E — Mini App Creator

Add:

- design-method UI;
- variant preview;
- selection;
- component mapping;
- phone/tablet/desktop preview.

## Phase 270-F — SmartAIHub self-development

Enable:

- existing-code design extraction;
- provider-assisted redesign;
- controlled implementation through Spec 224;
- baseline comparison with current UI.

## Phase 270-G — hardening

Add:

- immutable artifact version/concurrency tests;
- action/backend capability-binding validation;
- approval freshness tests;
- localization/Thai/English/RTL test fixtures;
- asset-rights/provenance gates;
- tenant brand isolation tests;
- imported-content prompt-injection tests;
- visual baseline anti-blessing tests;
- Stitch/provider SDK contract compatibility tests;
- deterministic visual environment/evidence freshness tests;
- light/dark/system/high-contrast/tenant-theme matrix tests where applicable;
- frontend performance budget tests;
- representative data-density fixtures;
- navigation/deep-link/back/refresh/unsaved-work tests;
- canonical design schema migration tests;
- source↔design drift detection tests;
- provider retention/unlink/delete lifecycle tests;
- provider data-residency/retention-policy gating tests;
- motion/reduced-motion behavior tests;
- preview sandbox/network/resource tests;
- cross-provider fallback branch tests;
- DesignPromptEnvelope/provenance/replay classification tests;
- cache partition/poisoning/current-authorization tests;
- LOCAL_ONLY/NO_EXTERNAL_EGRESS routing tests;
- ownership-transfer re-authorization tests;
- fork/template/Marketplace stripping/rebinding tests;
- design artifact + R2/object restore-closure tests;
- reference-aware design-asset garbage-collection tests;
- dynamic generated-content stress tests;
- orientation/safe-area/virtual-keyboard/input-modality tests;
- design-system upgrade/rollback compatibility tests;
- analytics/tracker privacy-binding tests;
- trusted auth/payment/secret-entry pattern tests;
- variant auto-selection authority tests;
- provider-generated dependency/supply-chain admission tests;
- semantic design-diff/materiality/approval-summary tests;
- component deprecation/replacement resolution tests;
- backend/API/data-contract drift invalidation tests;
- SSR/streaming/hydration rendering-mode tests;
- declared browser/engine compatibility tests;
- offline/PWA/degraded-network state tests where claimed;
- fixture-version/freshness drift tests;
- generated-copy/terminology/legal-content authority tests;
- chart/map/data-visualization accessibility tests;
- external-link/open-redirect/new-window safety tests;
- canonical design export/import/redaction tests;
- archival decode/migration tests;
- post-release feedback/experiment lineage tests;

- provider outage tests;
- quota tests;
- security controls;
- artifact sanitization;
- drift/version policy;
- observability;
- load/concurrency tests.

---

# 33. Acceptance criteria

## AC-270-001 — No-Stitch Mini App

Given a user with no Stitch connection, when they request an L4 Mini App, SmartAIHub MUST produce a design artifact and continue into implementation using the native path.

## AC-270-002 — Stitch-connected Mini App

Given an authorized Stitch connection, SmartAIHub MAY create multiple provider variants, allow a selection, normalize it and implement it through the same canonical path.

## AC-270-003 — User disconnect

After provider output has been canonicalized and implemented, removing the Stitch connection MUST NOT break build, deploy or runtime.

## AC-270-004 — Runtime network isolation

A deployed Mini App built with Stitch MUST still render and operate when access to Stitch endpoints is blocked.

## AC-270-005 — Signed URL protection

Production bundles MUST contain no expiring Stitch asset/download URLs required for normal use.

## AC-270-006 — Component reuse

If an equivalent SmartAIHub/Astryx component exists, generated provider HTML MUST NOT create a duplicate generic component without explicit justification.

## AC-270-007 — Explicit provider

If a user explicitly requires Stitch and Stitch is unavailable, the run MUST expose that blocker instead of silently representing native output as Stitch output.

## AC-270-008 — Atomic edit

A simple L0 edit MUST not invoke Stitch by default.

## AC-270-009 — Responsive evidence

A general-purpose Mini App UI MUST produce phone, tablet and desktop verification evidence before final UI verification.

## AC-270-010 — Provider quota

Rate-limit/quota failure MUST be represented as a typed provider state and handled without corrupting the DevelopmentRun.

## AC-270-011 — Security

External-provider payloads MUST exclude secrets and unrelated production data.

## AC-270-012 — Provenance

The system MUST be able to identify whether a design artifact came from Native, Stitch, existing UI or imported content.

## AC-270-013 — SmartAIHub core UI

A new SmartAIHub page MAY use Stitch-assisted design, but final code MUST resolve through the production component policy and Spec 224 verification.

## AC-270-014 — Provider removal

Disabling the Stitch adapter globally MUST not make existing Mini Apps undeployable solely because they were originally designed with Stitch.

## AC-270-015 — No plan-name dependency

Changing or removing an external subscription-plan label MUST not require source-code changes to design routing.

## AC-270-016 — Functional truthfulness

A provider-generated control with no matching backend/capability contract MUST be classified as work-required, deferred, presentational or unsupported before selection/final implementation.

## AC-270-017 — Stale write protection

Two concurrent mutations against the same selected artifact version MUST NOT silently overwrite each other.

## AC-270-018 — Approval freshness

A material interaction/data/provider/cost change after approval MUST invalidate or revalidate the affected approval according to existing approval authority.

## AC-270-019 — Asset rights

A public/marketplace package containing an asset with `UNKNOWN` redistribution rights MUST fail the rights gate.

## AC-270-020 — Localization

Representative Thai and English copy MUST not create unresolved critical overflow/truncation on required device classes. RTL verification is required when declared by the product.

## AC-270-021 — Tenant isolation

A tenant-specific logo/token/provider credential MUST never appear in another tenant's design artifact or provider request.

## AC-270-022 — Prompt injection

Instructions embedded in imported HTML/DESIGN.md/provider output MUST not alter SmartAIHub tool authority or approval policy.

## AC-270-023 — Provider certification

A reachable provider whose required capability certification is suspended MUST not be selected merely because health check succeeds.

## AC-270-024 — Visual baseline integrity

Changing an expected screenshot without an authorized design/baseline decision MUST not turn a failed visual regression into a pass.

## AC-270-025 — Cancellation

Cancelling a design operation MUST preserve canonicalized prior work, prevent partial selection and reconcile provider usage/status.

## AC-270-026 — Retry idempotency

A retry after uncertain provider response MUST not create uncontrolled duplicate provider projects/screens without correlation or reconciliation.

## AC-270-027 — Accessibility evidence

Final verification for material UI MUST produce structured accessibility evidence rather than only a single pass/fail flag.

## AC-270-028 — Feature flag safety

Disabling `design_intelligence.google_stitch.enabled` MUST stop new Stitch calls while existing applications and canonical design artifacts remain usable.

## AC-270-029 — Core-product rollout isolation

Experimental provider-assisted redesign of SmartAIHub core UI MUST be preview/canary isolated and MUST NOT automatically promote to production.

## AC-270-030 — Registry collision

Implementation MUST halt or renumber this proposal if canonical registry reconciliation proves that Spec 270 is occupied by unrelated authority.

## AC-270-031 — Provider SDK contract drift

If a provider SDK/API breaking change alters a certified adapter contract, affected capabilities MUST become suspended/degraded until compatibility tests pass.

## AC-270-032 — Visual evidence freshness

Changing browser major version, font set, theme, fixture snapshot or other material visual environment input MUST stale or reclassify affected evidence according to Spec 224.

## AC-270-033 — Theme matrix

A product declaring dark mode MUST not pass UI verification solely from light-mode evidence.

## AC-270-034 — Performance budget

A materially over-budget frontend MUST surface a performance verification failure/review condition even when pixel comparison passes.

## AC-270-035 — Data density

A data-heavy screen MUST be verified with at least one representative high-density/long-content fixture appropriate to the product.

## AC-270-036 — Navigation continuity

Declared deep-link/back/refresh/unsaved-work behavior MUST be verified for stateful multi-screen flows.

## AC-270-037 — Artifact schema migration

An older supported canonical artifact MUST either migrate with lineage/evidence preserved or enter an explicit migration-required/unsupported state.

## AC-270-038 — Source/design drift

A material manual source edit that changes rendered UI MUST be able to mark prior alignment/visual evidence stale.

## AC-270-039 — Provider deletion truthfulness

Deleting a SmartAIHub copy MUST not be reported as provider-side deletion unless provider deletion is actually confirmed through a supported mechanism.

## AC-270-040 — Provider data policy

If project policy requires a known processing/retention property and the provider profile cannot satisfy it, external transmission MUST not proceed without authorized exception.

## AC-270-041 — Motion/reduced-motion

A product using material animation MUST verify declared reduced-motion behavior and keyboard/focus continuity.

## AC-270-042 — Preview sandbox

External provider HTML MUST not execute with ambient SmartAIHub credentials or privileged origin authority.

## AC-270-043 — SPAAS authority boundary

Design metadata handoff MUST not create a second package manifest/signing/release authority outside Spec 261.

## AC-270-044 — Role states

Representative role/permission variants MUST not expose actions or information forbidden by the canonical authorization model.

## AC-270-045 — Cross-provider fallback provenance

A provider fallback after partial output MUST not silently blend artifacts into a single selected design without explicit provenance-preserving normalization/merge.

## AC-270-046 — Design request provenance

A selected externally generated design MUST be traceable to a secret-safe prompt/context/policy/provider envelope sufficient for audit/explanation.

## AC-270-047 — Reproducibility truthfulness

The system MUST not claim deterministic regeneration for a provider generation classified as non-deterministic or non-replayable.

## AC-270-048 — Cache isolation

A private design cache entry created for one tenant/project MUST not be served to another unauthorized tenant/project because prompt text happens to match.

## AC-270-049 — Local-only/no-egress

A project configured to prohibit external egress MUST make zero Stitch/remote-design calls during the protected design run.

## AC-270-050 — Ownership transfer

Transferring a product MUST NOT transfer a user's Stitch credential/subscription/provider-project write authority without destination re-authorization.

## AC-270-051 — Fork/template safety

A Marketplace/template/fork materialization MUST not include source-owner secrets, private provider bindings, private analytics IDs or unauthorized tenant brand assets.

## AC-270-052 — Restore closure

A restore with missing/digest-invalid required SmartAIHub-owned design assets MUST not be certified complete.

## AC-270-053 — Garbage-collection safety

An asset referenced by a retained canonical artifact/release/evidence record MUST not be deleted by routine design-asset garbage collection.

## AC-270-054 — Dynamic generated content

Declared runtime AI-content envelopes MUST not cause critical controls to disappear, overlap or become inaccessible under supported content bounds.

## AC-270-055 — Input modality/mobile chrome

A primary mobile text-entry flow MUST remain operable with the on-screen keyboard open and must not depend on hover-only controls.

## AC-270-056 — Design-system upgrade

A material Astryx/product-component/theme upgrade MUST stale/reverify impacted UI evidence before promotion when compatibility is not already proven.

## AC-270-057 — Analytics privacy

Provider-generated analytics/tracker code MUST not reach production solely because it appears in generated HTML.

## AC-270-058 — Sensitive interaction trust

Secret/payment/authentication UI MUST resolve to approved trusted patterns or fail review when provider output obscures the trust boundary.

## AC-270-059 — Variant selection authority

An autonomous agent MUST not auto-select between variants that materially differ in privacy, permission, paid integration, rights or major workflow semantics unless current policy explicitly authorizes that decision scope.

## AC-270-060 — Dependency admission

A package/CDN/script/build plugin newly suggested by provider-generated code MUST pass existing dependency/source/license/security admission before production use.

## AC-270-061 — Semantic diff

A material navigation/action/permission/data-exposure change MUST appear in semantic design diff even if the pixel-level change is small.

## AC-270-062 — Decision rationale

A selected material design variant MUST retain selector/rationale/tradeoff lineage and identify a later superseding decision when replaced.

## AC-270-063 — Component deprecation

A component marked `BLOCKED` or `REMOVED` MUST not be selected by the resolver for new implementation.

## AC-270-064 — Data-contract drift

Removing/renaming/changing a bound backend field or permission contract MUST stale affected design bindings/evidence.

## AC-270-065 — Rendering mode

An SSR/hydrated/streaming product MUST detect a material hydration/layout mismatch even if the post-hydration screenshot eventually looks correct.

## AC-270-066 — Browser compatibility

A product declaring Safari/mobile Safari support MUST not be certified solely from Chromium evidence when behavior is materially engine-sensitive.

## AC-270-067 — Offline/degraded state

A product claiming offline or intermittent-network support MUST verify at least the declared cached/no-cache/reconnect states relevant to its contract.

## AC-270-068 — Fixture freshness

A material fixture update MUST invalidate/reclassify dependent design evidence rather than silently reusing old verification.

## AC-270-069 — Copy governance

Provider-generated legal/consent/security copy MUST not replace an authoritative approved version without the required review/authority.

## AC-270-070 — Data visualization accessibility

A material chart/graph/map that conveys information only through color/hover without an approved semantic alternative MUST fail accessibility/design verification.

## AC-270-071 — External navigation safety

Provider-generated unsafe/open-redirect/credential-bearing external navigation MUST not reach production.

## AC-270-072 — Portable design export/import

A canonical design export/import round trip MUST preserve supported provider-neutral intent/lineage while omitting secrets and clearly reporting non-exportable assets.

## AC-270-073 — Provenance redaction

A support/public provenance view MUST not reveal raw private prompts/source/provider-account identifiers beyond the viewer's authority.

## AC-270-074 — Archival readability

A retained selected/implemented design artifact MUST remain decodable or enter an explicit supported migration-required state without Stitch/provider availability.

## AC-270-075 — Post-release feedback authority

UX feedback or experiment results MUST create a new change/promotion candidate rather than directly altering the active production design/source.

---

# 34. Required test matrix

| Scenario | Native | Stitch | Expected |
|---|---:|---:|---|
| User has no external provider | ✓ | — | complete |
| Stitch connected | ✓ | ✓ | provider may accelerate |
| Stitch auth expired | ✓ | error | native fallback if allowed |
| Stitch rate limited | ✓ | rate-limited | wait/fallback |
| User requires Stitch | ✓ | unavailable | typed blocker |
| L0 UI edit | ✓ | connected | do not call Stitch by default |
| L4 Mini App | ✓ | connected | allow design exploration |
| Provider output includes custom button | ✓ | ✓ | resolve to existing component |
| Provider URL expires | ✓ | ✓ | app unaffected |
| User disconnects after deploy | ✓ | — | app unaffected |
| Mobile-only user | ✓ | optional | full creation possible |
| Tablet-only user | ✓ | optional | full creation possible |
| Provider invents unsupported action | ✓ | ✓ | bind/work-item/defer/reject; never fake functionality |
| Concurrent design edits | ✓ | ✓ | conflict/branch; no silent overwrite |
| Approved design materially edited | ✓ | ✓ | approval revalidation |
| Unknown-rights generated asset | ✓ | ✓ | block public/commercial packaging |
| Thai long-text fixture | ✓ | ✓ | no critical unresolved overflow |
| RTL-declared product | ✓ | ✓ | mirrored/navigation/reading-order evidence |
| Cross-tenant cache attempt | ✓ | ✓ | isolation enforced |
| Prompt injection embedded in HTML | ✓ | ✓ | treated as untrusted data |
| Provider healthy but capability suspended | ✓ | ✓ | provider not selected |
| Visual regression baseline replaced without authority | ✓ | optional | fail closed |
| Cancel during provider call | ✓ | ✓ | reconcile; no partial selection |
| Stitch/other SDK breaking contract change | ✓ | affected | suspend adapter capability until contract tests pass |
| Browser/font/theme visual environment changes | ✓ | optional | stale/reverify affected evidence |
| Dark-mode declared | ✓ | optional | required dark-mode evidence |
| Large dataset / long content | ✓ | optional | layout remains usable or explicit design limitation |
| Deep link + refresh | ✓ | optional | declared state recovery behavior preserved |
| Old canonical artifact after schema upgrade | ✓ | optional | migrate or explicit unsupported state |
| Manual UI source edit after approval | ✓ | optional | design alignment/evidence becomes stale as appropriate |
| User requests provider deletion | ✓ | ✓ | provider-side status truthful; no false confirmation |
| Project forbids unknown data residency | ✓ | ✓ | external provider blocked if profile insufficient |
| Reduced-motion enabled | ✓ | optional | safe alternative behavior |
| External HTML preview attempts credential access | ✓ | ✓ | denied by sandbox |
| Fallback provider after partial candidate | ✓ | ✓ | separate provenance branch until explicit merge/select |
| Viewer role opens admin-designed screen | ✓ | optional | unauthorized controls/data not exposed |
| Same prompt in two private tenants | ✓ | optional | no cross-tenant private cache hit/data leak |
| LOCAL_ONLY project with Stitch connected | ✓ | connected | Stitch not called |
| Product ownership transfer | ✓ | optional | canonical lineage transfers only as authorized; external bindings reauthorized |
| Marketplace/template install | ✓ | optional | clean independent materialization |
| Restore DB while required R2 asset missing | ✓ | optional | restore closure fails |
| GC sees asset referenced by released app | ✓ | optional | asset retained |
| Streaming/generated text becomes very long | ✓ | optional | supported overflow/expand/scroll behavior |
| Mobile virtual keyboard covers primary action | ✓ | optional | failure until reachable/fixed |
| Astryx/theme dependency upgrade | ✓ | optional | impact detect + reverify/rollback |
| Provider HTML includes analytics beacon | ✓ | ✓ | blocked or explicit privacy-capability admission |
| Provider renders fake secret/login prompt | ✓ | ✓ | trusted-pattern review/rework |
| Variants differ in paid integration/privacy | ✓ | ✓ | no unauthorized auto-selection |
| Provider code adds new npm/CDN dependency | ✓ | ✓ | Spec 224 admission gate required |
| Tiny visual diff changes permission/data exposure | ✓ | optional | semantic diff marks material/high-risk |
| Component marked REMOVED | ✓ | optional | resolver refuses new selection |
| Backend enum/field contract changes | ✓ | optional | affected bindings/evidence stale |
| SSR hydration mismatch hidden after settle | ✓ | optional | rendering-mode verification catches mismatch |
| Safari input/layout differs from Chromium | ✓ | optional | declared browser profile must pass |
| Offline-capable Mini App loses network | ✓ | optional | declared offline/reconnect behavior verified |
| Test fixture cardinality changes | ✓ | optional | evidence freshness invalidated as appropriate |
| Provider shortens consent/legal copy | ✓ | ✓ | authority/content-governance review required |
| Chart uses color-only distinction | ✓ | optional | accessibility failure until semantic alternative |
| Generated link points to untrusted open redirect | ✓ | ✓ | blocked by navigation policy |
| Export/import canonical design bundle | ✓ | optional | provider-neutral intent preserved; secrets omitted |
| Support provenance export | ✓ | optional | redaction according to viewer authority |
| Archived design opened years later without provider | ✓ | — | decode/migrate from canonical data |
| Experiment result recommends variant B | ✓ | optional | new promotion candidate; no direct production mutation |

---

# 35. Security review checklist

Implementation MUST verify:

- token storage uses the existing secret-management path;
- no credential is returned to frontend after storage except masked status;
- provider call logs are secret-safe;
- HTML ingestion is sanitized;
- remote assets are validated/materialized;
- source-upload policy is enforced;
- tenant isolation is enforced;
- credential scopes are revocable;
- provider connection deletion invalidates new calls;
- active jobs revalidate credential authority where required;
- provider callbacks, if later added, are authenticated and idempotent;
- imported instructions are treated as untrusted data and cannot alter tool/system authority;
- active HTML/scripts never execute in a privileged origin before sanitization/sandboxing;
- tenant-specific caches/prompts/artifacts use tenant/project partitioning;
- asset rights/provenance are checked before public/commercial packaging;
- provider data-handling policy is compatible with project data classification;
- preview sandboxes have no ambient credentials and restricted navigation/network/device authority;
- external resources used for evidence are captured/pinned or marked non-reproducible;
- disconnect/delete operations do not overclaim provider-side data deletion;
- role/permission fixtures cannot bypass canonical authorization;
- cache authorization is rechecked on hit and cache scopes cannot widen private design context;
- LOCAL_ONLY/NO_EXTERNAL_EGRESS policies fence design providers and design-related model routing;
- ownership transfer/fork does not clone credentials/private provider authority;
- sensitive auth/payment/secret-entry UI uses trusted patterns;
- provider-generated trackers/dependencies cannot bypass privacy/supply-chain gates;
- semantic diff surfaces material permission/data/provider/dependency changes before approval;
- external navigation is validated against routing/open-redirect/destination policy;
- export/import strips secrets and revalidates destination authority;
- provenance views apply viewer-scoped redaction;
- archived artifacts remain provider-independent and explicitly migratable.

---

# 36. Non-goals

R1.4 does not require:

- replacing Figma;
- replacing Astryx;
- migrating SmartAIHub hosting to Google;
- requiring Google AI Pro;
- guaranteeing any Google subscription quota;
- using Google Cloud for application runtime;
- making Stitch a production renderer;
- automatically redesigning every existing page;
- allowing AI design output to override security/product contracts;
- building a full standalone vector-graphics editor;
- making Spec 270 a Core Web Vitals/performance-tool authority;
- making Spec 270 a data-retention/legal authority;
- redefining Spec 224 evidence freshness/nondeterminism semantics;
- redefining Spec 261 package/release semantics;
- creating a second ownership-transfer authority outside the workspace/product authority;
- creating a second backup/DR system;
- creating a second analytics/privacy-consent authority;
- creating a second dependency/package-manager authority;
- creating a second backend/API schema authority;
- creating a second browser-test infrastructure authority;
- creating a second PWA/offline runtime authority;
- creating a second content/legal approval authority;
- creating a second experimentation/analytics platform.

---

# 37. Reference implementation guidance

## Google Stitch

Use Stitch as a specialized provider through its documented SDK/MCP/skills surface when authorized.

Implementation SHOULD assume the provider can evolve.

Current public references:

- Google Stitch: https://stitch.withgoogle.com/
- Google Stitch announcement/update:
  https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
- Google Stitch real-time design update:
  https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-updates/
- Stitch SDK:
  https://github.com/google-labs-code/stitch-sdk
- Stitch Skills:
  https://github.com/google-labs-code/stitch-skills

## Astryx

AstryX is the production-oriented design-system/component foundation, not the external design generator.

Reference:

- https://github.com/facebook/astryx

The implementation SHALL pin compatible dependency versions according to the SmartAIHub dependency-management policy rather than assuming latest is safe.

---

# 38. Cumulative sixty-pass gap review through R1.4

R1.4 retains all prior hardening and adds a fourth independent fifteen-pass review focused on long-term maintainability, runtime rendering semantics, portability and post-release design evolution.

## 38.1 Prior forty-five passes

The first three audits remain normative. They covered provider independence, capability truthfulness, artifact immutability/concurrency, approval freshness, provider drift/idempotency, rights/localization/accessibility, tenant/prompt-injection/rollout safety, visual evidence integration, themes/performance/data realism/navigation/schema migration, source/design drift, provider data lifecycle, motion/sandbox/SPAAS/roles/fallback, request provenance, cache/local-only, ownership/fork, backup/GC, dynamic AI content, device modality, design-system upgrades, analytics/privacy, trusted sensitive patterns, variant authority and supply-chain admission.

## 38.2 Fourth independent fifteen passes

| Pass | Review lens | New gap found in R1.3 | R1.4 resolution |
|---:|---|---|---|
| 46 | Approval ergonomics / semantic diff | Pixel/visual evidence did not summarize semantic behavior/authority changes | Added `DesignSemanticDiff` and materiality/approval impact |
| 47 | Design decision maintainability | Selection recorded but rationale/supersession lineage was incomplete | Added durable design-decision rationale and supersession record |
| 48 | Component lifecycle | Resolver lacked explicit deprecation/replacement states | Added ACTIVE/EXPERIMENTAL/DEPRECATED/BLOCKED/REMOVED lifecycle |
| 49 | Backend/data evolution | UI binding freshness did not explicitly follow API/schema contract drift | Added backend/data-contract impact invalidation |
| 50 | Rendering architecture | Static screenshots did not verify SSR/streaming/hydration semantics | Added RenderingModeProfile and hydration/streaming evidence |
| 51 | Browser compatibility | Device matrix did not declare engine compatibility | Added browser/engine support profile and targeted verification |
| 52 | Offline/degraded network | Network-state UX was not normative for apps claiming offline/PWA resilience | Added offline/cache/stale/reconnect state contract |
| 53 | Fixture governance | Test data existed but fixture-version drift was not a first-class evidence input | Added fixture identity/freshness invalidation |
| 54 | Generated copy governance | Provider copy could bypass terminology/legal/brand authority | Added semantic copy roles and content-governance resolution |
| 55 | Data visualization accessibility | Generic accessibility rules did not fully cover chart/map semantic alternatives | Added visualization semantics/keyboard/color-independent alternatives |
| 56 | External navigation security | Generated links/redirects/new-window behavior lacked explicit trust contract | Added destination classification/open-redirect/tab safety |
| 57 | Design portability | Canonical artifact lacked a provider-neutral export/import bundle | Added versioned portable design interchange bundle |
| 58 | Provenance privacy | Full provenance could expose raw prompts/private source to support/public viewers | Added authorization-scoped provenance redaction |
| 59 | Long-term archival | Retained artifacts could depend on current reader/provider semantics | Added archival readability/future decode requirements |
| 60 | Post-release evolution | UX feedback/experiments lacked design-lineage promotion semantics | Added feedback/experiment records; no direct production mutation |

## 38.3 Current result

The fourth review still finds no reason to make Google Stitch mandatory.

R1.4 strengthens the boundary between:

```text
DESIGN INTENT / DESIGN EVIDENCE
          ↓
IMPLEMENTED SOURCE / RUNTIME TRUTH
          ↓
RELEASE / DEPLOYMENT AUTHORITY
          ↓
POST-RELEASE FEEDBACK
          ↓
NEW DESIGN CANDIDATE
```

Feedback and external design intelligence can improve the product, but they never bypass normal implementation, verification, approval or release authority.

R1.4 remains implementation-ready only after G0 reconciliation with the live repository and canonical spec registry.

---

# 39. Final implementation contract

A conforming implementation MUST satisfy this architecture:

```text
                               ┌─────────────────────────┐
                               │ Google Stitch           │
                               │ optional specialist     │
                               └────────────┬────────────┘
                                            │
┌─────────────────────────┐                 │
│ SmartAIHub Native Design│─────────────────┤
│ always available path   │                 │
└────────────┬────────────┘                 │
             │                              │
             └──────────────┬───────────────┘
                            ▼
                 Canonical Design Artifact
                 + UI Action Bindings
                 + Rights/Locale Evidence
                            │
                            ▼
                  SmartAIHub UI Policy
                            +
                  Product Component Catalog
                            +
                         Astryx
                            │
                            ▼
                         Spec 224
            Plan / Implement / Test / Visual QA
                            │
                            ▼
               Source + Portable Application
                            │
                            ▼
                         Runtime
                            │
                 NO STITCH DEPENDENCY
```

The same design subsystem SHALL support both:

```text
Mini App development
```

and

```text
SmartAIHub core UI development
```

without imposing an external-provider requirement on users who do not have Stitch.

---

# 40. Definition of Done

Spec 270 R1.4 is considered implemented only when all of the following are true:

- [ ] Native Design path completes without external providers.
- [ ] Stitch adapter exists behind provider-neutral contracts.
- [ ] User-owned provider credentials are isolated.
- [ ] Capability discovery/failure translation is implemented.
- [ ] Canonical design artifacts are durable.
- [ ] DESIGN.md/design-system information is normalized rather than blindly trusted.
- [ ] Astryx/product-component reuse policy is enforced.
- [ ] Significant Mini Apps use design checkpoints.
- [ ] Spec 224 consumes design artifacts without losing orchestration authority.
- [ ] Spec 256 resolves canonical design capabilities.
- [ ] Visual QA includes responsive and accessibility evidence.
- [ ] Provider ephemeral assets are materialized when needed.
- [ ] Deployed apps contain no required Stitch runtime dependency.
- [ ] Provider disconnect/removal tests pass.
- [ ] L0 tasks avoid unnecessary external design calls.
- [ ] SmartAIHub core-product development can use the same design pipeline.
- [ ] Audit/provenance identifies provider and artifact lineage.
- [ ] Rate-limit/auth/provider failure paths are tested.
- [ ] Security review passes.
- [ ] Mobile/tablet/desktop acceptance matrix passes.
- [ ] Documentation clearly labels Stitch as optional.
- [ ] G0 spec/repository/schema reconciliation is complete.
- [ ] Spec-number collision check passes or this proposal has been safely renumbered.
- [ ] Feature flags and provider kill switch are implemented with default-off rollout.
- [ ] Selected/implemented design artifacts are immutable, digested and concurrency-safe.
- [ ] UI actions are bound to real capabilities/backend/data/permission contracts or explicitly classified otherwise.
- [ ] Material design changes revalidate stale approvals when approval is required.
- [ ] Provider operations are idempotent/cancellable/reconcilable through existing durable jobs.
- [ ] Provider capability certification is versioned and drift-tested.
- [ ] Asset rights/provenance gate passes for public/commercial packages.
- [ ] Thai/English localization fixtures pass; RTL passes when declared.
- [ ] Structured accessibility evidence is produced for material UI.
- [ ] Tenant/white-label design isolation tests pass.
- [ ] Imported design prompt-injection/sandbox tests pass.
- [ ] Visual baseline changes require authorized evidence.
- [ ] External paid/quota usage obeys existing budget/consent policy.
- [ ] Core-product provider-assisted redesign is isolated behind its own rollout flag.
- [ ] Provider adapter contract tests pass against the pinned/certified SDK/API/tool contract.
- [ ] Visual evidence binds to Spec 224 environment/freshness/nondeterminism semantics.
- [ ] Required theme/mode matrix passes.
- [ ] Applicable frontend performance profile passes or has explicit accepted limitation.
- [ ] Representative data-density/edge-case fixtures pass.
- [ ] Navigation/deep-link/back/refresh/unsaved-work semantics are verified where applicable.
- [ ] Canonical design schema migration/compatibility tests pass.
- [ ] Source↔design drift can stale affected mappings/evidence.
- [ ] Provider retention/unlink/delete lifecycle is truthful and tested.
- [ ] External provider data-handling profile gates sensitive transmission.
- [ ] Motion/reduced-motion verification passes where applicable.
- [ ] Provider HTML/reference preview runs only in an approved sandbox.
- [ ] SPAAS handoff preserves Spec 261 authority.
- [ ] Representative role/permission visual states pass.
- [ ] Cross-provider fallback preserves branch/provenance before merge/selection.
- [ ] Material provider calls emit secret-safe DesignPromptEnvelope provenance.
- [ ] Provider replay/reproducibility claims are truthful for nondeterministic generation.
- [ ] Design caches pass tenant/project/private-scope and authorization-on-hit tests.
- [ ] LOCAL_ONLY/NO_EXTERNAL_EGRESS design routing tests pass.
- [ ] Ownership transfer re-authorizes external design-provider/account bindings.
- [ ] Fork/template/Marketplace materialization strips/rebinds private authority and non-transferable assets.
- [ ] Backup/restore closure verifies required SmartAIHub-owned design assets and digests.
- [ ] Design asset garbage collection is reference-aware.
- [ ] Dynamic generated-content stress profiles pass where applicable.
- [ ] Required orientation/input-modality/safe-area/virtual-keyboard tests pass.
- [ ] Design-system/component/theme upgrades support impact detection, reverify and rollback/hold.
- [ ] Provider-generated analytics/trackers pass canonical privacy/consent admission or are removed.
- [ ] Sensitive auth/payment/secret-entry interactions use trusted patterns.
- [ ] Automatic variant selection obeys interaction/autonomy authority.
- [ ] Provider-generated dependencies/remote resources pass Spec 224 supply-chain/license/security gates.
- [ ] Semantic design diff identifies material navigation/action/permission/data/provider/dependency changes.
- [ ] Selected design decisions preserve rationale/tradeoffs/supersession lineage.
- [ ] Component lifecycle/deprecation/replacement policy is enforced by the resolver.
- [ ] Backend/API/data-contract drift invalidates affected bindings/evidence.
- [ ] Applicable SSR/streaming/hydration rendering-mode verification passes.
- [ ] Declared browser/engine compatibility profile passes for material engine-sensitive behavior.
- [ ] Offline/PWA/degraded-network states pass where claimed.
- [ ] Fixture identity/version participates in evidence freshness.
- [ ] Generated copy resolves through terminology/localization/legal/brand/content authority.
- [ ] Material data visualizations provide approved semantic/accessibility alternatives.
- [ ] External links/redirects/new-window behavior pass destination/navigation security policy.
- [ ] Provider-neutral canonical design export/import bundle round-trip passes for supported content.
- [ ] Provenance views/exports enforce viewer-scoped redaction.
- [ ] Archived selected/implemented design artifacts remain decodable or explicitly migratable without provider access.
- [ ] Post-release feedback/experiments create new design candidates and never silently mutate active production.

---

## End of Spec 270 R1.4
