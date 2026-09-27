# Spec 225 — SmartAIHub Universal Agent Access, Mobile & Cross-Device Control Plane
## Device-Independent AI Access, Multimodal Capture, Notification/Attention, Human Handoff, Review/Approval & Publishing Control

**Status:** Proposed / Architecture Freeze Candidate  
**Spec ID:** 225  
**Revision:** 2 — Creator Mobile/Tablet Capture & Review Extension (R1 retained; R2 appended; proposed)
**Date:** 2026-09-21  
**Suggested repository path:** `specs/feature/225-universal-agent-access-mobile-cross-device-control-plane/spec.md`  
**Primary owner:** SmartAIHub First-Party Access & Control Surfaces  
**Companion specifications:** Feature 195, Feature 196, Feature 197, Specs 199, 200, 206, 207, 208, 209, 213, 214, 215, 216, 217, 224 and future domain/product specs  
**Canonical job truth:** Feature 195 / `worker_jobs` + `worker_job_events`  
**Canonical intent/orchestration truth:** Feature 196 and shared orchestration contracts  
**Canonical Browser/Computer Use truth:** Spec 208  
**Canonical external-agent interop:** Specs 200 / 206  

---

# 0. Executive Decision

SmartAIHub SHALL be designed as a **device-independent AI access and execution platform**, not as an AI harness tied to a desktop computer.

The product goal is:

> A user can capture or describe an intent from the device already in their hand, allow SmartAIHub to execute through the best available Skills, Agents, APIs, cloud runtimes, browser/computer operators or local Runners, leave the app, and be called back only when input, approval, intervention or result review is required.

The first-party user-facing identity is the **SmartAIHub Agent**.

`SmartAIHub Agent` is a product façade over existing orchestration and execution systems. It SHALL NOT create another planner, job store, browser runtime, memory system or approval system.

Canonical architecture:

```text
                  SMARTAIHUB USER
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
     Web               Mobile            Tablet
      │              iOS/Android             │
      └──────────────────┼──────────────────┘
                         │
                  Spec 225 Access Plane
              Capture / Control / Attention
                         │
                         ▼
                   SmartAIHub Agent
                         │
                         ▼
                 Feature 196 Intent /
                Goal / Plan / Orchestration
                         │
                         ▼
                  Capability Resolver
                         │
        ┌────────────────┼───────────────────┐
        │                │                   │
        ▼                ▼                   ▼
   Skill/Workflow      MCP/A2A         Browser/Computer
                                          Spec 208
        │                │                   │
        └────────────────┼───────────────────┘
                         ▼
                Feature 195 Job Plane
                         │
      ┌──────────────────┼──────────────────────┐
      ▼                  ▼                      ▼
 Cloudflare         External Providers       Runner
Workers/Workflows/  / Agents / APIs       Win/Mac/Linux
Containers/Browser
                         │
                         ▼
                Artifact / Result / Event
                         │
                         ▼
                 Spec 225 Attention
                         │
                  Push / Deep Link
                         │
                         ▼
                 Review / Approve /
               Human Handoff / Publish
```

---

# 1. Why This Spec Exists

SmartAIHub already has strong server-side orchestration, Skills, external-agent integration, durable jobs, Runner execution and Computer Use. Without a canonical cross-device access layer, future iOS, Android, tablet, PWA, browser and notification clients could independently invent:

- session models;
- notification state;
- approval UI semantics;
- upload/capture flows;
- deep links;
- attention queues;
- job polling;
- artifact review;
- browser takeover;
- publishing control;
- device sync.

That would recreate the same fragmentation SmartAIHub is intended to solve.

Spec 225 therefore owns the **first-party access contract**, not the underlying intelligence/execution engines.

---

# 2. Platform Philosophy

## 2.1 Access to intelligence, not access to one harness

SmartAIHub SHALL make intelligence available through a stable product surface while allowing the underlying best execution route to change over time.

Today a task may use:

```text
SmartAIHub Skill
Hermes
Claude/Codex
Grok Bot or another managed agent
Cloudflare Worker/Workflow/Container
Browser Run
SmartAIHub Runner
External API
```

Tomorrow those providers may change. The first-party user experience SHALL not require the user to relearn or migrate to each provider's harness.

## 2.2 Mobile is first-class, not a reduced desktop

Mobile SHALL be treated as:

```text
1. Capture device
2. Natural-language command surface
3. Notification endpoint
4. Human-in-the-loop endpoint
5. Approval/review surface
6. Remote-control surface when safe
7. Result/publishing surface
```

It is not merely a smaller copy of the desktop UI.

## 2.3 Execution must outlive the initiating client

If the selected execution route is cloud-capable, the user SHALL be able to close the app or power off the initiating device without cancelling the work.

## 2.4 Harnesses are providers, not destinations

External harnesses MAY be directly selectable, but ordinary users SHOULD interact with SmartAIHub rather than being forced into provider-native UIs.

## 2.5 Human attention is a scarce resource

The platform SHOULD interrupt the user only for:

- missing material information;
- meaningful choice;
- required approval;
- authentication/human takeover;
- important failure/blocker;
- completed result requiring review;
- explicitly configured alerts.

---

# 3. Ownership Boundaries

