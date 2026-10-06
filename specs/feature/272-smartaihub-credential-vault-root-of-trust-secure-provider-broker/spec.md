# Spec 272 — SmartAIHub Credential Vault, Root-of-Trust & Secure Provider Broker

**Status:** Implementation-ready — hardened after 12-pass security/operability review  
**Version:** 1.1  
**Date:** 2026-10-02  
**Owner:** SmartAIHub Platform / Security Infrastructure  
**Change policy:** Additive. Do not retroactively expand or break already-implemented contracts in prior specs. Integrate through adapters and shared interfaces.

---

## 0. Executive Decision

SmartAIHub SHALL standardize all reusable API keys, OAuth refresh tokens, bearer tokens, MCP credentials, external-agent credentials, provider secrets, and comparable operational credentials behind one shared **Credential Vault + Secure Provider Broker**.

The canonical design is:

```text
Cloudflare Secrets Store
        │
        │ small set of Root/System secrets only
        │ e.g. SAH_CRED_KEK_V1, SAH_AUDIT_HMAC_V1
        ▼
Credential Vault Worker / Secure Provider Broker
        │
        ├── AuthN/AuthZ/tenant isolation
        ├── envelope encryption/decryption
        ├── provider-bound credential injection
        ├── use-without-disclosure
        ├── rotation/revocation
        ├── redacted audit
        └── fail-closed policy
        │
        ▼
Dedicated D1 Credential Database
        │
        └── ciphertext + wrapped DEK + metadata only
```

**Cloudflare Secrets Store is the Root of Trust.**  
**D1 is encrypted credential storage, not a replacement for Secrets Store.**  
**The main SmartAIHub PostgreSQL database MUST NOT store reusable credential plaintext.**

Credential placement is canonical and MUST follow this decision table:

| Credential/material class | Canonical location | Notes |
|---|---|---|
| Root KEK / audit-signing / Vault bootstrap secrets | Cloudflare Secrets Store | low-cardinality only |
| External reusable provider credential, including platform/user/tenant keys | Credential Vault D1, encrypted | all normal API keys/tokens converge here |
| Cloudflare resource credential where a native binding exists | Native Cloudflare Binding | do not manufacture/store a duplicate API key |
| Browser-publishable key intentionally designed to be public | Public Integration Config, NOT secret Vault | must be provider-restricted by origin/app/package as applicable |
| Short-lived/ephemeral delegated token | Minted by Broker, memory/short-lived client state only | never substitute a long-lived key |
| Device-local credential that must remain on a trusted user machine | Local Device Vault + remote logical reference | central upload is opt-in/explicit, not forced |

This prevents the anti-pattern “everything called a key goes into one bucket” while still ensuring that **all centrally managed reusable external-provider secrets** use the same Vault security boundary.

The preferred runtime contract is:

```text
executeProviderOperation(credential_ref, operation, payload, context)
```

and explicitly NOT:

```text
getCredentialSecret(credential_ref)
fetch(arbitrary_url, credential_ref)
```

A consumer normally receives the provider response, never the credential plaintext.

---

# 1. Problem Statement

SmartAIHub is evolving into a multi-tenant platform that can connect to many external systems through LLM routing, MCP, agents, user subscriptions, Mini Apps, media providers, developer platforms, SaaS systems, data providers, and future integrations.

Without a canonical credential infrastructure, separate subsystems tend to create incompatible and unsafe patterns such as:

- plaintext `.env` files;
- reusable tokens inside PostgreSQL rows;
- tokens copied into workflow state;
- credentials passed through LLM prompts;
- API keys returned to agents or Mini Apps;
- arbitrary URLs combined with a stored credential;
- raw `Authorization` headers in logs/traces;
- tenant-crossing credential lookup;
- provider URLs that can be replaced to exfiltrate a valid key;
- uncontrolled duplication of the same credential across services.

Spec 272 establishes one security boundary and one credential reference model for the entire platform.

---

# 2. Goals

## 2.1 Primary goals

1. Centralize operational credentials behind one shared security service.
2. Keep Root/Master keys outside the credential database.
3. Keep all stored user/tenant credentials encrypted at application level before D1 persistence.
4. Prevent normal consumers from retrieving reusable plaintext secrets.
5. Bind each credential to an approved provider/origin/auth scheme.
6. Prevent an Agent/MCP/Mini App from pairing a trusted credential with an attacker-controlled arbitrary URL.
7. Make authorization tenant-, user-, project-, agent-, Mini App-, operation-, and policy-aware.
8. Provide safe rotation, revocation, expiry, migration, auditing, and recovery.
9. Support user-owned credentials and platform-owned credentials with the same reference model.
10. Scale from beta to large multi-tenant deployments without requiring one Cloudflare Secrets Store entry per user credential.
11. Integrate with existing SmartAIHub routing/orchestration contracts without requiring earlier specs to be rewritten.
12. Provide deterministic UAT and negative-security tests compatible with the SmartAIHub UAT architecture.

## 2.2 Security goals

The architecture SHOULD ensure that compromise of one layer does not automatically disclose all stored secrets:

- D1 dump alone: insufficient to decrypt credentials.
- Main SmartAIHub PostgreSQL dump: contains no reusable credential plaintext.
- Browser/Mini App/Agent: normally receives only `credential_ref`, never secret material.
- Main application Worker: has no Root KEK and no direct credential-D1 binding.
- Logs/traces: contain redacted identifiers and metadata only.
- Provider call: receives the real credential only at the approved destination and only for the operation being executed.

---

# 3. Non-Goals

Spec 272 does NOT attempt to:

1. Turn D1 itself into a hardware security module or KMS.
2. Claim that plaintext never exists anywhere. A provider credential must normally exist briefly in trusted runtime memory when the Broker constructs an authenticated provider request.
3. Guarantee JavaScript memory zeroization. Cloudflare Worker isolate memory management/GC does not provide an application-level guarantee that a JavaScript string or ArrayBuffer can be physically zeroed immediately.
4. Allow generic secret-export APIs for arbitrary consumers.
5. Make arbitrary outbound `fetch()` with a credential a supported public capability.
6. Store all platform Root secrets in D1.
7. Depend on one D1 database remaining sufficient forever.
8. Treat infrastructure encryption-at-rest as a substitute for application-level envelope encryption.

---

# 4. Dependencies and Integration Points

Spec 272 is shared platform infrastructure and MUST expose adapters to the systems below where applicable.

## 4.1 Core dependencies

- Cloudflare Workers
- Cloudflare Service Bindings / RPC
- Cloudflare Secrets Store
- Cloudflare D1
- Web Crypto API available in Workers runtime
- SmartAIHub identity/authentication service
- SmartAIHub authorization/policy service
- SmartAIHub audit/event infrastructure

## 4.2 SmartAIHub integration targets

At minimum, provide integration contracts for:

- Spec 224 — Development Orchestrator Runtime
- Spec 231 — Unified LLM Routing & Inference Orchestration
- Spec 239 — External Personal Agent Interop
- Spec 242 — Cloudflare Agents SDK & Sandbox integration
- Spec 253 — Universal Product Command / shared capability handoff where credentials are required
- Spec 256 — Skill-first Function Catalog & Intent Routing
- Spec 259 — thClaws harness integration
- Spec 261 — Agent/package installation and runtime capability system
- Spec 266 — Unified Data, Evidence, Knowledge & Spatial Intelligence Fabric when external data-source credentials are needed
- Spec 267 — Cloudflare migration/runtime architecture
- Spec 269+ — Assistant/bot/mini-app execution contracts where provider access is delegated
- Spec 271 — SmartAIHub UAT architecture; security and credential test suites defined here SHALL be consumable by the UAT layer

Existing subsystems MAY keep compatibility wrappers during migration but SHALL converge to `credential_ref` and provider-operation execution.

---

# 5. Terminology

| Term | Meaning |
|---|---|
| Credential | Reusable secret material such as API key, OAuth refresh token, bearer token, password, client secret, certificate secret, or MCP token |
| Root KEK | Key Encryption Key stored in Cloudflare Secrets Store and used to wrap per-credential DEKs |
| DEK | Data Encryption Key generated independently for a credential/version |
| Envelope Encryption | Encrypt secret with DEK; encrypt/wrap DEK with Root KEK |
| Credential Vault | Service that owns encrypted credential lifecycle and authorization |
| Secure Provider Broker | Execution path that injects a credential into an approved provider request without disclosing it to the caller |
| `credential_ref` | Opaque SmartAIHub identifier used by consumers instead of plaintext credentials |
| Provider Manifest | Trusted configuration describing approved origins, auth injection, operations, paths, methods, redirect policy, payload limits, and secret handling |
| Use-Without-Disclosure | Consumer requests an operation that uses a credential while never receiving the credential plaintext |
| Root of Trust | Small set of master secrets protected by Cloudflare Secrets Store and platform deployment controls |

---

# 6. High-Level Architecture

