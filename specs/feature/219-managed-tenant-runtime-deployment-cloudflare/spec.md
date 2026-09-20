# Spec 219 — SmartAIHub Managed Tenant Runtime & Deployment Fabric
## Workers for Platforms, Release Service, Environments, Subdomains, Custom Domains, Managed Cloud, BYOC & Runtime Governance

**Status:** Architecture Freeze Candidate / Implementation-ready subject to conformance tests
**Spec ID:** 219  
**Revision:** 3 — Final integrated stress-audit / architecture freeze candidate
**Date:** 2026-09-20  
**Target repository path:** `specs/feature/219-managed-tenant-runtime-deployment-cloudflare/spec.md`  
**Depends on:** Spec 217 Product identity, Spec 218 ReleaseCandidate contract, core Spec 220 gateway contracts, Spec 207, canonical worker job control plane and SmartAIHub observability/security services  
**Companion specs:** Spec 217, Spec 218, Spec 220

---

# 0. Executive Decision

SmartAIHub SHALL provide a managed production runtime for Tenant Products so that Tenant Admins can publish software without operating Cloudflare dashboards, infrastructure credentials or deployment commands.

The default managed model SHALL use a platform-controlled multi-tenant runtime architecture. Cloudflare Workers for Platforms is the preferred initial implementation for web/edge custom Product code because it supports isolated user/AI-generated Workers, dynamic dispatch and platform-managed routing. Cloudflare Containers or other approved runtimes MAY be used for workloads that exceed the Worker execution model.

Tenant development machines and coding sandboxes SHALL NOT be production servers.

Canonical release path:

```text
Spec 218 ReleaseCandidate
→ SmartAIHub Release Service
→ policy/security/compatibility gates
→ staging deployment
→ health/e2e validation
→ approval/promotion
→ production deployment
→ hostname/domain routing
→ monitoring / rollback / suspension
```

---

# 1. Goals

1. Give every eligible Tenant/Product a managed runtime without cloud expertise.
2. Start every Tenant from a SmartAIHub subdomain.
3. Allow later upgrade to a custom domain without changing Product identity.
4. Isolate custom Tenant code from SmartAIHub Core and other tenants.
5. Keep production deployment authority centralized and auditable.
6. Support staging, preview, production, rollback and canary.
7. Support managed infrastructure as default and BYOC for advanced/enterprise cases.
8. Meter runtime use for monthly plans/overages.
9. Support Workers, Containers and future runtime targets without changing Product contracts.
10. Preserve capability/data access through Spec 220 rather than direct credentials.

---

# 2. Non-Goals

Spec 219 SHALL NOT:

- own Product/Brand/Membership semantics (Spec 217);
- run coding harnesses or source-control workflows (Spec 218);
- expose SQL/R2/Vector/provider credentials to Tenant code (Spec 220);
- own credit ledger or revenue allocation (Spec 207);
- replace Workflow runtime (Spec 215);
- create a Cloudflare account per Tenant by default;
- create one dispatch namespace per Tenant;
- bind production availability to a Tenant's local Runner.

---

# 3. Runtime Abstraction

```ts
interface ProductRuntimeAdapter {
  kind(): RuntimeKind;
  validate(candidate: ReleaseCandidate): Promise<RuntimeValidation>;
  deploy(input: RuntimeDeploymentRequest): Promise<RuntimeDeploymentRef>;
  promote(input: PromotionRequest): Promise<RuntimeReleaseRef>;
  rollback(input: RollbackRequest): Promise<RuntimeReleaseRef>;
  suspend(input: SuspendRequest): Promise<void>;
  health(ref: RuntimeDeploymentRef): Promise<RuntimeHealth>;
  usage(ref: RuntimeDeploymentRef, window: TimeWindow): Promise<RuntimeUsage>;
  destroy(ref: RuntimeDeploymentRef): Promise<void>;
}
```

Initial kinds MAY include:

```text
CLOUDFLARE_WORKER_PLATFORM
CLOUDFLARE_CONTAINER
SMARTAIHUB_MANAGED_CONTAINER
EXTERNAL_BYOC_RUNTIME
STATIC_ASSET_RUNTIME
```

---

# 4. Managed Runtime Default

For ordinary creators/SMEs/partners:

```text
Infrastructure Mode: SMARTAIHUB_MANAGED
```

Tenant Admin SHOULD see a simple plan-oriented UI rather than raw provider settings.

