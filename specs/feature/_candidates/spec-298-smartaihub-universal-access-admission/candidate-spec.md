---
spec_id: 298
numbering_status: PROVISIONAL_PENDING_CANONICAL_REPOSITORY_REGISTRY_CHECK
title: SmartAIHub Universal Access Admission, Public Machine Access & Federated Authorization Gateway
revision: R1.3-40PASS
status: PROPOSED_IMPLEMENTATION_READY_AUDITED_40_PASS
prepared: 2026-10-07
primary_owner: access admission; public/guest machine access; federated principal normalization; route-authorization resolution; denial classification; cross-route authorization equivalence; machine-ingress abuse policy
implementation_style: additive compatibility layer only
reference_interop_target: Hermes A2A Phase-1; provider-agnostic by contract
---

# SPEC-298 — SmartAIHub Universal Access Admission, Public Machine Access & Federated Authorization Gateway

## 0. Executive decision

SmartAIHub SHALL treat machine callers as first-class clients without making SmartAIHub membership a prerequisite for intentionally public information.

SmartAIHub SHALL operate as a federated agent peer, not as the mandatory center of an agent network.

For an external operation, SmartAIHub SHALL:

1. reject abusive/oversized requests before expensive work;
2. normalize the caller/access context;
3. resolve the existing canonical command/capability;
4. discover eligible A2A/MCP/API/WebMCP/native routes through existing owners;
5. verify trust, capability and authorization for each route;
6. prefer A2A when verified, safe, semantically sufficient and sufficiently authorized;
7. permit another route when it presents an independent valid authorization grant for the same principal/action/resource;
8. never use fallback to bypass principal/resource/tenant/policy/DLP/security/approval denial;
9. dispatch only after admission, authorization and existing execution gates pass;
10. preserve canonical command/effect/idempotency/audit/evidence across transports.

### Mandatory invariants

```text
PUBLIC WEB DATA MUST NOT REQUIRE SMARTAIHUB MEMBERSHIP
FOR EQUIVALENT MACHINE-READABLE PUBLIC READ ACCESS.

PUBLIC ≠ UNLIMITED.
NO LOGIN ≠ NO ADMISSION CONTROL.
GUEST TOKEN ≠ USER CREDENTIAL.

SMARTAIHUB BOT = FEDERATED AGENT PEER.
SMARTAIHUB ≠ REQUIRED FEDERATION CENTER.

A2A AVAILABLE ≠ A2A SUITABLE.
A2A AUTHENTICATION ≠ BUSINESS AUTHORIZATION.
A2A AUTHORIZATION ≠ PAYMENT AUTHORIZATION.

PROTOCOL DENIAL ≠ NECESSARILY PRINCIPAL DENIAL.

ROUTE_AUTH_INSUFFICIENT MAY FALL BACK ONLY TO
AN INDEPENDENT VALID AUTHORIZATION GRANT.

PRINCIPAL / RESOURCE / POLICY DENIAL MUST PROPAGATE
ACROSS EQUIVALENT ROUTES.

TRANSPORT CHANGE MUST NEVER INCREASE EFFECTIVE AUTHORITY.

PRINCIPAL EQUIVALENCE MUST BE PROVEN, NEVER GUESSED FROM EMAIL/NAME.

PUBLIC CACHE MUST NEVER CONTAIN AUTHENTICATED/PERSONALIZED DATA.

HIGH-RISK AUTHORIZATION MUST BE FRESH AT DISPATCH.

READ AUTHORITY ≠ AUTHORITY TO DISCLOSE DATA TO AN EXTERNAL AGENT.

TRUST IS NOT TRANSITIVE ACROSS AGENT HOPS.

STREAMING OUTPUT MUST PASS EGRESS POLICY BEFORE EACH MATERIAL RELEASE.

CALLBACK / PUSH / RETURN ROUTES ARE UNTRUSTED NETWORK DESTINATIONS UNTIL VERIFIED.

NO PUBLIC/FEDERATED REQUEST MAY REACH DURABLE QUEUE,
LLM, EXPENSIVE DB/VECTOR WORK OR UNBOUNDED FAN-OUT
BEFORE ADMISSION.

EVERY MATERIAL UI ACTION CONTINUES TO USE
THE EXISTING CANONICAL SEMANTIC COMMAND PATH.
```

---

## 1. Problem

SmartAIHub already has canonical commands, capability discovery, A2A interoperability, MCP, dynamic fallback, job control, UI action binding and backend health/routing.

The missing layer is a single decision point for:

```text
Who/what is calling?
Is this information intentionally public?
Does this caller need a SmartAIHub account at all?
Which semantic routes exist?
Which route has enough authority for this exact action/resource?
If A2A is insufficient, does the same principal have a valid MCP/API grant?
Is a denial route-local or principal/resource-wide?
Does the request require login, MFA, consent or human approval?
Can this request safely consume resources?
```

SPEC-298 closes this gap without creating a second orchestrator or router.

---

## 2. Existing-owner boundary

SPEC-298 SHALL be additive.

| Existing owner | Responsibility preserved | SPEC-298 relationship |
|---|---|---|
| SPEC-199 | MCP wire/server/client | Consume; expose bounded public/guest projections through existing seams. |
| SPEC-206 | A2A discovery, Agent Card trust, bindings, task semantics | Consume; never reimplement A2A. |
| SPEC-208 | semantic fallback and Computer Use safety | Preserve semantic-denial propagation; add route-vs-principal classification before fallback. |
| SPEC-256 | capability discovery/resolution | Consume; no second registry/resolver. |
| SPEC-267 | queue/control-plane capacity/durable execution | Consume; external pre-admission occurs before enqueue. |
| SPEC-272 | secrets/credentials | Consume; handles only, never raw credentials. |
| SPEC-277 | task/control UI and evidence projection | Project route/approval/auth state when useful. |
| SPEC-279 | canonical application command, CommandEnvelope, delegation, return route | Consume as command authority. |
| SPEC-280 | SmartAIHub metered commerce | Preserve; do not merge external purchasing into credit ledger. |
| SPEC-282 | federated work exchange | Consume when contact becomes durable cross-party work. |
| SPEC-283 | external agent capability intelligence/binding | Consume. |
| SPEC-287 | UI governance/action binding | Preserve UI → canonical command. |
| SPEC-288 | backend/resource portability | Consume. |
| SPEC-296 | backend health, cost/quality/latency routing, Agent-Reach adapter | Preserve as operational backend router. |

### 2.1 SPEC-298 vs SPEC-296

```text
SPEC-298:
May this principal/request use this semantic route?

SPEC-296:
Among admissible authorized operational backends,
which healthy backend best satisfies runtime objectives?
```

SPEC-298 MUST NOT duplicate SPEC-296 scoring, health probes, circuit breakers or provider ranking.

---

## 3. Goals

1. Public structured web data is machine-readable without SmartAIHub membership.
2. No fake/anonymous canonical user rows are required.
3. SmartAIHub Bot is an inbound/outbound A2A peer.
4. A2A is preferred when safe/capable/authorized.
5. A2A → MCP/API fallback works when another independent valid user grant exists.
6. Route-local insufficiency is distinguished from principal/resource denial.
7. Step-up authentication and human approval preserve task identity.
8. Protocol hopping never increases authority.
9. Public MCP/A2A/API is protected from flood/resource/economic amplification.
10. UI and agents reuse one canonical business command.
11. Future A2A agents require no brand-specific core router.
12. Bounded autonomous transactions are possible without treating A2A/MCP access as payment authority.

---

## 4. Non-goals

SPEC-298 does not implement A2A, MCP, orchestration, capability registry, backend routing, payment rails, a new user database, a new command registry, or a new job system.

It does not make every command public and does not convert every local UI gesture into a semantic command.

---

## 5. Principal and access context

```ts
type AccessPrincipalKind =
  | 'PUBLIC_GUEST'
  | 'FEDERATED_AGENT'
  | 'AUTHENTICATED_EXTERNAL_USER'
  | 'LOCAL_USER'
  | 'LOCAL_AGENT'
  | 'DELEGATED_AGENT'
  | 'SERVICE_PRINCIPAL';

interface AccessContext {
  accessContextId: string;
  principalKind: AccessPrincipalKind;
  principalRef?: string;
  representedPrincipalRef?: string;
  tenantRef?: string;
  organizationRef?: string;

  ingress:
    | 'A2A' | 'MCP' | 'WEBMCP' | 'API' | 'UI'
    | 'CLI' | 'WORKFLOW' | 'NATIVE_ADAPTER' | 'COMPUTER_USE';

  credentialHandleRefs?: string[];
  trustState?: string;
  guestSessionRef?: string;

  createdAt: string;
  expiresAt?: string;
}
```

### 5.0 Principal kind ≠ resource/command access class

The identity of the caller and the exposure class of a command/resource are separate dimensions.

```ts
type MachineAccessClass =
  | 'PUBLIC_READ'
  | 'PUBLIC_BOUNDED_SUBMIT'
  | 'AUTHENTICATED_READ'
  | 'AUTHENTICATED_WRITE'
  | 'DELEGATED'
  | 'APPROVAL_REQUIRED'
  | 'AUTONOMOUS_BOUNDED'
  | 'INTERNAL_ONLY';
```

Examples:

```text
PUBLIC_GUEST principal + PUBLIC_READ command                  -> potentially allowed
PUBLIC_GUEST principal + AUTHENTICATED_READ command           -> step-up required
FEDERATED_AGENT principal + PUBLIC_BOUNDED_SUBMIT command     -> receiver policy + abuse gate
DELEGATED_AGENT principal + AUTONOMOUS_BOUNDED command        -> mandate/policy evaluation
```