```text
                           SmartAIHub Consumers
  ┌──────────────────────────────────────────────────────────────┐
  │ Chat │ LLM Gateway │ Agent │ MCP │ Mini App │ Runner │ SaaS │
  └──────────────────────────────────────────────────────────────┘
                               │
                        credential_ref
                        operation/payload
                               │
                               ▼
                     Main SmartAIHub Services
                               │
                     private Service Binding
                               │
                               ▼
          ┌──────────────────────────────────────────┐
          │ Credential Vault / Secure Provider Broker│
          │                                          │
          │ - verify caller service                  │
          │ - resolve actor + tenant context         │
          │ - authorize credential grant             │
          │ - resolve trusted provider manifest      │
          │ - load ciphertext                        │
          │ - unwrap DEK                             │
          │ - decrypt credential                     │
          │ - inject credential server-side          │
          │ - call approved provider                 │
          │ - redact + audit                         │
          └──────────────┬───────────────────────────┘
                         │
             ┌───────────┴─────────────┐
             │                         │
             ▼                         ▼
 Cloudflare Secrets Store       Dedicated D1 Vault DB
 ┌──────────────────────┐       ┌───────────────────────┐
 │ SAH_CRED_KEK_V1      │       │ ciphertext            │
 │ SAH_CRED_KEK_V2      │       │ encrypted/wrapped DEK │
 │ SAH_AUDIT_HMAC_V1    │       │ nonces                │
 │ system secrets       │       │ metadata              │
 └──────────────────────┘       └───────────────────────┘
                         │
                         ▼
                  Approved Provider
```

---

# 7. Security Boundary Rules

## 7.1 Main application Worker

The normal SmartAIHub application Worker MUST NOT receive:

- Root KEK binding;
- direct binding to credential D1;
- generic decrypt capability;
- provider credential plaintext returned from Vault.

It SHOULD receive only a Service Binding to the Credential Vault/Broker.

## 7.2 Vault Worker

The Vault Worker MAY receive:

- dedicated credential D1 binding;
- required Secrets Store bindings for active KEK versions;
- authorization/policy service bindings;
- audit sink binding;
- strictly required provider network access.

It MUST NOT expose a general-purpose public plaintext-secret read endpoint.

## 7.3 Service Binding

Internal SmartAIHub services SHOULD call the Vault using Workers Service Bindings/RPC instead of a public HTTP URL.

Important: Cloudflare Access context is not automatically propagated through Service Bindings. Therefore, the Vault MUST NOT assume the downstream RPC invocation contains authenticated end-user identity merely because the upstream Worker was authenticated.

The Vault MUST obtain/verify authorization using one or more of:

1. explicit signed short-lived SmartAIHub capability token;
2. direct RPC to the canonical Identity/Policy service;
3. server-side run/job identity resolvable from a trusted control-plane record;
4. approved service identity bound to the calling Worker.

User-supplied `tenant_id`, `user_id`, `role`, or `scope` fields alone MUST NOT be trusted.

---

# 8. Root-of-Trust Design — Cloudflare Secrets Store

## 8.1 Secrets Store responsibilities

Secrets Store SHALL contain only low-cardinality Root/System secrets, such as:

```text
SAH_CRED_KEK_V1
SAH_CRED_KEK_V2
SAH_CREDENTIAL_FINGERPRINT_HMAC_V1
SAH_AUDIT_HMAC_V1
SAH_INTERNAL_CAPABILITY_SIGNING_KEY_V1
```

It SHALL NOT contain one entry per user API key.

## 8.2 Versioning

Every root key SHALL be versioned.

Example:

```text
SAH_CRED_KEK_V1
SAH_CRED_KEK_V2
```

D1 records SHALL retain `kek_version` so old records remain decryptable during staged rotation.

## 8.3 Rotation rules

1. Create new KEK version in Secrets Store.
2. Deploy Vault version capable of reading old + new KEK.
3. Mark new KEK as write-primary.
4. Rewrap DEKs in controlled batches.
5. Verify zero active rows reference old KEK.
6. Keep emergency rollback window.
7. Retire/delete old KEK only after explicit security approval and evidence.

A root key MUST NOT be removed while any active record references it.

## 8.4 Root-key generation and encoding

Root cryptographic keys MUST be generated from a CSPRNG and stored as an explicitly versioned encoding (for example `base64url(raw_32_bytes)`), never as human-created passphrases. The Vault MUST reject malformed/wrong-length root material.

The Secrets Store binding value SHALL be retrieved only inside the Vault execution boundary and imported into Web Crypto with the minimum usages needed. The raw root value MUST NOT be logged, returned, cached in KV, or copied into general Worker globals.

## 8.5 Control-plane and CI/CD trust boundary

Secrets Store protects values from ordinary read-back, but a sufficiently privileged Cloudflare account/deployment principal can change bindings, replace secrets, or deploy code that consumes a secret. Therefore **Cloudflare account administration and Vault deployment authority are part of the Root-of-Trust threat model**.

Production SHALL require:

1. a dedicated Vault deployment pipeline separate from normal application deployment;
2. least-privilege Cloudflare API tokens and named human accounts;
3. phishing-resistant MFA/hardware-backed authentication for privileged operators where available;
4. explicit review for any change to Secrets Store values/scopes, Vault bindings, Vault routes, D1 binding, or provider manifests;
5. no shared long-lived global API key in CI;
6. audit of secret replacement/deletion/binding changes;
7. release approval for code that can call `secretBinding.get()`;
8. policy checks preventing ordinary SmartAIHub CI from adding a Root KEK binding to another Worker.

Because Cloudflare currently requires Secrets Store Edit authority to bind a secret during deployment, the CI token capable of changing Vault bindings MUST be treated as highly privileged and isolated from routine application pipelines.

## 8.6 Root-key recovery / escrow policy

A Secrets Store value cannot be read back through the normal API/dashboard after creation. SmartAIHub SHALL therefore define a deliberate recovery model before production:

- **Standard profile:** securely generate Root KEK outside application logs, inject it into Secrets Store, and maintain an encrypted offline/break-glass recovery copy under dual control.
- **Higher-assurance profile:** replace/augment the RootKeyProvider abstraction with an approved external KMS/HSM when regulatory or organizational policy requires non-Cloudflare key custody.

Recovery copies MUST NOT be placed in source control, normal CI secrets, SmartAIHub PostgreSQL/D1/R2, tickets, chat, or developer password managers. Recovery access MUST require two-person approval and produce independent audit evidence.

The implementation MUST abstract root-key access behind:

```ts
interface RootKeyProvider {
  getWrapKey(version: string): Promise<CryptoKey>
  getActiveWriteVersion(): Promise<string>
}
```

so the data plane is not permanently coupled to a beta Secrets Store implementation.

## 8.7 Routine KEK rotation vs suspected KEK compromise

These are different events and MUST NOT use the same runbook.

**Routine rotation:** rewrap existing DEKs under the new Root KEK; credential payload plaintext need not be decrypted/re-encrypted.

**Suspected/confirmed Root KEK compromise:** rewrapping alone is insufficient because an attacker who obtained an older D1 snapshot plus the compromised KEK can still unwrap historical DEKs. Incident response SHALL therefore:

1. immediately security-hold affected Vault operations as risk requires;
2. create a new uncompromised Root KEK;
3. create new DEKs and re-encrypt active credential payloads;
4. rotate/revoke the underlying credentials **at each external provider** wherever possible, because already-exposed old plaintext cannot be made secret again by local re-encryption;
5. invalidate grants/capabilities and increment security epochs;
6. review D1/audit/access evidence for the exposure window;
7. retain compromised key material only as required for forensic/recovery policy, never as active write-primary.

A security UI/runbook MUST clearly distinguish `routine_root_rotation` from `root_compromise_recovery`.

---

# 9. Credential Encryption Model

## 9.1 Per-credential envelope encryption

For every new credential version:

1. Generate a cryptographically random 256-bit AES-GCM DEK.
2. Generate a unique 96-bit random nonce for credential encryption.
3. Encrypt credential bytes using AES-256-GCM with deterministic/versioned AAD.
4. Wrap the DEK using an independent Root KEK with **AES-KW (preferred)** through Web Crypto `wrapKey()`/`unwrapKey()`.
5. Persist ciphertext, secret nonce, wrapped DEK, algorithm identifiers, key version, and authenticated metadata.
6. Discard transient plaintext and transient extractable DEK references as soon as the write/provider operation completes.

AES-KW is preferred for DEK wrapping because Cloudflare Workers Web Crypto currently supports AES-KW `wrapKey()`/`unwrapKey()` directly. A legacy AES-GCM-wrapped DEK MAY be read during migration, but all new writes SHALL use the current `wrap_algorithm` selected by cryptographic policy.

Root-key rotation SHOULD rewrap DEKs without decrypting the credential payload itself. The implementation MUST support algorithm/version agility rather than hard-code one representation forever.

## 9.2 Authenticated Additional Data (AAD)

AAD SHALL bind ciphertext to security-relevant identity, preventing record substitution.

Recommended canonical AAD fields:

```text
schema_version
credential_id
credential_version
owner_type
owner_id
tenant_id
provider_id
provider_origin_hash
auth_scheme
secret_type
```

AAD serialization MUST be deterministic and versioned.

Security-bound AAD fields are **immutable for a credential version**. Changing owner, tenant, provider origin, auth scheme, or another AAD-bound field SHALL create a new credential version/rebind operation rather than mutating metadata in place.

Canonicalization MUST define UTF-8 encoding, field ordering, null handling, normalization, and integer/string representation. The implementation SHALL maintain golden-vector tests so another runtime/language produces identical AAD bytes.

## 9.3 Nonce requirements

AES-GCM nonce reuse under the same key is forbidden.

The implementation MUST:

- generate independent random nonces;
- never derive a nonce from timestamp alone;
- never reuse `secret_nonce` for any other AES-GCM encryption under the same DEK;
- test nonce length and uniqueness behavior.

`wrap_nonce` is not required for AES-KW. It remains schema-compatible only for legacy wrapping algorithms that require a nonce.

## 9.4 Fingerprints

If duplicate detection is required, do NOT store a simple unsalted hash of passwords or low-entropy credentials.

Preferred model:

```text
fingerprint = HMAC(SAH_CREDENTIAL_FINGERPRINT_HMAC_V1, credential_bytes)
```