Example:

```text
Hosting: Managed by SmartAIHub
Production: Healthy
Subdomain: interiorpro.smartaihub.app
Custom domain: Not configured
Plan allowance: 62% remaining
```

---

# 5. Cloudflare Workers for Platforms Baseline

Preferred initial architecture:

```text
Cloudflare zone / SmartAIHub SaaS domain
        ↓
Dynamic Dispatch Worker
        ↓
Dispatch Namespace: staging / production
        ↓
User Worker per deployable Product runtime
```

Normative platform rules:

- use shared namespace per environment, NOT namespace per Tenant;
- user Worker identity MUST use immutable Product/runtime IDs, not mutable slugs;
- routing mapping MUST be data-driven and auditable;
- per-user Worker resource policies MUST be configurable by plan/risk;
- platform dispatch layer MAY apply auth, request validation, rate limits, security headers and response sanitation before/after user code.

---

# 6. Runtime Identity

```ts
interface TenantRuntimeAllocation {
  allocationId: string;
  tenantId: string;
  productId: string;
  environment: "preview" | "staging" | "production";
  runtimeKind: RuntimeKind;
  providerAccountRef: string;
  namespaceRef?: string;
  runtimeObjectRef: string;
  planRef?: string;
  state: RuntimeAllocationState;
}
```

Do not use `tenant.worker_id` as the whole model. One Product MAY require multiple runtime units.

---

# 7. Runtime Unit Model

A Product MAY contain:

```text
frontend Worker
API Worker
background Container
scheduled task runtime
static assets
```

Each is represented as a `RuntimeUnit` inside one Product release.

```ts
interface RuntimeUnit {
  runtimeUnitId: string;
  productId: string;
  role: "frontend" | "api" | "background" | "static" | "auxiliary";
  runtimeKind: RuntimeKind;
  artifactRef: string;
  resourcePolicyRef: string;
  capabilityGrantRef: string;
}
```

---

# 8. Environment Model

At minimum:

```text
DEVELOPMENT     — Spec 218 local/cloud build environment
PREVIEW         — ephemeral review runtime
STAGING         — durable pre-production validation
PRODUCTION      — customer-facing runtime
```

Production data MUST NOT be automatically copied into preview/staging.

Test data/secrets MUST be environment-scoped.

---

# 9. Preview Deployments

Preview deployments SHALL:

- bind to immutable source/build revision;
- be access-controlled by default;
- be non-indexable by default;
- have automatic expiry/cleanup;
- expose logs/health to SmartAIHub review UI;
- use development/staging data scopes, not unrestricted production scopes.

Preview hostname pattern MAY be:

```text
pr-{changeId}.{productSlug}.preview.smartaihub.app
```

Exact naming is implementation detail.

---

# 10. Staging

Staging SHOULD approximate production contracts, including:

- runtime class;
- SmartAIHub Product SDK version;
- capability/data gateway contracts;
- auth/session flow;
- custom-domain hostname simulation where practical;
- rate-limit/security policy;
- release bindings.

Staging MUST have separate environment identity and secrets.

---

# 11. ReleaseCandidate Intake

Spec 219 accepts only normalized release candidates from Spec 218 or authorized platform sources.

Required fields:

```text
productId
tenantId
source revision
build artifacts
runtime manifest
test evidence
security evidence
required data schema version
required capability grants
Product SDK compatibility
requested environment
```

Missing mandatory evidence SHALL fail closed.

---

# 12. Release Service

The Release Service is the sole default production deployment authority.

Responsibilities:

- validate release candidate;
- resolve runtime target;
- resolve environment bindings;
- validate data schema/capability policy;
- inject short-lived/build-time runtime configuration safely;
- deploy immutable artifact;
- register runtime release;
- perform smoke/health checks;
- update routing atomically or via controlled rollout;
- emit audit events;
- support rollback.

---

# 13. No Direct Runner-to-Production

Hard invariant:

```text
Tenant Runner / coding sandbox
    cannot directly become production deploy authority
```

Runner SHALL NOT possess platform-wide production deployment credentials.

Manual emergency operator actions, if supported, MUST still generate Release/Audit records.

---

# 14. Platform Subdomain Routing

Default Product hostname SHOULD be created automatically.

Example:

```text
interiorpro.smartaihub.app
```

Routing logic:

```text
request Host
→ dynamic dispatch layer
→ HostBinding lookup
→ tenantId/productId/releaseId
→ product runtime
```

Host lookup MUST use immutable internal identifiers after resolution.

Unknown/unverified hosts MUST fail to a safe platform response and MUST NOT guess a Tenant.

---

# 15. HostBinding

```ts
interface HostBinding {
  hostBindingId: string;
  hostname: string;
  tenantId: string;
  productId: string;
  environment: "staging" | "production";
  type: "PLATFORM_SUBDOMAIN" | "CUSTOM_DOMAIN";
  state: HostBindingState;
  canonical: boolean;
  redirectToCanonical?: boolean;
  verificationRef?: string;
  tlsRef?: string;
  activeReleaseRef?: string;
}
```

Hostname uniqueness MUST be enforced.

---

# 16. Custom Domain Lifecycle

```text
REQUESTED
→ VALIDATING_FORMAT
→ OWNERSHIP_VERIFICATION_PENDING
→ VERIFIED
→ CERTIFICATE_PENDING
→ ROUTING_PENDING
→ ACTIVE
```

Failure states:

```text
VERIFICATION_FAILED
CERTIFICATE_FAILED
ROUTING_FAILED
SUSPENDED
DETACHED
```

Tenant Admin SHALL see user-friendly DNS guidance and current state.

---

# 17. Custom Domain Upgrade Principle

Moving from:

```text
interiorpro.smartaihub.app
```

to:

```text
interiorpro.com
```

MUST NOT require:

- new Tenant;
- new Product;
- data migration;
- new source repository;
- workflow duplication;
- new billing account by default.

Only host/domain routing and brand/canonical URL metadata change.

---

# 18. Cloudflare for SaaS / Custom Hostnames

Where Cloudflare is the managed provider, custom customer domains SHOULD use Cloudflare for SaaS/custom hostname mechanisms rather than ad-hoc per-domain certificate management.

Implementation SHALL account for current plan limits, hostname quotas, certificate validation and apex-domain constraints. These values are provider/version dependent and MUST NOT be hard-coded permanently in Product semantics.

---

# 19. Canonical Domain / Redirect

Product MAY keep both:

```text
interiorpro.smartaihub.app
interiorpro.com
```

Policy options:

```text
BOTH_ACTIVE
CUSTOM_CANONICAL_REDIRECT_PLATFORM
PLATFORM_CANONICAL_REDIRECT_CUSTOM
CUSTOM_ONLY_AFTER_GRACE
```

Redirect changes MUST be reversible.

---

# 20. BYOC Mode

Advanced/enterprise mode:

```text
Infrastructure Mode: BYOC
```

Tenant MAY connect its own approved Cloudflare or other runtime account.

BYOC MUST use scoped credentials and explicit resource inventory.

SmartAIHub MUST NOT require root/global account credentials where narrower tokens are possible.

BYOC policy MUST define responsibility for:

- provider billing;
- quota exhaustion;
- domain configuration;
- logs/telemetry access;
- disaster recovery;
- deletion/offboarding.

---

# 21. Managed vs BYOC UX

Default setup:

```text
● SmartAIHub Managed (Recommended)
  No cloud setup required

○ Bring Your Own Cloud
  Advanced / Enterprise
```

Changing infrastructure mode after production launch requires an explicit migration plan and MUST NOT silently move data/runtime.

---

# 22. Containers / Heavy Runtime

A Product SHALL NOT be forced into Workers when requirements demand:

- long-lived process;
- filesystem/process behavior beyond Worker model;
- heavier memory/CPU;
- server binaries;
- special runtime packages.

Runtime Resolver MAY choose Containers or other governed targets.

Production Containers MUST still receive data/capability access through Spec 220.

---

# 23. Runtime Manifest

```ts
interface ProductRuntimeManifest {
  version: string;
  units: RuntimeUnitManifest[];
  routes: RuntimeRoute[];
  healthChecks: HealthCheckDefinition[];
  requiredCapabilities: string[];
  requiredDataContracts: string[];
  egressPolicyRef: string;
  resourcePolicyRef: string;
  sdkCompatibility: string;
}
```

Release Service SHALL validate the manifest before deployment.

---

# 24. Resource Policies

Runtime policy MAY constrain:

- CPU;
- memory where runtime supports it;
- subrequests/network calls;
- concurrency;
- request rate;
- execution duration;
- container active time;
- storage allowance references;
- log volume;
- bandwidth/egress policy.

