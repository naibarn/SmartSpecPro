---
spec_id: 306
numbering_status: PROVISIONAL_PENDING_CANONICAL_REPOSITORY_REGISTRY_CHECK
title: SmartAIHub Omnichannel Growth, Messaging, Registration, Assistant & Command Ingress Fabric
revision: R2.2-70PASS
status: PROPOSED_IMPLEMENTATION_READY_AUDITED_70_PASS
prepared: 2026-10-07
scope: SmartAIHub shared/core infrastructure
implementation_style: additive-only cumulative revision
supersedes_product_priority: SPEC-306 R1.0 WhatsApp-first priority
preserves_predecessor_security_contracts: true
target_repository_path: specs/feature/306-omnichannel-growth-messaging-registration-command-ingress/spec.md
primary_owner: SmartAIHub Omnichannel Growth & External Messaging Fabric
canonical_ingress_authority: SPEC-279 Universal Command Ingress & Agent Delegation Gateway R1.5 CANONICAL
canonical_access_admission_authority: SPEC-298 Universal Access Admission, Public Machine Access & Federated Authorization Gateway R1.3
canonical_assistant_authority: SPEC-269 SmartAIHub Assistant Workforce R3.18
canonical_memory_authority: SPEC-268
canonical_knowledge_evidence_authority: SPEC-266 plus current evidence/retrieval owner
canonical_capability_authority: implemented SPEC-256
canonical_task_control_authority: SPEC-277 Task Control Experience R1.8 CANONICAL
canonical_durable_job_authority: worker_jobs / worker_job_events and existing workflow/control-plane runtime
canonical_secret_authority: SPEC-272 Credential Vault, Root-of-Trust & Secure Provider Broker
risk_class: HIGH
policy_snapshot_date: 2026-10-07
first_class_channels:
  - telegram
  - line
  - facebook_messenger
  - instagram_direct
  - whatsapp_business
regional_extension_channels:
  - wechat_weixin
  - wecom
---

# CURRENT CUMULATIVE REVISION — R2.2
## Omnichannel Growth + Channel-Native Registration + Assistant/Command + Retention + Provider/Identity/Confidentiality Hardening

This R2.2 cumulative revision is normative where it is more specific than preserved R2.1/R2.0/R1.0 text. R2.2 retains the R2.1 corrections and adds another 20 audit closures for channel confidentiality, channel-originated registration, provider production readiness, deep-link integrity, consent/cost separation, operational timing, account recovery and regional release safety.

> **SmartAIHub SHALL treat external messaging as both a growth surface and a control/assistant surface.**

> **A user SHALL be able to move from advertisement/referral/QR/deep-link → conversation → anonymous trial → registration/account linking → first useful action → durable work → retention without losing identity or acquisition attribution.**

> **One person may use many channels and many login providers, but SmartAIHub MUST maintain one canonical human principal unless the user intentionally maintains separate accounts.**

## R2.0 mandatory invariants

```text
CHANNEL ≠ LOGIN PROVIDER.
MESSAGING IDENTITY ≠ LOGIN IDENTITY.
LOGIN IDENTITY ≠ CANONICAL HUMAN PRINCIPAL.
PHONE NUMBER ≠ AUTHORIZATION.
EMAIL MATCH ≠ ACCOUNT MERGE AUTHORITY.
DISPLAY NAME MATCH ≠ ACCOUNT MERGE AUTHORITY.
CROSS-CHANNEL SIMILARITY ≠ PERSON EQUIVALENCE.

ANONYMOUS VISITOR ≠ AUTHENTICATED USER.
ANONYMOUS TRIAL ≠ PRIVATE PROJECT AUTHORITY.
ACCOUNT LINKING MUST BE EXPLICITLY VERIFIED.
ACCOUNT MERGE MUST REQUIRE RE-AUTHENTICATION.

AD CLICK ≠ USER CONSENT FOR ALL FUTURE MESSAGES.
AD ATTRIBUTION ≠ AUTHORIZATION.
MARKETING CONSENT ≠ TRANSACTIONAL NOTIFICATION CONSENT.

CHANNEL POLICY ≠ SMARTAIHUB BUSINESS POLICY.
PROVIDER POLICY MUST BE RE-EVALUATED AT SEND TIME.

ONE CHANNEL FABRIC.
MANY PROVIDER ADAPTERS.
ONE CANONICAL PRINCIPAL MODEL.
ONE CANONICAL COMMAND PATH.
ONE CANONICAL DURABLE WORK STATE.
```

> **R2.1 corrective note:** current official WhatsApp Business Platform pricing states that service messages are not charged and utility messages sent in response to users are not charged under the current pricing description. Any preserved R1 text claiming a `1,000 service messages/month` free allowance is superseded and MUST NOT be implemented.

> **R2.1 channel expansion:** Instagram Direct is now a first-class acquisition/messaging adapter, and WhatsApp Business Platform is explicitly separated from WhatsApp's limited-availability Third-Party Agent platform.


> **R2.2 registration hardening:** channel-originated signup MUST survive in-app-browser limitations. Google OAuth MUST NOT depend on unsupported embedded user-agents; SmartAIHub SHALL support system-browser / supported browser handoff with a cryptographically protected return route.

> **R2.2 confidentiality hardening:** “message transport available” does not mean “safe for every data class.” Every provider surface SHALL publish a `ChannelConfidentialityProfile`, and secrets/highly sensitive artifacts SHALL be denied from channels that do not satisfy the required confidentiality policy.

> **R2.2 production-readiness rule:** a configured bot/Page/OA/WABA/app is not production-ready until provider account ownership, required reviews/permissions, policy snapshot, token health, webhook verification, privacy/support metadata and market profile gates all pass.

---

# R2.2 HARDENING AMENDMENT — 20 additional audit passes

R2.2 is normative and supersedes conflicting R2.1/R2.0/R1.0 language.

---

## R2.2-1. Channel confidentiality profile

SmartAIHub SHALL model confidentiality separately from transport availability.

```ts
interface ChannelConfidentialityProfile {
  providerSurfaceRef: string;

  encryptionClass:
    | 'E2EE_PROVIDER_DEFINED'
    | 'TRANSPORT_ENCRYPTED_PROVIDER_READABLE'
    | 'AGENT_PROVIDER_READABLE'
    | 'UNKNOWN';

  providerCanProcessPlaintext: boolean | 'UNKNOWN';
  externalAgentReceivesPlaintext: boolean | 'UNKNOWN';

  maxAllowedDataClass:
    | 'PUBLIC'
    | 'INTERNAL'
    | 'CONFIDENTIAL'
    | 'RESTRICTED';

  secretsAllowed: false;
  rawCredentialMaterialAllowed: false;

  policySnapshotRef: string;
}
```

Mandatory invariant:

```text
CHANNEL SUPPORT ≠ CONFIDENTIALITY AUTHORITY.
```

Current WhatsApp Third-Party Agent terms explicitly state that communications with connected 3P Agents are **not equivalent to end-to-end encrypted personal messages** and that the Agent Provider receives/processes the messages. Therefore the 3P Agent surface MUST display an appropriate privacy/confidentiality disclosure and MUST NOT be treated as a secret-delivery path.

For all channels:

- reusable credentials, private keys, recovery codes and raw secrets MUST NOT be sent;
- sensitive artifacts MUST pass data-classification policy before rendering;
- “encrypted in transit” MUST NOT be presented to the user as equivalent to E2EE;
- a provider capability marked `UNKNOWN` confidentiality MUST fail closed for `RESTRICTED` data.

---

## R2.2-2. Channel data-class delivery policy

Before sending any outbound content:

```text
semantic result
    ↓
data classification
    ↓
channel confidentiality profile
    ↓
tenant/user egress policy
    ↓
provider policy
    ↓
render/redact/link/deny
```

Preferred handling for sensitive output:

```text
send minimal notification
+ signed short-lived SmartAIHub deep link
```

instead of embedding:

- secret values;
- source code that policy marks restricted;
- private incident logs;
- confidential document contents;
- full customer records;
- credential material.

A channel MAY announce that a sensitive result exists without transporting the result itself.

---

## R2.2-3. Google OAuth from messaging-app browsers

SmartAIHub uses Google authentication prominently, but Google OAuth authorization endpoints can reject unsupported embedded user-agents (`disallowed_useragent`).

Therefore channel registration MUST support:

```text
LINE / Messenger / Instagram / WhatsApp / Telegram in-app browser
        ↓
SmartAIHub registration primer
        ↓
detect provider/browser capability
        ↓
if Google OAuth is not supported safely
        ↓
open system browser / supported external browser
        ↓
OIDC Authorization Code + PKCE + state + nonce
        ↓
SmartAIHub callback
        ↓
consume signed return route
        ↓
return to originating channel/app when possible
```

The implementation MUST NOT weaken OAuth by switching to an insecure embedded login merely to avoid user friction.

The registration UI SHALL offer another safe supported login method when external-browser handoff is unavailable.

---

## R2.2-4. Secure return-route contract

The “return to chat after signup” feature creates an open-redirect and token-leak risk.

Use a server-side `RegistrationReturnRoute`:

```ts
interface RegistrationReturnRoute {
  id: string;
  acquisitionSessionRef?: string;
  providerSurfaceRef: string;
  channelAccountRef?: string;
  messagingIdentityRef?: string;

  returnKind:
    | 'TELEGRAM_DEEP_LINK'
    | 'LINE_DEEP_LINK'
    | 'MESSENGER_THREAD'
    | 'INSTAGRAM_THREAD'
    | 'WHATSAPP_THREAD'
    | 'WECHAT_ROUTE'
    | 'SMARTAIHUB_WEB';

  providerReturnRef?: string;

  createdAt: string;
  expiresAt: string;
  consumedAt?: string;
  nonceHash: string;
}
```

Rules:

- no arbitrary user-supplied redirect URL;
- one-time consumption;
- short TTL;
- bind to registration transaction;
- preserve acquisition attribution by reference, not by trusting query-string marketing fields after authentication;
- never place access/refresh tokens in return URLs.

---

## R2.2-5. Identity-link conflict recovery

If a provider identity is already bound to another canonical principal, linking MUST stop.

```text
MessagingIdentity X
already bound → Principal A

Principal B attempts link
        ↓
IDENTITY_LINK_CONFLICT
        ↓
no automatic merge
        ↓
re-authenticate both relevant ownership proofs
        ↓
account recovery / explicit merge workflow
```

The system MUST NOT:

- “take over” the older link because a new login is fresh;
- merge based on email/phone similarity;
- silently detach the old principal;
- use support staff override without durable audit and authorized recovery procedure.

---

## R2.2-6. Provider account production-readiness state

A provider account SHALL have a production-readiness state independent of code deployment.

```ts
type ProviderAccountReadiness =
  | 'DRAFT'
  | 'OWNERSHIP_UNVERIFIED'
  | 'CONFIGURING'
  | 'APP_REVIEW_REQUIRED'
  | 'BUSINESS_VERIFICATION_REQUIRED'
  | 'PERMISSION_REVIEW_REQUIRED'
  | 'POLICY_REVIEW_REQUIRED'
  | 'SANDBOX_READY'
  | 'PRODUCTION_READY'
  | 'DEGRADED'
  | 'RESTRICTED'
  | 'SUSPENDED'
  | 'REVOKED';
```

The exact states required vary by provider.

Production traffic MUST NOT be enabled simply because:

- a token exists;
- a webhook returns 200;
- a test account works;
- a bot username exists;
- a Page/OA/WABA was created.

Release gates SHALL verify provider-specific app/account reviews and permissions where applicable.

---

## R2.2-7. Token, permission and deauthorization lifecycle

Every provider credential/permission binding SHALL track:

```text
credential_ref
provider_surface_ref
granted_scopes/permissions
issued_at
last_verified_at
expires_at if applicable
rotation_due_at if applicable
revocation/deauthorization state
provider_account_state
```

The platform SHALL detect and handle:

- revoked token;
- expired token;
- removed app permission;
- user deauthorization;
- Page/OA/admin ownership change;
- provider account restriction;
- app review scope loss.

Loss of channel permission MUST NOT delete the SmartAIHub principal or canonical work.

---

## R2.2-8. Pricing eligibility is not messaging permission

Two separate decisions are mandatory:

```text
SendEligibilityDecision
CostEligibilityDecision
```

Examples:

- a WhatsApp 72-hour free-entry-point period may make messages free but does NOT by itself create authorization for prohibited content or bypass AI-provider restrictions;
- LINE quota availability does NOT imply the user is eligible to receive push;
- an available Telegram paid-broadcast path does NOT override opt-out/fatigue policy.

Mandatory invariant:

```text
FREE ≠ PERMITTED.
PERMITTED ≠ FREE.
```

---

## R2.2-9. Ad click / conversation start is not blanket marketing consent

Acquisition actions such as:

- clicking an ad;
- scanning a QR;
- opening a deep link;
- starting a bot;
- sending a support message;
- registering an account;

MUST NOT be converted into perpetual marketing consent unless the applicable provider/law/consent ceremony actually establishes that permission.

Consent records SHALL distinguish:

```text
transactional/service
job/task notification
security/authentication
product update
marketing/promotion
partner/tenant marketing
```

---

## R2.2-10. Deep-link and referral integrity

Channel deep links and ad/referral payloads are untrusted input unless provider-authenticated or SmartAIHub-signed.

Examples:

- Telegram `start` parameter;
- LINE/LIFF state;
- QR campaign tokens;
- Meta referral payloads;
- first-party campaign URLs.

The system SHALL:

- verify provider-origin metadata where available;
- sign first-party campaign/referral state;
- impose TTL;
- use nonce/replay protection where relevant;
- separate “display attribution label” from canonical campaign identity;
- reject campaign tokens that attempt to inject tenant/project authorization.

---

## R2.2-11. Embedded Mini App / launch-context verification

Embedded surfaces MUST verify launch context server-side.

Examples include:

- Telegram Mini App init data;
- LINE LIFF / LINE MINI App identity context;
- Meta webview/deep-link context where supported;
- future WeChat Mini Program context.

The browser/client payload itself MUST NOT be considered identity proof until cryptographically/provider-verified according to the current provider contract.

A Mini App launched from a channel inherits **no extra SmartAIHub authorization** merely because it was launched from a trusted bot/OA/Page.

---

## R2.2-12. Quiet hours require timezone semantics

`quietHoursPolicyRef` is insufficient without a timezone source.

```ts
interface NotificationTimeContext {
  principalRef: string;
  timezone: string;        // IANA TZ identifier
  source: 'USER_PROFILE'|'PROJECT'|'TENANT'|'CHANNEL'|'DEFAULT';
  lastVerifiedAt?: string;
}
```

Requirements:

- use IANA timezones, not fixed UTC offsets;
- handle DST where applicable;
- define behavior for missing/invalid timezone;
- scheduled “09:00 every day” is local-wall-clock intent unless user explicitly chose UTC;
- critical escalation MAY override quiet hours only under explicit policy;
- cross-border tenants MUST NOT use server timezone as a user-notification default.

---

## R2.2-13. WhatsApp Third-Party Agent maturity gate

Existence of WhatsApp Third-Party Agent Terms does not prove that SmartAIHub has a generally available developer onboarding/API path.

The capability SHALL remain:

```text
providerSurface = WHATSAPP_3P_AGENT_PLATFORM
maturity = EXPERIMENTAL_UNTIL_ONBOARDED
productionEnabled = false
```

until SmartAIHub has:

- official Agent Provider onboarding/access;
- current technical API documentation;
- credential/authentication contract;
- webhook/transport contract;
- rate/availability policy;
- supported-market list;
- privacy/user disclosure requirements;
- production conformance evidence.

No roadmap assumption may treat it as a drop-in replacement for WhatsApp Business Platform.

---

## R2.2-14. Third-party-agent age and privacy eligibility

Current WhatsApp 3P Agent terms state a minimum user age of 13, or a greater age where local law requires.

SmartAIHub SHALL maintain a provider-surface `UserEligibilityPolicy`.

For any channel whose terms have age/region/account restrictions:

- eligibility MUST be checked where the product has reliable information and the provider requires it;
- SmartAIHub MUST NOT infer age from language/avatar/content;
- underage/unknown cases SHALL follow the applicable account/product policy;
- privacy notice MUST explain when messages are delivered to an independent agent provider and are not equivalent to personal E2EE chats.

---

## R2.2-15. Channel account ownership and disaster recovery

A production channel is a business asset.

Every production `channel_account` SHALL record:

```text
legal/business owner
tenant/platform owner
provider account administrators
recovery contacts
credential owner
phone/domain/Page/OA/bot ownership evidence
renewal/number-retention obligations
transfer policy
break-glass procedure
last recovery drill
```

Requirements:

- no critical production channel may depend solely on one employee’s personal account;
- ownership transfer MUST NOT silently rebind user identities;
- phone-number recycling/reassignment requires revalidation;
- losing a Page/OA/WABA/bot token MUST not lose canonical users/jobs.

---

## R2.2-16. Provider-cost allocation and tenant billing attribution

Operational provider cost SHALL be distinct from user/tenant billing.

```ts
interface ChannelCostAllocation {
  notificationEpisodeRef?: string;
  providerSurfaceRef: string;
  channelAccountRef: string;
  tenantRef?: string;
  campaignRef?: string;

  providerCostEstimate?: number;
  providerCostActual?: number;
  currency?: string;

  platformSubsidyAmount?: number;
  tenantChargeAmount?: number;

  pricingSnapshotRef: string;
}
```

A shared SmartAIHub number/Page/OA MUST be able to allocate provider cost by tenant/use case without exposing another tenant’s volumes.

Marketing spend and messaging transport spend SHALL remain separately attributable.

---

## R2.2-17. Conversion-event idempotency and reconciliation

Ad/conversion systems may retry events or receive them out of order.

Each conversion event SHALL have a stable semantic ID:

```text
conversion_event_id
principal/acquisition ref
event_type
occurred_at
provider_sink
provider_delivery_id
dedupe_key
consent/legal-basis ref
```

Rules:

- retries MUST NOT double-count internal conversion;
- provider acceptance does not prove attribution credit;
- provider reports are projections, not SmartAIHub source of truth;
- delayed provider attribution MAY reconcile later without rewriting raw acquisition evidence;
- deletion/consent revocation SHALL follow applicable data-governance policy.

---

## R2.2-18. Provider backpressure and fairness

Each adapter SHALL implement:

- provider rate-limit observation;
- bounded queues;
- exponential/jittered retry where applicable;
- `Retry-After`/provider backoff semantics;
- per-tenant fairness;
- critical-vs-bulk priority;
- campaign throttling;
- dead-letter handling;
- no unbounded fan-out.

A single high-volume tenant/campaign MUST NOT starve security alerts or operational notifications for other tenants.

Paid higher-throughput options, where available, require budget/policy approval; they are not an automatic retry strategy.

---

## R2.2-19. Mainland China profile is a separate release gate

The presence of WeChat/Weixin/WeCom abstractions does NOT make Mainland China deployment production-ready.

`MARKET_PROFILE_CN_MAINLAND` MUST remain gated until current evidence confirms:

- provider developer/app eligibility;
- approved authentication path;
- messaging/Mini Program/WeCom capabilities needed by the release;
- domain/network reachability;
- local business/provider requirements;
- privacy/data-transfer/data-residency obligations applicable to the actual deployment;
- payment/billing path where required;
- operational support/recovery path.

Google, Facebook, WhatsApp and Telegram MUST NOT be required for core signup/recovery in this profile.

If these conditions are not verified, the UI/product SHALL label the China profile `NOT_PRODUCTION_READY` rather than silently degrade authentication.

---

## R2.2-20. Market × provider release conformance matrix

A provider implementation passing unit tests is not enough.

Each release SHALL publish a matrix:

```text
market profile
× provider surface
× acquisition
× registration
× messaging
× proactive notification
× assistant mode
× authentication
× high-risk approval
× privacy/data egress
× cost
× provider readiness
```

Each cell SHALL be one of:

```text
CERTIFIED
CERTIFIED_WITH_RESTRICTIONS
EXPERIMENTAL
DISABLED
BLOCKED_POLICY
BLOCKED_PROVIDER
NOT_TESTED
```

Production traffic MAY use only `CERTIFIED` or explicitly approved `CERTIFIED_WITH_RESTRICTIONS` cells.

`NOT_TESTED` MUST NOT silently behave as supported.

---

# R2.2 acceptance criteria extension

`AC-306-R22-001` Every provider surface has a ChannelConfidentialityProfile before sensitive outbound delivery.

`AC-306-R22-002` Raw reusable credentials and secrets are prohibited from external messaging channels.

`AC-306-R22-003` Sensitive results can be replaced by a minimal notification plus short-lived SmartAIHub link.

`AC-306-R22-004` WhatsApp 3P Agent conversations are not represented to users as equivalent to personal E2EE conversations.

`AC-306-R22-005` Google OAuth registration can leave an unsupported in-app browser and complete in a supported system/external browser.

`AC-306-R22-006` OAuth uses state/nonce and PKCE where applicable.

`AC-306-R22-007` Registration return routes cannot be arbitrary open redirects.

`AC-306-R22-008` Registration return routes are short-lived and one-time.

`AC-306-R22-009` Access/refresh tokens never appear in return URLs.

`AC-306-R22-010` An already-bound messaging/login identity causes a conflict workflow, not silent reassignment.

`AC-306-R22-011` Account merge/recovery requires explicit ownership proof and durable audit.

`AC-306-R22-012` Each production provider account has ProviderAccountReadiness state.

`AC-306-R22-013` Test webhook success alone cannot mark a provider account PRODUCTION_READY.

`AC-306-R22-014` App review/business verification/permission review are modeled where the provider requires them.

`AC-306-R22-015` Provider token/permission revocation degrades the channel without deleting the SmartAIHub principal.

`AC-306-R22-016` SendEligibilityDecision and CostEligibilityDecision are distinct.

`AC-306-R22-017` A free-price window cannot bypass content/provider/AI policy.

`AC-306-R22-018` Ad click/conversation start is not blanket marketing consent.

`AC-306-R22-019` Consent categories distinguish service/security/operational/marketing purposes.

`AC-306-R22-020` First-party referral/deep-link tokens are signed or otherwise integrity protected.

`AC-306-R22-021` Referral/deep-link replay is bounded by TTL/nonce/idempotency policy.

`AC-306-R22-022` Campaign/referral payload cannot grant tenant/project authorization.

`AC-306-R22-023` Telegram Mini App launch identity is verified server-side.

`AC-306-R22-024` LINE LIFF/Mini App launch identity is verified according to current provider contract.

`AC-306-R22-025` Embedded launch context grants no extra SmartAIHub authority.

`AC-306-R22-026` Quiet hours use IANA timezone identifiers.

`AC-306-R22-027` Scheduled local-wall-clock notification behavior is defined across DST changes.

`AC-306-R22-028` Server timezone is never silently used for cross-region user schedules.

`AC-306-R22-029` WhatsApp 3P Agent remains EXPERIMENTAL_UNTIL_ONBOARDED until official provider access and conformance exist.

`AC-306-R22-030` Presence of legal terms alone is insufficient to mark WhatsApp 3P Agent production-ready.

`AC-306-R22-031` Provider age/region eligibility is represented in policy rather than inferred from user content.

`AC-306-R22-032` Required 3P-agent privacy disclosure can be surfaced to the user.

`AC-306-R22-033` Every production channel account has documented business ownership and recovery contacts.

`AC-306-R22-034` Production channel ownership does not rely solely on a single employee personal account.

`AC-306-R22-035` Channel-account ownership transfer does not silently rebind user identities.

`AC-306-R22-036` Provider/messaging costs can be allocated by tenant/channel/use case.

`AC-306-R22-037` Shared channel accounts do not leak another tenant’s cost/volume data.

`AC-306-R22-038` Marketing-ad spend and messaging transport spend remain separately attributable.

`AC-306-R22-039` Conversion event retries do not double-count canonical conversion.

`AC-306-R22-040` Provider attribution reports are projections, not canonical conversion truth.

`AC-306-R22-041` Provider adapters honor rate/backpressure signals and bounded retry.

`AC-306-R22-042` Bulk campaigns cannot starve critical operational/security notifications.

`AC-306-R22-043` Paid throughput requires explicit budget/policy approval.

`AC-306-R22-044` Mainland-China market profile is blocked until current provider/legal/network readiness is verified.

`AC-306-R22-045` Mainland-China core signup/recovery does not depend on Google/Facebook/WhatsApp/Telegram.

`AC-306-R22-046` Market/provider conformance matrix is generated for each production release.

`AC-306-R22-047` NOT_TESTED provider-market cells never become implicitly supported.

`AC-306-R22-048` Policy/capability/readiness changes can demote a previously certified cell without redeploying core runtimes.

`AC-306-R22-049` Sensitive-channel delivery and registration flows are included in production chaos/security tests.

`AC-306-R22-050` Final verification proves at least one complete acquisition→registration→identity-link→command→job→notification flow for every enabled certified provider/market path.

---

# R2.2 added audit passes 51–70

| Pass | Lens | Gap found | R2.2 closure |
|---:|---|---|---|
| 51 | Channel confidentiality | Transport support could be mistaken for safe handling of secrets | Added ChannelConfidentialityProfile and data-class gate |
| 52 | Sensitive egress | Full sensitive result could be pushed into chat | Added redact/link/deny strategy |
| 53 | Google auth in channel browsers | Embedded user-agent may fail Google OAuth | Added supported external/system-browser handoff |
| 54 | Return-route security | Signup return could become open redirect/token leak | Added server-side one-time RegistrationReturnRoute |
| 55 | Identity link conflict | Existing provider identity could be silently stolen/merged | Added fail-stop conflict/recovery workflow |
| 56 | Provider production readiness | Token + webhook could be mistaken for production readiness | Added ProviderAccountReadiness state machine |
| 57 | Permission lifecycle | Revoked scopes/admin changes under-modeled | Added token/permission/deauthorization lifecycle |
| 58 | Cost vs permission | Free/quota availability could be treated as send authority | Split SendEligibility from CostEligibility |
| 59 | Marketing consent | Ad click/chat start could be over-expanded into marketing opt-in | Added purpose-specific consent boundary |
| 60 | Deep-link integrity | Campaign/start/referral payloads could be forged/replayed | Added signing, TTL, nonce and no-auth escalation rule |
| 61 | Embedded launch context | LIFF/Mini App payload could be trusted client-side | Required provider/server-side verification |
| 62 | Time semantics | Quiet hours lacked timezone/DST contract | Added IANA timezone and local-wall-clock semantics |
| 63 | WhatsApp 3P maturity | Terms existed but implementation availability could be assumed | Marked EXPERIMENTAL_UNTIL_ONBOARDED |
| 64 | Age/privacy eligibility | 3P agent age/privacy contract absent | Added provider eligibility and disclosure policy |
| 65 | Channel ownership recovery | Critical bot/Page/OA/number ownership lifecycle incomplete | Added owner/recovery/transfer/break-glass contract |
| 66 | Cost allocation | Shared-number/provider cost not tenant-attributable | Added ChannelCostAllocation |
| 67 | Conversion reliability | Ad conversion retries/out-of-order events could double count | Added stable conversion IDs and reconciliation |
| 68 | Backpressure/fairness | One campaign/tenant could monopolize provider throughput | Added bounded queues, fairness and priorities |
| 69 | China readiness | WeChat abstraction risked implying production readiness | Added separate CN release gate |
| 70 | Release certification | “Adapter implemented” insufficient across markets/policies | Added market×provider conformance matrix |

All 20 added gaps/hardening opportunities are normatively closed at specification level. Implementation evidence is still required.

---

# R2.2 implementation priority delta

```text
0. canonical SPEC-number reconciliation
1. identity and anonymous actor model
2. ProviderSurface + ProviderPolicy + ProviderAccountReadiness registry
3. ChannelConfidentialityProfile + data-class egress
4. secure channel-originated registration / system-browser OAuth return route
5. cross-channel NotificationEpisode + timezone/fatigue controls
6. Telegram + LINE reference adapters
7. Messenger + Instagram acquisition adapters
8. WhatsApp Business policy-constrained adapter
9. WhatsApp 3P Agent discovery/onboarding only when officially available to SmartAIHub
10. WeChat/WeCom only after CN market readiness gate
11. conversion/attribution reconciliation and cost allocation
12. market×provider certification matrix and production drills
```

# R2-1. Product decision

R1.0 correctly established provider-neutral messaging infrastructure and a hardened WhatsApp adapter, but its product priority was WhatsApp-first.

R2.0 changes the product strategy:

```text
                       SmartAIHub
        Omnichannel Growth & Messaging Fabric
                            │
         ┌──────────────────┼───────────────────┐
         │                  │                   │
   Acquisition         Registration        Retention/
   & Trial             & Linking           Command
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
     ┌──────────────┬───────┼────────────┬───────────┬──────────────┐
     ▼              ▼       ▼            ▼           ▼              ▼
 Telegram          LINE   Messenger   Instagram    WhatsApp     WeChat/WeCom
```

First-class implementation SHALL cover Telegram, LINE, Facebook Messenger, Instagram Direct and WhatsApp Business. China-market architecture SHALL additionally support WeChat/Weixin login and a pluggable WeChat/WeCom channel adapter instead of assuming Google/Meta/Telegram reachability.

No adapter may own assistant reasoning, project semantics, durable jobs, approval authority, memory or tenant authorization.

---

# R2-2. Channel roles

| Channel | Primary SmartAIHub role | Secondary role | Main constraint class |
|---|---|---|---|
| Telegram | Full assistant, power-user control, durable job notifications, Mini Apps | developer/community acquisition | bot anti-spam/rate/platform rules |
| LINE | Thailand consumer acquisition, assistant, push retention, LINE MINI App/LIFF | business/tenant branded experiences | message quota/pricing, friend/consent rules |
| Facebook Messenger | Meta ads → conversation acquisition, social/customer ingress | linked assistant/control | Meta messaging-window and Page policy |
| Instagram Direct | Instagram/Reels/Story acquisition → DM conversation | social/customer ingress, assistant/control after verified link | Professional-account messaging policy; user-initiated conversation constraints |
| WhatsApp Business | international/business acquisition, command/control, car-adjacent messaging | notifications and OTP | Meta 24h/templates/pricing + AI-provider restrictions |
| WeChat/Weixin | Mainland-China registration and consumer channel | Mini Program/assistant where approved | China/provider/regulatory policy |
| WeCom | China enterprise/work channel | tenant/team integration | enterprise/admin/policy constraints |

Channel priority SHALL be deployment/market specific, not globally hard-coded.

Suggested initial rollout profiles:

```text
Thailand:
  LINE + Telegram = P0
  Messenger = P1
  WhatsApp = P1/P2 according to Meta policy

International:
  Telegram + Messenger + WhatsApp according to region/use case

Mainland China:
  WeChat/Weixin + WeCom + local phone/email identity
  Google/WhatsApp/Facebook/Telegram MUST NOT be assumed reachable
```

---

# R2-3. Acquisition is a canonical channel capability

External messaging SHALL support these acquisition sources:

- click-to-message ads;
- LINE Ads / Official Account entry;
- Meta Facebook/Instagram → Messenger/WhatsApp destinations;
- Telegram deep links / bot links / Mini App links;
- QR codes;
- website CTA;
- referral links;
- creator/affiliate links;
- tenant-branded links;
- campaign links;
- organic search/social entry;
- physical marketing/printed QR;
- future channel-specific ads.

The first interaction SHALL create a privacy-minimized `AcquisitionSession`, not a full authenticated user unless registration succeeds.

```ts
interface AcquisitionSession {
  id: string;
  provider?: string;
  channelAccountRef?: string;
  anonymousPrincipalRef: string;
  sourceClass: 'AD'|'REFERRAL'|'QR'|'ORGANIC'|'DIRECT'|'PARTNER'|'UNKNOWN';
  campaignRef?: string;
  adSetRef?: string;
  adRef?: string;
  creativeRef?: string;
  clickRef?: string;
  referralRef?: string;
  landingRef?: string;
  initialIntent?: string;
  firstSeenAt: string;
  attributionPolicyRef: string;
  consentStateRef?: string;
}
```

An acquisition record MUST NOT itself grant private resource access.

---

# R2-4. Anonymous trial

SmartAIHub SHOULD allow useful low-risk trial behavior before registration where economically and legally acceptable.

Allowed examples MAY include:

- “SmartAIHub ทำอะไรได้บ้าง”;
- public feature demo;
- public web/news explanation if channel/provider policy permits;
- bounded sample document analysis under guest quota;
- demo project/task experience using synthetic data;
- Mini App product tour;
- pricing/product comparison.

Anonymous trial MUST NOT expose:

- private user projects;
- tenant data;
- memory;
- prior conversations of a known user;
- paid credentials;
- privileged tools;
- production operations.

Guest execution MUST pass SPEC-298 admission and cost protection before expensive work.

---

# R2-5. Registration from every channel

Every first-class channel SHALL provide a path from conversation/embedded UI to SmartAIHub registration.

The registration experience SHOULD choose the lowest-friction provider for the channel but MUST also allow another supported authentication method.

Example:

```text
LINE ad → LINE OA chat
    ↓
[เริ่มใช้ฟรี]
    ↓
LINE Login / Google / other allowed auth
    ↓
Create SmartAIHub Principal
    ↓
Bind LINE messaging identity
    ↓
Preserve campaign attribution
    ↓
Return to LINE chat/LIFF
```

Registration MUST preserve:

- acquisition session;
- first intent;
- referral/campaign data according to privacy policy;
- channel return route;
- pending safe trial state where appropriate.

---

# R2-6. Canonical principal and multi-login identity model

SmartAIHub SHALL use a canonical principal independent of authentication provider.

```ts
interface AnonymousActor {
  id: string;
  acquisitionSessionRef?: string;
  createdAt: string;
  expiresAt: string;
  purposeRef: string;
  state: 'ACTIVE'|'EXPIRED'|'PROMOTED'|'REVOKED';
}

interface HumanPrincipal {
  id: string;
  status: 'ACTIVE'|'SUSPENDED'|'DELETED';
  createdAt: string;
}

interface FederatedLoginIdentity {
  id: string;
  principalRef: string;
  provider:
    | 'google'
    | 'line'
    | 'telegram'
    | 'facebook'
    | 'wechat'
    | 'apple'
    | string;
  issuer: string;
  clientScopeRef: string;
  providerSubject: string;
  assuranceLevel: string;
  verifiedAt: string;
  state: 'ACTIVE'|'REVOKED';
}

interface AuthenticationFactor {
  id: string;
  principalRef: string;
  factorType:
    | 'verified_email'
    | 'email_magic_link'
    | 'verified_phone'
    | 'phone_otp'
    | 'whatsapp_otp'
    | 'passkey'
    | 'totp'
    | 'recovery_code'
    | string;
  destinationRef?: string;
  assuranceLevel: string;
  verifiedAt?: string;
  state: 'ACTIVE'|'REVOKED';
}

interface MessagingIdentity {
  id: string;
  provider: string;
  channelAccountRef: string;
  externalSenderRef: string;
  principalRef?: string;
  bindingState: 'UNBOUND'|'PENDING'|'BOUND'|'REVOKED';
}
```

One principal MAY have many login identities and many messaging identities.

Example:

```text
HumanPrincipal U123
├─ Federated identities
│  ├─ Google
│  ├─ LINE
│  ├─ Telegram
│  ├─ Facebook
│  └─ WeChat
├─ Authentication factors
│  ├─ WhatsApp/Phone OTP
│  └─ Passkey / other configured factors
│
├─ LINE Messaging identity
├─ Telegram Bot identity
├─ Messenger PSID/session identity
└─ WhatsApp sender identity
```

No provider-specific ID SHALL become SmartAIHub’s canonical user ID.

Identity uniqueness MUST be scoped by provider issuer and application/channel scope:

```text
federated identity uniqueness =
  (provider, issuer, client_scope_ref, provider_subject)

messaging identity uniqueness =
  (provider, channel_account_ref, external_sender_ref)
```

Verified email, phone number, profile name, avatar, username, or cross-provider similarity MUST NOT be used as a silent merge key.

Apple private-relay email, provider-masked email, recycled phone numbers and provider-scoped IDs MUST be treated as normal provider identities with their own lifecycle.

OTP delivery through WhatsApp/SMS/email proves control of a destination for the bounded authentication ceremony; it MUST NOT be modeled as an OAuth/OIDC issuer or assumed to prove durable person identity beyond the assurance policy.

---

# R2-7. Google authentication remains global default

Google OAuth/OIDC MAY remain SmartAIHub’s preferred global sign-in path where available.

However:

- acquisition channels MUST NOT require Google if a suitable native login exists;
- the platform MUST support multiple identity providers;
- Google availability MUST NOT be assumed in all regions;
- authentication choice MUST be separate from messaging-channel choice.

A LINE user may sign up with Google and then bind LINE; a Telegram user may sign up with Google; a Messenger user may choose Google rather than Facebook Login.

---

# R2-8. LINE-native registration

LINE SHALL support:

1. **LINE Login** for direct registration/login;
2. Messaging API account linking for an existing SmartAIHub account;
3. LIFF / LINE MINI App identity flows where applicable;
4. Add-Friend option during LINE Login where product policy chooses it.

Normative rules:

- LINE user IDs MUST be treated as provider-scoped identifiers;
- related LINE Login / Messaging / Mini App channels SHOULD be designed under the correct LINE Provider boundary to support consistent user identity where LINE guarantees it;
- SmartAIHub still owns cross-provider identity linking;
- users MUST be able to unlink according to LINE requirements and SmartAIHub policy.

LINE registration SHOULD support a one-tap “Create SmartAIHub account with LINE” path.

---

# R2-9. Telegram-native registration

Telegram SHALL support current Telegram login/OIDC capabilities and validated Mini App initialization data.

Rules:

- validate Telegram login/OIDC server-side;
- validate Mini App `initData` server-side;
- never trust `initDataUnsafe` as authentication proof;
- bot username/display name is not canonical identity;
- Telegram user ID remains provider identity, not SmartAIHub principal ID.

Telegram SHOULD provide:

```text
/start campaign payload
    ↓
trial
    ↓
[Create account]
    ↓
Telegram Login/OIDC or existing SmartAIHub login
    ↓
bind bot identity
    ↓
return to bot/Mini App
```

---

# R2-10. Facebook/Messenger registration

Messenger conversations SHALL be linkable to SmartAIHub accounts through a secure SmartAIHub registration/link flow.

Where Facebook Login is enabled:

```text
Messenger session
    ↓
secure one-time registration URL
    ↓
Facebook Login or Google/other login
    ↓
SmartAIHub principal
    ↓
verified bind back to exact Messenger channel identity
```

SmartAIHub MUST NOT assume a Messenger/Page-scoped identifier equals a Facebook Login application subject unless Meta provides a documented verified mapping for the deployment.

The linking ceremony SHALL prove both sides rather than fuzzy-match them.

## Instagram Direct registration/linking

Instagram Direct SHALL be treated as a messaging/acquisition identity for an Instagram Professional Account integration, not as a generic consumer SmartAIHub login provider.

Canonical flow:

```text
Instagram user starts DM
    ↓
Instagram messaging identity
    ↓
secure one-time SmartAIHub registration/link URL
    ↓
Google / Facebook / Telegram / LINE / Apple / other enabled login
    ↓
canonical SmartAIHub principal
    ↓
bind exact Instagram messaging identity
    ↓
return to Instagram DM when safe
```

The system MUST NOT assume that an Instagram messaging identity is equivalent to a Facebook Login subject, Instagram professional-account admin identity, email address, display name, or username.

Instagram messaging support MUST be capability/policy gated because current Meta messaging APIs require an eligible Professional account and user-initiated conversation semantics.

---

# R2-11. WhatsApp registration and authentication

