# Feature Spec: 128-Age-Aware Safety Policy

**Spec ID:** 128-age-aware-safety-policy  
**Created:** 2026-07-01  
**Status:** Proposed  
**Owner:** Account / Security / Policy / Chat / Media Generation / Admin  
**Builds on:** Existing user profile/preferences, private vault PIN, chat execution, media generation router, moderation service  
**Related:** Feature 121 MCP Connect, Feature 127 Article To Storyboard Video Project, existing Private Vault security flow

---

## 1. Executive Summary

SmartSpecPro needs a system-wide age-aware safety policy, not a feature limited to Chat or Media Studio. The platform must know the user's current effective age from a declared date of birth, classify the user as `child`, `teen`, `adult`, or `unknown`, and enforce access and content rules across all sensitive surfaces.

The default must be conservative:

```text
no date of birth on human profile
  -> ageBand = unknown
  -> effective enforcement = child_under_13
  -> user can only access surfaces/content allowed for <=13 child mode
  -> user can update date of birth only through a protected profile/security flow
```

This feature introduces:

- a required date-of-birth profile attribute for human login users;
- an actor/audience resolution layer for API keys, widgets, delegated workers, and internal system users that do not naturally have their own date of birth;
- server-side age calculation based on the current date;
- centralized age/access policy controlled by system admins;
- reusable policy checks for routes, menus, features, chat prompts, chat responses, media/audio prompts, reference assets, model access, and high-risk workflows;
- a reusable Security PIN layer built on the existing Private Vault PIN design;
- temporary PIN unlock for age-gated surfaces until logout/login session end or local day rollover, whichever comes first;
- age-aware moderation before and after LLM/chat execution;
- age-aware media generation preflight before any prompt leaves SmartSpecPro.

The core principle is:

> Age policy is a backend contract. UI controls may guide the user, but backend policy decides what can run.

---

## 2. Problem Statement

The original feasibility question focused on Chat and Media Studio image/video generation. That is too narrow because age-sensitive access can appear through many surfaces:

- direct Chat prompts;
- skill execution from Chat;
- Media Studio image/video/audio generation;
- Storyboard Review regeneration;
- Presentation and Article-to-Video workflows;
- MCP-connected media providers;
- workflow automation and team/orchestrator flows;
- private chat and private vault content;
- admin-created menu items or future sensitive tools.

If age filtering is implemented only in Chat or Media Studio UI, users and automation paths can bypass it through backend routes, other surfaces, or future integrations. The solution must therefore be a central policy layer that every sensitive backend boundary can call.

---

## 3. Goals

1. Require each human login user to have a profile date of birth.
2. Calculate real current age from the current date minus date of birth.
3. Classify effective age into `child`, `teen`, `adult`, or `unknown`.
4. Treat `unknown` as equivalent to child under 13 until the user declares date of birth.
5. Allow system admins to configure the platform-wide age policy.
6. Allow admins to mark features, menus, route groups, actions, prompt categories, media categories, model families, and custom topics as available to `child`, `teen`, `adult`, or blocked.
7. Add reusable policy enforcement for all system surfaces, not only Chat and Media Studio.
8. Filter Chat requests before model execution and Chat responses after model output.
9. Preflight every image/video/audio generation prompt before sending it to provider APIs, MCP providers, workers, or Python backend.
10. Preserve existing workflows for adult users and non-sensitive requests.
11. Reuse and extend the existing Private Vault PIN pattern into a general Security PIN rather than creating a duplicate PIN system.
12. Allow PIN-based temporary unlock for age-gated surfaces until logout/session end or day rollover.
13. Require PIN verification before editing date of birth after it has been set.
14. Support private chat and future high-safety surfaces using the same Security PIN unlock primitive.
15. Log policy decisions with redacted inputs for audit/debugging without storing raw sensitive prompts unnecessarily.
16. Handle non-human actors safely: widget system users, API keys, delegated workers, system agents, and internal workers must resolve an owner/audience policy instead of being forced to store fake birthdays.

---

## 4. Non-Goals

1. Do not rely on client-side hidden buttons or disabled controls as the security boundary.
2. Do not store age as a static number; age must be computed from date of birth at request time.
3. Do not let temporary PIN unlock modify the stored date of birth or permanent age band.
4. Do not bypass hard legal/compliance blocks with a PIN unlock if a policy marks the category as non-overridable.
5. Do not rewrite all existing feature surfaces in v1. Start at shared backend boundaries and add UI affordances incrementally.
6. Do not log raw date of birth or raw blocked prompt text into credit metadata, normal application logs, or analytics events.
7. Do not create a second independent PIN if an existing Private Vault PIN can be safely adapted behind a shared Security PIN abstraction.
8. Do not make provider-side safety refusal the primary control. SmartSpecPro must preflight before provider submission.

---

## 4.1 Legal And Policy Prerequisite

The current public Privacy page states that SmartAIHub is not intended for users under 18 and that known child data should be deleted. That conflicts with enabling real child/teen access as a product behavior.

Implementation must therefore support two policy modes:

1. **Adult-only service mode**: default until legal/product changes public policy. Users below the configured minimum service age are blocked from normal product use and can only access account/support flows required by policy.
2. **Age-tiered service mode**: enabled only after Terms/Privacy/consent requirements are updated. Child and teen users can access only surfaces allowed by the central age policy.

The age-aware safety system is still useful in adult-only mode because it:

- treats unknown-age users conservatively during rollout;
- prevents adult-only generation before DOB is declared;
- handles accidental or undeclared underage access;
- creates audit evidence for policy decisions;
- keeps future child/teen support from requiring another architecture redesign.

Launch gate: do not enable child/teen product access until Privacy/Terms, retention behavior, support playbooks, and any required guardian/consent workflow are approved.

---

## 5. Product Direction

### 5.1 Recommended Solution

Create a centralized **Age-Aware Safety Policy** system with three layers:

1. **Identity layer:** profile date of birth, age calculation, age band, Security PIN status.
2. **Policy layer:** admin-managed rules that map surfaces/actions/content categories to minimum age band and override behavior.
3. **Enforcement layer:** reusable backend checks called from chat, media generation, private surfaces, menus, routes, workflow execution, and future tools.

This is preferred over a Chat/Media-only filter because it creates one contract that new surfaces can adopt without redesigning child safety each time.

### 5.2 Alternative Approaches Considered

#### Option A: Chat and Media Studio only

Add checks in Chat UI and Media Studio UI.

Trade-off:

- fastest visible result;
- low implementation cost;
- weak security boundary;
- does not cover skills, workflows, Storyboard Review, MCP, or future surfaces.

Rejected for v1 because it does not satisfy system-wide age control.

#### Option B: Provider moderation only

Rely on OpenAI/provider moderation and media provider refusals.

Trade-off:

- less local code;
- inconsistent behavior across providers;
- often happens after prompt leaves SmartSpecPro;
- cannot control menus/features/private chat/admin policy.

Rejected as primary control. Provider moderation remains defense-in-depth.

#### Option C: Central age policy service

Add a server-side policy service used by all sensitive boundaries.

Trade-off:

- more planning and tests;
- requires careful migration and admin policy UI;
- strongest long-term architecture;
- protects current and future surfaces consistently.

Chosen approach.

---

## 6. Age Model

### 6.1 Stored Profile Data

Recommended durable profile shape:

```ts
type UserSafetyProfile = {
  dateOfBirth: string | null; // ISO date, YYYY-MM-DD, stored server-side
  dateOfBirthUpdatedAt: string | null;
  dateOfBirthVerifiedAt?: string | null;
  dateOfBirthChangeCount?: number;
  safetyProfileVersion: number;
};
```

Preferred database approach:

- add typed columns to `users` for date-of-birth metadata if this becomes compliance-critical;
- keep derived and UI-specific preferences in `users.userPreferences.safetyProfile`.

Lower-risk implementation path:

- start with `userPreferences.safetyProfile.dateOfBirth` only if migrations must be deferred;
- promote to typed columns before broad rollout or compliance audit.

### 6.1.1 Actor And Audience Resolution

The current codebase has actors that are not normal human login users:

- `widget-system@{tenantId}.internal` accounts created by `widgetService`;
- API keys and public API auth contexts;
- delegated worker sessions with `ownerUserId`;
- MCP public server sessions;
- `system_agent` and internal worker/operator contexts.

These actors must not be required to store fake dates of birth.

Policy resolution must distinguish:

```ts
type AgePolicyActorKind =
  | "human_user"
  | "api_key"
  | "delegated_worker"
  | "widget_visitor"
  | "system_user"
  | "system_agent";

type AgePolicySubject = {
  actorKind: AgePolicyActorKind;
  actorUserId: number | null;
  ownerUserId?: number | null;
  tenantId: string | null;
  countryCode?: string | null;
  jurisdictionPresetId?: string | null;
  audienceBand?: "unknown" | "child" | "teen" | "adult";
  audienceSource:
    | "profile_date_of_birth"
    | "owner_profile"
    | "visitor_declared"
    | "tenant_widget_default"
    | "api_key_owner"
    | "delegated_owner"
    | "system_default";
};
```

Resolution rules:

| Actor | Age source | Default when missing |
|---|---|---|
| Human login user | user's own DOB | `unknown` -> child-under-13 |
| API key / public API | API key owner user's DOB, unless request carries a stricter audience policy | owner unknown -> child-under-13 |
| Delegated worker | `ownerUserId` DOB and delegated manifest limits | owner unknown -> child-under-13 |
| Widget visitor | visitor-declared age if widget collects it, else tenant widget audience default | child-under-13 |
| Widget system user | never its own DOB; resolve through visitor/widget policy | child-under-13 |
| System agent/internal job | no DOB; must carry an explicit owner/audience when producing user-visible content | non-user-visible internal tasks bypass age gates but not hard safety gates |

This avoids breaking system users and automation while preserving fail-closed behavior for user-visible content.

### 6.2 Age Calculation

Effective age must be computed server-side:

```text
age = current date in policy timezone - dateOfBirth
```

Rules:

- use calendar age, not approximate days divided by 365;
- compare month/day to decide whether birthday has occurred this year;
- use the platform policy timezone by default;
- allow tenant override only if product/legal approves jurisdiction-specific age policy;
- never trust client-provided `age` or `ageBand`.

### 6.3 Age Bands

Default band mapping:

| Band | Criteria |
|---|---|
| `unknown` | no valid date of birth |
| `child` | age < 13 by default, configurable |
| `teen` | age >= child threshold and < adult threshold |
| `adult` | age >= adult threshold |

Default thresholds:

```ts
childMaxExclusive = 13;
adultMinInclusive = 18;
```

Admin policy may support jurisdiction/tenant configuration later, but v1 should use a clear platform default.

### 6.3.1 Country And Jurisdiction Presets

The profile should collect country/region of residence in addition to date of birth.

Rules:

- store country as ISO 3166-1 alpha-2 where possible, e.g. `US`, `TH`, `GB`, `DE`;
- for EU/EEA member states, resolve a country-specific preset when known and otherwise fall back to the EU default;
- keep `countryOfResidence` separate from UI language/locale because a Thai-language user may live in the US or EU;
- country changes require password/PIN/2FA confirmation after first setup, are rate-limited, and are audit logged;
- if country is missing, invalid, or unsupported, apply the strictest supported default: adult-only service mode plus child-under-13 enforcement for unknown age until profile completion.

Policy resolution order:

```text
explicit admin tenant override
  -> user's countryOfResidence preset
  -> tenant default country preset
  -> platform strict fallback preset
```

Preset object:

```ts
type JurisdictionPreset = {
  id: string;
  countryCodes: string[];
  source: "legal_default" | "platform_conservative" | "tenant_override";
  sourceRefs: Array<{
    label: string;
    url: string;
    accessedAt: string;
  }>;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  lastReviewedAt: string;
  nextReviewDueAt: string;
  legalReviewStatus: "draft" | "approved" | "expired" | "blocked";
  approvedBy?: string | null;
  minimumServiceAge: number;
  childMaxExclusive: number;
  adultMinInclusive: number;
  childConsentAge: number;
  under18ServiceAllowed: boolean;
  guardianConsentRequiredBelowAge: number | null;
  defaultLegalMode: "adult_only" | "age_tiered_with_consent";
  unknownCountryBehavior: "strict_fallback";
  retentionPolicyKey: string;
  consentPolicyKey: string;
  supportPlaybookKey: string;
  notes: string;
};
```

Initial presets:

| Preset | Country codes | Defaults |
|---|---|---|
| `US_COPPA_DEFAULT` | `US` | `minimumServiceAge=18` until product/legal enables minors; `childMaxExclusive=13`; `adultMinInclusive=18`; `guardianConsentRequiredBelowAge=13`; unknown age -> child-under-13. |
| `TH_PDPA_DEFAULT` | `TH` | `minimumServiceAge=20` for adult-only contract posture unless legal approves a minors flow; `childMaxExclusive=10`; `adultMinInclusive=20`; `guardianConsentRequiredBelowAge=20` when consent is the lawful basis for minors who are not legally competent; unknown age -> child-under-13. |
| `EU_GDPR_DEFAULT` | EU/EEA fallback | `minimumServiceAge=18` until age-tiered flow is legally approved; `childMaxExclusive=13`; `adultMinInclusive=18`; `childConsentAge=16` default under GDPR Article 8 unless member-state preset lowers it; unknown age -> child-under-13. |
| `UK_CHILDREN_CODE_DEFAULT` | `GB` | `minimumServiceAge=18` until legal approves minors; `childMaxExclusive=13`; `adultMinInclusive=18`; `childConsentAge=13`; apply under-18 age-appropriate design/privacy-by-default controls. |
| `STRICT_UNKNOWN_COUNTRY` | fallback | adult-only service mode; `childMaxExclusive=13`; `adultMinInclusive=18`; `guardianConsentRequiredBelowAge=18`; no age-tiered access until country is confirmed. |

EU/EEA member-state child-consent overrides:

```ts
const EU_CHILD_CONSENT_AGE_BY_COUNTRY: Record<string, 13 | 14 | 15 | 16> = {
  AT: 14,
  BE: 13,
  BG: 14,
  HR: 16,
  CY: 14,
  CZ: 15,
  DK: 13,
  EE: 13,
  FI: 13,
  FR: 15,
  DE: 16,
  GR: 15,
  HU: 16,
  IS: 13,
  IE: 16,
  IT: 14,
  LV: 13,
  LI: 16,
  LT: 14,
  LU: 16,
  MT: 13,
  NL: 16,
  NO: 13,
  PL: 16,
  PT: 13,
  RO: 16,
  SK: 16,
  SI: 15,
  ES: 14,
  SE: 13,
};
```

These presets are implementation defaults, not legal advice. They must be versioned, source-linked, and reviewable by product/legal before enabling age-tiered service mode. Any preset with `legalReviewStatus !== "approved"` or `nextReviewDueAt` in the past must fail closed to `STRICT_UNKNOWN_COUNTRY` or adult-only behavior.

### 6.4 Unknown Age Behavior

`unknown` must enforce as `child_under_13`.

This means:

- unknown users can use only child-safe features;
- unknown users see prompts to complete date of birth;
- backend calls receive `ageBand = "unknown"` and `enforcementBand = "child"`;
- policy logs must distinguish true child from unknown-child-enforced mode.

---

## 7. Security PIN And Temporary Unlock

### 7.1 Existing Private Vault PIN

The current codebase already has Private Vault PIN behavior in:

- `apps/web/server/routers/users.ts`
- `apps/web/server/services/privateVaultService.ts`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/lib/privateVault`

This feature should generalize that concept into a **Security PIN**.

Long-term migration target:

```text
existing userPreferences.privateVault.pinHash
  -> userPreferences.securityPin.pinHash
  -> privateVault.enabled keeps its own feature setting
  -> Private Vault uses the shared Security PIN unlock token
```

However, the current codebase already issues Private Vault bearer tokens with:

- token type `private_vault`;
- header `x-private-vault-token`;
- a `private_vault:{tenantId}:{pinVersion}` scope;
- a 12-hour TTL;
- client persistence in localStorage through `apps/web/client/src/lib/privateVault.ts`;
- automatic tRPC header injection in `apps/web/client/src/main.tsx`;
- server extraction in `apps/web/server/_core/context.ts`.

Because Finance, Library, WorkOS, Document Management, and other private surfaces already depend on that exact behavior, v1 must **not** directly replace the Private Vault token contract.

Recommended v1 implementation:

- keep `privateVault` storage and token behavior intact;
- introduce `SecurityPinService` as an adapter over the existing PIN hash/version helpers;
- add a new `protected_surface` token type for age/private-chat unlocks instead of reusing `private_vault` tokens;
- add a new request header, for example `x-protected-surface-token`, or a typed token map if the tRPC context is expanded;
- keep `x-private-vault-token` working for existing routes until a later migration proves compatibility.

If storage migration is deferred, keep the storage shape but create an abstraction:

```ts
SecurityPinService
  setPin()
  verifyPin()
  issueUnlockToken(scope)
  validateUnlockToken(scope)
```

Then Private Vault and Age Unlock both call the abstraction, while each surface still receives only the token type and scope it is allowed to use.

### 7.1.1 Token Compatibility Contract

Do not make the age unlock token global or interchangeable with the current private vault token.

Token requirements:

```ts
type ProtectedSurfaceUnlockTokenClaims = {
  sub: string; // user id
  type: "protected_surface";
  scopes: string[]; // e.g. protected_surface:age_override:tenantId:pinVersion:dayKey
  jti: string;
  exp: number;
  pinVersion: number;
  profileVersion: number;
  policyVersion: number;
  jurisdictionPresetId?: string;
  tenantId: string;
  dayKey: string; // YYYY-MM-DD in policy timezone
};
```

Implementation should reuse the existing bearer-token primitives in `apps/web/server/_core/tokens.ts` (`signBearerToken`, `verifyBearerToken`, `hasScope`) rather than adding a second JWT stack. The token `type` and `scopes` must be explicit so protected-surface tokens cannot be accepted by worker, marketplace extension, private vault, or generic access-token routes.

Validation must check:

- user id;
- tenant id;
- token type;
- requested scope;
- current PIN version;
- current safety profile version;
- current policy version when the token was issued for an age/policy-sensitive override;
- active jurisdiction preset id when country-specific policy affects the requested scope;
- current policy day key;
- JWT expiration;
- normalized tenant id, using the same varchar tenant resolver pattern as existing routers when `ctx.tenantId` and `user.currentTenantId` differ in type;
- optional server-side revocation list when available.

The current Private Vault token remains valid only for private vault-compatible scopes. Age unlock and private chat unlock should use the new protected-surface token path.

Protected-surface token parsing must be available in both tRPC and non-tRPC paths:

- tRPC context: extend `apps/web/server/_core/context.ts` with `protectedSurfaceToken`;
- Express/SSE routes: add a small shared extractor for `x-protected-surface-token` so `/api/llm/stream`, OpenAI-compatible routes, public API routes, and MCP adapters do not duplicate parsing;
- public API and delegated worker paths may not have browser localStorage, so they must pass unlock/audience context through authenticated request metadata, not client-only helpers.

### 7.2 PIN-Protected Date Of Birth Editing

Date of birth must be easy to set the first time but protected afterward.

Rules:

- first-time date-of-birth setup may be allowed after normal authentication;
- if a Security PIN exists, changing date of birth requires PIN;
- if no Security PIN exists and date of birth is already set, require password/2FA or force Security PIN setup before change;
- every date-of-birth change is audit logged;
- rate-limit date-of-birth changes and PIN attempts;
- apply progressive delay or temporary lockout after repeated failed PIN attempts;
- record failed PIN attempts with redacted audit metadata and never log the PIN value.

### 7.3 Temporary Age Unlock

The user requested PIN unlock that temporarily makes locked age-gated surfaces behave as adult.

Recommended interpretation:

- PIN unlock does **not** change stored date of birth.
- PIN unlock creates a temporary `ageOverride = adult` token for overridable policy checks.
- Token expires at the earliest of:
  - logout/session end;
  - local day rollover according to policy timezone;
  - explicit lock action;
  - PIN version change;
  - safety profile version change, including DOB or country update;
  - policy version or active jurisdiction preset change when it changes the relevant rule;
  - tenant switch or tenant context mismatch;
  - admin revocation.

Effective policy shape:

```ts
type EffectiveAgeContext = {
  actualAgeBand: "child" | "teen" | "adult" | "unknown";
  enforcementBand: "child" | "teen" | "adult";
  temporaryUnlockActive: boolean;
  temporaryUnlockScopes: string[];
  unlockExpiresAt: string | null;
};
```

Important security rule:

- temporary unlock may satisfy `overridable` age gates;
- temporary unlock must not bypass `non_overridable` legal/safety gates.
- temporary unlock is a product decision with high policy sensitivity; legal/product approval is required before enabling it for actual underage accounts.

Examples:

- private chat access may be overridable with PIN;
- adult media prompt generation may be overridable if admin policy allows;
- explicit child exploitation, sexual content involving minors, self-harm instruction, illegal activity, and other hard-block categories must remain blocked even after PIN unlock.

### 7.4 Unlock UX

Surfaces should show a consistent unlock affordance:

- Chat composer: show lock state and `Unlock with PIN` when age policy blocks the request class.
- Media Studio: show lock banner and `Unlock with PIN` for adult-only controls if the policy allows override.
- Private Chat: require Security PIN if configured.
- Settings > Security: manage Security PIN and date-of-birth edit protection.

The unlock must be explicit. Do not automatically unlock the entire system because the user unlocked an unrelated surface unless the token scope is intentionally global.

---

## 8. Admin Policy

### 8.1 Central Policy Object

Admins need a central policy to define age access rules.

Proposed shape:

```ts
type AgeSafetyPolicy = {
  version: number;
  enabled: boolean;
  enforcementMode:
    | "observe"
    | "prompt_only"
    | "enforce_sensitive_surfaces"
    | "enforce_all";
  killSwitchEnabled: boolean;
  rollout: {
    requireDobForNewUsers: boolean;
    requireCountryForNewUsers: boolean;
    promptExistingUsersForDob: boolean;
    promptExistingUsersForCountry: boolean;
    requireSafetyProfileOnLogin: boolean;
    enforceUnknownAsChildAfter?: string; // ISO date, optional staged deadline
  };
  legalMode: {
    under18ServiceAllowed: boolean;
    minimumServiceAge: number; // default 18 until Privacy/Terms are updated
    underMinimumBehavior:
      | "restrict_to_account_support"
      | "suspend_pending_review"
      | "delete_or_export_then_delete";
    guardianConsentRequired?: boolean;
  };
  jurisdiction: {
    defaultPresetId: string;
    strictFallbackPresetId: "STRICT_UNKNOWN_COUNTRY";
    presets: Record<string, JurisdictionPreset>;
    countryPresetMap: Record<string, string>;
    allowTenantOverride: boolean;
  };
  thresholds: {
    childMaxExclusive: number;
    adultMinInclusive: number;
    timezone: string;
  };
  unknownAgeMode: "enforce_child_under_13";
  surfaces: Record<string, AgePolicyRule>;
  contentCategories: Record<string, AgePolicyRule>;
  modelFamilies: Record<string, AgePolicyRule>;
  promptCategories: Record<string, AgePolicyRule>;
  menuItems: Record<string, AgePolicyRule>;
  bootstrapExemptions: string[];
  customRules: AgePolicyRule[];
};