| Concern | Canonical owner | Spec 225 role |
|---|---|---|
| Conversation / intent / goal / plan | Feature 196 | transport/present |
| Durable job/execution state | Feature 195 | project/present/control through canonical APIs |
| Runner/local execution | Feature 197 / 195 | surface availability and controls |
| MCP | Spec 199 | no duplicate gateway |
| External agents | Spec 200 | present normalized task state |
| A2A | Spec 206 | no protocol-specific UX requirement |
| Economic authorization | Spec 207 | render structured approvals only |
| Browser/Computer Use | Spec 208 | present monitor/takeover/control |
| Jev/System-One decision layer | Spec 213 | no direct ownership |
| Workflow authoring/runtime | Specs 209/214/215 | mobile can invoke/monitor; authoring may remain richer on desktop |
| Mini Apps/products | Specs 216/217 | render compatible surfaces where applicable |
| Autonomous development | Spec 224 | present run/attention/final review |
| Notifications / Attention inbox | **Spec 225** | **own** |
| Capture / Share Sheet | **Spec 225** | **own** |
| Cross-device access projection | **Spec 225** | **own** |
| Native mobile shell | **Spec 225** | **own** |

No spec SHALL create a competing source of truth merely to simplify a client.

---

# 4. SmartAIHub Agent Definition

The `SmartAIHub Agent` is the default first-party AI identity.

It owns no private execution engine. Conceptually:

```text
SmartAIHub Agent
 = First-party interaction identity
 + Feature 196 orchestration
 + shared capability discovery
 + Feature 195 execution visibility
 + Spec 225 cross-device control
```

It MAY present named specialist Agents below it, but the default product SHALL not require users to understand internal provider topology.

---

# 5. Universal Access Session

Spec 225 SHALL define an `AccessSession` used to synchronize client presentation without replacing semantic or execution state.

Minimum fields:

```text
access_session_id
user_id
tenant_id
conversation_id?
goal_run_id?
active_project_ref?
active_job_refs[]
active_attention_refs[]
client_instances[]
last_seen_event_cursor
created_at
last_active_at
```

`AccessSession` is a projection/correlation object. Conversation state remains Feature 196-owned and execution state remains Feature 195-owned.

---

# 6. Client Instance Model

Every active first-party client SHALL have a revocable `client_instance_id`.

Example metadata:

```text
client_instance_id
platform = web|pwa|ios|android|tablet|desktop
app_version
push_capability
notification_permission_state
biometric_capability
camera_capability
microphone_capability
share_extension_capability
last_seen_at
trust_state
```

Device/client identity MUST NOT be treated as user identity.

---

# 7. Intent Envelope Transport

Spec 225 SHALL accept multimodal user input and normalize transport into the Feature 196 `IntentEnvelope` contract.

Supported source classes SHOULD include:

```text
text
voice
camera_photo
camera_video
photo_library
video_library
document_scan
file
url
share_sheet
clipboard
current_app_share
```

Future surfaces MAY add sensors without changing Feature 196 semantics.

---

# 8. Capture Bundle

Multiple source items captured/shared together SHALL be represented as a `CaptureBundle`.

```text
capture_bundle_id
user_id
tenant_id
source_surface
items[]
created_at
upload_state
intent_draft?
```

Each durable item SHALL resolve to canonical SmartAIHub AssetRefs before dependent asynchronous jobs proceed.

---

# 9. Mobile Upload Architecture

Large photo/video uploads SHALL support:

- resumable or multipart upload;
- background transfer where platform APIs permit;
- integrity hash/check;
- retry without duplicate asset creation;
- network-change tolerance;
- Wi-Fi/cellular policy;
- explicit progress;
- server-side malware/content validation according to platform policy;
- conversion to canonical Library/Asset references.

Phone-local filesystem paths SHALL never be durable workflow references.

---

# 10. Share to SmartAIHub

Native mobile SHALL support Share Sheet / Share Extension where the OS permits.

Example flow:

```text
Photos / Browser / Files / another app
       ↓ Share
SmartAIHub
       ↓
mini composer
       ↓
"ทำวิดีโอรีวิวสินค้านี้สำหรับ TikTok"
       ↓
CaptureBundle + IntentEnvelope
       ↓
close app
       ↓
cloud execution continues
```

Share extensions SHOULD do the minimum work necessary to persist intent/assets, then hand durable processing to the backend.

---

# 11. Voice-First Command

Mobile and tablet SHOULD allow voice as a first-class command path.

Speech transcription MUST produce a reviewable text representation for consequential actions. Voice biometric identity MUST NOT be assumed from ordinary speech unless a dedicated verified identity system exists.

---

# 12. Notification Gateway

Spec 225 owns a provider-neutral Notification Gateway.

Logical channels:

```text
IN_APP
WEB_PUSH
IOS_PUSH
ANDROID_PUSH
EMAIL
TELEGRAM
LINE
SLACK
DISCORD
future channels
```

First-party mobile push SHOULD be preferred for first-party Agent attention when available. External messaging channels are satellite channels, not canonical state owners.

---

# 13. Notification Event vs Delivery Attempt

A canonical attention event and a delivery attempt are different objects.

```text
AttentionItem
   ├── DeliveryAttempt: iOS Push
   ├── DeliveryAttempt: Web Push
   └── DeliveryAttempt: Email
```

A push failure SHALL NOT change the underlying job/approval result.

---

# 14. Attention Inbox

SmartAIHub SHALL expose a global `Needs Attention` inbox across Web/Mobile/Tablet.

Attention item types SHALL include at least:

```text
INPUT_REQUIRED
CHOICE_REQUIRED
APPROVAL_REQUIRED
AUTH_HANDOFF_REQUIRED
EXECUTION_TARGET_OFFLINE
JOB_BLOCKED
JOB_FAILED
RESULT_READY
ARTIFACT_REVIEW_REQUIRED
PUBLISH_READY
PAYMENT_APPROVAL_REQUIRED
SECURITY_APPROVAL_REQUIRED
DEVELOPMENT_REVIEW_REQUIRED
```

Each AttentionItem references the canonical source object and its version.

---

# 15. Attention Item Schema

Minimum conceptual fields:

```text
attention_id
source_type
source_ref
source_version
user_id
tenant_id
priority
category
title
summary
requested_action
choices[]
preview_artifact_refs[]
risk_summary?
cost_summary?
expires_at?
status
created_at
resolved_at?
```