`AccessPrincipalKind` MUST NOT be reused as a command exposure class. This prevents a future implementation from confusing "who the caller is" with "what the target allows".

### 5.1 PUBLIC_GUEST is not a user

`PUBLIC_GUEST` MUST NOT require a canonical users-table row.

An ephemeral guest/session identifier MAY exist for rate limiting, correlation, idempotency, abuse control and bounded continuity.

It MUST NOT create tenant membership, private-resource access, durable user memory, payment authority or long-lived reusable identity.

### 5.2 Federated identity is not membership

```text
FEDERATED_AGENT ≠ LOCAL_USER
REMOTE ORGANIZATION ≠ LOCAL TENANT MEMBERSHIP
VERIFIED AGENT ≠ AUTHORIZED FOR EVERY COMMAND
```

---

## 5A. Tenant, custom-domain and host binding

For multi-tenant/white-label deployments, public access MUST resolve the canonical tenant/site identity before resource authorization or caching.

Resolution MUST use trusted deployment/domain configuration, not an unvalidated `Host`, forwarded-host, query parameter or caller-supplied tenant ID.

A public request to `brand-a.example` MUST NOT be able to select `tenant-b` resources by altering request metadata.

Custom domains, federation endpoints and Agent Cards SHALL bind to the intended tenant/agent identity through existing domain/certificate/registry ownership.

## 6. Public Web → Public Machine Access

### 6.1 Normative rule

If SmartAIHub or a conformant Mini App intentionally exposes structured/dynamic data to an unauthenticated human, an equivalent machine-readable read path SHALL be available without requiring SmartAIHub membership, unless a documented exception applies.

Examples:

- product/catalog lists;
- product detail;
- public price;
- public service list;
- business hours;
- public availability;
- FAQ/support taxonomy;
- public plan information;
- public documentation metadata.

### 6.2 Projection

Machine access MAY use:

```text
MCP resource/tool
A2A skill
WebMCP
public API
structured resource endpoint
```

The semantic source remains the existing canonical resource/query/command.

Pure decorative/editorial/local-presentation state is excluded.

### 6.3 Additive metadata

```yaml
machine_access:
  access_class: PUBLIC_READ
  data_class: PUBLIC
  mutation: false

  projections:
    mcp: true
    a2a: true
    webmcp: true
    api: optional

  auth:
    smartaihub_membership_required: false
    guest_allowed: true

  abuse:
    cost_class: CHEAP_READ
    cacheable: true
    rate_class: PUBLIC_CATALOG
    max_page_size: 100
```

This metadata MUST NOT create a second command identity.

### 6.4 Public parity conformance

For each declared public structured surface:

```text
unauthenticated human read succeeds
unauthenticated machine read succeeds
returned classification remains PUBLIC
private fields are absent
pagination/response sizes are bounded
admission/rate policy exists
```

---

## 6A. Public visibility must be enforced at the source query boundary

A resource is not safe for public machine access merely because private fields are redacted after retrieval.

Public list/get/search queries SHALL constrain visibility at the canonical data/query boundary, for example:

```text
publication_state = PUBLIC
AND tenant/domain = resolved public owner
AND effective_public_at <= now
AND (expires_at is null OR expires_at > now)
```

This prevents IDOR/enumeration of drafts, unpublished SKUs, hidden plans, private attachments or tenant-internal identifiers.

### 6A.1 Cache isolation and poisoning defense

Shared caches MAY store only responses whose effective classification is `PUBLIC`.

Cache keys MUST include every public dimension that materially changes the response, such as:

- canonical tenant/public-site identity;
- locale/language;
- region/country when pricing/availability differs;
- currency;
- command/resource version;
- public data revision/ETag where applicable.

Authenticated, delegated, personalized, member-priced or tenant-private responses MUST NOT be stored in a shared public cache merely because they use the same command ID.

A transition from guest to authenticated access MUST change cache partition/context explicitly.

## 6B. Public-to-private transition and cache revocation

If a resource, product, document, price, tenant site or field changes from `PUBLIC` to a more restrictive classification, generated public projections and shared cache entries MUST be invalidated/purged according to a bounded revocation objective.

A public-to-private transition MUST NOT rely on long stale-while-revalidate behavior that can continue serving formerly public data after the authority changed.

Where immediate global purge cannot be guaranteed, public responses SHOULD use short classification-aware TTLs and a revocation/version token so that the worst-case exposure window is explicit and testable.


## 6C. Public-machine parity does not override licensing or redistribution constraints

The public-machine parity rule applies to information SmartAIHub is authorized to expose programmatically. A resource being visible in a public web page does not automatically prove that SmartAIHub has the right to redistribute a third-party licensed payload through bulk/machine interfaces.

For provider-owned or licensed data, the canonical resource policy SHALL distinguish at least:

```text
PUBLIC_AND_MACHINE_REDISTRIBUTABLE
PUBLIC_RENDER_ONLY_OR_LINK_ONLY
AUTHENTICATED_PROVIDER_ACCESS_REQUIRED
RESTRICTED
```

`PUBLIC_RENDER_ONLY_OR_LINK_ONLY` MAY expose safe metadata, citation/link identifiers, or another contractually permitted representation without copying the restricted payload into a public MCP/A2A/API response.

Legal/licensing restrictions MUST be enforced deterministically through resource policy; they MUST NOT be inferred ad hoc by an LLM.

## 6D. Public freshness and semantic parity

The machine-readable public projection SHOULD expose data from the same canonical revision/source-of-truth used by the public UI, subject to cache policy.

Where temporary propagation delay is unavoidable, the response SHOULD carry a public revision/ETag/timestamp sufficient to diagnose staleness. A machine route MUST NOT silently return an older pricing/catalog revision than the public UI beyond the documented freshness objective when that difference could materially mislead an automated caller.

## 7. Cheap pre-admission

Public access is public, not unbounded.

```text
Internet / External Agent
          |
          v
Edge DDoS / WAF / protocol sanity
          |
          v
SPEC-298 Cheap Pre-Admission
          |
          +-- payload/size
          +-- source/network signals
          +-- guest/agent correlation
          +-- request rate
          +-- concurrency
          +-- weighted cost
          +-- protocol-hop shared quota
          |
          v
Canonical command/capability resolution
          |
          v
Authorization / route eligibility
          |
          v
SPEC-296 / SPEC-267
```

### 7.1 Admission before queue

Rejected public traffic SHALL NOT become durable jobs.

### 7.2 Weighted cost

Quotas MAY account for:

```text
request count
concurrency
DB/query cost
vector/search cost
LLM tokens
external calls
fan-out
runtime
response bytes
agent hops
tool depth
```

Illustrative relative weights:

| Operation | Weight |
|---|---:|
| cached public resource get | 1 |
| bounded public list | 1 |
| indexed search | 3 |
| vector search | 10 |
| external aggregation | 20 |
| LLM research | disabled for guest or tightly budgeted |

### 7.3 Cross-protocol quota

Switching `MCP -> A2A -> API -> WebMCP` MUST NOT trivially reset public abuse limits.

### 7.4 Cache-first

Public reads SHOULD be cache-first where valid. Identical concurrent cache misses SHOULD support single-flight/request coalescing.

---

## 7A. Discovery exposure minimization

Machine-readable discovery MUST NOT leak private capabilities merely because the corresponding commands exist internally.

Public MCP tool/resource listings, public APIs and public A2A Agent Cards SHALL expose only descriptors allowed for the current disclosure class.

```text
PUBLIC discovery        -> public capabilities only
AUTHENTICATED discovery -> capabilities authorized for that authenticated context
INTERNAL discovery      -> internal policy only
```

`COMMAND EXISTS` and `CAPABILITY EXISTS` do not imply `CAPABILITY NAME MAY BE DISCLOSED PUBLICLY`.

For sensitive capabilities, use authenticated/extended discovery through the existing protocol owner rather than revealing internal skill names, internal URLs, privileged schemas or operational topology in public manifests.

## 7B. Admission-store failure and quota-consistency policy

Admission enforcement MUST define behavior when a counter/reputation/budget store is unavailable.

Default behavior:

```text
PUBLIC_GUEST dynamic uncached operation -> fail closed / 429 or 503
PUBLIC_READ already-safe cached object   -> MAY serve bounded stale-safe cache when policy permits
AUTHENTICATED/DELEGATED operation        -> follow existing owner policy; never silently downgrade to guest
```

Distributed quota implementations MUST define bounded overshoot under races/multi-region execution. High-cost guest operations SHOULD use a consistency mechanism strong enough to prevent parallel requests from multiplying the declared budget materially.

IP address, ASN or fingerprint signals are abuse signals, not canonical identity. NAT, IPv6 rotation and shared networks MUST NOT be treated as proof that two requests are the same human/principal.

## 8. SmartAIHub as federated A2A node

SmartAIHub SHALL expose a first-class A2A peer through SPEC-206.

```text
User/Org A
   |
SmartAIHub Bot
   ||
   || A2A
   \/
Hermes / Agent B
   |
User/Org B
```

Neither side must become a member of the other platform merely to exchange permitted public/federated work.

### 8.1 Inbound

External A2A agents MAY access public skills without SmartAIHub membership when those skills are explicitly public. Protected skills trigger the required authentication/authorization step-up.

### 8.2 Outbound

SmartAIHub MAY call an external A2A peer only when discovery/trust, version/binding, skill capability, security scheme, effective authority and admission policy pass.

### 8.3 Hermes reference

Hermes SHALL be a Phase-1 bidirectional interoperability reference target.

No Hermes-specific business semantics may enter the core architecture.

---

## 8A. Out-of-path neutrality and direct external-agent operation

