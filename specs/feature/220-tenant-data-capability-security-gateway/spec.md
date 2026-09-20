# Spec 220 — SmartAIHub Tenant Data, Capability & Security Gateway
## Governed Data APIs, Asset/R2 Access, Vector/RAG, Capability Invocation, Secrets, Tenant Isolation & Runtime Authorization

**Status:** Architecture Freeze Candidate / Implementation-ready subject to conformance tests
**Spec ID:** 220  
**Revision:** 3 — Final integrated stress-audit / architecture freeze candidate
**Date:** 2026-09-20  
**Target repository path:** `specs/feature/220-tenant-data-capability-security-gateway/spec.md`  
**Core depends on:** Existing SmartAIHub Identity/Tenant services, Spec 199, Spec 207, Spec 215 and Library/Asset/RAG infrastructure.  
**Integration dependencies:** Specs 217–219, Spec 221 and Spec 222 consume the core gateway contracts; their full product/runtime integrations are not prerequisites for implementing the gateway core.  
**Companion specs:** Spec 217, Spec 218, Spec 219

---

# 0. Executive Decision

All Tenant Product code—native, custom Worker, Container, Runner development process, external agent or future runtime—SHALL access SmartAIHub data, assets, retrieval and AI capabilities only through governed platform contracts.

Custom Product code SHALL NOT receive direct credentials to Core SQL, R2, Vector databases, provider APIs or platform-wide secrets.

The gateway SHALL enforce immutable Tenant/Product identity, authorization, entitlements, quotas, environment separation, audit, data ownership and policy independently of UI visibility.

Canonical pattern:

```text
Tenant Product / Custom Mini App / Development Harness
        ↓
Scoped runtime or development identity
        ↓
SmartAIHub Data / Asset / Retrieval / Capability Gateway
        ↓
Authorization + Entitlement + Quota + Audit
        ↓
SQL / R2 / Vector / Workflow / Agent / Skill / MCP / External Service
```

---

# 1. Goals

1. Prevent direct Core storage access by untrusted/custom Product code.
2. Provide a stable API/SDK surface for Product development.
3. Enforce tenant isolation regardless of storage backend.
4. Keep mutable Tenant slugs/brands separate from immutable physical data namespaces.
5. Allow SmartAIHub to change SQL/R2/Vector providers without rewriting Product source.
6. Support development, preview, staging and production isolation.
7. Support fine-grained capability grants and entitlement checks.
8. Centralize secret brokering and short-lived tokens.
9. Preserve billing/audit attribution for every capability invocation.
10. Support data export, retention and offboarding cleanly.

---

# 2. Non-Goals

Spec 220 SHALL NOT:

- define Product shell/brand UX (Spec 217);
- run coding harnesses or Git workflows (Spec 218);
- deploy Product code or manage custom domains (Spec 219);
- own Workflow execution semantics (Spec 215);
- replace Spec 207 ledger/economic authority;
- expose raw provider credentials as an SDK feature;
- require one physical database per Tenant unless policy demands it.

---

# 3. Gateway Surfaces

Minimum logical surfaces:

```text
Identity Context API
Tenant Data API
Asset API
Retrieval / Knowledge API
Capability API
Workflow API bridge
Notification API
Secret Broker
Schema/Migration API
Audit/Usage API references
```

External protocol exposure MAY include REST/API/MCP according to canonical gateway specs.

Internal Cloudflare/runtime calls MAY use RPC/service bindings where safe, but MUST pass through the same authorization/policy semantics.

---

# 4. Identity Context

Every sensitive request MUST resolve an authenticated context containing at least:

```ts
interface ProductPrincipalContext {
  principalId: string;
  tenantId: string;
  productId?: string;
  environment: "development" | "preview" | "staging" | "production";
  runtimeReleaseId?: string;
  roleRefs: string[];
  entitlementRefs: string[];
  capabilityGrantRefs: string[];
  sessionId?: string;
  authMethod: string;
}
```

The caller SHALL NOT be trusted to self-declare `tenantId` or role without cryptographic/platform validation.

---

# 5. Immutable Tenant Namespace

Physical/logical tenant namespaces MUST derive from immutable IDs, not user-facing slugs.

Recommended pattern:

```text
t_a83fd9
p_7284ab
```

Do NOT bind storage identity to:

```text
interiorpro
interiorpro.com
```

because brands/domains/slugs may change.

---

# 6. Logical Data Collections

Product source SHOULD work with logical collection names:

```ts
data.collection("projects")
data.collection("rooms")
data.collection("quotations")
```

The gateway maps logical names + tenant/product/environment context to physical storage.

Product code MUST NOT embed physical SQL table names.

---

# 7. Storage Mapping

A logical collection MAY map to:

- shared PostgreSQL table with tenant partition key;
- tenant-specific table/schema;
- dedicated database;
- future storage backend.

The mapping strategy is an implementation/policy choice hidden from Product source.

This allows high-value/enterprise tenants to move to stronger isolation later without breaking Product code.

---

# 8. Table/Schema Naming

If physical tenant-prefixed tables are used, prefix MUST use immutable internal identifiers.

Example:

```text
t_a83fd9__projects
```

not:

```text
interiorpro_projects
```

Existing plugin/table prefix conventions MAY be adapted but must avoid mutable brand names as authority.

---

# 9. Data API Contract

Illustrative SDK:

```ts
interface DataClient {
  collection(name: string): CollectionClient;
}

interface CollectionClient {
  find(query: SafeQuery): Promise<Record[]>;
  get(id: string): Promise<Record | null>;
  create(input: Record): Promise<Record>;
  update(id: string, patch: Record): Promise<Record>;
  delete(id: string): Promise<void>;
  paginate(query: SafeQuery): Promise<Page<Record>>;
}
```

`SafeQuery` MUST be schema-aware and MUST NOT be raw SQL.

---

# 10. Schema Registry

Each Product/Tenant collection SHALL have a versioned schema definition.

```ts
interface TenantCollectionSchema {
  schemaId: string;
  tenantId: string;
  productId?: string;
  collectionName: string;
  version: string;
  fields: FieldDefinition[];
  indexes?: IndexDefinition[];
  retentionPolicyRef?: string;
  classificationPolicyRef?: string;
}
```

Schema changes MUST be versioned and auditable.

---

# 11. Data Migration Requests

Custom source SHALL NOT execute arbitrary migration SQL against Core storage.

Development flow:

```text
Spec 218 source change
→ DataSchemaChangeRequest
→ static validation
→ authorization
→ migration plan
→ staging apply
→ compatibility tests
→ production migration approval
```

Migration requests MUST declare forward and rollback/compatibility behavior where applicable.

---

# 12. Query Safety

Gateway SHALL enforce:

- allowed fields;
- query complexity limits;
- result size limits;
- pagination;
- index/scan guardrails;
- tenant/product predicate injection;
- timeout;
- rate/quota limits.

No caller may omit tenant scoping to obtain broader Core data.

---

# 13. Row-Level Authorization

Tenant isolation is necessary but insufficient.

Collections MAY require per-record authorization, for example:

```text
customer owns project
staff assigned to project
manager can view department
```

Row-level policy SHOULD be centrally evaluable and testable.

---

# 14. Environment Isolation

Data namespaces MUST distinguish:

```text
development
preview
staging
production
```

Preview/staging SHALL NOT automatically inherit production data.

If sanitized production snapshots are supported, creation/access MUST be explicit, audited and policy-controlled.

---

# 15. Asset API

Product code SHALL use Asset API rather than raw R2 credentials.

Illustrative surface:

```ts
assets.upload(file, metadata)
assets.get(assetRef)
assets.list(query)
assets.createSignedReadUrl(assetRef, ttl)
assets.delete(assetRef)
assets.attachToProject(assetRef, projectRef)
```

Asset API resolves storage location and permissions.

---

# 16. R2/Object Storage Layout

Implementation MAY use logical paths such as:

```text
/tenants/{tenantId}/products/{productId}/...
```

but path MUST NOT be considered authorization by itself.

Every asset request MUST re-authorize ownership/scope.

---

# 17. Asset Metadata

Asset metadata SHOULD track:

- tenantId;
- productId;
- owner principal;
- environment;
- media type;
- size;
- hash;
- source/provenance;
- rights/license classification where relevant;
- retention policy;
- malware/scan state;
- derived asset relationships.

---

# 18. Signed URLs

Signed URLs SHALL:

- have bounded TTL;
- be scoped to exact asset/action;
- avoid exposing R2 credentials;
- respect tenant/product visibility policy;
- be revocable indirectly through policy/object state where architecture permits.

Long-lived public assets require an explicit publication policy.

---

# 19. Retrieval / Vector Abstraction

Product code SHOULD call:

```ts
knowledge.search(...)
knowledge.index(...)
knowledge.remove(...)
```

rather than directly using Cloudflare Vectorize, pgvector, Qdrant, Pinecone or another provider.

This preserves portability and allows SmartAIHub Retrieval Broker/policy to select backend.

---

# 20. Knowledge Namespace

Retrieval operations MUST scope by:

```text
tenant
product/workspace
user/group where applicable
data classification
environment
```

Cross-tenant retrieval MUST be impossible without explicit shared/public corpus semantics.

---

# 21. Capability Gateway

Custom Product code SHALL invoke SmartAIHub AI capabilities through one governed abstraction.

Capabilities MAY include:

- LLM/model inference;
- image/video/audio generation;
- Skills;
- Workflows;
- Agents;
- MCP tools;
- A2A agents;
- Computer Use;
- Runner capabilities;
- notifications;
- document processing;
- future provider functions.

---

# 22. Capability Contract

```ts
interface CapabilityInvocationRequest {
  capabilityId: string;
  input: unknown;
  idempotencyKey?: string;
  context?: Record<string, unknown>;
  expectedOutputSchemaRef?: string;
}
```

The gateway SHALL resolve:

- caller identity;
- grant/entitlement;
- provider/runtime;
- economic authorization;
- quota/budget;
- audit correlation;
- output normalization.

---

# 23. Product SDK

A versioned Product SDK SHOULD expose stable high-level APIs such as:

```ts
auth.currentUser()
auth.hasPermission(...)
data.collection(...)
assets.upload(...)
knowledge.search(...)
workflow.run(...)
capabilities.invoke(...)
notifications.send(...)
usage.currentPlan()
```

The SDK SHALL NOT expose internal Core database handles or provider master keys.

---

# 24. API / MCP / RPC Equivalence

Allowed transports:

```text
External/custom environment → HTTPS API / MCP
Internal governed runtime   → RPC/service binding where supported
```

Regardless of transport:

```text
authorization
entitlement
billing
quota
audit
schema validation
```

MUST remain equivalent.

Transport MUST NOT become a bypass path.

---

# 25. Secret Broker

Secrets SHALL be referenced, not copied into Product definitions/source.

```ts
interface SecretRef {
  secretId: string;
  tenantId: string;
  scope: string;
  environment: string;
}
```

Product code SHOULD request capabilities that use secrets server-side rather than read secret values.

If a secret value must be injected into an isolated runtime, it requires explicit policy and least-privilege scope.

---

# 26. Runtime Tokens

Spec 219 MAY issue runtime identity tokens containing signed/scoped claims.

Tokens MUST be:

- short-lived or renewable;
- audience-bound;
- environment-bound;
- tenant/product-bound;
- revocable/rotatable;
- non-transferable where implementation supports binding.

Gateway MUST validate runtime release state where relevant.

---

# 27. Development Tokens

Spec 218 development jobs MAY obtain temporary development tokens.

Development tokens SHALL default to development data/capabilities and MUST NOT silently escalate to production.

Example grants:

```text
assets.dev.read
assets.dev.write
data.dev.projects.read
data.dev.projects.write
workflow.dev.run
```

---

# 28. Authorization Model

Authorization SHOULD evaluate:

```text
principal
Tenant membership
Product membership
role
entitlement
resource ownership
capability grant
environment
runtime release
policy conditions
```

Deny rules SHOULD take precedence where policy conflict exists.

---

# 29. Entitlement vs Permission

Entitlement answers:

> "Is this Product/plan allowed to offer this feature?"

Permission answers:

> "May this principal perform this action on this resource?"

Both MUST pass for sensitive operations.

---

# 30. Billing / Economic Authorization

Before billable capability execution:

```text
Capability request
→ authorization
→ Spec 207 quote/reserve/check
→ execute
→ actual usage
→ settle
```

Spec 220 carries attribution but SHALL NOT implement a duplicate ledger.

---

# 31. Quotas

Gateway-level quotas MAY include:

- requests/minute;
- AI runs/day;
- storage;
- vector index size;
- record counts;
- concurrent jobs;
- media generation;
- API bandwidth;
- log volume.

Quota denial MUST return stable machine-readable error codes.

---

# 32. Rate Limiting

Rate limiting SHOULD be evaluated at multiple scopes:

```text
platform
tenant
product
principal
runtime release
capability
IP/session where appropriate
```

One Tenant MUST NOT starve shared infrastructure.

---

# 33. Egress Policy Coordination

Spec 219 enforces runtime/network egress controls.

Spec 220 declares policy intent for capabilities and approved direct external destinations.

Custom Product code SHOULD not call providers directly when SmartAIHub already brokers the provider.

---

# 34. Direct External API Exceptions

Some Products may require third-party services not available as SmartAIHub capabilities.

Allowed path:

```text
Tenant Admin registers connection
→ policy/security review
→ SecretRef
→ scoped egress destination
→ runtime permission grant
```

Direct external API access MUST be explicit and observable.

---

# 35. Data Classification

Schemas/assets SHOULD support classification such as:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

Policy MAY affect:

- eligible runtimes;
- AI providers;
- logging;
- retention;
- export;
- sharing;
- vector indexing.

---

# 36. PII / Sensitive Data Handling

SmartAIHub SHOULD provide policy hooks for:

- PII detection/tagging;
- field masking;
- restricted logging;
- deletion requests;
- access audit;
- data residency constraints where supported.

Product owners MUST NOT automatically gain unrestricted access to end-user sensitive inputs solely by owning the Tenant.

---

# 37. Audit

Every sensitive operation SHOULD emit structured audit fields:

```text
actor principal
Tenant
Product
runtime/development identity
resource
action
decision
policy/grant refs
request correlation
source environment
timestamp
```

Audit logs MUST avoid storing secret values.

---

# 38. Capability Usage Events

Capability events SHOULD retain:

- capability ID/version;
- provider/runtime selected;
- input/output schema versions;
- status;
- cost/usage references;
- latency;
- idempotency key;
- tenant/product/principal attribution;
- workflow/development/runtime correlation IDs.

Raw prompts/content retention follows privacy policy, not mandatory audit fields.

---

# 39. Idempotency

Mutating/billable APIs SHALL support idempotency where duplicate retries are plausible.

Idempotency scope MUST include tenant/product/principal as appropriate to prevent cross-tenant key collision.

---

# 40. Concurrency / Optimistic Locking

Data API SHOULD support version/ETag-style concurrency control for collaborative Product state.

Blind overwrites of shared project state SHOULD be avoidable.

---

# 41. Transactions

Gateway MAY expose bounded transaction semantics for supported storage operations.

Custom Product code SHALL NOT receive unrestricted transaction/session handles that bypass tenant policy.

Cross-service distributed transactions SHOULD use explicit workflow/saga patterns rather than pretending atomicity.

---

# 42. Caching

Caches MUST include tenant/product/security scope in keys where data is private.

Shared caches are allowed only for explicitly public or safe-to-share data.

Cache invalidation and TTL policy must respect data classification.

---

# 43. Backups / Recovery

Persistent storage policies SHALL define:

- backup frequency;
- point-in-time recovery where supported;
- asset durability assumptions;
- restore authority;
- tenant-level recovery procedure;
- cross-tenant restore safety;
- audit linkage.

Product code MUST NOT implement its own shadow backup of Core data without policy approval.

---

# 44. Data Export

Tenant/Product export MAY include:

- logical collection schemas;
- data records;
- assets;
- knowledge/index source documents where exportable;
- metadata needed to interpret exported content.

Vector embeddings themselves MAY be regenerated rather than treated as authoritative export content, depending on policy/provider.

---

# 45. Deletion / Offboarding

Deletion flow MUST account for:

- active billing/settlement;
- legal/audit retention;
- shared assets;
- derived data;
- vector entries;
- backups;
- custom-domain/runtime shutdown sequencing.

Immediate UI deletion does not necessarily mean immediate physical purge.

---

# 46. Tenant Merge/Split

Automatic Tenant merge/split is NOT assumed safe.

If supported later, it requires explicit migration tooling because identity, billing, data ownership, domains, source repositories and audit history may be affected.

---

# 47. Schema Compatibility