WhatsApp Business Platform SHALL support registration/account-linking, but the implementation MUST distinguish two different Meta concepts:

### A. End-user SmartAIHub login/signup

WhatsApp **Authentication Templates** MAY deliver one-time passwords for:

- new account creation;
- login;
- account recovery;
- step-up verification;

This is an OTP transport/factor. It MUST NOT be modeled as a generic “WhatsApp OAuth identity provider” unless Meta introduces and documents such a consumer identity product.

Inbound WhatsApp sender identity MAY also participate in a secure account-link ceremony.

### B. Business/customer WABA onboarding

**WhatsApp Embedded Signup** is for businesses/Tech Providers connecting a WhatsApp Business Account and phone number to a solution.

It is NOT the end-user SmartAIHub signup mechanism.

These contracts MUST remain separate.

---

# R2-12. Mainland China authentication profile

For Mainland China, SmartAIHub SHALL NOT make Google, Facebook, Telegram or WhatsApp a mandatory authentication dependency.

The China profile SHOULD support:

- WeChat/Weixin login through the applicable Open Platform flow;
- WeChat/Weixin Mini Program identity where implemented;
- WeCom for enterprise/workforce tenants;
- local phone OTP where legally/operationally supported;
- email/magic-link where reachable;
- Apple Sign In as an optional supported identity on applicable Apple devices;
- local-compliant deployment/data-routing policy as separately governed.

Recommended flow:

```text
WeChat entry / QR / Mini Program
        ↓
Try SmartAIHub
        ↓
WeChat Login
        ↓
SmartAIHub Principal
        ↓
Bind WeChat messaging identity
        ↓
Tenant/project onboarding
```

China availability, data residency, AI-content, cybersecurity, ICP/licensing, model/service access and other legal requirements are separate release gates and MUST NOT be inferred from this messaging SPEC.

---

# R2-13. Account linking vs account merging

**Linking** adds another verified identity to the same principal.

**Merging** combines two already-created SmartAIHub principals and is higher risk.

Merge MUST require:

- authentication to both account sides or equivalent recovery proof;
- conflict analysis for tenant memberships;
- billing/credit reconciliation;
- memory/privacy handling;
- audit receipt;
- rollback/recovery plan where feasible.

The system MUST NOT auto-merge accounts because:

- emails look the same;
- phone numbers match unverified data;
- names/photos match;
- Telegram/LINE/Facebook profiles look similar;
- an LLM predicts they are the same person.

---

# R2-14. Cross-channel continuity

After verified linking, a user MAY:

```text
Discover via Facebook ad
→ start Messenger trial
→ register with Google
→ add LINE for notifications
→ use Telegram for power-user commands
→ later use web/desktop
```

All channels MAY refer to the same principal while preserving independent channel consent, notification policy and provider restrictions.

Conversation continuity MUST be policy-aware. Full raw transcripts SHOULD NOT be copied across channels by default.

The Assistant may recover canonical project/task state, authorized memory and evidence rather than replaying another provider’s raw chat history.

---

# R2-15. Attribution continuity across registration

Acquisition attribution SHALL survive the anonymous → registered transition.

```text
anonymous acquisition_session
        ↓
registration transaction
        ↓
principal created/bound
        ↓
activation events
        ↓
conversion events
```

The attribution service MUST support at least:

- first touch;
- last touch;
- configurable multi-touch evidence;
- campaign/ad/creative/referral dimensions;
- channel entry point;
- first intent;
- registration provider;
- first linked messaging channel;
- first useful result;
- first project connected;
- first durable job;
- first paid conversion;
- retention checkpoints.

Attribution is analytics evidence and MUST NOT become business authorization.

---

# R2-16. Conversion event contract

```ts
interface GrowthConversionEvent {
  id: string;
  principalRef?: string;
  anonymousPrincipalRef?: string;
  acquisitionSessionRef?: string;
  type:
    | 'CONVERSATION_STARTED'
    | 'TRIAL_COMPLETED'
    | 'REGISTRATION_STARTED'
    | 'REGISTRATION_COMPLETED'
    | 'CHANNEL_LINKED'
    | 'PROJECT_CONNECTED'
    | 'FIRST_USEFUL_RESULT'
    | 'FIRST_DURABLE_JOB'
    | 'FIRST_PAYMENT'
    | 'SUBSCRIPTION_STARTED'
    | 'RETENTION_CHECKPOINT';
  occurredAt: string;
  value?: number;
  currency?: string;
  properties?: Record<string, unknown>;
}
```

Provider conversion exports, such as advertising conversion APIs, SHALL consume this canonical event stream through adapters rather than becoming the source of truth.

---

# R2-17. Ads-to-conversation architecture

```text
Ad platform
   ↓ click/deep-link/referral context
Channel entry
   ↓
AcquisitionSession
   ↓
Anonymous trial / structured onboarding
   ↓
Registration
   ↓
Identity binding
   ↓
Activation
   ↓
ConversionEvent
   ↓
Attribution analytics
   ↓
Optional provider conversion sink
```

The system SHALL preserve campaign context across OAuth redirects and channel linking using signed/opaque state, not client-trusted query strings alone.

---

# R2-18. Tenant/white-label acquisition

A tenant MAY own or connect its own:

- LINE Official Account;
- Telegram bot;
- Facebook Page/Messenger app configuration;
- WhatsApp Business account/number where provider rules permit;
- WeChat/WeCom account where supported;
- advertising accounts/campaigns.

But tenant-owned channel configuration MUST route through the same SmartAIHub channel fabric.

```text
Tenant ad
   ↓
Tenant branded channel
   ↓
SmartAIHub Fabric
   ↓
Tenant-scoped assistant/mini apps
```

Tenant branding MUST NOT weaken platform security, permission or audit boundaries.

---

# R2-19. Channel capability registry

Capabilities SHALL be data-driven and policy-versioned.

```ts
interface ChannelCapabilityProfile {
  provider: string;
  supportsText: boolean;
  supportsAudio: boolean;
  supportsImages: boolean;
  supportsDocuments: boolean;
  supportsInteractiveChoices: boolean;
  supportsEmbeddedWebApp: boolean;
  supportsNativeLogin: boolean;
  supportsOtpAuthDelivery: boolean;
  supportsPushOutsideReplyWindow: boolean | 'POLICY_DEPENDENT';
  supportsAdsEntry: boolean | 'INDIRECT';
  supportsGroups: boolean | 'POLICY_DEPENDENT';
  supportsCalls: boolean | 'POLICY_DEPENDENT';
  pricingModelRef?: string;
  policySnapshotRef: string;
}
```

No business runtime may infer capability from provider name alone.

---

# R2-20. Provider policy differences are adapters, not forks

### Telegram

- no SmartAIHub-owned 24-hour customer-service-window model;
- bot/user-initiation and anti-spam rules still apply;
- outbound rate limits and paid-broadcast features are provider policy;
- Mini Apps can be rich SmartAIHub surfaces.

### LINE

- distinguish reply vs push/broadcast/narrowcast semantics and quota/cost;
- friend/block state affects reachability;
- LINE Login/Messaging account linking/LIFF can participate in identity flows;
- policy/pricing values are dynamic configuration.

### Messenger

- Meta messaging window and permitted out-of-window mechanisms are dynamic policy;
- Page/app permissions and review state are operational dependencies;
- ads-to-message is an acquisition strength;
- Messenger identifiers remain transport identities.

### WhatsApp

- preserve all R1.0 24h/template/cost rules;
- only qualifying inbound user message resets applicable 24h window;
- SmartAIHub outbound every 6h does not reset it;
- AI-provider restrictions remain release gates;
- Authentication Templates may deliver OTP but are not social-login OAuth.

### WeChat/WeCom

- provider and China-market policy must be versioned/configurable;
- login/messaging/mini-program/enterprise capabilities MUST be treated as separate capabilities;
- no global provider assumptions may be copied into China deployments.

---

# R2-21. Signup UX from channel

Every adapter SHALL implement a `registration_entry` capability using one of:

```text
native provider login
secure SmartAIHub OAuth page
embedded Mini App / LIFF / web app
OTP verification
secure one-time linking URL
```

The UX SHOULD avoid asking the user to retype information that the chosen identity provider securely supplies and the user consents to share.

The system SHALL not require a password if passwordless/OIDC registration is used.

---

# R2-22. Registration transaction

```ts
interface RegistrationTransaction {
  id: string;
  acquisitionSessionRef?: string;
  messagingIdentityRef?: string;
  requestedLoginProvider: string;
  state:
    | 'STARTED'
    | 'PROVIDER_AUTHENTICATED'
    | 'TERMS_CONSENTED'
    | 'PRINCIPAL_CREATED'
    | 'CHANNEL_BOUND'
    | 'COMPLETED'
    | 'FAILED'
    | 'EXPIRED';
  nonceRef: string;
  returnRouteRef?: string;
  createdAt: string;
  expiresAt: string;
}
```

Registration MUST be idempotent and retry-safe.

OAuth/state/nonces MUST be server-generated, single-purpose and expiry-bound.

---

# R2-23. Existing-user detection

After successful provider authentication, SmartAIHub MAY discover that the provider subject is already linked to a principal.

It MUST NOT infer an existing principal from an unverified email alone.

If an authenticated provider supplies a verified email matching another account but identity linkage is not yet proven, SmartAIHub SHOULD offer an explicit secure account-link flow rather than silently merging.

---

# R2-24. Registration consent bundle

Registration SHALL independently capture as applicable:

- SmartAIHub terms acceptance;
- privacy notice acknowledgement;
- provider-specific scopes/consent;
- marketing consent;
- proactive messaging consent;
- AI/data-use consent where required;
- tenant terms where applicable.

Refusing marketing consent MUST NOT prevent core account creation unless marketing is genuinely necessary for the chosen service.

---

# R2-25. Notification preference matrix

A user may have multiple channels with independent permissions:

```text
User U123
├─ LINE: critical + project completion
├─ Telegram: all task progress
├─ Messenger: acquisition/support only
├─ Instagram Direct: acquisition/support/DM follow-up subject to current eligibility
├─ WhatsApp: security/OTP + selected business notifications
└─ Email: weekly summary
```

The Notification Broker SHALL choose among user-approved channels based on:

- event severity;
- user preference;
- provider reachability;
- policy window;
- cost;
- quiet hours;
- data sensitivity;
- tenant policy;
- region;
- delivery health.

---

# R2-26. Cross-channel failover

Failover MAY occur only to a channel that:

- belongs to the same proven principal;
- is enabled by the user;
- permits the message purpose;
- passes provider policy;
- passes tenant/privacy policy.

Example:

```text
Job critical alert
→ WhatsApp window/policy denies free-form
→ LINE permitted + user enabled
→ deliver via LINE
```

A denied authorization may never be bypassed by changing channel.

---

# R2-27. Mini App / embedded web surfaces

The Fabric SHALL support embedded/linked rich UI surfaces where provider capability permits:

- Telegram Mini Apps;
- LINE MINI App / LIFF;
- Messenger web surfaces where current platform policy permits;
- secure browser/deep links from WhatsApp;
- WeChat Mini Programs in China profile.

These surfaces SHOULD reuse SmartAIHub Mini App/UI governance and canonical commands rather than implementing provider-specific business semantics.

High-risk approval SHOULD move to a secure authenticated SmartAIHub surface unless the canonical approval authority explicitly certifies an embedded surface.

---

# R2-28. Growth analytics

Required funnel metrics:

```text
impression (when provider data available)
→ click
→ conversation_started
→ first_response
→ first_useful_result
→ registration_started
→ registration_completed
→ channel_linked
→ project_connected
→ first_durable_job
→ first_payment
→ retained_7d / 30d / configured intervals
```

Key dimensions:

- provider/channel;
- market/region;
- campaign/ad/creative;
- tenant/brand;
- initial intent;
- signup provider;
- device class where lawfully available;
- conversion value;
- cost-of-acquisition data where imported.

Analytics MUST be privacy-limited and must not leak cross-tenant data.

---

# R2-29. Provider advertising integration boundary

SPEC-306 owns attribution contracts and conversion event adapters, not advertising campaign management authority.

Future/connected advertising integrations MAY:

- ingest campaign/ad/creative identifiers;
- receive canonical conversion events;
- support privacy-safe matching where provider policy permits;
- report channel-level acquisition performance.

They MUST NOT grant command authorization or expand user data access.

---

# R2-30. China-market routing

The deployment resolver SHALL support a market profile:

```ts
interface MarketChannelProfile {
  market: string;
  defaultLoginProviders: string[];
  allowedMessagingProviders: string[];
  requiredComplianceRefs: string[];
  dataResidencyPolicyRef?: string;
  model/providerPolicyRef?: string;
}
```

Mainland-China profile MUST be able to remove blocked/unavailable external dependencies from the critical authentication path.

SmartAIHub MUST NOT ship a login screen whose only viable button is Google in a market where Google authentication cannot be reliably reached.

---

# R2-31. Registration/security threat model

Threats include:

- account-link phishing;
- malicious deep links;
- OAuth state fixation;
- replayed login tokens;
- provider-token substitution;
- binding attacker channel to victim account;
- phone/SIM reassignment;
- compromised social account;
- cross-channel account takeover;
- duplicate-account farming;
- fraudulent attribution/referral stuffing;
- ad-click spoofing;
- OTP interception;
- channel identifier recycling.

Controls SHALL include:

- PKCE where supported/appropriate;
- CSRF state;
- nonce;
- exact redirect allowlists;
- server-side token validation;
- short-lived single-use linking tokens;
- re-authentication for sensitive linking/merge;
- binding confirmation;
- audit receipts;
- risk scoring;
- rate limiting;
- account recovery independent of a single channel.

---

# R2-32. Account recovery

No user SHALL be permanently locked to one messaging provider.

Recovery SHOULD support multiple verified factors where available:

- Google/other OIDC identity;
- LINE/Telegram/Facebook/WeChat identity;
- verified email;
- phone OTP;
- recovery codes or platform recovery mechanisms;
- organization admin recovery subject to policy.

A lost WhatsApp/LINE/Telegram/Facebook account MUST be revocable without deleting the SmartAIHub principal.

---

# R2-33. Provider secret boundaries

Messaging app secrets, login client secrets, OAuth credentials, WABA tokens, LINE channel secrets, Telegram bot tokens, Meta Page tokens and WeChat secrets SHALL use SPEC-272 references.

Login-provider credentials and messaging-provider credentials MUST be separately rotatable.

No adapter may expose provider tokens to the Assistant/LLM.

---

# R2-34. Data model additions

R2.0 adds logical entities:

- `human_principals` / canonical existing user equivalent;
- `login_identities`;
- `messaging_identities`;
- `registration_transactions`;
- `acquisition_sessions`;
- `attribution_touches`;
- `growth_conversion_events`;
- `channel_notification_preferences`;
- `channel_capability_profiles`;
- `market_channel_profiles`;
- `provider_policy_snapshots`;
- `provider_conversion_delivery_attempts`.

These are logical contracts. Implementers MUST map them onto existing canonical user/auth/analytics schemas rather than create duplicate owners where equivalent tables already exist.

---

# R2-35. API contracts

Minimum service boundaries:

```text
ChannelIngressService
ChannelIdentityService
RegistrationBroker
LoginProviderAdapter
AcquisitionAttributionService
ChannelCapabilityRegistry
ProviderPolicyService
NotificationBroker
ProviderOutboundAdapter
ConversionSinkAdapter
MarketProfileResolver
```

`RegistrationBroker` MUST NOT own authentication cryptography already provided by the canonical auth service; it orchestrates channel-aware registration and linking.

---

# R2-36. Release sequencing

## Phase O0 — ownership/registry/policy

- reconcile SPEC-306 number;
- inventory existing auth/user/analytics schemas;
- map canonical owners;
- snapshot provider policies;
- define market profiles.

## Phase O1 — common fabric

- provider-neutral channel contracts;
- messaging identity;
- login identity abstraction;
- acquisition session;
- registration transaction;
- notification preference;
- capability/policy registries.

## Phase O2 — Telegram reference adapter

- bot ingress/outbound;
- Telegram login/OIDC;
- Mini App identity validation;
- deep-link attribution;
- registration and linking;
- durable job notifications.

## Phase O3 — LINE Thailand adapter

- OA Messaging API;
- LINE Login;
- account linking;
- LIFF/MINI App;
- ad/referral attribution;
- push quota/cost guard.

## Phase O4 — Meta acquisition adapters

- Messenger Page messaging;
- Instagram Direct messaging for eligible Professional accounts;
- Facebook Login/linking where enabled;
- secure SmartAIHub linking from Instagram DM;
- click-to-message/referral attribution where provider supplies it;
- provider-surface-specific window/send-eligibility policy;
- conversion sink where approved.

## Phase O5 — WhatsApp adapter hardening

- retain R1.0 controls;
- account-link flow;
- OTP authentication templates where useful;
- Meta AI-provider/use-case gate;
- 24h/template/cost enforcement;
- click-to-message acquisition.

## Phase O6 — China profile

- WeChat login adapter;
- WeChat/WeCom channel feasibility/adapter;
- China-specific market and compliance gates;
- no Google-only critical dependency.

## Phase O7 — cross-channel intelligence

- notification channel selection;
- cross-channel failover;
- attribution analytics;
- tenant branded channel onboarding;
- multi-provider conversion reporting.

---

# R2-37. Mandatory acceptance criteria extension

The following criteria are additive to all R1.0 acceptance criteria.
`AC-306-R2-001` Telegram, LINE, Messenger, Instagram Direct and WhatsApp adapters use the same canonical channel interfaces.

`AC-306-R2-002` WeChat/WeCom can be added without forking canonical command or identity logic.

`AC-306-R2-003` A messaging identity never becomes the canonical SmartAIHub user identifier.

`AC-306-R2-004` One principal can link multiple login providers.

`AC-306-R2-005` One principal can link multiple messaging channels.

`AC-306-R2-006` A channel user can start an anonymous trial without private-project access.

`AC-306-R2-007` Anonymous trial is admission/cost limited before expensive work.

`AC-306-R2-008` An acquisition session survives the transition from guest to registered principal.

`AC-306-R2-009` Campaign/ad/creative attribution is preserved through OAuth redirect using trusted state.

`AC-306-R2-010` Attribution metadata cannot grant tenant or project authorization.

`AC-306-R2-011` Google login remains available globally where configured but is not mandatory for every market.

`AC-306-R2-012` LINE Login can create a new SmartAIHub account.

`AC-306-R2-013` LINE Messaging account linking can bind an existing SmartAIHub account.

`AC-306-R2-014` LINE provider/channel design does not assume IDs are portable across unrelated LINE providers.

`AC-306-R2-015` LINE unlink is supported.

`AC-306-R2-016` Telegram Login/OIDC can create or sign into SmartAIHub.

`AC-306-R2-017` Telegram Mini App initData is validated server-side.

`AC-306-R2-018` Telegram initDataUnsafe is never accepted as authentication proof.

`AC-306-R2-019` Telegram username is never used as canonical identity.

`AC-306-R2-020` Messenger registration can use Facebook Login or another supported SmartAIHub login.

`AC-306-R2-021` Messenger transport ID is not silently equated to Facebook Login subject.

`AC-306-R2-022` WhatsApp OTP Authentication Template is modeled as OTP delivery, not generic WhatsApp OAuth.

`AC-306-R2-023` WhatsApp Embedded Signup is modeled as business/WABA onboarding, not end-user SmartAIHub registration.

`AC-306-R2-024` WhatsApp sender identity can be securely bound to a SmartAIHub principal.

`AC-306-R2-025` Mainland-China profile does not require Google authentication.

`AC-306-R2-026` Mainland-China profile can use WeChat Login.

`AC-306-R2-027` China profile can disable globally configured channels that are unavailable or noncompliant locally.

`AC-306-R2-028` Market profile selection does not itself grant authorization.

`AC-306-R2-029` Login provider and messaging provider can differ for the same registration.

`AC-306-R2-030` Registration return route returns the user to the initiating channel when safe.

`AC-306-R2-031` Registration transactions are idempotent.