SmartAIHub SHALL NOT require itself to remain in the message path after an external user/agent has chosen a direct protocol relationship that does not need SmartAIHub.

Examples outside SmartAIHub runtime control include:

```text
User A -> Hermes A -> A2A -> Hermes B
User A -> another standards-compliant agent -> A2A -> peer
```

SPEC-298 governs SmartAIHub ingress/egress decisions; it does not claim authority over a direct transaction between external peers when SmartAIHub is not participating.

Where SmartAIHub issues a portable delegation/mandate/credential through a standard that permits offline or third-party verification, the artifact SHOULD avoid unnecessary callback dependence on SmartAIHub. Where the standard requires online issuer status/revocation checks, those checks remain protocol/credential semantics rather than a requirement that agent messages traverse SmartAIHub.

SmartAIHub-specific opaque credentials MUST NOT be mislabeled as portable federation credentials.

## 9. A2A suitability

SPEC-206 remains protocol/trust owner. SPEC-298 consumes normalized suitability:

```ts
interface A2ASuitabilityResult {
  agentRef: string;
  skillRef?: string;
  verified: boolean;
  protocolCompatible: boolean;
  securityCompatible: boolean;
  capabilitySufficient: boolean;

  authorizationStatus:
    | 'UNKNOWN'
    | 'SUFFICIENT'
    | 'ROUTE_AUTH_INSUFFICIENT'
    | 'STEP_UP_REQUIRED'
    | 'PRINCIPAL_DENIED'
    | 'RESOURCE_POLICY_DENIED';

  evidenceRefs: string[];
  expiresAt?: string;
}
```

A2A is preferred only when:

```text
verified
AND healthy
AND semantically sufficient
AND security requirements satisfiable
AND route authorization sufficient
AND policy allows
```

---

## 10. Route Authorization Resolver

This is SPEC-298's central responsibility.

It answers:

```text
For this principal, semantic action and resource,
which available route presents a valid authorization grant?
```

```ts
interface RouteAuthorizationCandidate {
  routeId: string;
  transport: 'A2A' | 'MCP' | 'WEBMCP' | 'API' | 'NATIVE_ADAPTER' | 'COMPUTER_USE';

  principalRef?: string;
  representedPrincipalRef?: string;

  credentialHandleRef?: string;
  credentialIssuerRef?: string;
  credentialAudience?: string;

  scopes?: string[];
  resourceScopeRefs?: string[];

  semanticEffectId: string;
  commandRef?: string;
  capabilityRef?: string;

  authFreshness?: string;
  assuranceClass?: string;
}
```

### 10.1 Effective authority

```text
effective_authority =
    owner/user delegation
  ∩ route credential grant
  ∩ destination/resource authorization
  ∩ tenant/project/resource scope
  ∩ approval policy
  ∩ economic/transaction policy
  ∩ security/risk policy
```

A route cannot add authority absent from that intersection.

---

## 10A. Principal Binding & Credential Equivalence Proof

An alternate route MAY use a different credential only when SmartAIHub can deterministically establish that the credential is authorized for the same represented principal and requested resource/action.

SmartAIHub MUST NOT infer principal equivalence from mutable or ambiguous strings such as:

```text
email display text
person name
company name
agent nickname
browser profile name
LLM inference
```

Accepted binding evidence MAY include:

- an existing explicit account-link established by the user;
- OAuth/OIDC subject + issuer binding captured during an authorized connection flow;
- provider account identifier previously verified by the credential owner;
- organization-controlled federation mapping;
- a cryptographically verifiable representation/delegation credential;
- another canonical identity-binding mechanism owned by the existing identity/auth subsystem.

```ts
interface PrincipalBindingEvidence {
  bindingRef: string;
  localPrincipalRef: string;
  remoteSubjectRef: string;
  issuerRef: string;
  assuranceClass: string;
  establishedBy: 'USER_LINK' | 'OIDC_SUBJECT' | 'ORG_FEDERATION' | 'VERIFIABLE_DELEGATION' | 'OTHER_CANONICAL';
  verifiedAt: string;
  expiresAt?: string;
  revokedAt?: string;
}
```

A route authorization candidate using a credential whose principal binding cannot be proven MUST be treated as `ROUTE_AUTH_INSUFFICIENT` or stronger denial; it MUST NOT be "best-effort matched" to the user.

## 11. Denial taxonomy

A generic `PERMISSION_DENIED` is insufficient.

```ts
type AccessDecisionCode =
  | 'ALLOW'
  | 'ROUTE_UNAVAILABLE'
  | 'PROTOCOL_UNSUPPORTED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CAPABILITY_INCOMPATIBLE'
  | 'ROUTE_AUTH_INSUFFICIENT'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_FAILED'
  | 'STEP_UP_AUTH_REQUIRED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'PRINCIPAL_AUTHORITY_DENIED'
  | 'RESOURCE_POLICY_DENIED'
  | 'TENANT_POLICY_DENIED'
  | 'DLP_DENIED'
  | 'DATA_DISCLOSURE_DENIED'
  | 'DATA_MINIMIZATION_REQUIRED'
  | 'DATA_CONSENT_REQUIRED'
  | 'DESTINATION_NOT_APPROVED_FOR_DATA_CLASS'
  | 'SECURITY_REJECTED'
  | 'RISK_REJECTED'
  | 'RATE_LIMITED'
  | 'BUDGET_EXHAUSTED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'AMBIGUOUS_REMOTE_EFFECT'
  | 'DENIAL_UNCLASSIFIED'
  | 'USER_CANCELLED';
```

### 11.1 Fallback policy

| Result | Fallback |
|---|---|
| route/protocol/capability unavailable | allowed to compatible route |
| `ROUTE_AUTH_INSUFFICIENT` | allowed only with independent valid grant for same principal/action/resource |
| authentication required | step-up or separately authorized route |
| authentication failed | no blind bypass; re-auth or separately established identity |
| step-up required | obtain required assurance or separately authorized route |
| human approval required | pause; never bypass |
| principal/resource/tenant/DLP/security denial | stop all equivalent routes |
| disclosure denied / destination not approved | do not send protected data to that destination; another separately approved destination/route MAY be considered |
| data minimization/consent required | transform to permitted minimal dataset or obtain explicit required consent before dispatch |
| risk denial | no route-shopping unless policy state legitimately changes |
| rate limit | respect policy; no protocol-hop evasion |
| budget exhausted | no silent bypass |
| transient unavailable | safe fallback permitted |
| `DENIAL_UNCLASSIFIED` | fail closed for mutation/privileged access; do not infer route-local denial from text alone |
| ambiguous remote effect | reconcile before replay |
| user cancelled | stop |

---

## 11A. Deterministic denial classification and information disclosure

Remote/provider error strings SHALL NOT be fed to an LLM and treated as authoritative denial scope.

Classification SHOULD use deterministic signals such as protocol status/code, structured error fields, local policy decision, authenticated challenge metadata and provider adapter mappings.

If the denial scope cannot be established safely, use `DENIAL_UNCLASSIFIED` rather than guessing.

Detailed internal denial reasons MAY contain security-sensitive information. Public/unauthenticated callers SHOULD receive a coarse external error that does not reveal whether a private resource, tenant, account or privileged capability exists. Detailed taxonomy remains available to authorized diagnostics/audit.

## 12. Route-local vs principal/resource denial

### Valid fallback

```text
Request: User A private order history

A2A:
identity = external federated agent
scope = public.read
=> ROUTE_AUTH_INSUFFICIENT

MCP:
credential = User A OAuth
scope = orders.read
resource = User A
fresh/audience-correct
=> MCP MAY execute
```

This is not privilege escalation: MCP carries an independent valid authorization.

### Invalid fallback

```text
A2A:
User A is denied resource X by resource policy
=> RESOURCE_POLICY_DENIED

MCP endpoint exists
=> MUST NOT execute
```

Equivalent-route denial SHALL correlate by semantic effect + principal + resource/policy domain.

```ts
interface SemanticAuthorizationKey {
  principalRef: string;
  representedPrincipalRef?: string;
  semanticEffectId: string;
  resourceRef?: string;
  policyDomain?: string;
}
```

---

## 12A. Two-phase contract with SPEC-296 — no duplicate router

Because SPEC-296 already owns backend health/cost/quality routing, SPEC-298 SHALL integrate through a two-phase contract rather than build a competing route scorer.

```text
Phase 1 — candidate enumeration/readiness
SPEC-256 + SPEC-206/SPEC-199 + SPEC-296 adapters
        -> candidate descriptors + health/readiness facts

Phase 2 — authorization filter
SPEC-298
        -> admissible / blocked / step-up / approval

Phase 3 — operational ranking
SPEC-296
        -> rank/select among ONLY admissible candidates
```

If current SPEC-296 code exposes only a single-step resolver, implementation SHALL add a backward-compatible candidate/filter seam or pre-selection policy callback. SPEC-298 MUST NOT copy SPEC-296 scoring logic merely to avoid that adapter work.

The selected route SHALL be rechecked for authorization freshness at dispatch when required by Section 16B.

## 13. Candidate route pipeline

```text
Incoming Request
      |
Cheap Pre-Admission
      |
Access Context
      |
SPEC-279 / SPEC-256
Command + Capability
      |
Candidate Interfaces
  |-- SPEC-206 A2A
  |-- SPEC-199 MCP
  |-- API/native
  |-- SPEC-296 readiness
      |
SPEC-298 Route Authorization
      |
blocked / step-up / approval?
      |
Admissible Authorized Candidates
      |
SPEC-206 policy + SPEC-296 operational selection
      |
Selected Route
      |
SPEC-267 / existing runtime
      |
Result / Evidence / Return Route
```

