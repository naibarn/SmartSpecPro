# Spec 217 — SmartAIHub AI Product & White-Label Tenant Platform
## Branded AI Products, Product Suites, Mini App Composition, Membership, Entitlements, Domains & Distribution

**Status:** Architecture Freeze Candidate / Implementation-ready subject to conformance tests
**Spec ID:** 217  
**Revision:** 3 — Final integrated stress-audit / architecture freeze candidate
**Date:** 2026-09-20  
**Target repository path:** `specs/feature/217-ai-product-white-label-tenant-platform/spec.md`  
**Core depends on:** Spec 207, Spec 214, Spec 215, Spec 216, Feature 195 and existing SmartAIHub Identity/Tenant/Library services  
**Validation dependency:** Spec 212 R20 is the release oracle for this spec; its certification is a downstream gate, not a bootstrap prerequisite.  
**Companion specs:** Spec 218, Spec 219, Spec 220, Spec 221, Spec 222

---

# 0. Executive Decision

SmartAIHub SHALL evolve from a single-brand AI application platform into a **multi-brand AI Product Platform** where a creator, domain expert, partner or organization can create a branded AI product without building a parallel SaaS stack outside SmartAIHub.

A Tenant MAY begin with a platform subdomain such as:

```text
interiorpro.smartaihub.app
```

and later bind one or more customer-owned domains such as:

```text
interiorpro.com
app.interiorpro.com
```

without changing the Tenant identity, Product identity, Mini App identities, data namespaces or historical billing/audit records.

The product MUST reuse existing SmartAIHub core services for identity, tenants, workflow execution, billing, credits, Library, AI capabilities and audit. It MUST NOT create a second user system, second workflow runtime, second billing ledger, second asset store or second authentication authority.

Canonical hierarchy:

```text
SmartAIHub Platform
  └─ Tenant
      ├─ BrandDefinition
      ├─ Membership / Roles / Entitlements
      ├─ DomainBindings
      └─ Product(s)
          ├─ ProductShell
          ├─ Navigation / Dashboard / Native Modules
          └─ Mini App Modules
              ├─ Native Mini App
              └─ Custom Mini App surface
                  └─ deployed runtime owned by Spec 219
```

---

# 1. Product Thesis

SmartAIHub SHALL support the business model:

> **From workflow to Mini App. From Mini App to a branded AI product. From a branded AI product to an independent AI business powered by SmartAIHub.**

A domain expert SHOULD be able to create and market a specialized product while SmartAIHub provides the platform infrastructure behind it.

Examples:

- interior design and renovation;
- construction cost estimation / BOQ;
- vertical drama production;
- real-estate sales and marketing;
- PR / social-media operations for merchants;
- enterprise employee AI portals;
- industry-specific research/knowledge assistants;
- media production studios;
- finance/document/operations assistants.

The end customer MAY never visit `smartaihub.app`; platform value is still created through product usage, billing, infrastructure consumption and revenue allocation.

---

# 2. Scope Ownership

| Concern | Owner |
|---|---|
| Tenant, brand, product, Product Shell, module composition | **Spec 217** |
| AI-generated development, Runner orchestration, Git/source workflow | **Spec 218** |
| Cloud runtime, deployment, Workers for Platforms, custom-domain runtime mapping | **Spec 219** |
| Tenant Data API, Asset API, Vector/RAG gateway, capability bridge, secrets/data isolation | **Spec 220** |
| Flow → Mini App interaction projection / existing Workflow Studio upgrade | Spec 216 |
| Workflow semantics/compiler/runtime | Spec 214 / 215 |
| Durable physical jobs | Feature 195 / canonical worker job control plane |
| Economic authorization / credits / revenue allocation | Spec 207 |
| Marketplace/certification/use cases | Spec 212 |
| MCP protocol exposure | Spec 199 or current canonical MCP Gateway spec |
| External agent harnesses / A2A / Computer Use | Existing canonical companion specs |

Spec 217 SHALL NOT own deployment credentials, repository write mechanics, SQL storage implementation, R2 credentials or AI provider keys.

---

# 3. Terminology

## 3.1 Tenant

A Tenant is a stable organizational/commercial/security boundary. It is not merely a database partition.

A Tenant owns or references:

- brand identity;
- products;
- members and roles;
- product entitlements;
- billing/economic policies;
- domains;
- data namespace references;
- publication settings;
- enterprise governance policies.

## 3.2 Mini App

A Mini App is a functional product module. It MAY have one page, multiple pages, one workflow or multiple workflows.

A Mini App is NOT required to be a simple generated form.

## 3.3 AI Product

An AI Product is a customer-facing commercial or organizational application assembled from one or more Mini Apps, native modules, shared navigation, brand, membership, plans and policy.

## 3.4 Product Shell

The Product Shell is the branded parent experience providing navigation, dashboard, account, plan/usage surfaces, notifications, help and module routing.

## 3.5 Native Mini App

A Mini App rendered using SmartAIHub declarative components and the Mini App renderer.

## 3.6 Custom Mini App

A Mini App whose advanced product surface is implemented as separately built/deployed code while still using SmartAIHub identity, data and capabilities only through governed contracts.

## 3.7 Product Module

A Product Module is any user-visible functional unit mounted in the Product Shell. It may be:

- Native Mini App;
- Custom Mini App;
- SmartAIHub native module (Library, History, Billing, Profile, Help, etc.);
- approved external route when explicitly allowed.

---

# 4. Product Hierarchy

Canonical hierarchy:

```text
Tenant
  ├─ BrandDefinition
  ├─ TenantMembership[]
  ├─ DomainBinding[]
  ├─ TenantPlan / EconomicPolicyRef
  └─ Product[]
      ├─ ProductDefinition
      ├─ ProductShellDefinition
      ├─ ProductMembership / ProductEntitlement
      ├─ ProductRoute[]
      ├─ ProductModule[]
      │   ├─ MiniAppRef
      │   └─ NativeModuleRef
      └─ ReleaseChannel
```

The hierarchy MUST support one Tenant with multiple Products and one Product with multiple Mini Apps.

---

# 5. Tenant Creation UX

Default user path:

```text
SmartAIHub
→ My Products / Tenants
→ Create Tenant
→ Name + slug
→ Choose initial product purpose
→ AI proposes brand/product structure
→ Provision tenant
→ Assign default subdomain
→ Create first Product draft
```

Example:

```text
Tenant name: Interior Pro
Slug: interiorpro
Default hostname: interiorpro.smartaihub.app
```

Slug availability MUST be checked before allocation. Tenant IDs MUST be immutable opaque identifiers and MUST NOT be derived from the slug.

Renaming a Tenant or brand MUST NOT rename physical data namespaces automatically.

---

# 6. Subdomain First, Custom Domain Later

Every eligible Tenant/Product SHALL receive a platform-managed hostname by default.

Canonical form:

```text
{tenant-slug}.smartaihub.app
```

Where one Tenant has multiple Products, platform policy MAY support:

```text
{product-slug}.{tenant-slug}.smartaihub.app
```

or route products by path:

```text
{tenant-slug}.smartaihub.app/{product-slug}
```

The exact routing strategy is configurable, but stable canonical URLs MUST be retained.

Custom-domain lifecycle:

```text
PLATFORM_SUBDOMAIN
→ CUSTOM_DOMAIN_REQUESTED
→ DNS_VERIFICATION_PENDING
→ CERTIFICATE_PENDING
→ ACTIVE
→ optional redirect/canonical switch
```

Domain implementation and Cloudflare routing are owned by Spec 219.

---

# 7. BrandDefinition

```ts
interface BrandDefinition {
  brandId: string;
  tenantId: string;
  name: string;
  legalName?: string;
  tagline?: string;

  logoAssetRef?: string;
  markAssetRef?: string;
  faviconAssetRef?: string;
  socialPreviewAssetRef?: string;

  design: {
    colorTokens: Record<string, string>;
    typographyTokens: Record<string, string>;
    spacingProfile?: string;
    radiusProfile?: string;
    iconProfile?: string;
    imageryStyle?: string;
    motionProfile?: string;
  };

  voice: {
    localeDefault: string;
    supportedLocales: string[];
    tone?: string[];
    copyGuidelines?: string;
  };

  legal?: {
    termsUrl?: string;
    privacyUrl?: string;
    supportUrl?: string;
  };

  version: string;
}
```

Brand changes SHALL be versioned. Published releases SHOULD pin or snapshot the brand version required for reproducible screenshots and compliance.

---

# 8. AI Brand Designer

Tenant Admin MAY create a brand through natural language.

Example:

> "สร้างแบรนด์ผู้ช่วยออกแบบตกแต่งบ้านระดับ premium ดูน่าเชื่อถือ อบอุ่น ไม่เหมือนเครื่องมือ developer"

AI Brand Designer MAY propose:

- brand name options;
- tagline;
- logo direction;
- palette;
- typography;
- icon/imagery direction;
- content tone;
- sample landing/dashboard screens;
- social/OpenGraph style.

AI-generated brand artifacts SHALL remain drafts until accepted.

AI MUST NOT claim trademark availability or legal clearance unless a separate verified service is used.

---

# 9. ProductDefinition

```ts
interface ProductDefinition {
  productId: string;
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  status: "DRAFT" | "PREVIEW" | "ACTIVE" | "SUSPENDED" | "RETIRED";

  brandRef: string;
  shellRef: string;
  moduleRefs: string[];
  routeRefs: string[];

  defaultLocale: string;
  supportedLocales: string[];

  releaseChannel: "draft" | "staging" | "production";
  economicPolicyRef?: string;
  entitlementPolicyRef?: string;
}
```

Product identity SHALL remain stable across deployments and domain changes.

---

# 10. Product Shell

Product Shell MUST support:

- branded header/logo;
- sidebar/top navigation;
- homepage/dashboard;
- app/module launcher;
- user profile;
- notifications;
- usage/credits/plan visibility according to policy;
- history/recent work;
- Library integration where enabled;
- Help/Assistant integration where enabled;
- responsive desktop/tablet/mobile presentation;
- localization;
- tenant/product-specific support links.

The Product Shell MUST NOT hard-code modules. It SHALL render from `ProductShellDefinition` + entitlements.

---

# 11. ProductShellDefinition

```ts
interface ProductShellDefinition {
  shellId: string;
  productId: string;
  version: string;

  navigation: {
    mode: "sidebar" | "topbar" | "hybrid";
    items: NavigationItem[];
  };

  dashboard: DashboardDefinition;

  nativeModules: Array<
    "profile" | "billing" | "usage" | "library" | "history" |
    "notifications" | "help" | "assistant" | "admin"
  >;

  layoutTokens: Record<string, unknown>;
  responsivePolicy: string;
}
```