type AgePolicyRule = {
  minimumBand: "child" | "teen" | "adult";
  blockedBands?: Array<"unknown" | "child" | "teen" | "adult">;
  behavior: "allow" | "warn" | "block" | "sanitize" | "require_pin_unlock";
  override: "none" | "security_pin" | "admin_only";
  hardBlock?: boolean;
  reasonCode: string;
  userMessageKey: string;
};
```

### 8.2 Admin Controls

Admins should be able to configure:

- age thresholds;
- country/jurisdiction presets and strict fallback behavior;
- rollout/enforcement mode using the same observe-first pattern already used by existing policy surfaces;
- emergency kill switch;
- minimum service age and whether under-18 product access is legally enabled;
- default unknown-age enforcement;
- which menus are visible to child/teen/adult;
- which tRPC route/action groups require teen/adult;
- which chat categories are blocked or sanitized;
- which media categories are blocked;
- which model families/providers are adult-only;
- which workflows/skills require adult mode;
- whether PIN unlock is allowed for each rule;
- audit log retention and redaction policy.

### 8.3 Menu And Route Policy

Menu policy is useful for UX but not enough by itself.

Required distinction:

- menu visibility: client guidance;
- route/action enforcement: backend security boundary.

Every protected menu item should map to a backend policy key. If a user calls the backend route directly, the same policy must apply.

Codebase fit:

- `packages/shared/src/constants/menu.ts` currently filters menu items by platform, role, optional overrides, and optional `requiresFeature`.
- `getVisibleMenuItems()` defaults to showing feature-gated items when `enabledFeatures` is missing for backward compatibility.
- existing menu overrides are role/platform visibility, not age-band policy.

Therefore age policy must not rely on menu hiding alone. V1 should keep the existing menu system as a UX hint and add a separate `AgePolicyMenuProjection` that maps `menuItemId -> policyKey -> decision`. Backend route/action enforcement remains required even when the menu item is hidden.

### 8.3.1 Bootstrap Exemptions

The age gate must not block the user from fixing the age profile or from administrators recovering a bad policy rollout.

Always-available paths while age is `unknown`:

- authentication, logout, and account recovery;
- profile/date-of-birth setup;
- Settings > Security PIN setup and unlock management;
- Settings > Profile fields required to complete age profile;
- admin/domain-admin age safety policy editor;
- admin/domain-admin emergency kill switch;
- help/support links required to resolve account access.

These exemptions are not content-generation privileges. Chat, media generation, private chat, public API generation, and custom tools still use the effective age policy.

### 8.3.2 Mandatory Safety Profile Completion Gate

For human interactive users, date of birth and country/region of residence are required profile fields for production enforcement. The product should not rely on every feature page to remember this requirement.

Recommended production behavior:

- after login/session refresh, resolve `SafetyProfileCompletionStatus`;
- if `dateOfBirth` or `countryOfResidence` is missing and the active rollout mode requires completion, redirect the user to a dedicated profile completion screen before normal product routes render;
- the completion screen should collect both fields in one flow and explain that age is calculated from date of birth and policy is selected from country/region of residence;
- submitting the completion form must call backend procedures that validate and persist the fields, then re-fetch the profile status before releasing the route gate;
- after completion, immediately evaluate minimum-service-age and jurisdiction rules; if the user is under the active minimum service age, route to the configured account/support/privacy flow instead of releasing normal product routes;
- the gate must apply to human users only, not widget system users, delegated workers, API-key actors, or non-user-visible system agents.

The gate should distinguish UX gating from security:

- client route guard: prevents confusing navigation and gives a clear completion path;
- backend policy guard: remains authoritative for Chat, media, private chat, public API/MCP, workflows, and other protected actions.

Never create an all-page lockout. The following must stay reachable even when the safety profile is incomplete:

- logout;
- account recovery and session/device recovery;
- safety profile completion page;
- Settings/Profile fields needed for DOB and country completion;
- Settings/Security for PIN setup when required by the completion or edit flow;
- help/support/appeal routes needed to resolve account access;
- admin/domain-admin safety policy editor and kill switch for authorized admins.

Redirect-loop prevention:

- do not redirect from the completion page to itself repeatedly;
- preserve the original target route as `returnTo` only when it is an internal safe path;
- if profile status cannot be loaded, show a retry/support state rather than silently allowing sensitive product routes;
- completion status must include a profile version or timestamp so multi-tab clients can refresh when another tab completes or changes the profile;
- any cached completion status must be invalidated when DOB, country, tenant policy version, jurisdiction preset version, or enforcement mode changes;
- if policy kill switch or force rollback is active, completion can degrade to prompt-only, but backend content policy still treats unknown DOB/country conservatively.

Rollout recommendation:

- new human users: require DOB and country during onboarding or first authenticated route before normal product use;
- existing users: start in `observe`/`prompt_only`, then enforce the completion gate by tenant after metrics show low risk;
- admins: still complete their own human profile, but emergency safety policy and kill-switch routes remain exempt.

### 8.4 Custom Topic Policy

Admins must be able to define custom blocked topics for tenant or platform policy, such as:

- adult products;
- weapons;
- gambling;
- medical diagnosis;
- finance/tax advice;
- political persuasion;
- dangerous challenges;
- self-harm;
- sexual content;
- violent content;
- sensitive marketplace categories.

Custom topic policy should be represented as rules that can be attached to chat, media, workflow, and menu scopes.

---

## 9. Enforcement Architecture

### 9.1 Core Services

| Component | Responsibility |
|---|---|
| `AgeProfileService` | Load date of birth and compute actual age/age band |
| `SecurityPinService` | Set/verify PIN and issue scoped unlock tokens |
| `AgeSafetyPolicyService` | Load admin policy and resolve effective rule |
| `AgePolicyEnforcer` | Check whether a request/action/content is allowed |
| `AgeModerationClient` | Classify prompt/output/reference metadata for age-sensitive categories |
| `PolicyAuditLogger` | Log decisions with redaction and reason codes |

### 9.2 Request Context Contract

Every sensitive route should be able to resolve:

```ts
type PolicyRequestContext = {
  userId: number;
  tenantId: string | null;
  actorKind?: AgePolicyActorKind;
  ownerUserId?: number | null;
  audienceBand?: "unknown" | "child" | "teen" | "adult";
  audienceSource?: string;
  surface: string;
  action: string;
  originSurface?: string;
  protectedSurfaceToken?: string | null;
  privateVaultToken?: string | null;
  now: Date;
};
```

Codebase alignment:

- `TrpcContext` currently contains `privateVaultToken` only.
- v1 should extend `apps/web/server/_core/context.ts` to parse a new protected-surface token header without changing the existing private vault header.
- client tRPC header injection should mirror the existing `getPrivateVaultAccessToken()` pattern but use separate storage and naming for protected-surface tokens.
- Express routes such as `/api/llm/stream` do not automatically receive tRPC context, so they need their own extraction/validation path or a shared request-context builder.
- Public API and MCP routes often have `AuthContext` rather than `TrpcContext`; they should use the same policy service through an Express-compatible adapter.

Enforcement returns:

```ts
type PolicyDecision = {
  allowed: boolean;
  action: "allow" | "warn" | "block" | "sanitize" | "require_pin_unlock";
  actualAgeBand: "unknown" | "child" | "teen" | "adult";
  enforcementBand: "child" | "teen" | "adult";
  reasonCode: string;
  userMessage: string;
  policyVersion: number;
  policySnapshotHash: string;
  jurisdictionPresetId?: string;
  classifierVersion?: string;
  classificationConfidence?: number;
  requiresManualReview?: boolean;
  degradedMode?: "none" | "policy_unavailable" | "classifier_timeout" | "classifier_uncertain";
  auditId?: string;
  sanitizedInput?: unknown;
};
```

### 9.2.1 Classifier And Policy Failure Semantics

Age safety must define deterministic behavior when a dependency is slow, unavailable, or uncertain. Do not let each route invent its own fallback.

Recommended defaults:

| Failure | Observe / Prompt Only | Enforce Sensitive / Enforce All |
|---|---|---|
| Policy config cannot load | allow bootstrap exemptions, log `age_policy_unavailable`, evaluate sensitive generation as strict child-under-13 when possible | fail closed for Chat/media/public API/MCP/private chat generation; allow bootstrap exemptions |
| Jurisdiction preset is expired/unapproved | log would-block and use strict fallback | fail closed to adult-only/strict fallback for age-tiered access |
| Classifier timeout before provider dispatch | log `age_classifier_timeout`; do not submit provider call for sensitive media if classification is required | block or require review for sensitive generation; do not deduct credits |
| Classifier confidence below threshold | log `age_classifier_uncertain`; use stricter matching rule | block, sanitize, or route to manual review depending on policy and surface |
| Audit write fails | continue safe non-admin requests without raw data leakage and emit operational metric | block policy-admin writes or show admin warning if the change cannot be audited |

Operational requirements:

- `AgePolicyEnforcer` should have a small explicit latency budget per surface, configured in policy or service constants.
- Timeouts must return structured decisions with `degradedMode`, `reasonCode`, and redacted audit/metric events.
- Credit reservation, provider dispatch, worker dispatch, and Python media task creation must not run after a block, timeout-block, or review-required decision.
- Bootstrap exemptions remain reachable even during degraded mode.
- Reason codes must distinguish policy denial from operational failure so support and alerts can triage correctly.

### 9.3 Backend Enforcement Points

Minimum v1 enforcement points:

- `chat.executeSkill`
- regular chat message/LLM route paths, including the streaming `/api/llm/stream` Express/SSE path used by the current Chat UI
- media image/video sync and async generation:
  - `media.generateImage`
  - `media.generateVideo`
  - `media.generateImageAsync`
  - `media.generateVideoAsync`
- media audio sync and async generation when the selected model can produce voice, speech, music, or age-sensitive audio:
  - `media.generateAudio`
  - `media.generateAudioAsync`
- private chat entry points;
- private vault / finance/private data routes that already use PIN-like protection;
- shared workflow/skill execution boundary if it can submit media or LLM prompts.
- public API and MCP/agent gateway routes that can call LLM/media providers:
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/video-projects`
  - MCP media/skills execution tools
  - delegated worker LLM/media routes

Future enforcement points:

- Storyboard Review generation/retry routes;
- Presentation/Article-to-video generation routes;
- deeper stage-specific team orchestration/worker execution after the shared LLM/media boundaries are protected.

---

## 10. Chat Policy

### 10.1 Request Filtering

Before sending a chat prompt to any model:

1. Resolve effective age context.
2. Classify the user prompt and attached context.
3. Apply policy rules.
4. If blocked, return a clear age-appropriate message.
5. If sanitization is allowed, remove or rewrite disallowed context before model execution.
6. Attach a compact policy instruction to the model request.

Policy instruction example:

```text
The current user must receive content appropriate for enforcementBand=child.
Do not provide adult sexual content, graphic violence, self-harm instruction,
illegal activity instructions, dangerous challenges, or age-inappropriate roleplay.
If asked for blocked content, decline briefly and offer a safe alternative.
```

This instruction is defense-in-depth. The backend block happens before the model call.

### 10.2 Response Filtering

After receiving model output:

1. Classify the response.
2. If disallowed, block, replace with safe refusal, or ask model to repair depending on policy.
3. Log a redacted policy event.
4. Store only the safe response in normal chat history if the original output violates policy.

Streaming response requirement:

- streaming routes must not leak unsafe partial tokens before post-filtering;
- for child/unknown enforcement bands, use one of:
  - buffer-and-moderate before releasing chunks;
  - segment-level moderation with safe holdback;
  - model/provider mode that guarantees age-appropriate output plus backend repair/refusal fallback;
- if streaming moderation fails, stop the stream, replace remaining output with a safe localized refusal, and store only the safe replacement;
- log the decision as a redacted post-output policy event.

### 10.3 Attachments And Context Packs

Chat may include:

- file attachments;
- library items;
- private vault context;
- generated media references;
- skill dynamic params.

Policy must classify both the user text and selected context metadata. Private Vault access remains governed by the Private Vault-compatible unlock token until the Security PIN migration is explicitly completed.

### 10.3.1 Provider Payload Minimization

Age policy metadata sent to LLM providers must be minimal and non-identifying.

Rules:

- do not send raw DOB, exact age, country of residence, guardian consent status, PIN state, tenant legal notes, or internal policy JSON to model/provider prompts;
- send only the minimum effective instruction, such as `enforcementBand=child`, blocked category guidance, and safe replacement behavior;
- provider/tool logs must not contain raw safety profile data;
- prompt-injection content in user files, chat history, web pages, or context packs must not be allowed to override age policy instructions;
- if a tool call or skill asks for age/profile fields, it must go through explicit backend authorization instead of receiving hidden policy context.

### 10.4 Private Chat

Private Chat should use Security PIN when configured.

Rules:

- if Security PIN exists, entering Private Chat requires unlock;
- unlock token can be scoped to `private_chat`;
- day rollover/session end relocks;
- private chat content still respects age policy after unlock unless admin policy explicitly allows adult override for that surface.

---

## 11. Media Generation Policy

### 11.1 Pre-Provider Mandatory Gate

Before any image/video/audio prompt leaves SmartSpecPro:

1. Resolve age context.
2. Classify prompt/text, negative prompt, reference URLs metadata, selected model, provider, origin surface, voice/speaker params, and extra params.
3. Apply media policy.
4. Block, sanitize, or require PIN unlock before credit deduction/provider submission.
5. Attach policy metadata to task/audit records.

This applies to:

- Media Studio;
- Chat-triggered media skills;
- Storyboard Review;
- Presentation-to-video;
- workflow automation;
- MCP-connected provider transport;
- public API or external agent gateway when enabled.

For API key, MCP, delegated worker, and widget traffic, the preflight must resolve `actorKind` and `audienceBand` before evaluating the prompt.

Python/backend gateway compatibility:

- Node `apps/web/server/routers/media.ts` should remain the primary user-facing enforcement and billing boundary.
- Direct Python media endpoints such as `python-backend/app/api/v1/media_generation.py` must not become an unfiltered public bypass.
- If those Python endpoints remain callable by end users, they must accept a signed age-policy envelope from Node or call an equivalent policy service before task creation/provider dispatch.
- If Python endpoints are intended to be internal only, they must require internal/service authentication and reject browser/public/API-key traffic that has not passed Node policy.
- Python media task records should store only policy decision metadata and redacted prompt summaries, not raw blocked prompts.

### 11.2 Credit Safety

If a request is blocked by age policy:

- do not deduct credits;
- do not reserve credits;
- do not submit provider job;
- do not write raw prompt previews into credit metadata;
- return structured `TRPCError` or equivalent API error with `reasonCode`.

The current async image/video/audio media procedures reserve credits before dispatch and store short prompt/text metadata in credit transactions. The age policy gate must run before those reservation calls.

The current media router also runs rate limiting and abuse guard before model dispatch. The implementation plan should decide whether age policy runs before abuse guard. Recommended default:

```text
schema validation
  -> cheap auth/rate limit by user id
  -> age policy preflight on raw prompt/text
  -> abuse guard on allowed/sanitized prompt hash
  -> model/pricing checks
  -> credit check/reservation
  -> provider/worker/MCP dispatch
```

This avoids recording hashes or prompt excerpts for content the policy blocks, while retaining abuse controls for allowed content.

### 11.2.1 Async Jobs, Retries, And Provider Callbacks