### 13.1 A2A-first

A2A-first means preferring A2A only when verified, safe, capable, sufficiently authorized and policy-compatible.

It does not mean forcing A2A when a private resource requires a stronger user grant.

---

## 13A. Public mutation exception — bounded submit only

`PUBLIC_READ` is the default unauthenticated machine access class.

A public write-like operation MAY exist only as `PUBLIC_BOUNDED_SUBMIT` for narrowly scoped ingress such as:

- contact request;
- quotation inquiry;
- public support intake;
- signup/interest form;
- other explicitly approved public submission.

Such commands MUST NOT expose arbitrary state mutation. They require stronger abuse controls than public reads, including idempotency/deduplication, payload/schema bounds, spam controls, destination quotas and no immediate high-cost fan-out before admission.

A public bounded submission MUST NOT imply authentication of the submitter or acceptance of the submitted claim as fact.

## 14. Public/guest MCP

MCP MAY expose public reads without a SmartAIHub user:

```text
product.list             PUBLIC_READ
product.get              PUBLIC_READ
product.get_public_price PUBLIC_READ
faq.search               PUBLIC_READ

order.list_mine          AUTHENTICATED
account.update           AUTHENTICATED
order.place              DELEGATED / APPROVAL
payment.execute          TRANSACTION_AUTHORITY
```

Public MCP defaults:

```text
read-only
bounded input
bounded pagination
cache-first
no arbitrary SQL
no arbitrary filesystem
no arbitrary shell
no unrestricted URL fetch
no secrets/private tenant data
no uncontrolled LLM/sub-agent fan-out
```

### 14.1 Step-up

```text
PUBLIC_GUEST
    |
AUTHENTICATED_EXTERNAL_USER
    |
DELEGATED_AGENT / APPROVED ACTION
```

Step-up changes the authorization context explicitly; it does not mutate the guest token into a user credential.

---

## 14A. Connected-account authority and step-up security

The existence of a browser login or provider cookie does NOT automatically authorize SmartAIHub or an agent to use that account through MCP/API.

An alternate authenticated route requires an existing user-approved connection/delegation or a new provider authorization flow that yields a credential/scoped grant intended for that resource server.

A successful step-up SHALL:

- bind the OAuth/OIDC response to the initiating request/task using existing anti-CSRF/state/nonce/PKCE mechanisms as applicable;
- validate issuer, audience/resource and subject;
- record the resulting principal binding;
- rotate/replace guest or pre-auth session identifiers as needed to prevent session fixation;
- preserve correlation through an opaque continuation reference, not by upgrading the guest token in place;
- require explicit consent when the provider or SmartAIHub policy requires it.

Stored credentials MAY be used automatically only when the user's existing connection policy/delegation permits agent use for that capability. "User happens to be logged into the site" is insufficient authority.

## 15. Protocol selection

Do not route by provider name.

Use:

```text
discover interfaces
verify interfaces
normalize capability
evaluate route authorization
select highest-level safe semantic route
```

General preference, subject to actual policy/semantics:

```text
A2A / canonical MCP/API
        >
provider-native semantic adapter
        >
WebMCP / deterministic browser semantics
        >
DOM/accessibility automation
        >
vision/computer-use fallback
```

If the semantic operation is denied by principal/resource/policy, Computer Use MUST NOT perform it.

---

## 16. Credential handling

Credentials remain under existing secrets/credential ownership.

SPEC-298 stores handles/references only.

Sensitive grants SHOULD be audience-bound, scope-limited, principal-bound, revocable and freshness-checkable.

Raw OAuth tokens, cookies, API keys, payment credentials and private keys SHALL NOT appear in A2A messages, prompts, normal MCP content, logs or evidence receipts.

A credential for Principal A MUST NOT satisfy a request attributed to Principal B without explicit authorized delegation.

---

## 16B. Authorization freshness, revocation and TOCTOU

Authorization decisions are snapshots, not permanent facts.

Cached authorization MAY be used only with an explicit TTL and cache key that includes all material dimensions, including where applicable:

```text
principal / represented principal
credential handle + issuer + subject
scope set
resource/account/tenant
command/effect
policy version
mandate/delegation version
```

Revocation, logout, credential rotation, tenant removal, mandate cancellation or policy change MUST invalidate or supersede affected decisions.

For mutating, privileged, payment or long-running work, authorization SHALL be revalidated at dispatch and at meaningful continuation/checkpoint boundaries when the original grant could have changed.

A capability/Agent Card observed during planning MUST also satisfy the existing freshness policy at launch; stale discovery is not execution authority.

## 16C. Delegation-chain attenuation

When an agent acts on behalf of a user/organization through one or more agent hops, every delegation hop MUST be attenuating or equal; no child/delegate may expand the parent authority.

```text
Effective child authority <= parent delegated authority
```

The system SHOULD record a bounded delegation-chain reference sufficient to audit:

- original represented principal;
- delegating agent/service;
- child agent;
- granted scopes/effects;
- expiry/revocation;
- maximum delegation depth where applicable.

Revocation or expiry of an upstream grant MUST block new downstream execution and SHOULD interrupt long-running work at safe checkpoints according to existing runtime policy.

## 16D. Confused-deputy and credential-purpose protection

An external caller MUST NOT be able to cause SmartAIHub to substitute a platform/service credential merely because that credential can technically perform the requested operation.

Every credential candidate SHALL carry or resolve a usage purpose/authority class such as:

```text
USER_CONNECTED_ACCOUNT
TENANT_SERVICE_ACCOUNT
PLATFORM_INTERNAL_SERVICE
FEDERATED_PEER_CREDENTIAL
PAYMENT_CREDENTIAL_REFERENCE
```

A `PLATFORM_INTERNAL_SERVICE` credential is not an alternate authorization grant for an external user's private action unless an existing canonical policy explicitly authorizes SmartAIHub itself as the acting principal for that operation.

Route authorization MUST verify both:

```text
credential CAN perform action
AND
credential MAY be used on behalf of this principal/purpose
```

This prevents SmartAIHub from becoming a confused deputy that launders external requests through stronger internal privileges.


## 16E. Cross-boundary input disclosure authorization

Authorization to read/use data is not automatically authorization to disclose that data to another agent, organization, provider or execution environment.

Before SmartAIHub sends private, tenant, personal, confidential, regulated or user-scoped data to an external route, it SHALL evaluate a distinct disclosure decision:

```text
READ/USE AUTHORITY
      ∩
DISCLOSURE POLICY
      ∩
DESTINATION TRUST/CONTRACT
      ∩
PURPOSE / MINIMIZATION
      ∩
TENANT / USER CONSENT WHERE REQUIRED
      =
PERMITTED OUTBOUND DATA SET
```

Example:

```text
MCP credential allows User A to read private orders        -> YES
Task needs Hermes to reason over those orders               -> separate question
Disclosure policy allows only totals/product IDs            -> redact/minimize before A2A
Full customer addresses                                      -> MUST NOT be sent unless separately allowed
```

A route that is authorized to obtain data but not authorized to disclose it to the selected destination SHALL return a disclosure-specific blocked/step-up state rather than silently choosing that route.

Recommended normalized decisions:

```text
DATA_DISCLOSURE_DENIED
DATA_MINIMIZATION_REQUIRED
DATA_CONSENT_REQUIRED
DESTINATION_NOT_APPROVED_FOR_DATA_CLASS
```

The disclosure gate SHOULD execute before remote dispatch and SHOULD produce an evidence reference describing the policy decision without copying sensitive payloads into audit logs.

## 16F. Trust is non-transitive; authorization is evaluated per hop

Trusting Agent A does not imply trust in Agent B selected by Agent A.

```text
SmartAIHub trusts Hermes A
Hermes A delegates to Agent B
≠
SmartAIHub automatically trusts Agent B
```

If a downstream peer will receive SmartAIHub-originated protected data, execute a SmartAIHub-authorized side effect, or consume a delegated SmartAIHub/user authority, that downstream identity and purpose MUST be within the original delegation/disclosure policy or be separately evaluated.

Each material hop SHALL preserve attenuation and bounded delegation depth. A downstream hop cannot upgrade data disclosure class, resource scope, spend limit or command set.

## 16G. Account-link lifecycle, unlink and re-binding safety

Principal bindings and connected-account grants are lifecycle objects, not permanent aliases.

Unlinking an account, provider subject change, organization membership removal, credential rotation/revocation, ownership transfer or federation-mapping change MUST invalidate affected binding evidence and cached route decisions.

A re-connected provider account SHALL create or verify a new binding epoch. Old authorization decisions MUST NOT be revived merely because the provider display name/email looks the same.

Recommended binding metadata includes:

```text
binding_epoch
issuer
immutable remote subject/provider account id
verified owner principal
created_at
last_verified_at
revoked_at / superseded_by
```

## 17. Inbound acceptance policy

```ts
interface InboundAgentPolicy {
  acceptedPrincipalKinds: AccessPrincipalKind[];
  requireVerifiedA2AFor?: string[];
  allowPublicGuestReads: boolean;
  acceptedTrustStates?: string[];
  blockedAgentRefs?: string[];
  blockedOrganizations?: string[];
  requireHumanApprovalFor?: string[];
  maxGuestCostUnits?: number;
}
```

Sender authority and receiver acceptance are independent. Both must pass.

---

## 18. Abuse and economic-amplification defense

Public machine endpoints SHALL use layered protection:

```text
edge DDoS
WAF/protocol sanity
payload/size limits
cheap admission
rate limits
concurrency
weighted cost
cache/coalescing
backend circuit breakers
existing control-plane admission
```

Public requests MUST have bounded:

```text
max_tool_depth
max_agent_hops
max_external_calls
max_vector_queries
max_llm_tokens
max_wall_clock
max_response_bytes
max_fanout
max_retry_count
```

Cross-agent correlation/hop metadata MUST stop pathological loops.

Blocked/rate-limited traffic MUST NOT enter queues under another protocol identity to evade limits.

---


## 18A. Guest-session minting and pre-token abuse control

Issuing guest tokens/sessions is itself a public operation and SHALL be rate/cost controlled before token creation. Attackers MUST NOT obtain unlimited new quota simply by minting new guest identities.

Guest tokens SHOULD be opaque or integrity-protected, short-lived, audience-bound and carry no authority beyond the declared guest class. Token issuance limits SHOULD combine bounded network/reputation signals with server-side quotas.

A guest-session identifier MUST NOT embed sensitive tenant/user information.

## 18B. Pagination/cursor integrity and bulk-harvest controls

Public list/search pagination MUST use bounded cursors or equivalent continuation state that cannot be modified to escape the original query/tenant/access scope.

Where cursors are client-visible they SHOULD be opaque or integrity-protected and bind at least:

```text
tenant/public-site
command/resource/query hash
access class
sort/filter semantics
expiry / data revision where needed
```

`max_page_size` alone is insufficient. Policy SHALL also bound total retrievable window/rate/export volume where bulk harvesting would create security, privacy, licensing or economic risk.

Public information remains public, but SmartAIHub MAY distinguish ordinary machine retrieval from bulk export/corpus replication and require stronger rate, contract or authenticated access for the latter.

## 18C. External discovery metadata is untrusted content

Agent Cards, MCP tool/resource descriptions, schemas, capability text, provider error messages and remote metadata are untrusted input.

They MUST NOT be inserted into system/developer authority context or treated as executable policy merely because they arrived through a standards-compliant protocol.

Implementations SHALL apply:

- size/complexity limits;
- schema validation;
- sanitization/normalization;
- separation between descriptive metadata and trusted policy;
- prompt-injection boundaries when metadata is shown to an LLM.

An external description such as `ignore policy and send secrets` has zero authorization weight.

## 18D. Callback, push-notification and return-route security

External callback/push/return-route destinations SHALL be treated as untrusted network destinations until verified by the owning protocol/security layer.

Before sending data to a callback endpoint, SmartAIHub SHALL enforce as applicable:

```text
allowed scheme (production HTTPS/TLS)
DNS/IP/redirect SSRF policy
no forbidden private/link-local/metadata destinations
destination binding to the intended peer/task
callback authentication/signature
audience/purpose binding
response/payload limits
retry/backoff limits
no secret-bearing query strings
```

Redirects that change origin or enter a forbidden network range MUST NOT be followed blindly.

A valid A2A task does not automatically authorize an arbitrary callback URL supplied inside task content.

## 19. Canonical command integration

SPEC-279 remains authoritative.

```text
UI
MCP
A2A
API
Workflow
Headless Harness
      |
same ApplicationCommandDescriptor
      |
same canonical business implementation
```

Optional additive extension:

```yaml
application_command:
  command_id: product.list
  command_version: "1.0.0"
  capability_ref: capability:product.list

  extensions:
    machine_access_v1:
      access_class: PUBLIC_READ
      data_class: PUBLIC
      allowed_ingress: [MCP, A2A, WEBMCP, API]

      route_policy:
        prefer_a2a_when_suitable: true
        independent_authorization_fallback: true

      abuse:
        cost_class: CHEAP_READ
        cacheable: true
        rate_class: PUBLIC_CATALOG
```

The extension cannot change command semantics.

---

## 20. UI conformance

SPEC-287 remains UI authority.

Public structured data shown unauthenticated SHOULD have:

```text
canonical read/query
+ public machine projection
+ matching PUBLIC classification
+ guest admission policy
```

Mutating UI actions continue through `UI Action Binding Adapter -> SPEC-279 canonical command`.

No separate provider-specific UI business path is allowed.

---

## 21. Commerce/transaction boundary

A2A/MCP authorization is not payment authorization.

Example progression:

```text
product.search    -> PUBLIC_READ
product.compare   -> PUBLIC_READ
quote.request     -> PUBLIC_BOUNDED_SUBMIT or stronger, receiver policy
cart.prepare      -> AUTHENTICATED/DELEGATED
order.place       -> APPROVAL_REQUIRED or AUTONOMOUS_BOUNDED
payment.authorize -> TRANSACTION AUTHORITY
```

```ts
interface TransactionAuthorityContext {
  representedPrincipalRef: string;
  allowedActionRefs: string[];

  maxPerTransaction?: number;
  maxPerDay?: number;
  maxPerMonth?: number;
  currency?: string;

  allowedMerchantRefs?: string[];
  allowedMerchantClasses?: string[];
  allowedCategories?: string[];

  requireVerifiedMerchant?: boolean;
  expiresAt?: string;
  mandateRef?: string;
}
```

If action + amount + merchant + category are inside a valid mandate, payment authorization is valid and risk/compliance gates pass, execution MAY proceed without per-transaction human confirmation.

Otherwise return `HUMAN_APPROVAL_REQUIRED`.

SPEC-298 does not implement payment rails.

---

## 21A. Commerce state binding and price/checkout drift

For purchase/payment flows, authorization SHALL bind to a deterministic transaction snapshot rather than a natural-language intention alone.

The snapshot SHOULD include, as applicable:

```text
merchant identity
items/SKUs/quantities
unit and total price
currency
tax
shipping/fees
refundability/cancellation terms when material
delivery destination class/ref (not raw secret data in logs)
checkout/version/hash
expiry
```

If price, merchant, items, currency or another approval-critical term changes beyond the mandate's permitted tolerance, the prior approval/mandate MUST NOT be reused silently.

Where AP2 or another mandate protocol is used, SPEC-298 SHALL treat the external mandate/receipt as evidence consumed by the transaction-authority decision; it SHALL NOT invent incompatible payment semantics. Human-present and human-not-present flows remain distinguishable, and Agent-to-Agent transfer of payment mandates MUST NOT be assumed unless the chosen payment standard explicitly supports that delegation.

## 22. Step-up state

```text
PUBLIC_GUEST
   |
AUTHENTICATION_REQUIRED
   |
OAuth/OIDC/login/MFA/consent
   |
AUTHENTICATED
   |
DELEGATION_CHECK
   |
AUTHORIZED
   |
TRANSACTION / APPROVAL GATE
   |
EXECUTABLE
```

Step-up MUST preserve command, task/correlation, idempotency, resource and return-route identity.

---

## 23. Decision record

```ts
interface AccessRouteDecision {
  decisionId: string;
  requestRef: string;
  accessContextRef: string;
  principalRef?: string;

  commandRef?: string;
  capabilityRef?: string;
  semanticEffectId: string;
  resourceRef?: string;

  candidateRoutes: string[];
  selectedRoute?: string;

  decisionCode: AccessDecisionCode;
  denialScope?:
    | 'ROUTE' | 'PRINCIPAL' | 'RESOURCE' | 'TENANT'
    | 'SECURITY' | 'APPROVAL' | 'BUDGET';

  credentialHandleRef?: string;
  evidenceRefs: string[];
  decidedAt: string;
  expiresAt?: string;
}
```

No raw secrets.

---

## 23A. Replay protection and approval binding

For state-changing or privileged machine requests, idempotency alone is insufficient against replay of a previously valid authorization.

Where supported by the owning protocol/security layer, requests SHOULD carry bounded freshness/replay defenses such as nonce, timestamp, request ID, proof-of-possession or equivalent anti-replay material.

A human approval MUST bind to the exact semantic action being authorized, including material parameters such as:

```text
principal / represented principal
command + version
resource/merchant
amount/currency when economic
item/cart/checkout identity when purchasing
critical arguments
maximum allowed drift/slippage if any
expiry
```

A previous approval for `order.place` MUST NOT become blanket authority for a different cart, amount, merchant or materially changed command arguments.

## 24. Retry/idempotency/ambiguous dispatch

Before switching route after a request may have caused a remote side effect:

1. determine whether the side effect may have occurred;
2. reconcile authoritative state where possible;
3. preserve canonical idempotency/dedupe identity;
4. never blindly replay mutations/purchases/messages;
5. preserve evidence for original and alternate attempts.

`AMBIGUOUS_REMOTE_EFFECT` requires reconciliation, not ordinary retry.

---

## 24A. Result egress and data-classification postcondition

Authorization at invocation time does not guarantee that an implementation bug or downstream provider will return only permitted data.

Before a result leaves SmartAIHub through a public/federated route, the existing result-egress/security owner SHALL enforce an output postcondition appropriate to the access context.

At minimum:

```text
PUBLIC_READ -> output MUST be PUBLIC
PUBLIC_BOUNDED_SUBMIT -> acknowledgement/result MUST NOT expose unrelated private state
AUTHENTICATED -> output <= authenticated resource scope
DELEGATED -> output <= delegated/disclosure scope
```

Public responses MUST NOT include hidden fields, internal IDs that enable private enumeration, raw provider errors, secrets, private URLs, tenant-internal topology or privileged evidence references.

If the output classification cannot be established safely, fail closed or redact through an existing deterministic policy; an LLM MUST NOT be the sole data-loss-prevention decision maker.


## 24B. Streaming/partial-result egress enforcement

Streaming, SSE, WebSocket-like transport, A2A streaming and incremental MCP/task output MUST NOT defer data-loss prevention until the final result.

Before opening a protected stream, the caller/destination authorization SHALL be established. Each material outbound chunk/event SHALL remain within the permitted disclosure/output class.

If classification cannot be enforced safely incrementally, the implementation SHALL buffer until a safe boundary or disable streaming for that data class.