Attention state MUST reconcile with the source object before accepting an action.

---

# 16. Push Policy

Notification policy SHALL support:

- per-category preference;
- quiet hours;
- critical/urgent overrides where product policy permits;
- channel priority;
- deduplication;
- collapse/update of repeated progress notifications;
- locale/timezone formatting;
- privacy-safe lock-screen previews.

Sensitive content SHOULD default to a generic lock-screen message with deep link to authenticated details.

---

# 17. Deep Links

Every actionable notification SHOULD deep-link to the exact canonical object:

```text
smartaihub://attention/{attention_id}
smartaihub://jobs/{job_id}
smartaihub://artifacts/{artifact_id}
smartaihub://approvals/{approval_id}
smartaihub://browser-handoff/{handoff_id}
```

Equivalent HTTPS universal/app links SHOULD be supported.

Deep-link opening MUST re-fetch current state and reject stale actions.

---

# 18. Cross-Device Rehydration

A client resuming from background or opening on a second device SHALL:

1. authenticate;
2. fetch current AccessSession projection;
3. reconcile event cursor;
4. fetch authoritative referenced source objects;
5. update UI;
6. never replay side effects merely because local cache is stale.

---

# 19. Offline Client Mode

Mobile MAY support offline drafts, queued capture metadata and locally cached result previews.

It MUST NOT represent an offline local guess as authoritative job/approval state.

Queued commands SHALL include idempotency keys and revalidate policy/context on reconnect.

---

# 20. SmartAIHub Agent Home

Recommended mobile information architecture:

```text
Home
├── Ask SmartAIHub
├── Camera / Video / File / Voice
├── Needs Attention
├── Working
├── Recent Results
├── Agents
└── Routines
```

The home screen SHOULD answer quickly:

- What needs me now?
- What is still working?
- What finished?
- How do I give SmartAIHub something new to do?

---

# 21. Chat

Chat remains a first-class surface, but mobile SHALL support rich message attachments and typed cards for:

- jobs;
- approvals;
- choices;
- artifacts;
- browser handoffs;
- runtime availability;
- publish plans.

The product SHOULD avoid forcing every interaction into unstructured text.

---

# 22. Jobs View

Mobile Jobs SHALL expose:

```text
status
progress
current phase
execution target summary
started time
last activity
estimated/known cost where available
attention state
artifacts
cancel/pause/resume controls when supported
```

Internal logs MAY be condensed on mobile with a deep link to advanced Web diagnostics.

---

# 23. Execution Availability UX

Users SHALL be told whether a job can continue when their device is offline.

Examples:

```text
Cloud execution — You can close the app.

Office PC required — Waiting for SmartAIHub Runner on "Office PC".

Authenticated browser session required — Human sign-in needed.
```

The UI MAY offer eligible substitution choices through Feature 195 APIs.

---

# 24. Structured Approval UI

Approval cards SHALL present sufficient context, not only `Allow/Deny`.

Typical fields:

```text
requested action
resource/account/project
risk/effect
cost where material
diff/preview/evidence
scope
duration/expiry
choices
```

High-risk approvals MAY require biometric re-authentication or stronger account authentication according to policy.

---

# 25. Idempotent Approval

Every approval action SHALL include source version/fencing data. Two devices approving the same item simultaneously MUST resolve deterministically with one canonical decision.

Stale decisions return a resolved state such as:

```text
ALREADY_APPROVED
ALREADY_REJECTED
EXPIRED
SUPERSEDED
CANCELLED
```

---

# 26. Result Review

Artifacts SHALL be reviewable without requiring the execution device.

Mobile review MAY include:

- image/video/audio preview;
- document preview;
- generated caption/metadata;
- before/after comparison;
- version selector;
- comments/revision request;
- approve/reject.

Advanced editing remains delegated to domain-specific UIs where necessary.

---

# 27. Publishing Control

For content-publication workflows, Spec 225 SHALL support a structured `PublishPlan` projection.

```text
artifact_ref
caption
hashtags
targets[]
schedule?
account_refs[]
visibility/settings
approval_state
```

Publishing is a consequential side effect and SHALL obey shared permission/approval/audit policy.

---

# 28. Example — Product Review from Phone

```text
User photographs product
→ Share/Camera to SmartAIHub
→ "ทำวิดีโอรีวิว 30 วินาทีสำหรับ TikTok"
→ assets upload to canonical Library
→ Feature 196 plans
→ Skills/Agents generate script/media
→ Feature 195 executes in cloud/provider runtimes
→ artifact saved
→ RESULT_READY push
→ user previews
→ APPROVE
→ PUBLISH_READY
→ user chooses TikTok/account
→ explicit publish approval
→ publish action
→ result/audit returned to SmartAIHub
```

The phone does not need to render the video.

---

# 29. Example — Restaurant Review

```text
Photos + short videos + voice intent
→ CaptureBundle
→ SmartAIHub Agent
→ research/context as permitted
→ script + edit + captions
→ result notification
→ review/revision
→ publish after approval
```

---

# 30. Example — Dynamic Browser Research

```text
"Compare flight fares from Thailand to Los Angeles
for travel windows in the next half month."
        ↓
Feature 196
        ↓
structured travel/search capability if sufficient
        ↓ otherwise
Spec 208 Browser Operator
        ↓
Cloud Browser / eligible route
        ↓
normalize evidence/prices/timestamps
        ↓
result artifact
        ↓
mobile notification
```

Current/dynamic prices MUST carry retrieval time/source context and appropriate uncertainty.

---

# 31. Example — Marketplace Price Comparison

A user MAY photograph a product and request current marketplace comparisons. SmartAIHub MAY use image understanding + search + Browser Operator when marketplace structured APIs are unavailable/incomplete.

