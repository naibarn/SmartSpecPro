# 094 - Personal Worker Access Keys, Permissions, and Quotas

Version: 1.0
Date: 2026-04-14
Status: Proposed
Depends-on: 081-hermes-agent-runtime-gateway-and-channel-interop, 082-work-os-case-ledger-and-operating-queues, 083-agent-registry-and-organization-model, 093-hermes-capability-expansion
Audience: Product, Runtime, Teams, Security, Admin, QA

## 1. Executive summary

SmartSpecPro already knows how to register and monitor workers, but the user experience is still fragmented. A user who wants to add a personal worker has to think like an operator instead of a product user.

This feature adds a self-service worker access control plane inside user Settings:

- a dedicated tab for creating worker access keys
- one-time secret display and revocation
- optional expiry
- clear runtime-family selection
- explicit permission presets and advanced allowlists
- worker-specific credit quotas
- detailed but safe worker identity metadata
- bilingual onboarding/help content

The goal is to let a user create a key once, hand it to Hermes/OpenClaw/ZeroClaw-or-compatible runtimes, register the worker back into SmartSpecPro, and then manage the worker with clear scope and spend controls.

The feature should also stay extensible for future runtime families such as NanoClaw if and when those become first-class runtime types in the codebase.

## 2. Problem statement

Today, worker onboarding is too implicit:

- the user-facing UI does not clearly own worker bootstrap key creation
- the secret lifecycle is not presented as a first-class self-service flow
- worker permissions and spend controls are not collected in one place
- audit metadata is spread across worker registration, fleet, and monitoring surfaces
- runtime onboarding guidance exists, but not as a coherent user workflow

This makes the feature harder to understand, harder to secure, and harder to support.

## 3. Goals

1. Add a user-facing `Workers` tab in Settings where each user can create and revoke their own worker access keys.
2. Support expiry as optional, and ensure keys are shown only once at creation.
3. Let users choose the worker family or runtime class they intend to register.
4. Capture detailed worker identity and runtime metadata for inspection and audit.
5. Let users define runtime permissions and credit limits for their registered worker.
6. Keep all secret handling fail-closed and tenant-bound.
7. Provide full help content in English and Thai.
8. Keep the flow behind a tenant-level worker-access rollout gate until admins enable it.
9. Let the user optionally pin a registered worker to a specific SmartSpecPro LLM provider so model aliases are routed deterministically when the worker uses the gateway.

## 4. Non-goals

1. This feature does not replace the existing tenant feature flags that gate whether a worker family is allowed.
2. This feature does not add a new top-level runtime family.
3. This feature does not expose raw worker access keys after creation.
4. This feature does not make workers cross-tenant or shared-owner by default.
5. This feature does not replace the existing worker registry or worker execution token model.

## 5. Solution overview

### 5.1 User-facing worker tab

Add a new tab in `Settings` called `Workers`.

The tab should be controlled by a tenant-level worker-access rollout gate. When the gate is off, the tab should explain that personal worker onboarding is not yet enabled, and the create/redeem flow must remain disabled.

The tab should let the user:

- create a worker access key
- set a label, runtime family, optional expiry, and optional default budgets
- choose a permission preset or switch to advanced controls
- see a list of active and revoked keys
- revoke or rotate a key
- review registered workers, last seen state, and current spend posture

Recommended default limits:

- a user may have multiple worker access keys, but only a bounded number of active keys at once
- the initial limit should be conservative and configurable by tenant policy
- the UI must surface the active-key count and warn when the user approaches the limit

### 5.2 Dedicated access-key object

Use a dedicated worker access-key object instead of reusing the existing user API key model.

The key object should:

- be opaque and unique
- be stored hashed at rest
- be shown only once when created
- be revocable
- support optional expiry
- carry tenant, user, runtime-family, and permission metadata
- be redeemable by Hermes/OpenClaw/ZeroClaw-compatible runtimes during registration

Canonical key states:

- `draft` - created in the UI but not yet redeemed
- `active` - redeemed or available for redemption
- `expired` - no longer redeemable because the expiry time passed
- `revoked` - manually disabled by the owner or an admin
- `rotated` - replaced by a newer key and no longer redeemable

Canonical key fields:

- `id`
- `tenantId`
- `ownerUserId`
- `label`
- `runtimeFamily`
- `permissionProfile`
- `permissionScopes`
- `creditQuotaPolicy`
- `expiresAt`
- `createdAt`
- `createdByUserId`
- `lastUsedAt`
- `revokedAt`
- `replacedByKeyId`
- `secretHash`
- `secretHint`
- `registrationCount`

The raw secret must only be revealed once at creation time. After that, the UI should show only the hint and lifecycle state.

Canonical API flow:

- `list` returns metadata only
- `create` returns the raw secret exactly once
- `revoke` disables the key
- `rotate` creates a new key and invalidates the old key in one user action
- `redeem` is used by the runtime bridge during registration
- `listWorkers` returns the worker records already registered by this user
- `updatePermissions` updates the permission profile and allowlists
- `updateQuotas` updates the credit quota policy

The implementation should fail closed if a tenant tries to use the worker tab while the tenant gate is off, or if the runtime family is not enabled for that tenant.

### 5.3 Worker identity and audit snapshot

When a worker registers, SmartSpecPro should store a rich identity snapshot:

- owner user
- tenant
- runtime type and runtime mode
- display name and stable external reference
- runtime family and capability families
- version/build metadata
- host and container/runtime identifiers where available
- API server policy state
- callback and delegated session readiness
- last seen and revocation state

Safe metadata allowlist for storage and display:

- `tenantId`
- `ownerUserId`
- `runtimeType`
- `runtimeMode`
- `workerMode`
- `displayName`
- `externalReference`
- `runtimeFamily`
- `capabilityFamilies`
- `version`
- `buildNumber`
- `platform`
- `osFamily`
- `containerId`
- `hostFingerprint`
- `apiServerEnabled`
- `apiServerBaseUrl`
- `remoteEndpointPolicy`
- `supportsDelegatedHttp`
- `supportsDelegatedMcp`
- `supportsCallbacks`
- `supportsBoundConnector`
- `llmRoutingMode`
- `preferredProviderId`
- `preferredProviderName`
- `lastSeenAt`
- `revokedAt`

Values that are sensitive or too unstable to persist verbatim should be hashed, normalized, or redacted before storage.

Default redaction rules:

- store only canonical hostnames, not full local filesystem paths
- hash device fingerprints and container identifiers unless the value is required for audit correlation
- redact platform tokens, API keys, bearer tokens, cookies, and session secrets
- normalize loopback URLs and policy exception identifiers before display
- never display raw worker registration secrets after the one-time create response
- treat `preferredProviderName` as display-only metadata; the canonical routing key is `preferredProviderId`

LLM provider routing for workers:

- `llmRoutingMode = auto` means SmartSpecPro may auto-resolve the provider from the model alias and tenant-enabled mappings
- `llmRoutingMode = pinned_provider` means the worker is bound to `preferredProviderId` and the gateway must fail closed if that provider is unavailable
- if a worker is registered with a pinned provider, the UI must surface that binding in the worker snapshot and settings tab

### 5.4 Permissions and spend

Permissions should be explicit and auditable.

The UI should offer:

- friendly presets for most users
- advanced controls for route families, file/RAG access, callbacks, MCP, jobs, skills, agents, and Work OS interactions
- a worker budget editor for hourly, daily, weekly, and monthly credit limits

The backend should continue to enforce limits server-side.

Canonical permission presets:

| Preset | Intended use | Minimum scope family |
|---|---|---|
| `read_only` | Inspect-only workers | read routes, diagnostics, and safe listing routes |
| `operator_basic` | General operator worker | read routes, claim routes, report routes, and limited callbacks |
| `content_worker` | Content and knowledge work | read routes, RAG routes, upload routes, and report routes |
| `mcp_enabled` | Workers that need delegated MCP | read routes, report routes, MCP catalog/ready routes |
| `full_personal_worker` | Advanced personal worker | all allowed worker families and route families for that tenant |

Advanced allowlists must map to concrete backend scope families rather than freeform labels. At minimum, the mapping must cover:

- route families
- knowledge / RAG / library access
- callback publishing
- delegated MCP access
- worker job claim/report routes
- Work OS integration routes
- budget read/update routes

Canonical permission vocabulary:

- `workers:register`
- `workers:heartbeat`
- `workers:claim`
- `workers:report`
- `workers:diagnostics`
- `delegate:http`
- `delegate:mcp`
- `callbacks:publish`
- `library:read`
- `library:write`
- `rag:read`
- `rag:write`
- `skills:execute`
- `agents:execute`
- `workos:read`
- `workos:write`