Async media, workflow, worker, MCP, and provider-callback flows must revalidate age policy at each boundary where time can pass or state can change.

Required checkpoints:

- before queue enqueue;
- before worker/provider dispatch;
- before retry after transient failure;
- before provider callback/webhook result is accepted;
- before generated output is made visible, downloadable, shareable, or reusable as a reference.

Each queued task should store redacted policy metadata:

- `policyVersion`;
- `policySnapshotHash`;
- `profileVersion`;
- `jurisdictionPresetId`;
- `enforcementBand`;
- `actorKind` and owner/audience reference;
- sanitized prompt hash or safe summary;
- task safety state such as `approved_for_dispatch`, `blocked`, `qa_pending`, `quarantined`, or `cancelled_by_policy_change`.

If DOB, country, tenant, policy, preset approval, or enforcement mode changes before dispatch/completion, the job must re-evaluate using current policy.

Outcomes:

- if still allowed, continue;
- if now blocked before provider dispatch, cancel without credit deduction/reservation;
- if credits were already reserved, release/refund the reservation with a redacted reason code;
- if provider output already exists but current policy blocks delivery, quarantine the output and do not expose it to the user/viewer until review clears it;
- provider callbacks without a matching approved policy envelope or task policy state must fail closed.

### 11.3 Prompt Hardening

For allowed child/teen media generation:

- add age-appropriate negative prompt or safety controls where provider supports it;
- prevent model/provider settings known to increase adult/graphic output;
- enforce reference asset rules;
- avoid adultized descriptors, sexualized body framing, exploitative prompts, graphic violence, dangerous instructions, or unsafe scenarios.

Example internal media safety context:

```ts
type MediaSafetyPreflight = {
  mediaType: "image" | "video" | "audio";
  promptOrText: string;
  negativePrompt?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  voice?: string;
  speakerProfile?: unknown;
  modelId?: string;
  provider?: string;
  originSurface?: string;
  enforcementBand: "child" | "teen" | "adult";
};
```

### 11.4 Provider Compatibility

The policy layer should not require each provider to support identical moderation controls.

Provider strategy:

- enforce local block/sanitize before provider;
- pass safety parameters only when provider supports them;
- record `providerSafetyCapabilities` in task metadata;
- if a provider lacks required child-safe controls for a policy category, block or route to a safer provider if configured.

### 11.5 Reference Assets

Reference images/videos may be unsafe even when prompt text is safe.

V1 should at least:

- validate reference URL safety using existing URL checks;
- classify user-provided reference metadata when available;
- block references from quarantined/unsafe generated media;
- keep generated output in `qa_pending` or equivalent state if post-generation review is required.

Future:

- computer vision moderation for uploaded/reference/generated images and videos;
- quarantine workflow for unsafe outputs.

### 11.5.1 Generated Asset Reuse, Sharing, And Viewer Policy

Age policy must apply when generated or uploaded content is viewed, reused, shared, exported, or selected as a reference, not only when it is created.

Required behavior:

- generated media, chat artifacts, library items, marketplace captures, and workflow outputs should store redacted safety metadata such as content category, policy version, creator enforcement band, review/quarantine state, and minimum viewer band;
- a viewer's current effective policy decides whether they can open, preview, download, copy, remix, share, or use an asset as reference material;
- content generated under adult unlock must not automatically become visible or reusable by child/unknown users;
- public/share links should default to strict or adult-only access unless the asset is explicitly classified safe for the intended audience;
- if viewer age is unknown, shared/public access should be evaluated as child-under-13 or stricter tenant default;
- quarantined or review-pending assets cannot be used as references for new media/chat generation until cleared;
- if a creator later becomes under-minimum or loses access, previously created content should follow tenant retention/support policy without leaking through public links.

This is especially important for Media History, Library/Document Management, Marketplace Capture, Storyboard Review, Presentation outputs, public API download endpoints, and any future gallery/share surfaces.

### 11.6 Audio And Voice

Although the initial ask focused on images and videos, the current Media Studio and `media.ts` router also support audio generation. Age policy should cover audio when it can produce age-sensitive content.

Audio policy must check:

- TTS text;
- lyrics or music prompt;
- voice cloning/reference audio fields;
- native video speech prompts that embed dialogue;
- speaker identity settings when present.

Voice cloning or realistic child/teen voices should be more restrictive than generic TTS because it can create impersonation, grooming, or sensitive identity risks.

---

## 12. Data Model

### 12.1 Recommended Tables / Fields

Option 1: typed columns on `users`:

```ts
dateOfBirth: date("dateOfBirth"),
dateOfBirthUpdatedAt: timestamp("dateOfBirthUpdatedAt", { withTimezone: true }),
dateOfBirthChangeCount: integer("dateOfBirthChangeCount").default(0),
countryOfResidence: varchar("countryOfResidence", { length: 2 }),
countryOfResidenceUpdatedAt: timestamp("countryOfResidenceUpdatedAt", { withTimezone: true }),
```

Codebase note:

- `apps/web/drizzle/schema.ts` currently imports timestamp/varchar/json primitives extensively; confirm `date` is already imported before implementation, or add the Drizzle `date` import in the migration section.
- If typed columns are added, a migration is required and tests should verify generated schema/type compatibility.
- Current `users` schema does not contain DOB fields. Adding typed columns is an additive migration and should be protected by the rollout plan before enforcement is enabled.
- Follow the repository database safety protocol before any `users` table migration: back up the `users` table, record row counts, run `cd apps/web && pnpm db:push`, verify row counts after migration, and do not add NOT NULL columns without safe defaults/backfill.
- Before generating a DOB migration, check for existing schema drift such as the historical `passwordChangedAt` migration/schema mismatch noted in prior planning files. Fixing unrelated drift may be required before Drizzle migration generation to avoid destructive unintended diffs.

Option 2: JSON profile in `users.userPreferences`:

```ts
userPreferences: {
  safetyProfile?: {
    dateOfBirth?: string;
    dateOfBirthUpdatedAt?: string;
    dateOfBirthChangeCount?: number;
    countryOfResidence?: string;
    countryOfResidenceUpdatedAt?: string;
    countryOfResidenceChangeCount?: number;
    jurisdictionPresetId?: string;
    profileVersion?: number;
  };
  securityPin?: {
    enabled?: boolean;
    pinHash?: string;
    pinVersion?: number;
    pinUpdatedAt?: string;
  };
}
```

Recommendation:

- use typed `dateOfBirth` fields for reliable querying/auditing and future admin operations;
- use typed `countryOfResidence` fields when production rollout needs jurisdiction reporting and querying;
- use an adapter over the existing `userPreferences.privateVault` PIN state in v1; add `userPreferences.securityPin` only when the migration away from Private Vault-specific naming is explicit and tested;
- keep policy configuration in a dedicated table or system settings JSON.

Implementation recommendation:

- v1 may use `userPreferences.safetyProfile.dateOfBirth` if the team wants a no-migration prototype;
- v1 may also use `userPreferences.safetyProfile.countryOfResidence` for prototype jurisdiction resolution;
- production rollout should promote DOB to typed columns before enforcing platform-wide policy;
- production rollout should promote country to typed columns before enabling country-specific legal modes;
- do not duplicate DOB in both places unless one is explicitly a cached derived view.
- if `securityPin` storage is introduced later, migrate `privateVault.pinHash`, `pinVersion`, and `pinUpdatedAt` through a one-way compatibility adapter so existing Private Vault users keep access.

### 12.2 Policy Storage

Initial implementation can store the active policy in system settings:

```text
system_settings category = "safety"
key = "age_policy"
value = AgeSafetyPolicy JSON
```

This aligns with existing `systemSettingsRouter` patterns, including `menu_overrides` stored as JSON under `system_settings`. The age policy should still get a dedicated router/service wrapper instead of directly spreading JSON parsing across feature routers.

Codebase constraint:

- `apps/web/server/routers/systemSettings.ts` validates generic setting categories through `settingCategorySchema`.
- `"safety"` is not currently in that enum.

Implementation options:

1. Add `"safety"` to `settingCategorySchema` and expose only dedicated `adminSafety.*` procedures for age policy reads/writes.
2. Use an existing broad category such as `"general"` only for an internal prototype, but keep the dedicated service/router contract so the storage key can move later.

Recommendation: add `"safety"` to `settingCategorySchema` and still keep generic `systemSettings.updateSetting` out of the policy write path. Age policy writes should validate the full `AgeSafetyPolicy` schema, audit the actor, and avoid accidental overwrites from unrelated settings screens.

Future implementation may use tables:

- `age_safety_policies`
- `age_safety_policy_versions`
- `age_safety_policy_rules`
- `age_policy_audit_events`
- `age_jurisdiction_presets`
- `age_consent_records`
- `age_retention_actions`

### 12.2.1 Consent And Retention Records

Age-tiered service mode must not rely on a boolean such as `guardianConsentRequired`.

Recommended consent record shape:

```ts
type AgeConsentRecord = {
  id: string;
  userId: number;
  tenantId: string;
  countryCode: string;
  jurisdictionPresetId: string;
  consentPolicyKey: string;
  subjectAgeBand: "child" | "teen";
  consentType: "guardian" | "minor_reconfirm" | "support_override";
  status: "pending" | "verified" | "revoked" | "expired" | "rejected";
  verifiedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  verificationMethod?: string | null;
  evidenceHash?: string | null;
  auditEventId?: string | null;
};
```

Retention action shape:

```ts
type AgeRetentionAction = {
  id: string;
  userId: number;
  tenantId: string;
  jurisdictionPresetId: string;
  retentionPolicyKey: string;
  action: "restrict" | "export_requested" | "delete_requested" | "deleted" | "tombstoned";
  reasonCode: string;
  createdAt: string;
  completedAt?: string | null;
  auditEventId?: string | null;
};
```

Consent and retention records must store safe metadata only. Do not store identity documents, raw guardian identifiers, or full DOB in these records unless a separate approved verification provider/storage design exists.

### 12.3 Audit Events

Audit fields:

- userId;
- tenantId;
- surface;
- action;
- actualAgeBand;
- enforcementBand;
- temporaryUnlockActive;
- policyVersion;
- policySnapshotHash;
- jurisdictionPresetId;
- classifierVersion;
- classificationConfidence bucket, not raw classifier trace;
- degradedMode when a timeout/unavailable/uncertain path was used;
- protectedSurfaceToken scope only, not token value or `jti`;
- decision;
- reasonCode;
- redactedPromptHash;
- redactedContentPreview only when safe;
- createdAt.

Never store full date of birth or full blocked prompt in normal logs.

Implementation fit:

- extend `apps/web/server/services/auditLogger.ts` with explicit age-safety event types instead of logging ad hoc JSON through `console.log`;
- create small helper functions such as `logAgePolicyDecision`, `logAgePolicyUnlock`, `logAgePolicyAdminChange`, and `logDobChange`;
- sanitize prompt snippets, DOB, PIN state, provider payloads, reference URLs, and token identifiers before they reach audit metadata;
- audit logger failure must not expose raw content or block normal safe requests, but failed policy-write audit should surface an operational warning for admin changes.

Recommended event types:

- `age_policy.decision`
- `age_policy.unlock`
- `age_policy.admin_update`
- `age_profile.dob_set`
- `age_profile.dob_change_blocked`
- `age_policy.observe_would_block`
- `age_policy.review_required`
- `age_policy.appeal_created`
- `age_policy.operational_degraded`

---

## 13. UI / UX Requirements

### 13.1 Profile / Settings

Settings should expose:

- date of birth setup;
- country/region of residence setup;
- active jurisdiction preset summary;
- current derived age band;
- explanation that age is calculated from date of birth;
- warning that missing date of birth enforces child-under-13 mode;
- Security PIN setup/change;
- Security PIN unlock state;
- date-of-birth edit flow protected by PIN once configured.

Recommended placement:

- `Settings -> Security` for Security PIN;
- `Settings -> Profile` or `Settings -> Account` for date of birth;
- a link from Profile DOB edit to Security PIN management.

Codebase fit:

- Settings copy uses i18n keys in `apps/web/client/src/locales/*/settings.json` and `apps/web/client/src/lib/i18n/locales/*`.
- Add English and Thai keys for age profile, child-mode warning, PIN unlock, rate-limited PIN state, DOB edit protection, and adult-only legal mode copy.
- Settings tests that mock translations must include any new tab or label keys they render.

### 13.2 Global Locked State

When age is unknown:

- show a non-blocking banner on safe surfaces;
- show a blocking interstitial on age-gated surfaces;
- provide a direct path to complete date of birth.

When safety profile completion is required:

- authenticated human users missing `dateOfBirth` or `countryOfResidence` should be routed to a dedicated completion page before normal product surfaces render;
- the page should collect both fields together to avoid partial onboarding loops;
- completion status should be revalidated from the server after save, not trusted from local component state;
- the UI should preserve a safe internal `returnTo` route and resume only after the backend reports `complete = true`;
- incomplete users should not see product navigation that leads to blocked loops, except for explicit exempt routes.