Runtime Release SHALL declare compatible data schema range.

Spec 219 promotion gate MUST consult Spec 220 schema compatibility before production activation.

---

# 48. SDK Compatibility

Product SDK versions SHALL declare server API compatibility.

Breaking gateway changes require versioned migration/deprecation policy.

Custom Products MUST NOT depend on undocumented internal endpoints as production contract.

---

# 49. Failure Codes

Stable categories SHOULD include:

```text
AUTH_REQUIRED
AUTH_FORBIDDEN
TENANT_MISMATCH
PRODUCT_MISMATCH
ENTITLEMENT_REQUIRED
CAPABILITY_NOT_GRANTED
QUOTA_EXCEEDED
BUDGET_EXCEEDED
SCHEMA_INVALID
SCHEMA_VERSION_CONFLICT
RESOURCE_NOT_FOUND
ASSET_NOT_AVAILABLE
RATE_LIMITED
DEPENDENCY_UNAVAILABLE
PROVIDER_FAILURE
IDEMPOTENCY_CONFLICT
```

Messages SHALL be localizable and sanitized.

---

# 50. Threat Model

Required threat cases:

- forged tenantId/productId in request body;
- custom Worker attempts SQL network connection;
- leaked runtime token;
- token replay across environments;
- cross-tenant object reference attack;
- path traversal in asset names;
- signed URL reuse beyond intended scope;
- vector query leaks another tenant's corpus;
- capability invocation bypasses billing;
- MCP transport bypasses REST authorization;
- development token used against production;
- Product owner reads customer sensitive data without authorization;
- malicious migration request;
- mass export exfiltration;
- cache key missing tenant scope.

---

# 51. Suggested Persistence

```text
tenant_data_namespaces
tenant_collection_schemas
tenant_schema_versions
data_migration_requests
asset_metadata
knowledge_namespaces
capability_grants
runtime_tokens / token metadata
secret_refs
external_connection_refs
quota_assignments
audit_events
capability_usage_events
```

Reuse existing canonical tables where they already exist rather than duplicating them.

---

# 52. API Surface

Illustrative external Product API:

```text
GET    /product-context
GET    /data/{collection}
POST   /data/{collection}
GET    /data/{collection}/{id}
PATCH  /data/{collection}/{id}
DELETE /data/{collection}/{id}
POST   /assets
GET    /assets/{assetId}
POST   /knowledge:search
POST   /capabilities/{capabilityId}:invoke
POST   /workflow-runs/{workflowId}:run
GET    /usage
```

Admin/control APIs:

```text
POST /products/{productId}/schemas
POST /products/{productId}/schema-migrations
POST /products/{productId}/capability-grants
POST /products/{productId}/connections
GET  /products/{productId}/audit
```

---

# 53. MCP Surface

MCP MAY expose approved Data/Asset/Capability tools for coding harnesses or external agents.

MCP implementation SHALL reuse canonical MCP gateway and MUST NOT create an ungoverned alternate path.

Tool schemas MUST be scoped and should avoid generic raw SQL/file/network tools for ordinary Tenant development.

---

# 54. Integration with Spec 217

Spec 217 defines Tenant/Product membership, entitlements and module configuration.

Spec 220 consumes these identities/policies for authorization but SHALL NOT redefine Product UX.

---

# 55. Integration with Spec 218

Spec 218 uses Spec 220 to provide coding harnesses:

- safe capability discovery;
- development data schemas;
- temporary tokens;
- migration requests;
- dev asset storage;
- test workflow/capability calls.

Coding harnesses do not receive direct Core credentials.

---

# 56. Integration with Spec 219

Spec 219 provides runtime release/environment identity and network controls.

Spec 220 validates every data/capability operation from that runtime identity.

A suspended/revoked release MAY have its gateway token/grants revoked immediately.

---

# 57. Acceptance Criteria — Data

- [ ] Product code uses logical collections, not physical SQL names.
- [ ] Mutable Tenant slug is not storage authority.
- [ ] Tenant/product/environment scoping is injected and verified server-side.
- [ ] Custom code cannot obtain Core SQL credentials.
- [ ] Schema changes go through governed migration requests.
- [ ] Preview/staging do not see production data by default.
- [ ] Cross-tenant data tests fail closed.

---

# 58. Acceptance Criteria — Assets/Retrieval