Navigation items SHALL support entitlement and role predicates.

---

# 12. Mini App Complexity Model

Mini Apps SHALL support at least three implementation classes:

```text
NATIVE_DECLARATIVE
CUSTOM_UI
HYBRID
```

### NATIVE_DECLARATIVE
Rendered entirely by SmartAIHub UI schema/components.

### CUSTOM_UI
Product surface implemented by tenant/product source code and deployed through Spec 218/219.

### HYBRID
Uses SmartAIHub native page/layout plus one or more custom advanced interactive surfaces.

Examples of CUSTOM/HYBRID use cases:

- 3D room designer;
- WebGL/WebGPU scene editor;
- interactive GIS;
- video timeline editor;
- CAD/BIM viewer;
- spreadsheet-like editor;
- diagram/graph editor;
- waveform/audio editor;
- simulation/control console.

---

# 13. Multi-Page / Multi-Workflow Mini Apps

A Mini App MAY contain:

- multiple routes/pages;
- multiple workflows;
- persistent project state;
- dialogs/drawers;
- saved drafts;
- history;
- asset collections;
- approval/review stages;
- reusable product-specific components.

Mini App complexity SHALL NOT be constrained to one form page.

A Mini App SHOULD be promoted to a Product Module suite when it contains multiple independent customer journeys, subscription boundaries or navigation domains that are better managed separately.

---

# 14. Product Composition

Tenant Admin SHALL be able to enable/disable/reorder modules without editing source code when the module contract allows it.

Example:

```text
Interior Pro
  ✓ Dashboard
  ✓ AI Room Advisor
  ✓ 3D Room Designer
  ✓ Cost Estimator
  ✓ Proposal Generator
  ✗ Video Creator
  ✗ Public Marketplace
```

Module configuration MUST be versioned.

---

# 15. AI Product Builder

The main Tenant Admin creation interface SHOULD be natural language.

Example:

> "สร้างระบบสำหรับที่ปรึกษารีโนเวทบ้าน มีวิเคราะห์ภาพห้อง ออกแบบสไตล์ คำนวณต้นทุน ทำ proposal และมี 3D viewer"

AI Product Builder SHALL produce a structured proposal containing:

- target users/personas;
- product architecture;
- product shell;
- required Mini Apps;
- which Mini Apps are native/custom/hybrid;
- required workflows/capabilities;
- data collections;
- asset types;
- roles/permissions;
- plan/entitlement outline;
- domain plan;
- development work items for Spec 218;
- estimated infra/cost implications;
- security/side-effect summary.

The user SHALL approve the proposal before high-impact provisioning or code generation.

---

# 16. Tenant Membership

Existing SmartAIHub user identity SHALL be reused.

```ts
interface TenantMembership {
  tenantId: string;
  principalId: string;
  status: "INVITED" | "ACTIVE" | "SUSPENDED" | "REMOVED";
  roleRefs: string[];
  joinedAt?: string;
}
```

No product SHALL create a parallel password database by default.

---

# 17. Product Membership and Entitlements

```ts
interface ProductEntitlement {
  tenantId: string;
  productId: string;
  principalId: string;
  planRef?: string;
  roleRefs: string[];
  enabledModuleIds: string[];
  deniedModuleIds?: string[];
  capabilityGrants?: string[];
  limits?: Record<string, number>;
  validFrom?: string;
  validUntil?: string;
}
```

Visibility and action authorization are separate concerns:

```text
hidden in UI != unauthorized
visible in UI != authorized
```

Every privileged action MUST re-authorize server-side.

---

# 18. Enterprise Tenant Mode

Enterprise tenants MUST be able to:

- apply organization branding;
- use corporate domain/subdomain;
- enable/disable modules by employee group;
- define roles/departments;
- restrict external agents/models/providers;
- enforce budget/usage quotas;
- require approvals;
- restrict public sharing;
- configure data residency/policy where supported;
- expose organization-specific Mini Apps;
- provide internal Help/knowledge sources;
- review audit and usage analytics.

The same underlying tenant/product model SHALL serve both white-label commercial products and private enterprise portals.

---

# 19. Commercial White-Label Mode

A commercial Tenant MAY:

- market under its own brand;
- use its own custom domain;
- acquire its own end customers;
- define plans/pricing within platform policy;
- include native/custom Mini Apps;
- access aggregate product analytics;
- receive revenue allocations according to Spec 207;
- hide SmartAIHub branding where plan/policy allows.

White-labeling MUST NOT imply bypassing SmartAIHub safety, audit, billing or platform terms.

---

# 20. Plan and Module Mapping

Products SHOULD support product-specific plans:

```text
Free
Starter
Professional
Business
Enterprise
```

Each plan maps to:

- modules;
- capabilities;
- quotas;
- storage;
- runtime allowance;
- AI usage allowance;
- seats;
- branding/custom-domain availability;
- support tier.

Authoritative charging and revenue allocation remain Spec 207.

---

# 21. Product-Level Monetization

Spec 217 SHALL support references to multiple economic models:

- subscription;
- usage-based;
- included credits + overage;
- per-run Mini App fee;
- tenant/partner revenue share;
- creator/capability revenue share;
- enterprise contract.