`AC-306-R2-032` OAuth/link nonces are short-lived and single-purpose.

`AC-306-R2-033` OAuth redirect origins are allowlisted.

`AC-306-R2-034` CSRF state is verified.

`AC-306-R2-035` Provider tokens are validated server-side.

`AC-306-R2-036` Existing-account discovery never silently merges by email similarity.

`AC-306-R2-037` Account merge requires proof of both account sides or equivalent policy-approved recovery proof.

`AC-306-R2-038` Account merge produces an audit receipt.

`AC-306-R2-039` Cross-channel continuity uses canonical project/task/memory state rather than copying raw transcripts by default.

`AC-306-R2-040` A user can independently disable notifications on one channel without unlinking all channels.

`AC-306-R2-041` Marketing consent and operational notification consent are separable.

`AC-306-R2-042` Ad click does not constitute blanket messaging consent.

`AC-306-R2-043` Channel failover only uses another verified, user-approved channel.

`AC-306-R2-044` Channel failover cannot bypass provider policy denial.

`AC-306-R2-045` Channel failover cannot bypass authorization denial.

`AC-306-R2-046` Telegram provider policy/rate limits are data-driven.

`AC-306-R2-047` LINE reply/push quota/cost behavior is data-driven.

`AC-306-R2-048` Messenger window/out-of-window behavior is data-driven.

`AC-306-R2-049` WhatsApp 24-hour/template behavior from R1.0 remains enforced.

`AC-306-R2-050` WhatsApp outbound messages do not reset the 24-hour user window.

`AC-306-R2-051` WeChat/WeCom provider policies are data-driven rather than copied from LINE/Meta assumptions.

`AC-306-R2-052` Channel capability detection is registry-based rather than provider-name branching in business logic.

`AC-306-R2-053` Embedded/Mini App actions route through canonical commands.

`AC-306-R2-054` Embedded/Mini App surfaces do not become a second approval authority.

`AC-306-R2-055` High-risk approvals can be moved to a secure SmartAIHub web surface.

`AC-306-R2-056` First-touch attribution is recorded when available.

`AC-306-R2-057` Last-touch attribution is recorded when configured.

`AC-306-R2-058` Multi-touch attribution remains evidence and does not rewrite canonical billing history.

`AC-306-R2-059` First useful result is measurable independently from registration completion.

`AC-306-R2-060` First durable job is measurable as an activation event.

`AC-306-R2-061` First payment can be attributed without giving ad systems access to private project data.

`AC-306-R2-062` Provider conversion sinks consume canonical conversion events rather than own them.

`AC-306-R2-063` Conversion delivery retries are idempotent.

`AC-306-R2-064` Tenant-branded channels remain tenant-isolated.

`AC-306-R2-065` Tenant branding does not weaken SmartAIHub platform permission gates.

`AC-306-R2-066` A tenant can bring a supported channel account without creating a separate bot runtime.

`AC-306-R2-067` Provider messaging credentials are stored by SPEC-272 references.

`AC-306-R2-068` Login client secrets are stored by SPEC-272 references.

`AC-306-R2-069` Messaging and login credentials can rotate independently.

`AC-306-R2-070` Provider credentials are never exposed to the LLM.

`AC-306-R2-071` Lost social/messaging account can be revoked without deleting SmartAIHub principal.

`AC-306-R2-072` Account recovery is not dependent on one messaging channel.

`AC-306-R2-073` Phone/SIM reassignment can trigger re-verification of WhatsApp/phone identity.

`AC-306-R2-074` Compromised social login can be revoked while other verified login identities remain usable.

`AC-306-R2-075` Registration consent records terms/privacy separately from marketing consent.

`AC-306-R2-076` Refusing optional marketing consent does not block core registration.

`AC-306-R2-077` Acquisition analytics do not leak cross-tenant data.

`AC-306-R2-078` Guest analytics identifiers are privacy-minimized.

`AC-306-R2-079` Referral stuffing and click spoofing have abuse controls.

`AC-306-R2-080` Anonymous session cannot hydrate known-user memory before verified linking.

`AC-306-R2-081` Anonymous session cannot inspect tenant membership candidates.

`AC-306-R2-082` After verified linking, current authorization is still evaluated before private data access.

`AC-306-R2-083` Channel registration flows support Thai localization.

`AC-306-R2-084` Channel registration flows can support additional locales without schema forks.

`AC-306-R2-085` LINE account linking tokens follow provider expiry/single-use semantics.

`AC-306-R2-086` Telegram login freshness/nonce validation is enforced according to the chosen login mechanism.

`AC-306-R2-087` Facebook Login state/redirect validation is enforced.

`AC-306-R2-088` WhatsApp OTP has expiry, attempt limit and replay protection.

`AC-306-R2-089` WeChat login state/code exchange is server-side and provider credentials stay secret.

`AC-306-R2-090` Mainland-China release has independent compliance/deployment gates outside this SPEC.

`AC-306-R2-091` A registration started from an ad can complete on web and return to the original channel.

`AC-306-R2-092` A registration started in an embedded Mini App can safely return to chat context.

`AC-306-R2-093` Project connection after signup is a separate explicit authorization step.

`AC-306-R2-094` Channel account linking never auto-connects GitHub/Drive/other private providers.

`AC-306-R2-095` Notification Broker can rank channel routes by policy, preference, cost and delivery health.

`AC-306-R2-096` Sensitive notifications can prohibit specific channels by data-class policy.

`AC-306-R2-097` Quiet hours apply across channels according to user/tenant policy.

`AC-306-R2-098` Critical escalation remains policy-limited and cannot override legal/provider prohibitions.

`AC-306-R2-099` Provider policy generation changes trigger outbound re-evaluation before send.

`AC-306-R2-100` A new adapter can pass the conformance suite without modifying canonical Assistant or job state machines.

`AC-306-R2-101` Final verification proves acquisition→registration→binding→command→job→notification→conversion end-to-end for each enabled market profile.


---

# R2-38. Original R2.0 30-pass cross-spec / product / growth audit

| Pass | Audit lens | R2.0 closure |
|---:|---|---|
| 1 | Canonical ownership | Channel fabric remains adapter/growth boundary; no duplicate assistant/job/memory authority |
| 2 | Numbering | 306 remains provisional pending canonical repo check |
| 3 | Provider neutrality | Four first-class adapters plus China extension use shared contracts |
| 4 | Acquisition | Ad/referral/QR/deep-link entry modeled explicitly |
| 5 | Anonymous trial | Useful guest path without private access |
| 6 | Registration | Every first-class channel has registration entry capability |
| 7 | Canonical principal | Principal separated from login and messaging identities |
| 8 | Google auth | Retained globally without becoming universal dependency |
| 9 | LINE auth | LINE Login + account linking + LIFF/MINI App covered |
| 10 | Telegram auth | Login/OIDC + validated Mini App identity covered |
| 11 | Messenger auth | Secure link + Facebook/other login; no ID-equivalence assumption |
| 12 | WhatsApp auth | OTP factor separated from Embedded Signup/business onboarding |
| 13 | China | WeChat/WeCom profile and no Google-only critical path |
| 14 | Account merge | No fuzzy/silent merge; re-auth required |
| 15 | Cross-channel continuity | Same principal, independent consent/provider state |
| 16 | Attribution | Anonymous→registered attribution preserved |
| 17 | Conversion | Canonical conversion event stream defined |
| 18 | Ads integration | Conversion sink boundary separated from auth/command authority |
| 19 | Multi-tenant | Tenant branded channels use same fabric |
| 20 | Capability registry | Provider behavior is data-driven |
| 21 | Provider policy | Telegram/LINE/Meta/WeChat differences stay adapter policy |
| 22 | Notification | Multi-channel preferences and compliant failover |
| 23 | Rich UI | Mini App/LIFF/deep-link surfaces use canonical commands |
| 24 | Security | OAuth/link/OTP/account-takeover threats covered |
| 25 | Recovery | User not locked to one channel/provider |
| 26 | Privacy/consent | Marketing/operational consent separated; attribution minimized |
| 27 | Secrets | Login and messaging credentials independently managed via SPEC-272 |
| 28 | Regional deployment | Market profiles can remove unavailable critical dependencies |
| 29 | Testing | Adapter conformance + funnel + auth + cross-channel tests specified |
| 30 | End-to-end DoD | Acquisition→registration→command→durable work→retention/conversion required |

All original 30 R2.0 audit lenses were CLOSED at specification level; R2.1 adds 20 further passes below. Release still requires implementation evidence and current provider-policy verification.

---

# R2-39. R2.0 Definition of Done extension

R2.0 is not complete until all enabled market profiles prove:

```text
ad/referral/QR/deep link
→ channel entry
→ acquisition session
→ anonymous/guest safe interaction
→ registration entry
→ chosen provider authentication
→ canonical principal creation/reuse
→ verified messaging identity binding
→ attribution preservation
→ project/account connector authorization where requested
→ SPEC-279 command ingress
→ durable work/job
→ channel progress/result
→ notification policy/cost decision
→ cross-channel preference/failover
→ conversion event
→ audit/provenance
→ unlink/recovery/rollback
```

For Thailand, acceptance SHALL include LINE and Telegram.

For Meta acquisition, acceptance SHALL include Messenger, Instagram Direct, and policy-approved WhatsApp paths.

For Mainland-China release, acceptance SHALL include a non-Google critical signup path and current local/provider compliance review.

---

# R2-40. Implementation instruction

Codex/Work implementing this SPEC SHALL:

1. inventory existing user/auth tables before creating new identity tables;
2. reuse canonical user/principal authority;
3. reuse SPEC-279 rather than writing channel-specific command handlers;
4. reuse SPEC-298 admission;
5. reuse current memory/project/job/approval owners;
6. create provider adapters behind common interfaces;
7. implement auth/linking as independently testable adapters;
8. keep acquisition attribution independent from authorization;
9. preserve R1.0 WhatsApp safety rules;
10. block provider capabilities whose current policy is unresolved;
11. implement adapter conformance tests before production onboarding;
12. prefer small test accounts/test numbers/sandboxes before production credentials;
13. produce a migration/rollback manifest;
14. run final end-to-end evidence against actual provider test environments where available.

---

# R2-41. Current external reference anchors

Provider documentation MUST be re-checked at implementation/release time.

- LINE Login overview: https://developers.line.biz/en/docs/line-login/overview/
- LINE account linking: https://developers.line.biz/en/docs/messaging-api/linking-accounts/
- LINE Login + Official Account add-friend: https://developers.line.biz/en/docs/line-login/link-a-bot/
- Telegram Login: https://core.telegram.org/bots/telegram-login
- Telegram Mini Apps: https://core.telegram.org/bots/webapps
- Meta WhatsApp official Postman workspace: https://www.postman.com/meta/whatsapp-business-platform/
- WhatsApp Business Solution Terms: https://www.whatsapp.com/legal/business-solution-terms
- WhatsApp Business policy: https://business.whatsapp.com/policy/
- Meta Messenger official Postman workspace: https://www.postman.com/meta/messenger-platform-api/
- Meta Instagram official Postman workspace: https://www.postman.com/meta/instagram/
- WhatsApp Third-Party Agent Terms: https://www.whatsapp.com/legal/third-party-agents-terms
- Google OAuth 2.0 web-server guidance (embedded user-agent restrictions): https://developers.google.com/identity/protocols/oauth2/web-server
- Telegram Login / OIDC: https://core.telegram.org/bots/telegram-login
- Telegram Bot limits: https://core.telegram.org/bots/faq
- LINE Messaging API push eligibility: https://developers.line.biz/en/reference/messaging-api/nojs/
- LINE account linking: https://developers.line.biz/en/docs/messaging-api/linking-accounts/
- Meta Messenger official API workspace: https://www.postman.com/meta/messenger-platform-api/
- Meta Instagram official API workspace: https://www.postman.com/meta/instagram/

- WhatsApp Business Platform pricing: https://business.whatsapp.com/products/platform-pricing
- Meta/Facebook developer platform: https://developers.facebook.com/
- WeChat Open Platform (implementation team must use current official documentation): https://open.weixin.qq.com/

---

# R2-42. Final invariants

```text
DISCOVERY MAY START ANONYMOUSLY.
PRIVATE WORK MAY NOT.

ANY CHANNEL MAY START REGISTRATION.
NO CHANNEL OWNS THE USER.

GOOGLE MAY BE THE DEFAULT LOGIN.
GOOGLE MUST NOT BE THE ONLY LOGIN WHERE THE MARKET CANNOT RELIABLY USE IT.

LINE LOGIN IS A LOGIN PROVIDER.
TELEGRAM LOGIN IS A LOGIN PROVIDER.
FACEBOOK LOGIN IS A LOGIN PROVIDER.
WHATSAPP AUTHENTICATION TEMPLATE IS OTP DELIVERY,
NOT GENERIC CONSUMER OAUTH.
WECHAT LOGIN IS THE PREFERRED CHINA-NATIVE IDENTITY PATH WHEN DEPLOYED.

ONE HUMAN MAY LINK MANY IDENTITIES.
SMARTAIHUB MUST NEVER SILENTLY GUESS THAT TWO IDENTITIES ARE THE SAME HUMAN.

ACQUISITION ATTRIBUTION SURVIVES REGISTRATION.
ATTRIBUTION NEVER GRANTS AUTHORITY.

ADS MAY BRING THE USER IN.
THE CHANNEL MAY KEEP THE USER ENGAGED.
SMARTAIHUB CANONICAL RUNTIME DOES THE WORK.
```

---

# R2.1 CORRECTIVE & HARDENING AMENDMENT — 20 additional audit passes

R2.1 was produced after an additional provider-policy and cross-spec audit. The sections below are normative and supersede any conflicting R2.0/R1.0 language.

## R2.1-1. Provider-surface taxonomy

SmartAIHub SHALL distinguish **provider family** from **provider surface**.

Example:

```text
Meta
├─ Facebook Messenger
├─ Instagram Direct
├─ WhatsApp Business Platform
└─ WhatsApp Third-Party Agent Platform (when available/approved)

LINE
├─ LINE Messaging API
├─ LINE Login
└─ LIFF / LINE MINI App

Telegram
├─ Bot API
├─ Telegram Login / OIDC
└─ Telegram Mini Apps
```

A capability available on one surface MUST NOT be assumed available on another surface from the same company.

`provider = meta` is insufficient routing information.

Every runtime decision MUST include a concrete `provider_surface_ref`.

---

## R2.1-2. WhatsApp Business Platform vs Third-Party Agent Platform

WhatsApp now exposes a separate consumer-facing **Third-Party Agent (3P Agent) platform** in limited availability.

SmartAIHub SHALL model:

```text
WHATSAPP_BUSINESS_PLATFORM
    business-to-consumer messaging
    WABA / phone number / business terms
    AI-provider restrictions applicable to that surface

WHATSAPP_3P_AGENT_PLATFORM
    user-connected third-party agent experience
    separate Agent Terms / availability / capability contract
```

These MUST be independent adapters even if they ultimately converge on the same canonical SmartAIHub Assistant.

Rules:

- Business Platform AI-provider restrictions MUST NOT be silently copied to the 3P Agent surface.
- 3P Agent availability MUST NOT be assumed from Business Platform availability.
- The system MUST NOT automatically fall back between the two surfaces merely to bypass a provider restriction.
- 3P Agent onboarding, consent, encryption expectations, data handling and region availability require their own policy snapshot.
- General-purpose SmartAIHub assistant access on WhatsApp MAY use the 3P Agent path only when SmartAIHub is actually eligible/onboarded and current WhatsApp terms permit it.
- Business-platform CONTROL_SURFACE behavior remains independently policy-gated.

---

## R2.1-3. Instagram Direct as a first-class acquisition/messaging adapter

Instagram Direct SHALL be first-class for acquisition and messaging because Meta’s current Instagram API supports messaging for eligible Professional accounts.

The adapter SHALL support:

- inbound DM webhook events;
- outbound responses where current policy permits;
- ad/referral/deep-link acquisition metadata when actually provided;
- secure registration/account-link deep links;
- conversion events;
- handoff to SmartAIHub web/Mini App surfaces.

It SHALL NOT assume:

- consumer Instagram Login is an end-user SmartAIHub authentication provider;
- group messaging;
- proactive messaging without an eligible user-initiated conversation;
- equivalence between Instagram messaging identity and Facebook Login identity.

Thailand/international Meta acquisition profiles SHOULD treat:

```text
Facebook / Instagram Ad
        ↓
Messenger / Instagram Direct / policy-approved WhatsApp
        ↓
anonymous trial
        ↓
registration
        ↓
canonical principal
```

as one common acquisition family with distinct adapters.

---

## R2.1-4. Anonymous actor is not a canonical human principal

R2.0’s logical `HumanPrincipal.status = GUEST` pattern is superseded.

Anonymous trial SHALL use an ephemeral/pseudonymous `AnonymousActor` plus `AcquisitionSession`.

Only successful authentication/registration MAY create or bind a canonical `HumanPrincipal`.

Anonymous actors MUST have:

- purpose limitation;
- TTL/expiry;
- admission quota;
- no private project membership enumeration;
- no canonical user memory hydration;
- no cross-device/profile stitching without an authorized mechanism.

Promotion flow:

```text
AnonymousActor
    ↓ verified registration
HumanPrincipal
    ↓
explicit attribution transfer
    ↓
anonymous actor expires/promoted
```

---

## R2.1-5. Login identity and authentication factor are separate

Federated identities and verification factors SHALL be separate abstractions.

Federated identity examples:

- Google OIDC;
- LINE Login;
- Telegram OIDC;
- Facebook Login;
- WeChat Open Platform identity;
- Sign in with Apple.

Authentication factor examples:

- passkey/WebAuthn;
- verified email;
- email magic link;
- verified phone;
- SMS OTP;
- WhatsApp OTP Authentication Template;
- TOTP;
- recovery code.

A phone/WhatsApp OTP MUST NOT be stored as if Meta/WhatsApp were an OIDC identity issuer.

---

## R2.1-6. Identity namespace and merge invariants

Provider subject uniqueness SHALL be namespace-safe:

```text
FederatedLoginIdentity:
  UNIQUE(provider, issuer, client_scope_ref, provider_subject)

MessagingIdentity:
  UNIQUE(provider, provider_surface_ref, channel_account_ref, external_sender_ref)
```

The following are never sufficient merge proofs:

- same email text;
- same phone text without a current proof ceremony;
- same display name;
- same avatar;
- same social username;
- same ad attribution;
- same device;
- LLM/entity-resolution similarity.

Provider identifiers that are app-, Page-, Provider-, bot- or channel-scoped MUST retain that scope in storage.

---

## R2.1-7. Cross-channel Notification Episode

Sending one job event to every linked channel is prohibited by default.

A canonical `NotificationEpisode` SHALL group equivalent delivery attempts:

```ts
interface NotificationEpisode {
  id: string;
  principalRef: string;
  semanticEventRef: string;
  collapseKey: string;
  severity: string;
  createdAt: string;
  expiresAt?: string;
  state:
    | 'PENDING'
    | 'DELIVERING'
    | 'DELIVERED'
    | 'ACKNOWLEDGED'
    | 'EXPIRED'
    | 'SUPPRESSED';
}
```

The Notification Broker SHALL support:

- semantic dedupe;
- cross-channel collapse;
- frequency caps;
- quiet hours;
- preferred-channel ordering;
- escalation delay;
- delivery-health routing;
- acknowledgement suppression;
- “do not send on channel X” data-class policy;
- no duplicate push merely because multiple identities are linked.

Example:

```text
Build failed
→ try LINE
→ delivered
→ do NOT also send Telegram + Messenger + WhatsApp
unless escalation policy explicitly says so.
```

---

## R2.1-8. Notification fatigue and channel reputation

Provider compliance and user trust require a global fatigue budget.

The platform SHALL maintain per-principal and per-tenant policies for:

- max informational notifications/hour/day;
- heartbeat aggregation;
- unchanged-status suppression;
- duplicate event suppression;
- marketing frequency;
- critical override limits;
- cooldown after user block/report/opt-out.