Plan defaults MUST be overridable only within platform-approved bounds.

---

# 25. Denial-of-Wallet Protection

SmartAIHub SHALL implement controls for runaway Tenant code, including:

- resource caps;
- rate limiting;
- circuit breakers;
- budget alerts;
- automatic suspension thresholds;
- anomaly detection;
- preview/staging load limits;
- per-product monthly usage policies.

Billing failure SHOULD degrade safely rather than incur unbounded provider spend.

---

# 26. Egress Governance

Where supported, outbound calls from Tenant code SHOULD pass through a governed policy layer/outbound Worker/proxy.

Policy MAY:

- allow listed domains;
- deny blocked domains;
- log destinations;
- restrict protocols;
- enforce rate limits;
- redact platform credentials;
- prevent metadata-service/cloud-credential probing.

Tenant code SHOULD use SmartAIHub Capability Gateway instead of direct vendor APIs whenever equivalent platform capability exists.

---

# 27. Runtime Configuration

Runtime configuration SHALL be separated into:

```text
public configuration
platform-issued scoped runtime tokens
secret references
feature flags
release metadata
```

No build artifact SHALL contain platform master credentials.

---

# 28. Runtime Token

Product runtime MAY receive a short-lived or renewable scoped identity/token representing:

```text
tenantId
productId
runtimeReleaseId
environment
capability grants
data namespace grants
```

Spec 220 validates this identity at each sensitive operation.

---

# 29. Promotion

Normal path:

```text
ReleaseCandidate
→ staging
→ checks
→ production candidate
→ promote
```

Promotion SHALL prefer immutable artifact reuse over rebuilding from different source.

---

# 30. Canary / Staged Rollout

Supported strategies SHOULD include:

```text
100% immediate
percentage canary
staff/internal cohort
named tenant/user cohort
progressive percentage
```

Release routing MUST retain exact release attribution for telemetry and rollback.

---

# 31. Rollback

Rollback MUST be a first-class operation.

Requirements:

- previous known-good runtime artifact remains addressable for retention period;
- routing can atomically return to prior release where provider allows;
- data migration compatibility is checked before rollback;
- rollback event is audited;
- domain bindings remain stable.

A rollback MUST NOT blindly revert irreversible data migrations.

---

# 32. Kill Switch / Suspension

Platform operators and authorized Tenant Admins SHALL have bounded suspension controls.

Suspension MAY target:

- one runtime unit;
- one Product;
- one Tenant runtime estate;
- one release;
- custom-domain traffic only.

Suspension MUST preserve evidence/log references and MUST NOT delete source/data automatically.

---

# 33. Health Checks

Runtime health SHOULD include:

- deployment state;
- route reachability;
- application health endpoint;
- capability gateway reachability;
- auth/session checks;
- error rate;
- latency;
- resource saturation;
- recent crash/restart indicators.

Health state MUST distinguish platform outage from Product code failure where possible.

---

# 34. Observability

Per Tenant/Product/Release observability SHOULD expose:

- request volume;
- error rate;
- latency p50/p95/p99;
- runtime CPU/compute use;
- container active time;
- egress destinations/count;
- capability calls;
- release version;
- deployment events;
- domain/TLS state;
- cost references.

Sensitive data MUST be redacted by default.

---

# 35. Logging

Tenant Product logs SHALL be scoped and quota-controlled.

Logs MUST NOT include:

- raw secrets;
- bearer tokens;
- DB credentials;
- provider master keys;
- cross-tenant data.

Tenant Admin access to logs MUST follow role/retention policies.

---

# 36. Runtime Usage Metering

Usage events SHALL normalize provider-specific data into platform categories such as:

```text
requests
compute_ms
container_cpu_ms
container_memory_gb_s
container_disk_gb_s
bandwidth
deployments
build/runtime storage
log volume
```

Spec 207 determines how usage maps to fees/allowances.

---

# 37. Monthly Hosting Plans

Spec 219 SHALL support hosting-plan policy references such as:

```text
Starter
Professional
Business
Enterprise
```

Each plan MAY define included runtime allowance and overage policy.

Product/Tenant UI MUST display user-friendly usage rather than provider-native billing jargon where possible.

---

# 38. Runtime Compatibility Gate

Release SHALL fail before production if:

- SDK version unsupported;
- required capability unavailable;
- data schema incompatible;
- runtime artifact invalid;
- runtime manifest requests forbidden resource class;
- domain/routing prerequisites unresolved;
- security scan policy fails;
- plan entitlement insufficient and no override approved.

---

# 39. Provider Failure

Provider outage handling MAY include:

- hold deployment;
- retain current release;
- retry with backoff;
- operator alert;
- failover to approved alternate region/provider only if architecture and residency policy support it.

SmartAIHub MUST NOT promise transparent provider failover if the Product was not designed/tested for it.

---

# 40. Disaster Recovery

Spec 219 SHALL define recovery for:

- release metadata;
- host/domain mapping;
- runtime configuration;
- deployment artifacts;
- provider account loss/credential rotation;
- accidental runtime deletion.

Persistent user data recovery belongs primarily to Spec 220.

---

# 41. Release History

Every production Product SHALL expose release history:

```text
v42 active
v41 previous known-good
v40 archived
```

History SHALL link to:

- source revision;
- DevelopmentJob/ReleaseCandidate;
- runtime artifacts;
- deployment operator/automation;
- health outcome;
- rollback relationship.

---

# 42. Domain Failure Handling

If custom-domain TLS/DNS fails:

- platform subdomain SHOULD remain available unless policy disables it;
- existing verified domain MUST NOT be removed until replacement is confirmed;
- UI shall explain DNS/certificate state;
- Product runtime itself SHOULD remain deployed.

---

# 43. Tenant Offboarding

Runtime offboarding sequence SHOULD be:

```text
freeze new releases
→ settle billing references
→ detach custom domains
→ stop production routing
→ archive release metadata
→ retain artifacts for policy period
→ destroy runtime units when eligible
```

Source/data offboarding is coordinated with Specs 218/220.

---

# 44. Security Threats

Required threat coverage:

- malicious user Worker;
- cross-tenant runtime invocation;
- dispatch routing confusion;
- forged Host header mapping;
- custom-domain takeover;
- leaked deployment token;
- unbounded egress;
- runaway CPU/subrequests;
- release artifact tampering;
- supply-chain artifact mismatch;
- stale release promoted after approval invalidation;
- preview environment reaching production data;
- tenant code attempting direct provider credentials.

---

# 45. Audit Events

Minimum:

```text
runtime.allocated
runtime.deploy_started
runtime.deploy_succeeded
runtime.deploy_failed
runtime.promoted
runtime.rollback
runtime.suspended
runtime.resumed
runtime.destroyed
host.platform_subdomain_created
host.custom_domain_requested
host.verified
host.tls_active
host.canonical_changed
host.detached
byoc.connected
byoc.credential_rotated
```

---

# 46. Suggested Persistence

```text
tenant_runtime_allocations
runtime_units
runtime_releases
runtime_deployments
host_bindings
domain_verification_events
runtime_health_events
runtime_usage_rollups
runtime_policy_assignments
byoc_connections
```

Provider-native IDs MUST be stored as external references, not used as canonical Tenant/Product IDs.

---

# 47. API Surface

Illustrative:

```text
POST /products/{productId}/runtime:allocate
POST /products/{productId}/releases
POST /releases/{releaseId}:deploy-staging
POST /releases/{releaseId}:promote
POST /products/{productId}:rollback
POST /products/{productId}:suspend
GET  /products/{productId}/runtime/health
GET  /products/{productId}/runtime/usage
POST /products/{productId}/domains
POST /domains/{domainId}:verify
POST /domains/{domainId}:set-canonical
DELETE /domains/{domainId}
POST /tenants/{tenantId}/byoc-connections
```

---

# 48. Integration with Spec 217

Spec 217 owns desired Product/Brand/Domain state.

Spec 219 turns approved desired state into runtime/domain state and reports status back.

Spec 219 MUST NOT redefine Product membership, navigation or monetization.

---

# 49. Integration with Spec 218

Spec 219 accepts immutable ReleaseCandidates and SHALL NOT modify source code.

Deployment failures MAY create a remediation request back to Spec 218 but SHALL NOT silently invoke arbitrary coding harnesses.

---

# 50. Integration with Spec 220

Runtime code receives only scoped access to Spec 220 APIs/RPC/capability bridge.

Spec 219 provides runtime identity/context and enforces network/runtime boundaries; Spec 220 authorizes data/capability operations.

---

# 51. Acceptance Criteria — Runtime