Product definitions SHALL store only policy references and presentation metadata, never authoritative balances.

---

# 22. Marketplace Relationship

A Mini App MAY be:

- private to Tenant;
- available to a Product only;
- shared across Products owned by the same Tenant;
- published to SmartAIHub Marketplace;
- imported/adopted into another Product under licensing/entitlement policy.

Marketplace publication SHALL NOT transfer ownership of source code or secrets by default.

---

# 23. Tenant Branding Surfaces

Branding SHOULD consistently apply to:

- login/onboarding;
- Product Shell;
- Mini Apps;
- loading/error/empty states;
- transactional emails where permitted;
- notification templates;
- social preview/OpenGraph;
- public landing/pricing pages;
- reports/documents generated by product workflows where configured.

---

# 24. Domain Administration UX

Tenant Admin UI SHALL expose:

```text
Domains
  interiorpro.smartaihub.app   ACTIVE / platform-managed
  interiorpro.com              VERIFYING
```

Supported actions:

- add domain;
- see DNS verification instructions;
- recheck verification;
- view TLS/certificate status;
- set canonical domain;
- redirect platform subdomain to custom domain;
- remove domain;
- see routing/release target;
- emergency detach.

Implementation is delegated to Spec 219.

---

# 25. AI Product Designer / Visual Quality

Spec 217 SHALL require a product-level design system beyond basic schema-to-form rendering.

AI Product Designer MAY generate:

- product information architecture;
- dashboard layout;
- module navigation;
- responsive design;
- design tokens;
- product copy;
- onboarding;
- empty/loading/error states;
- up to multiple design directions;
- brand-aware Mini App layouts.

Generated UI SHALL resolve to governed declarative definitions or source work items for Spec 218; it MUST NOT silently run arbitrary generated code in SmartAIHub Core.

---

# 26. Visual Review Loop

For public/commercial products, SmartAIHub SHOULD support:

```text
Generate design
→ render desktop/tablet/mobile
→ multimodal visual review
→ quality score/critique
→ patch
→ repeat within policy limit
```

Quality dimensions:

- visual hierarchy;
- brand consistency;
- readability;
- task clarity;
- responsive behavior;
- accessibility;
- error/loading states;
- result usability.

---

# 27. Product Project State

Complex products MAY need domain project state separate from WorkflowRun state.

Examples:

- room design project;
- video editing project;
- property campaign project;
- construction estimate project.

Product project state MUST be accessed through Spec 220 Data Gateway and MUST NOT be stored only inside transient Worker memory or workflow execution records.

---

# 28. Public vs Private Product

Supported product exposure states:

```text
DRAFT
PRIVATE
TENANT_INTERNAL
INVITE_ONLY
PUBLIC
SUSPENDED
RETIRED
```

Public exposure does not automatically make workflows/source code public.

---

# 29. Versioning

Version independently:

- BrandDefinition;
- ProductDefinition;
- ProductShellDefinition;
- Mini App versions;
- module composition;
- entitlement policies;
- runtime releases.

A production Product Release MUST reference immutable versions/snapshots sufficient to reproduce behavior and audit a historical request.

---

# 30. Product Release Snapshot

```ts
interface ProductReleaseSnapshot {
  releaseId: string;
  tenantId: string;
  productId: string;
  productDefinitionVersion: string;
  brandVersion: string;
  shellVersion: string;
  moduleVersions: Record<string, string>;
  runtimeReleaseRefs: string[];
  entitlementPolicyVersion?: string;
  economicPolicyVersion?: string;
  createdAt: string;
  promotedAt?: string;
}
```

Deployment mechanics belong to Spec 219.

---

# 31. Product Analytics

Tenant Admin SHOULD see privacy-safe metrics:

- active end users;
- new registrations/invites;
- active products/modules;
- Mini App runs;
- conversion from landing/onboarding to usage;
- success/failure rates;
- usage by module;
- revenue/earnings references;
- infra/resource usage references;
- retention/cohort summaries where policy allows.

Raw sensitive user input SHALL NOT be exposed solely because Tenant Admin owns the Product.

---

# 32. Product Offboarding and Portability

Tenant/Product lifecycle MUST support:

```text
ACTIVE
→ SUSPENDED
→ EXPORT_REQUESTED
→ RETIRED
→ RETENTION
→ PURGE_ELIGIBLE
```

Offboarding policy MUST define:

- domain detachment;
- source export rights;
- data export rights;
- asset export;
- audit retention;
- settlement finality;
- repository archival;
- runtime teardown;
- legal hold overrides.

Spec 218/219/220 own operational execution of these steps.

---

# 33. Core Security Invariants

1. Custom Product code SHALL NOT access SmartAIHub Core database directly.
2. Custom Product code SHALL NOT receive long-lived SmartAIHub admin credentials.
3. Product membership SHALL NOT imply Tenant Admin privileges.
4. UI visibility SHALL NOT replace authorization.
5. Domain ownership verification SHALL be required before custom-domain activation.
6. One Tenant MUST NOT read another Tenant's source/data/assets/secrets.
7. Product custom code SHALL access SmartAIHub capabilities only through Spec 220 governed interfaces.
8. Product release SHALL be immutable/auditable.

---

# 34. Suggested Persistence

Logical tables/entities may include:

```text
tenant_brands
products
product_shell_versions
product_modules
product_routes
product_memberships
product_entitlements
product_release_snapshots
domain_bindings
product_plan_mappings
product_analytics_rollups
```

Exact physical naming follows existing database conventions. New product tables MUST NOT duplicate existing Tenant/User tables.

---

# 35. API Surface

Illustrative APIs:

```text
POST   /tenants
POST   /tenants/{tenantId}/products
POST   /products/{productId}:generate-plan
PATCH  /products/{productId}
POST   /products/{productId}/modules
PATCH  /products/{productId}/shell
POST   /products/{productId}:preview
POST   /products/{productId}:release
POST   /products/{productId}/domains
POST   /products/{productId}/domains/{domainId}:verify
POST   /products/{productId}/members
PATCH  /products/{productId}/entitlements/{principalId}
GET    /products/{productId}/analytics
```

Exact naming MAY follow platform conventions but identity and authorization semantics are mandatory.

---

# 36. Integration with Spec 216

Spec 216 remains owner of Flow → Mini App generation inside Workflow Studio.

Spec 217 SHALL consume Mini Apps as Product Modules.

```text
Workflow
  ↓ Spec 216
Mini App
  ↓ Spec 217
Product Module
  ↓ Product Shell
Branded Product
```

Spec 217 MUST NOT fork workflow execution or Mini App run semantics.

---

# 37. Integration with Spec 218

When AI Product Builder determines that a Product or Mini App requires custom code:

```text
Spec 217 DevelopmentRequirement
→ Spec 218 DevelopmentJob
→ preview/review result
→ Spec 217 Product configuration updated
```

Spec 217 SHALL NOT execute coding harnesses directly.

---

# 38. Integration with Spec 219

Spec 217 owns desired domain/product/release state.

Spec 219 owns:

- runtime allocation;
- deployment;
- preview/staging/production;
- Workers for Platforms;
- custom-domain activation;
- runtime health;
- rollback/kill switch.

---

# 39. Integration with Spec 220

Products and custom Mini Apps SHALL use Spec 220 for:

- Data API;
- Asset API;
- retrieval/vector APIs;
- capability invocation;
- scoped identity context;
- secret references;
- policy enforcement.

No direct SQL/R2/provider credentials SHALL be placed into product source.

---

# 40. Failure Semantics

Product shell MUST present graceful states for:

- module unavailable;
- runtime deployment unhealthy;
- workflow temporarily unavailable;
- insufficient entitlement;
- billing/credit issue;
- custom domain verification failure;
- data/capability permission denial;
- maintenance/suspension.

Errors MUST use stable machine-readable codes plus localized user-friendly messages.

---

# 41. Accessibility and Localization

Public Products SHOULD target WCAG 2.2 AA-equivalent quality where practical.

Product Shell and native Mini Apps MUST support localization-ready strings. AI-generated copy MUST be stored as editable/versioned content, not baked irreversibly into source.

---

# 42. SEO / Public Product Surfaces

Public Products MAY expose:

- landing page;
- metadata/title/description;
- sitemap where applicable;
- OpenGraph/social preview;
- canonical domain;
- robots policy;
- product-specific legal/support pages.

Private/enterprise products SHOULD default to non-indexable.

---

# 43. Acceptance Criteria — Tenant/Product

- [ ] Tenant can be created without manual infrastructure setup.
- [ ] Tenant receives a platform subdomain.
- [ ] Tenant ID remains stable if slug/brand changes.
- [ ] Tenant can own multiple Products.
- [ ] Product can compose multiple Mini Apps/modules.
- [ ] Mini App can be multi-page and multi-workflow.
- [ ] Native, custom and hybrid Mini Apps are represented explicitly.
- [ ] Product Shell is declarative/versioned and entitlement-aware.
- [ ] Existing SmartAIHub identity is reused.
- [ ] Enterprise and commercial white-label modes use the same core model.

---

# 44. Acceptance Criteria — Brand/Domain

- [ ] BrandDefinition covers logo, colors, typography, voice and legal metadata.
- [ ] AI can propose brand/product design but user approves publication.
- [ ] Custom domain can be added after initial subdomain launch.
- [ ] Domain change does not alter Tenant/Product/data identities.
- [ ] Canonical domain and redirect behavior are configurable.
- [ ] Domain activation requires ownership verification.

---

# 45. Acceptance Criteria — Security

- [ ] Product code cannot read Core DB directly.
- [ ] Product code cannot receive raw provider/DB/R2 admin credentials.
- [ ] Cross-tenant access tests fail closed.
- [ ] Module visibility does not substitute for authorization.
- [ ] Product release snapshots are auditable and immutable.
- [ ] Offboarding does not silently delete legally/audit-required records.

---

# 46. Definition of Done

Spec 217 is complete when a domain expert or organization can create a Tenant, receive a SmartAIHub subdomain, generate/configure a branded Product, compose multiple native/custom Mini Apps, control membership and feature visibility, later bind a custom domain, and operate the product using SmartAIHub identity, economics and capabilities without building a parallel user/billing/workflow platform.

---

# 47. External Infrastructure Notes (Non-Normative)

As of 2026-09-20, Cloudflare documents support for:

- Workers for Platforms: isolated user/AI-generated Workers;
- dynamic dispatch and hostname routing for large multi-tenant platforms;
- platform subdomains plus customer vanity domains;
- Cloudflare for SaaS custom hostnames/TLS lifecycle.

Implementation detail and version-sensitive constraints belong to Spec 219.

References:
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/

---

# 48. Product Customer Onboarding and Authentication Experience

A white-label Product MAY present its own branded signup/login/onboarding experience, but identity creation/authentication SHALL still resolve to the canonical SmartAIHub Identity authority unless an approved enterprise federation mode is configured.

Supported product onboarding modes SHOULD include:

```text
OPEN_SIGNUP
INVITE_ONLY
ADMIN_PROVISIONED
ENTERPRISE_SSO
DISABLED_SIGNUP
```

The Product Shell MAY hide SmartAIHub branding according to commercial policy, but MUST NOT create a parallel password/account database.

Custom-domain session/security implementation is owned by Spec 220.

---

# 49. Product Subscription / Customer Account Mapping

A Product customer subscription SHALL map to canonical SmartAIHub principal + Tenant/Product entitlement/economic records.

The Product MAY expose branded checkout/plan UX, but authoritative subscription, credits, invoices, revenue allocation and payment finality remain in Spec 207/current payment authority.

Product-level plan changes MUST be idempotent and auditable and MUST NOT create duplicate customer identities.

---

# 50. Product Ownership, Source Rights and IP Policy

Every Product SHALL have explicit ownership metadata for:

- Tenant owner;
- Product owner;
- source repository owner/control mode;
- Mini App creator ownership;
- generated asset/source usage rights;
- third-party licenses;
- export/transfer eligibility.

SmartAIHub MUST NOT imply that AI-generated source is automatically free of third-party license or IP risk. Spec 218 shall collect dependency/source provenance evidence where available.

Product transfer to another Tenant requires an explicit controlled operation covering source, domains, data, billing obligations, capability grants and audit history; changing an `ownerId` field alone is insufficient.

---

# 51. Product Support and Operational Responsibility

White-label mode SHALL define responsibility boundaries among:

```text
SmartAIHub Platform
Tenant/Product Owner
End Customer
External Provider
```

Tenant Admin UX SHOULD expose who owns:

- customer support;
- product configuration;
- custom source changes;
- data/content policy;
- platform incidents;
- provider incidents;
- payment/refund handling.

This is required so white-label scale does not turn all end-customer issues into ambiguous platform support obligations.

---

# 52. Additional Acceptance Criteria — Commercial Productization

- [ ] Branded signup/login can reuse canonical SmartAIHub Identity without exposing a second account system.
- [ ] Product plan/subscription maps to canonical entitlement/economic records.
- [ ] Product/source/IP ownership metadata is explicit.
- [ ] Product transfer cannot bypass data/domain/billing/security migration controls.
- [ ] Support/responsibility boundaries are visible to Tenant Admins.

---

# 53. Final Definition of Done

Spec 217 is production-ready only when all acceptance criteria in this document pass, including the commercial-productization hardening sections added after the base Definition of Done. No implementation may claim Spec 217 completion while maintaining a parallel identity system, bypassing Tenant/Product entitlements, or treating custom domain/brand changes as new Product identities.


# Revision 2 Addendum — Skills, Agentic UI Engineering & Product Composition

**Normative precedence:** Where this addendum conflicts with earlier Spec 217 text, Revision 2 addendum semantics take precedence.

## 54. Skill and Mini App Boundary

Spec 217 SHALL treat a SmartAIHub Skill as a reusable executable capability and a Mini App as a user-facing product surface.

```text
Skill
= callable capability
= no mandatory UI
= discoverable/invocable through Capability Registry/Gateway

Mini App
= user interaction/product surface
= MAY invoke one or many Skills/Workflows/Agents
= MAY be native/declarative or custom-code-backed

AI Product
= branded commercial/organizational shell
= MAY compose many Mini Apps + native modules + Skills indirectly
```

A Mini App MUST NOT copy a Skill implementation merely to obtain the same behavior. It SHOULD bind to a versioned Skill/Capability reference through Spec 220.

## 55. Product Capability Dependency Graph

Every Product version SHOULD maintain an inspectable dependency graph:

```text
Product
 ├─ Mini App A
 │   ├─ Workflow 1
 │   └─ Skill X
 ├─ Mini App B
 │   ├─ Skill Y
 │   └─ Agent Z
 └─ Product Shell
```

Dependencies MUST be version/policy aware so revocation, security incidents, price changes, incompatibility or Skill deprecation can identify affected Products before rollout.

## 56. Capability-Gap-to-Skill Loop

When Product/Mini App design requires a capability not currently available, Product Builder SHALL NOT silently create duplicate custom backend logic first.

Preferred resolution:

```text
Requirement
→ Capability Search
→ existing Skill/Workflow/Agent found?
   ├─ YES → bind/reuse
   └─ NO  → capability-gap proposal
             ↓
          Spec 221 Skill Engineering
             ↓
          test/eval/review/release
             ↓
          Capability Registry
             ↓
          resume Product/Mini App build
```

The Product owner SHALL see whether a new reusable Skill is being proposed and its ownership/publication scope.

## 57. Mini App Implementation Escalation Ladder

The platform SHOULD choose the least complex implementation that satisfies the required UX:

```text
LEVEL 1  Native schema/declarative Mini App
LEVEL 2  AI-designed advanced native composition
LEVEL 3  Custom Mini App code module
LEVEL 4  Full multi-module branded Product/Tenant
```

Escalation to custom code requires Spec 218/222 engineering governance. A single complex UI requirement such as 3D/WebGL, CAD, GIS, video timeline or realtime editor is sufficient reason to use Level 3 without turning the entire Product into a privileged plugin.

## 58. AI Product / Mini App Design Engineering

Spec 217 owns the target user experience and design contracts. Spec 222 owns how coding/design harnesses implement and refine them.

Required design inputs MAY include:

- target audience/persona;
- product/domain purpose;
- BrandDefinition;
- design tokens;
- component/design-system constraints;
- navigation/information architecture;
- responsive targets;
- accessibility target;
- reference images/sites supplied by authorized users;
- marketplace/enterprise presentation rules.

The platform SHOULD support an iterative design loop:

```text
intent → concepts → preview → multimodal critique → patch → responsive/a11y checks → owner approval
```

Superpowers may contribute disciplined brainstorming/planning/testing, but visual quality is evaluated by SmartAIHub design/eval profiles rather than assumed from methodology use alone.

## 59. Skill-Aware Tenant Product Builder

The AI Product Builder SHOULD be able to explain a generated architecture in terms of reusable platform capabilities:

```text
"Room Cost Estimator" Mini App
→ calls tenant Skill `construction-cost-estimator@2`
→ stores projects through Data API
→ uses Asset API for plans/images
→ invokes image-generation capability through Gateway
```

The generated Product SHALL NOT receive direct Core DB/R2/provider credentials.

## 60. Cross-Spec Ownership Addendum

| Concern | Owner |
|---|---|
| Product/Tenant/Brand/Product Shell/Mini App composition | Spec 217 |
| Development jobs, workspace, Git, build/test mechanics | Spec 218 |
| Production release/runtime/domain routing | Spec 219 |
| Data/Asset/Capability/API/MCP authorization | Spec 220 |
| Skill contract/evals/review/publication | Spec 221 |
| Harness bootstrap, project context, SmartAIHub orchestrator skills, Superpowers bridge, agentic UI/code methodology | Spec 222 |

Spec 217 MUST NOT implement its own coding-agent installation/runtime or Skill engineering lifecycle.

## 61. Revision 2 Acceptance Criteria

- [ ] A Mini App can bind to reusable Skills without embedding their implementation.
- [ ] Capability gaps can trigger a governed Spec 221 Skill engineering flow.
- [ ] Product build resumes only after an eligible Skill version/capability becomes available.
- [ ] Native vs custom Mini App escalation is explicit.
- [ ] Advanced custom UI remains a Mini App/Product surface rather than a Core plugin.
- [ ] AI design work uses Brand/Product contracts and produces responsive/a11y evidence.
- [ ] Product dependency graph identifies Skill/Workflow/Agent versions and policy state.

# Revision 3 — Final Integrated Architecture Stress-Audit Addendum

**Normative precedence:** This Revision 3 addendum supersedes conflicting Revision 1/2 text. It does not replace Spec 207/212/215/220 authorities.


## R3.1 Shared Contract Family and Version Negotiation

Specs 217–222 SHALL consume the existing SmartAIHub shared contracts rather than invent parallel protocol families.

Existing companion contracts remain authoritative where applicable:

```text
SAH-EXEC-1      canonical execution/job correlation
SAH-CAP-1       capability identity/invocation
SAH-RUNNER-1    Runner control/capability presence
SAH-CONTEXT-1   platform/user/task context
SAH-ASSET-1     AssetRef/ArtifactRef authorization
```

This package adds only the following product-engineering contracts:

```text
SAH-PRODUCT-1   Tenant/Product/Mini App composition and release identity
SAH-DEV-1       DevelopmentJob/ChangeSet/engineering-evidence handoff
SAH-RELEASE-1   ReleaseCandidate → RuntimeRelease admission
SAH-SKILL-1     SmartAIHub Runtime Skill contract/dependency identity
SAH-DEVCTX-1    ProjectContextPack / harness-adapter engineering context
```

Every persisted cross-spec reference MUST carry a contract version or version family. Mixed-version deployments MUST negotiate compatible ranges or fail closed. A producer MUST NOT silently emit a new required field/semantic that an older consumer ignores.

Contract evolution rules:

- additive optional fields MAY be backward compatible;
- changed authorization, billing, side-effect, identity or lifecycle semantics require a new compatible version/range and conformance tests;
- production releases MUST pin the contract versions actually used;
- rollback MUST know whether persisted state is backward-readable;
- a compatibility matrix SHALL be queryable by Admin/CI/release gates.

## R3.2 Immutable Product Release Dependency Lock

A production `ProductReleaseSnapshot` MUST pin all execution-affecting dependencies needed for reproducibility:

```text
tenantId
productId
productVersion
productShellVersion
miniAppVersions[]
workflowVersions[]
runtimeSkillLocks[]
agent/capability locks
Product SDK contract version
Spec 220 gateway contract range
economicPolicyVersion
runtimeManifestVersion
releaseCandidateId
sourceRevision
domain/config revision
```

Floating dependency ranges MAY be used during authoring/discovery but MUST resolve to concrete versions before production promotion.

A Product release MUST NOT silently follow a newly published Skill/Workflow/model/provider version merely because the new version is "latest".