Provider block/report/quality signals, where available, SHALL feed `ChannelHealth` and may automatically reduce/suspend outbound messaging.

Growth optimization MUST NOT sacrifice channel reputation.

---

## R2.1-9. LINE send eligibility is not “unlimited push”

LINE does not use WhatsApp’s 24-hour customer-service-window model, but SmartAIHub MUST NOT interpret that as unlimited eligibility.

Current LINE documentation describes push eligibility including friends and defined recent-inbound cases.

Therefore the adapter SHALL expose:

```text
sendEligibility:
  FRIEND
  RECENT_INBOUND
  GROUP_ELIGIBLE
  BLOCKED
  UNKNOWN
```

with provider-defined expiry/conditions.

Exact time periods, quotas and pricing MUST remain dynamic `ProviderPolicySnapshot` values.

---

## R2.1-10. Telegram initiation and broadcast policy

Telegram bots cannot assume permission to start private chats with arbitrary users.

The Telegram adapter SHALL require an established eligible chat initiated by the user or other provider-supported entry.

Broadcast throughput/cost SHALL be data-driven.

Current official Bot API documentation describes:

- a normal bulk-notification ceiling around 30 messages/second;
- optional Paid Broadcasts for higher throughput, currently up to 1,000 messages/second;
- provider-defined Telegram Stars pricing/eligibility.

These values are policy snapshot inputs, not constants.

---

## R2.1-11. Messenger and Instagram window semantics

Current Messenger Platform documentation requires that a normal recipient has messaged the Page within the standard 24-hour window or has an applicable agreement/opt-in for outside-window messaging.

Instagram messaging currently requires an eligible Professional account and a user-initiated messaging relationship.

SmartAIHub SHALL model both as provider-defined send eligibility.

It MUST NOT emulate WhatsApp template logic unless the exact Meta surface requires it.

---

## R2.1-12. Attribution evidence is immutable; attribution models are derived

Raw acquisition touches SHALL be append-only evidence.

```text
provider referral/ad metadata
signed first-party campaign state
QR/referral token
web landing state
```

shall be preserved separately from:

```text
first-touch attribution
last-touch attribution
multi-touch attribution
incrementality model
```

Attribution models MAY be recalculated.

Raw evidence MUST NOT be rewritten merely because a marketing model changes.

---

## R2.1-13. Anonymous attribution TTL and privacy

Anonymous acquisition identifiers SHALL have:

- explicit purpose;
- TTL;
- market-specific consent/legal-basis policy;
- no automatic cross-channel/cross-device stitching;
- no private-resource enrichment.

If registration never occurs, acquisition data SHALL expire or aggregate according to policy.

“Reach more users” MUST NOT become an excuse to create durable shadow profiles.

---

## R2.1-14. Conversion API / ad-platform egress guard

Sending conversions back to Meta/LINE/other ad systems SHALL pass a dedicated `MarketingDataEgressPolicy`.

By default, outbound conversion events MUST NOT include:

- chat transcript;
- prompt text;
- project name;
- repository name;
- filenames;
- private task/job title;
- user memory;
- document contents;
- secrets.

Permitted identifiers MUST be:

- purpose-authorized;
- normalized/hashed where provider contract calls for it;
- minimised;
- tenant-scoped;
- backed by current consent/legal basis.

Provider ad systems receive conversion evidence, not SmartAIHub private work context.

---

## R2.1-15. Provider policy freshness SLO and kill switch

Every `ProviderPolicySnapshot` SHALL record:

```text
source_refs[]
retrieved_at
effective_at
expires_or_recheck_at
policy_generation
verified_by
```

Each provider surface SHALL define a maximum policy age.

If policy becomes stale beyond the allowed age:

- new high-risk outbound/marketing/AI capabilities MUST fail closed;
- safe inbound capture MAY continue if current rules allow;
- administrators MUST receive a degradation alert;
- a platform-wide/provider-surface kill switch MUST exist.

A stale policy cache must never become permanent authorization.

---

## R2.1-16. Provider capability freshness

Capability discovery MUST distinguish:

```text
SUPPORTED
SUPPORTED_WITH_RESTRICTIONS
UNAVAILABLE
DEPRECATED
UNKNOWN
```

`UNKNOWN` SHALL NOT be treated as `SUPPORTED`.

Examples include:

- Instagram group messaging;
- WhatsApp 3P Agent availability;
- WeChat/WeCom availability for a given market/account;
- Messenger out-of-window send path;
- LINE Mini App availability/configuration.

---

## R2.1-17. Provider-webhook verification is surface-specific

The common ingress framework SHALL define an authenticity result, but each adapter owns its exact verification method.

Business logic MUST NOT assume every provider uses Meta-style HMAC headers.

```ts
interface ProviderWebhookVerification {
  verified: boolean;
  providerSurfaceRef: string;
  verificationMethod: string;
  keyGenerationRef?: string;
  replayEvidenceRef?: string;
}
```

Verification MUST occur before expensive work.

---

## R2.1-18. Consent provenance and provider-state synchronization

Channel consent SHALL distinguish:

- SmartAIHub operational notification consent;
- marketing consent;
- provider friendship/follow state;
- bot-start/eligible-chat state;
- provider block state;
- provider authorization grant;
- tenant-specific consent.

Provider events such as block/unfriend/deauthorization, where exposed, SHALL update channel eligibility without deleting the canonical SmartAIHub principal.

---

## R2.1-19. Authentication assurance and step-up

A successful social login is not sufficient assurance for every operation.

Canonical authorization SHALL consume an `AuthnAssuranceContext` containing:

- login method;
- token freshness;
- recent re-auth;
- MFA/passkey state;
- channel binding age;
- device/risk signals where permitted;
- recovery state.

R3/R4 operations SHOULD require stronger step-up such as passkey/WebAuthn or another canonical high-assurance method.

A messaging-channel button remains insufficient by itself.

---

## R2.1-20. Cross-region/provider data-egress profile

Each provider surface SHALL declare a `ChannelDataEgressProfile`:

```text
provider terms/data restrictions
business-solution-data restrictions
allowed processors
region/data-residency constraints
model-training restrictions
logging restrictions
retention constraints
```

This profile SHALL be passed into:

- LLM routing;
- STT/TTS routing;
- memory candidate ingestion;
- analytics;
- observability;
- artifact storage;
- conversion sinks.

If an LLM/STT/TTS provider cannot satisfy the required egress profile, SmartAIHub MUST choose another eligible route or fail closed.

---

# R2.1 acceptance criteria extension

`AC-306-R21-001` Instagram Direct is represented as a first-class provider surface.

`AC-306-R21-002` Instagram Direct messaging identity is not treated as consumer login identity.

`AC-306-R21-003` Instagram conversations obey current user-initiation/provider eligibility rules.

`AC-306-R21-004` WhatsApp Business Platform and WhatsApp 3P Agent Platform are distinct adapters.

`AC-306-R21-005` No automatic fallback between WhatsApp surfaces may bypass provider policy.

`AC-306-R21-006` General-purpose WhatsApp AI may use a 3P Agent path only after actual eligibility/onboarding and current policy verification.

`AC-306-R21-007` Service-message pricing no longer assumes a 1,000-message free allowance.

`AC-306-R21-008` Current WhatsApp service messages are represented as non-chargeable according to the current official pricing snapshot.

`AC-306-R21-009` Current response-to-user utility free treatment is policy data.

`AC-306-R21-010` Current 72-hour eligible free-entry-point treatment is policy data.

`AC-306-R21-011` Anonymous trial uses AnonymousActor rather than canonical HumanPrincipal.

`AC-306-R21-012` AnonymousActor expires or is promoted after verified registration.

`AC-306-R21-013` WhatsApp/SMS OTP is stored as an AuthenticationFactor, not a federated login issuer.

`AC-306-R21-014` Federated identity uniqueness includes issuer and client/application scope.

`AC-306-R21-015` Messaging identity uniqueness includes provider surface and channel account scope.

`AC-306-R21-016` Apple/private-relay or masked email never silently merges users.

`AC-306-R21-017` One semantic notification event is deduplicated across linked channels by default.

`AC-306-R21-018` Delivery on the preferred channel suppresses equivalent fallback pushes unless escalation policy requires them.

`AC-306-R21-019` Acknowledgement can suppress pending equivalent notifications on other channels.

`AC-306-R21-020` Frequency caps and fatigue budgets apply across channels.

`AC-306-R21-021` Provider block/report/quality signals can suspend or reduce outbound messaging.

`AC-306-R21-022` LINE push eligibility is policy-derived rather than treated as unlimited.

`AC-306-R21-023` Telegram bots cannot initiate arbitrary private conversations.

`AC-306-R21-024` Telegram broadcast limits/cost are provider policy data.

`AC-306-R21-025` Messenger send eligibility models standard window plus current approved outside-window mechanisms.

`AC-306-R21-026` Instagram send eligibility is distinct from Messenger and WhatsApp.

`AC-306-R21-027` Raw attribution touches are append-only evidence.

`AC-306-R21-028` Derived attribution models can be recalculated without rewriting raw touches.

`AC-306-R21-029` Anonymous attribution has TTL and purpose limitation.

`AC-306-R21-030` Conversion sinks cannot receive prompt/project/document content by default.

`AC-306-R21-031` Conversion identifiers are purpose-authorized and minimized.

`AC-306-R21-032` Provider policy snapshots have freshness metadata and max-age enforcement.

`AC-306-R21-033` Stale policy fails closed for new high-risk/marketing/AI outbound use.

`AC-306-R21-034` Provider-surface kill switch exists.

`AC-306-R21-035` UNKNOWN capability is never treated as SUPPORTED.

`AC-306-R21-036` Webhook authenticity verification is adapter-specific.

`AC-306-R21-037` Provider block/unfriend/deauthorization changes channel eligibility without deleting the SmartAIHub principal.

`AC-306-R21-038` Marketing consent, operational consent and provider chat eligibility remain separate.

`AC-306-R21-039` R3/R4 operations consume a current AuthnAssuranceContext.

`AC-306-R21-040` High-risk external-channel action can require passkey/WebAuthn or equivalent step-up.

`AC-306-R21-041` ChannelDataEgressProfile propagates to LLM/STT/TTS/memory/analytics routing.

`AC-306-R21-042` An ineligible data processor cannot receive channel data merely because it is the cheapest route.

`AC-306-R21-043` Ads/referral metadata is accepted only from verified provider payloads or signed first-party state.

`AC-306-R21-044` Acquisition attribution never allows private resource hydration.

`AC-306-R21-045` Multi-tenant conversion reporting remains tenant-isolated.

`AC-306-R21-046` Meta family provider surfaces do not share identifiers or permissions implicitly.

`AC-306-R21-047` Live/sandbox provider contract tests cover negative policy cases, not only happy paths.

`AC-306-R21-048` Policy drift can disable a capability without redeploying canonical Assistant/job services.

`AC-306-R21-049` Channel outage/failover preserves canonical work and avoids duplicate user notifications.

`AC-306-R21-050` Final verification covers Telegram, LINE, Messenger, Instagram Direct and policy-eligible WhatsApp paths for each enabled market profile.

---

# R2.1 20-pass re-audit (cumulative 70-pass)

| Added pass | Audit lens | Gap found in R2.0 | R2.1 closure |
|---:|---|---|---|
| 31 | Current WhatsApp pricing | R1 text carried stale 1,000-free-service-message assumption | Corrected to current official service/utility-response/free-entry-point policy and dynamic rates |
| 32 | WhatsApp AI surface | Business API treated as only WhatsApp path | Added separate 3P Agent surface with independent terms/eligibility |
| 33 | Instagram reach | Instagram Direct missing despite Meta acquisition role | Added first-class Instagram Direct adapter |
| 34 | Guest identity | `HumanPrincipal=GUEST` blurred anonymous/authenticated boundary | Introduced expiring AnonymousActor |
| 35 | Authentication modeling | WhatsApp/phone OTP modeled inside login identity list | Split FederatedLoginIdentity from AuthenticationFactor |
| 36 | Identity namespace | Provider/app-scoped IDs could collide | Added issuer/client/channel-scoped uniqueness |
| 37 | Notification dedupe | Multi-channel user could get same event 4× | Added NotificationEpisode, collapse and acknowledgement suppression |
| 38 | User fatigue | No global frequency/reputation budget | Added cross-channel caps, aggregation and quality feedback |
| 39 | LINE outbound eligibility | “No 24h” could be misread as unlimited push | Added friend/recent-inbound eligibility state |
| 40 | Telegram initiation | Proactive model omitted initial-chat requirement | Added user-initiation requirement and dynamic broadcast limits |
| 41 | Messenger/Instagram windows | Meta surfaces could be incorrectly normalized | Added separate eligibility semantics |
| 42 | Attribution immutability | First/last/multi-touch not separated from evidence | Split raw touch evidence from derived attribution models |
| 43 | Anonymous privacy | Acquisition ID could become durable shadow profile | Added TTL, purpose and no cross-device stitching by default |
| 44 | Ad conversion privacy | Conversion sinks could leak private work metadata | Added MarketingDataEgressPolicy and denylist |
| 45 | Policy freshness | Versioning existed but no max-age/fail-closed SLO | Added freshness metadata, recheck deadline and kill switch |
| 46 | Capability freshness | Unsupported/unknown could be conflated | Added explicit capability states |
| 47 | Webhook security | Common layer risked assuming Meta verification pattern | Made verification surface-specific |
| 48 | Consent synchronization | Provider block/unfriend state under-modeled | Added provider-state synchronization |
| 49 | Step-up assurance | Linked social identity could be over-trusted for R3/R4 | Added AuthnAssuranceContext and passkey-capable step-up |
| 50 | Data egress | Channel-specific provider data restrictions not propagated end-to-end | Added ChannelDataEgressProfile for LLM/STT/TTS/memory/analytics |

All 20 added passes found either a concrete gap or a hardening opportunity and are closed normatively in R2.1.

---

# R2.1 release delta / implementation priority

Implementation SHOULD now proceed in this order:

```text
0. canonical SPEC-number reconciliation
1. identity-model migration design:
      AnonymousActor
      HumanPrincipal
      FederatedLoginIdentity
      AuthenticationFactor
      MessagingIdentity
2. ProviderSurface registry + PolicySnapshot freshness
3. NotificationEpisode dedupe/fatigue layer
4. Telegram reference adapter
5. LINE Thailand adapter
6. Messenger + Instagram Direct Meta acquisition adapters
7. WhatsApp Business adapter under AI/business policy gate
8. WhatsApp 3P Agent feasibility/onboarding adapter when eligible
9. WeChat/WeCom China profile
10. conversion egress + attribution analytics
11. cross-channel failover and live provider conformance
```

No production rollout may use the superseded R1 `1,000 free service messages` assumption.

# PRESERVED PREDECESSOR CONTENT — R1.0

The following R1.0 content is preserved for cumulative history and remains normative only where it does not conflict with R2.1/R2.0. In particular, R2.1 supersedes the stale R1 WhatsApp service-message pricing paragraph and expands the provider model beyond WhatsApp.


---
spec_id: 306
numbering_status: PROVISIONAL_PENDING_CANONICAL_REPOSITORY_REGISTRY_CHECK
title: SmartAIHub External Messaging Channel Fabric & WhatsApp Command Ingress
revision: R1.0-20PASS
status: PROPOSED_IMPLEMENTATION_READY_AUDITED_20_PASS
prepared: 2026-10-07
scope: SmartAIHub shared/core infrastructure
implementation_style: additive-only
target_repository_path: specs/feature/306-external-messaging-channel-fabric-whatsapp-command-ingress/spec.md
primary_owner: SmartAIHub External Messaging Channel Fabric / Command Ingress Adapter
canonical_ingress_authority: SPEC-279 Universal Command Ingress & Agent Delegation Gateway R1.5 CANONICAL
canonical_access_admission_authority: SPEC-298 Universal Access Admission, Public Machine Access & Federated Authorization Gateway R1.3
canonical_assistant_authority: SPEC-269 SmartAIHub Assistant Workforce R3.18
canonical_memory_authority: SPEC-268
canonical_knowledge_evidence_authority: SPEC-266 plus current evidence/retrieval owner
canonical_capability_authority: implemented SPEC-256
canonical_task_control_authority: SPEC-277 Task Control Experience R1.8 CANONICAL
canonical_durable_job_authority: worker_jobs / worker_job_events and existing workflow/control-plane runtime
canonical_secret_authority: SPEC-272 Credential Vault, Root-of-Trust & Secure Provider Broker
risk_class: HIGH
policy_snapshot_date: 2026-10-07
---

# SPEC-306 — SmartAIHub External Messaging Channel Fabric & WhatsApp Command Ingress
## Provider-neutral external messaging ingress, durable command/control, policy-aware outbound notification, and WhatsApp Cloud API adapter

> **Shared/core infrastructure. This is NOT a Mini App.**

> **Numbering safety:** SPEC-306 is provisional until the canonical repository registry is checked at merge time. If 306 is already assigned in the repository, this specification MUST be mechanically renumbered without changing semantic ownership, requirements, acceptance criteria semantics, or implementation boundaries.

---

# 0. Executive decision

SmartAIHub SHALL implement a provider-neutral **External Messaging Channel Fabric** and SHALL use **WhatsApp Cloud API as the first production adapter**.

WhatsApp MUST NOT become a separate chatbot runtime, separate authorization system, separate memory system, separate workflow engine, separate approval engine, or separate job source of truth.

The canonical flow is:

```text
External messaging channel
        ↓
Provider adapter
        ↓
Admission + abuse protection
        ↓
Identity binding / principal resolution
        ↓
Canonical CommandEnvelope
        ↓
SPEC-279 Universal Command Ingress
        ↓
Canonical runtime owner
        ↓
Assistant / capability / workflow / durable job
        ↓
Canonical result / progress / approval requirement
        ↓
Notification Broker
        ↓
Provider policy + cost + consent gate
        ↓
Channel adapter
```

The first adapter SHALL support WhatsApp Cloud API inbound and outbound messaging, but every interface below the provider boundary MUST remain reusable for LINE, Telegram, Slack, Teams, email, SMS, mobile push, future voice/call transports, Gemini/MCP clients, and dedicated SmartAIHub device runtimes.

The system MUST implement these invariants:

```text
CHANNEL ≠ IDENTITY
MESSAGE ≠ AUTHORIZATION
MESSAGE ≠ TASK SOURCE OF TRUTH

WHATSAPP NUMBER ≠ SMARTAIHUB USER
WHATSAPP REPLY BUTTON ≠ HIGH-RISK APPROVAL
WHATSAPP CONVERSATION ≠ PROJECT
WHATSAPP CHAT HISTORY ≠ MEMORY

PROVIDER MESSAGE DELIVERY ≠ EXECUTION COMPLETION
PROVIDER RETRY ≠ RE-EXECUTION
PROVIDER POLICY WINDOW ≠ PERMISSION WINDOW

BUSINESS-ORIGINATED MESSAGE MUST NOT RESET
THE WHATSAPP 24-HOUR CUSTOMER SERVICE WINDOW.

GENERAL-PURPOSE AI ON WHATSAPP MUST FAIL CLOSED
WHEN CURRENT META POLICY DOES NOT PERMIT THE USE CASE.
```

---

# 1. Why this SPEC exists

SmartAIHub already has or is defining canonical infrastructure for assistant identity, delegation, capability discovery, durable jobs, development orchestration, project/work context, memory, evidence/retrieval, approvals, tenant/resource authorization, credential storage, task control, public/machine access, and MCP/A2A/external-agent interoperability.

The missing layer is a reusable **messaging transport boundary** that allows a user to initiate, continue, inspect, control, pause, resume, approve through a permitted secure surface, and receive results from SmartAIHub through external messaging applications without duplicating those authorities.

WhatsApp is a useful first implementation because it provides text, audio/voice notes, image/document transport, reply context, interactive choices, delivery states, business webhooks, and a phone-number-based external identity surface.