The permission editor must reject labels or scopes that are not part of the server-side vocabulary.

Revocation semantics:

- revoking the worker access key must stop future registration immediately
- if the key was never redeemed, no worker state needs to remain active
- if the key was already redeemed, the existing worker registration must be marked revoked and future delegated sessions must fail closed
- any cached or issued worker-bound tokens tied to the revoked registration must be rejected on the next verification check
- revocation should not silently delete audit history; it should preserve an audit trail while preventing new use
- worker access keys must only be managed by the owner user for that tenant unless an admin override path is explicitly being used

## 6. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/client/src/pages/Settings.tsx` | Tabbed user settings already exist | Add a first-class worker onboarding tab |
| `apps/web/client/src/components/settings/UserAPIKeysPanel.tsx` | One-time secret create/revoke pattern already exists | Reuse the UX pattern for worker access keys |
| `apps/web/server/routes/workerRuntime.ts` | Worker registration endpoint already exists | Add a user-friendly bootstrap secret management flow around it |
| `apps/web/server/services/workerAuthService.ts` | Worker registration token creation/verification already exists | Wrap worker onboarding in a dedicated key lifecycle |
| `apps/web/server/services/workerRegistryService.ts` | Worker ownership and metadata are already persisted | Extend the metadata capture and audit story |
| `apps/web/server/services/workerBudgetService.ts` | Budget enforcement already exists | Expose it as a user-editable worker setting |
| `apps/web/docs/help/en/*.md` and `th/*.md` | Bilingual help content already exists | Add worker onboarding docs in both languages |

## 7. Functional requirements

### 7.1 Worker key lifecycle

- A user can create a new worker access key from Settings.
- A user can select a worker family and set an optional expiry.
- The secret is shown only once.
- The key can be revoked at any time.
- The list view should show status, expiry, last used time, and any worker bound to the key.

### 7.2 Worker registration

- A runtime bridge can redeem the worker access key to register a worker.
- The registration must store the owner user and tenant.
- The runtime family on the key must match the runtime family being registered.
- If a key is expired, revoked, or tenant-disabled, registration must fail closed.

### 7.3 Metadata and inspection

- Registration should capture as much host/runtime detail as the runtime can safely report.
- Sensitive material must be redacted or hashed.
- The Settings worker tab and Admin Monitoring must show useful audit metadata without exposing secrets.

### 7.4 Permissions and quotas

- Users must be able to assign a permission preset.
- Advanced controls must allow route-family allowlists and service-family allowlists.
- Users must be able to set hourly, daily, weekly, and monthly credit caps, with empty values meaning no cap.
- Limits must be enforced server-side on worker-routed usage.

### 7.5 Bilingual guidance

- The worker tab must have English and Thai help content.
- Help text should explain:
  - how to create a key
  - how to hand it to a worker runtime
  - how to revoke it
  - how to set permissions and quotas

## 8. Security and safety requirements

1. The worker access secret must be shown once and never re-displayed.
2. The secret must be stored hashed at rest, not in plaintext.
3. Registration must validate tenant, user, runtime family, and expiry.
4. Revocation must immediately stop future use.
5. The UI must not suggest that a worker can cross tenants or share ownership.
6. Permission widening must be explicit and auditable.
7. Quotas must fail closed if the budget state cannot be read.
8. Worker metadata must be safe to inspect in operator views.

## 9. Dependencies and relationships

This feature sits on top of:

- Feature 081 for Hermes runtime gateway behavior
- Feature 082 for canonical work intake and Work OS integration
- Feature 083 for governed identity and policy vocabulary
- Feature 093 for Hermes-specific capability display and rollout surfaces

It should not duplicate those features. It should connect them into a self-service onboarding and control experience for end users.

## 10. Acceptance criteria

1. A user can open Settings and see a `Workers` tab.
2. The user can create a new worker access key and see the secret exactly once.
3. The user can revoke the key and it immediately stops being usable.
4. A supported worker runtime can register successfully using the key.
5. The registered worker is clearly owned by the user who created the key.
6. The user can set permissions and credit quotas for the worker.
7. Admin and team surfaces can inspect the worker with detailed metadata.
8. English and Thai help content explain the flow end-to-end.
9. Revoking a key prevents future registration and invalidates the associated worker registration on the next verification check.
10. The system rejects permission values that are not part of the server-side vocabulary.