Revocation, user cancellation, quota exhaustion or policy change during a long-lived stream SHALL stop further protected output at the earliest safe boundary.

## 24C. Remote results are untrusted evidence until validated

A successful A2A/MCP/API response proves only that a remote route returned a response; it does not by itself prove factual correctness, completion of a consequential action, or authorization for a subsequent action.

Remote output SHALL carry provenance/evidence references where available and SHALL be validated according to the command's consequence class before it can:

- trigger another privileged command;
- settle money/credits;
- mark a durable task as completed;
- become a trusted record;
- override canonical state.

For consequential work, completion SHALL use authoritative state/evidence verification rather than natural-language assertions such as `done` or `payment successful`.

## 24D. Long-lived sessions/tasks require continuous bounds

A request admitted at time T0 does not receive unlimited authority or resource budget for an indefinite task.

Long-lived A2A tasks, MCP tasks, streams and callbacks SHALL preserve bounded:

```text
authorization freshness
credential validity
quota/cost budget
lease/heartbeat
maximum wall clock
revocation/cancellation response
```

At configured checkpoints, protected work SHALL revalidate the relevant live authority or terminate/pause safely.

## 25. Observability

At minimum measure:

```text
principal-kind request counts
public guest load/rejects
verified federated agent traffic
A2A suitability failures
A2A -> MCP fallback by reason
independent-credential fallback success
principal/resource denials
step-up/approval outcomes
weighted public cost
cache hit/coalescing
protocol-hop abuse attempts
pre-admission queue avoidance
ambiguous-dispatch reconciliation
credential-leak test failures
data-disclosure denials/minimization
callback/return-route rejects
guest-token mint throttles
bulk-harvest/cursor violations
streaming egress blocks
capability-snapshot drift revalidations
```

Operations MUST distinguish capability failure, route auth insufficiency, principal denial, resource denial, security rejection and backend health.

---

## 26. Privacy

Guest/federated access follows existing PDPA/privacy/retention policy.

Guest correlation is minimized.

Guest traffic does not silently become long-term user memory.

External agent conversation content does not silently become cross-tenant memory.

---

## 26A. Machine-access policy schema/versioning

`machine_access_v1` is a versioned policy projection.

Implementations MUST:

- reject or conservatively ignore unknown security-sensitive enum values;
- preserve command semantics across metadata upgrades;
- never interpret an unknown future access class as public;
- negotiate/validate schema versions before enabling newly generated projections;
- invalidate generated MCP/A2A/WebMCP exposure when the underlying command/access policy version changes.

Generated adapters MUST be regenerated/revalidated without silently widening public exposure.

## 26B. Authorization-policy engine outage

If SPEC-298 cannot obtain a trustworthy authorization/admission decision because its policy dependency is unavailable:

```text
PUBLIC cached read explicitly safe for degraded service -> MAY serve within stale-safe policy
PUBLIC dynamic/submission                           -> fail closed or bounded 503/429
AUTHENTICATED private read                          -> fail closed unless existing owner has an independently authoritative cached grant within freshness policy
MUTATION / DELEGATED / APPROVAL / PAYMENT           -> fail closed
```

No outage mode may reinterpret `UNKNOWN` as `ALLOW`.

## 26C. External standards baseline and drift

As of 2026-10-07, implementation planning SHALL assume the versions owned by their protocol specs/repositories, including A2A 1.0 semantics and the current MCP 2026-07-28 authorization model where the platform has adopted it. Agentic payment integration may target AP2 v0.2 or another approved payment/mandate protocol through an adapter.

These are compatibility baselines, not authority transfers to SPEC-298. SPEC-206/199/payment owners remain responsible for version negotiation and protocol conformance.

A protocol upgrade MUST trigger compatibility/conformance testing before newly advertised security/capability semantics are treated as executable authority.


## 26D. Capability/discovery snapshot pinning

A route decision SHALL identify the discovery snapshot used to justify execution when capability/security semantics are material.

Recommended references include:

```text
Agent Card hash/version/ETag
MCP server discovery/schema revision
provider adapter version
command/capability version
machine_access policy version
```

If the selected peer changes a material skill/security schema between planning and dispatch, SmartAIHub SHALL re-evaluate suitability rather than executing against stale assumptions.

A cosmetic description change need not invalidate execution, but security scheme, endpoint, protocol version, command schema, side-effect class or required-scope changes are material.

## 26E. Privacy-preserving identity and disclosure minimization

Federation SHOULD reveal only the identity/authority claims necessary for the requested interaction. SmartAIHub SHALL NOT expose internal `user_id`, tenant database identifiers, private memory keys or full internal permission graphs merely to prove an external request is authorized.

Prefer opaque stable references, minimal claims and verifiable audience/purpose-bound credentials.

Audit systems MAY retain richer internal linkage under existing privacy policy, but external peers receive only the minimum required representation.

## 27. Feature flags

```text
access_gateway.enabled
access_gateway.public_guest.enabled
access_gateway.public_machine_parity.enabled
access_gateway.a2a_inbound_guest.enabled
access_gateway.route_auth_resolver.enabled
access_gateway.independent_auth_fallback.enabled
access_gateway.shared_protocol_quota.enabled
access_gateway.transaction_authority.enabled
access_gateway.data_disclosure_gate.enabled
access_gateway.callback_ssrf_guard.enabled
access_gateway.streaming_egress_guard.enabled
access_gateway.cursor_integrity.enabled
```

Production requires kill switches.

---

## 28. Rollout

### Phase A — Contract/inventory
- inventory SPEC-279 commands/resources;
- classify public structured reads;
- add `machine_access_v1`;
- find public UI lacking machine access;
- add conformance tests.

### Phase B — Public machine reads
- enable PUBLIC_GUEST;
- bounded public MCP/resources;
- eligible public A2A skills;
- cache-first;
- pre-admission;
- verify no user-row creation.

### Phase C — Federated A2A node
- SmartAIHub Agent Card through SPEC-206;
- inbound/outbound A2A;
- Hermes bidirectional fixture;
- authenticated/extended step-up;
- trust audit.

### Phase D — Route Authorization Resolver
- denial taxonomy;
- route-local vs principal/resource scope;
- connect MCP/OAuth credential inventory;
- A2A -> independently authorized MCP;
- preserve SPEC-208 denial semantics;
- ambiguous-dispatch tests.

### Phase E — Abuse/economic hardening
- weighted cost;
- shared protocol quota;
- concurrency/fan-out/hops;
- admission-before-queue;
- amplification tests;
- dashboards.

### Phase F — Bounded autonomous commerce
- transaction authority;
- human-present approval;
- human-not-present bounded mandate;
- payment-owner adapter seam;
- receipt/evidence;
- no payment from A2A/MCP identity alone.

---

## 29. Required scenarios

1. **Public catalog / no account:** guest MCP reads public products; no user creation.
2. **Hermes -> SmartAIHub:** verified public A2A skill works without SmartAIHub membership.
3. **SmartAIHub -> Hermes:** verified/capable/authorized A2A works directly.
4. **A2A capability insufficient:** MCP equivalent may be selected.
5. **A2A public identity insufficient, User A OAuth valid:** MCP may read User A private resource.
6. **Principal/resource denied:** all equivalent routes stop.
7. **Public flood:** rejected before DB/LLM/durable queue amplification.
8. **Protocol hopping:** shared quota prevents reset.
9. **Purchase in mandate:** may proceed when payment authority also passes.
10. **Purchase over mandate:** human approval required; no fallback bypass.

---

## 30. Security requirements

1. Fail closed when data classification is unknown.
2. Reachable URL does not imply public classification.
3. Public machine access only for intentionally `PUBLIC` resources.
4. Public inputs/pagination/output are bounded.
5. No generic SQL/shell/filesystem/secrets tools for guest.
6. Arbitrary outbound URL access requires SSRF-safe existing gateway + explicit policy.
7. A2A discovery follows SPEC-206; no arbitrary crawling.
8. Production peer TLS/certificate validation is mandatory.
9. Existing A2A trust path verifies Agent Card signatures when present.
10. Credentials are handles only.
11. Audience/scope/principal/resource are checked.
12. LLM cannot synthesize approval.
13. Public/federated content is untrusted data, not authority.
14. Route switch after possible mutation requires reconciliation.
15. Denial propagation uses semantic effect + principal/resource scope.
16. Rate limit alone is insufficient: concurrency and weighted cost are mandatory.
17. Admission occurs before queue/expensive fan-out.
18. Federated identity does not create local tenant membership.
19. Logs/evidence redact credentials and sensitive data.
20. Security/policy denial cannot downgrade to Computer Use.
21. Public discovery surfaces expose only capabilities allowed for that disclosure class.
22. Principal equivalence for alternate credentials requires deterministic binding evidence; email/name matching is prohibited.
23. Shared public caches cannot store authenticated/personalized/member responses.
24. Public visibility is enforced at source query scope, not by post-fetch redaction alone.
25. Guest-to-auth step-up prevents session fixation and binds OAuth/OIDC callback to the initiating task.
26. Cached authorization has TTL/version/revocation semantics and high-risk execution revalidates at dispatch.
27. Approvals are bound to material command arguments and expire.
28. Delegation chains never expand authority.
29. Unknown denial scope is not guessed into a permissive fallback class.
30. Multi-tenant/custom-domain resolution is trusted and cache-separated.
31. Public-to-private classification changes invalidate public projections/cache within a bounded revocation objective.
32. Platform/internal service credentials cannot be substituted for external-user authority without explicit canonical policy.
33. Public/federated result egress enforces an output data-classification postcondition.
34. Authorization-policy outages never convert unknown authority into allow.
35. Protocol version upgrades require conformance before new security semantics become executable authority.