However, WhatsApp also imposes provider policy, pricing, consent, AI-provider, template, customer-service-window, data-use, and account-quality constraints. Those constraints MUST be treated as provider policy rather than SmartAIHub business semantics.

---

# 2. Scope

## 2.1 In scope

This SPEC owns:

1. provider-neutral external messaging adapter contracts;
2. WhatsApp Cloud API inbound adapter;
3. WhatsApp Cloud API outbound adapter;
4. WABA / phone-number account registry integration;
5. webhook verification, normalization, deduplication and asynchronous dispatch;
6. external sender identity binding to SmartAIHub principals;
7. reply/thread correlation;
8. media ingestion for text, audio, image and documents;
9. voice-note STT and optional TTS replies;
10. canonical response profiles including concise voice/driving-oriented responses;
11. external messaging notification intents;
12. 24-hour customer-service-window state;
13. template-policy decisions;
14. channel consent/opt-in/opt-out state;
15. provider policy snapshots;
16. provider pricing/cost estimation and budget gates;
17. channel delivery receipts and outbound retry;
18. safe recurring status subscriptions such as “แจ้งทุก 6 ชั่วโมง”;
19. multi-number and future tenant-branded channel accounts;
20. provider-specific compliance gates, including the WhatsApp AI-provider restriction;
21. observability, audit, retention and incident handling specific to external messaging.

## 2.2 Explicitly out of scope

This SPEC MUST NOT redefine:

- SPEC-279 ingress semantics;
- SPEC-298 admission or principal authorization;
- SPEC-269 Assistant identity or workforce semantics;
- SPEC-268 memory ownership;
- SPEC-266 / current retrieval/evidence ownership;
- SPEC-256 capability semantics;
- SPEC-277 task-control authority;
- `worker_jobs` / `worker_job_events`;
- existing workflow state machines;
- SPEC-272 credential storage;
- billing/credits as a new independent ledger;
- project/work-context source of truth;
- approval semantics;
- Mini App architecture;
- Android Auto;
- Custom Android/AOSP;
- ESP32/Raspberry Pi gadget runtime;
- WhatsApp Calling API as an MVP dependency;
- group-chat command execution as an MVP dependency.

Any requirement touching an implemented/canonical owner SHALL be implemented through an additive adapter, projection, consumer-side metadata, or compatibility contract.

---

# 3. Canonical ownership map

| Concern | Canonical owner | SPEC-306 role |
|---|---|---|
| Command normalization / runtime routing | SPEC-279 | Produce canonical envelope and preserve return route |
| Admission / abuse / principal authorization | SPEC-298 | Supply channel evidence and consume decision |
| Assistant identity / behavior / proactive work | SPEC-269 | Invoke; never clone |
| Memory | SPEC-268 | Supply scoped context references only |
| Evidence / retrieval | SPEC-266 + current retrieval owner | Preserve attachments/evidence refs |
| Capability routing | SPEC-256 | Consume |
| Task control / approval UX | SPEC-277 | Surface projections/buttons/links |
| Durable jobs | existing `worker_jobs` / `worker_job_events` | Link messages to jobs |
| Credentials | SPEC-272 | Store Meta tokens/secrets via credential references |
| External messaging transport | **SPEC-306** | Own |
| Provider messaging policy/cost/window | **SPEC-306** | Own adapter-side policy projections for each channel |
| Project/work context | existing project/work-context authority | Resolve reference; never own |

---

# 4. Product modes

The WhatsApp adapter SHALL support provider-policy-controlled modes.

## 4.1 CONTROL_SURFACE

A narrow remote command/status surface:

- project status;
- job status;
- task status;
- stop/pause/resume request;
- create bounded task;
- retrieve approved artifact;
- acknowledge notification;
- choose project;
- request secure approval link.

It MUST NOT automatically become an open-domain “ask anything” AI assistant.

This SHOULD be the default production profile where Meta policy eligibility for a general-purpose AI assistant has not been positively established.

## 4.2 BUSINESS_ANCILLARY_ASSISTANT

AI may support a tenant’s own business processes, such as support, booking, order/status workflows, internal operations or other ancillary functions, subject to current provider terms, tenant policy, user consent, and deployment classification.

## 4.3 GENERAL_PURPOSE_ASSISTANT

This mode exposes open-ended SmartAIHub assistant functionality.

It MUST be `DENY_BY_DEFAULT`.

It MAY be enabled only if a current provider-policy decision confirms that the applicable account, business, recipient market/country, use case and current Meta terms permit the functionality.

No developer flag, tenant admin flag, model choice, prompt text, message type, or alternate internal route may bypass this gate.

## 4.4 INTERNAL_SINGLE_OPERATOR

A business owner using a WhatsApp number to remotely operate their own SmartAIHub workspace is still subject to current Meta terms.

The system MUST NOT assume that “internal use” automatically exempts SmartAIHub from an AI-provider restriction.

Until policy/legal review says otherwise, INTERNAL_SINGLE_OPERATOR SHOULD use CONTROL_SURFACE semantics rather than general-purpose AI chat.

---

# 5. External policy snapshot — mandatory implementation input

This SPEC is implementation-ready but provider policy is mutable.

A production deployment SHALL maintain a versioned `ProviderPolicySnapshot` and MUST NOT hard-code provider rules as permanent product truth.

## 5.1 WhatsApp 24-hour customer-service window

As of the 2026-10-07 policy snapshot:

- a business may send non-template/free-form service messages only while the applicable 24-hour customer-service window is open;
- the window is based on the **latest qualifying message from the user**;
- a new qualifying inbound user message resets/reopens the 24-hour window;
- a business message does **not** reset the 24-hour window;
- delivery/read receipts do not reset the window;
- automation may respond during the window subject to current provider policy and escalation/support requirements;
- after the window closes, outbound messages generally require an approved template and applicable opt-in/policy compliance.

Therefore:

```text
last_user_message_at = timestamp of latest qualifying inbound user message

customer_service_window_open_until =
    last_user_message_at + provider_policy.customer_service_window_duration

last_business_message_at DOES NOT CHANGE customer_service_window_open_until
```

### Mandatory anti-keepalive rule

SmartAIHub MUST NOT send automated messages for the purpose of artificially extending the customer-service window.

Sending a status update every six hours DOES NOT extend the window.

Only a new qualifying inbound user message may create/reset the window.

## 5.2 Current WhatsApp pricing snapshot — corrected in R2.1

The implementation MUST use current official WhatsApp Business Platform pricing rather than an assumed monthly service-message free allowance.

As of the 2026-10-07 policy snapshot, official WhatsApp Business Platform pricing states:

- businesses are charged on a per-delivered-message basis for chargeable categories;
- **service messages are not charged**;
- **utility messages sent in response to users are not charged** under the current pricing description;
- marketing, authentication and other chargeable utility use cases remain subject to the applicable market/category rate;
- when a customer enters from an eligible ad that clicks to WhatsApp or Facebook Page call-to-action entry point, the current official pricing page describes a **72-hour free-entry-point period** during which messages are not charged;
- exact market rates, category classification, volume tiers, free-entry-point eligibility and future changes remain provider policy.

SmartAIHub MUST NOT hard-code a fictional `1,000 free service messages/month` allowance.

All pricing rules SHALL be represented as versioned provider-policy data and re-evaluated at send time.

The outbound pipeline SHOULD ingest delivery/pricing metadata where available and reconcile estimates with actual provider billing evidence.

## 5.3 WhatsApp AI-provider restriction

Current WhatsApp/Meta terms contain restrictions for providers/developers of AI/ML technologies when AI technology, including general-purpose AI assistants, is the primary functionality being made available, with exceptions controlled by Meta for certain countries/use cases.

This creates a mandatory release gate:

```text
WhatsApp production enablement
    ↓
classify SmartAIHub deployment/use case
    ↓
load current Meta AI-provider policy
    ↓
resolve country/account/use-case eligibility
    ↓
ALLOW / RESTRICT_TO_CONTROL_SURFACE / DENY
```

SmartAIHub MUST NOT ship a WhatsApp-based general-purpose personal assistant merely because the Cloud API technically accepts the traffic.

The policy gate SHALL be fail-closed.

## 5.4 Data-use restriction

WhatsApp Business Platform data MUST NOT be used to train/improve general/shared models in a manner prohibited by current Meta terms.

Provider data-use restrictions SHALL be represented in the data-purpose policy passed to:

- LLM providers;
- memory ingestion;
- analytics;
- observability;
- fine-tuning;
- export pipelines.

---

# 6. Reference architecture

```text
                    ┌──────────────────────────┐
                    │ WhatsApp Consumer Client │
                    └────────────┬─────────────┘
                                 │
                         Meta Cloud API
                                 │
                     inbound webhook event
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────┐
│ Cloudflare Edge Ingress                                      │
│                                                               │
│ - HTTPS endpoint                                              │
│ - provider verification                                       │
│ - signature validation                                        │
│ - payload size limit                                          │
│ - cheap abuse/rate checks                                     │
│ - minimal parse                                                │
│ - durable receipt                                              │
│ - immediate acknowledgement                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │
                        ▼
                Cloudflare Queue
                        │
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ External Messaging Ingress Processor                          │
│                                                               │
│ - dedupe / ordering                                           │
│ - normalize provider payload                                  │
│ - media quarantine/download                                   │
│ - identity binding lookup                                     │
│ - admission evidence                                          │
│ - provider policy metadata                                    │
│ - reply/message correlation                                   │
└───────────────────────┬───────────────────────────────────────┘
                        │ CanonicalExternalMessage
                        ▼
                  SPEC-298 admission
                        │
                        ▼
                  SPEC-279 ingress
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   Assistant         Capability        Workflow/
   SPEC-269          SPEC-256          durable job
       │                                 │
       └────────────────┬────────────────┘
                        ▼
             Canonical result/progress
                        │
                        ▼
                 Notification Broker
                        │
              policy / consent / cost
                        │
                        ▼
                Outbound channel queue
                        │
                        ▼
               WhatsApp adapter sender
                        │
                        ▼
                  Meta Cloud API
```

---

# 7. Provider-neutral adapter contract

Every messaging provider SHALL implement a contract equivalent to:

```ts
interface ExternalMessagingAdapter {
  provider: MessagingProvider;

  verifyWebhook(req: RawWebhookRequest): Promise<WebhookVerificationResult>;
  parseWebhook(req: RawWebhookRequest): Promise<ProviderEvent[]>;

  normalizeInbound(event: ProviderEvent): Promise<CanonicalExternalMessage>;

  fetchMedia(ref: ProviderMediaRef, ctx: FetchContext): Promise<QuarantinedMediaRef>;

  evaluateOutboundCapability(
    intent: OutboundMessageIntent,
    policy: ProviderPolicySnapshot
  ): Promise<OutboundCapabilityDecision>;

  renderOutbound(
    intent: OutboundMessageIntent,
    decision: OutboundCapabilityDecision
  ): Promise<ProviderOutboundPayload[]>;

  send(payload: ProviderOutboundPayload): Promise<ProviderSendReceipt>;

  normalizeDeliveryStatus(event: ProviderEvent): Promise<DeliveryStatusEvent>;
}
```

The canonical runtime MUST NOT call Meta Graph API directly.

---

# 8. Canonical inbound message

```ts
interface CanonicalExternalMessage {
  provider: 'whatsapp' | string;
  channelAccountRef: string;

  providerMessageId: string;
  providerConversationRef?: string;
  providerSenderRef: string;

  providerTimestamp: string;
  receivedAt: string;

  content: {
    type:
      | 'text'
      | 'audio'
      | 'voice'
      | 'image'
      | 'document'
      | 'video'
      | 'interactive'
      | 'reaction'
      | 'location'
      | 'contact'
      | 'unsupported';
    text?: string;
    mediaRef?: string;
    interactionRef?: string;
    replyToProviderMessageId?: string;
  };

  transportContext: {
    phoneNumberId?: string;
    wabaId?: string;
    localeHint?: string;
  };

  identityContext?: {
    bindingRef?: string;
    principalRef?: string;
    tenantRefs?: string[];
    assuranceLevel?: string;
  };

  projectContextHint?: {
    explicitProjectRef?: string;
    replyLinkedProjectRef?: string;
    candidateRefs?: string[];
    confidence?: number;
  };

  policyContext: {
    policySnapshotRef: string;
    customerServiceWindowRef?: string;
    consentRef?: string;
  };

  provenanceRef: string;
}
```

A `CanonicalExternalMessage` is input evidence, not authorization and not a task.

---

# 9. WhatsApp account and number model

The system SHALL distinguish:

```text
Meta Business Portfolio
        ↓
WhatsApp Business Account (WABA)
        ↓
Business phone number / Phone Number ID
        ↓
SmartAIHub channel_account
```

A production number SHOULD be controlled by the business/platform rather than by an individual employee’s personal account.

Development SHALL support Meta test assets before a production number is attached.

Phone registration lifecycle SHALL include:

- number ownership verification;
- current Meta registration requirements;
- two-step verification/PIN where required;
- WABA subscription;
- webhook subscription;
- display-name status;
- quality/status monitoring;
- disable/deregister/rotate procedures;
- disaster-recovery ownership documentation.

No phone-number credential SHALL be stored as reusable plaintext outside SPEC-272-controlled secret infrastructure.

---

# 10. Webhook security

The edge receiver MUST:

1. support provider webhook verification challenge;
2. verify provider request authenticity/signature according to current Meta documentation;
3. reject invalid signatures before expensive work;
4. reject oversized bodies before parsing;
5. apply request-rate limits and anomaly controls;
6. write a minimal durable receipt;
7. enqueue normalized raw event metadata;
8. acknowledge the provider quickly;
9. perform LLM/STT/media parsing asynchronously;
10. never execute a command inside the webhook request lifecycle.

Where the provider uses an HMAC signature such as `x-hub-signature-256`, the verifier MUST use the canonical application secret from SPEC-272 and constant-time comparison.

Raw webhook payload retention MUST be minimized and governed by retention policy.

---

# 11. Idempotency and duplicate delivery

Provider webhook delivery is at-least-once from SmartAIHub’s perspective.

For WhatsApp inbound messages:

```text
dedupe_key =
  provider
  + channel_account_id
  + provider_message_id
```

A duplicate webhook:

- MAY update delivery metadata;
- MUST NOT create a second canonical command;
- MUST NOT execute an effect twice;
- MUST NOT consume the user’s budget twice;
- MUST NOT append duplicate durable memory/evidence;
- MUST NOT create duplicate notifications.

For command-producing events, the effect chain SHALL preserve:

```text
provider_message_id
→ ingress_receipt_id
→ canonical_command_id
→ execution_id
→ effect_idempotency_key
→ response_message_id(s)
```

---

# 12. Ordering and late events

The system SHALL record:

- provider event timestamp;
- SmartAIHub receive timestamp;
- processing timestamp.

Late/replayed messages MUST NOT silently reopen a customer-service window using `receivedAt`.

Window calculations SHOULD use the provider’s qualifying user-message timestamp when trustworthy, with anti-replay and clock-skew controls.

Status events MAY arrive out of order. Delivery-state reducers MUST be monotonic where provider semantics permit.

---

# 13. Identity binding

A WhatsApp sender ID/phone number is an **external channel identity**, not a SmartAIHub principal.

The first private operation SHALL require binding.

## 13.1 Safe linking flow

```text
Unbound WhatsApp sender
        ↓
requests private operation
        ↓
SmartAIHub issues short-lived single-use link nonce
        ↓
user opens HTTPS SmartAIHub link
        ↓
authenticates normally
        ↓
chooses account/tenant scope
        ↓
confirms WhatsApp binding
        ↓
server binds exact provider sender ref
        ↓
WhatsApp receives success acknowledgement
```

The link token:

- MUST be opaque;
- MUST be short-lived;
- MUST be single-use;
- MUST be bound to provider + channel account + sender identity;
- MUST NOT itself be a long-lived bearer credential;
- MUST be revoked on failed/abandoned flow.

## 13.2 Binding model

```ts
interface ChannelIdentityBinding {
  id: string;
  provider: string;
  channelAccountRef: string;
  externalSenderRef: string;
  principalRef: string;
  tenantScopeRefs: string[];
  createdAt: string;
  lastVerifiedAt: string;
  state: 'PENDING'|'ACTIVE'|'SUSPENDED'|'REVOKED';
  assuranceLevel: 'BOUND'|'RECENT_REAUTH'|'STEP_UP';
}
```

A number change, stolen phone, WhatsApp account compromise or SmartAIHub logout-all event SHALL support rapid revocation.

---

# 14. Admission before expensive work

SPEC-298 SHALL be invoked before:

- LLM calls;
- vector search;
- large database queries;
- media transcription;
- large file download where avoidable;
- durable job creation;
- fan-out to external agents.

Pre-admission may inspect only cheap signals needed for sender/account rate limits, blocked sender status, known abusive payloads, size/type limits, provider account status, and obvious unsupported operations.

Transport change MUST NOT increase authority.

---

# 15. Tenant and principal authorization

The effective authority is:

```text
channel transport proof
∩ channel identity binding
∩ SmartAIHub principal authority
∩ tenant membership
∩ project/resource authorization
∩ command policy
∩ approval state
∩ budget/credit constraints
∩ current provider policy
```

A WhatsApp identity MAY map to one SmartAIHub human principal with memberships in multiple tenants.

The channel adapter MUST NOT infer tenant from phone country, display name, contact label or message wording.

---

# 16. Project/work-context resolution

Users MUST NOT be forced to include `projectId` in every message.

Resolution priority SHALL be:

1. explicit project/work-context reference in the current message;
2. reply-linked object (message → task/job/project/artifact);
3. explicit active context selected in the current channel conversation;
4. current authenticated work-context binding;
5. recent authorized project context;
6. semantic candidate matching against authorized projects;
7. user clarification.

The resolver MUST NOT search unauthorized projects merely to improve confidence.

If multiple candidates are materially plausible, SmartAIHub SHALL ask the user to choose, preferably through a provider-supported structured choice.

Example:

```text
User: "งาน deploy ถึงไหนแล้ว"

Candidate A: SmartAIHub / production deployment 0.51
Candidate B: Customer Mini App / deployment 0.47

→ Ask, do not guess.
```

A channel conversation is NOT a project and MUST NOT permanently bind to one without explicit policy.

---

# 17. Memory boundaries

The WhatsApp transcript SHALL NOT automatically become durable memory.

The pipeline SHALL classify information into:

- transport/session context;
- user memory candidate;
- project memory candidate;
- team/tenant memory candidate;
- procedural memory candidate;
- evidence/artifact;
- non-memory transient content.

SPEC-268 remains authoritative.

The new implementation MUST NOT create a permanent dependency on legacy `personaId` or a legacy memory schema.

A user’s private memory MUST NOT be copied into a project database merely because the project was discussed on WhatsApp.

---

# 18. Evidence and attachments

Attachments received through WhatsApp SHALL follow:

```text
provider media reference
    ↓
authorized fetch
    ↓
quarantine
    ↓
MIME/content sniff
    ↓
size enforcement
    ↓
malware/safety scan as applicable
    ↓
durable original preservation when policy permits
    ↓
artifact/evidence registration
    ↓
derived extraction / OCR / embeddings
```

Mandatory invariants:

```text
ATTACHMENT ≠ MEMORY
ATTACHMENT ≠ TRUSTED INPUT
FILENAME ≠ IDENTITY
OCR TEXT ≠ ORIGINAL FILE
EMBEDDING ≠ BACKUP
SUMMARY ≠ EVIDENCE SOURCE
```

Provider media URLs or tokens MUST be treated as ephemeral.

---

# 19. Supported MVP message types

| Type | Inbound | Outbound | Notes |
|---|---:|---:|---|
| text | yes | yes | canonical baseline |
| audio / voice note | yes | yes | STT/TTS optional |
| image | yes | yes | evidence pipeline |
| document | yes | yes | evidence pipeline |
| reply context | yes | yes | resource correlation |
| interactive quick choice | yes | yes | project/task choice |
| delivery status | n/a | yes | sent/delivered/read/failed where available |

The adapter MAY preserve unsupported types as metadata without executing them.