Store a truncated or full fingerprint only for duplicate detection/security operations.

## 9.5 Runtime plaintext constraints

Plaintext secrets:

- MUST NOT be persisted in D1, PostgreSQL, KV, R2, workflow state, queue payloads, analytics, traces, or exception messages;
- MUST NOT be returned to LLMs, Agents, MCP clients, Mini Apps, or browsers after creation;
- MUST NOT be cached in KV or global Worker variables;
- MUST exist only for the minimum runtime scope necessary.

JavaScript memory zeroization cannot be guaranteed; the design relies on short lifetime, no caching, least privilege, and isolate/runtime boundaries.

---

# 10. Credential Ownership Model

Supported owner types SHALL include at least:

```text
platform
tenant
team
project
user
assistant
agent
mini_app
workflow
runner
```

Each credential has exactly one canonical owner but MAY have explicit grants to other principals.

Examples:

```text
Tenant credential
  owner_type = tenant
  owner_id   = tenant_abc

User credential
  owner_type = user
  owner_id   = user_123

Mini App credential
  owner_type = mini_app
  owner_id   = app_789
```

Cross-tenant grants are forbidden by default and require an explicit platform-level sharing contract.

---

# 11. Credential Types

The schema SHALL support extensible credential types, including:

- `api_key`
- `bearer_token`
- `oauth2_refresh_token`
- `oauth2_client_secret`
- `basic_auth_password`
- `mcp_token`
- `github_pat`
- `service_account_secret`
- `private_key`
- `certificate_secret`
- `custom_secret`

Provider-specific validation SHALL be implemented in provider adapters/manifests, not hard-coded in the generic storage schema.

---

# 12. Dedicated D1 Data Model

## 12.1 Database purpose

The D1 database is a **Credential Vault data plane** and MUST be separate from the main SmartAIHub System-of-Record PostgreSQL database.

D1 infrastructure encryption-at-rest and TLS are defense-in-depth. Spec 272 still requires application-level envelope encryption.

A credential has stable metadata plus **immutable encrypted versions**. Rotation MUST NOT overwrite the only encrypted copy in place.

## 12.2 `credentials` — stable metadata / current pointer

```sql
CREATE TABLE credentials (
  credential_id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  tenant_id TEXT,
  provider_id TEXT NOT NULL,
  provider_origin_hash TEXT NOT NULL,
  auth_scheme TEXT NOT NULL,
  secret_type TEXT NOT NULL,

  current_version INTEGER NOT NULL,
  authz_epoch INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  display_hint TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  deleted_at TEXT
);
```

`credential_id` MUST be opaque and non-enumerable (at least 128 bits of CSPRNG entropy or equivalent). `display_hint` MUST NOT contain plaintext secret beyond a deliberately approved masked hint. Password-like/low-entropy secrets SHOULD have no hint.

`authz_epoch` increments on revoke, security hold, sensitive grant changes, ownership/rebind, and other changes that must invalidate stale capabilities.

## 12.3 `credential_versions` — immutable encrypted material

```sql
CREATE TABLE credential_versions (
  credential_id TEXT NOT NULL,
  credential_version INTEGER NOT NULL,

  ciphertext BLOB NOT NULL,
  secret_nonce BLOB NOT NULL,
  wrapped_dek BLOB NOT NULL,
  encryption_algorithm TEXT NOT NULL,
  wrap_algorithm TEXT NOT NULL,
  wrap_nonce BLOB,
  kek_version TEXT NOT NULL,
  aad_version INTEGER NOT NULL,
  binding_digest TEXT NOT NULL,
  fingerprint TEXT,

  version_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  superseded_at TEXT,
  destroy_after TEXT,

  PRIMARY KEY (credential_id, credential_version),
  FOREIGN KEY (credential_id) REFERENCES credentials(credential_id)
);
```

Rotation flow:

1. insert a new immutable encrypted version;
2. optionally validate it against the provider;
3. atomically move `credentials.current_version` to the new version and increment `authz_epoch`;
4. mark the old version `superseded`;
5. revoke/retire provider-side old key when applicable;
6. delete expired superseded ciphertext according to retention policy.

Failed validation MUST NOT destroy the currently active version.

## 12.4 `credential_grants`

```sql
CREATE TABLE credential_grants (
  grant_id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL,
  principal_type TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  operation_scope TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  policy_json TEXT NOT NULL,
  grant_epoch INTEGER NOT NULL DEFAULT 1,
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (credential_id) REFERENCES credentials(credential_id)
);
```

`policy_json` MUST validate against a versioned typed schema. Unknown policy fields MUST fail closed; free-form JSON MUST NOT silently create security semantics.

## 12.5 `credential_events`

Only security metadata, never plaintext:

```sql
CREATE TABLE credential_events (
  event_id TEXT PRIMARY KEY,
  credential_id TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  tenant_id TEXT,
  provider_id TEXT,
  operation_id TEXT,
  manifest_digest TEXT,
  authz_epoch INTEGER,
  result TEXT NOT NULL,
  policy_decision TEXT,
  request_correlation_id TEXT,
  previous_event_hash TEXT,
  event_hash TEXT,
  created_at TEXT NOT NULL
);
```

Long-term audit SHALL also be exported to a separate append-only/tamper-evident audit sink so compromise or Time Travel of the credential D1 cannot silently erase/rewrite the only audit copy.

Where hash chaining is used, `event_hash` SHOULD be an HMAC over the canonical event payload + `previous_event_hash` + sequence/domain separator using a versioned audit-HMAC key. A plain unkeyed hash chain alone does not prevent a database attacker from rewriting the chain. The independent audit sink remains authoritative for tamper detection.

## 12.6 `vault_outbox`

Security events and durable side-effect settlement SHALL use an outbox pattern containing **references/metadata only, never secret material**. This prevents “provider call succeeded but audit vanished” from being silently lost. High-risk side effects MAY require durable audit-intent persistence before outbound execution.

## 12.7 Indexing and sensitive metadata

Indexes SHOULD cover tenant/owner/status/provider/current-version/grant principal fields needed for authorization without decrypting secrets. Secret ciphertext/fingerprints SHALL NOT be placed into full-text/search/vector indexes.

Credential secret payload size SHALL be capped by policy (default recommended <= 256 KiB; provider-specific limits SHOULD be lower). Oversized certificate bundles or artifacts belong in a separately reviewed encrypted-object design rather than silently approaching D1's 2 MB row/BLOB limit.

---

# 13. Provider Manifest & Destination Binding

## 13.1 Core principle

A credential MUST NOT be usable with an arbitrary caller-supplied URL.

The caller supplies an abstract `operation`, not an unrestricted URL.

Example:

```text
credential_ref = cred_123
operation      = openai.responses.create
payload        = {...}
```

The Broker resolves:

```text
method
origin
path
auth injection
request schema
timeout
redirect policy
```

from a trusted provider manifest.

## 13.2 Trusted provider manifests

Built-in providers SHOULD use manifests stored in source control and reviewed/deployed through CI/CD.

Example:

```yaml
provider_id: openai
origin: https://api.openai.com
auth:
  type: bearer_header
  header: Authorization
operations:
  openai.responses.create:
    method: POST
    path: /v1/responses
    redirects: deny
```

Normal runtime users MUST NOT be able to mutate trusted provider origins in D1.

## 13.3 Custom providers

User-defined OpenAI-compatible/custom providers MAY be supported, but:

1. the exact scheme + host + port/origin SHALL be captured during credential enrollment;
2. `provider_origin_hash` SHALL be bound into AAD;
3. using the credential against another origin SHALL fail;
4. changing origin SHALL require explicit rebind/reapproval and preferably credential re-entry;
5. shared/platform credentials SHALL NOT be attachable to arbitrary custom origins;
6. IP literals, localhost, private/link-local metadata targets, and unsupported schemes SHALL be rejected unless a separately approved private-provider feature explicitly requires them.

## 13.4 Redirect handling

Authenticated provider calls SHALL default to:

```text
redirect = manual/error
```

The Broker MUST NOT automatically follow a cross-origin redirect while carrying a credential.

If a provider requires redirects, allowed redirect origins SHALL be explicitly declared in the provider manifest and covered by tests.

## 13.5 URL construction

Callers MUST NOT supply raw query strings that can inject authentication parameters.

Path variables and query parameters SHALL be schema-validated and encoded separately.

## 13.6 URL canonicalization and SSRF defenses

Before any outbound authenticated request, the Broker MUST parse/canonicalize the destination with the platform URL parser and compare the canonical tuple `(scheme, hostname, port)` against manifest policy. It MUST reject:

- URL userinfo (`user:pass@host`);
- fragments;
- non-HTTPS schemes unless explicitly approved;
- embedded/encoded IP-address tricks and malformed hosts;
- unexpected ports;
- localhost, loopback, link-local, metadata-service and private-network targets for public-provider profiles;
- Unicode/IDN host ambiguity unless canonical punycode form is explicitly approved;
- trailing-dot / alternate-host spellings that bypass exact host comparison.

Custom-provider support MUST have a separate risk class. If runtime DNS/private-network resolution cannot be authoritatively validated in Workers, the system SHALL fail closed for provider classes that require such assurance rather than claim complete SSRF protection.

## 13.7 Strict request builder

Provider adapters MUST build the outbound request from typed operation fields. Caller payload MUST NOT be able to override:

```text
origin / baseUrl / host
method (unless operation schema explicitly permits it)
Authorization / Proxy-Authorization
Cookie / Set-Cookie
Host
Connection / Transfer-Encoding
CF-* security/routing headers
x-api-key / provider auth header
redirect mode
TLS/proxy destination
```