- [ ] Managed Product can deploy without Tenant Cloudflare credentials.
- [ ] One shared namespace per environment can host many isolated Product Workers.
- [ ] Product can have multiple Runtime Units.
- [ ] Local Runner is not production authority.
- [ ] Preview/staging/production are distinct.
- [ ] Release artifact/revision is immutable and traceable.
- [ ] Production release can rollback to known-good version subject to data compatibility.

---

# 52. Acceptance Criteria — Domain

- [ ] Tenant receives platform subdomain automatically.
- [ ] Custom domain can be added later.
- [ ] Domain change does not change Product/Tenant/data identities.
- [ ] Ownership verification and certificate state are explicit.
- [ ] Dynamic routing maps host to exact Product/runtime release.
- [ ] Unknown host fails safely.
- [ ] Platform subdomain can remain fallback during custom-domain failure.

---

# 53. Acceptance Criteria — Security/Cost

- [ ] Tenant code does not receive platform master credentials.
- [ ] Per-Product resource policies exist.
- [ ] Egress is governed where supported.
- [ ] Preview cannot access unrestricted production data by default.
- [ ] Runtime usage is metered and attributable.
- [ ] Runaway cost controls can suspend or throttle safely.
- [ ] BYOC credentials are scoped and auditable.

---

# 54. Definition of Done

Spec 219 is complete when SmartAIHub can take an approved Product ReleaseCandidate, deploy it to a governed multi-tenant runtime, expose it first through a SmartAIHub subdomain, later attach a verified custom domain, operate preview/staging/production with health/observability/rollback, meter usage for hosting plans, and keep custom Tenant code isolated from platform credentials and other tenants.

---

# 55. External Technology Baseline (Non-Normative, 2026-09-20)

Cloudflare documentation currently supports the chosen baseline:

- Workers for Platforms runs untrusted customer/AI-generated code as isolated user Workers.
- Cloudflare recommends shared dispatch namespaces (for example staging/production), not one namespace per customer.
- Dynamic dispatch can route large numbers of subdomains/custom domains programmatically.
- Cloudflare for SaaS supports customer custom hostnames and managed certificates.
- Workers Builds supports Git integration, but this spec intentionally keeps SmartAIHub Release Service as production policy authority.
- Containers/Sandbox can cover workloads that need Linux process/filesystem behavior beyond ordinary Workers.

References:
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/how-workers-for-platforms-works/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dynamic-dispatch/
- https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/hostname-routing/
- https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/
- https://developers.cloudflare.com/workers/ci-cd/
- https://developers.cloudflare.com/containers/

---

# 56. Artifact Integrity and Deployment Attestation

Release Service SHOULD verify artifact digest/signature/attestation supplied by trusted build infrastructure.

Production deployment record SHALL bind source revision, artifact digest, runtime manifest digest, release policy version and deployer identity. A different artifact with the same semantic version label MUST NOT be substituted silently.

---

# 57. Background, Scheduled and Event-Driven Runtime

Custom Products MAY require non-request workloads such as scheduled maintenance, webhook/event processing, queue consumers, long-running product-side jobs and asynchronous document/media preparation.

Spec 219 SHALL model background runtime explicitly rather than abusing frontend Worker requests.

Where a task is fundamentally a SmartAIHub Workflow/Agent job, the Product SHOULD invoke canonical SmartAIHub job/workflow infrastructure instead of building a second queue inside Tenant code.

Runtime manifests MUST declare event/background entry points and resource limits.

---

# 58. Configuration and Runtime Drift Detection

SmartAIHub SHOULD periodically compare desired release/runtime configuration with provider reality.

Detect at least:

- missing/deleted runtime object;
- unexpected route/domain change;
- changed resource limit;
- BYOC credential loss;
- unknown release deployed outside SmartAIHub;
- certificate/custom-hostname divergence.

Drift MUST be reported and SHALL NOT be silently overwritten if it may represent an intentional external enterprise change; reconciliation policy applies.

---

# 59. SLO and Incident Model

Platform SHOULD distinguish:

```text
PLATFORM_INCIDENT
PROVIDER_INCIDENT
TENANT_CODE_INCIDENT
DEPENDENCY_INCIDENT
DOMAIN_DNS_INCIDENT
```

Tenant Admin SHOULD receive actionable status without leaking other tenants' information.

Hosting plans MAY define runtime SLO/support targets, but product-specific application correctness is not automatically a platform SLO.