Search/research permission does not imply purchase permission.

---

# 32. Browser Operator Integration

Spec 225 SHALL NOT drive browsers itself.

It consumes Spec 208 states such as:

```text
RUNNING_AUTOMATION
WAITING_HUMAN_TAKEOVER
HUMAN_CONTROL
AGENT_REVERIFYING
COMPLETED
FAILED
```

And renders them appropriately.

---

# 33. Cloud Browser Human Handoff

When Spec 208 provides a Cloudflare Browser Run or other cloud-browser handoff, Spec 225 SHALL:

1. notify the authorized user;
2. authenticate before revealing the handoff;
3. obtain a short-lived controlled view reference;
4. render origin/instructions/risk;
5. allow bounded human interaction;
6. signal done/failed;
7. close/revoke the client handoff;
8. let Spec 208 re-observe and resume.

The notification payload itself SHALL NOT carry reusable browser credentials.

---

# 34. Local Computer Remote Assist

A local Runner/Computer remote-assist feature MAY be exposed through the same handoff UI only if Spec 208/Feature 197 provide a governed implementation.

Spec 225 SHALL NOT implement a shadow remote-desktop protocol.

---

# 35. Credential UX

The mobile client MAY help the user complete authentication, but SHOULD prefer:

```text
human enters credential directly into controlled target
```

over:

```text
credential → SmartAIHub prompt → LLM → website
```

Credential handles, passkeys, OAuth and OS-native secure authentication SHOULD be preferred where supported.

---

# 36. Biometric Confirmation

Native clients MAY use device biometrics as a local re-authentication factor for high-risk approvals. Biometric success confirms access to the authenticated SmartAIHub account/session; it does not replace server-side authorization or economic mandates.

---

# 37. PWA

SmartAIHub Web SHOULD be installable as a PWA where practical and support:

- responsive Agent home;
- Web Push where browser/platform support permits;
- deep links;
- offline drafts/cache;
- camera/file selection;
- attention inbox;
- job/result review.

PWA is a first-class client but not the endpoint of the mobile strategy.

---

# 38. Native Mobile

SmartAIHub SHOULD provide native iOS and Android clients when first-party OS integrations materially improve experience.

Native advantages include:

```text
Share Sheet / Share Extension
background uploads
push notifications
app badges
camera/video capture
photo/video picker
microphone
biometric re-authentication
universal/app links
native file/document scanners
OS quick actions
```

The native app SHALL use the same backend contracts as Web/PWA.

---

# 39. Tablet

Tablet SHALL be treated as an independent responsive class, not only stretched phone UI.

Tablet MAY support richer split-view experiences for:

- preview + comments;
- job + activity;
- browser live view + instructions;
- lightweight workflow editing;
- media review.

Full authoring remains capability-dependent rather than device-name dependent.

---

# 40. Desktop/Web Advanced Work

Complex authoring/debugging MAY remain Web/Desktop-first, including:

- full workflow graph editing;
- Skill engineering/debug;
- deep traces/logs;
- long code/diff review;
- full video timeline editing;
- MCP/provider administration.

Mobile SHALL provide a clear deep link or handoff without losing state.

---

# 41. Notification Provider Abstraction

The backend SHALL use a provider-neutral notification interface such as:

```text
notify(user, attention_item, policy)
```

with adapters for Web Push, APNs, FCM and external channels.

Provider tokens/endpoints SHALL be encrypted and revocable.

---

# 42. Web Push

Web Push MAY be used to reach PWA/browser users after the tab is closed, subject to browser permission and platform support.

Push subscription state belongs to Spec 225, not Feature 195 job records.

---

# 43. Native Push

Native clients SHOULD support APNs/FCM or equivalent platform push. Delivery receipts are operational signals, not proof the user saw or approved an action.

---

# 44. Notification Deduplication

The same attention item MAY fan out across multiple channels but SHALL maintain one logical resolution state.

Example:

```text
push iPhone
push iPad
web in-app
email fallback
```

Resolving from one device causes others to reconcile/close the item.

---

# 45. Progressive Escalation

Notification policy MAY escalate unresolved important attention:

```text
in-app
→ push
→ secondary channel
→ optional email
```

Escalation SHALL honor user/tenant policy and avoid notification storms.

---

# 46. Routines and Schedules

Mobile MAY create/manage simple routines using Feature 196/Workflow contracts.

Routine execution remains server-side. The phone is not a scheduler.

Examples:

- daily competitor check;
- weekly content draft;
- notify when a monitored condition occurs;
- scheduled report preparation.

---

# 47. Event-Driven Wakeups

A SmartAIHub job/routine MAY be triggered by:

```text
API request
mobile command
scheduled event
queue event
webhook
external callback
workflow event
approved connector event
```

Triggering a job does not require the user's device to be awake.

---

# 48. Cloudflare Platform Alignment

Cloudflare components MAY be used as implementation providers as follows:

```text
Workers       → API/edge ingress, lightweight orchestration adapters
Queues        → async dispatch transport
Workflows     → durable multi-step/wait/retry execution adapter
Containers    → on-demand fuller runtime
Browser Run   → cloud browser execution provider under Spec 208
R2            → object/artifact storage where canonical architecture assigns it
Durable Obj.  → scoped coordination/session provider where justified
```

None of these replaces canonical SmartAIHub ownership boundaries solely because it is convenient.

---

# 49. Cloudflare Workflows Wait/Resume

For flows that use Cloudflare Workflows, human approval/input MAY be represented as durable external events. The canonical SmartAIHub approval/attention object remains authoritative, and the Workflow resumes only after validating the received event against that canonical state.

---

# 50. Container Lifecycle

Mobile UI SHALL never expose container lifetime as if it were job lifetime.