Generic `headers`, `url`, `base_url`, `auth`, `credential`, `token`, or equivalent escape hatches are forbidden in public operation schemas unless a provider-specific adapter explicitly validates each allowed field.

---

# 14. Authentication Injection Rules

Supported schemes MAY include:

```text
bearer_header
api_key_header
basic_auth
oauth2_bearer
query_api_key
body_secret
custom_signed_request
```

## 14.1 Preferred order

Prefer:

1. Authorization/Bearer header
2. provider-specific secret header
3. signed request schemes
4. query parameter only if required by provider
5. secret in body only if required by provider

## 14.2 Query-string credentials

Some providers/APIs may require or support credentials in query parameters. This is a higher-risk exception.

If `query_api_key` is unavoidable:

- Broker constructs the URL internally;
- caller never receives the authenticated URL;
- observability MUST log origin + path only, or redact the secret query parameter before any log/tracing hook;
- error messages MUST not contain the raw URL;
- redirect policy MUST remain fail-closed;
- provider manifest MUST explicitly mark the secret query parameter name;
- analytics/referrer mechanisms MUST never receive the authenticated URL.

## 14.3 Public/publishable keys are not secrets

Some provider keys are intentionally shipped to browsers/mobile apps (for example, keys restricted by web origin, bundle ID, package signature, or provider-side API restrictions). Such values SHALL NOT be misrepresented as secret merely because they are called an “API key”. They belong in a **Public Integration Config** registry with enforced provider restrictions, ownership, rotation, and audit.

A long-lived unrestricted server credential MUST never be downgraded into this class.

## 14.4 Ephemeral delegation for browser/realtime workloads

For realtime/WebRTC/WebSocket/browser-direct providers that support scoped ephemeral credentials, the preferred model is:

```text
long-lived credential in Vault
        -> Broker authorization
        -> provider mint/session API
        -> short-lived scoped token/session secret
        -> browser/client
```

The delegated token MUST have the minimum TTL, audience, provider scope, and operation scope supported. It MUST NOT be renewable into a long-lived credential by the client. Long-lived Vault secrets MUST NOT be sent to browser JavaScript merely to avoid proxying a stream.

---

# 15. API / RPC Contracts

## 15.1 No plaintext read contract

There SHALL be no normal API equivalent to:

```text
getSecret(credential_ref) -> plaintext
```

Any exceptional administrative recovery/export capability requires a separate future security review and is out of scope by default.

## 15.2 Credential creation

Conceptual contract:

```ts
createCredential({
  provider_id,
  owner,
  secret_type,
  auth_scheme,
  secret_input,
  grants,
  expiry
}) -> {
  credential_ref,
  display_hint,
  provider_id,
  status
}
```

Response MUST NOT echo `secret_input`.

## 15.3 Provider execution

```ts
executeProviderOperation({
  credential_ref,
  operation,
  payload,
  execution_context,
  idempotency_key?
}) -> ProviderOperationResult
```

`execution_context` is not trusted merely because it came from a caller; authorization MUST be re-established by the Vault/Policy layer.

### 15.3.1 Ephemeral delegation contract

```ts
mintEphemeralProviderCapability({
  credential_ref,
  operation,
  requested_ttl_seconds,
  audience,
  execution_context
}) -> {
  ephemeral_token_or_session,
  expires_at,
  effective_scope
}
```

This contract is available only for provider adapters that explicitly support safe short-lived delegation. It MUST NOT return the underlying reusable credential.

## 15.4 Credential validation

```ts
validateCredential({
  credential_ref,
  validation_operation
}) -> {
  valid,
  provider_id,
  status,
  checked_at,
  sanitized_error?
}
```

Validation returns sanitized errors and no credential material.

## 15.5 Rotation

```ts
rotateCredential({
  credential_ref,
  new_secret_input
}) -> {
  credential_ref,
  new_version,
  rotated_at
}
```

## 15.6 Revocation

```ts
revokeCredential({
  credential_ref,
  reason
}) -> {
  status: "revoked",
  revoked_at
}
```

Provider-side revocation, where supported, SHOULD be separate from local Vault revocation and MAY require user approval.

---

# 16. Capability and Authorization Model

A valid credential reference alone is not authorization.

Authorization SHALL evaluate at least:

```text
caller service
actor identity
owner relationship
tenant boundary
principal grant
operation scope
provider
runtime context
approval requirement
budget/spend policy
time window
credential status
expiry/revocation
risk classification
```

Example policy:

```yaml
credential_ref: cred_123
owner: tenant_abc
allowed_principals:
  - mini_app:app_42
  - agent:agent_9
allowed_operations:
  - openai.responses.create
max_cost_usd_month: 100
requires_approval_for:
  - external_side_effect_high
```

Credentials SHALL fail closed when authorization or policy dependencies are unavailable unless an explicitly approved emergency policy exists.

For cost-incurring operations, budget enforcement SHALL use reservation/settlement semantics rather than a racy `check balance -> call provider` sequence. Concurrent calls MUST NOT be able to exceed a hard tenant/user/provider limit simply because they passed the check simultaneously.

Rate-limit policy SHALL be enforceable independently at service, tenant, actor, credential, provider and operation levels. Repeated 401/403/429 or destination-policy failures SHOULD trigger adaptive suppression/security signals without leaking whether an unauthorized credential reference exists.

Authorization capabilities SHOULD bind at least:

```text
credential_id
authz_epoch
grant_id / grant_epoch
operation
actor/run/job identity
expiry
nonce or unique capability id
```

The Broker SHALL re-check credential status/epoch immediately before authenticated egress. A capability minted before revoke/security-hold MUST fail after the epoch changes.

---

# 17. Use-Without-Disclosure

The default execution path SHALL be:

```text
Consumer
   │
   │ credential_ref + operation
   ▼
Vault/Broker
   │
   ├── authorize
   ├── decrypt temporarily
   ├── inject into approved request
   ├── call provider over HTTPS
   └── destroy references / allow GC
   │
   ▼
Provider response
   │
   ▼
Consumer
```

The following components MUST NOT receive reusable plaintext secrets unless a future explicit exception is approved:

- LLM prompts/context
- Skills
- Agent reasoning state
- Mini App frontend
- browser JavaScript after initial user entry
- MCP consumer
- workflow/job payload
- queues
- main PostgreSQL database
- R2 artifacts
- logs/traces
- analytics

---

# 18. Secret Ingestion Path

## 18.1 Browser/user entry

User-entered credentials SHALL be sent only over HTTPS and MUST never be placed in URL/query strings.

Preferred forms:

- protected credential-entry endpoint routed directly to the Vault ingestion handler; or
- a streaming/forwarding path that does not parse or log the secret in the main application service.

Production SHOULD use a dedicated **Credential Ingress Worker** for browser entry rather than exposing the Vault Worker itself to the public Internet. The Ingress Worker SHALL have no Root KEK and no Vault D1 binding; it performs session/CSRF/rate-limit/input-size checks and forwards the secret to the private Vault over a Service Binding.

A hardening profile SHOULD add application-layer client-to-Vault public-key wrapping (HPKE or another independently reviewed construction) so the public Ingress Worker does not receive reusable plaintext even inside its request body. Do not invent a custom cryptographic protocol without review.

## 18.2 UI behavior

After successful save:

- clear secret input field;
- do not repopulate existing secret;
- display only provider + status + masked hint if approved;
- edit means **replace/rotate**, not reveal;
- copy-secret control SHALL NOT exist by default;
- show usage grants and recent sanitized audit events.

Credential create/replace/revoke/share actions SHOULD require recent authentication; high-impact platform/tenant credentials SHOULD support step-up authentication and explicit confirmation. UI routes MUST enforce CSRF defenses, origin checks, clickjacking protections, and rate limits.

---

# 19. Logging, Tracing and Error Hygiene

## 19.1 Forbidden log fields

Never log:

```text
Authorization
Proxy-Authorization
x-api-key
api-key
access_token
refresh_token
client_secret
password
raw request headers
raw authenticated provider URL containing secret query parameters
raw credential request body
```

## 19.2 Safe log shape

```json
{
  "credential_ref": "cred_123",
  "provider_id": "openai",
  "operation": "openai.responses.create",
  "tenant_id": "tenant_abc",
  "actor_ref": "agent_9",
  "result": "success",
  "http_status": 200,
  "latency_ms": 812,
  "correlation_id": "..."
}
```

## 19.3 Redaction

Redaction MUST happen before data enters general logging/tracing pipelines, not as a later UI filter.

Tests SHALL inject canary secrets and verify they are absent from:

- Worker logs;
- exceptions;
- traces;
- audit records;
- request/response snapshots;
- test artifacts;
- queue payloads.

---

# 20. OAuth2 and Refresh Tokens

OAuth refresh tokens SHALL be treated as reusable credentials and stored encrypted in the Vault.

Access tokens SHOULD be generated just-in-time and kept in memory. If reuse/storage is required, they SHALL be encrypted and have provider TTL/expiry enforced.

Refresh flow MUST:

1. authorize requested operation;
2. decrypt refresh credential;
3. call the exact approved issuer/token endpoint;
4. avoid logging token endpoint request/response bodies containing tokens;
5. validate provider/issuer/audience/token type where applicable;
6. use access token only for approved provider origin/operations;
7. atomically rotate stored refresh token if provider issues a new one;
8. detect/handle refresh-token reuse or invalidation according to provider semantics;
9. increment credential/authz epoch on security-relevant token replacement.

OAuth authorization-code onboarding SHOULD require:

- PKCE S256 where supported/appropriate;
- one-time high-entropy `state`;
- exact registered redirect URI;
- short-lived authorization transaction state;
- explicit provider scopes shown to the user;
- callback correlation to the initiating user/tenant;
- no OAuth code/token in application logs or analytics.

OAuth client secrets are separate credentials and SHALL not be conflated with user refresh tokens.

## 20.1 Provider-authorized scope inventory

Where the provider exposes granted scopes/permissions, the Vault SHOULD record a non-secret normalized scope inventory and validation timestamp. SmartAIHub grants can only restrict usage further; they MUST NOT imply permissions the provider credential does not actually possess.

## 20.2 Device-local OAuth / subscription sessions

Some harnesses or provider subscriptions are intentionally authenticated on the user's PC/Mac and may not be exportable or suitable for central storage. These SHALL be represented as `credential_location = local_device` with a logical capability reference. The cloud Vault MUST NOT silently copy device-local refresh/session credentials into D1. Spec 224/259 runtimes resolve those references on the registered device.

Local-device implementations SHOULD use operating-system secure credential storage (for example Windows DPAPI/Credential Manager or macOS Keychain; Linux Secret Service/keyring where available), with device registration and user/session policy. Plaintext JSON/config files are not an acceptable default local vault.

---

# 21. Provider Registry Integrity

Provider destination integrity is security-critical.

A malicious modification such as:

```text
api.openai.com -> evil.example.com
```

could convert a valid Vault into a credential-exfiltration service.

Therefore:

1. built-in provider manifests SHALL be code/repository controlled;
2. production changes require CI/CD review and deployment authority;
3. manifests SHALL have a version/hash visible in audit events;
4. runtime D1 content SHALL not be the sole authority for built-in provider origins;
5. custom provider origins SHALL be credential-bound and separately authorized;
6. provider manifest changes that affect authentication destination SHALL trigger regression security tests.

---

# 22. Provider Response Handling

The Broker SHALL return only the provider result required by the requested operation.

It MUST:

- strip provider response headers that may contain tokens/cookies unless explicitly required;
- never forward `Set-Cookie` blindly to unrelated consumers;
- sanitize authentication failures;
- apply response-size limits;
- enforce content-type and streaming policy per operation;
- avoid storing full response bodies in credential audit records;
- avoid echoing request authentication metadata.

Textual provider errors/responses that are returned to callers MUST pass adapter-specific sanitization capable of removing accidentally echoed auth headers/tokens. Streaming adapters MUST define whether safe chunk-wise redaction is possible; if not, endpoints capable of echoing sensitive authentication context MUST disable raw pass-through streaming.

The Broker MUST sanitize `Location`, `WWW-Authenticate`, debug headers, request-id metadata, and provider error objects before exposing them to untrusted consumers.

---

# 23. Retry, Idempotency and Side Effects

Provider operations SHALL declare whether they are:

```text
safe_read
idempotent_write
non_idempotent_side_effect
```

Retry policy MUST depend on that classification.

The Broker MUST NOT automatically retry a non-idempotent external side effect unless:

- provider supports an idempotency key; or
- SmartAIHub has a deterministic deduplication contract.

Credential failures (401/403) SHOULD trigger sanitized status updates but MUST NOT cause repeated rapid retry loops.

For high-impact external side effects, persist an authorization/audit **intent** and economic reservation before sending the authenticated request. Persist result/settlement afterward through the Vault outbox. If the final result is unknown because of timeout/network ambiguity, return `outcome_unknown` and reconcile rather than blindly retrying.

---

# 24. Credential State Machine

Canonical states:

```text
pending_validation
active
expired
rotation_required
revoked
invalid
provider_disabled
security_hold
```

Allowed transition examples:

```text
pending_validation -> active
pending_validation -> invalid
active -> rotation_required
active -> expired
active -> revoked
active -> security_hold
rotation_required -> active
security_hold -> active      # explicit recovery approval
```

Revoked credentials MUST fail before decryption/provider call.

---

# 25. Emergency Security Controls

Provide administrative controls for:

1. revoke one credential;
2. revoke all credentials for a provider;
3. block a provider manifest/version;
4. put a tenant or user credentials on security hold;
5. disable all custom-provider calls;
6. freeze Vault writes;
7. rotate Root KEK;
8. rotate audit/fingerprint keys;
9. invalidate grants;
10. switch Broker into fail-closed emergency mode;
11. start `root_compromise_recovery` distinct from routine KEK rotation;
12. invalidate all capabilities issued before a global security epoch.

All emergency actions MUST produce independent audit evidence.

---

# 26. D1 Capacity and Scaling

D1 SHALL be treated as horizontally scalable storage, not an unlimited single database.

As verified against Cloudflare documentation on 2026-10-02:

- Workers Paid: up to 10 GB per D1 database;
- default 1 TB total D1 storage per account;
- 50,000 databases per paid account;
- rows per table are not independently capped beyond database storage;
- each individual D1 database processes queries serially/single-threaded, so latency affects throughput.

## 26.1 Phase 1

Start with one dedicated Vault D1 database while instrumenting:

- database size;
- read/write latency;
- overloaded responses;
- operation rate;
- tenant distribution;
- credential count;
- audit growth.

## 26.2 Phase 2 sharding

Before a single D1 database approaches throughput/storage risk, add Vault shards.

Recommended architecture:

```text
Credential Broker Router
        │
        ├── Vault Shard Worker A -> D1 A
        ├── Vault Shard Worker B -> D1 B
        ├── Vault Shard Worker C -> D1 C
        └── ...
```

Shard routing SHALL be stable and tenant-aware. The routing layer MUST avoid cross-shard plaintext credential movement.

The design SHALL avoid broadcast lookup of a `credential_ref` across all shards. Use either:

- a high-entropy credential reference containing a non-secret versioned shard-routing prefix; or
- a dedicated Vault Directory containing only routing metadata, never ciphertext/plaintext secrets.

Shard migration SHALL use encrypted-version copy + verification + atomic directory/pointer cutover, followed by source tombstoning. Plaintext MUST NOT be materialized merely to rebalance shards. Enterprise/high-isolation tenants MAY receive dedicated shards/databases.

A future implementation may use platform-level dispatch/runtime techniques where appropriate, but Spec 272 does not require premature sharding for beta.

---

# 27. Backup, Restore and Disaster Recovery

## 27.1 Required recovery properties

Recovery MUST preserve the relationship between:

- D1 ciphertext and immutable credential versions;
- wrapped DEK and KEK version;
- provider manifest/security binding;
- current-version pointer;
- grants and authorization epochs;
- external revocation/deletion journal;
- audit evidence.

A D1 restore is useless if the referenced Root KEK has already been destroyed. A restore can also be **dangerous** if it resurrects an old grant or a credential state from before revocation.

## 27.2 KEK retention

Old KEKs SHALL remain available for at least the rollback/backup recovery window while any restorable database snapshot may reference them. Key retirement MUST be based on both live-row coverage and recoverable-backup coverage.

## 27.3 External revocation/deletion journal

Revocation, security-hold, destructive delete, compromised-provider blocks, and emergency freezes SHALL be copied to a canonical security journal **outside the restorable Vault D1 timeline** (for example, the platform security control plane / independent append-only audit system).

After any D1 Time Travel/backup restore, the Vault MUST reconcile against this journal before serving traffic. A restored row MUST NOT become usable merely because the restore point predates its revocation.

## 27.4 Restore procedure

A production restore SHALL:

1. restore to an isolated/non-serving Vault instance;
2. bind only the KEK versions required for recovery;
3. run schema/integrity/AAD checks;
4. reconcile external revocation/security journal and current provider blocks;
5. reconcile manifest versions and current security policy;
6. verify sampled canary credentials without exposing plaintext;
7. verify cross-tenant isolation;
8. create a post-restore bookmark/evidence record;
9. receive explicit security approval before traffic cutover.

Quarterly/release-gated drills SHOULD test this exact sequence.

## 27.5 Deletion semantics and backup retention

Deleting a credential from the live D1 does not imply that every historical Time Travel snapshot instantly loses the old ciphertext/wrapped DEK. Product/legal documentation MUST distinguish:

- immediate operational revoke/delete (cannot be used);
- live-row deletion;
- eventual expiry from Cloudflare's recoverable backup/Time Travel window.

Do not claim instant cryptographic erasure from all historical D1 recovery points unless a separately reviewed per-record key-destruction design can prove it.

---

# 28. Development and Test Environments

1. Dev/staging SHALL use separate Vault databases and separate keys.
2. Production secrets MUST NOT be reused in local `.env`/`.dev.vars`.
3. Test provider credentials SHALL be low-privilege and independently revocable.
4. Fixtures SHALL use synthetic canary secrets.
5. CI SHALL scan artifacts/logs for known canary secret values.
6. Tests MUST fail if a plaintext canary appears outside the expected transient in-memory execution path.
7. Local development MUST NOT bind production Secrets Store values merely for convenience. Cloudflare production Secrets Store values are not available to normal local development; synthetic local secrets/keys are the expected path.
8. Staging/provider test credentials MUST be provider-side restricted by environment/account where possible.

---

# 29. Threat Model and Required Mitigations