When a surface is blocked:

- explain what is blocked without exposing policy internals;
- show `Unlock with PIN` only if rule allows override and a PIN exists;
- show `Set up Security PIN` when a PIN is required but missing;
- show `Complete date of birth` if unknown.

### 13.3 Admin UI

Admin UI should include:

- age thresholds;
- unknown-age mode;
- policy rule list;
- feature/menu/action mappings;
- custom blocked topics;
- whether PIN override is allowed;
- audit event viewer with redaction.
- policy test tool that shows the decision, reason code, preset, policy version, and whether the request would require review;
- manual review queue for uncertain classifier outcomes and user/support appeals, with redacted prompt hashes and safe summaries only.

### 13.4 Manual Review And Appeals

False positives are expected in age and content classification. The system needs a safe remediation path without weakening default enforcement.

Requirements:

- blocked users should see a localized support/appeal affordance for non-hard-block decisions when policy allows appeal;
- hard-block categories such as minor sexual content, exploitation, explicit self-harm instruction, and illegal-dangerous instructions must not be appeal-unlocked by normal support;
- review cases store policy metadata, reason code, age band, preset id, classifier confidence bucket, and redacted prompt/content hash;
- reviewers must not see raw DOB, PIN, token values, or full blocked prompts unless a separate approved evidence-handling design exists;
- reviewer actions are audited and may create a temporary policy override only when the underlying rule allows admin override.

---

## 14. API / Route Behavior

### 14.1 User Routes

Add or extend protected user procedures:

- `users.getSafetyProfile`
- `users.getSafetyProfileCompletionStatus`
- `users.setDateOfBirth`
- `users.updateDateOfBirth`
- `users.setCountryOfResidence`
- `users.updateCountryOfResidence`
- `users.setSecurityPin` or `users.setPrivateVaultPin` adapter path in v1
- `users.unlockProtectedSurface`
- `users.lockProtectedSurface`
- `users.getProtectedSurfaceUnlockState`

Existing Private Vault procedures may be kept but should delegate to the shared Security PIN service.

Recommended completion status shape:

```ts
type SafetyProfileCompletionStatus = {
  complete: boolean;
  missingFields: Array<"dateOfBirth" | "countryOfResidence">;
  requiredByPolicy: boolean;
  enforcementMode: "observe" | "prompt_only" | "enforce_sensitive_surfaces" | "enforce_all";
  actorKind: AgePolicyActorKind;
  tenantId: string | null;
  exempt: boolean;
  reasonCode?: "age_profile_required" | "country_profile_required" | "safety_profile_required";
  returnToAllowed: boolean;
  profileVersion: number;
  policyVersion: number;
  jurisdictionPresetId?: string;
  completedAt?: string | null;
  underMinimumServiceAge?: boolean;
  nextAllowedRoute?: string;
};
```

Backend requirements:

- this status must be computed server-side from the authenticated user, tenant policy, rollout flags, and actor kind;
- tenant switching must force a fresh completion/policy resolution because enforcement mode, presets, feature flags, and admin overrides can be tenant-specific;
- the completion mutation must validate both DOB and country when either is required;
- country/region must be stored as a normalized ISO 3166-1 alpha-2 country code selected by the user as country/region of residence;
- UI language, browser locale, billing country, IP geolocation, and timezone may be used as mismatch/risk signals for support or abuse review, but must not silently override `countryOfResidence`;
- unsupported, missing, malformed, or policy-unmapped country values must resolve to `STRICT_UNKNOWN_COUNTRY` until corrected;
- partial state is allowed only as an intermediate save failure recovery path, not as permission to enter product surfaces;
- API/mobile/non-browser clients must receive structured `safety_profile_required` errors with `missingFields` and `nextAllowedRoute`, not HTML redirects;
- successful completion must bump `profileVersion` and invalidate any cached completion/menu/policy projections for the user/session;
- if the saved DOB makes the user under the active minimum service age, return `underMinimumServiceAge = true` and route only to account/support/privacy/export/delete flows configured by policy;
- all normal protected action procedures still call the age policy service even if the client route guard says the profile is complete.

Client token lifecycle:

- introduce a small client helper similar to `apps/web/client/src/lib/privateVault.ts` for `protected_surface` tokens;
- store protected-surface unlock tokens under a distinct key, for example `smartspec.protectedSurface.accessToken`;
- ensure `apps/web/client/src/services/authService.ts logout()` clears the protected-surface token key;
- keep Private Vault token cleanup separate unless the Private Vault feature explicitly changes its own logout behavior.

### 14.2 Admin Routes

Add admin/domain-admin procedures as appropriate:

- `adminSafety.getAgePolicy`
- `adminSafety.updateAgePolicy`
- `adminSafety.listJurisdictionPresets`
- `adminSafety.testJurisdictionResolution`
- `adminSafety.listPolicyAuditEvents`
- `adminSafety.testPolicyDecision`
- `adminSafety.listReviewCases`
- `adminSafety.resolveReviewCase`
- `adminSafety.getAgePolicyMetrics`

RBAC and tenant scope:

- use `domainAdminProcedure` for tenant-scoped policy management so `domain_admin` can manage only their own tenant policy;
- allow platform `admin` to manage global/default policy and tenant policy when an explicit tenant is selected;
- every tenant policy read/write must filter by `ctx.tenantId` or an admin-validated target tenant;
- normalize tenant IDs through the existing tenant-context helper pattern (`resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)`) before comparing or storing policy/audit tenant IDs;
- tests must call the real router caller/middleware path, not only local helper functions, so role and tenant isolation are exercised.

### 14.3 Chat Routes

Chat execution routes must call:

```ts
AgePolicyEnforcer.assertChatRequestAllowed(...)
AgePolicyEnforcer.filterChatResponse(...)
```

For the current Chat UI, the most important streaming boundary is not only `chat.sendMessage`; it is the `/api/llm/stream` path. The implementation plan must locate the handler around `apps/web/server/_core/llmRoutes.ts` and `apps/web/server/services/llmRoutesHandler.ts` and wire policy there before upstream provider calls and before saving blocked output.

### 14.4 Media Routes

Media generation routes must call:

```ts
AgePolicyEnforcer.assertMediaRequestAllowed(...)
```

before:

- abuse guard continuation that stores prompt hashes beyond minimal needs, unless the implementation explicitly hashes only allowed/sanitized prompts;
- credit deduction/reservation;
- provider/API/MCP submission;
- worker dispatch.

If existing abuse/rate-limit checks run earlier, they must not leak sensitive prompt text and must not charge credits.

---

## 15. Error Handling

Use structured reason codes:

| Reason Code | Meaning |
|---|---|
| `age_profile_required` | DOB missing, unknown user enforced as child |
| `country_profile_required` | Country/region of residence missing, strict fallback preset applies |
| `safety_profile_required` | DOB or country/region missing and post-login completion gate is active |
| `safety_profile_under_minimum` | Completed profile resolves below the active minimum service age |
| `country_profile_invalid` | Country/region is malformed, unsupported, or cannot resolve to an approved preset |
| `age_policy_blocked` | Request violates age policy |
| `age_policy_requires_pin_unlock` | Request can continue after Security PIN unlock |
| `age_policy_hard_block` | PIN cannot override |
| `security_pin_required` | PIN must be configured or entered |
| `security_unlock_expired` | Unlock token expired by session/day/version |
| `dob_change_requires_pin` | DOB change blocked until PIN verified |
| `age_policy_unavailable` | Policy config/service could not be loaded within budget |
| `age_policy_timeout` | Policy evaluation exceeded latency budget |
| `age_classifier_timeout` | Prompt/output classifier exceeded latency budget |
| `age_classifier_uncertain` | Classifier confidence below required threshold |
| `age_policy_review_required` | Request needs manual review before continuing |
| `jurisdiction_preset_stale` | Active preset is expired, unapproved, or review overdue |

User-facing messages must be localized and age-appropriate.

---

## 16. Rollout Plan

Rollout should be tenant-scoped and feature-flagged. The codebase already uses `TenantFeatureFlags` for gated rollout and policy surfaces such as browser policy use an `observe` enforcement mode. This feature should follow the same pattern instead of enabling full blocking globally in one release.

Recommended feature flags:

- `ageSafetyPolicyEnabled`: master tenant gate, default `false` until migration and admin UI are ready.
- `ageSafetyPolicyObserve`: logs decisions and would-block results without blocking, default `true` when the master gate is enabled.
- `ageSafetyRequireDobOnLogin`: prompts or blocks DOB completion depending on `enforcementMode`.
- `ageSafetyRequireCountryOnLogin`: prompts or blocks country/region completion depending on `enforcementMode`.
- `ageSafetyRequireProfileOnLogin`: enables the post-login safety profile completion gate for human users when DOB or country is missing.
- `ageSafetyChatGate`: enables chat prompt/output enforcement.
- `ageSafetyMediaGate`: enables image/video/audio generation enforcement.
- `ageSafetyProtectedSurfaceUnlock`: enables protected-surface PIN unlock tokens.
- `ageSafetyForceRollback`: emergency rollback flag that makes enforcement return to observe/no-block.

Feature flag implementation must update the existing tenant flag contract:

- add keys to `TenantFeatureFlags` in `apps/web/shared/featureFlags.ts`;
- add keys to `ALLOWED_FEATURE_FLAGS`;
- add defaults in `FEATURE_FLAG_DEFAULTS`, with all blocking/enforcement gates defaulting `false`;
- add labels/descriptions to the admin tenant feature flag UI grouping;
- add shared tests that verify allowlist/default coverage for every new flag.

Policy-level `killSwitchEnabled` must override all blocking behavior and keep only audit logging. It must not delete policy configuration.

Before any enforcement mode beyond `observe`, confirm the active legal mode:

- If `under18ServiceAllowed = false`, users below `minimumServiceAge` are not treated as normal `child` or `teen` product users. They are restricted to account/support/privacy flows required by policy.
- If `under18ServiceAllowed = true`, child/teen access must follow the age-tiered rules in this spec.
- If legal mode is unset or invalid, fail closed to adult-only service mode with observe/audit logging for would-block decisions.

### Enforcement Modes

| Mode | Behavior |
|---|---|
| `observe` | Compute decisions and log would-block outcomes; do not block user actions. |
| `prompt_only` | Prompt unknown-age users to set DOB; do not block existing safe workflows except explicit hard-block categories. |
| `enforce_sensitive_surfaces` | Enforce Chat, media generation, private chat, public API/MCP generation, and high-safety surfaces. |
| `enforce_all` | Enforce menus, route/action groups, generation surfaces, and custom policy rules. |

Existing users without DOB should move through `observe` and `prompt_only` before they are treated as child-under-13 for blocking. New users can require DOB earlier because onboarding can collect it before they develop expectations around existing workflows.

Safety profile completion gate by mode:

| Mode | New Human Users | Existing Human Users Missing DOB/Country |
|---|---|---|
| `observe` | collect during onboarding when available, but do not block normal routes | banner/prompt only; log would-block completion decisions |
| `prompt_only` | route to completion page, allow explicit tenant-configured skip only for non-sensitive product routes | completion page or interstitial, with temporary skip only if policy allows |
| `enforce_sensitive_surfaces` | require completion before Chat, media, private chat, public API/MCP generation, workflow generation, and other sensitive surfaces | require completion before sensitive surfaces; safe/exempt routes remain available |
| `enforce_all` | require completion before normal authenticated product routes | require completion before normal authenticated product routes after staged tenant deadline |

The gate must require both `dateOfBirth` and `countryOfResidence` when country-aware presets are enabled. If country is missing, the backend must use `STRICT_UNKNOWN_COUNTRY` for decisions until the profile is complete.

### Phase 1: Foundations

- Add safety profile model and age calculation helper.
- Add policy service with static/default policy.
- Add legal-mode defaults aligned with the current Privacy page: under-18 service access disabled until policy documents are updated.
- Add Security PIN abstraction over existing Private Vault PIN helpers without changing the Private Vault token contract.
- Add protected-surface unlock token storage/header/context plumbing.
- Add tenant feature flags and `observe` mode decision logging.
- Add admin/domain-admin kill switch and bootstrap exemptions.
- Add tests for age calculation, unknown-as-child, and token expiry.

### Phase 2: User Profile And PIN

- Add combined safety profile completion UI for DOB and country/region.
- Add route guard that redirects incomplete human users to the completion page according to rollout mode.
- Add Security PIN management in Settings > Security.
- Protect DOB edits with PIN/password rules.
- Add audit logging.
- Prompt existing users for DOB/country without immediately blocking generation while `enforcementMode` is `observe` or tenant policy allows prompt-only skip.

### Phase 3: Chat Enforcement

- Start in observe mode and compare would-block decisions against real user outcomes.
- Preflight chat prompts.
- Attach policy instruction to model calls.
- Filter responses.
- Add streaming-safe output handling so unsafe partial tokens are not emitted before moderation/repair.
- Add tests for child/teen/adult/unknown behavior.

### Phase 4: Media Enforcement