A container may sleep while the job is waiting for a user or external API. Canonical state survives elsewhere.

---

# 51. Security Model

Spec 225 SHALL assume every client, attachment, webpage and external channel can supply untrusted data.

Core requirements:

- authenticated API access;
- tenant isolation;
- least-privilege tokens;
- device/client revocation;
- CSRF/replay protection as applicable;
- signed/nonce-bound deep links where needed;
- short-lived sensitive handoff tokens;
- no secrets in push payloads;
- no client-side authority over canonical job state;
- server-side validation of every consequential action.

---

# 52. Prompt Injection Boundary

Content captured from web pages, documents, screenshots, product pages or shared URLs SHALL be treated as untrusted content, not system instruction.

Mobile capture does not weaken the same prompt-injection defenses used by Web/Browser Operator paths.

---

# 53. Privacy and Permissions

Camera, microphone, photos, files, contacts and location are separate permission domains.

SmartAIHub SHALL request only permissions needed by the feature being used and SHOULD provide useful operation when optional permissions are denied.

Precise location SHALL NOT be collected merely because an image/video was captured on a phone.

---

# 54. Age-Appropriate Policy Compatibility

The platform SHOULD support policy profiles appropriate to different account types/ages/guardianship regimes without embedding one unrestricted capability set into every client.

Spec 225 owns compatible UI projection; Identity/Policy systems remain authoritative for entitlement/guardian constraints.

---

# 55. Economic Actions

Mobile convenience SHALL NOT weaken Spec 207 controls.

For purchases, payments, subscriptions, bookings or other economic commitments:

- intent/mandate/budget must be validated;
- preview and commit SHOULD be separated;
- final commit may require explicit approval/re-authentication;
- unknown finality must reconcile before retry.

---

# 56. Publishing Actions

External publishing SHALL require explicit account/permission context and policy. `Approve content` and `Publish content` SHOULD be separate semantic decisions unless user/tenant policy explicitly allows auto-publish.

---

# 57. Remote Browser Safety

Remote browser views SHALL show enough context to prevent the user from typing sensitive data into the wrong origin.

At minimum display:

```text
origin/domain
job/task identity
handoff instructions
control status
expiry
```

---

# 58. Session Recording Safety

If Browser Run or another provider records sessions, retention and access SHALL be explicit. Sensitive workflows MAY disable recording or apply redaction according to policy.

---

# 59. Data Model — Attention

Recommended tables/records (names illustrative):

```text
attention_items
notification_endpoints
notification_preferences
notification_deliveries
client_instances
access_sessions
capture_bundles
capture_bundle_items
handoff_presentations
```

These records SHALL reference canonical source IDs rather than copy entire job/approval state.

---

# 60. Attention State Machine

```text
OPEN
DELIVERING
DELIVERED
VIEWED
ACTION_IN_PROGRESS
RESOLVED
EXPIRED
SUPERSEDED
CANCELLED
```

`DELIVERED` does not mean `VIEWED`; `VIEWED` does not mean `APPROVED`.

---

# 61. Capture Bundle State

```text
DRAFT
UPLOADING
PARTIAL
READY
SUBMITTED
FAILED
CANCELLED
```

A bundle MAY be submitted only when required items are durably available or the intent explicitly tolerates missing items.

---

# 62. Handoff State

```text
REQUESTED
NOTIFIED
OPENED
HUMAN_CONTROL
DONE
FAILED
EXPIRED
REVOKED
```

Source Spec 208 state remains authoritative for actual browser/computer control.

---

# 63. Backend APIs

Illustrative APIs:

```text
POST /v1/access-sessions
GET  /v1/access-sessions/{id}

POST /v1/capture-bundles
POST /v1/capture-bundles/{id}/items
POST /v1/capture-bundles/{id}/submit

GET  /v1/attention
GET  /v1/attention/{id}
POST /v1/attention/{id}/act

POST /v1/notification-endpoints
DELETE /v1/notification-endpoints/{id}
PUT /v1/notification-preferences

GET  /v1/jobs/{id}/mobile-view
GET  /v1/artifacts/{id}/preview

POST /v1/handoffs/{id}/open
POST /v1/handoffs/{id}/complete
```

Actual implementation SHOULD reuse existing endpoints/contracts rather than duplicate them merely to match this illustrative list.

---

# 64. Realtime Sync

Clients MAY use WebSocket/SSE or another realtime transport, but disconnect MUST be survivable.

Every stream SHALL have sequence/cursor semantics or an equivalent reconciliation mechanism.

---

# 65. Client Event Model

Recommended first-party event classes:

```text
attention.created
attention.updated
attention.resolved
job.updated
artifact.created
approval.updated
handoff.updated
routine.updated
client_policy.updated
```

Events are hints to refetch authoritative objects where appropriate.

---

# 66. Optimistic UI

Clients MAY optimistically show a command as submitted but SHALL distinguish:

```text
LOCAL_DRAFT
SUBMITTING
ACCEPTED
REJECTED
```

An unacknowledged local command MUST NOT appear as an accepted durable job.

---

# 67. Accessibility

Mobile/Web clients SHALL support:

- scalable text;
- screen readers;
- semantic controls;
- sufficient touch targets;
- captions/transcripts for media where applicable;
- non-color-only state indicators;
- keyboard/switch access where platform supports it.

Agentic progress/attention changes SHOULD be announced accessibly without excessive interruption.

---

# 68. Localization

All notification titles/actions and mobile critical flows SHALL use localizable message keys rather than hard-coded language strings.

Server-generated semantic data SHOULD be separated from localized presentation text.

---

# 69. Cost Transparency

Before or during material-cost tasks, mobile SHALL be able to show:

```text
estimated cost/range if available
budget status
provider/route choice when user-controlled
additional-cost approval if required
```