| Threat | Required mitigation |
|---|---|
| D1 database leak | Envelope encryption; Root KEK stored separately in Secrets Store |
| Main PostgreSQL leak | No reusable credential plaintext stored there |
| Main Worker compromise | No Vault D1/KEK binding; Service Binding only |
| Agent prompt injection asks for key | No plaintext-read capability; operation-only broker |
| Agent supplies attacker URL | Provider manifest resolves destination; arbitrary URL denied |
| Provider manifest tampering | Built-in origins controlled by source/CI; versioned/hash audited |
| Cross-origin redirect | Redirect denied by default; explicit allowlist only |
| Tenant ID spoofing | Vault resolves/verifies identity/policy; does not trust caller fields |
| Service Binding caller assumed authenticated | Explicit capability/policy verification because Access context does not propagate |
| Logs capture Authorization | pre-log redaction; no raw headers/request bodies |
| Query-string API key leak | use only if required; Broker constructs; URL never returned/logged raw |
| Replay | short-lived capability tokens, idempotency/nonces where applicable |
| Revoked key still used | state checked immediately before decrypt/call |
| Root KEK rotation failure | versioned KEK + staged rewrap + rollback evidence |
| Stale grant | grant revocation checked at call time |
| OAuth token leakage | encrypted refresh token, token endpoint binding, no token response logs |
| D1 overload | metrics, backpressure, sharding plan |
| Worker code supply-chain compromise | locked dependencies, CI review, minimal package surface, deployment controls |
| Secret shown in UI | write-only UI semantics; masked hint only |
| Privileged Cloudflare account/CI compromise | dedicated Vault pipeline, least privilege, MFA, binding-change review, independent audit |
| D1 Time Travel resurrects revoked credential | external revocation/security journal + mandatory restore reconciliation |
| Rotation overwrites only good secret | immutable credential versions + atomic current-version pointer switch |
| Caller injects Authorization/Host/baseUrl in payload | strict typed request builder + reserved field/header denylist |
| Provider echoes credential in error/response | adapter-level response sanitization; restricted streaming |
| Budget race with concurrent provider calls | atomic reservation/settlement and authorization epoch |
| Browser/realtime feature pressures team to expose master key | ephemeral provider capability/session tokens or Broker proxy |
| Publishable browser key confused with server secret | explicit Public Integration Config classification |
| Secret remains usable after stale capability token | authz/grant epoch binding + pre-egress recheck |
| Account/store outage or accidental KEK deletion | dual-control recovery/escrow or approved external KMS profile |
| Root KEK is exposed | compromise runbook: new KEK + new DEKs + re-encrypt + provider-side credential rotation/revocation |
| D1 attacker rewrites unkeyed audit chain | keyed HMAC chain + independent append-only audit sink |
| Device-local subscription secret copied to cloud | separate local-device credential domain and logical reference |
| Data residency requirement incompatible with global service | residency classification + separately approved deployment/KMS profile; fail closed on unsupported requirements |

---

# 30. Service-to-Service Authorization

Service Binding connectivity alone is not sufficient for end-user authorization.

Every call SHALL carry/resolvable context such as:

```text
run_id
job_id
actor_ref
tenant_ref
project_ref
consumer_ref
requested_operation
approval_ref
correlation_id
```

The Vault SHALL validate these fields against trusted systems, not merely accept them.

Signed service/capability tokens MUST be short-lived, audience-bound to the Vault, non-replayable where practical, and include issuer, subject/service, expiration, unique token ID, operation scope, and security epoch. Unknown issuers/algorithms fail closed. Signature verification keys and rotation policy SHALL be independent from provider credentials.

For autonomous runs, the Vault SHOULD be able to resolve the run/job record in the canonical execution control plane and verify:

- job ownership;
- current lease/fencing token if relevant;
- approved capability set;
- budget;
- side-effect class;
- approval state.

---

# 31. Integration Contract for Agents, MCP and Mini Apps

Agents/MCP/Mini Apps receive a capability descriptor, not a secret.

Example:

```json
{
  "credential_ref": "cred_abc123",
  "provider": "openai",
  "capabilities": ["openai.responses.create"],
  "status": "active",
  "display_hint": "...Q7K2"
}
```

Tool/Skill interfaces SHOULD expose business operations such as:

```text
llm.generate(...)
github.create_issue(...)
google_drive.create_file(...)
provider.execute(operation, ...)
```

instead of exposing:

```text
secret.read(...)
secret.export(...)
```

For browser/realtime experiences, the integration MAY request a provider-supported ephemeral capability through `mintEphemeralProviderCapability`; it MUST NOT request the reusable credential. For device-local credentials, the capability descriptor identifies a local execution placement and SmartAIHub Runner resolves the secret locally.

---

# 32. Integration with User-Owned LLM Subscriptions

User-owned provider credentials SHALL be first-class Vault records.

Routing logic may choose between:

```text
platform_credential
user_credential
tenant_credential
project_credential
```

according to routing policy, cost, availability, consent, and provider capability.

The LLM router receives `credential_ref`, not the underlying API key.

Usage settlement MUST retain credential ownership metadata without copying the secret into billing records.

---

# 33. Admin and User UX

## 33.1 User credential page

Show:

- provider;
- credential label;
- owner/scope;
- status;
- masked hint if safe;
- last validated time;
- expiry;
- last used time;
- allowed apps/agents/projects;
- rotate/replace;
- revoke;
- test connection;
- usage summary;
- sanitized recent audit events.

Never show a reveal button by default.

## 33.2 Admin page

Show aggregate operational status without secret access:

- credential counts by provider/status;
- failing validation rate;
- rotation-required count;
- KEK version coverage;
- records remaining on old KEK;
- D1 capacity/latency;
- provider-manifest versions;
- suspicious denied destination attempts;
- redaction-test health;
- emergency controls.

Admin role MUST NOT automatically imply permission to reveal credential plaintext.

Admin UI MUST NOT provide a Root KEK value/reveal surface. It MAY show key version IDs, binding health, write-primary version, rewrap backlog, recovery-drill status, and last security-approved binding change.

---

# 34. Migration Plan

## M0 — Inventory and Leak Prevention

- inventory all locations currently storing provider keys/tokens;
- identify `.env`, PostgreSQL, Redis, KV, worker vars, workflow state, logs, CI variables, local runners;
- classify platform vs tenant vs user credentials;
- identify raw URL/query-key integrations;
- install log redaction before migration.

Exit criteria: credential inventory complete enough to plan migration; no known logging path intentionally records plaintext secrets.

## M1 — Vault Skeleton

- create dedicated Vault Worker;
- create dedicated D1 database;
- create Secrets Store Root KEK in production;
- establish Service Binding from approved SmartAIHub services;
- no provider traffic yet.

## M2 — Crypto Core

Implement and test:

- DEK generation;
- AES-256-GCM credential encryption;
- AES-KW DEK wrapping through Web Crypto;
- immutable `credential_versions`;
- atomic current-version activation;
- AAD canonicalization;
- KEK versioning;
- rotation/rewrap;
- canary leak scanning.

## M3 — Credential CRUD Without Reveal

Implement:

- create;
- validate metadata;
- list metadata;
- rotate/replace;
- revoke;
- grants;
- no secret read API.

## M4 — Provider Manifest + Broker

Implement trusted manifests for initial providers.

Suggested first set:

1. OpenAI
2. Anthropic
3. Google/Gemini
4. GitHub
5. SmartAIHub MCP/external endpoint model

Add exact-origin enforcement, redirect denial, header injection, sanitized errors.

## M5 — LLM Gateway Migration

Move platform/user LLM credentials behind Vault/Broker.

Maintain compatibility adapter only where necessary.

Prove:

- existing routing works;
- key never enters LLM prompt;
- cost/usage attribution still works;
- user-owned credential selection works.

## M6 — Agent/MCP/Mini App Migration

Replace direct credential passing with `credential_ref` + operation grants.

Block new features from introducing independent credential storage.

## M7 — OAuth + SaaS Integrations

Add refresh-token lifecycle, token endpoint manifests, rotation, expiry handling.

## M8 — Key Rotation, DR, Scaling

- production KEK rotation drill;
- isolated D1 restore drill;
- old-KEK coverage dashboard;
- load testing;
- define sharding trigger thresholds;
- test Time Travel restore against post-snapshot revoke/delete/security-hold events;
- test root-key recovery/escrow drill without exposing key material to normal operators.

## M9 — Enforcement

Add CI/static/runtime guardrails that reject:

- new plaintext secret columns in application schemas;
- code paths returning Vault plaintext;
- provider calls that combine `credential_ref` with arbitrary URL;
- log statements containing known secret header names without redaction;
- direct legacy credential storage outside approved exceptions.

---

# 35. Backward Compatibility

During migration, a compatibility adapter MAY accept legacy provider configuration and internally convert/resolve it to a Vault credential reference.

However:

- newly created credentials SHALL use Vault immediately;
- compatibility paths SHALL have a retirement date/metric;
- plaintext legacy DB columns SHALL be encrypted/migrated, then scrubbed where operationally safe;
- rollback SHALL not require reintroducing plaintext credential persistence;
- legacy compatibility adapters MUST never expose a Vault secret merely because an old interface previously accepted/returned a raw key.

---

# 36. Failure Behavior

The system SHALL fail closed when:

- KEK version is missing;
- ciphertext authentication fails;
- provider origin does not match credential binding;
- grant is missing/revoked;
- tenant mismatch occurs;
- credential is expired/revoked/security-held;
- provider manifest is unknown/disabled;
- operation is not declared;
- redirect target is not approved;
- authorization service cannot validate a privileged operation;
- security/revocation journal is unavailable during restore/recovery mode;
- residency/profile requirements cannot be satisfied;
- provider destination/request cannot be canonicalized unambiguously.

User-facing errors SHALL be sanitized and actionable without exposing secret/provider-auth details. Authorization lookup SHOULD avoid existence-oracle differences: an unauthorized/nonexistent `credential_ref` SHOULD produce indistinguishable external behavior where practical.

---