- Start in observe mode for prompt classification; move to blocking only after no-credit-on-block tests pass.
- Add pre-provider gate to image/video/audio sync and async routes where audio can produce age-sensitive content.
- Add async job revalidation before enqueue, worker/provider dispatch, retry, callback acceptance, and final delivery.
- Ensure no credit deduction on block.
- Add provider safety metadata.
- Add Chat/Media Studio blocked-state UX.

### Phase 5: Admin Policy

- Add admin policy editor.
- Add menu/action/custom topic mapping.
- Add audit viewer and policy test tool.

### Phase 6: Expansion

- Apply deeper stage-specific checks to Storyboard Review, Presentation-to-video, MCP media transport internals, workflows, private chat, and future high-safety surfaces after the shared Chat/LLM/media/public-API boundaries are protected.
- Add viewer-policy enforcement for generated/shared assets, including Media History, Library, public/share links, export/download endpoints, marketplace captures, and reference-asset reuse.

### 16.1 Metrics, Alerts, And Runbooks

Before blocking rollout, add operational visibility for:

- decision counts by tenant, surface, action, age band, country preset, enforcement mode, and reason code;
- observe-mode would-block rate compared with actual user completion;
- classifier timeout/error/uncertain rates;
- policy load errors, stale preset failures, and strict fallback usage;
- blocked-before-credit and provider-dispatch-prevented counts for media;
- protected-surface token validation failures by reason, without token IDs;
- PIN failed attempts, lockouts, and unlock success rates;
- manual review case volume, appeal outcomes, and reviewer override counts.

Recommended alerts:

- policy config cannot load or parse for any tenant in enforcement mode;
- jurisdiction preset is expired, unapproved, or past review due date while enforcement is active;
- classifier timeout/error rate exceeds threshold on Chat or Media Studio;
- block rate spikes after a policy version change;
- `ageSafetyForceRollback` or policy kill switch is activated;
- direct Python media endpoint rejects increase, which may indicate bypass attempts or misrouted clients.

Runbooks should cover:

- emergency rollback to observe/kill-switch;
- legal preset expiry renewal;
- false-positive appeal handling;
- classifier outage and degraded-mode behavior;
- under-minimum account restriction/export/delete workflow.

---

## 17. Compatibility And Non-Regression

Existing adult users with date of birth set:

- should see no added friction for safe requests;
- should preserve current Chat and Media Studio flows;
- should not lose Private Vault access after PIN migration.

Users without date of birth:

- should continue to access child-safe features;
- should receive clear setup prompts during `observe` and `prompt_only` rollout;
- should be blocked from adult/teen-only features only when the relevant tenant flag and `enforcementMode` are active;
- should always be able to reach DOB setup, Settings > Security, support, logout, and admin safety recovery paths as applicable.

Existing Private Vault:

- must continue to work with current PIN during and after migration;
- must keep `x-private-vault-token` behavior working during v1;
- must not leak private vault token across age unlock scopes unless intentionally configured and reviewed.

Media generation:

- must continue to use current provider paths;
- must not change model defaults for adult safe requests;
- must block before credit deduction/provider submission when policy denies.
- must include audio/TTS policy when those prompts can create age-sensitive content.
- must preserve safety metadata on generated assets so later view/share/reference/download actions can be checked against the viewer's current policy.

System, widget, and external API compatibility:

- widget system users must not be forced to set DOB;
- anonymous widget visitors default to child-under-13 unless the widget has an approved age collection/audience policy;
- API keys inherit owner user age policy by default;
- delegated workers inherit owner/audience policy and delegated manifest restrictions;
- internal `system_agent` tasks that do not produce user-visible content should not be blocked by missing DOB, but hard safety gates still apply when content is generated or published.

---

## 18. Privacy, Security, And Compliance

Important note:

The current privacy page says the service is not intended for users under 18. This feature changes or formalizes how under-18/unknown users are handled. Product/legal must decide whether the privacy policy, terms, onboarding, and data retention language need updates before launch.

Privacy requirements:

- store the minimum needed age data;
- treat DOB, country of residence, guardian/consent metadata, and age-derived decisions as sensitive safety profile data;
- restrict raw DOB access to the user, narrowly scoped account/security flows, and explicitly authorized support/admin workflows; general admin lists should show age band or completion state, not full DOB;
- consider field-level encryption or application-level encryption for DOB if the production database/security standard supports it; if plaintext date columns are required for querying, compensate with strict RBAC, audit, and export controls;
- do not log raw DOB in audit/application logs;
- do not expose DOB to clients beyond the user's own profile/settings;
- do not persist raw guardian identity evidence unless an approved verification storage design exists;
- keep consent evidence as provider references/hashes/status metadata, not raw documents;
- execute under-minimum restriction/export/delete retention actions through auditable records;
- protect DOB changes with PIN/password after first setup;
- include safety profile fields in account export/delete workflows according to the active retention policy;
- purge or tombstone safety profile and consent records consistently when an account is deleted, subject to legal/audit retention requirements;
- redact DOB/country from error reporting, analytics, session replay, feature flag payloads, and client diagnostics.
- rate-limit DOB changes and PIN attempts;
- hash PIN with existing secure hashing approach;
- bind unlock tokens to user, tenant/session, scope, pinVersion, and expiry.

Security requirements:

- server-side enforcement only;
- client UI is advisory;
- hard-block categories cannot be overridden by PIN;
- every unlock event must be auditable;
- age unlock must expire at logout/session end or day rollover;
- client-side stored unlock tokens must be separate from private vault tokens and must be cleared on logout;
- policy version must be recorded in decisions.

---

## 19. Testing Strategy

### 19.1 Unit Tests

- age calculation before/on/after birthday;
- leap year birthdays;
- unknown-as-child enforcement;
- threshold boundaries: 12/13/17/18;
- jurisdiction preset resolution for `US`, `TH`, `GB`, EU/EEA member states, and unsupported country fallback;
- EU/EEA child-consent age override lookup uses the country-specific map and falls back to 16 only when no member-state override is configured;
- expired or unapproved jurisdiction presets fail closed to adult-only/strict fallback behavior.
- policy rule resolution;
- hard-block vs overridable block;
- Security PIN validation;
- Security PIN failed-attempt rate limit and temporary lockout;
- unlock expiry at day rollover;
- unlock invalidation after pinVersion change.
- `AgeSafetyPolicy` schema rejects unknown policy shapes and unsafe defaults.
- audit helper redaction removes DOB, PIN, raw prompts, token identifiers, and provider payload details.
- provider payload builder never includes raw DOB, exact age, country of residence, PIN state, guardian consent status, or full policy JSON.
- streaming response filter buffers, segments, or otherwise prevents unsafe partial tokens from being emitted before moderation for child/unknown enforcement bands.
- protected-surface token validator rejects wrong token `type`, missing scope, wrong tenant, stale `pinVersion`, and stale `dayKey`.
- protected-surface token validator rejects stale `profileVersion`, stale `policyVersion`, stale jurisdiction preset id, and tenant context mismatch.
- tenant id normalization produces the same policy tenant id when context supplies varchar `ctx.tenantId` or numeric `user.currentTenantId`.
- policy failure semantics return deterministic decisions for unavailable policy, classifier timeout, low classifier confidence, and stale jurisdiction preset.
- `policySnapshotHash` changes when effective policy or preset data changes and is recorded in every decision.
- safety profile completion status marks human users incomplete when either DOB or country is missing and does not require fake profile completion for non-human actors.
- strict unknown-country fallback applies whenever country is missing, invalid, or unsupported.
- safety profile completion status changes `profileVersion` when DOB/country changes and reflects policy/preset version changes.
- country validation accepts only normalized supported ISO 3166-1 alpha-2 values and rejects malformed country input.

### 19.2 Router Tests