---

# 60. Custom Domain Takeover Protection

Domain lifecycle SHALL defend against stale/custom-hostname takeover scenarios.

Requirements:

- ownership verification before first activation;
- revalidation when provider/domain state requires it;
- immediate routing disable on confirmed ownership loss or unsafe stale binding;
- careful release of hostname claims during offboarding;
- audit of domain add/remove/canonical changes.

A detached custom hostname MUST NOT remain routable to a new unrelated Tenant through stale mapping.

---

# 61. Provider Version and Limit Registry

Cloud provider limits/pricing/capabilities change over time.

Spec 219 SHALL maintain provider capability/limit metadata outside Product semantic definitions.

Product validation consults the current registry instead of hard-coding 2026 provider numbers into durable Product contracts.

---

# 62. Additional Acceptance Criteria — Runtime Operations

- [ ] Production artifact integrity is verifiable against release evidence.
- [ ] Background/scheduled/event runtime has explicit governed semantics.
- [ ] Runtime/provider drift can be detected.
- [ ] Incidents are classified as platform/provider/tenant/dependency/domain where possible.
- [ ] Custom-domain stale binding/takeover controls exist.
- [ ] Provider limits/pricing are externalized from Product semantics.

---

# 63. Runtime-Private Resources and Realtime State

Advanced Products MAY require runtime-native resources for low-latency or realtime behavior, for example:

- WebSocket/realtime session state;
- actor/durable-object style coordination;
- tenant-private KV/cache;
- tenant-private queue/event buffer;
- short-lived edge state.

SmartAIHub MAY provision these as `RuntimeResourceGrant` objects bound only to the exact Tenant/Product/environment/runtime release.

```ts
interface RuntimeResourceGrant {
  resourceGrantId: string;
  tenantId: string;
  productId: string;
  environment: string;
  resourceKind: string;
  providerResourceRef: string;
  permissions: string[];
  authoritativeDataAllowed: boolean;
  policyRef: string;
}
```

These resources MUST NOT expose SmartAIHub Core storage credentials or shared cross-tenant resources.

Provider-native resources are implementation optimizations, not permission bypasses.

---

# 64. WebSocket / Realtime Runtime

If Product requirements include realtime collaboration or 3D/editor synchronization, Runtime Resolver MAY allocate an approved realtime runtime/resource.

Realtime connection establishment MUST still authenticate through Product identity/session policy and apply Tenant/Product scoping.

Long-lived connections MUST have connection/concurrency/budget limits and release attribution.

---

# 65. Final Definition of Done

Spec 219 is production-ready only when managed and approved BYOC Products can be deployed through governed release evidence, routed through stable platform/custom domains, monitored, metered, rolled back/suspended, protected against routing/domain/runtime drift, and supplied with only tenant-scoped runtime resources rather than SmartAIHub Core credentials.


# Revision 2 Addendum — Agentic Build Provenance and Skill Dependencies

**Normative precedence:** Revision 2 addendum takes precedence for engineering provenance/dependency admission semantics.

## 66. Release Candidate Engineering Provenance

Every custom Product/Mini App release produced by agentic development SHOULD include immutable references to:

```text
source commit/tree hash
build artifact hash
DevelopmentJob
DevelopmentWorkPackage / ContextPack revision (Spec 222)
harness family/version
SmartAIHub engineering skill-pack version
Superpowers methodology version/commit when used
Product SDK/API compatibility version
Skill/Workflow/Capability dependency lock
SBOM/provenance evidence
security/test/visual-QA evidence
```

Production runtime MUST NOT need Claude/Codex/Antigravity/Hermes/Superpowers installed merely because one was used during development.

## 67. Skill Dependency Admission

Before promoting a Product release, Release Service SHALL verify that pinned/referenced SmartAIHub Skills and governed capabilities are eligible for the target Tenant/environment. Revoked/quarantined/incompatible mandatory dependencies block promotion.

## 68. Runtime Independence Principle

Engineering methodology and runtime are separate concerns:

```text
Superpowers / Coding Harness → build-time only
SmartAIHub Product Runtime   → production
```

A future change of coding harness MUST NOT require production Product migration unless generated source/contracts actually change.

# Revision 3 — Final Integrated Architecture Stress-Audit Addendum

**Normative precedence:** Revision 3 supersedes conflicting deployment/runtime mechanics. Managed cloud remains default; BYOC MUST preserve the same admission invariants.


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