## R3.3 Skill Dependency Health and Cascading Revocation

Every bound Runtime Skill dependency SHALL expose a health state:

```text
HEALTHY
AT_RISK
MIGRATION_REQUIRED
BLOCKED
REVOKED
UNAVAILABLE
```

When a Skill is security-revoked, legally disabled, incompatible, or materially price/policy changed:

1. affected Products/Mini Apps SHALL be discoverable by reverse dependency graph;
2. new runs SHALL follow the Skill's revocation policy;
3. Product owners SHALL receive actionable impact information;
4. fallback MAY occur only to an explicitly compatible/equivalent capability under policy;
5. fallback MUST preserve permission/economic/side-effect requirements;
6. historical releases/runs remain auditable and are not rewritten.

A Marketplace/Product UI MUST NOT display an affected Product as fully healthy merely because its frontend still loads.

## R3.4 Bounded Capability-Gap Engineering

The Product Builder MAY request a new Skill from Spec 221, but the capability-gap loop MUST be bounded.

Required controls:

```text
gap_id / semantic fingerprint
parent DevelopmentJob
requested capability contract
owner/scope
budget
deadline
max engineering depth
dedupe key
```

Rules:

- identical concurrent gaps SHOULD converge on one eligible engineering candidate where ownership/privacy permits;
- a Skill-build job MUST NOT recursively spawn unbounded new Skill-build jobs;
- nested capability-gap depth/fan-out/cost are bounded by the parent Product engineering budget;
- if a required capability cannot be produced safely within policy, Product build enters `BLOCKED_CAPABILITY_GAP` rather than generating hidden custom backend logic.

## R3.5 Economic Composition Without Double Charging

An AI Product MAY combine multiple commercial layers, but Spec 207 remains the only monetary authority.

A single end-user action MAY conceptually contain:

```text
Product subscription entitlement
+ Product/Mini App usage fee
+ Runtime Skill fee(s)
+ underlying provider/execution usage
+ explicit external pass-through charges
```

Every amount MUST have a unique cost/revenue lineage. The same provider/Skill execution event MUST NOT be charged again merely because it is reachable through both a Mini App and a Product.

Product UI SHALL be able to show a consumer-facing quote without exposing confidential creator/provider allocation details unless policy permits.

Revenue allocation MUST distinguish:

```text
Platform
Tenant/Product Owner
Mini App Owner
Runtime Skill Owner
Partner
Provider/pass-through
```

without assuming every run has every recipient.

## R3.6 Advanced Interactive Product Surface

A complex Mini App remains a Mini App even when its UI requires custom source such as:

```text
Three.js / Babylon.js
WebGL / WebGPU
CAD/BIM viewer
GIS/map engine
video/audio timeline
diagram/canvas editor
realtime collaborative surface
```

The Product definition SHALL declare:

- implementation class (`NATIVE`, `CUSTOM`, `HYBRID`);
- route/page ownership;
- runtime resource profile;
- required browser capabilities;
- Asset/Data/Capability dependencies;
- fallback/degraded UX;
- accessibility alternative where practical.

Advanced UI complexity MUST NOT grant direct Core access or turn the Mini App into an implicit Core Plugin.

## R3.7 Product-Level Degradation and Fallback UX

When dependencies are unavailable, Product Shell SHOULD distinguish:

```text
PRODUCT_HEALTHY
MODULE_DEGRADED
MODULE_DISABLED
PRODUCT_MAINTENANCE
PRODUCT_SUSPENDED
```

A degraded module MAY be hidden/disabled only according to Tenant/Product policy. User-facing messaging SHOULD identify whether the issue is Product, capability/provider, permission, quota, or maintenance related without leaking internal secrets.

## R3.8 Product Transfer / Offboarding Atomicity

A Product transfer/offboarding plan MUST coordinate:

```text
brand/domain ownership
repository/source rights
Product release history
Tenant membership
data/assets/knowledge
Skill licenses/dependencies
billing/payout obligations
custom runtime resources
audit/legal retention
```

Domain release MUST occur only after verified handoff/retirement so an attacker cannot claim a still-referenced hostname.

If source rights do not permit export, the UI MUST say so before commercial onboarding/transfer.

## R3.9 Release Readiness Gate

A Product version is publishable only if the release gate can verify:

- dependency lock resolution;
- Skill/Workflow health;
- required entitlements/licences;
- production runtime compatibility;
- data/schema compatibility;
- economic policy availability;
- branding/domain configuration validity;
- security/visual/accessibility gates appropriate to the Product tier;
- release evidence from Specs 218/222 where custom source exists.

## R3.10 Revision 3 Acceptance Criteria

- [ ] Production Products pin Skill/Workflow/capability versions rather than floating on `latest`.
- [ ] Skill revocation/deprecation can identify and safely degrade/block affected Products.
- [ ] Capability-gap engineering is bounded, deduplicated and auditable.
- [ ] Product/Mini App/Skill/provider charges cannot double-count one execution event.
- [ ] Custom 3D/WebGPU/realtime UIs remain governed Mini Apps, not privileged Core Plugins.
- [ ] Product health exposes dependency degradation.
- [ ] Transfer/offboarding coordinates domain, source, data, economics and dependency rights.
- [ ] Product release requires complete dependency/security/economic evidence.