- [ ] Product code uses Asset API rather than R2 keys.
- [ ] Signed URLs are scoped and time-limited.
- [ ] Retrieval queries cannot cross tenant/product knowledge scope.
- [ ] Vector provider is abstracted behind Knowledge API.
- [ ] Asset/knowledge operations are auditable.

---

# 59. Acceptance Criteria — Capability/Security

- [ ] Capabilities require grants/entitlements/authorization.
- [ ] Billable capability calls use Spec 207 economic authorization.
- [ ] API/MCP/RPC transports have equivalent policy enforcement.
- [ ] Runtime/development tokens are scoped and environment-bound.
- [ ] Direct external API exceptions require explicit connection + egress policy.
- [ ] Product owner cannot bypass end-user data authorization.
- [ ] Stable denial/error codes exist.

---

# 60. Definition of Done

Spec 220 is complete when any Tenant Product—whether native or custom—can persist/query its logical data, store/retrieve assets, use knowledge/vector search and invoke SmartAIHub workflows/agents/skills/models through stable governed contracts while receiving no direct Core storage/provider credentials, with tenant/product/environment isolation, entitlement, billing, quota, secrets and audit enforced consistently across API, MCP and internal runtime transports.

---

# 61. Custom-Domain Authentication and Session Security

A Product served from a custom domain SHALL NOT rely on sharing `smartaihub.app` browser cookies as its security model.

Canonical identity MAY remain SmartAIHub, but custom-domain sessions SHALL use a safe federation/token-exchange/session-establishment flow.

Requirements include:

- exact redirect URI/origin validation;
- PKCE/OIDC-style patterns where applicable;
- CSRF protection;
- secure/HttpOnly/SameSite cookie policy appropriate to the domain flow;
- session fixation prevention;
- logout/revocation behavior;
- no wildcard trust of arbitrary Tenant domains;
- branded login without creating a second credential database.

Enterprise SSO federation MAY be added as an upstream identity source while preserving canonical Tenant/Product principal mapping.

---

# 62. CORS, CSP and Browser-Origin Policy

Gateway SHALL define explicit origin policy for Product subdomains/custom domains.

Do not use permissive `Access-Control-Allow-Origin: *` for credentialed private APIs.

Product release/domain activation SHOULD register approved origins. CSP and browser security headers SHOULD be generated/validated by Product/runtime policy.

---

# 63. Encryption and Key Management

Sensitive data SHALL be encrypted in transit and use provider/platform encryption at rest according to deployed infrastructure.

Higher-assurance tenants MAY require dedicated encryption/key policies where supported.

Secret and encryption-key lifecycle MUST include rotation/revocation and MUST NOT expose raw key material to Product code.

---

# 64. Data Residency / Processing Location Policy

Tenant policy MAY constrain eligible data stores, AI providers, runtime regions, Runner locations and vector/retrieval backends.

Capability resolution MUST NOT silently violate an active residency restriction merely because a cheaper/faster provider is available.

The platform MUST state when a requested residency guarantee is unsupported rather than pretending compliance.

---

# 65. Webhooks and Event Capability

Products MAY register governed inbound webhooks/events.

Webhook ingress SHALL:

- map to exact Tenant/Product;
- authenticate/verify provider signatures where available;
- rate-limit and size-limit input;
- validate schema;
- avoid exposing internal Core endpoints;
- hand off long-running work to canonical async job/workflow infrastructure.

Outbound webhooks SHALL use explicit destinations/secrets and retry/idempotency policy.

---

# 66. Abuse, Export and Bulk-Access Controls

High-volume data export/search/download operations MAY require stronger authorization, re-authentication, approval or asynchronous export jobs.

The gateway SHOULD detect/limit anomalous bulk access patterns that could represent compromised Product code or credentials.

---

# 67. Additional Acceptance Criteria — Identity/Data Protection

- [ ] Custom domains establish secure sessions without depending on cross-domain SmartAIHub cookies.
- [ ] Allowed origins/CORS/CSP are explicit and product-scoped.
- [ ] Secret/encryption key rotation is supported.
- [ ] Residency policy constrains storage/provider/runtime selection where supported.
- [ ] Webhooks cannot bypass tenant/capability/job authorization.
- [ ] Bulk export/access has dedicated governance and audit.

---