Do not block low-cost routine work with unnecessary confirmations when user policy already permits it.

---

# 70. Route Transparency

Advanced users MAY inspect which execution route was selected, but ordinary mobile UX SHOULD focus on outcome/status rather than infrastructure names.

Example compact view:

```text
Running in cloud
Browser required
Your PC is not required
```

Advanced detail may reveal the exact provider/runtime.

---

# 71. Failure UX

Failures SHALL be actionable:

```text
what failed
whether work was partially completed
whether side effects may have occurred
whether retry is safe
what the user can do
whether another route is available
```

`Something went wrong` is insufficient for durable agent workflows.

---

# 72. Unknown Outcome

If a consequential action has unknown outcome, clients SHALL show `Reconciliation required` rather than offering blind retry.

---

# 73. Result Versioning

When a user requests revision from mobile, the new result SHALL be a version/derivation, not silent overwrite, unless the underlying domain explicitly defines mutable drafts.

---

# 74. Cross-Device Drafts

Chat/intent drafts MAY sync across devices when the user opts into server-backed drafts. Sensitive local drafts MAY remain local according to policy.

---

# 75. External Messaging Channels

Telegram/LINE/Slack/Discord MAY support:

```text
simple commands
status
notifications
quick approvals where policy permits
links back to SmartAIHub
```

They SHALL NOT be required to expose the full first-party Agent Control Surface.

---

# 76. No Channel Lock-In

A workflow initiated from Telegram MAY later be reviewed on iPad; one started on iPhone MAY be completed on Web. Channel origin SHALL not define canonical ownership.

---

# 77. Future Surfaces

The contract SHALL be extensible to future surfaces such as:

- wearables;
- automotive interfaces;
- voice-only devices;
- spatial computing;
- partner-branded first-party-compatible clients.

New surfaces MUST reuse Intent/Attention/Job/Artifact/Approval contracts rather than create new execution planes.

---

# 78. Product Surface Capability Manifest

Each client SHOULD publish a capability manifest such as:

```text
can_capture_photo
can_capture_video
can_record_voice
can_share_extension
can_receive_push
can_biometric_reauth
can_render_video_preview
can_render_diff
can_render_browser_live_view
can_author_workflow_full
```

The server may use this to choose presentation, not to weaken authorization.

---

# 79. Rich Review Escalation

If a phone cannot safely present evidence needed for a decision, the AttentionItem SHALL remain unresolved and offer:

```text
Open on Web/Desktop
```

The user SHALL not be pressured into an under-informed mobile approval.

---

# 80. SmartAIHub Mobile MVP

Minimum native/PWA product capability:

```text
Chat / Voice
Photo / Video / File input
Share to SmartAIHub
Jobs
Needs Attention
Push notifications
Structured approvals
Artifact preview
Library access
Routines basic control
Deep links
Account/security
```

---

# 81. Mobile Phase 2

```text
browser live view / human takeover
advanced artifact comparison
publishing center
tablet split views
biometric high-risk approval
background upload hardening
cross-device handoff polish
```

---

# 82. Not Required for Initial Mobile

Full parity with desktop authoring is NOT required for:

- workflow graph design;
- advanced Skill debugging;
- full video timeline editing;
- deep development diff tooling;
- administrative MCP/provider configuration.

The architecture must nevertheless permit these to be added later without backend redesign.

---

# 83. Observability

Spec 225 SHALL measure at least:

```text
attention creation→delivery latency
attention delivery→view latency
action completion latency
push success/failure by provider
cross-device resume success
capture upload success/retry
stale action rejection
notification dedupe effectiveness
job continuation after client disconnect
handoff success/failure
```

Avoid high-cardinality sensitive payloads in metrics.

---

# 84. SLO Targets

Production targets SHOULD be defined for:

- first-party command acknowledgement;
- attention fan-out latency;
- push submission latency;
- cross-device state rehydration;
- capture upload reliability;
- deep-link resolution;
- stale-action rejection correctness;
- notification gateway availability.

Correctness and security outrank low latency for approvals/handoffs.

---

# 85. Audit

Audit SHALL capture consequential cross-device actions with:

```text
actor user
client instance
attention/source object
source version
requested action
policy result
approval result
execution result
correlation IDs
```

Do not log full sensitive push payloads/secrets.

---

# 86. Abuse Controls

Capture/upload and agent-start endpoints SHALL enforce quotas, rate limits and abuse detection appropriate to tenant/plan without breaking legitimate burst capture from mobile.

---

# 87. Battery and Network Awareness

Native clients SHOULD avoid unnecessary foreground polling and heavy local processing. Prefer push + incremental sync.

Background upload SHOULD expose network policy where appropriate.

---

# 88. Client Update Compatibility

Backend contracts SHALL tolerate mixed client versions during mobile rollout.

Breaking changes require versioned schemas/endpoints or compatibility windows.

---

# 89. Feature Flags

New mobile/notification/takeover capabilities SHOULD support staged rollout by:

```text
tenant
user cohort
client version
platform
risk class
provider/runtime
```

---

# 90. Migration from Web-Only Assumptions

Phase 0 MUST inventory code that assumes:

- browser tab remains open;
- localStorage is execution truth;
- WebSocket connection implies job existence;
- approvals occur only in Web desktop UI;
- user is on same device as Runner;
- file path is locally accessible;
- result is rendered only in source feature page.

Each assumption SHALL be removed or explicitly classified as surface-specific.

---

# 91. Migration — Attention

Existing approval, permission, failed-job and completed-job banners SHOULD be mapped into AttentionItems incrementally.

Source systems remain authoritative during migration.

---

# 92. Migration — Notifications

Start with provider-neutral event/outbox contract, then add adapters:

```text
In-app
→ Web Push/PWA
→ native iOS/Android push
→ optional external channels
```

Do not build notification semantics separately inside every feature.

---

# 93. Migration — Mobile

Recommended sequence:

```text
1. shared Intent/Attention/Access contracts
2. responsive Web Agent home
3. PWA + Web Push
4. native shell + auth/deep links/push
5. camera/share/background upload
6. structured approvals/results
7. Browser Run live view/handoff
8. advanced tablet/mobile domain surfaces
```

Backend contracts for later phases SHALL be designed in phase 1.

---

# 94. Migration — First-Party Agent Naming

Existing Universal Assistant and Chat SHALL converge on `SmartAIHub Agent` as the user-facing first-party identity where product naming chooses to adopt it, without duplicating Feature 196 runtime.

Migration MAY be gradual at UI level.

---

# 95. Testing Matrix

At minimum test:

```text
Web → close tab → cloud job completes → mobile push → mobile review
Mobile → kill app → job continues → reopen → current state
Phone → approval → tablet immediately sees resolved
Two devices → simultaneous approval → exactly one decision
Capture 1GB+ media bundle → network switch → resume upload
Runner offline → attention → choose cloud fallback where eligible
Cloud Browser MFA → push → human takeover → return → resume
External agent → needs input → mobile response → task resumes
Publish approval → duplicate push tap → one publish only
Stale deep link → resolved/superseded state, no side effect
```

---

# 96. Security Test Matrix

- stolen/expired deep-link token;
- revoked client instance;
- cross-tenant attention ID guess;
- push payload leakage;
- replayed approval;
- browser takeover link forwarded to another user;
- session fixation;
- malicious shared URL prompt injection;
- capture file tampering after hash;
- background upload token expiry/refresh;
- lock-screen privacy;
- local notification forged by client cannot authorize server action.

---

# 97. Reliability Test Matrix

- push provider outage;
- notification delayed hours;
- client offline for days;
- duplicated provider delivery;
- out-of-order realtime events;
- backend restart;
- Workflow wait/restart;
- Browser Run session expires during handoff;
- Container sleeps during long external wait;
- Runner disconnect/reconnect;
- artifact preview CDN/R2 transient failure.

---

# 98. UX Acceptance Criteria

A new user on mobile SHOULD be able to:

1. ask SmartAIHub a question/task immediately;
2. attach/capture media without navigating a developer-oriented UI;
3. understand whether work continues after closing the app;
4. see all items that need attention in one place;
5. review a finished artifact;
6. approve/reject without finding the original feature page;
7. understand when a PC/Runner is required;
8. safely complete browser human takeover when offered.

---

# 99. Architecture Acceptance Criteria

- [ ] no mobile-specific job source of truth;
- [ ] no mobile-specific planner;
- [ ] no duplicate Browser/Computer engine;
- [ ] no external-agent provider becomes canonical user state owner;
- [ ] job can outlive client when execution route permits;
- [ ] attention state references canonical source/version;
- [ ] notification delivery is decoupled from source state;
- [ ] all consequential actions are stale/replay protected;
- [ ] capture produces canonical AssetRefs;
- [ ] cross-device state rehydrates authoritatively;
- [ ] remote takeover uses Spec 208 control fencing;
- [ ] future surface can join without execution redesign.

---

# 100. Performance Acceptance Criteria

Targets SHALL be measured and tuned in production, but the architecture MUST support:

- incremental/paginated attention/job lists;
- thumbnail/proxy media instead of downloading originals for every mobile view;
- push-driven refresh rather than constant polling;
- compressed event payloads;
- resumable large media uploads;
- CDN/object-store delivery for artifacts;
- lazy advanced logs/details.

---

# 101. Product Principle — Capture → Command → Execute → Notify → Review → Act

The canonical first-party lifecycle is:

```text
CAPTURE
   ↓
COMMAND
   ↓
EXECUTE
   ↓
NOTIFY
   ↓
REVIEW / INTERVENE
   ↓
APPROVE
   ↓
ACT / PUBLISH
```

Not every task uses every phase, but future SmartAIHub features SHOULD fit this model rather than invent unrelated client lifecycles.

---

# 102. Long-Term Architecture Invariant

> **A SmartAIHub user SHALL be able to interact with capable AI without owning, configuring or keeping awake the computer on which a particular harness normally runs, unless the requested task inherently depends on that specific local computer or its data/session.**

When local dependency exists, the platform SHALL expose it explicitly and provide alternative eligible routes when possible.

---

# 103. Non-Goals

Spec 225 does NOT:

- replace Feature 196 orchestration;
- replace Feature 195 jobs;
- replace Spec 208 Browser/Computer Use;
- create a new external-agent protocol;
- replace Spec 207 economic authorization;
- require all desktop authoring to fit on phones;
- require all work to run on Cloudflare;
- promise cloud continuation for tasks tied to a local Runner;
- treat notification delivery as approval;
- give mobile clients direct database authority;
- expose raw provider/harness credentials to clients.

---

# 104. Technical Baseline Verified 2026-09-21

The architecture intentionally uses provider abstractions, but the following current Cloudflare capabilities make the near-term implementation practical:

- Cloudflare Workflows supports durable multi-step execution, retries and waiting for external events/approvals.
- Cloudflare Containers can start on demand and sleep after inactivity; container disk must be treated as ephemeral unless explicitly persisted.
- Cloudflare Browser Run supports programmatic browser sessions and current features include Live View, Human in the Loop, session recording and session reuse/guardrail capabilities.
- Cloudflare Agents documentation demonstrates Web Push to reach users after a browser tab is closed.

Provider capabilities SHALL be feature-detected/version-gated rather than assumed permanently.

References:

- https://developers.cloudflare.com/workflows/
- https://developers.cloudflare.com/workflows/build/events-and-parameters/
- https://developers.cloudflare.com/containers/
- https://developers.cloudflare.com/containers/platform/pricing/
- https://developers.cloudflare.com/browser-run/
- https://developers.cloudflare.com/browser-run/features/live-view/
- https://developers.cloudflare.com/browser-run/features/human-in-the-loop/
- https://developers.cloudflare.com/agents/communication-channels/webhooks/push-notifications/

---

# 105. Implementation Phases

## Phase A — Contracts First

- IntentEnvelope alignment with Feature 196;
- AccessSession;
- ClientInstance;
- AttentionItem;
- Notification Gateway abstraction;
- CaptureBundle;
- deep-link contract;
- event cursors/idempotency;
- Spec 195/196/208/200/206/213/224 amendments.

## Phase B — Web/PWA Convergence

- responsive SmartAIHub Agent home;
- Needs Attention;
- unified Jobs/Results projection;
- PWA installation;
- Web Push;
- mobile-safe approvals;
- camera/file capture.

## Phase C — Native Mobile Core

- iOS/Android auth/session;
- native push;
- Share Sheet/Share Extension;
- camera/video/photo/file picker;
- background upload;
- deep links;
- biometric re-authentication.

## Phase D — Human Handoff

- Browser Run Live View integration through Spec 208;
- structured human handoff;
- secure short-lived handoff links;
- return-to-agent re-verification.

## Phase E — Publishing and Advanced Review

- social/content PublishPlan UI;
- advanced version comparison;
- tablet split view;
- richer domain-specific mobile cards.

---

# 106. Definition of Done

Spec 225 is production-complete when SmartAIHub can demonstrate, with auditable tests:

1. a user captures photo/video/voice on mobile and submits an intent;
2. assets become canonical SmartAIHub references;
3. Feature 196 plans without assuming the phone remains online;
4. Feature 195 executes durably through an eligible cloud/provider/Runner route;
5. closing the app does not stop cloud-capable work;
6. a required human decision creates one canonical AttentionItem;
7. push notification deep-links to current state;
8. approval from another device is idempotent and stale-safe;
9. a finished artifact is reviewable from mobile/tablet;
10. an approved publication/action proceeds through normal policy/audit;
11. a Browser Operator auth wall can hand off to a human and resume safely;
12. a local-only task clearly waits for its Runner instead of pretending to be cloud-capable;
13. external harnesses remain replaceable providers;
14. no second job/orchestrator/browser/approval truth has been created;
15. new future client surfaces can reuse the same contracts.

---

# 107. Final Architecture Invariant

> **SmartAIHub is the stable access and control plane; models, Skills, Agents, harnesses, browsers, cloud runtimes and local computers are replaceable execution resources behind it. The user's phone, tablet or computer is a control/capture surface unless the task explicitly needs that device as an execution target.**
---

# 108. Creator Mobile/Tablet Review and Capture Extension — Spec 225 R2 (2026-09-27)

**Status:** Proposed additive first-party UX/capture contract aligned to prospective Spec 251. Feature 196 remains the Agent owner, 216 owns Studio/Mini App productization, 240 owns generated/pinned UI presentation, 226 maps legacy deployed client surfaces to these contracts, and Spec 251 owns Creator revision state. No new mobile-specific WorkflowDefinition, approval database, or job-runner authority.

Creator surfaces SHALL support authenticated Project/media intake (camera, file picker, share sheet where platform permissions and user consent allow), resumable or truthfully restartable uploads, upload technical/right warnings, locale/voice/settings review, subtitle-segment correction, approved-media preview, revision compare, human approval, cost quote confirmation, queue/status/deep links and authorized exports. Mobile need not implement the full multi-track Desktop Video Editor; unsupported edit operations must hand off an exact authorized revision to Web/Desktop, never silently invent functionality.

Store only the minimum device-local data needed for explicit offline drafts. Raw private media in local cache needs documented retention, deletion and OS-backup behavior; a temporary signed URL is not a durable asset ID. Before staging/resuming a camera upload, recheck current user/project grants, usage quota, source purpose and parent revision; after reconnect, compare drafts against current domain revision and request explicit conflict resolution. Do not assume an OS background upload actually completed after app suspension. Deep-link/notification payloads contain opaque identifiers only; media bytes, subtitle text, voice reference, provider API keys and signed URL tokens are excluded.

The shared first-party agent may suggest a creator action while a user reviews another job, but only a trusted native host can present and invoke a current privileged `Apply`/approval binding. Chat, Mini Chat and visual editor all use the same server revision; a response from an old push notification must be rejected as stale if permission, revision, consent or price quote changed. Device accessibility tests include Thai/English cue editing, voice control labeling, keyboard/assistive technology, narrow-screen safe areas and low-bandwidth preview fallback.

| Case | Required result |
|---|---|
| C225-C01 | Phone upload interrupted before R2 commit | Resumable or safely restartable, no false completed badge |
| C225-C02 | Desktop editing while phone correcting same subtitle | Visible merge/rebase, no silent lost update |
| C225-C03 | Voice consent revoked after notification | Old approval/deep-link invalid and synthesis blocked |
| C225-C04 | Phone offline during long approved render | Canonical job continues; reconnect shows accurate status |
| C225-C05 | Mobile device cannot present full timeline | Scoped segment-correction and handoff remain accessible |
| C225-C06 | Project access revoked after preview | Media link and future actions fail on server |
| C225-C07 | Screen reader and Thai wrapping on subtitle card | Usable controls and faithful displayed content |
| C225-C08 | Pending upload cannot continue in background on given OS | Explicit pause/failure and safe restart, no silent data loss |

Release acceptance requires real device/OS/network matrix and server-side cross-device audit receipts. The new UI requirements do not certify an absent native client.
