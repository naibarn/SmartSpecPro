# Implementation Plan

## Objective

Build a self-service worker access control plane that lets each user create, revoke, and manage personal worker registration keys from Settings, then use those keys to register Hermes/OpenClaw/ZeroClaw-compatible workers with explicit permissions and credit quotas.

## Current-codebase fit

The plan fits the current repository in a few important ways:

- `Settings.tsx` already has a tabbed layout and is the natural place for a `Workers` tab.
- `UserAPIKeysPanel.tsx` already solves the one-time secret pattern, so the new worker key UI should follow the same interaction model instead of inventing a new one.
- `workerAuthService.ts` and `workerRuntime.ts` already implement the backend registration handshake, so the new feature should extend that handshake rather than replace it.
- `workerRegistryService.ts` already persists ownership and runtime metadata, so the feature should add richer metadata capture and worker-key linkage there.
- `workerBudgetService.ts` already enforces worker credit windows, so the user-facing quotas editor should write into that existing policy model.
- The help content system already supports bilingual docs, so the onboarding guidance can be made explicit in English and Thai without new infrastructure.

## Proposed architecture

### 1. A dedicated worker access-key domain

Create a new worker access-key domain instead of reusing user API keys.

Why:

- worker bootstrap keys have different trust boundaries from generic API keys
- they need runtime-family binding, optional expiry, and worker-specific audit metadata
- the user mental model is "create a worker key" rather than "create an API key"

Implementation direction:

- add a server-side service for issuing, listing, revoking, and redeeming worker access keys
- store only a hash of the secret at rest
- return the raw secret only once on creation
- keep the record tenant-bound and owner-bound
- model the lifecycle explicitly as `draft`, `active`, `expired`, `revoked`, and `rotated`
- preserve `secretHint`, `registrationCount`, `lastUsedAt`, and `replacedByKeyId` for auditability
- enforce a conservative active-key cap per user and surface the count in the UI

### 2. Add a `Workers` tab to Settings

Add a new Settings tab that contains:

- a key creation form
- a key list with status and last-used information
- a worker list showing registered workers for the user
- a permissions and budgets editor for selected workers
- a bilingual onboarding/help section

The tab should render a locked, explanatory state unless the tenant-level worker-access rollout gate is enabled.

This tab should reuse the visual pattern of the existing `UserAPIKeysPanel` and `DesktopHostSettingsPanel`, but the language should be "my workers" rather than "platform APIs".

### 3. Extend worker registration to redeem access keys

The registration flow should:

- validate the worker access key
- ensure the runtime family being redeemed matches the family selected at key creation
- refuse expired/revoked/tenant-disabled keys
- register the worker and write `registeredByUserId` / tenant ownership to the registry
- persist an explicit LLM routing policy for workers that need deterministic gateway usage, including `llmRoutingMode` and `preferredProviderId`
- return worker-bound tokens only after the worker is accepted
- reject the flow if the key is outside the tenant gate or if the runtime family is not allowed for the tenant

### 4. Capture detailed metadata safely

On registration, capture a detailed snapshot of the runtime and host.

Capture as much as the runtime can provide:

- runtime family/type
- runtime mode
- worker mode
- LLM routing mode and preferred provider binding when the worker is configured to pin a SmartSpecPro provider
- external reference
- display label
- version/build
- host/container identifiers
- platform and OS details
- capability report
- delegated readiness and callback readiness
- policy exception identifiers when present

Redact or hash anything sensitive, and keep the raw secret out of all persistent stores.
Use a narrow allowlist for persisted metadata so the feature does not become a general-purpose device inventory system.

### 5. Bind permissions and quotas to the worker record

Use the existing worker budget model for quotas and extend the policy editor to set the hourly, daily, weekly, and monthly caps.

For permissions:

- start with presets for common user intents
- provide an advanced mode for route-family, file/RAG, MCP, callback, job, skill, and Work OS access
- keep the enforcement logic server-side so the UI remains advisory, not authoritative

Treat permission presets as named mappings to backend scope families. Do not let the UI store arbitrary freeform scope strings without server-side validation.
Define a canonical scope vocabulary in the backend and require the UI to validate against it.

## Affected files and modules

Likely client files:

- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/components/settings/WorkerAccessPanel.tsx` or equivalent new panel
- `apps/web/client/src/locales/en/settings.json`
- `apps/web/client/src/locales/th/settings.json`
- `apps/web/client/src/components/settings/__tests__/...`

Likely server files:

- `apps/web/server/services/workerAccessKeyService.ts` or equivalent new service
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerBudgetService.ts`
- `apps/web/server/services/workerPolicyService.ts`
- `apps/web/server/services/workerFleetService.ts`

Likely shared/schema files:

- `apps/web/shared/workerRuntime.ts`
- `apps/web/drizzle/schema.ts`
- relevant migration files

Likely docs:

- `apps/web/docs/help/en/worker-access-management.md`
- `apps/web/docs/help/th/worker-access-management.md`

## Risks and mitigations

- **Secret leakage risk:** show the worker access secret only once and never persist plaintext.
- **Ownership confusion:** keep the owner tied to `registeredByUserId` and tenant-bound access-key records.
- **Permission overreach:** use presets + advanced allowlists, and fail closed when capability data is missing.
- **Budget mismatch:** reuse the current budget model and add tests so quota writes and quota reads stay aligned.
- **UX complexity:** keep the default flow simple, with advanced controls collapsed behind an explicit toggle.
- **Premature exposure:** gate the full create/redeem flow until tenant admins enable the feature.
- **Revocation drift:** when a key is revoked, mark the underlying worker registration revoked too and reject further token verification.

## Acceptance criteria

- The user can create and revoke worker access keys from Settings.
- A runtime can redeem the key and register a worker without manual backend token minting.
- The key is not re-shown after creation.
- The user can set worker permissions and quotas in the same control surface.
- The worker is clearly owned, auditable, and visible in the operator views after registration.
- Workers that pin an LLM provider show that binding clearly in policy and monitoring views.
- English and Thai help content explain the full workflow.