Video, location, contacts, stickers, flows, group messaging and calling are extension phases unless required by an approved use case.

---

# 20. Voice-note pipeline

```text
WhatsApp voice/audio
    ↓
media fetch + quarantine
    ↓
audio normalization
    ↓
STT
    ↓
transcript + confidence + language metadata
    ↓
canonical command ingress
    ↓
response planner
    ↓
text reply and/or TTS audio reply
```

The original audio and derived transcript SHALL have distinct artifact identities.

Low-confidence transcription of an effectful command MUST trigger clarification or require textual confirmation.

A transcript MUST NOT silently convert uncertain speech into a destructive command.

---

# 21. Response profiles

The response planner SHALL support at least:

```text
chat
concise
concise_voice
driving
artifact_first
status_only
```

`driving` is a response-format profile, not a claim that SmartAIHub knows the user is driving.

It SHOULD:

- use short sentences;
- lead with material changes;
- limit choices;
- avoid large code blocks/tables;
- make approvals explicit;
- avoid requiring screen reading;
- defer complex/high-risk actions to a secure surface.

A channel MAY select `driving` only from explicit user preference or trusted client context, not from speculative inference.

---

# 22. Reply-context correlation

Every outbound message that refers to a material object SHOULD record a link:

```text
channel_message
    ↔ project
    ↔ task
    ↔ job
    ↔ approval
    ↔ artifact
    ↔ notification intent
```

If the user replies:

> “ให้แก้ตัวนี้ต่อ”

to a job-failure message, the resolver SHOULD recover the linked job directly.

It MUST re-check current authorization and current job state before acting.

Reply context is a disambiguation hint, not standing authorization.

---

# 23. Command risk classes

The channel SHALL classify effectful requests before execution.

## R0 — informational read

Examples: “งานถึงไหนแล้ว”, “มี blocker อะไร”, “ส่งไฟล์ผลลัพธ์ล่าสุด”.

May execute after normal authorization.

## R1 — low-risk reversible write

Examples: create a task, add a note, request analysis, start a bounded sandbox test.

May execute according to tenant policy.

## R2 — consequential write

Examples: trigger a substantial paid job, alter shared project configuration, stop/restart a production-affecting workflow.

Requires stronger confirmation/policy depending on existing owners.

## R3 — high-risk / privileged

Examples: production deploy, production migration, secret/credential change, tenant-wide permission change, material spend, irreversible external side effect.

A WhatsApp text/button alone MUST NOT satisfy a formal high-risk approval unless the canonical approval authority explicitly certifies that channel and assurance level for that operation.

Preferred path:

```text
WhatsApp requests operation
    ↓
SmartAIHub creates approval candidate
    ↓
WhatsApp sends signed short-lived approval URL
    ↓
authenticated SmartAIHub approval surface
    ↓
canonical approval receipt
    ↓
execution
```

## R4 — destructive

Examples: delete production data, revoke broad access, irreversible destructive action.

Requires the strongest canonical policy and MAY be prohibited entirely from external messaging channels.

---

# 24. Long-running work

A WhatsApp request MUST NOT keep an HTTP or message-processing transaction open until a long job finishes.

Flow:

```text
message
  ↓
canonical command
  ↓
durable job
  ↓
immediate receipt
  ↓
progress events
  ↓
material-change notification
  ↓
final result
```

Example response:

```text
รับงานแล้ว
Job: J-4821
Project: SmartAIHub
State: queued
```

The job source of truth remains the canonical job system, not the WhatsApp message.

---

# 25. Task control commands

The adapter SHOULD support normalized intents equivalent to:

- status;
- progress;
- pause;
- resume;
- cancel/request-cancel;
- retry;
- show blocker;
- show evidence;
- show result;
- continue;
- approve-via-secure-surface;
- choose project;
- change notification preference.

Commands SHALL route through existing task/job authority rather than provider-specific code.

---

# 26. Outbound notification architecture

Canonical runtimes SHALL emit events, not call WhatsApp.

```text
JobCompleted
ApprovalRequired
DeploymentFailed
ArtifactReady
BlockerDetected
StatusHeartbeatDue
        ↓
Notification Intent
        ↓
Notification Broker
        ↓
User preference
+ importance
+ consent
+ channel availability
+ provider policy
+ 24h window
+ template availability
+ AI policy
+ cost budget
        ↓
Channel delivery plan
```

---

# 27. 24-hour window algorithm

Canonical provider-side state:

```ts
interface WhatsAppServiceWindow {
  channelIdentityRef: string;
  lastQualifyingUserMessageAt?: string;
  lastBusinessMessageAt?: string;
  openUntil?: string;
  policySnapshotRef: string;
}
```

Algorithm:

```text
On qualifying inbound user message U at time T:
    lastQualifyingUserMessageAt = T
    openUntil = T + current_policy_window_duration

On outbound business message B:
    lastBusinessMessageAt = B.time
    openUntil = unchanged

On delivery receipt:
    openUntil = unchanged

On read receipt:
    openUntil = unchanged

On scheduled bot heartbeat:
    openUntil = unchanged
```

The implementation MUST NOT infer a reset from:

- a SmartAIHub outbound message;
- delivery status;
- read status;
- queue retry;
- template delivery;
- an internal job event;
- an old/replayed user event.

---

# 28. The “every 6 hours” use case

If the user says:

> “แจ้งสถานะงานนี้ทุก 6 ชั่วโมง”

SmartAIHub SHALL create a durable notification subscription, not an ad-hoc chat loop.

Example:

```text
User message: 2026-10-07 08:00
Current 24h window closes: 2026-10-08 08:00

Scheduled updates:
14:00  → window open
20:00  → window open
02:00  → window open
08:00+ → window closed unless user sent a new message
```

The messages sent at 14:00, 20:00 and 02:00 DO NOT move the 08:00 expiry.

If the user replies at 20:05:

```text
new last user message = 20:05
new openUntil = next day 20:05
```

When the next scheduled update is due after window closure, the Notification Broker SHALL choose one of:

1. send an eligible approved template if consent/policy/budget permit;
2. send through another user-approved channel;
3. store the update in SmartAIHub Attention Inbox and defer external delivery;
4. suppress a non-material heartbeat;
5. for critical events, use the configured compliant escalation channel.

It MUST NOT fabricate a user response or send “keepalive” messages to reset the window.

---

# 29. Notification subscription model

```ts
interface ChannelNotificationSubscription {
  id: string;
  principalRef: string;
  tenantRef: string;
  projectRef?: string;
  resourceRef?: string;

  eventTypes: string[];

  cadence?: {
    mode: 'CHANGE_ONLY'|'HEARTBEAT'|'PERIODIC_SUMMARY';
    intervalSeconds?: number;
  };

  preferredChannels: string[];

  minSeverity?: 'INFO'|'NOTICE'|'WARNING'|'CRITICAL';

  quietHoursPolicyRef?: string;
  consentRef: string;
  budgetPolicyRef: string;

  state: 'ACTIVE'|'PAUSED'|'ENDED';
}
```

Default periodic project status SHOULD be `CHANGE_ONLY` unless the user explicitly requests a heartbeat.

---

# 30. Consent and opt-out

The system SHALL store channel-specific consent independent of SmartAIHub account existence.

Consent SHALL record:

- business/brand identity;
- channel;
- notification category;
- scope;
- source;
- timestamp;
- current state;
- evidence/reference;
- revocation timestamp.

A user MUST be able to stop recurring WhatsApp notifications.

Opt-out MUST propagate promptly to pending outbound intents where applicable.

---

# 31. Template management

Templates SHALL be registry objects, not hard-coded strings.

```ts
interface ChannelTemplate {
  id: string;
  provider: 'whatsapp';
  channelAccountRef: string;
  providerTemplateName: string;
  languageCode: string;
  providerCategory: string;
  businessPurpose: string;
  sensitivityClass: string;
  approvalStatus: string;
  providerVersion?: string;
  lastVerifiedAt: string;
}
```

Template use MUST be selected by policy.

A template MUST NOT carry sensitive project details merely because the provider permits variable substitution.

For many project notifications, the safer default is a low-detail notification such as:

> “มีอัปเดตสำคัญในงานของคุณ เปิด SmartAIHub เพื่อดูรายละเอียด”

rather than embedding secrets, private code or confidential incident detail.

---

# 32. Cost Guard

Outbound cost MUST be a first-class decision input.

```ts
interface ChannelCostDecision {
  estimatedProviderCost?: number;
  currency?: string;
  pricingClass?: string;
  freeTierRemainingEstimate?: number;
  budgetRef?: string;
  decision: 'ALLOW'|'DEFER'|'ALTERNATE_CHANNEL'|'REQUIRE_OVERRIDE'|'DENY';
  policySnapshotRef: string;
}
```

Cost Guard SHALL support:

- per-user budget;
- per-tenant budget;
- per-number budget;
- category budget;
- critical-notification override policy;
- monthly free-tier counters;
- actual-vs-estimated reconciliation;
- alert before unexpected cost spikes.

The system SHOULD aggregate non-urgent status into fewer high-value messages rather than sending many short bubbles, because current WhatsApp pricing can be per delivered outbound message.

---

# 33. Provider Policy Gate

Before an outbound delivery, the provider gate SHALL evaluate:

```text
Is provider account healthy?
Is this use case permitted?
Is this deployment classified as an AI Provider?
Is general-purpose AI permitted for this account/market/use case?
Is the recipient opted in where required?
Is customer-service window open?
Is free-form allowed?
If not, is an approved template allowed?
Is the template category valid for this purpose?
Is data content allowed?
Is the cost within budget?
Is there an applicable quiet-hours/notification policy?
```

The decision SHALL be auditable.

A policy denial MUST NOT be bypassed by changing from text to audio, using another Meta endpoint, or routing through a different internal agent.

---

# 34. WhatsApp AI-provider compliance boundary

Because SmartAIHub itself is an AI platform, this section is a release blocker.

## 34.1 Mandatory deployment classification

Every WhatsApp channel account SHALL have:

```ts
type AiUseClassification =
  | 'NON_AI'
  | 'BUSINESS_ANCILLARY_AI'
  | 'CONTROL_SURFACE'
  | 'GENERAL_PURPOSE_AI_PROVIDER'
  | 'UNRESOLVED';
```

`UNRESOLVED` MUST fail closed for general-purpose AI.

## 34.2 Allowed core without general-purpose mode

Even when general-purpose assistant mode is not approved, the implementation MAY retain a narrow provider-policy-approved command/control layer if current Meta terms permit it.

Examples MAY include task status, job state, explicit project command dispatch, deterministic workflow selection, notifications, secure deep links, and structured choices.

This SPEC does not declare those use cases legally permitted; production enablement still requires current policy review.

## 34.3 Open-domain fallback prohibited

If an incoming WhatsApp message asks for open-domain general assistance and the channel is restricted to CONTROL_SURFACE, SmartAIHub SHALL not silently route that prompt to a general-purpose LLM response.

It SHOULD explain that the WhatsApp channel is limited to approved SmartAIHub control/status functions and provide an allowed SmartAIHub surface for full assistant interaction.

---

# 35. Human/support escalation

Where WhatsApp automation policy requires an escalation path, each production channel account SHALL configure one or more approved paths:

- human chat handoff;
- support email;
- support web form/site;
- phone support;
- another compliant route.

The bot MUST not claim a human is available if no live human service exists.

---

# 36. Multi-number and multi-tenant strategy

MVP:

```text
one SmartAIHub central number
    ↓
many external users
    ↓
identity binding
    ↓
tenant/project authorization
```

Future:

```text
Channel Registry
├─ SmartAIHub Main TH
├─ SmartAIHub Main EU
├─ Tenant A branded number
├─ Tenant B branded number
└─ Sandbox/Test number
```

A new number MUST NOT create a new Assistant runtime or new orchestration stack.

Routing SHALL start from `channelAccountRef`.

---

# 37. Data model

Minimum logical entities:

## `channel_accounts`

- id
- provider
- provider_business_account_ref
- provider_phone_number_ref
- display_number
- display_name
- tenant_binding_mode
- fixed_tenant_ref nullable
- environment
- status
- ai_use_classification
- provider_policy_ref
- credential_ref
- created_at
- updated_at

## `channel_identities`

- id
- provider
- channel_account_id
- external_sender_ref
- normalized_address_hash
- state
- first_seen_at
- last_seen_at

## `channel_identity_bindings`

- id
- channel_identity_id
- principal_ref
- allowed_tenant_scope
- assurance_level
- state
- linked_at
- last_verified_at
- revoked_at

## `channel_conversations`

Transport/session projection only:

- id
- channel_identity_id
- provider_thread_ref nullable
- selected_work_context_ref nullable
- response_profile
- last_user_message_at
- last_business_message_at
- window_open_until
- policy_snapshot_ref
- state

## `channel_messages`

- id
- direction
- provider_message_id
- channel_conversation_id
- provider_timestamp
- received_or_created_at
- content_type
- content_ref
- reply_to_channel_message_id
- ingress_receipt_ref
- command_ref
- delivery_state
- pricing_state_ref
- redaction_state

## `channel_message_links`

Many-to-many links to project, work context, task, job, approval, artifact and notification intent.

## `channel_media_refs`

- provider_media_ref
- quarantined_object_ref
- canonical_artifact_ref
- MIME
- size
- scan state
- retention policy ref

## `channel_consents`

Category-specific opt-in/out state.

## `channel_notification_subscriptions`

Recurring/event subscriptions.

## `channel_outbound_intents`

Canonical request to notify, before provider rendering.

## `channel_delivery_attempts`

Provider attempts, response codes, retry schedule and final state.

## `channel_policy_snapshots`

Versioned provider rules.

## `channel_templates`

Approved provider templates.

## `channel_pricing_events`

Estimated and actual pricing classification/cost metadata.

---

# 38. Canonical outbound intent

```ts
interface OutboundMessageIntent {
  id: string;
  principalRef: string;
  tenantRef?: string;
  workContextRef?: string;

  reason:
    | 'DIRECT_REPLY'
    | 'JOB_PROGRESS'
    | 'JOB_COMPLETE'
    | 'APPROVAL_REQUIRED'
    | 'CRITICAL_ALERT'
    | 'PERIODIC_STATUS'
    | 'ARTIFACT_READY'
    | 'USER_REQUESTED_REMINDER';

  importance: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL';

  content: {
    semanticText: string;
    artifactRefs?: string[];
    choiceRefs?: string[];
    sensitiveDataClass?: string;
  };

  responseProfile?: string;
  replyToMessageRef?: string;
  providerPreference?: string[];
  consentRef?: string;
  budgetRef?: string;
  createdAt: string;
  expiresAt?: string;
}
```

The semantic intent is provider-neutral. Rendering to WhatsApp text/template/audio happens later.

---

# 39. Delivery state

The adapter SHALL normalize provider status into:

```text
QUEUED
PROVIDER_ACCEPTED
SENT
DELIVERED
READ
FAILED_TRANSIENT
FAILED_PERMANENT
EXPIRED
SUPPRESSED_POLICY
SUPPRESSED_COST
DEFERRED_WINDOW
```

`DELIVERED` does not mean the user accepted a task result.

`READ` does not mean approval.

---

# 40. Cloudflare implementation topology

Preferred deployment:

```text
Cloudflare Worker
  /webhooks/whatsapp
        ↓
Queue: external-messaging-ingress
        ↓
Ingress Processor Worker/Workflow
        ↓
Canonical SmartAIHub services
        ↓
Queue: notification-outbound
        ↓
Outbound Policy Worker
        ↓
Queue: whatsapp-send
        ↓
WhatsApp Sender Worker
```

Recommended supporting resources:

- Queues for ingress/outbound buffering;
- Workflows where durable multi-step processing is useful;
- R2 for permitted durable media/artifact storage;
- D1/KV/DO only according to canonical ownership and consistency needs;
- PostgreSQL SoR where channel state is part of canonical platform data;
- Secrets Store / SPEC-272 broker for Meta credentials;
- Rate limiting/admission at edge;
- existing observability/audit stack.

No Cloudflare primitive shall become an alternative business source of truth if a canonical owner already exists.

---

# 41. Secret handling

Secrets include Meta app secret, system-user access token, webhook verification token, provider signing secrets, and any future calling/media credentials.

Requirements:

- store by credential reference;
- never log plaintext;
- never place tokens in client-side URLs;
- rotate/revoke without deleting channel account identity;
- separate dev/staging/prod;
- minimum permissions;
- use short-lived credentials where provider capability permits;
- redact errors before audit/user display.

---

# 42. Data minimization and PDPA/privacy

SmartAIHub SHALL:

- collect only data needed for the messaging purpose;
- publish applicable privacy notice;
- preserve consent evidence;
- support channel unlink/revocation;
- honor retention/deletion policy;
- separate operational audit requirements from conversational memory;
- prevent cross-tenant disclosure;
- avoid storing full phone numbers in logs where hashes/refs suffice;
- restrict media access with signed/short-lived internal references;
- avoid using WhatsApp-derived data to train shared/general models when provider terms prohibit it;
- propagate purpose/consent revocation to derived data use where required.

---

# 43. Observability

Minimum metrics:

- inbound events/sec;
- invalid-signature rate;
- duplicate webhook rate;
- admission-denied rate;
- unbound-identity rate;
- project-disambiguation rate;
- STT failure rate;
- canonical ingress latency;
- command acceptance rate;
- job-link rate;
- outbound intents/sec;
- policy-denied outbound rate;
- template-required rate;
- window-open/window-closed sends;
- service-message count per number/month;
- cost estimate vs actual;
- delivery/read/failure rates;
- provider throttling;
- Meta account quality/status changes;
- opt-out rate;
- user-block/report signals where available.

High-cardinality identifiers MUST be handled safely.

---

# 44. Audit trail

Every material operation SHALL be traceable:

```text
external sender
→ binding
→ tenant
→ project/work context
→ inbound message
→ policy snapshot
→ admission decision
→ canonical command
→ authority snapshot
→ approval state
→ execution
→ evidence/result
→ outbound intent
→ provider policy decision
→ delivery receipt
```

Audit data MUST NOT expose provider tokens, raw secrets or unnecessary private message content.

---

# 45. Abuse, spam and cost attacks

Threats include webhook spoofing, replay, inbound floods, oversized media, STT/LLM cost amplification, prompt injection through documents, brute-force linking, phone-number recycling, stolen WhatsApp account, repeated paid outbound trigger, subscription abuse, cross-tenant confusion, and malicious reply-context references.

Mitigations SHALL include signature validation, replay/idempotency, cheap pre-admission, per-sender/per-tenant quotas, media size/type enforcement, sandbox/quarantine, cost reservations, output rate limits, link nonce TTL/single use, re-verification, authorization at effect time, egress policy, budget caps and anomaly detection.

---

# 46. Failure handling

## Meta unavailable

- persist accepted canonical work;
- mark channel delivery pending;
- retry with bounded backoff;
- do not re-run completed work;
- optionally use another authorized channel for critical notifications.

## SmartAIHub backend unavailable

- acknowledge only if a durable ingress receipt has been created;
- retain queue event;
- process after recovery.

## Media fetch expired

- surface a clear failure;
- do not hallucinate file content;
- ask for re-upload where necessary.

## STT uncertain

- ask clarification;
- prohibit destructive execution.

## Project ambiguous

- ask user to choose;
- never pick an unauthorized or merely semantically similar project.

## Policy changed

- new outbound decisions use the new policy snapshot;
- already queued items MUST be re-evaluated before send if the relevant policy generation changed.

## Credential revoked

- fail closed;
- mark channel account degraded;
- alert an authorized administrator through a safe alternate path.

---

# 47. Admin / operations surface

SmartAIHub admin SHOULD expose:

- channel accounts;
- provider number/WABA refs;
- environment;
- current health;
- current Meta/provider policy snapshot;
- AI-use classification;
- enabled modes;
- credentials by reference/status only;
- template registry/status;
- monthly message/service counter;
- estimated/actual provider spend;
- current notification volume;
- opt-in/out metrics;
- delivery failure trends;
- quality/restriction warnings;
- incident controls;
- pause outbound;
- revoke binding;
- rotate credential;
- re-run policy sync.