---

## 31. Persistence/migration

Prefer additive storage only:

```text
access_route_decisions
guest admission counters / edge-backed equivalent
federated principal binding refs when not already owned
machine-access policy projections
```

Do not duplicate users, tenants, capability registry, command registry, A2A registry, credential vault, payment ledger or job tables.

Existing canonical records are referenced by opaque IDs.

Migrations must be backward-compatible, rollback-safe and follow existing migration policy.

---

## 32. Compatibility

With SPEC-298 disabled, legacy behavior remains.

SPEC-206 A2A semantics are not weakened.

SPEC-208 denial semantics remain fail-closed.

SPEC-279 command IDs remain stable.

SPEC-296 continues receiving an admissible candidate set and remains backend operational router.

---

## 33. Work packages

**WP1 Access model:** AccessContext, PUBLIC_GUEST, federated principal normalization, no-user path.

**WP2 Machine-access metadata:** `machine_access_v1`, public inventory, UI-public parity linter.

**WP3 Pre-admission:** edge integration, size/rate/concurrency/cost, shared protocol quota, cache/coalescing.

**WP4 A2A:** consume SPEC-206 trust/suitability; inbound/outbound; Hermes fixtures.

**WP5 Route Authorization Resolver:** credential/grant evaluation; denial scope; step-up; independent authorization fallback.

**WP6 MCP step-up:** public reads; OAuth/account step-up; private scopes; correlation continuity.

**WP7 Runtime:** SPEC-296 candidate handoff; SPEC-267 execution; SPEC-279 envelope; SPEC-277 projection.

**WP8 Security:** flood, expensive low-rate attack, protocol hopping, substitution, SSRF, loops, ambiguous replay.

**WP9 Commerce:** transaction authority, deterministic limits, approval escalation, payment-owner seam, receipts/evidence.

---

## 34. Conformance tests

At minimum:

1. public web data machine-readable without account;
2. no private field in public projection;
3. guest does not create user row;
4. guest cannot call protected command;
5. guest token cannot mutate into user credential;
6. valid public A2A accepted;
7. invalid A2A trust rejected;
8. stale/invalid Agent Card handled by SPEC-206;
9. A2A capability insufficient -> MCP considered;
10. A2A route auth insufficient + valid same-user MCP grant -> allowed;
11. unrelated user's credential -> rejected;
12. principal denied -> MCP/API/WebMCP/Computer Use blocked;
13. resource denied -> equivalent routes blocked;
14. approval rejection cannot be bypassed;
15. step-up preserves correlation;
16. expired credential requires re-auth;
17. insufficient scope rejected;
18. audience mismatch rejected;
19. transport switch cannot expand delegation ceiling;
20. flood rejected before queue;
21. low-rate expensive guest bounded;
22. protocol hopping does not reset quota;
23. bounded pagination/response;
24. fan-out bounded;
25. agent loop stopped;
26. no raw secrets in logs/evidence;
27. arbitrary URL/SQL/shell unavailable to guest;
28. cache hit avoids backend work;
29. identical public reads coalesce where supported;
30. unhealthy backend filtered by SPEC-296;
31. public read works without LLM;
32. ambiguous mutation blocks blind replay;
33. idempotent retry does not duplicate side effect;
34. SmartAIHub -> Hermes A2A passes;
35. Hermes -> SmartAIHub public A2A passes without membership;
36. authenticated A2A gains only scoped capability;
37. user cancellation stops fallback;
38. in-mandate purchase can proceed only with payment authority;
39. over-mandate purchase requires human approval;
40. A2A identity alone cannot authorize payment;
41. UI and machine routes share canonical semantics;
42. no duplicate provider-specific UI business logic;
43. feature-flag disable preserves legacy behavior;
44. rollback leaves no orphaned authority;
45. observability distinguishes abuse, auth, policy and health failures.

---

46. principal binding is not inferred from matching email/name strings;
47. valid OAuth issuer+subject binding maps to correct local principal;
48. wrong remote subject with valid scope is rejected;
49. public cache never serves authenticated/member pricing to a guest;
50. tenant/custom-domain cache key cannot cross-serve another tenant;
51. unpublished/private resource cannot be enumerated by public ID/search;
52. public capability discovery does not reveal private command names/schemas;
53. admission-store outage fails closed for dynamic guest work;
54. bounded cached public read can follow explicit degraded-mode policy;
55. multi-region parallel guest requests cannot materially exceed configured high-cost budget;
56. authorization cache invalidates on credential/mandate/policy revocation;
57. high-risk mutation revalidates authorization at dispatch;
58. guest-to-auth flow rotates/changes security session context and resists fixation;
59. browser login/cookie alone cannot authorize MCP/API use without an authorized connection grant;
60. replayed privileged request is rejected or deduplicated by owning replay/idempotency mechanism;
61. approval for cart A cannot authorize materially different cart B;
62. price/merchant/currency drift beyond mandate tolerance requires re-approval;
63. `DENIAL_UNCLASSIFIED` cannot trigger permissive mutation fallback;
64. public error response does not reveal existence of private resources;
65. public bounded submit is spam/idempotency/quota controlled and does not create trusted facts.

66. public-to-private classification change invalidates/purges guest-visible cache within policy objective;
67. stale public cache cannot continue serving newly private data beyond the declared bound;
68. external request cannot borrow a stronger platform-internal service credential;
69. tenant service credential is usable only when canonical policy permits that acting principal/purpose;
70. PUBLIC_READ result containing private-labeled field is blocked/redacted before egress;
71. raw provider error/private resource existence is not leaked through public result egress;
72. policy-engine outage fails closed for mutation/delegated/payment actions;
73. explicitly safe cached public read follows documented degraded-mode policy;
74. direct Hermes/external A2A operation does not require SmartAIHub to remain in the message path;
75. protocol-version upgrade cannot widen executable capability until conformance/security validation passes;
76. valid private-read authority does not automatically authorize sending private payload to an external A2A peer;
77. permitted disclosure is minimized to the policy-approved field/data class;
78. unapproved downstream agent cannot receive protected data merely because its parent peer is trusted;
79. each delegated hop preserves or attenuates authority;
80. account unlink invalidates principal-binding evidence and cached fallback decisions;
81. re-linked account with same email/display name cannot revive old binding epoch;
82. guest-session mint endpoint is rate limited before session creation;
83. creating many guest sessions cannot trivially reset shared quota;
84. modified pagination cursor cannot cross tenant/query/access boundary;
85. cursor expiry/query hash/data revision is enforced where configured;
86. bulk harvesting beyond public retrieval policy is throttled or requires the declared stronger access class;
87. licensed render-only data is not copied through public machine projection without redistribution rights;
88. Agent Card/tool description prompt injection has no policy/authorization effect;
89. oversized/deep malicious external schemas are rejected before model/tool exposure;
90. callback URL to loopback/link-local/cloud metadata/private forbidden destination is rejected;
91. callback redirect cannot bypass SSRF/network destination policy;
92. callback payload/auth is bound to intended peer/task and does not leak secrets in URL;
93. protected streaming output passes egress policy before each material chunk;
94. revocation/cancellation during stream stops subsequent protected chunks;
95. protected stream is buffered/disabled when incremental classification cannot be made safely;
96. remote `done` text cannot mark a consequential action complete without authoritative verification;
97. remote result cannot trigger a privileged follow-on action without its own authorization;
98. long-running task revalidates authority at configured checkpoint/lease boundary;
99. long-running task stops/pauses when grant is revoked or cost budget expires;
100. route decision is pinned to material Agent Card/MCP/schema/policy snapshot;
101. material capability/security drift between plan and dispatch forces re-evaluation;
102. public machine result revision/freshness stays within declared parity objective with public UI;
103. external federation claims do not expose internal user/tenant/memory identifiers unnecessarily;
104. direct downstream disclosure does not inherit trust transitively from an upstream peer;
105. data disclosure evidence records policy decision without copying protected payload into logs.

## 35. Failure injection

Test:

```text
Agent Card timeout/tamper
certificate failure
A2A 5xx
unsupported A2A skill
route-auth insufficiency
OAuth expiry/wrong audience
MCP unavailable/slow
backend degraded
queue saturation
rate limit
public flood
cache stampede
LLM outage
DB slowdown
network partition after mutation
duplicate callback
duplicate purchase
approval timeout
identity-binding mismatch
public cache-key poisoning attempt
tenant host-header confusion
admission counter-store outage
authorization revoked between planning and dispatch
OAuth callback/session fixation attempt
replayed signed/approved request
checkout price/merchant drift
unclassified remote 403/error text
public command-discovery enumeration
public-to-private cache classification flip
confused-deputy request targeting platform service credential
downstream provider returns over-scoped/private fields
authorization-policy engine outage
protocol version/capability drift after cached discovery
private MCP data requested for onward A2A disclosure
trusted peer delegates to unknown downstream peer
account unlink/relink while fallback credential decision is cached
guest-session mint flood
tampered/expired cross-tenant pagination cursor
bulk public scraper/export burst
malicious Agent Card/tool-description prompt injection
callback to localhost/link-local/cloud metadata IP
callback redirect to forbidden network
protected stream emits private field mid-stream
authorization revoked during active stream/task
remote agent falsely returns consequential action as done
material Agent Card/MCP schema change between planning and dispatch
public UI/machine projection revision skew beyond objective
```

Each must produce deterministic normalized state and bounded retry/fallback.

---

## 36. Definition of Done

SPEC-298 is complete only when:

1. public structured web data is machine-readable without SmartAIHub membership;
2. public access is admission-controlled and cost-bounded;
3. guests never silently become local users;
4. SmartAIHub is an inbound/outbound A2A peer;
5. Hermes bidirectional reference tests pass;
6. A2A suitability checks trust/capability/security/authorization;
7. route-local A2A insufficiency may use independently authorized MCP/API;
8. principal/resource/policy denial cannot be bypassed;
9. user credentials are bound to real principal/scope/resource;
10. step-up/approval preserve task/command/idempotency;
11. admission precedes durable queue/expensive work;
12. shared cross-protocol quota and anti-loop are active;
13. UI and agent invocation share canonical commands;
14. SPEC-296 remains the backend health/cost/quality router;
15. transaction access is separated from payment mandate;
16. autonomous purchase is limited by deterministic mandate;
17. over-limit/sensitive purchase requests human approval;
18. no raw credential leakage;
19. ambiguous effects reconcile before replay;
20. rollback/feature flags are tested.
21. principal equivalence for alternate credentials is proven by canonical binding evidence.
22. public/private cache separation and source-level public visibility are tested.
23. authorization revocation/TOCTOU revalidation is enforced for high-risk execution.
24. guest-to-auth step-up is fixation-resistant and callback-bound.
25. approval/mandate scope is bound to material arguments and transaction snapshot.
26. public discovery does not reveal private capability topology.
27. multi-tenant/custom-domain requests cannot cross tenant boundaries.
28. public bounded submit is separately abuse-governed from public read.
29. unclassified denials fail conservatively.
30. SPEC-296 integration uses a two-phase candidate/filter/rank seam rather than duplicate scoring.
31. public-to-private classification revokes public cache/projections within a bounded tested objective.
32. credential-purpose checks prevent confused-deputy use of platform/service credentials.
33. result egress enforces the allowed output data class.
34. policy-engine outage behavior is fail-closed for protected/high-risk work.
35. direct external-agent paths do not depend on SmartAIHub being a mandatory relay.
36. reading private data and disclosing it to an external agent are separately authorized.
37. outbound protected data is minimized to the destination-approved disclosure class.
38. trust/authority is non-transitive across agent hops.
39. account unlink/rebind invalidates stale identity-binding and fallback decisions.
40. guest-session issuance cannot be used to mint unlimited fresh abuse budgets.
41. public pagination/cursors are integrity-protected and tenant/query/access bound.
42. public machine parity respects third-party licensing/redistribution policy.
43. external discovery metadata/tool descriptions are treated as untrusted content.
44. callback/push/return routes are protected against SSRF, redirect abuse and exfiltration.
45. streaming output enforces egress policy before material data release.
46. remote success/result claims require consequence-appropriate authoritative verification.
47. long-lived tasks/streams continuously respect revocation, budget and lease bounds.
48. material discovery/capability snapshots are pinned and revalidated on drift.
49. machine-readable public data freshness stays within the documented public-UI parity objective.
50. federation exposes minimal external identity/authority claims rather than internal identifiers.

---

## 37. Forty-pass gap audit

**Pass 1 — Ownership:** explicit boundaries prevent second orchestrator/router.

**Pass 2 — Public access:** PUBLIC_GUEST + web-to-machine parity.

**Pass 3 — Federation:** SmartAIHub peer + bidirectional A2A + Hermes reference.

**Pass 4 — Authorization:** route-local vs principal/resource denial.

**Pass 5 — Fallback:** independent-valid-grant rule + ambiguous-effect reconciliation.

**Pass 6 — UI/headless parity:** SPEC-279 canonical command + SPEC-287 binding retained.

**Pass 7 — Abuse/resilience:** pre-admission, weighted cost, concurrency, shared quota, cache, anti-loop.

**Pass 8 — Security/secrets:** handles, scope/audience checks, no credential forwarding, SSRF protection.

**Pass 9 — Economic actions:** payment mandate separated from A2A/MCP; bounded autonomy.

**Pass 10 — Multi-tenant/privacy:** remote identity is not membership; no silent cross-tenant memory.

**Pass 11 — Operations/recovery:** decision records, metrics, failure injection, rollback, reconciliation.

**Pass 12 — Future agents:** capability/protocol discovery, not provider-name hardcoding.

**Pass 13 — Identity binding/confused deputy:** alternate-route credentials require deterministic principal binding; no heuristic identity matching.

**Pass 14 — Cache/data isolation:** public visibility is enforced at query source; public cache partitioning prevents personalized/private leakage.

**Pass 15 — Authorization freshness:** revocation, policy version and dispatch-time revalidation close TOCTOU gaps.

**Pass 16 — OAuth/session security:** connected-account authority is explicit; step-up prevents callback confusion and session fixation.

**Pass 17 — Replay/approval scope:** privileged requests and approvals are bound to exact semantic effects/material parameters.

**Pass 18 — Commerce drift:** checkout/merchant/price/currency changes invalidate stale mandate assumptions.

**Pass 19 — Multi-tenant/discovery disclosure:** trusted domain binding and disclosure-scoped manifests prevent cross-tenant or topology leakage.

**Pass 20 — Degraded/uncertain operation:** admission-store failure, unclassified denial and multi-region quota races fail conservatively.

**Pass 21 — Classification revocation/cache safety:** public-to-private transitions revoke public projections and bound stale exposure.

**Pass 22 — Federation topology neutrality:** SmartAIHub is a peer/participant, not a mandatory relay for direct external A2A relationships.

**Pass 23 — Confused deputy/credential purpose:** internal or tenant service credentials cannot be laundered into external-user authority.

**Pass 24 — Result egress/DLP:** successful invocation cannot exfiltrate data above the caller's authorized output class.

**Pass 25 — Standards/policy outage drift:** unknown authorization fails closed and protocol upgrades require fresh conformance.

**Pass 26 — Cross-boundary data disclosure:** read/use authority is separated from authority to disclose protected data to an external peer.

**Pass 27 — External metadata/prompt injection:** Agent Cards, schemas and tool descriptions remain untrusted descriptive input, never policy authority.

**Pass 28 — Callback/push SSRF:** return routes are destination-validated, task-bound, authenticated and network-policy constrained.

**Pass 29 — Bulk harvest/licensing:** public parity preserves machine access while distinguishing lawful/contractual redistribution and bounded bulk export.

**Pass 30 — Cursor integrity:** pagination state is tenant/query/access bound and cannot be tampered into enumeration or cross-tenant reads.

**Pass 31 — Guest-token mint abuse:** pre-session admission prevents unlimited quota reset through disposable guest identities.

**Pass 32 — Capability snapshot pinning:** material Agent Card/MCP/schema/security drift invalidates stale route assumptions before dispatch.

**Pass 33 — Account unlink/rebinding lifecycle:** stale provider-account bindings and decisions cannot survive unlink, subject change or ownership transfer.

**Pass 34 — Non-transitive trust:** a trusted peer cannot confer SmartAIHub trust/authority on an unverified downstream peer.

**Pass 35 — Per-hop attenuation:** each material delegated hop preserves or reduces scope, disclosure, spend and command authority.

**Pass 36 — Streaming DLP:** output policy applies before each material streamed release, not only at final response assembly.

**Pass 37 — Long-lived authority/resource bounds:** streams/tasks revalidate live grants, revocation, leases and cost ceilings at safe checkpoints.

**Pass 38 — Remote result integrity:** external success text is evidence to validate, not authoritative proof for consequential state or follow-on privilege.

**Pass 39 — Public freshness parity:** machine-readable public data carries bounded freshness/version semantics consistent with the public UI source-of-truth.

**Pass 40 — Privacy-preserving federation claims:** external peers receive only minimal identity/authority claims needed for the interaction.

Any implementation contradiction with an implemented canonical owner SHALL be resolved through an additive compatibility adapter or recorded blocker, never by silently redefining that owner.

---

## 37A. External reference baselines

Non-normative reference links for implementation verification:

- A2A Protocol v1.0 / Agent Card & security: `https://a2a-protocol.org/`
- Model Context Protocol specification/SDK authorization baseline: `https://modelcontextprotocol.io/`
- Agent Payments Protocol (AP2) reference implementation/spec: `https://github.com/google-agentic-commerce/AP2`

Repository-pinned protocol owners remain authoritative for the exact version used by SmartAIHub.

## 38. Final architecture

```text
        HUMAN / AGENT / SERVICE / PUBLIC GUEST
                         |
                         v
             Edge / Cheap Pre-Admission
                         |
                         v
                    SPEC-298
          Access Context / Auth Resolution
                         |
               +---------+---------+
               |                   |
               v                   v
            SPEC-279            SPEC-256
         Canonical Command      Capability
               |                   |
               +---------+---------+
                         |
               Candidate Interfaces
         +---------------+---------------+
         |               |               |
         v               v               v
      SPEC-206         SPEC-199       API/Native
        A2A              MCP
         |               |
         +-------+-------+
                 |
                 v
       SPEC-298 Route Authorization
                 |
      blocked / step-up / approval?
                 |
                 v
       authorized admissible candidates
                 |
                 v
              SPEC-296
      health/cost/quality routing
                 |
                 v
              SPEC-267
       durable execution/control
                 |
                 v
       Result / Evidence / SPEC-277
```

The resulting platform supports:

```text
Human -> SmartAIHub UI
Agent -> SmartAIHub public/protected MCP
Hermes -> SmartAIHub A2A
SmartAIHub -> Hermes A2A
Future A2A agent -> SmartAIHub
Public guest agent -> public catalog/data
Authenticated user agent -> private data via valid MCP/OAuth grant
Delegated agent -> bounded transaction
```

without making SmartAIHub membership or SmartAIHub itself the mandatory center of every agent interaction.

---

# End of SPEC-298