# 37. Performance Requirements

1. Vault metadata reads SHOULD avoid decrypting credentials.
2. Decryption occurs only immediately before an authorized use/validation/rotation step.
3. Plaintext credentials MUST NOT be cached across requests.
4. Encrypted records MAY use normal D1 indexes.
5. Provider calls MAY stream responses where provider adapter supports it, but secret-bearing request metadata must remain server-side.
6. Broker metrics MUST separate crypto/storage latency from provider-network latency.
7. Root key material SHALL not be cached in KV/Cache API. A per-invocation imported `CryptoKey` is preferred; any isolate-local optimization requires security review and MUST never make the raw secret globally observable.
8. Authorization/revocation-sensitive reads MUST NOT use an unconstrained stale D1 read replica. If D1 read replication is enabled, use Sessions/bookmark semantics or primary-consistent execution sufficient to guarantee the required post-write visibility.

---

# 38. Observability Metrics

Minimum metrics:

```text
vault_request_total
vault_denied_total
vault_decrypt_total
vault_provider_call_total
vault_provider_error_total
vault_redirect_denied_total
vault_destination_mismatch_total
vault_cross_tenant_denied_total
vault_revoked_use_denied_total
vault_kek_version_usage
vault_rotation_backlog
vault_d1_latency_ms
vault_provider_latency_ms
vault_redaction_canary_failures
vault_custom_provider_denied_total
vault_authz_epoch_mismatch_total
vault_restore_reconciliation_failures
vault_outbox_backlog
vault_ephemeral_token_mint_total
vault_budget_reservation_denied_total
vault_root_binding_change_total
```

Metrics MUST contain no secret material.

---

# 39. Security Test Suite

The following tests are mandatory before production certification.

## 39.1 Storage tests

- D1 row contains no plaintext canary secret.
- PostgreSQL contains no migrated plaintext canary secret.
- KV/R2/Queues/workflow state contain no canary secret.
- DB dump + source code without Secrets Store key cannot decrypt canary.

## 39.2 Crypto tests

- valid encrypt/decrypt round trip;
- ciphertext modification fails authentication;
- AAD field modification fails authentication;
- wrong KEK fails;
- wrong credential ID/AAD fails;
- nonce length validated;
- rotation to KEK V2 works;
- old KEK remains required only until all rows rewrapped.

## 39.3 Authorization tests

- same user/same tenant allowed according to grant;
- another user denied;
- another tenant denied;
- revoked grant denied;
- expired credential denied;
- forged caller-provided tenant/user fields denied;
- service-bound caller without valid actor capability denied when end-user authorization is required.

## 39.4 Provider destination tests

- approved exact origin allowed;
- arbitrary attacker URL denied;
- look-alike domain denied;
- cross-origin redirect denied;
- URL userinfo trick denied;
- unsupported scheme denied;
- localhost/private metadata target denied for public-provider credentials;
- custom-provider credential cannot be used against a different origin.

## 39.5 Leakage tests

Inject a unique canary secret and verify absence from:

- Worker logs;
- error output;
- tracing;
- audit;
- provider request URL unless provider explicitly requires query auth;
- browser response;
- Agent/MCP payload;
- LLM context;
- screenshots/test artifacts.

## 39.6 Query-key provider tests

For providers requiring a key in query string:

- authenticated raw URL never returned to caller;
- logs contain redacted/no query secret;
- redirects denied;
- exception stack contains no raw URL with secret;
- tracing exporter receives sanitized URL.

## 39.7 Load/failure tests

- D1 overload/backpressure behavior;
- provider timeout;
- Secrets Store/key binding missing;
- audit sink unavailable;
- authorization service unavailable;
- provider 401/403 storm;
- broker retry behavior for idempotent vs non-idempotent operation;
- stale D1 replica / revoke visibility test when read replication is enabled;
- Time Travel restore to a point before revocation then journal reconciliation;
- rotation failure leaves old version active;
- caller attempts to inject `Authorization`, `Host`, `baseUrl`, encoded URL, userinfo, alternate port, IDN look-alike;
- provider echoes canary secret in error body and Broker redacts it;
- concurrent cost-incurring calls cannot race past hard budget;
- stale capability with previous `authz_epoch` fails;
- ephemeral client-token mint exposes only short-lived delegated token;
- Vault deployment pipeline cannot bind Root KEK to unapproved Worker in policy test;
- simulated Root KEK compromise triggers provider-credential rotation plan and proves that routine rewrap is not falsely treated as sufficient remediation;
- keyed audit-chain tampering is detected against independent audit sink.

---

# 40. UAT Scenarios

Spec 271 UAT SHOULD consume at least these scenarios:

### UAT-272-01 — User adds OpenAI key

Expected:

- key accepted via secure body;
- response returns only `credential_ref` + masked metadata;
- D1 contains ciphertext;
- logs contain no key.

### UAT-272-02 — Mini App invokes approved operation

Expected:

- Mini App sends `credential_ref`;
- Broker verifies grant;
- provider operation succeeds;
- Mini App never receives key.

### UAT-272-03 — Prompt-injected agent requests credential plaintext

Expected: no plaintext-read capability available; request denied/not routable.

### UAT-272-04 — Agent tries `https://evil.example` with OpenAI credential

Expected: denied before provider call.

### UAT-272-05 — Provider returns redirect to attacker origin

Expected: redirect not followed; sanitized error/audit event.

### UAT-272-06 — Cross-tenant credential reference

Expected: denied even if credential ID is known.

### UAT-272-07 — Root KEK rotation

Expected: new writes use V2; old rows are rewrapped; old KEK not retired until references reach zero.

### UAT-272-08 — D1 dump simulation

Expected: dump contains no plaintext and cannot be decrypted without Root KEK.

### UAT-272-09 — Query-auth provider

Expected: provider call works; authenticated URL never appears in logs/traces/client response.

### UAT-272-10 — Revocation during autonomous task

Expected: next use fails closed even if run already holds a credential reference.

### UAT-272-11 — Rotation validation fails

Expected: new immutable version remains inactive/failed; previous active version is not overwritten and service continuity is preserved.

### UAT-272-12 — Time Travel restore before revoke

Expected: restored database is isolated, external security journal reapplies revocation, credential never becomes usable.

### UAT-272-13 — Caller injects auth/header/base URL

Expected: reserved fields/headers are rejected before any provider request.

### UAT-272-14 — Realtime browser session

Expected: Broker mints a provider-supported short-lived scoped token/session; browser never receives reusable Vault credential.

### UAT-272-15 — Stale capability epoch

Expected: capability minted before grant/revocation epoch change is denied at pre-egress check.

### UAT-272-16 — Publishable key classification

Expected: explicitly public/restricted browser key is handled by Public Integration Config and is never mislabeled as a hidden server secret; unrestricted server credential cannot be placed in that class.

---

# 41. Acceptance Criteria / Definition of Done

Spec 272 is production-ready only when ALL are true:

- [ ] Dedicated Credential Vault Worker exists.
- [ ] Main application Worker has no Vault D1 binding.
- [ ] Main application Worker has no Root KEK binding.
- [ ] Cloudflare Secrets Store contains versioned Root KEK(s).
- [ ] Dedicated D1 stores only encrypted credential material + metadata.
- [ ] Per-credential DEK envelope encryption implemented.
- [ ] AAD binds credential to owner/provider/origin/auth metadata.
- [ ] No normal plaintext secret read/export API exists.
- [ ] Provider calls use provider manifest operations, not arbitrary URL + credential.
- [ ] Redirects are denied by default.
- [ ] Custom-provider origin binding is enforced.
- [ ] Authorization does not trust user/tenant fields from RPC caller without verification.
- [ ] Access-context propagation limitation across Service Binding is handled explicitly.
- [ ] Logs/traces/errors pass canary leakage tests.
- [ ] Query-string auth exceptions have dedicated redaction tests.
- [ ] OAuth refresh-token path is encrypted and provider-bound.
- [ ] Rotation, revocation, expiry, and security-hold state transitions work.
- [ ] Root KEK rotation drill passes.
- [ ] D1 restore/rollback compatibility with KEK retention is documented and tested.
- [ ] LLM Gateway integration passes.
- [ ] Agent/MCP/Mini App integration uses `credential_ref`.
- [ ] Cross-tenant access tests pass.
- [ ] Arbitrary destination exfiltration tests pass.
- [ ] D1 capacity/latency monitoring exists.
- [ ] Sharding triggers are documented before production scale approaches single-D1 limits.
- [ ] Spec 271 UAT suite can execute UAT-272 scenarios.
- [ ] Legacy plaintext credential locations are inventoried and have migration owners.
- [ ] New development guidelines forbid independent credential stores without explicit security exception.
- [ ] New writes use AES-GCM payload encryption + AES-KW DEK wrapping (or an explicitly approved successor algorithm).
- [ ] Credential rotation uses immutable versions and atomic current-version activation.
- [ ] `authz_epoch`/grant epoch invalidates stale capabilities after revoke/security changes.
- [ ] Time Travel restore cannot resurrect revoked/deleted/security-held credentials without external-journal reconciliation.
- [ ] Vault provider request builder rejects caller-controlled auth headers, host/base URL, redirect mode and reserved routing fields.
- [ ] Root-key generation/encoding/recovery/escrow procedure has passed a controlled drill.
- [ ] Vault deployment pipeline is separated from normal application CI and binding changes require security approval.
- [ ] Production Vault Worker has no unnecessary public route/`workers.dev` exposure; browser ingestion uses a dedicated ingress boundary if needed.
- [ ] OAuth onboarding implements state/PKCE/redirect protections appropriate to the provider.
- [ ] Realtime/browser integrations use ephemeral delegation or broker proxy rather than exposing long-lived secrets.
- [ ] Public/publishable keys are classified separately from server secrets.
- [ ] Device-local credentials have an explicit local-vault execution path and are not silently uploaded.
- [ ] Budget reservation/settlement prevents concurrent hard-limit races for cost-incurring operations.
- [ ] Provider response sanitization handles accidental echoed credentials and unsafe response headers.
- [ ] Data-residency requirements are declared per tenant/profile and unsupported profiles fail closed.
- [ ] Routine Root KEK rotation and Root KEK compromise recovery are separate tested runbooks.
- [ ] Audit chain uses keyed integrity or equivalent tamper-evident protection plus an independent sink.
- [ ] Credential refs can route to shards without broadcast lookup and without exposing secret data.
- [ ] Local-device vault path uses OS secure storage rather than plaintext config by default.

