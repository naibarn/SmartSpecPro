# Implementation Plan

## Objective

Make browser-policy settings complete and internally consistent by defining:

- which controls belong to platform admin
- which controls belong to tenant admin
- which controls belong to workflow/tool owners
- which controls belong to end users

while preserving safety and fitting the current SmartSpecPro schema and UI.

## Current-Codebase Fit

The existing system already has most of the right primitives:

- tenant feature enablement via `tenants.featureFlags`
- tenant baseline policy via `tenant_browser_policy_config`
- tenant decision rules via `tenant_browser_policy_rules`
- workflow-specific capability controls via `browser_workflow_entitlements`
- user preference infrastructure via `users.userPreferences`

The main missing piece is a formal user-scoped policy layer and a UI split that matches ownership.

## Recommended Ownership Model

### 1. Platform Admin (`admin`)

Owns immutable or ceiling-style controls:

- global release gates for `automationCopilot` and `browserTool`
- platform emergency kill switch
- hard maximum enforcement mode allowed in production rollout
- allowed model/provider catalog for browser analysis
- minimum audit requirements and tamper-evidence requirement
- max/min approval TTL bounds
- hard bans on risky capabilities:
  - cross-tenant browsing
  - raw browser bypass
  - untrusted file upload/download classes if compliance requires
- default tenant templates for new tenants

These should not be editable by tenant admins or users.

### 2. Tenant Admin (`domain_admin`, optionally `admin`)

Owns tenant baseline and risk posture:

- feature toggles:
  - `automationCopilot`
  - `browserTool`
- tenant browser baseline:
  - `enabled`
  - `enforcementMode` within platform ceiling
  - `defaultApprovalTtlSeconds` within platform bounds
  - `reviewCadenceDays`
  - `allowedDomains`
  - trusted destination patterns
  - default vision model from platform allowlist
  - tenant kill switch
- tenant rules:
  - sensitive domain rules
  - action-class approval rules
  - data handling rules
  - redaction requirements
- tenant default user policy template:
  - what users may self-customize
  - whether personal domain subsets are allowed
  - whether users may store personal trusted destinations

### 3. Workflow/Tool Owners

Own workflow-scoped allowances under the tenant baseline:

- `browser_workflow_entitlements`
- capability allowlist / denylist
- data class limits
- quotas:
  - `maxExtractedRecords`
  - `maxExternalSends`
  - `maxOriginTransitions`
  - `maxNonReadActions`
- risk rating
- review owner and expiry

This layer should remain mandatory for any workflow that uses browser automation.

### 4. End User (`user`)

Own self-restriction, personal defaults, and approval UX only.

Allowed user-scoped controls:

- stricter personal browsing domain subset
- stricter action-mode preference:
  - e.g. "always read-only for me"
- stricter transfer preferences:
  - block downloads
  - block uploads
  - block external sends
- personal approval preferences:
  - shorter approval TTL
  - always require approval for commit/restricted actions
  - never auto-resume after approval
- notification preferences for approval requests/incidents
- preferred vision model only if it is in tenant/platform allowlist
- session-local trusted shortcuts/bookmarks for already-allowed destinations

Disallowed user-scoped controls:

- adding new allowed domains outside tenant allowlist
- widening allowed capabilities
- disabling audit requirements
- lowering tenant-required approval barriers
- bypassing workflow quotas

## Effective Policy Resolution

Use deterministic precedence:

1. platform hard block
2. tenant kill switch / tenant hard block
3. workflow entitlement block
4. user self-restriction block
5. explicit approval requirement
6. allow

Field-level merge rule:

- booleans for safety-critical settings use logical `AND` or most restrictive value
- allowlists use intersection
- denylists use union
- quotas use minimum positive bound
- approval TTL uses minimum value
- enforcement mode resolves to the narrowest allowed mode

## Data Model Recommendation

### Keep existing tables as-is for baseline layers

- `tenant_browser_policy_config`
- `tenant_browser_policy_rules`
- `browser_workflow_entitlements`
- `browser_policy_decisions`

### Add a dedicated user policy profile table

Recommended new table:

- `user_browser_policy_profiles`

Suggested fields:

- `tenantId`
- `userId`
- `enabled`
- `modeCap`
- `allowedDomainsSubset`
- `blockedCapabilities`
- `blockedTransfers`
- `requireApprovalForActionClasses`
- `preferredVisionModel`
- `approvalTtlSecondsCap`
- `notificationConfig`
- `metadata`

Rationale:

- this is stronger than generic `users.userPreferences`
- it needs tenant scoping and explicit policy semantics
- it will likely need auditability and future review ownership

Keep lightweight UX preferences in `users.userPreferences` only if they are not security-relevant.

## UI Placement Recommendation

### Platform Admin Console

Move platform-only controls here:

- release readiness
- rollout gates
- platform emergency switch
- global compliance/audit ceilings
- provider/model allowlist

### Tenant Security / Automation Policy

This should become the real home for tenant policy, accessible to:

- `domain_admin` for own tenant
- `admin` for any tenant

Contents:

- feature toggles
- tenant baseline policy
- allowed domains and trusted destinations
- tenant rules
- workflow entitlements
- user customization policy

### User Settings > Automation

New end-user page/panel:

- personal restrictions
- approval/notification preferences
- personal default mode
- visible explanation of effective policy:
  - platform
  - tenant
  - workflow
  - user

## Risks And Mitigations

### Risk: UI ownership remains inconsistent

Mitigation:

- separate platform settings from tenant settings
- stop using the global admin page as the long-term tenant policy home

### Risk: user settings accidentally widen permissions

Mitigation:

- implement an explicit "narrow-only" merge engine
- reject writes that exceed tenant/platform ceilings

### Risk: policy becomes too fragmented

Mitigation:

- display "effective policy" and "source of restriction" in the UI
- keep the number of editable user controls intentionally small

## Acceptance Criteria

- every browser-policy setting has a clear owner layer
- tenant admins can manage tenant policy without platform-admin-only UI
- users can self-restrict and personalize approvals without privilege expansion
- effective policy resolution is deterministic and fail-closed
- workflow entitlement logic remains the mandatory middle layer for automation workflows

## Rollout Notes

1. Keep the existing `AdminSettings` browser panel as a temporary bridge
2. Introduce a tenant-owned policy page and reuse current backend services
3. Add user policy profiles and merge logic
4. Later deprecate tenant policy editing from the global admin page once parity is reached