- DOB setup succeeds first time.
- `users.getSafetyProfileCompletionStatus` returns missing fields, required/exempt state, enforcement mode, and safe reason codes.
- completion mutation validates and persists DOB and country together when both are required.
- completion mutation returns under-minimum routing state when saved DOB is below active `minimumServiceAge`.
- API/non-browser protected actions return structured `safety_profile_required` errors instead of redirect responses when completion is required.
- DOB edit requires PIN when configured.
- country setup succeeds first time.
- country edit requires PIN/password/2FA after first setup and is audit logged.
- unknown user is blocked from adult-only route.
- under-minimum user is restricted to account/support flows when `under18ServiceAllowed = false`.
- PIN unlock allows overridable adult-only route.
- PIN unlock does not allow hard-block content.
- media block happens before credit deduction.
- media block happens before abuse prompt hashes/credit metadata store raw blocked prompt content.
- queued async media/workflow task revalidates policy before worker/provider dispatch and before retry.
- provider callback/webhook is rejected or quarantined when the task lacks a matching approved policy envelope/state.
- direct Python media endpoints reject unfiltered public/browser/API-key traffic or enforce an equivalent signed age-policy envelope before task creation/provider dispatch.
- chat response filter replaces unsafe model output.
- streaming chat route does not emit unsafe partial content before post-output policy handling completes.
- prompt-injection text in attachments/context packs cannot disable or weaken age policy instructions.
- `/api/llm/stream` and other Express routes parse `x-protected-surface-token` through the shared extractor.
- widget-system user does not require DOB, but widget visitor traffic defaults to child-under-13.
- API key route inherits owner DOB policy.
- delegated worker route inherits owner/audience policy.
- system-agent internal non-user-visible task is not blocked by missing DOB, while user-visible generation still requires an audience policy.
- `adminSafety.updateAgePolicy` validates the full policy shape and writes to the approved storage category/key.
- `adminSafety.updateAgePolicy` allows domain admin only for their tenant and platform admin for validated target tenants.
- `adminSafety.updateAgePolicy` rejects cross-tenant updates when normalized tenant id does not match the domain admin tenant.
- generic settings routes cannot overwrite age policy without `adminSafety` validation.
- tenant age-safety feature flags are present in `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- audit logger receives explicit age-safety event types for DOB changes, policy decisions, unlocks, and admin policy updates.
- verified guardian consent record is required before age-tiered child/teen access when the active preset requires it.
- retention action is recorded when an under-minimum user is restricted, export-requested, deleted, or tombstoned.
- classifier timeout blocks or review-routes sensitive media before credit reservation/provider dispatch.
- stale or unapproved jurisdiction preset returns `jurisdiction_preset_stale` and strict fallback behavior.
- audit write failure does not leak raw content and blocks/admin-warns policy writes that cannot be audited.
- review case routes enforce tenant scope and redact prompt/DOB/token data.
- incomplete human users are blocked from non-exempt product procedures when profile completion is required.
- exempt routes such as logout, profile completion, Settings/Security, support, and admin kill switch remain reachable when profile completion is required.
- profile completion cache/projection is invalidated after DOB/country update, policy version update, preset version update, or enforcement mode change.
- tenant switching forces completion status, menu projection, protected-surface unlock state, and policy decision cache to refetch or invalidate.
- shared/public/download/reference-asset routes enforce viewer policy using the viewer's current age context, not only the creator's policy at generation time.
- quarantined or review-pending generated assets cannot be used as media/chat references until cleared.

### 19.3 UI Tests

- Settings shows DOB setup and unknown child-mode warning.
- Settings shows country selector and jurisdiction preset summary.
- post-login route guard redirects incomplete human users to safety profile completion when the active rollout mode requires it.
- route guard does not redirect-loop on the completion page and preserves only safe internal `returnTo` paths.
- multi-tab profile completion refreshes other tabs or causes them to refetch status before releasing routes.
- Settings > Security shows Security PIN setup/change.
- Chat shows blocked or unlock prompt when policy denies.
- Media Studio shows blocked state before generation submission.
- Media History/Library/share/download surfaces hide, block, or interstitial assets that the current viewer policy does not allow.
- Private Chat requires PIN when configured.
- menu item age projection hides or interstitials blocked items, while direct route calls are still blocked by backend policy.
- logout clears protected-surface unlock tokens from client storage.
- changing DOB/country, switching tenant, or receiving a policy/preset version change clears or invalidates age-related protected-surface unlock state.
- repeated failed PIN attempts show a locked/rate-limited state without revealing whether the PIN length/value was close.
- Settings age/PIN/legal-mode UI renders with English and Thai i18n keys and tests include mocked translation keys.
- blocked non-hard-block decisions can show appeal/support affordance when policy allows appeal.
- admin review queue shows decision metadata without raw DOB, PIN, token values, or full blocked prompts.

### 19.4 Integration / E2E

- unknown user logs in, attempts adult-only media generation, gets blocked.
- new human user logs in without DOB/country, is routed to safety profile completion, saves both fields, then resumes the original safe route.
- new human user who completes DOB/country but is below `minimumServiceAge` is routed to account/support/privacy flow, not the original product route.
- existing human user in `observe` sees prompt/banner but is not hard-blocked by the completion gate.
- existing human user in `enforce_all` after staged deadline cannot enter normal product routes until DOB/country are complete.
- user sets DOB as adult, retries media generation, succeeds.
- user sets country `TH`, `US`, `GB`, or an EU/EEA country and receives the expected jurisdiction preset.
- unsupported/missing country uses `STRICT_UNKNOWN_COUNTRY`.
- expired preset review date blocks age-tiered access until legal review is renewed.
- user with child DOB attempts adult prompt, gets blocked.
- user with under-18 DOB is restricted from normal product use when adult-only service mode is active.
- user unlocks with PIN, allowed overridable adult surface until day/session expiry.
- logout/login clears temporary unlock.
- existing Private Vault token still unlocks Finance/Document Management after the Security PIN abstraction is introduced.
- protected-surface token cannot unlock Private Vault unless explicitly issued for that scope.
- logout/login clears protected-surface unlock token and forces re-unlock for age-gated surfaces.
- DOB schema migration preserves `users` row count and does not produce unrelated destructive Drizzle diffs.
- Python media generation cannot bypass Node age preflight in the supported deployment mode.
- public API media/chat request from an owner without DOB is enforced as child-under-13.
- widget anonymous chat is enforced as child-under-13 unless the widget supplies an approved stricter/declared audience context.
- queued media job is cancelled/revalidated when DOB, country, tenant, policy, preset approval, or enforcement mode changes before dispatch.
- provider output is quarantined and not delivered if current policy blocks delivery after the provider job has already completed.
- child/unknown viewer cannot open or reuse adult-classified generated media through a share link or direct download URL.
- adult-generated content marked safe-for-child remains accessible only when its stored safety metadata and current policy allow it.
- policy unavailable, classifier timeout, classifier uncertain, and stale preset scenarios emit metrics and alerts in the expected buckets.
- policy version replay can explain an audited decision from `policyVersion`, `policySnapshotHash`, `jurisdictionPresetId`, reason code, and classifier metadata.
- raw DOB is not exposed in admin list views, analytics payloads, error telemetry, or audit logs.

---

## 20. Acceptance Criteria

1. A user without date of birth is treated as child-under-13 by backend policy.
2. Date of birth is used to compute current real age at request time.
3. Effective band resolves to `child`, `teen`, `adult`, or `unknown`.
4. Admin policy can define minimum age bands for system features/actions.
5. Admin policy can define custom blocked topics/categories.
6. Chat requests are filtered before model execution.
7. Chat responses are filtered after model output.
8. Image/video/audio generation prompts are checked before provider submission where audio can produce age-sensitive content.
9. Blocked media requests do not deduct or reserve credits.
10. Security PIN protects date-of-birth edits after initial setup.
11. Security PIN can temporarily unlock overridable age-gated surfaces.
12. Temporary unlock expires on logout/session end or day rollover.
13. Temporary unlock does not bypass hard-block safety categories.
14. Existing Private Vault PIN functionality remains compatible.
15. Policy decisions are audited with redaction and reason codes.
16. Existing adult-safe Chat and Media Studio workflows do not regress.
17. `/api/llm/stream` and `chat.executeSkill` both enforce age policy.
18. Existing `x-private-vault-token` behavior remains available while protected-surface tokens are introduced separately.
19. Widget system users, API keys, delegated workers, and system agents do not need fake DOB records; they resolve age policy from owner/audience context.
20. Public API, MCP, delegated worker, and widget user-visible generation paths are covered by the same age policy service.
21. `observe` mode records would-block decisions without blocking actions.
22. Tenant feature flags can enable chat/media/protected-surface gates independently during rollout.
23. Emergency kill switch disables blocking while preserving audit logging and policy configuration.
24. DOB setup, Settings > Security, admin safety policy editor, and kill switch remain reachable for unknown-age users and admins.
25. Current adult-only Privacy/Terms posture can be represented by policy: under-18 users are restricted to account/support/privacy flows unless legal/product explicitly enables age-tiered service mode.
26. Policy storage cannot be modified through an unvalidated generic settings write path.
27. New tenant feature flags are added to the shared interface, allowlist, defaults, admin UI, and tests.
28. Menu visibility is treated as UX projection only; backend route/action checks enforce the same decision.
29. Domain admins can manage only tenant-scoped age policy for their tenant; platform admins can manage global/default policy and validated target tenants.
30. Age safety audit events use the central audit logger with explicit event types and redacted metadata.
31. Protected-surface unlock tokens are cleared by logout and cannot survive into a new login session.
32. PIN and DOB-change attempts are rate-limited, audited with redaction, and temporarily locked after repeated failures.
33. Protected-surface token extraction works for both tRPC context and non-tRPC Express/SSE/public API/MCP paths.
34. Tenant id normalization uses existing varchar resolver patterns before policy comparison, token scope validation, and audit writes.
35. DOB persistence changes follow database safety protocol and do not ship with unresolved `users` schema drift.
36. Direct Python media endpoints are either internal-only after Node policy or enforce an equivalent signed policy envelope before task/provider dispatch.
37. New Settings/Profile/Security copy is localized in both English and Thai locale sources used by the current Settings page.
38. User profile includes country/region of residence, separate from UI language.
39. Jurisdiction presets cover at minimum Thailand, United States, United Kingdom, EU/EEA country overrides, and strict unsupported-country fallback.
40. Country changes are protected, rate-limited, audited, and can alter policy only through versioned preset resolution.
41. Jurisdiction presets include source references, effective dates, review cadence, and legal approval status; unapproved/expired presets fail closed.
42. Consent and retention records exist before age-tiered service mode is enabled for minors in jurisdictions that require guardian consent or special deletion/export handling.
43. Policy/classifier timeout and unavailable states have deterministic fail-safe behavior and cannot reach provider dispatch or credit reservation when blocking/review is required.
44. Every policy decision stores enough redacted metadata for replay/debugging: `policyVersion`, `policySnapshotHash`, preset id, reason code, degraded mode, and classifier version/confidence bucket when applicable.
45. Operational metrics and alerts cover decision spikes, classifier failures, stale presets, kill-switch usage, PIN lockouts, token validation failures, and Python bypass rejects.
46. Manual review and appeal flows exist for policy-allowed non-hard-block false positives, with tenant-scoped RBAC and redacted evidence handling.
47. Human users missing DOB or country/region are routed to a safety profile completion flow after login/session refresh when the active rollout mode requires completion.
48. Safety profile completion gate requires both DOB and country/region before normal product routes are released, while logout, completion, Settings/Security, support, account recovery, and admin safety recovery paths remain reachable.
49. The client route guard is UX only; backend route/action policy still blocks non-exempt product actions for incomplete human profiles.
50. New users can be required to complete safety profile during onboarding or first authenticated route, while existing users move through observe/prompt-only before hard enforcement by tenant deadline.
51. Missing country uses `STRICT_UNKNOWN_COUNTRY` for backend decisions until the country profile field is completed.
52. Completion redirects avoid loops, preserve only safe internal return paths, and revalidate completion status from the server after save.
53. If completed DOB resolves below the active minimum service age, the user is routed to configured account/support/privacy/export/delete flows rather than normal product routes.
54. API, MCP, worker, and other non-browser clients receive structured `safety_profile_required` or `country_profile_invalid` errors with missing fields and next allowed route instead of browser redirects.
55. Safety profile completion status includes profile/policy version metadata and invalidates cached projections after DOB, country, policy, preset, or enforcement-mode changes.
56. Country/region is stored as a normalized user-declared residence country code; locale, IP geolocation, timezone, and billing country are only mismatch/risk signals unless a separate reviewed policy says otherwise.
57. Protected-surface unlock tokens become invalid after DOB/country profile version changes, relevant policy/preset version changes, tenant switching, PIN version changes, logout/session end, day rollover, or admin revocation.
58. Safety profile data uses least-privilege access: raw DOB is limited to user profile/security flows and approved support/admin workflows, while general admin/reporting surfaces use age band or completion status.
59. Safety profile fields are covered by export/delete/retention workflows and are redacted from logs, analytics, error telemetry, session replay, feature flag payloads, and normal audit metadata.
60. LLM/media provider payloads receive only minimal age-policy instructions and never raw DOB, exact age, country of residence, PIN state, guardian consent status, or full internal policy JSON.
61. Generated/shared assets store redacted safety metadata and enforce viewer policy for preview, open, download, copy, remix, share, and reference reuse.
62. Public/share links and direct download/export endpoints fail closed for unknown viewers and cannot expose adult/review-pending/quarantined content to child or unknown-age viewers.
63. Streaming chat/LLM responses cannot leak unsafe partial tokens before age-policy post-filtering, repair, or safe refusal handling.
64. Async jobs, retries, workers, MCP dispatch, Python dispatch, and provider callbacks revalidate current age policy before dispatch, retry, callback acceptance, and final delivery.
65. Queued jobs affected by DOB, country, tenant, policy, preset, or enforcement-mode changes are cancelled, revalidated, refunded/released if needed, or quarantined before user-visible delivery.

---

## 21. Open Questions

1. Should `child` mean under 13 globally, or should thresholds vary by tenant/jurisdiction?
2. Should first-time DOB setup require password/2FA, or only authenticated session?
3. Should a user be allowed to change DOB more than N times without admin review?
4. Should temporary PIN unlock be global for all overridable surfaces, or scoped per surface by default?
5. Should Private Vault PIN storage be migrated immediately to `securityPin`, or should v1 use an adapter over the existing `privateVault` field? Recommendation: adapter first, migration later.
6. Should unknown age block teen-only menus completely, or show them with a DOB setup interstitial?
7. Which categories are hard-block even for adults and cannot be unlocked?
8. If under-18 service access remains disabled, should under-minimum accounts be suspended pending review, offered export/delete, or routed to support-only state?
9. If age-tiered service mode is approved later, what guardian consent, regional threshold, and retention rules are required?
10. Which countries should be enabled for age-tiered service mode at launch versus adult-only mode with strict fallback?
11. Who owns periodic legal review of jurisdiction presets, especially EU/EEA child-consent ages and Thailand minor consent interpretation?
12. What classifier confidence thresholds should trigger sanitize, block, or manual review for each surface?
13. Which support roles may resolve appeal cases, and which rule categories require legal/platform-admin approval instead of tenant support?

---

## 22. Implementation Notes From Codebase Discovery

Relevant current surfaces:

- user schema and preferences: `apps/web/drizzle/schema.ts`;
- user preferences and Private Vault PIN routes: `apps/web/server/routers/users.ts`;
- Private Vault PIN services: `apps/web/server/services/privateVaultService.ts`;
- tRPC context and token header extraction: `apps/web/server/_core/context.ts`;
- existing client tRPC header injection: `apps/web/client/src/main.tsx`;
- existing private vault client token helper: `apps/web/client/src/lib/privateVault.ts`;
- Settings UI and Private Vault PIN controls: `apps/web/client/src/pages/Settings.tsx`;
- Chat media/skill execution: `apps/web/client/src/components/chat/ChatView.tsx`;
- streaming chat provider path: `apps/web/server/_core/llmRoutes.ts` and `apps/web/server/services/llmRoutesHandler.ts`;
- media generation router: `apps/web/server/routers/media.ts`;
- Media Studio async generation calls: `apps/web/client/src/pages/MediaStudio.tsx`;
- Python moderation service: `python-backend/app/services/moderation_service.py`.
- widget system users and gateway: `apps/web/server/services/widgetService.ts`, `apps/web/server/routes/widgetGateway.ts`;
- public API auth/types/routes: `apps/web/shared/publicApiTypes.ts`, `apps/web/server/middleware/requireScopes.ts`, `apps/web/server/routes/publicVideoApi.ts`, `apps/web/server/_core/llmRoutes.ts`, `apps/web/server/_core/responsesRoutes.ts`;
- delegated/MCP sessions: `apps/web/server/_core/authz.ts`, `apps/web/server/_core/mcpPublicServer.ts`, `apps/web/server/_core/mcpRegistry.ts`.

The best first backend boundary for media is `apps/web/server/routers/media.ts`, because Chat, Media Studio, and other surfaces eventually converge on image/video/audio generation procedures. The best first UI boundary for PIN/profile is Settings, because Security and Private Vault PIN controls already live there.

---

## 23. Codebase Alignment Review

This section records constraints found during spec review against the current repository.

### 23.1 Private Vault Token Must Not Be Reused As Age Token

Current Private Vault unlock is already integrated into:

- `TrpcContext.privateVaultToken`;
- header `x-private-vault-token`;
- localStorage key `smartspec.privateVault.accessToken`;
- Finance, Library, WorkOS, Document Management, and Context Pack access.

Therefore, age unlock should introduce a separate protected-surface token and header. Reusing the same token would blur audit scope and could accidentally unlock private files when the user intended only an age-gated Chat or Media Studio surface.

### 23.2 Chat Enforcement Must Cover Streaming Path

The Chat UI sends normal model requests through `/api/llm/stream`, not only tRPC `chat.sendMessage`. A complete implementation must enforce policy in the streaming route before provider dispatch and after provider output, including the message save step.

### 23.3 Media Enforcement Must Precede Existing Credit Reservation

`media.generateImageAsync`, `media.generateVideoAsync`, and `media.generateAudioAsync` reserve credits before task dispatch. The age preflight must run before those reservation calls to satisfy the no-credit-on-block requirement.

### 23.4 System Settings Are A Natural Policy Storage Starting Point

The existing `system_settings` table and `systemSettingsRouter` already store JSON menu overrides. Age policy can use the same pattern for v1, but should be wrapped in a dedicated safety-policy service/router to avoid scattering raw JSON policy parsing across the codebase.

### 23.5 Settings UI Should Extend Existing Security/Private Vault Patterns

`Settings.tsx` already contains Security and Private Vault tabs with PIN input patterns and i18n keys. The implementation should refactor or extract reusable PIN controls only when needed; avoid duplicating a second full PIN form with different semantics.

### 23.6 Non-Human Actors Need Audience Policy, Not DOB

The repository creates per-tenant widget system users with normal `role: "user"` but internal emails such as `widget-system@{tenantId}.internal`. Public API, MCP, and delegated worker routes also execute on behalf of an owner or tenant context. These actors should not be forced into DOB onboarding. The age policy service must resolve the human owner, visitor/audience declaration, or tenant default before user-visible LLM/media generation.

### 23.7 Whole-System Coverage Requires Express And MCP Adapters

Not every sensitive path is tRPC. Public API, MCP public server, widget gateway, and streaming LLM routes use Express/auth contexts. The policy service must expose a small adapter for these contexts so enforcement stays centralized without forcing all routes through tRPC.

### 23.8 Rollout Should Reuse Tenant Feature Flags And Observe Mode

`apps/web/shared/featureFlags.ts` already defines tenant-scoped rollout gates with many safety-sensitive defaults set to `false`. Age safety should add its gates there rather than inventing a separate feature-flag store. `apps/web/shared/browserPolicy.ts` also demonstrates an `enforcementMode` with `observe` and a `killSwitchEnabled` field; age safety should mirror that operational model so rollout can start with decision logging before blocking real users.

This is especially important for existing accounts without DOB. The product requirement says unknown age must behave as child-under-13, but launch should make that enforcement active only after tenant flags and policy mode are intentionally enabled. DOB/profile setup and admin recovery paths must remain exempt to avoid account lockout.

### 23.9 Privacy Page Currently Requires Adult-Only Default

`apps/web/client/src/pages/Privacy.tsx` currently says the service is not intended for users under 18 and that known child data should be deleted. Until that public policy changes, the implementation must default `legalMode.under18ServiceAllowed` to `false` and treat child/teen logic as restriction and defense-in-depth, not as permission to serve minors.

If legal/product later approves child/teen access, update Privacy/Terms, onboarding consent, support process, retention behavior, and the default policy seed in the same launch plan.

### 23.10 Settings Category And Menu Gating Need Explicit Adapters

`systemSettingsRouter` currently validates setting categories and does not include `"safety"`. If v1 stores policy in `system_settings`, implementation must add the category or use a dedicated router path that bypasses the generic category enum safely.

`getVisibleMenuItems()` in `packages/shared/src/constants/menu.ts` treats menu visibility as platform/role/feature/override filtering and shows feature-gated items when `enabledFeatures` is absent. Age policy should project menu decisions into the UI, but must not depend on that projection for security. Route/action policy checks remain the enforceable boundary.

### 23.11 Logout, RBAC, And Audit Contracts Need Real Integration

`apps/web/client/src/services/authService.ts` currently clears auth-related localStorage keys on logout. Protected-surface unlock storage must be added to that cleanup path, otherwise the spec's logout/session-end expiry can be false on the client.

Admin policy routes should follow existing `domainAdminProcedure` patterns such as tenant feature flags and channel routing: domain admins manage only their tenant, while platform admins may target global/default policy or validated tenants.

Age policy events should extend `apps/web/server/services/auditLogger.ts` and use helper functions with redaction tests. Ad hoc console logging is not enough for policy decisions, unlocks, DOB changes, or admin policy updates.

### 23.12 PIN Rate Limits And Non-TRPC Token Extraction Are Required

Current Private Vault PIN routes validate PIN shape and verify the hash, but the spec should not assume those routes already provide brute-force protection. Security PIN and protected-surface unlock must add rate limiting or temporary lockout keyed by user/tenant/surface and use generic error messages for failed attempts.

`apps/web/server/_core/context.ts` handles tRPC header extraction, but `/api/llm/stream`, OpenAI-compatible routes, widget/public API, and MCP adapters are not guaranteed to flow through that context. Implement a shared protected-surface token extractor/validator that both tRPC and Express adapters call.

### 23.13 Tenant ID And Migration Safety Need Explicit Handling

Many routers normalize tenant context through `resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId)` because `ctx.tenantId` and `users.currentTenantId` may differ in type/source. Age policy services, protected-surface token scopes, and audit events should use the same normalized tenant id before comparing or persisting policy decisions.

Protected-surface tokens should reuse `apps/web/server/_core/tokens.ts` bearer helpers and reject wrong token `type` or scope. This matches existing worker/extension route tests that reject unrelated bearer token types.

Adding DOB columns to `users` is an additive schema change but still requires the repository database safety protocol. Before generating migrations, inspect current Drizzle schema drift, especially prior planning notes around `passwordChangedAt`, so a DOB migration does not accidentally include unrelated destructive changes.

### 23.14 Python Media And Settings I18n Are Real Boundaries

The Node media router is the best first enforcement point, but the repository also contains Python media endpoints under `python-backend/app/api/v1/media_generation.py`. The launch plan must either make those endpoints internal-only behind service auth after Node preflight or require them to validate a signed policy envelope before creating media tasks or calling providers.

Settings copy is localized through existing English/Thai settings locale files and additional generated locale sources. Any DOB, PIN, lockout, legal-mode, or age-gated copy added to Settings should update both languages and the Settings tests that mock translation keys.

### 23.15 Jurisdiction Presets Should Be Data, Not Route Logic

Country-aware behavior should live in versioned policy preset data loaded by `AgeSafetyPolicyService`, not in scattered route conditionals. This keeps legal changes auditable and lets admin policy testing show exactly which preset produced a decision.

The profile country field should be handled like DOB: first setup can be straightforward after authentication, but edits after setup require step-up confirmation, rate limiting, and audit logging. UI language should not be used as a legal jurisdiction signal.

Default presets should ship conservatively: adult-only service mode remains active unless legal/product explicitly enables age-tiered access for a jurisdiction. Thailand, United States, United Kingdom, EU/EEA country overrides, and `STRICT_UNKNOWN_COUNTRY` must be seeded and covered by tests before enforcement mode moves beyond observe.

### 23.16 Preset Review, Consent, And Retention Need Durable Ledgers

Country presets should carry source references, effective dates, review dates, and approval status. This makes legal updates auditable and prevents stale country rules from silently authorizing child/teen access.

If age-tiered service mode is enabled, guardian consent and under-minimum retention actions must be durable records, not transient UI state. This mirrors existing repository planning patterns for retention/audit ledgers and gives support/admin teams evidence for account restriction, export, deletion, or tombstoning without storing raw sensitive proof material.

### 23.17 Operational Readiness Must Be Centralized

Policy timeouts, classifier uncertainty, stale preset behavior, audit redaction, and manual review routing should be implemented inside shared services such as `AgePolicyEnforcer`, `AgeModerationClient`, and `PolicyAuditLogger`, not repeated in Chat, Media Studio, public API, widget, MCP, and Python gateway handlers.

This keeps failure behavior consistent across tRPC and Express paths:

- a Chat stream and Media Studio generation should produce the same reason code for the same policy failure;
- media credit/provider dispatch must remain protected even when the classifier is slow or uncertain;
- Python media endpoints should receive either an already-approved signed policy envelope or reject the request before task creation;
- support/admin teams should be able to replay a decision using policy version, policy snapshot hash, preset id, degraded mode, and classifier metadata without seeing raw DOB, PIN, token values, or full blocked prompts.

The rollout should not move beyond `observe` for a tenant until metrics, alerting, and rollback runbooks exist for these operational states.

### 23.18 Post-Login Completion Gate Should Extend The Existing Auth Guard

The current web app already has route-level guards in `apps/web/client/src/App.tsx`, including `RequireAuth`, `RequireAdmin`, and `RequireDomainAdmin`. The safety profile gate should extend this pattern instead of adding one-off checks inside Chat, Media Studio, Dashboard, and Settings pages.

Recommended codebase fit:

- add a shared client guard such as `RequireCompletedSafetyProfile` or enhance `RequireAuth` with an allowlist for completion-exempt routes;
- fetch completion status from a backend procedure such as `users.getSafetyProfileCompletionStatus`;
- redirect incomplete human users to a dedicated completion route such as `/profile/safety-completion` or a focused Settings/Profile completion state;
- keep `/settings`, `/settings?tab=security`, logout, support, account recovery, and admin safety recovery routes exempt as needed;
- preserve safe internal `returnTo` paths and avoid loops when the current path is already exempt.

This client guard is not the security boundary. Backend procedures and Express routes must still call the age policy/profile-completion service before protected actions, because public API, MCP, workers, widget traffic, and direct route calls do not rely on the React router.

### 23.19 Completion State Needs Versioning And Non-Browser Error Contracts

Because completion status affects route access, menu projection, policy decisions, and under-minimum account handling, it should not be treated as a static client boolean.

Implementation guidance:

- expose `profileVersion` or equivalent `updatedAt` metadata from the server;
- include `policyVersion` and active `jurisdictionPresetId` in the completion status so clients can refetch after policy changes;
- invalidate completion/menu projections when DOB, country, active policy, preset approval/review state, tenant feature flag, or enforcement mode changes;
- for tRPC/API/MCP/worker requests, return structured errors with `reasonCode`, `missingFields`, and `nextAllowedRoute` instead of relying on browser redirects;
- after a user completes DOB/country, evaluate under-minimum service rules immediately and route to support/privacy/export/delete flow when required.

Country must remain user-declared country/region of residence. Browser locale and IP geolocation may help detect suspicious mismatches, but they should not silently change the legal preset because that would make decisions difficult to audit and explain.

### 23.20 Unlock Tokens And Safety Profile Data Need Strong Lifecycle Controls

Protected-surface unlock tokens should be validated against current server state, not just their signed expiry. If DOB/country changes, tenant context changes, PIN changes, or an admin updates the relevant policy/preset, an existing age override token may no longer represent a safe decision.

Implementation guidance:

- include profile/policy version metadata in age-related protected-surface token claims;
- reject unlock tokens when the current user profile version, tenant id, policy version, preset id, PIN version, day key, or session does not match the token;
- clear client-side age unlock state when the app observes tenant switch, profile update, logout, or policy-version refresh;
- keep Private Vault token behavior unchanged unless that feature intentionally adopts the same lifecycle semantics in a separate migration.

DOB and country should be handled as sensitive safety profile data:

- avoid showing raw DOB in admin list/reporting views;
- use explicit server helpers for redaction before audit/analytics/error telemetry;
- include safety profile fields in account export/delete and retention flows;
- review whether field-level encryption is needed before broad production rollout, especially if typed DOB columns are introduced.

### 23.21 Generated Content Needs Viewer-Time Enforcement

The repository has many surfaces where content can be consumed after initial generation: Media History, Library/Document Management, Storyboard Review, Presentation outputs, public/share links, marketplace captures, export/download routes, and API download endpoints. Protecting only the generation route leaves a bypass where an adult user creates or imports content and a child/unknown viewer later opens it.

Implementation guidance:

- store redacted safety metadata on generated/uploaded assets and chat artifacts;
- enforce age policy on view/open/preview/download/share/remix/reference actions using the current viewer context;
- default unknown public/share viewers to child-under-13 or stricter tenant default;
- block quarantined or review-pending assets from being reused as reference inputs;
- do not send exact DOB, exact age, country, guardian consent state, or full internal policy JSON to external LLM/media providers.

This viewer-time policy can be phased after shared Chat/media preflight, but it should be part of production readiness before broad public sharing or gallery features rely on generated assets.

### 23.22 Streaming And Async Pipelines Need Revalidation

Streaming LLM routes and async media/worker pipelines are time-separated from the initial request. A preflight decision can become stale before content is emitted, retried, delivered, or reused.

Implementation guidance:

- `/api/llm/stream` and related streaming handlers should not emit unsafe partial tokens before backend output policy handling has a chance to block/repair/refuse;
- async media procedures should store redacted policy metadata on the task and revalidate before worker/provider/MCP/Python dispatch;
- retries should re-check current policy instead of reusing a stale allow decision;
- provider callbacks/webhooks should verify task policy state before accepting output;
- if policy changes after provider completion but before delivery, quarantine output instead of showing it;
- credit reservations should be released or refunded when a queued job is cancelled by policy change before provider dispatch.

This complements the existing requirement that media age preflight run before initial credit reservation. It closes the gap where a job is valid at enqueue time but no longer valid at dispatch or delivery time.