# 68. Authoritative Data Boundary vs Runtime-Private State

Spec 220 remains authority for durable Product business data and SmartAIHub Core data access.

Spec 219 MAY provision tenant-scoped runtime-private resources for cache/realtime/coordination. Such resources MUST be classified explicitly as:

```text
EPHEMERAL
DERIVED_REBUILDABLE
AUTHORITATIVE_REGISTERED
```

`AUTHORITATIVE_REGISTERED` provider-native state requires declared backup/export/retention/ownership semantics and registration in the Product data inventory.

A developer MUST NOT create an undocumented shadow system of record merely to bypass Data Gateway policy.

---

# 69. Product Data Inventory

Each Product SHOULD maintain a machine-readable inventory of durable data domains including:

- logical Data API collections;
- authoritative runtime-private resources if approved;
- asset namespaces;
- knowledge/vector source corpora;
- external systems of record;
- retention/export classification.

The inventory supports backup, offboarding, residency review, incident response and product transfer.

---

# 70. Final Definition of Done

Spec 220 is production-ready only when all Product data/capability access paths—including HTTPS API, MCP, internal RPC, runtime-private resource coordination and development tokens—preserve the same Tenant/Product/environment authorization, economic, quota, secret, audit and data-governance invariants with no direct Core credential bypass.


# Revision 2 Addendum — Developer Context Gateway & Skill-Aware Product SDK

**Normative precedence:** Revision 2 addendum takes precedence for developer discovery and Skill-aware gateway semantics.

## 58. Developer-Facing Discovery Surface

Spec 220 SHALL expose governed discovery suitable for Spec 222 development sessions without granting direct Core access.

Conceptual operations:

```text
project_context.describe()
capabilities.search(query)
capabilities.inspect(id)
skills.search(query)
skills.inspect(id, version?)
skills.invoke_dev(id, input)
workflows.search(query)
workflows.inspect(id)
data.schemas.list()
data.schemas.inspect(collection)
data.schema_change.propose(...)
assets.upload_dev(...)
permissions.current()
permissions.request_delta(...)
```

All operations inherit Tenant/Product/environment/principal scope from verified session authority.

## 59. MCP Resources for Development

Where MCP is used, SmartAIHub SHOULD expose read-oriented resources such as:

```text
smartaihub://project/context
smartaihub://product/contract
smartaihub://brand/contract
smartaihub://capabilities/catalog
smartaihub://skills/catalog
smartaihub://data/schemas
smartaihub://permissions/current
smartaihub://development/policy
```

Large catalogs SHOULD use search/retrieval rather than injecting the entire platform into model context.

## 60. Skill Invocation Is a Gateway Capability

Product code and development harnesses MUST invoke Skills through the same governed Capability/Skill gateway family used by SmartAIHub, subject to version, permission, billing, quota, tenancy and audit rules.

A Product MUST NOT download/install a Marketplace Skill package into its Worker merely to use it unless a separately governed offline/export mode explicitly permits this.

## 61. Schema Change Requests

Coding harnesses MUST NOT create arbitrary production tables directly. They MAY propose versioned logical collection/schema changes. The platform validates naming, Tenant/Product scope, migration safety, quota and policy before applying through canonical schema/migration authority.

## 62. Context and Tool Responses Are Untrusted to the Model

Tool/Skill/MCP data returned to a coding harness is context data, not permission. Returned text cannot widen grants, alter Tenant identity, disable release gates or request secret exfiltration. Server-side authorization is authoritative.

## 63. Revision 2 Acceptance Criteria

- [ ] Development harness can discover SmartAIHub APIs/Skills/Data schemas without DB credentials.
- [ ] MCP/API/RPC transports preserve equivalent authorization semantics.
- [ ] Skills remain remotely governed capabilities by default, not copied plugin code.
- [ ] Schema changes are proposed and validated, not direct SQL from custom source.

# Revision 3 — Final Integrated Architecture Stress-Audit Addendum

**Normative precedence:** Revision 3 supersedes conflicting gateway semantics. Server-side authorization and economic attribution remain authoritative regardless of SDK/API/MCP/RPC transport.


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

## R3.2 Canonical Invocation Envelope

Every Product/Mini App/Workflow/Skill capability invocation MUST normalize to an authorization envelope containing enough identity to prevent confused-deputy behavior:

```text
request_id
principal_id
tenant_id
product_id
mini_app_id? / workflow_run_id?
caller_capability_id?
target_capability_id + pinned/ranged version
environment
purpose/side_effect_class
permission grant id
budget/economic context id
idempotency key where side effects exist
trace/correlation ids
```

Transport-specific clients MUST NOT be trusted to self-assert privileged fields that are derivable server-side.

## R3.3 Runtime Skill Invocation Through Capability Gateway

A Runtime Skill remains a capability, not code imported into the Product Worker.

The Product SDK SHOULD support a stable abstraction such as:

```text
skills.search(...)
skills.describe(...)
skills.invoke(...)
```

but server implementation resolves through the shared Capability Registry/Gateway and Spec 221 Skill release state.

Before invocation:

- entitlement/license;
- tenant/product grant;
- Skill release health;
- input schema;
- budget;
- side-effect policy;
- data classification/residency;
- dependency availability

MUST be checked according to policy.

## R3.4 Capability Version Negotiation

Development MAY discover compatible ranges. Production invocations SHALL resolve against the release's dependency lock unless policy explicitly supports safe dynamic substitution.

A compatible substitute must satisfy:

```text
schema
permission/effect class
data locality
cost/budget envelope
quality/certification
licence/entitlement
```

Functional similarity alone is insufficient.

## R3.5 Economic Event Lineage and Idempotency

Capability usage events MUST carry immutable economic lineage so Spec 207 can distinguish:

```text
provider execution cost
Runtime Skill owner fee
Mini App/Product fee
tenant/partner share
platform share
refund/reconciliation adjustment
```

Retries, transport replay or parent/child aggregation MUST NOT duplicate one billable effect.

Unknown external outcomes remain pending/reconcile rather than being fabricated as success or zero cost.

## R3.6 Developer Discovery Is Read-Oriented by Default

Developer MCP/context resources MAY expose schemas/catalog/contracts, but discovery access MUST NOT imply mutation authority.

Mutating development operations such as:

```text
create data collection
apply schema migration
request secret
expand permission
register outbound endpoint
create webhook
publish Skill/Product
```

require explicit scoped actions/grants and the appropriate owning spec lifecycle.

## R3.7 Schema and Data Migration Control

Product code MUST NOT issue arbitrary Core DDL.

Canonical flow:

```text
developer proposes logical schema change
→ Spec 220 validates namespace/policy
→ migration plan
→ compatibility/data-loss review
→ staging migration/test
→ approved production migration
→ recorded schema revision
```

Rollback/forward-only semantics MUST be explicit. Release promotion MUST coordinate with Spec 219 so code and schema versions do not become incompatible.

## R3.8 Context Snapshot Integrity

Developer-facing context/schema resources SHOULD expose:

```text
context_version
generated_at
source revisions
tenant/product scope
content hash
expiry/staleness policy
```

A coding harness MUST NOT treat a cached context snapshot as current authorization.

Authorization is re-evaluated when the generated code/API call actually runs.

## R3.9 Egress and SSRF Boundary

Custom Product code and Skills SHALL use governed egress according to policy.

Controls SHOULD cover:

- domain/IP allow/deny;
- private/link-local/metadata-network protection;
- redirect revalidation;
- DNS rebinding defenses where applicable;
- payload/response size/time bounds;
- secret/header stripping;
- audit and cost limits.

## R3.10 Runtime-Private State Classification

Provider-native/runtime-private state is allowed only with an explicit class in Product Data Inventory.

State required to restore customer business records after runtime replacement MUST NOT be labeled disposable cache merely to bypass backup/export/residency rules.

## R3.11 Revision 3 Acceptance Criteria

- [ ] All transports normalize into one canonical invocation identity/authorization envelope.
- [ ] Runtime Skills are invoked through the Gateway rather than copied into Product Workers.
- [ ] Production uses pinned dependency locks or policy-approved equivalent substitution.
- [ ] Economic events carry idempotent cost/revenue lineage.
- [ ] Read-only developer discovery cannot silently mutate schemas/permissions/secrets.
- [ ] Schema changes use governed migration plans coordinated with releases.
- [ ] Cached context cannot grant stale authorization.
- [ ] Egress/SSRF protections apply to custom Products and Skill execution.