## R3.2 Workers for Platforms Dispatch Invariants

For the Cloudflare managed baseline:

- use shared dispatch namespaces by environment (for example `staging`, `production`) rather than one namespace per Tenant;
- each deployable user Worker/runtime unit has immutable SmartAIHub ownership metadata;
- Dynamic Dispatch resolves hostname/path/product identity through authoritative `HostBinding`/release records;
- do not derive Tenant authorization solely from an untrusted Host header or worker name;
- staging and production namespaces MUST be isolated;
- unknown/unbound hostnames fail closed.

## R3.3 Per-Product Runtime Limits

The dispatch/release layer SHOULD enforce plan/risk-based resource controls where the runtime supports them, including CPU/subrequest/concurrency/runtime-resource budgets.

A Product cannot raise its own production limits through source code.

Limit revisions are control-plane actions and MUST be auditable.

## R3.4 Production Admission of Dependency Locks

Before promotion, Spec 219 SHALL verify the `ReleaseCandidate` dependency lock against current runtime/security policy.

Checks include:

```text
Runtime Skill not revoked/blocked
Workflow/capability versions available
Product SDK/gateway contract compatible
required runtime resources available
required secrets/connections configured
license/entitlement still valid
schema migration admission valid
economic policy present
```

A security emergency MAY block a historically valid candidate from new promotion.

## R3.5 Development/Production Separation

Cloudflare Sandbox/Container sessions used for coding, tests or preview are not production authority.

Production deployment consumes immutable build/release artifacts through the Release Service. It MUST NOT serve a developer's mutable workspace as production.

## R3.6 Runtime Resource Classes

Runtime units MAY declare governed resources such as:

```text
EDGE_REQUEST
CONTAINER_SERVICE
BACKGROUND_CONSUMER
SCHEDULED_JOB
REALTIME_SESSION
TENANT_CACHE
TENANT_COORDINATION_STATE
APPROVED_PROVIDER_NATIVE_STATE
```

Authoritative business data remains subject to Spec 220 Product Data Inventory.

For custom 3D/WebGPU products, GPU rendering normally remains client-side unless a server rendering capability is explicitly provisioned. Browser-heavy UI does not justify exposing Core storage/database credentials.

## R3.7 Custom Domain and Identity Coordination

`HostBinding` selects Tenant/Product/release routing. It MUST NOT by itself establish user identity.

Custom-domain login/session establishment is governed by Spec 220. A domain change MUST preserve canonical Tenant/Product identities rather than create new accounts/data silos.

## R3.8 BYOC Equivalence

BYOC deployment MAY change infrastructure ownership but MUST NOT bypass:

```text
ReleaseCandidate verification
dependency admission
tenant/product identity
runtime token model
audit
metering/economic attribution where applicable
kill/suspension policy
```

If the external cloud cannot enforce a mandatory control, the Product must be marked with a reduced assurance class or deployment rejected according to policy.

## R3.9 Release and Rollback Safety Under Skill Revocation

Rollback may select an older Product release only if its pinned dependencies remain eligible. The Release Service MUST NOT "fix" a Skill security revocation by rolling back to an older Product that still depends on the revoked Skill.

Emergency policy MAY:

```text
disable affected module
route to an approved equivalent
suspend new Product runs
```

while preserving historical evidence.

## R3.10 Runtime Drift Registry

Runtime provider/package/API changes MUST be tracked as compatibility inputs.

At minimum track:

```text
provider/runtime family
API/package version
documented limits
deprecation/EOL
current compatibility status
last conformance test
```

Provider drift that affects isolation, routing, limits or deployment APIs triggers targeted conformance tests before broad rollout.

## R3.11 Revision 3 Acceptance Criteria

- [ ] Production uses shared per-environment dispatch namespaces rather than namespace-per-tenant.
- [ ] Dynamic routing resolves through authoritative HostBinding/Product identity.
- [ ] Product code cannot self-raise resource limits.
- [ ] Release admission verifies Skill/Workflow/SDK/schema/economic dependencies.
- [ ] Development sandboxes never become production source of truth.
- [ ] Realtime/background/private runtime resources are inventoried and tenant-scoped.
- [ ] Custom domain routing does not replace Spec 220 identity/session checks.
- [ ] BYOC preserves release/security/audit invariants.
- [ ] Rollback cannot bypass a dependency security revocation.