---

# 48. User-facing controls

Users SHOULD be able to:

- link/unlink WhatsApp;
- see bound number in masked form;
- choose default project behavior;
- choose response profile;
- configure notifications;
- choose change-only vs heartbeat;
- set quiet hours;
- set WhatsApp spend preference where exposed;
- revoke all external messaging sessions;
- see recent external-command history;
- see which channel triggered a task/job;
- open a secure SmartAIHub approval page.

---

# 49. Example flows

## 49.1 Read project status

```text
User:
"SmartAIHub ตอนนี้มีอะไรติดอยู่"

WhatsApp
→ binding
→ admission
→ project resolver
→ evidence/current state
→ SPEC-279
→ assistant/status composition
→ outbound policy
→ WhatsApp
```

## 49.2 Voice command

```text
User voice note:
"งาน deploy ล่าสุดผ่านหรือยัง ถ้าผ่านให้เริ่ม test รอบต่อไป"

audio
→ quarantine
→ STT
→ split read + conditional effect
→ current state query
→ authority check
→ durable conditional command
→ receipt
```

If transcription confidence on the effectful clause is low, the system MUST confirm.

## 49.3 Reply to a failure message

```text
SmartAIHub:
"J-4821 migration verification failed"

User replies:
"ให้แก้ต่อ"

reply context
→ message link
→ J-4821
→ re-check project/authorization/state
→ canonical continuation command
```

## 49.4 Ambiguous project

```text
User:
"งาน build ถึงไหนแล้ว"

Two authorized project candidates are close.

SmartAIHub:
"หมายถึง SmartAIHub หรือ SmartSpecPro?"

Structured choice where provider supports it.
```

## 49.5 Six-hour status subscription

```text
User:
"แจ้งงาน J-4821 ทุก 6 ชั่วโมงจนกว่าจะเสร็จ"

→ create durable subscription
→ 6h scheduler
→ each due event evaluates:
   current state
   material change
   user consent
   24h window
   template need
   provider policy
   cost
→ send/defer/alternate
```

No outbound update resets the 24h window.

## 49.6 High-risk request

```text
User:
"deploy production เลย"

→ canonical candidate
→ R3 high risk
→ create approval request
→ send secure approval link
→ no deploy until canonical approval receipt exists
```

---

# 50. Message composition policy

To reduce cost, noise and distraction:

- combine closely related status points into one message where safe;
- avoid sending one sentence as many separate bubbles;
- prefer material-change notifications;
- include stable object labels/job refs;
- avoid dumping long logs into chat;
- link to artifact/log detail;
- respect response profile;
- do not disclose secrets;
- avoid sensitive content in templates unless explicitly approved;
- use Thai naturally when user preference indicates Thai.

---

# 51. Provider capability registry

Provider capabilities SHALL be data-driven:

```yaml
provider: whatsapp
capabilities:
  text_in: true
  text_out: true
  audio_in: true
  audio_out: true
  image_in: true
  image_out: true
  document_in: true
  document_out: true
  reply_context: true
  interactive_choices: true
  delivery_receipts: true
  templates: true
  customer_service_window: true
  calling: optional
  groups: policy_and_phase_dependent
```

No canonical runtime may assume a capability exists merely because WhatsApp supports it today.

---

# 52. API/version compatibility

Graph API version usage SHALL be configurable and pinned per deployment generation.

Upgrades SHALL run contract tests before rollout.

The adapter MUST isolate provider JSON from internal canonical schemas so a Meta API version change does not leak through the system.

---

# 53. Testing strategy

## Unit

- webhook verification;
- signature failure;
- message normalization;
- dedupe;
- service-window calculation;
- template decision;
- cost decision;
- binding;
- reply correlation;
- project ambiguity;
- risk classification;
- media type validation.

## Contract

- Meta test number / test assets;
- provider webhook fixtures;
- send text/audio/document;
- status callbacks;
- template rendering;
- phone-number registration projection.

## Integration

- WhatsApp → SPEC-279 → read;
- WhatsApp → durable job;
- job → WhatsApp progress;
- user reply → job continuation;
- expired 24h window → template/defer;
- six-hour subscription across window boundary;
- project ambiguity;
- revoked binding;
- provider-policy deny.

## Security

- forged signature;
- replay;
- token exposure;
- malicious media;
- prompt-injection document;
- cross-tenant reference;
- high-risk approval bypass;
- phone-number recycling;
- stolen account simulation;
- cost amplification.

## Chaos/reliability

- duplicate webhooks;
- out-of-order status;
- queue retry;
- sender timeout;
- Meta 429/5xx;
- credential rotation;
- policy generation change mid-queue;
- R2 unavailable;
- STT provider failure.

---

# 54. Mandatory acceptance criteria

`AC-306-001` WhatsApp webhook creates a durable ingress receipt before asynchronous processing.

`AC-306-002` Invalid provider signatures are rejected before command processing.

`AC-306-003` Duplicate `provider_message_id` does not create duplicate canonical commands.

`AC-306-004` Duplicate provider delivery does not create duplicate effects.

`AC-306-005` An unbound WhatsApp sender cannot access private SmartAIHub project data.

`AC-306-006` Account linking is short-lived, single-use and bound to exact channel identity.

`AC-306-007` Revoking a channel binding prevents subsequent private commands.

`AC-306-008` Transport identity does not directly grant tenant membership.

`AC-306-009` Project resolution never searches unauthorized project content.

`AC-306-010` Ambiguous project context causes clarification instead of silent selection.

`AC-306-011` Reply context can recover the linked job/task/project.

`AC-306-012` Reply context does not bypass current authorization.

`AC-306-013` Voice note is preserved separately from its STT transcript.

`AC-306-014` Low-confidence effectful speech cannot trigger destructive action without clarification.

`AC-306-015` Media is quarantined/validated before downstream use.

`AC-306-016` Attachment ingestion does not automatically create durable memory.

`AC-306-017` WhatsApp does not become a second Assistant runtime.

`AC-306-018` WhatsApp does not become a second durable job source of truth.

`AC-306-019` WhatsApp does not implement a second approval authority.

`AC-306-020` High-risk action cannot be approved by a WhatsApp button alone unless canonical policy explicitly certifies it.

`AC-306-021` Long-running work returns a durable job receipt instead of blocking the webhook.

`AC-306-022` User can request current job status from WhatsApp.

`AC-306-023` User can pause/cancel/resume only through canonical task/job semantics.

`AC-306-024` A business-originated message does not update `lastQualifyingUserMessageAt`.

`AC-306-025` Delivery/read receipts do not reset the 24-hour window.

`AC-306-026` A new qualifying inbound user message resets the 24-hour window.

`AC-306-027` A scheduled six-hour update does not extend the 24-hour window.

`AC-306-028` After window closure, free-form send is blocked unless current provider policy permits it.

`AC-306-029` After window closure, eligible template send still requires policy/consent/cost approval.

`AC-306-030` No bot keepalive technique can fabricate a user-window reset.

`AC-306-031` Provider pricing/free-tier values are policy data, not hard-coded constants.

`AC-306-032` Current service-message free-tier usage is tracked per business phone number.

`AC-306-033` Delivery-time pricing metadata can reconcile cost estimate with actual provider billing state.

`AC-306-034` Non-critical status may be deferred or aggregated to control cost.

`AC-306-035` Critical-notification policy remains bounded by provider legality and user consent.

`AC-306-036` Opt-out cancels future applicable channel notifications.

`AC-306-037` Consent is category/scope aware.

`AC-306-038` Template content is registry/version controlled.

`AC-306-039` Secrets are referenced through SPEC-272 and never logged in plaintext.

`AC-306-040` Dev/staging/prod credentials and channel accounts are separated.

`AC-306-041` The adapter can operate with a Meta test number before production number onboarding.

`AC-306-042` One central number can safely serve multiple users without merging identity/memory/project state.

`AC-306-043` Multiple tenant-branded numbers can be added without duplicating orchestration logic.

`AC-306-044` User/session/project/memory remain separate entities.

`AC-306-045` New implementation does not bind the new memory architecture to legacy `personaId`.

`AC-306-046` Provider policy is evaluated again at outbound dispatch time.

`AC-306-047` A queued message created under an old policy is re-evaluated after relevant policy generation changes.

`AC-306-048` GENERAL_PURPOSE_ASSISTANT mode is deny-by-default.

`AC-306-049` `UNRESOLVED` AI use classification fails closed for general-purpose AI.

`AC-306-050` CONTROL_SURFACE cannot silently fall through to open-domain LLM chat.

`AC-306-051` Meta AI-provider policy denial cannot be bypassed by audio, media type or internal routing.

`AC-306-052` WhatsApp-derived platform data is not used for prohibited shared/general model training.

`AC-306-053` Automation has a configured escalation/support path where provider policy requires one.

`AC-306-054` User can unlink WhatsApp without deleting their SmartAIHub account.

`AC-306-055` Phone-number recycling/stolen-account risk can trigger binding re-verification/revocation.

`AC-306-056` Message delivery does not imply task acceptance or approval.

`AC-306-057` Read status does not imply approval.

`AC-306-058` Driving response profile does not claim the user is driving without trusted/explicit context.

`AC-306-059` Provider outages do not re-run completed jobs.

`AC-306-060` Provider send retry is idempotent at the SmartAIHub intent level.

`AC-306-061` Cost amplification attacks are bounded before expensive execution.

`AC-306-062` Cross-tenant message links cannot disclose unauthorized resources.

`AC-306-063` Audit chain can trace external message to canonical effect and response.

`AC-306-064` Audit logs do not expose reusable secrets.

`AC-306-065` Provider media URL expiry cannot cause the system to invent content.

`AC-306-066` Status subscriptions are durable and survive worker restart.

`AC-306-067` A completed subscription stops according to terminal condition.

`AC-306-068` A periodic subscription can default to material-change-only.

`AC-306-069` User-requested heartbeat cadence can be honored subject to channel policy/cost.

`AC-306-070` Notification Broker can choose an alternate user-approved channel when WhatsApp delivery is not allowed.

`AC-306-071` Provider API JSON is isolated from canonical command schema.

`AC-306-072` Graph/provider API upgrades run compatibility tests before production.

`AC-306-073` Channel message retention is separate from memory retention.

`AC-306-074` Personal/private content cannot be copied to another tenant through channel routing.

`AC-306-075` Implementation can be extended to LINE/Telegram without modifying canonical business runtimes.

`AC-306-076` Implementation can support future WhatsApp Calling API without changing identity/job authority.

`AC-306-077` Production enablement runs current Meta terms/policy check, not a 2026-10-07 hard-coded assumption.

`AC-306-078` The release process blocks if canonical SPEC numbering conflicts with 306.

`AC-306-079` Migration/rollback can disable WhatsApp without corrupting canonical jobs.

`AC-306-080` Final verification proves policy, security, durability, cost and authorization boundaries end-to-end.

---

# 55. Rollout plan

## Phase W0 — Registry and policy gate

- reconcile SPEC number;
- snapshot current Meta Terms, Business Messaging Policy, pricing and Cloud API requirements;
- classify intended SmartAIHub use case under AI-provider terms;
- decide allowed production mode;
- no production WhatsApp general-purpose assistant before this gate passes.

## Phase W1 — Provider-neutral channel core

- data model;
- adapter interfaces;
- notification intents;
- consent;
- cost/policy snapshot;
- delivery receipts.

No Meta dependency in canonical business code.

## Phase W2 — Meta test-number inbound

- webhook;
- signature verification;
- queue;
- normalization;
- text;
- identity linking;
- read-only project/task status.

## Phase W3 — Effectful control

- task/job continuation;
- low-risk writes;
- approval handoff;
- idempotency;
- reply correlation.

## Phase W4 — Media and voice

- audio;
- STT;
- TTS;
- image;
- document;
- evidence integration.

## Phase W5 — Notification Broker

- job completion;
- blocker;
- approval required;
- recurring status;
- exact 24h logic;
- template registry;
- cost guard.

## Phase W6 — Production number

- ownership;
- WABA;
- credentials;
- payment/billing controls where required;
- policy check;
- quality monitoring;
- privacy/support information;
- incident runbook.

## Phase W7 — Additional providers

- LINE;
- Telegram;
- future messaging providers.

They SHALL reuse the same canonical contracts.

---

# 56. Migration and backward compatibility

This is additive.

No existing SmartAIHub Chat route is removed.

No existing Assistant identity is replaced.

No current Project/Memory/Job tables become WhatsApp-owned.

Existing notification mechanisms continue.

Provider channel can be disabled by feature flag without affecting work execution.

If a message triggered a durable job and the WhatsApp channel is later disabled, the job remains valid; only its return route changes/degrades.

---

# 57. Rollback

Rollback SHALL be possible at these layers independently:

1. disable outbound WhatsApp;
2. disable inbound effectful commands but keep read-only;
3. disable media;
4. disable general-purpose/AI mode;
5. disable one channel account/number;
6. revoke provider credential;
7. disable all WhatsApp integration.

Rollback MUST NOT delete canonical jobs, erase approvals, alter project ownership, corrupt Assistant identity, or silently discard already-accepted work.

---

# 58. Security gates before production

Mandatory:

- current Meta terms/policy review;
- AI-provider classification;
- webhook signature verified;
- replay/idempotency tested;
- secret rotation tested;
- cross-tenant tests;
- high-risk approval bypass tests;
- media quarantine tests;
- budget exhaustion tests;
- 24h expiry tests;
- scheduled six-hour status tests;
- account unlink/rebind tests;
- number-compromise recovery;
- provider outage/retry;
- privacy/retention review;
- incident runbook.

---

# 59. Operational runbooks

Required runbooks:

- Meta/WABA account restricted;
- phone number lost/recycled;
- credential leak;
- webhook attack;
- message backlog;
- outbound cost spike;
- provider pricing change;
- provider terms/policy change;
- template rejected;
- delivery failure spike;
- user reports unauthorized command;
- cross-tenant incident;
- media malware incident;
- compromised linked WhatsApp identity.

---

# 60. 20-pass gap audit

| Pass | Lens | Closure in R1.0 |
|---:|---|---|
| 1 | Canonical ownership | WhatsApp is adapter only; no duplicate Assistant/Job/Memory/Approval authority |
| 2 | Numbering safety | SPEC-306 provisional with mandatory canonical registry reconciliation |
| 3 | Provider abstraction | Provider-neutral adapter and outbound intent defined |
| 4 | Identity | External sender separated from principal; secure binding/revocation |
| 5 | Multi-tenant | Tenant/project authority rechecked; no inference from phone identity |
| 6 | Project ambiguity | Explicit resolution order and clarification path |
| 7 | Memory | Transcript/attachment not automatic memory; SPEC-268 remains owner |
| 8 | Evidence/media | Quarantine, artifact identity, derived-data separation |
| 9 | Authorization | Risk classes and canonical approval boundary |
| 10 | Durable execution | Async webhook, durable job linking, retry without duplicate effect |
| 11 | 24-hour semantics | Only qualifying inbound user message resets window |
| 12 | Recurring status | Six-hour scheduler does not extend window; template/defer/alternate path |
| 13 | Pricing | Dynamic policy/cost model; R2.1 supersedes stale R1 service-message pricing assumptions with current official pricing snapshot |
| 14 | Meta AI-provider terms | General-purpose AI deny-by-default with deployment classification gate |
| 15 | Consent/privacy | Opt-in/out, minimization, PDPA/data-purpose boundaries |
| 16 | Secrets/security | SPEC-272, signature validation, replay/cost attack handling |
| 17 | UX/voice/driving | Voice pipeline and concise/driving response profile without unsafe inference |
| 18 | Operations | Health, metrics, incident/rollback/admin controls |
| 19 | Extensibility | LINE/Telegram/future channels reuse same contracts |
| 20 | Final verification | 80 ACs + release gates + policy snapshot requirement |

All 20 audit lenses are CLOSED at specification level. Implementation evidence is still required before release.

---

# 61. Definition of Done

SPEC-306 implementation is NOT complete merely because a WhatsApp bot can reply.

It is complete only when:

```text
Meta test user
→ webhook authenticity verified
→ durable receipt
→ dedupe
→ identity binding
→ admission
→ project resolution
→ canonical ingress
→ current authorization
→ read command
→ low-risk effect
→ durable long-running job
→ reply-linked continuation
→ voice note
→ media/document
→ progress notification
→ 24h window expiration
→ six-hour schedule crossing expiration
→ template/defer decision
→ cost decision
→ policy snapshot
→ opt-out
→ credential rotation
→ provider outage/retry
→ no duplicate effect
→ audit evidence
→ rollback
```

passes end to end.

Production additionally requires:

- canonical SPEC-number reconciliation;
- current Meta policy/terms check;
- approved AI-use classification;
- WABA/number ownership;
- security review;
- privacy/PDPA review;
- current pricing/budget configuration;
- incident runbook;
- no unresolved high-risk gap.

---

# 62. Implementation handoff

Recommended implementation order:

```text
1. registry reconciliation
2. provider-policy service
3. channel core schema/contracts
4. WhatsApp test-number webhook
5. identity binding
6. SPEC-298 admission
7. SPEC-279 canonical ingress
8. read-only commands
9. durable task/job control
10. outbound notification intents
11. exact 24h state machine
12. templates + cost guard
13. voice/media
14. effectful writes/approval handoff
15. production number
16. additional messaging adapters
```

Do not start with UI polish.

Do not start with WhatsApp Calling API.

Do not create a new “WhatsApp Agent” orchestration runtime.

Do not use a real production number until provider-policy and AI-provider gates pass.

---

# 63. Normative external references / policy snapshot

Implementation SHALL re-check current versions at release time.

1. WhatsApp / Meta — WhatsApp Business Solution Terms and AI Provider restrictions
   https://www.whatsapp.com/legal/business-solution-terms

2. WhatsApp Business Messaging Policy — 24-hour customer-service window, templates, consent, automation/escalation
   https://business.whatsapp.com/policy/

3. Meta official WhatsApp Business Platform Postman workspace / Cloud API
   https://www.postman.com/meta/whatsapp-business-platform/

4. Meta WhatsApp Cloud API registration documentation / official Postman collection.

5. Meta webhook payload references / official Postman collection.

6. Meta media API references / official Postman collection.

Pricing and policy values are intentionally NOT copied into immutable implementation constants. The policy snapshot section records the important current behavior, while production must refresh provider policy.

---

# 64. Final invariants

```text
WHATSAPP IS A TRANSPORT, NOT THE BRAIN.

CHANNEL ≠ USER.
NUMBER ≠ AUTHORIZATION.
MESSAGE ≠ TASK.
CHAT ≠ PROJECT.
TRANSCRIPT ≠ MEMORY.
BUTTON ≠ APPROVAL.
DELIVERED ≠ COMPLETED.
READ ≠ APPROVED.

ONLY A QUALIFYING INBOUND USER MESSAGE
RESETS THE WHATSAPP 24-HOUR WINDOW.

SMARTAIHUB OUTBOUND MESSAGES,
INCLUDING SIX-HOUR STATUS UPDATES,
DO NOT RESET THAT WINDOW.

PROVIDER POLICY ≠ STATIC CODE.
PROVIDER PRICING ≠ STATIC CODE.
POLICY IS RE-EVALUATED AT SEND TIME.

GENERAL-PURPOSE AI MODE IS DENY-BY-DEFAULT
UNLESS CURRENT META POLICY PERMITS IT.

WHATSAPP DATA MUST NOT TRAIN/IMPROVE MODELS
IN WAYS PROHIBITED BY CURRENT PROVIDER TERMS.

NO TRANSPORT CHANGE MAY INCREASE AUTHORITY.
NO RETRY MAY DUPLICATE AN EFFECT.
NO CHANNEL FAILURE MAY DESTROY CANONICAL WORK.

ONE CHANNEL FRAMEWORK.
MANY CHANNEL ADAPTERS.
ONE CANONICAL SMARTAIHUB RUNTIME.
```