---

# 42. Recommended Repository Layout

Illustrative layout; adapt to current repository conventions:

```text
apps/
  credential-ingress-worker/
    src/
      index.ts
      csrf.ts
      rate-limit.ts
      validation.ts
  credential-vault-worker/
    src/
      index.ts
      rpc/
      crypto/
        envelope.ts
        aes-kw.ts
        aad.ts
        root-key-provider.ts
        rotation.ts
      authz/
      credentials/
      providers/
        registry.ts
        manifests/
          openai.ts
          anthropic.ts
          google.ts
          github.ts
      broker/
        execute.ts
        redirect-policy.ts
        redaction.ts
      audit/
        outbox.ts
        hash-chain.ts
      recovery/
        revocation-journal.ts
        restore-reconcile.ts
      delegation/
        ephemeral.ts
      errors/
    migrations/
    tests/
      crypto/
      authz/
      egress/
      redaction/
      rotation/
      uat/
    wrangler.jsonc

packages/
  credential-contracts/
  provider-manifest-schema/
  secret-redaction/
```

The Vault Worker dependency surface SHOULD remain small and security-reviewed.

---

# 43. Implementation Guardrails

The implementation team SHALL NOT:

- add a temporary `GET /secret/:id` endpoint;
- store plaintext “just for beta”;
- copy provider keys into workflow payloads;
- put API keys into provider URLs when a header scheme exists;
- allow caller-controlled `baseUrl` for a credential bound to a trusted provider;
- log raw Request/Response objects around provider calls;
- place production KEK values in `.env`, CI output, issue comments, test snapshots, or spec files;
- store Root KEK in the same D1 database as wrapped credentials;
- trust a known `credential_ref` as proof of permission;
- automatically follow redirects for authenticated calls without an explicit manifest rule;
- allow ordinary Admin UI to reveal stored credentials;
- overwrite the only active encrypted version during rotation;
- use unconstrained stale replica reads for revoke/security-hold authorization;
- expose the Vault Worker publicly merely to support browser credential entry;
- treat a publishable/referrer-restricted browser key as equivalent to an unrestricted server secret;
- pass caller-supplied `headers`, `Authorization`, `Host`, `baseUrl`, proxy configuration, or redirect policy through to authenticated provider calls;
- claim immediate erasure from all D1 historical recovery points after live-row deletion;
- let ordinary app CI modify Root KEK bindings or Vault provider manifests.

---

# 44. Security Review Gates

Before production rollout, require independent review of:

1. crypto implementation;
2. AAD canonicalization;
3. provider destination enforcement;
4. redirect policy;
5. tenant authorization;
6. logging/redaction;
7. Secrets Store permissions/scopes;
8. Cloudflare Worker deployment permissions;
9. D1 backup/recovery + KEK retention;
10. custom-provider behavior;
11. OAuth token path;
12. emergency rotation/revocation;
13. Vault CI/CD and Cloudflare account privilege separation;
14. restore/revocation-journal reconciliation;
15. immutable-version rotation semantics;
16. OAuth/ephemeral delegation flows;
17. data-residency profile compatibility.

Any finding that could expose reusable credential plaintext is release-blocking.

---

# 45. Twelve-Pass Gap Review Incorporated

Spec 272 v1.1 completed a second structured review across twelve independent failure domains. Gaps found were incorporated directly into the normative design:

1. **Root-of-trust / Cloudflare control-plane review** — added dedicated Vault CI/CD, least privilege, binding-change governance, MFA expectations, and explicit account-admin threat boundary.
2. **Cryptographic-construction review** — changed new DEK wrapping to AES-KW, added root-key encoding/length validation, algorithm agility, immutable AAD semantics and golden canonicalization tests.
3. **Rotation/versioning review** — replaced single-row overwrite semantics with immutable `credential_versions`, atomic activation and failure-safe rollback.
4. **Backup/restore/revocation review** — identified D1 Time Travel resurrection risk; added external security journal and mandatory restore reconciliation plus accurate deletion semantics.
5. **Provider egress/SSRF review** — added canonical URL tuple validation, userinfo/IDN/port/private-target defenses and strict typed request builders.
6. **Request/response exfiltration review** — added reserved header/baseUrl denylist, provider-error response sanitization and streaming restrictions where redaction is unsafe.
7. **Authorization/concurrency/economic review** — added credential/grant security epochs, pre-egress recheck and atomic budget reservation/settlement.
8. **OAuth/realtime/browser review** — added PKCE/state/callback rules and provider-supported ephemeral delegation so browser/WebRTC workloads never need reusable master keys.
9. **Credential-classification review** — separated root secrets, encrypted external secrets, native Cloudflare bindings, intentionally publishable client keys, ephemeral credentials and device-local vault credentials.
10. **Ingress/UI operational review** — added dedicated Credential Ingress Worker boundary, step-up authentication, CSRF/origin/clickjacking controls and safer masked-hint rules.
11. **Scale/consistency/audit review** — added outbox/tamper-evident audit, D1 replica consistency rules, opaque IDs, payload-size policy, shard-ready versioned schema and restore metrics.
12. **Compliance/recovery/deployment review** — added root-key escrow/external-KMS abstraction, residency profiles, device-local handling, stronger production DoD and expanded UAT/security gates.

No known gap discovered in these twelve passes was intentionally deferred without an explicit profile/out-of-scope statement.

---

# 46. Final Canonical Rule

All SmartAIHub subsystems SHOULD converge on the following invariant:

> **A centrally managed reusable external-provider credential is stored as immutable encrypted versions in the Credential Vault, referenced by an opaque `credential_ref`, authorized with current security epochs at use time, injected only by the Secure Provider Broker into a canonical approved destination, and never returned to ordinary consumers. Root decryption authority remains separate in Cloudflare Secrets Store (or an approved RootKeyProvider profile). Native Cloudflare bindings, intentionally publishable client keys, ephemeral delegated tokens, and device-local credentials remain separate credential classes.**

This invariant is the primary architectural contract of Spec 272.

---

# 47. Verified Cloudflare Platform Facts Used by This Spec

Verified on 2026-10-02 against Cloudflare documentation:

1. **Secrets Store** — production beta currently supports up to 100 production secrets per account and one store per account; stored secret values cannot be read back through API/dashboard and are exposed only to associated services.  
   https://developers.cloudflare.com/secrets-store/manage-secrets/

2. **Secrets Store access control** — access is controlled by authorization plus secret scope.  
   https://developers.cloudflare.com/secrets-store/access-control/

3. **Service Bindings** — Workers can call other Workers without a publicly accessible URL; RPC is supported.  
   https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/  
   https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/

4. **Service Binding Access context** — Cloudflare Access context does not automatically propagate from Worker A to Worker B; downstream authorization must not assume it is present.  
   https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

5. **D1 limits (Workers Paid)** — 10 GB maximum per database, default 1 TB total storage per account, 50,000 databases per account, rows unlimited apart from storage limits; each database processes queries serially.  
   https://developers.cloudflare.com/d1/platform/limits/

6. **D1 data security** — D1 provides encryption at rest using AES-256 with GCM preferred and TLS for data in transit. This is defense-in-depth and does not replace application-level envelope encryption in this spec.  
   https://developers.cloudflare.com/d1/reference/data-security/

7. **Workers bindings** — Cloudflare resource bindings are capability-style integrations; underlying resource credentials are not exposed to Worker code for bound Cloudflare resources.  
   https://developers.cloudflare.com/workers/runtime-apis/bindings/

8. **Workers Web Crypto** — Workers currently implement AES-GCM, AES-KW, HKDF/HMAC and `wrapKey()`/`unwrapKey()` support required by the preferred envelope-encryption design.  
   https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

9. **Secrets Store Worker integration** — a bound account secret is read asynchronously with `.get()` inside the Worker; production secrets are not available to ordinary local development bindings.  
   https://developers.cloudflare.com/secrets-store/integrations/workers/

10. **Secrets Store value/limit facts** — secret values are strings up to 65,536 bytes; production Open Beta currently allows 100 secrets and one store/account.  
    https://developers.cloudflare.com/secrets-store/manage-secrets/

11. **Worker redirect behavior** — authenticated outbound `fetch()` must not use automatic cross-origin redirect following because forwarded headers can include `Authorization`; use manual redirect policy.  
    https://developers.cloudflare.com/workers/runtime-apis/request/

12. **D1 Time Travel / Sessions** — D1 supports point-in-time restore and bookmarks; if global read replication is enabled, replicas are asynchronous and Sessions/bookmarks provide sequential-consistency controls.  
    https://developers.cloudflare.com/d1/reference/time-travel/  
    https://developers.cloudflare.com/d1/best-practices/read-replication/

---

## End of Spec 272
