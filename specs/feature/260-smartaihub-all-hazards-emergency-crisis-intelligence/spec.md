# Spec 260 --- SmartAIHub All-Hazards Emergency, Crisis Intelligence & Coordinated Response Platform

**Revision:** R1.0 --- 20-Pass Gap-Reviewed Implementation
Specification\
**Date:** 2026-09-30\
**Status:** Additive / Implementation-ready baseline\
**Primary principle:** *Tell once → shared operational context → minimum
necessary questions → coordinated assistance → verified closure*\
**Reference product:** All-Hazards Emergency Web/PWA + SmartAIHub
Chat/Task Control integration

------------------------------------------------------------------------

## 0. Executive Summary

Spec 260 defines a reusable SmartAIHub platform capability for
**all-hazards emergency intelligence, citizen reporting, crisis
communication, multi-agency response, mutual aid, resource coordination,
privacy-controlled data sharing, emergency-sponsored credits, and
closed-loop assistance**.

It MUST support natural hazards, earthquakes, floods, storms,
landslides, land subsidence/sinkholes, fires, structural collapse,
infrastructure failures, hazardous-material incidents, serious
accidents, medical emergencies, personal-safety/security incidents,
civil emergencies, mass gatherings, protests/crowd-safety incidents,
riots/violent disorder, and future hazard types without schema redesign.

The system is not merely a reporting map or emergency ticketing
application. It is a **shared operational state and coordination layer**
connecting:

-   citizens and bystanders;
-   nearby opt-in helpers;
-   verified volunteers and NGOs;
-   professional responders;
-   medical/rescue/security organizations;
-   command centers;
-   sensors, forecasts and authoritative data feeds;
-   SmartAIHub Chat/Task Control, Skills, Mini Apps and external
    integrations.

The system MUST remain useful under poor connectivity, low battery,
partial infrastructure failure, incomplete information, stale reports,
duplicate reports, multiple simultaneous responders, and zero user
credit.

------------------------------------------------------------------------

# 1. Architectural Boundaries

## 1.1 Additive-only integration

Spec 260 MUST NOT create a second authority for capabilities already
owned elsewhere.

It SHALL reuse existing SmartAIHub contracts for:

-   durable orchestration / Final Verify;
-   `worker_jobs`, lease/fencing/idempotency;
-   LLM/model routing;
-   alerts/notifications where already authoritative;
-   Chat/Task Control;
-   personal/project memory infrastructure where applicable;
-   Cloudflare/Sandbox execution;
-   permissions/approvals;
-   credits/wallet/accounting;
-   Skills/Capability Registry;
-   Mini Apps and Dynamic UI;
-   media/artifact storage;
-   tenant identity and isolation;
-   audit and observability.

Spec 260 introduces emergency-domain state, policies and projections,
but SHALL integrate with---not replace---those authorities.

## 1.2 Three shared domain modules

These are logical modules, not independent orchestration authorities:

1.  **Real-World Intelligence Module**
    -   geospatial observations;
    -   sensors;
    -   hazards;
    -   weather/environment feeds;
    -   evidence/media;
    -   forecasting/risk;
    -   accessibility graph.
2.  **Emergency Response Module**
    -   incidents;
    -   situations;
    -   needs;
    -   triage;
    -   tasks;
    -   multi-team response;
    -   resources;
    -   mutual aid;
    -   fulfillment;
    -   verification/reassessment.
3.  **Crisis Communication Module**
    -   Emergency Case Chat;
    -   contact graph;
    -   channel selection/failover;
    -   alerts;
    -   acknowledgement;
    -   consent-aware disclosure;
    -   low-power communications.

------------------------------------------------------------------------

# 2. Non-Negotiable Domain Invariants

1.  `EmergencyEvent != Incident != Situation != Need != ResponseTask`.
2.  One event MAY contain many incidents.
3.  One incident MAY contain many concurrent hazards and needs.
4.  One need MAY have multiple simultaneous tasks, teams and partial
    fulfillments.
5.  Claiming a task MUST NOT globally lock an incident or unrelated
    needs.
6.  Provider completion MUST NOT equal citizen-verified fulfillment.
7.  Unverified MUST NOT mean false.
8.  No response MUST NOT mean safe/resolved.
9.  Stale information MUST remain historically available but lose
    operational freshness.
10. Critical state changes MUST be append-audited and reconstructable.
11. AI MAY assist extraction, summarization, matching and anomaly
    detection; it MUST NOT be the sole opaque authority for life-safety
    triage, denial of emergency access, punitive fraud decisions, or
    high-risk dispatch.
12. Emergency access MUST NOT depend on user credit balance.
13. Exact victim/requester location MUST NOT be publicly exposed by
    default.
14. Sharing location with the application MUST NOT imply consent to
    community-helper disclosure.
15. Mutual-aid helpers MUST NOT be dispatched into hazards outside
    policy-authorized safety classes.
16. Raw conversation/evidence MUST be preserved independently of AI
    summaries.
17. A fact MUST carry source, observation time, freshness and
    confidence/provenance.
18. Teams MUST share case context so the citizen is not repeatedly
    re-interviewed.
19. Privacy disclosure MUST be purpose-bound and minimum-necessary.
20. System behavior MUST remain viable in low-bandwidth/low-battery
    conditions.

------------------------------------------------------------------------

# 3. All-Hazards Taxonomy

Taxonomy SHALL be versioned and extensible. At minimum:

### Natural

Flood, flash flood, earthquake, tsunami, storm, high wind, lightning,
landslide, land subsidence, sinkhole, wildfire, drought, extreme
temperature, volcanic and other natural hazards.

### Structural / Infrastructure

Building/bridge/road/dam collapse or failure, utility outage, power
failure, water failure, communications failure, gas leak, transport
disruption.

### Fire / Hazardous Materials

Residential/commercial/industrial fire, explosion,
chemical/biological/radiological/hazardous-material event.

### Medical / Public Health

Critical illness, serious injury, unconscious person, breathing/cardiac
emergency, mass-casualty event, epidemic/public-health emergency.

### Accident

Vehicle, multi-vehicle, rail, marine, aviation, industrial and workplace
accidents.

### Security / Personal Safety

Intrusion/burglary, assault, dangerous-person report, immediate personal
threat, missing-person incident and other safety incidents.

### Civil / Crowd Safety

Mass gathering, crowd congestion, road blockage, protest-related safety
conditions, riot/violent disorder, evacuation event.

### Unknown / Multi-hazard

Unknown, other and multi-hazard MUST always be representable.

Political affiliation, protest participation, ideology or identity MUST
NOT be inferred, profiled or used as a response eligibility attribute.

------------------------------------------------------------------------

# 4. Core Domain Model

Minimum entities:

``` text
EmergencyEvent
HazardOccurrence
Observation
Evidence
Situation
Incident
IncidentEpisode

PersonRef
HouseholdRef
LocationRef
ContactEndpoint

Need
NeedRevision
NeedFulfillment

ResponseTask
TaskOffer
TaskAssignment
TaskActivity
TaskDependency

ResponseOrganization
ResponseTeam
Responder
TeamCapability

Resource
ResourceInventory
ResourceCommitment
ResourceDelivery

Shelter
MedicalFacility
SafeZone
AccessibilityEdge

Conversation
Message
QuestionRecord
TemporalFact
CaseBrief

ConsentReceipt
DisclosureGrant
DisclosureRecord

VerificationAssessment
CorroborationLink
AbuseReview

SponsorPolicy
SponsorshipDecision
EmergencyCreditAllocation

Alert
AlertArea
Notification
Acknowledgement

AuditEvent
```

All external identifiers SHALL be tenant-scoped, non-sequential where
public enumeration creates risk, and traceable internally.

------------------------------------------------------------------------

# 5. Event → Incident → Need → Task Model

Example:

``` text
Earthquake Event
 ├─ Incident A: building collapse
 │   ├─ Need: trapped-person rescue
 │   ├─ Need: medical
 │   └─ Need: evacuation
 ├─ Incident B: fire
 └─ Incident C: road obstruction
```

A household flood incident may contain:

``` text
Need N1: Oxygen / medical       CRITICAL
Need N2: Evacuation             HIGH
Need N3: Drinking water         HIGH
Need N4: Food                   MEDIUM
Need N5: Utility restoration    MEDIUM
```

Food delivery MUST NOT close evacuation or medical needs.

------------------------------------------------------------------------

# 6. State Machines

## 6.1 Incident

`REPORTED → ASSESSING → ACTIVE → STABILIZING → RESOLVED → CLOSED`

Additional transitions: - `ANY → ESCALATED` -
`RESOLVED/CLOSED → REOPENED` - multiple `IncidentEpisode`s MAY preserve
recurrence.

## 6.2 Need

`UNVERIFIED → VERIFIED/OPEN → PARTIALLY_FULFILLED → FULFILLED → VERIFIED_FULFILLED`

Alternate: `OPEN → NO_LONGER_NEEDED | CANCELLED | DISPUTED`

## 6.3 Response Task

`AVAILABLE → OFFERED → ACCEPTED → EN_ROUTE → ON_SCENE → COMPLETED`

Alternate: `ANY → BLOCKED | FAILED | CANCELLED | TRANSFERRED`

## 6.4 Verification

`UNVERIFIED → CORROBORATED → VERIFIED`

Parallel alternatives: `DISPUTED`, `UNKNOWN`, `FALSE_CONFIRMED`

Only authorized policy/human review may produce punitive consequences
from `FALSE_CONFIRMED`.

------------------------------------------------------------------------

# 7. Dynamic Triage

Triage MUST be policy-driven, versioned and auditable.

Inputs MAY include:

-   immediate life threat;
-   medical urgency;
-   trapped/immobile persons;
-   vulnerability relevant to the response;
-   hazard progression;
-   isolation/accessibility;
-   number of affected persons;
-   resource availability;
-   responder ETA;
-   waiting time;
-   verified/corroborated observations;
-   explicit deterioration.

The engine MUST support re-triage whenever relevant facts change or
become stale.

Queue numbers MAY be shown for acknowledgement but MUST NOT imply strict
FIFO response.

Human operators MUST be able to override with reason and audit.

------------------------------------------------------------------------

# 8. Emergency Case Chat & Shared Operational Memory

## 8.1 Tell Once

Every incident SHALL have an **Emergency Case Memory** containing:

-   immutable/raw conversation timeline;
-   structured temporal facts;
-   questions already asked and answers;
-   evidence/media;
-   situation revisions;
-   needs/tasks;
-   response actions;
-   contact history;
-   current case brief;
-   verification history;
-   consent/disclosure history;
-   sponsorship/cost history;
-   audit history.

## 8.2 Duplicate Question Guard

Before asking a question:

``` text
Known answer?
→ Is it fresh enough?
→ Is provenance sufficient?
→ Is it accessible to this actor?
→ Is it operationally sufficient?
YES → suppress repeat question
NO  → ask for delta/update, not a blind repeat
```

Operators MAY override with a recorded reason.

## 8.3 Minimum Necessary Question Planner

Questions SHALL be prioritized by operational value and user burden.
Long mandatory questionnaires are prohibited for emergency intake.

## 8.4 Shared Case Brief

A newly joining authorized team MUST receive a concise brief showing:

-   current priority;
-   latest verified/fresh situation;
-   people affected;
-   critical risks;
-   open/fulfilled needs;
-   responders already engaged;
-   access constraints;
-   communication preference;
-   battery/network constraints if reported/available;
-   latest evidence;
-   what MUST NOT be asked again unless changed.

## 8.5 Internal vs Citizen Channels

Separate: - citizen-facing conversation; - responder/command
coordination; - system/AI events.

A communication coordinator SHALL prevent multiple teams from bombarding
the citizen.

------------------------------------------------------------------------

# 9. Low-Battery, Offline and Degraded Connectivity

Mandatory behaviors:

-   PWA/offline-capable intake;
-   local store-and-forward;
-   idempotent message retry;
-   critical text before media;
-   resumable/compressed media upload;
-   low-power UI;
-   no unnecessary animation/polling;
-   delta updates;
-   bundled questions;
-   server-side processing;
-   explicit "you do not need to keep this screen open" state after
    durable acknowledgement;
-   channel fallback where authorized.

Battery status MUST NOT be assumed available from all browsers/devices.
Manual reporting and capability detection are required.

------------------------------------------------------------------------

# 10. Geospatial & Location Model

Location types:

-   reporter current location;
-   incident location;
-   evidence capture location;
-   target/rescue location;
-   responder location;
-   destination/shelter;
-   approximate area/landmark.

Location acquisition MAY include: - device location permission; - map
pin; - place search; - saved location; - shared map location; - photo
metadata where lawful/available; - manual landmark/directions.

Confidence:
`EXACT | APPROXIMATE | AREA_ONLY | LANDMARK_BASED | INFERRED | UNKNOWN`

Capture location MUST NOT automatically overwrite incident location.

Sensitive exact coordinates SHALL be stored/access-controlled separately
from public/generalized map projections.

------------------------------------------------------------------------

# 11. Multimedia Evidence

Supported: - text; - photo; - video; - audio; - document; - sensor
observation; - live stream where supported.

Evidence metadata SHALL include: - capture/report/upload timestamps; -
source; - capture vs incident location; - integrity hash; - verification
state; - confidence; - sensitivity/visibility; - original asset and safe
derivatives.

Public derivatives SHOULD support privacy transformations such as
metadata stripping and redaction/blurring where applicable. Original
evidence access MUST be permissioned and retention-controlled.

AI-generated visual observations MUST be labeled as machine inference
and MUST NOT silently become verified operational facts.

------------------------------------------------------------------------

# 12. Multi-Team / Multi-Agency Coordination

`CLAIM != EXCLUSIVE LOCK`.

A need MAY have concurrent: - official team; - NGO; - volunteer team; -
nearby helper; - medical service; - logistics supplier.

Each assignment MUST declare scope and expected contribution.

Resource accounting SHALL support:

``` text
requested
committed
delivered
citizen/provider verified
remaining
```

A task may be completed while the parent need remains partially
fulfilled.

Takeover, joint assistance, transfer and standby MUST be representable
without losing history.

------------------------------------------------------------------------

# 13. Resource & Fulfillment Model

Resources MAY include: food, water, medicine, power, shelter, transport,
boats, ambulances, medical equipment, communications, fuel, rescue
equipment and tenant-defined resources.

Quantitative units MUST be explicit where practical.

Example:

``` text
Need: drinking water = 30 L
Delivered = 12 L
Committed = 10 L
Remaining uncommitted = 8 L
```

The system SHALL avoid unnecessary duplicate delivery while never using
a soft commitment to block urgent alternative help.

------------------------------------------------------------------------

# 14. Nearby Mutual Aid & Community Response

## 14.1 Separate opt-ins

`Location permission != Nearby helper opt-in`.

Users MAY opt into receiving nearby assistance opportunities and declare
capabilities/resources.

## 14.2 Assistance classes

At minimum:

**COMMUNITY_SAFE** - food/water/basic supplies; - power bank; -
information; - safe-zone transport where policy permits; - temporary
shelter.

**TRAINED_HELPER** - first aid and other capabilities requiring verified
training/policy.

**PROFESSIONAL_ONLY** - critical medical; - fire; - structural rescue; -
HazMat; - dangerous electrical work; - violent/security incidents; -
other tenant-configured hazards.

## 14.3 Safety Gate

Community physical-response invitations MUST be suppressed when
hazard/policy indicates unacceptable risk. Nearby users MAY instead
receive safety/avoidance warnings.

## 14.4 Privacy-preserving matching

Before acceptance: - show generalized distance/area and need category; -
do not expose exact victim location/contact.

After helper offer + requester/policy authorization: - disclose only
data necessary to perform the task; - exact-location grants MUST expire.

## 14.5 Relay Chat

Requester/helper communication SHOULD use platform relay chat before
exposing direct contact information.

## 14.6 Notification aggregation

Nearby alerts MUST be rate-limited/deduplicated/aggregated to avoid
notification storms.

------------------------------------------------------------------------

# 15. Contact Graph & Multi-Channel Communication

Contacts MAY include: - primary; - alternate; - emergency contact; -
household member; - neighbor; - on-site contact; - organization contact.

Endpoints MAY include: in-app, push, SMS, voice, email, LINE, WhatsApp,
Messenger and tenant-specific adapters.

Each endpoint MAY carry: - priority; - verification state; -
safe-to-call / safe-to-message flags; - preferred language; - last
successful contact; - last failure; - availability window.

Communication state: `QUEUED → SENT → DELIVERED → SEEN → ACKNOWLEDGED`
with `FAILED | EXPIRED`.

No-response is an operational condition, not evidence of safety.

Security/personal-threat workflows MUST support silent/no-call
communication preferences where technically possible.

------------------------------------------------------------------------

# 16. Alerts and Public Warning

The alert layer SHOULD support CAP-compatible concepts including: -
alert/update/cancel; - area targeting; - severity; - urgency; -
certainty; - multilingual content; - acknowledgement where applicable.

Warnings and incident-response communication are related but distinct.

------------------------------------------------------------------------

# 17. PDPA / Privacy / Consent / Disclosure

## 17.1 Minimum Necessary Disclosure

Access SHALL be purpose-bound.

Example: - food team: delivery location + quantity +
contact-on-arrival; - medical team: relevant medical subset where
authorized; - public map: generalized hazard information without victim
identity/exact private location.

## 17.2 Consent UX

Emergency consent SHALL be: - concise; - understandable; - contextual; -
separate from long privacy notices; - recorded with version and purpose.

Where consent is the selected disclosure basis, the UI MUST clearly
state what data categories are shared and with what recipient category.

The architecture MUST also support tenant/legal configuration for cases
where another lawful emergency basis applies; the implementation MUST
NOT falsely claim consent is the only possible basis.

## 17.3 Consent/Disclosure Records

`ConsentReceipt`: - subject; - incident; - purpose; - categories; -
recipient categories; - timestamp; - policy/version; - channel; -
withdrawal where applicable.

`DisclosureRecord`: - what was disclosed; - to whom; - purpose; -
timestamp; - authorization/legal-basis reference; - actor/system
decision.

## 17.4 Public Media

Public derivatives MUST minimize personal/sensitive information. Exact
private locations, medical details and vulnerable-person details MUST
NOT appear on public maps by default.

## 17.5 Retention

Retention SHALL be configurable by data class, tenant, incident state
and applicable legal policy. Expired helper-location grants and
unnecessary transient location traces SHALL not be retained indefinitely
merely because an incident once existed.

------------------------------------------------------------------------

# 18. Report Trust, Verification & Anti-Abuse

## 18.1 Report First, Risk-Based Verification

Emergency reporting MUST NOT require a long registration/KYC sequence
before intake.

Verification MAY use: - location/time consistency; - media/evidence; -
independent reports; - sensors; - authoritative feeds; - responder
confirmation; - contactability; - temporal consistency.

## 18.2 Evidence confidence, not permanent citizen scoring

The system SHALL score/describe confidence of observations/incidents,
not create a universal social/reputation score used to decide who
deserves help.

## 18.3 Progressive Friction

Normal: `report → accepted`

Suspicious: `report → lightweight verification`

Higher abuse risk: `additional challenge/evidence/operator review`

Automated abuse: rate limiting, quarantine and tenant-configured
controls.

Life-safety reports MAY proceed operationally while still unverified.

## 18.4 False-report safeguards

AI MUST NOT autonomously punish a user merely because a report appears
false. Confirmed malicious abuse requires explicit policy/evidence/human
or otherwise authorized review path.

------------------------------------------------------------------------

# 19. Emergency Credit Sponsorship

## 19.1 Emergency access invariant

A user's insufficient SmartAIHub credit MUST NOT block minimum emergency
intake, case communication or safety-critical continuation covered by
emergency policy.

## 19.2 Payer types

Examples: - USER; - TENANT; - SYSTEM_ADMIN; - SPONSOR; - GOVERNMENT; -
NGO; - DONOR_POOL; - FREE_EMERGENCY.

These map onto the existing authoritative credit/accounting system
rather than creating a second ledger authority.

## 19.3 Sponsorship Policy

Admin/tenant policy SHALL be configurable by: - purpose; - hazard; -
urgency; - capability; - geography; - time window; - incident; -
per-case limit; - per-user anti-abuse limit; - sponsor budget; -
model/provider cost class; - media limits.

Typical sponsored actions: - emergency intake; - emergency chat; -
critical location sharing; - safety-relevant photo/video; - situation
updates; - critical notifications; - public-benefit hazard observations.

Unrelated entertainment/general AI usage MUST NOT inherit emergency
sponsorship.

## 19.4 Degraded-cost path

When budget/model infrastructure is constrained:

`preferred model → cheaper model → deterministic skill → minimal emergency workflow`

Safety-critical intake MUST remain available according to platform
emergency policy.

## 19.5 Audit

Every sponsored usage MUST record: - incident; - capability; - actual
cost/credits; - payer; - policy/version; - decision reason; -
provider/model where applicable; - settlement/reconciliation
identifiers.

------------------------------------------------------------------------

# 20. Special Protocol Packs

All protocol packs use the common domain model but MAY impose stricter
policy.

Required initial packs:

1.  Flood / flash flood
2.  Earthquake
3.  Building/structural collapse
4.  Fire
5.  HazMat / gas / chemical
6.  Medical emergency
7.  Serious transport accident
8.  Mass-casualty incident
9.  Landslide / sinkhole / land subsidence
10. Utility failure
11. Personal safety / intrusion / violent threat
12. Civil/crowd safety
13. Evacuation
14. Search & rescue
15. Shelter / humanitarian supply

Security/violent incidents MUST disable unsafe community physical
dispatch by default.

Civil/protest modules MUST NOT perform political profiling, facial
identification of participants, or infer political affiliation.

------------------------------------------------------------------------

# 21. Person Safety / Accountability

For large events, permitted states MAY include:

`UNKNOWN | REPORTED_SAFE | LOCATED | NEEDS_ASSISTANCE | EVACUATED | TRANSFERRED | HOSPITALIZED`

Every status MUST carry provenance and verification time.

Public person directories MUST NOT expose sensitive status/location
without explicit policy/authorization.

A "I am safe" flow SHOULD be available without forcing unnecessary
public disclosure.

------------------------------------------------------------------------

# 22. Accessibility & Inclusive Emergency UX

Mandatory: - large touch targets; - high contrast; - screen-reader
semantics; - keyboard access where applicable; - multilingual
architecture; - simple language mode; - voice/audio input where
available; - text alternative to audio; - no color-only urgency
encoding; - low-literacy quick actions/icons plus text; - support for
caregiver/bystander reporting; - accessibility needs representable as
operational needs without unnecessary public disclosure.

------------------------------------------------------------------------

# 23. Public, Community, Responder and Command Projections

The same underlying incident MUST expose different projections.

### Public

Aggregated/generalized hazards, warnings, safe zones, road/access status
where appropriate.

### Community Helper

Generalized nearby need, safe assistance class, approximate distance
until authorized.

### Assigned Responder

Exact operational location/contact and need-specific information
permitted for the assignment.

### Command Center

Cross-incident operational view subject to organizational/tenant
permissions.

### Medical/Specialist

Need-specific sensitive subset.

Projection rules MUST be server-authoritative, not merely UI hiding.

------------------------------------------------------------------------

# 24. Command Center

Must support: - map + list; - active incidents by priority; - unassigned
critical needs; - waiting time; - responder availability; - response
ETA; - resource shortfalls; - stale/no-contact cases; - hazard
progression; - task conflicts; - blocked routes; -
shelters/facilities; - sponsorship budget health; - communications
delivery health; - audit/operator actions.

Operators MUST be able to inspect the reason/provenance behind triage
and matching decisions.

------------------------------------------------------------------------

# 25. Accessibility / Route Intelligence

`AccessibilityEdge` SHALL represent: - OPEN; - CLOSED; - RESTRICTED; -
BOAT_ONLY; - 4X4_ONLY; - PEDESTRIAN_ONLY; - UNKNOWN; - tenant-defined
modes.

Routes MAY combine authoritative, responder, citizen and sensor
observations with provenance/freshness.

An unverified route report MUST NOT silently become authoritative truth.

------------------------------------------------------------------------

# 26. Forecasting & Anticipatory Operations

Where data exists, the system MAY estimate: - hazard progression; -
likely incident volume; - evacuation demand; - shelter demand; -
water/food demand; - responder/resource shortfall.

Forecasts MUST include: - model/version; - horizon; - generated time; -
confidence/uncertainty; - input provenance; - backtest/validation
metadata where available.

LLMs MUST NOT fabricate numerical hazard forecasts.

------------------------------------------------------------------------

# 27. API / Skill-First Capability Surface

Illustrative skills/capabilities:

``` text
emergency.report
emergency.update
emergency.get_case
emergency.request_help

incident.create
incident.reassess
incident.reopen

need.add
need.update
need.fulfill

evidence.attach
evidence.verify

geo.pin
geo.nearby
geo.accessibility

triage.evaluate
dispatch.match
dispatch.offer

mutual_aid.match
mutual_aid.offer
mutual_aid.fulfill

communication.send
communication.acknowledge

consent.grant
consent.withdraw
disclosure.authorize

verification.assess
sponsorship.evaluate
```

Capabilities MUST be discoverable through the existing SmartAIHub
capability/skill mechanisms and permissioned by tenant/purpose.

------------------------------------------------------------------------

# 28. Reliability, Idempotency & Concurrency

Required: - idempotency keys for citizen reports/messages/updates; -
optimistic concurrency or equivalent revision protection; - durable task
state; - duplicate delivery protection; - assignment fencing where
required; - no lost updates during multi-team work; - event/audit
ordering metadata; - retry-safe external communication; - eventual
reconciliation of notification/credit/provider receipts; - explicit
conflict states rather than last-write-wins for critical facts.

------------------------------------------------------------------------

# 29. Security

Required controls: - tenant isolation; - least privilege; -
purpose-bound scopes; - short-lived responder/helper grants; -
server-side projection enforcement; - encrypted secrets; - protected
sensitive fields; - rate limiting; - anti-enumeration; - secure media
URLs; - malware/content scanning pipeline where appropriate; - audit
integrity; - operator session controls; - emergency break-glass access
with reason/audit/expiry; - protection against mass scraping of
incident/victim locations.

------------------------------------------------------------------------

# 30. Observability

Metrics SHALL include: - intake latency; - time to durable
acknowledgement; - time to triage; - time to first responder/helper
offer; - time to assignment; - ETA accuracy where measurable; -
fulfillment latency; - re-open/escalation rate; - stale-case rate; -
duplicate-question rate; - notification delivery/ack rate; -
low-bandwidth failure rate; - sponsored-credit burn; -
false-positive/false-negative verification review outcomes; -
privacy/disclosure exceptions; - community-helper safety incidents; -
provider reconciliation failures.

Do NOT optimize for closure speed alone; premature/false closure is a
safety defect.

------------------------------------------------------------------------

# 31. Failure Modes and Required Degradation

The implementation SHALL define behavior for:

-   PostgreSQL unavailable;
-   Redis/ephemeral cache unavailable;
-   R2/media unavailable;
-   map provider unavailable;
-   LLM provider unavailable;
-   notification provider unavailable;
-   geolocation unavailable/denied;
-   citizen offline;
-   responder offline;
-   sponsor budget exhausted;
-   external authoritative feed stale;
-   conflicting reports;
-   duplicate incidents;
-   malicious report flood;
-   organization integration outage.

Minimal emergency intake and durable recovery paths MUST be prioritized
over optional AI enrichment.

------------------------------------------------------------------------

# 32. Lifecycle

``` text
PREPARE
→ DETECT
→ WARN
→ REPORT
→ VERIFY
→ TRIAGE
→ RESPOND
→ RESCUE / ASSIST
→ FULFILL
→ VERIFY OUTCOME
→ RECOVER
→ FOLLOW-UP
→ AFTER-ACTION REVIEW
→ LEARN / PREPARE
```

Historical data MAY support training, preparedness and aggregate
analytics only under appropriate retention/privacy controls.

------------------------------------------------------------------------

# 33. UI Surfaces

Minimum:

### Citizen

-   Quick SOS
-   Chat/voice intake
-   Report situation
-   Map pin/location
-   Media upload
-   Current case
-   needs/status/ETA
-   consent controls
-   "situation changed"
-   "I am safe"
-   low-power mode

### Helper

-   opt-in availability
-   capability/resource declaration
-   nearby safe assistance opportunities
-   relay chat
-   fulfillment confirmation

### Responder

-   assignment inbox
-   map/routes
-   case brief
-   evidence
-   tasks
-   team coordination
-   status updates
-   handoff

### Command Center

-   operational map
-   priority queues
-   resource/team view
-   stale/no-contact
-   alerting
-   sponsorship/communications health
-   audit/exceptions

All must share the same authoritative incident/need/task state.

------------------------------------------------------------------------

# 34. Data Minimization & Derived Views

The platform SHALL distinguish: - raw restricted evidence; - operational
derived facts; - public-safe derivatives; - analytics aggregates.

Analytics datasets SHOULD be de-identified/aggregated where individual
identification is unnecessary.

Deleting/redacting personal data according to policy MUST NOT silently
corrupt required financial/audit integrity; references should be
minimized/pseudonymized where retention duties differ.

------------------------------------------------------------------------

# 35. Initial Implementation Slices

## M0 --- Contracts & safety kernel

Domain schema, state machines, audit, permissions, projections,
consent/disclosure, idempotency.

## M1 --- Citizen intake

Quick SOS, chat, location, evidence, Case Memory, duplicate-question
guard, low-power/offline.

## M2 --- Incident/Need/Task operations

Triage, multi-team assignments, partial fulfillment, timeline, command
center basics.

## M3 --- Communication

Multi-channel gateway integration, acknowledgements, failover,
CAP-compatible alerts.

## M4 --- Mutual aid

Opt-in, capability declaration, safety gate, privacy-preserving
proximity, relay chat.

## M5 --- Sponsorship

Emergency credit policy, payer selection, budget controls,
reconciliation/audit.

## M6 --- Verification

Corroboration, clustering/deduplication, evidence confidence,
progressive anti-abuse.

## M7 --- Protocol packs

Flood, earthquake, collapse, medical, accident, fire, HazMat, personal
safety, civil/crowd safety.

## M8 --- Intelligence

Sensor/feed integration, route/access graph, forecast/risk and
anticipatory resource demand.

No milestone may introduce a duplicate orchestration, credit, memory,
notification or permission authority.

------------------------------------------------------------------------

# 36. Acceptance Scenarios

## A. Zero-credit life-safety case

User with zero credits reports trapped patient. Intake/chat/location
remain available; sponsorship policy charges authorized payer; ledger
records policy and cost.

## B. Tell-once handoff

Citizen states "elderly oxygen-dependent person, power off." Team B
joins later and sees it in case brief; duplicate-question guard
suppresses re-interview unless freshness requires an update.

## C. Partial help

Neighbor supplies water while rescue team handles evacuation. Water
becomes partially/fully fulfilled; evacuation remains open.

## D. Stale status

Water depth was 30 cm 90 minutes ago. UI labels it stale; triage does
not treat it as current fact; citizen/responder is asked only for delta
if necessary.

## E. Unverified critical report

Building collapse report lacks corroboration. Operator is alerted and
verification starts, but critical handling is not blocked.

## F. Security incident

Home intrusion report triggers authorized response and silent-safe
communication; nearby civilians are not invited to physically intervene;
public exact location is hidden.

## G. Protest/crowd incident

System publishes neutral area safety/access information and
medical/resource coordination without profiling participants or
political affiliation.

## H. Low battery

Citizen reports 5% battery. System enters low-power communication, stops
unnecessary polling/media requests, persists case, and tells citizen the
screen need not remain open.

## I. No response

Citizen becomes unreachable. Case is not auto-resolved; contact strategy
and operational reassessment proceed.

## J. Consent-controlled helper

Nearby helper sees approximate need only; exact pin is disclosed only
after applicable authorization and expires after task completion.

## K. Media privacy

Original video remains restricted; public derivative removes sensitive
metadata and applies configured privacy processing.

## L. Concurrent teams

Two organizations work different needs simultaneously; neither locks the
entire incident.

## M. Duplicate reports

Many bystanders report the same crash. System clusters observations into
candidate incident while preserving each source and separate individual
assistance requests.

## N. Provider completion dispute

Responder marks delivery complete; citizen reports partial receipt. Need
becomes disputed/partial, not silently closed.

## O. Infrastructure degradation

LLM provider fails. Deterministic emergency intake and task state remain
operational.

------------------------------------------------------------------------

# 37. Definition of Done

Spec 260 is not production-ready until:

-   core state machines have deterministic tests;
-   multi-team race tests pass;
-   idempotent intake/message tests pass;
-   zero-credit emergency tests pass;
-   sponsor reconciliation tests pass;
-   projection/privacy tests prove exact location and sensitive data
    cannot leak to unauthorized/public clients;
-   consent/disclosure audit tests pass;
-   duplicate-question guard tests pass;
-   stale-fact/re-triage tests pass;
-   offline/store-forward tests pass;
-   notification retry/ack tests pass;
-   mutual-aid safety gates pass;
-   violent/security incident community-dispatch negative tests pass;
-   false-report AI auto-punishment negative tests pass;
-   no-response auto-close negative tests pass;
-   provider-completed ≠ citizen-verified tests pass;
-   tenant isolation tests pass;
-   disaster recovery/restart tests pass;
-   load tests cover surge/emergency traffic;
-   accessibility tests pass;
-   operational runbooks exist.

------------------------------------------------------------------------

# 38. Twenty-Pass Gap Review

The following review was applied cumulatively; each discovered gap has
already been incorporated into this revision.

### Pass 1 --- Domain decomposition

**Gap:** A single emergency ticket would conflate hazard, household
situation, needs and response work.\
**Fix:** Event → Incident → Situation → Need → Task separation.

### Pass 2 --- Multi-team concurrency

**Gap:** Single `assigned_team_id` would block parallel help.\
**Fix:** scoped multi-assignment, partial fulfillment,
transfer/joint-response semantics.

### Pass 3 --- Staleness / temporal truth

**Gap:** Old facts could be treated as current.\
**Fix:** observation time, freshness, provenance, supersession and
re-triage.

### Pass 4 --- Emergency conversation continuity

**Gap:** New teams could repeatedly interview the citizen.\
**Fix:** Emergency Case Memory, Case Brief and duplicate-question guard.

### Pass 5 --- Battery/connectivity

**Gap:** Chat-centric UX assumed stable power/network.\
**Fix:** low-power mode, store-and-forward, delta updates,
critical-text-first.

### Pass 6 --- All-hazards extensibility

**Gap:** Flood-oriented schema would not cover earthquake, collapse,
medical or security cases.\
**Fix:** versioned taxonomy, multi-hazard relationships and protocol
packs.

### Pass 7 --- Location semantics

**Gap:** Device/camera location could be mistaken for incident
location.\
**Fix:** separate reporter/capture/incident/target/destination
locations + confidence.

### Pass 8 --- Multimedia evidence

**Gap:** Generic attachments lack provenance/privacy controls.\
**Fix:** first-class Evidence, hashes, sensitivity, original/derivative
separation.

### Pass 9 --- Privacy / PDPA

**Gap:** "case access" was too broad.\
**Fix:** purpose-bound server projections, minimum disclosure,
consent/disclosure records, retention.

### Pass 10 --- Emergency credits

**Gap:** normal credit exhaustion could block urgent use.\
**Fix:** sponsorship policy, payer selection, degraded-cost path and
audit/reconciliation.

### Pass 11 --- Fake/abusive reports

**Gap:** either no verification or excessive KYC would be unsafe.\
**Fix:** report-first risk-based verification, progressive friction,
evidence confidence and human review.

### Pass 12 --- Mutual aid

**Gap:** proximity broadcasting could leak vulnerable household
locations or attract helpers into danger.\
**Fix:** explicit helper opt-in, safety classes, progressive disclosure,
expiring grants and relay chat.

### Pass 13 --- Security / violent incidents

**Gap:** generic mutual aid could invite civilians into violent
situations.\
**Fix:** hard professional-only/community-block policy with
safety-warning-only path.

### Pass 14 --- Civil/protest safety

**Gap:** incident tooling could be repurposed for political profiling.\
**Fix:** area/hazard/resource focus; prohibition on
political-affiliation inference and participant profiling.

### Pass 15 --- Contact resilience

**Gap:** one phone number/channel is fragile.\
**Fix:** contact graph, safe-to-call/message flags, multi-channel state,
acknowledgement and failover.

### Pass 16 --- Closure correctness

**Gap:** provider "done" could prematurely close a need/case.\
**Fix:** provider completion separated from verified fulfillment,
disputes/reopen supported.

### Pass 17 --- Surge / duplicate events

**Gap:** one major event may produce thousands of duplicate observations
and notification storms.\
**Fix:** clustering, preservation of source reports, aggregation/rate
limiting and scalable event→incident hierarchy.

### Pass 18 --- Accessibility / vulnerable users

**Gap:** fast UX could still exclude users with disability, low literacy
or language barriers.\
**Fix:** inclusive UI requirements, caregiver/bystander flows,
voice/text alternatives and non-color-only status.

### Pass 19 --- Failure/recovery

**Gap:** AI/map/media/provider outages could stop the system.\
**Fix:** explicit degradation matrix, deterministic minimum intake,
retry/reconciliation and durable recovery.

### Pass 20 --- Authority duplication / cross-spec consistency

**Gap:** emergency-specific implementation could accidentally create new
orchestration, billing, memory, notification or permission authorities.\
**Fix:** additive boundary, reuse of existing SmartAIHub control-plane
authorities, domain-specific Case Memory/projections only, and explicit
"no duplicate authority" milestone rule.

------------------------------------------------------------------------

# 39. Additional Post-20 Review Hardening

A final consistency sweep found and incorporated these cross-cutting
safeguards:

-   break-glass access requires reason/audit/expiry;
-   public/community/responder projections must be enforced server-side;
-   sponsor rules cannot accidentally sponsor unrelated AI usage;
-   helper exact-location access expires after operational need;
-   analytics must not retain unnecessary identifiable location trails;
-   route intelligence retains provenance and freshness;
-   battery APIs are treated as optional capabilities, never assumed;
-   critical facts use explicit conflict handling rather than silent
    last-write-wins;
-   closure speed is not a success metric when it incentivizes false
    closure;
-   user-facing queue number is informational, not strict FIFO priority;
-   forecast outputs require uncertainty/provenance and cannot be
    invented by an LLM;
-   no-response and unverified states have explicit negative tests.

------------------------------------------------------------------------

# 40. Recommended Product Positioning

**SmartAIHub All-Hazards Emergency & Crisis Intelligence Platform**

Reference deployment:

``` text
Citizen / Bystander
       ↕
Chat / Quick SOS / Voice / Map / Media
       ↓
Emergency Case Memory
       ↓
Trust + Privacy + Sponsorship Policies
       ↓
Incident / Need / Task Runtime
       ↓
┌──────────────┬──────────────┬───────────────┐
│ Nearby Help  │ NGO/Volunteer│ Professional  │
└──────────────┴──────────────┴───────────────┘
       ↓
Shared Operational Picture
       ↓
Command Center / Alerts / Follow-up
```

The platform SHOULD be deployable as a tenant-branded Mini
App/custom-domain product while continuing to use SmartAIHub shared
infrastructure.

------------------------------------------------------------------------

# 41. Final Implementation Rule

When implementation choices conflict, prioritize in this order:

1.  immediate human safety;
2.  preservation of emergency access;
3.  privacy and minimum necessary disclosure;
4.  correctness and provenance of operational state;
5.  responder coordination and avoidance of duplicated burden on the
    citizen;
6.  resilience under low power/connectivity;
7.  auditable cost/sponsorship control;
8.  automation/AI convenience.

# 42. Second 20-Pass Production Gap Review (Passes 21--40)

This review is additional to Passes 1--20. All fixes below are normative
parts of R1.1.

## Pass 21 --- Incident Merge / Split / Linkage

**Gap:** Duplicate detection was defined, but canonical merge/split
semantics were not sufficiently explicit.

**Required fix:** - `Incident` MUST support `DUPLICATE_OF`,
`RELATED_TO`, `MERGED_INTO`, `SPLIT_FROM`. - Merge MUST be
non-destructive: source incident IDs, messages, evidence, tasks, consent
records and audit history remain addressable. - Conflicting facts MUST
NOT be silently collapsed. - Split MUST support moving/linking selected
observations, needs and tasks while preserving original provenance. -
External/public case references SHOULD redirect safely to the canonical
case without leaking restricted identifiers.

## Pass 22 --- Identity / Household / Person Deduplication

**Gap:** The same person/household may be reported by relatives,
neighbors and responders under different names.

**Required fix:** - Person/household resolution MUST be
probabilistic/assisted, never destructive automatic identity fusion for
sensitive cases. - Maintain `possible_same_subject` links until
verified. - Phone, name, location or face similarity alone MUST NOT
authorize identity merge. - Merge/unmerge operations require audit and
appropriate authority. - Assistance eligibility MUST NOT depend on
successful identity resolution.

## Pass 23 --- Responder / Helper Credential Lifecycle

**Gap:** Capability verification could become stale after onboarding.

**Required fix:** - Credential records require issuer, scope,
verification time, expiry and revocation state. - High-risk assignment
MUST check authorization at offer/accept and again before sensitive
disclosure where material. - Expired/revoked credentials MUST remove
future access promptly. - Previously disclosed data cannot be
technically "unseen"; subsequent access must be revoked and recorded. -
Self-declared capability MUST be visibly distinct from verified
professional qualification.

## Pass 24 --- Consent Withdrawal During Active Response

**Gap:** Granting consent was covered, but withdrawal during an active
case was underspecified.

**Required fix:** - Withdrawal MUST stop future consent-based
disclosures as soon as operationally feasible. - It MUST NOT
falsify/delete immutable disclosure history. - Tasks dependent on
withdrawn information MUST be reassessed. - If another configured lawful
emergency basis applies, the system MUST record that basis explicitly
rather than pretending consent remains active. - Citizen UI MUST
distinguish "stop future sharing" from deletion/retention requests.

## Pass 25 --- Evidence Chain of Custody

**Gap:** Evidence hashes alone do not provide a complete evidentiary
history.

**Required fix:** - Record acquisition source, original hash,
transformations, derivative hashes, uploader/actor, timestamps and
access/export events. - Preserve relationship `DERIVED_FROM`. - AI
enhancement/redaction/transcoding MUST never overwrite original
evidence. - Clock uncertainty/timezone/source-clock metadata SHOULD be
retained where relevant. - Export packages MUST include provenance
manifest where authorized.

## Pass 26 --- Alert Update / Cancellation / Supersession

**Gap:** CAP-compatible alert concepts existed but stale alerts could
remain operationally visible.

**Required fix:** - Alerts require stable identifiers, version/revision,
effective/expiry times and supersession links. - `UPDATE`, `CANCEL`,
`EXPIRE` MUST propagate to supported channels. - UI MUST visually
distinguish active vs superseded/cancelled alerts. - Cached/offline
clients MUST reconcile alert revisions when connectivity returns. -
Cancellation MUST NOT erase historical issuance.

## Pass 27 --- Mass-Casualty / Regional Surge Mode

**Gap:** Per-case workflows may overload operators and infrastructure
during very large disasters.

**Required fix:** - Introduce `NORMAL`, `SURGE`, `REGIONAL_DISASTER`
operating modes. - Preserve a protected life-safety/P1 processing
lane. - Support area-level aggregation, batch acknowledgement, incident
clustering and simplified low-cost intake. - Apply backpressure to
non-critical enrichment/media processing before emergency text/state. -
Command Center MUST show queue depth, processing delay and degraded
features. - Mode transitions require audit and may be
policy/authorized-operator controlled.

## Pass 28 --- Fairness Under Resource Scarcity

**Gap:** Dynamic triage could accidentally encode unfair allocation.

**Required fix:** - Scarcity rules MUST be explicit, versioned and
reviewable. - Protected/sensitive characteristics MUST NOT be inferred
for allocation unless legally/operationally required and appropriately
governed. - Resource-allocation rationale must be inspectable. - Waiting
time may influence priority but MUST NOT override immediate life threat
by simple FIFO. - Manual override requires reason/audit. - Periodic
fairness review SHOULD analyze systematic allocation disparities without
turning citizen data into a social score.

## Pass 29 --- Cross-Tenant / Cross-Organization Mutual Aid

**Gap:** A disaster may cross administrative/tenant boundaries.

**Required fix:** - Default isolation remains tenant-scoped. -
Cross-tenant sharing requires an explicit federation/mutual-aid
agreement and scoped data-sharing policy. - Share a minimum operational
projection rather than raw tenant case records. - Preserve originating
tenant/data controller and disclosure provenance. - Task ownership,
billing/sponsorship and completion receipts must identify organizational
boundaries. - No tenant gains global browse access merely by
participating in one mutual-aid task.

## Pass 30 --- Data Residency / Jurisdiction Policy

**Gap:** Multi-country/custom-domain deployments may have different
storage/disclosure constraints.

**Required fix:** - Tenant policy MUST support data residency/region,
retention class and allowed external processors. - Cross-region
export/disclosure MUST be policy checked and audited. - Protocol packs
MUST NOT hard-code Thai legal assumptions into global runtime. -
Country/tenant adapters may supply emergency numbers, authority types,
language, lawful-basis policy and retention schedules.

## Pass 31 --- Emergency Control-Plane Degradation

**Gap:** "PostgreSQL unavailable" was listed, but authority behavior
during partial control-plane loss needed stronger guarantees.

**Required fix:** - Define read-only/degraded/offline-safe states
explicitly. - Never create two competing authoritative incident
timelines during partition. - Edge/offline submissions use globally
unique idempotency/event IDs and reconcile into the authoritative
store. - Dangerous side effects that cannot be safely fenced MUST fail
closed; life-safety intake SHOULD fail open into a durable local/edge
queue where possible. - Recovery requires deterministic
replay/reconciliation and conflict surfacing.

## Pass 32 --- Time / Clock / Ordering Uncertainty

**Gap:** Emergency devices and offline clients may have incorrect
clocks.

**Required fix:** - Store client-observed time separately from
server-received time. - Preserve timezone/offset when available. - Do
not use client timestamp alone for security/audit ordering. - Offline
events require causal/revision metadata where practical. - UI SHOULD
indicate approximate/uncertain chronology rather than fabricate exact
order.

## Pass 33 --- Language / Translation Integrity

**Gap:** Multilingual support was required but translation provenance
was not.

**Required fix:** - Preserve original-language message. - Store
translation as derivative with engine/model/version and time. - Critical
translated instructions SHOULD support human/approved-template fallback
where required by tenant policy. - UI MUST allow responder to inspect
original text. - Translation uncertainty MUST NOT silently alter medical
quantities, addresses or critical numeric facts.

## Pass 34 --- Accessibility When User Cannot Operate the Device

**Gap:** Caregiver/bystander support did not fully cover incapacitated
users.

**Required fix:** - Support `REPORTING_FOR_SELF`, `REPORTING_FOR_OTHER`,
`BYSTANDER`, `AUTHORIZED_CAREGIVER`. - Do not assume reporter ==
affected person. - Consent/contact rules must identify whose data is
being shared and who provided information. - Lack of affected-person
interaction MUST NOT block urgent intake. - Subsequent identity/consent
reconciliation can occur when safe/appropriate.

## Pass 35 --- Child / Dependent / Vulnerable-Person Handling

**Gap:** Household modeling did not define safeguards for dependents.

**Required fix:** - Minimize exposure of child/dependent identity and
exact location. - Public/community projections MUST not expose
vulnerability details beyond what is necessary for the assigned
assistance. - Guardian/caregiver relationships are claims requiring
provenance, not automatically trusted facts. - Safeguarding escalation
policy must be tenant-configurable.

## Pass 36 --- Responder Safety / Mayday

**Gap:** System focused primarily on citizen safety, not responders
entering hazards.

**Required fix:** - Response teams need check-in/check-out, last-known
operational status and emergency/mayday event support where deployed. -
Hazard changes may trigger responder safety warnings and task
withdrawal. - Command Center must distinguish citizen incidents from
responder emergencies while allowing linkage. - Mutual aid MUST never
create an incentive to continue an unsafe task merely because it was
accepted.

## Pass 37 --- Shelter / Facility Capacity Consistency

**Gap:** Shelter and medical facilities existed as entities but capacity
races were underspecified.

**Required fix:** - Track reported capacity, committed/reserved
capacity, admitted/received and unavailable capacity. - Reservations
require expiry/reconciliation. - Stale facility capacity MUST be
labeled. - Dispatch MUST NOT promise a bed/shelter place based solely on
stale cached availability. - Facility rejection/closure triggers
re-routing without closing the underlying need.

## Pass 38 --- Donation / Resource Integrity

**Gap:** Sponsor/resource concepts could enable phantom inventory or
double commitment.

**Required fix:** - Separate pledged, verified-available, reserved,
dispatched, delivered and accepted resource states. - Do not treat a
donation pledge as inventory. - Inventory reservations require
idempotency and expiry. - Resource provenance and custody SHOULD be
recorded for critical supplies. - Financial sponsorship and
physical-resource donation are separate accounting domains.

## Pass 39 --- Public Information / Rumor Control

**Gap:** Aggregated public reports could spread unverified claims.

**Required fix:** - Public projections must show verification/freshness
labels. - Official alerts, verified operational facts, community
observations and AI estimates MUST be visually distinguishable. -
Correction/supersession must propagate. - The system MUST NOT generate
authoritative-sounding public statements from unverified AI inference. -
Public sharing endpoints SHOULD use canonical incident/alert revisions
rather than screenshots as the sole truth source.

## Pass 40 --- End-to-End Closure / After-Action Integrity

**Gap:** Lifecycle included After-Action Review but lacked closure
prerequisites.

**Required fix:** - Closing an incident requires explicit policy checks
for unresolved critical needs, active tasks, disputed fulfillment,
missing handoffs and pending safety alerts. - Forced closure requires
authorized reason. - Reopen MUST preserve previous closure reason and
episode boundary. - After-action review SHALL consume immutable/audited
history and MAY produce lessons/actions without rewriting original
operational records. - Lessons learned MAY feed protocol/policy
revisions only through controlled versioning.

------------------------------------------------------------------------

# 43. R1.1 New Normative Data Extensions

Add or extend:

``` text
IncidentLink
IncidentMergeRecord
IncidentSplitRecord

SubjectResolutionCandidate
CredentialRecord
CredentialRevocation

EvidenceTransformation
EvidenceAccessRecord

AlertRevision
OperatingModeTransition

FederationAgreement
CrossTenantDisclosure

JurisdictionPolicy
ResidencyPolicy

OfflineEventEnvelope
ReconciliationConflict

TranslationDerivative

ReporterRelationship

ResponderSafetyEvent

FacilityCapacitySnapshot
FacilityCapacityCommitment

ResourcePledge
ResourceCustodyEvent

ClosureAssessment
AfterActionReview
```

------------------------------------------------------------------------

# 44. R1.1 Additional Negative Tests

Implementation MUST include tests proving:

1.  merging incidents does not destroy source evidence/history;
2.  splitting an incident does not silently duplicate fulfillment;
3.  identity candidate matching does not auto-merge solely by
    name/phone/location similarity;
4.  revoked responder credentials prevent subsequent sensitive access;
5.  consent withdrawal blocks subsequent consent-based disclosure;
6.  consent withdrawal does not erase prior disclosure audit;
7.  evidence redaction/transcoding cannot overwrite the original;
8.  cancelled alerts do not remain active after client reconciliation;
9.  surge mode does not starve protected life-safety intake;
10. cross-tenant helper access cannot browse unrelated tenant incidents;
11. regional policy prevents prohibited cross-region disclosure;
12. partition recovery cannot create two canonical task completions
    without conflict detection;
13. incorrect client clocks cannot rewrite audit ordering;
14. translation cannot replace original message;
15. bystander reporting does not falsely set reporter as patient;
16. public/community projection does not expose child/vulnerable-person
    details unnecessarily;
17. responder mayday remains actionable even when parent citizen
    incident is closed;
18. stale shelter capacity cannot be presented as guaranteed
    availability;
19. resource pledge cannot satisfy/close a physical resource need;
20. unverified AI-generated public information cannot be labeled as
    official;
21. unresolved critical need blocks normal incident closure;
22. forced closure/reopen remains reconstructable.

------------------------------------------------------------------------

# 45. R1.1 Production Readiness Gates

In addition to Section 37, production promotion requires:

-   incident merge/split race tests;
-   credential revocation propagation tests;
-   evidence chain-of-custody tests;
-   alert update/cancel offline-reconciliation tests;
-   surge/load tests with protected P1 lane;
-   federation isolation tests;
-   residency/jurisdiction policy tests;
-   partition/reconciliation tests;
-   multilingual critical-field integrity tests;
-   dependent/vulnerable-person projection tests;
-   responder-safety workflow tests;
-   facility capacity concurrency tests;
-   resource pledge/reservation integrity tests;
-   closure-gate tests.

No "production ready" status may be inferred from happy-path UI
completion alone.

------------------------------------------------------------------------

# 46. Cumulative Review Status

R1.1 contains **40 cumulative structured review passes**:

-   Passes 1--20: domain, temporal state, chat continuity, all-hazards,
    PDPA, sponsorship, anti-abuse, mutual aid, failure/recovery and
    authority boundaries.
-   Passes 21--40: merge/split, subject resolution, credential
    lifecycle, consent withdrawal, evidence custody, alert lifecycle,
    surge mode, scarcity fairness, federation, jurisdiction/residency,
    partition recovery, time uncertainty, translation integrity,
    incapacitated/dependent users, responder safety, facility/resource
    consistency, rumor control and closure integrity.

All gaps identified in these passes have been incorporated into
normative sections or explicit R1.1 extensions/tests.

# 47. Final Implementation Rule --- R1.1

When implementation choices conflict, prioritize:

1.  immediate human safety;
2.  preservation of emergency access;
3.  responder/helper safety;
4.  privacy, purpose limitation and minimum necessary disclosure;
5.  correctness, provenance and reconstructability of operational state;
6.  coordination without repeated burden on affected persons;
7.  resilience under low power, connectivity loss and regional surge;
8.  fair/auditable scarce-resource allocation;
9.  auditable sponsorship/cost control;
10. AI/automation convenience.

**End of Spec 260 R1.1 --- 40-Pass Cumulative Review**

# 48. Map & Geospatial Experience --- Normative Architecture

The map is a primary operational interface, not a decorative
visualization. It MUST answer, with minimum interaction:

1.  What is happening around me / around this selected place?
2.  How current is each piece of information?
3.  What type and severity of event is it?
4.  Is the event verified, corroborated, unverified, disputed, resolved
    or stale?
5.  Can I safely approach / pass through the area?
6.  Is there media/evidence I am authorized to see?
7.  What changed recently?
8.  What assistance/resources/responders are nearby, subject to
    permission?
9.  What should I avoid or pay attention to?
10. What information is uncertain?

The map MUST never imply that absence of a marker means absence of
danger.

------------------------------------------------------------------------

# 49. Cloudflare-First Map Technology Decision

## 49.1 Client renderer

Preferred baseline: **MapLibre GL JS** for web/PWA, with compatible
native renderer considered for future native clients.

Reasons: - vector-tile rendering; - style/layer system; -
point/line/polygon support; - clustering; - markers/popups; - no
requirement to bind the emergency domain to one commercial map vendor.

MapLibre is the renderer, not the authoritative data source.

## 49.2 Basemap provider abstraction

Create `BasemapProviderAdapter`.

Supported modes: - external vector/raster tile provider; -
tenant-provided tiles; - self/managed tile service; - cached/offline
emergency tile package where legally/licensably permitted.

Provider choice MUST be configuration, not embedded in incident logic.

External tile/API use SHALL be minimized and MUST respect provider
licensing, attribution, cache and redistribution terms.

## 49.3 SmartAIHub geo data plane

``` text
Browser / PWA
    │
    ▼
Cloudflare Worker — Geo/Map API
    │
    ├── CDN / Worker caching
    ├── KV normalized feed cache
    ├── R2 map/media derivatives
    │
    ▼
PostgreSQL + PostGIS
    │
    ├── incidents
    ├── observations
    ├── hazards
    ├── geometry
    ├── access graph
    └── spatial indexes
```

PostgreSQL/PostGIS remains authoritative for operational geometry/state.

Cloudflare Vectorize MUST NOT be used as the authoritative geospatial
query engine.

------------------------------------------------------------------------

# 50. External API Minimization

Third-party APIs SHALL be called only when SmartAIHub does not already
possess sufficiently fresh normalized data.

Mandatory pattern:

``` text
Client
  ↓
SmartAIHub Geo API
  ↓
Fresh internal projection?
  ├─ YES → return
  └─ NO
      ↓
   Shared cache?
      ├─ YES → return + freshness
      └─ NO
          ↓
      External adapter
          ↓
      normalize
          ↓
      cache / persist as policy allows
          ↓
      return
```

Clients SHOULD NOT call weather, flood, traffic, incident or
media-source APIs directly when the same source is integrated
server-side.

Benefits: - API keys remain server-side; - centralized rate limits; -
deduplication; - source attribution; - normalized schema; - predictable
privacy; - reduced external cost; - outage resilience.

------------------------------------------------------------------------

# 51. Map Cache Architecture

No cache layer is authoritative.

## L0 --- Client memory

Current viewport features, style assets and already-loaded thumbnails.

## L1 --- Service Worker / PWA cache

Basemap/style/static icons and permitted recent map responses for
degraded/offline use.

## L2 --- Cloudflare Edge/CDN

High-read public-safe map responses, tiles, style assets and public-safe
media derivatives.

## L3 --- Workers KV

Normalized external feed/API cache requiring cross-region reuse.

Examples: - weather observations; - public hazard feeds; - non-critical
upstream map metadata; - provider lookup results.

## L4 --- R2

Media originals/derivatives, generated thumbnails, permitted static
geospatial artifacts and tile packages.

## Source of Truth

PostgreSQL/PostGIS and authoritative emergency domain state.

### Cache rules

Every cacheable operational object MUST define: - source; -
fetched/generated time; - source observation time; - TTL; -
stale-while-revalidate policy where safe; - maximum stale allowance; -
invalidation/revision key; - sensitivity class.

Critical incident state MUST NOT be served indefinitely from stale
cache.

------------------------------------------------------------------------

# 52. Freshness Classes and Stale-Data UX

Every map feature SHALL expose a freshness projection.

Suggested configurable defaults:

``` text
LIVE / VERY_FRESH
FRESH
AGING
STALE
VERY_STALE
UNKNOWN
```

Thresholds MUST be data-type specific. A road closure and a river gauge
do not necessarily share the same freshness threshold.

Marker/layer UI MUST convey stale state using more than color alone,
e.g.: - clock/age badge; - outline/pattern; - opacity treatment; -
explicit "updated 2h ago" text; - warning in detail sheet.

Examples:

``` text
Flood report
Updated 8 min ago
CORROBORATED

Road closure
Updated 3h 42m ago
⚠ STALE — confirm before relying on this route
```

Stale information remains visible when operationally useful, but MUST
NOT visually appear equally current.

------------------------------------------------------------------------

# 53. Map Feature Projection Contract

Map endpoints SHOULD return compact feature projections rather than full
incident objects.

Illustrative shape:

``` text
MapFeature {
  feature_id
  feature_type
  geometry
  hazard_type
  severity
  operational_status
  verification_status
  freshness_class
  observed_at
  updated_at

  icon_key
  display_priority

  title_safe
  summary_safe

  media_preview_count
  thumbnail_ref?

  cluster_key?
  source_class
  source_attribution

  detail_ref
  permissions_hint
  revision
}
```

Sensitive details MUST be fetched only after authorization from a
separate detail endpoint.

------------------------------------------------------------------------

# 54. Marker / Symbol Design System

Markers MUST encode multiple dimensions without relying only on color.

Primary shape/icon = event type.

Examples: - flood: water/wave; - fire: flame; - earthquake: seismic; -
building collapse: structure; - landslide: slope; - medical: medical
cross/EMS; - serious crash: vehicle collision; - power outage: power; -
road blocked: barrier; - shelter: shelter; - hospital: hospital; -
responder/resource: role-specific operational icon; - security hazard:
neutral safety/security symbol; - unknown: explicit unknown marker.

Secondary visual state: - severity; - verification; - operational
status; - stale state.

Example composition:

``` text
[hazard icon]
outer ring = severity
small badge = verification/status
clock badge = stale
```

Icons MUST remain distinguishable in grayscale/color-vision deficiency
modes.

Do not use politically identifying symbols for protest/civil-safety
incidents.

------------------------------------------------------------------------

# 55. Marker Interaction

Single tap/click MUST open a **Map Preview Card / Bottom Sheet**, not
immediately navigate away.

Preview MUST show, subject to permission: - type; - severity; - current
status; - last update age; - verification level; - short summary; -
approximate/generalized location as appropriate; - thumbnail carousel if
safe/available; - number of reports/evidence; - source attribution; -
primary action.

Actions MAY include: - `View details`; - `View timeline`; -
`View media`; - `Navigate / route`; - `Report an update`; -
`I can help`; - `Request help`; - `Avoid area`; -
`Share public-safe link`.

Mobile SHOULD use a bottom sheet so map context remains visible.

------------------------------------------------------------------------

# 56. Event Detail From Map

`View details` opens a permission-aware incident/hazard detail surface
containing:

-   current situation;
-   timeline;
-   latest observations;
-   verification/freshness;
-   media;
-   needs/resources where permitted;
-   access/route status;
-   warnings;
-   related incidents;
-   source/provenance;
-   last update;
-   follow/notification control.

The user MUST be able to return to the exact previous map
viewport/filter state.

------------------------------------------------------------------------

# 57. Media on Map

If an integrated source provides legally usable images/media, the source
adapter MAY normalize them into `Evidence` or `ExternalMediaReference`.

Requirements: - retain source attribution; - record media timestamp if
available; - do not imply media is current if timestamp is unknown; -
distinguish externally hosted vs SmartAIHub-stored derivative; - obey
licensing/redistribution restrictions; - avoid hotlinking where
prohibited; - privacy/sensitivity policy still applies.

For SmartAIHub media: - original stays restricted according to evidence
policy; - thumbnail/preview derivative generated separately; -
public-safe derivative may be cached aggressively; - sensitive
derivatives require authorization and short-lived access.

------------------------------------------------------------------------

# 58. R2 Media Delivery

Production public-safe map media SHOULD use R2 behind a controlled
custom domain and Cloudflare caching.

Do not use `r2.dev` as the production delivery path.

Sensitive media SHOULD use: - Worker authorization and/or time-limited
signed access; - non-enumerable object keys; - short-lived grants; -
appropriate cache-control so private responses cannot leak into shared
public cache.

Cache invalidation/purge MUST be triggered when a public derivative is
withdrawn or replaced where required.

------------------------------------------------------------------------

# 59. Viewport / Nearby Query Model

Map clients MUST query by viewport or proximity, not download every
incident.

Endpoints/contracts:

``` text
GET /geo/features?bbox=...
GET /geo/nearby?lat=...&lng=...&radius=...
GET /geo/feature/{id}
GET /geo/feature/{id}/media
GET /geo/changes?cursor=...
```

Actual API naming may follow repository conventions.

Server SHALL support: - bounding box; - center/radius; - zoom; - time
window; - hazard filters; - status; - severity; - freshness; -
verification; - layer selection.

Spatial indexes are mandatory.

------------------------------------------------------------------------

# 60. Level-of-Detail (LOD) Strategy

At low zoom: - aggregated areas; - clusters; - hazard polygons; -
counts/trends.

Mid zoom: - clusters + significant individual incidents.

High zoom: - authorized individual incident markers; - road/access
detail; - resources/facilities.

Do not render thousands of DOM markers.

Prefer vector/source layers and clustering.

Cluster click: - zoom/expand; - preview category counts; - never imply
one cluster = one incident.

Critical incidents MAY remain visible above clustering based on
policy/display priority.

------------------------------------------------------------------------

# 61. "What Is Around Me?" Nearby Situational Awareness

A primary map control SHALL provide:

**Around me / Around this point**

It returns a prioritized situational summary such as:

``` text
Within 2 km

⚠ 2 active flood areas
⚠ 1 blocked road
● 4 citizen reports
✓ 1 open shelter
✓ 1 medical facility
● 2 response teams (if permitted)

Most recent update: 4 min ago
Oldest visible critical source: 47 min ago
```

Radius SHOULD adapt to zoom/context and allow explicit user selection.

The system MUST support selecting a point other than current location,
important when planning for family/home or when location permission is
unavailable.

------------------------------------------------------------------------

# 62. Nearby Layers

User-controllable layers SHOULD include:

### Hazard

-   flood;
-   earthquake impact;
-   fire;
-   landslide/subsidence;
-   structural;
-   weather;
-   other hazards.

### Reports

-   citizen observations;
-   verified incidents;
-   external/public sources.

### Access

-   road closure;
-   flood depth/access;
-   bridge/road damage;
-   safe/unknown route segments.

### Assistance

-   shelters;
-   hospitals;
-   safe zones;
-   supply points;
-   responders/resources where disclosure permits.

### Alerts

-   warning area;
-   evacuation area;
-   exclusion/avoid area.

Layer visibility MUST be remembered per user/device where appropriate,
but emergency critical layers MAY be forced visible with explicit
explanation.

------------------------------------------------------------------------

# 63. Map Time Controls

The map SHOULD support:

-   `Now`;
-   recent history (e.g. 1h / 6h / 24h);
-   timeline scrub where data supports it;
-   "what changed" mode.

Historical view MUST be unmistakably labeled to avoid confusing old
conditions with current conditions.

When returning to `Now`, current freshness rules resume.

------------------------------------------------------------------------

# 64. Change Detection

Map features SHALL carry revision/version.

Clients SHOULD use delta/change feeds instead of full reload when
possible.

Examples: - new incident; - severity changed; - verified; - resolved; -
road reopened; - alert cancelled; - stale threshold crossed.

Critical changes MAY animate/pulse briefly but continuous distracting
animation is prohibited.

------------------------------------------------------------------------

# 65. Source & Provenance UI

Every externally sourced operational feature MUST provide source
information.

Preview: `Source: BMA sensor • observed 07:12`

Detail: - source organization; - source URL/reference when permitted; -
fetched time; - observation time; - transformation/normalization; -
verification status.

If multiple sources corroborate one feature, UI MAY show:
`Confirmed by 3 independent sources`.

------------------------------------------------------------------------

# 66. Search

Map search SHOULD support: - address/place; - landmark; - incident ID; -
shelter/facility; - administrative area; - coordinates; -
natural-language area query through SmartAIHub intent layer.

Geocoding MUST use provider abstraction and cache only as permitted by
provider terms.

Sensitive incident names/people MUST NOT become general public search
indexes.

------------------------------------------------------------------------

# 67. User-Reported Pin Workflow

When reporting:

1.  use current location if explicitly permitted;
2.  show pin on map;
3.  user can drag/correct;
4.  ask for landmark/directions when useful;
5.  store confidence and acquisition method;
6.  never silently replace user-confirmed incident pin with EXIF/device
    inference.

UI:

``` text
ตำแหน่งเหตุการณ์
[map + pin]

[ใช้ตำแหน่งปัจจุบัน]
[เลื่อนหมุด]
[พิมพ์สถานที่/จุดสังเกต]

ความแม่นยำ: ประมาณ ±...
```

Exact accuracy SHOULD be shown only when technically meaningful.

------------------------------------------------------------------------

# 68. Privacy Geometry

Server MUST support geometry generalization.

Examples: - exact point for assigned responder; - jittered/generalized
point for community preview; - grid/area polygon for public view; - no
geometry for highly sensitive cases.

Do NOT implement privacy by client-side marker hiding.

Nearby matching can be server-side without disclosing both parties'
exact coordinates.

------------------------------------------------------------------------

# 69. Routing and Navigation

The emergency map MUST distinguish: - normal navigation route; -
operationally known blocked/restricted edges; - unknown/unverified
access.

A commercial routing API MAY be used through an adapter when needed, but
route requests SHOULD be minimized/cached where allowed.

SmartAIHub MUST overlay its operational accessibility information even
when the underlying route provider is unaware of disaster closures.

Never present a route as "safe" solely because a standard navigation API
returned it.

------------------------------------------------------------------------

# 70. Offline / Degraded Map

When connectivity degrades: - preserve last loaded map/critical features
where possible; - show `OFFLINE / LAST UPDATED ...`; - queue user
reports/updates; - disable actions requiring unavailable live
verification with clear explanation; - never present cached state as
live.

Emergency deployments MAY pre-cache designated area tiles/styles if
licensing and storage policy allow.

------------------------------------------------------------------------

# 71. Map Accessibility

Required: - list view equivalent to map content; - keyboard/focusable
controls; - screen-reader labels; - icons + text; - non-color-only
states; - large mobile touch targets; - reduced-motion support; -
bottom-sheet controls usable one-handed; - "nearby incidents" sortable
list for users who cannot interpret a visual map.

Map-only access is prohibited for critical information.

------------------------------------------------------------------------

# 72. Map Performance Budgets

Targets MUST be measured on representative mobile devices and degraded
networks.

Implementation SHOULD define budgets for: - initial interactive map; -
viewport query payload; - thumbnail size; - marker/feature count; -
cluster rendering; - memory; - background refresh; - external API calls.

Viewport requests MUST be cancellable/debounced during pan/zoom.

Prefetch only likely adjacent data; do not aggressively fetch all
surrounding media.

Images load thumbnail-first and on demand.

------------------------------------------------------------------------

# 73. External Feed Adapter Contract

Each external map/data source adapter MUST declare:

``` text
source_id
license / attribution requirements
endpoint
authentication
rate_limit
fetch cadence
cache permission
cache TTL
observation timestamp mapping
geometry mapping
media policy
failure behavior
normalization version
```

Adapters MUST support circuit breaking/backoff.

One failing source MUST NOT block the map.

------------------------------------------------------------------------

# 74. API Budget / Cost Guard

Per external provider, track: - calls; - cache hit rate; - rate-limit
remaining where available; - errors; - latency; - cost estimate; - stale
fallback usage.

Admin can configure: - daily/monthly API budget; - hard/soft
threshold; - minimum fetch interval; - emergency override; - fallback
source.

Critical safety feeds SHOULD degrade to cached/stale-with-warning rather
than silently disappear when safe to do so.

------------------------------------------------------------------------

# 75. Map Observability

Metrics:

``` text
map.viewport.requests
map.viewport.p95_latency
map.features.returned
map.cluster.count
map.cache.hit.edge
map.cache.hit.kv
map.external_api.calls
map.external_api.errors
map.stale.features
map.media.thumbnail.hit
map.marker.detail.opens
map.nearby.searches
map.offline.sessions
map.location.permission.denied
map.privacy_projection.denials
```

Monitor source freshness separately from API availability.

An API can be healthy while its underlying data is stale.

------------------------------------------------------------------------

# 76. Map Security

Required: - bbox/radius limits; - pagination/feature caps; -
anti-scraping; - authorization before sensitive feature detail; -
signed/authorized sensitive media; - no sequential incident
enumeration; - server-side layer projection; - query rate limits; -
prevent arbitrary high-volume coordinate scanning; - audit
high-sensitivity map access.

------------------------------------------------------------------------

# 77. Map-Specific Acceptance Scenarios

### MAP-A --- Nearby awareness

User opens map and immediately sees prioritized current
incidents/hazards around selected/current area plus freshness.

### MAP-B --- Stale marker

Road closure older than policy threshold remains visible with explicit
stale warning and is not presented as confirmed current closure.

### MAP-C --- Event preview

Tap marker → bottom sheet shows status, age, verification, source and
safe thumbnail without leaving map.

### MAP-D --- Full detail

Tap "View details" → detail view; back returns to identical
viewport/layers/filter state.

### MAP-E --- External image

Source feed includes image with permitted reuse; adapter records
attribution/time and map shows thumbnail with freshness/source context.

### MAP-F --- Sensitive media

Unauthorized community/public user cannot fetch original victim media
even if object key is guessed.

### MAP-G --- Dense disaster

10,000+ features in region are clustered/LOD-served rather than rendered
as DOM markers.

### MAP-H --- Critical visibility

Critical P1 incident remains visible according to policy even inside
dense cluster context.

### MAP-I --- Privacy projection

Same incident returns exact pin to assigned responder, generalized area
to community candidate and public aggregate to anonymous viewer.

### MAP-J --- Old cache

Client returns after 4 hours offline; map explicitly states cached
timestamp and does not claim current status.

### MAP-K --- External API outage

Weather/feed provider fails; map continues with last known data marked
stale and unaffected internal incident data remains live.

### MAP-L --- Route hazard

Standard routing provider proposes a road SmartAIHub marks blocked;
system warns/recalculates rather than labeling route safe.

### MAP-M --- User pin correction

Device location is inaccurate; reporter moves incident pin and confirmed
location is preserved instead of being overwritten by EXIF inference.

### MAP-N --- No location permission

User denies location but can select a point/place and use full
nearby-awareness functionality for that point.

### MAP-O --- Alert cancelled

Cached warning is reconciled to CANCELLED and no longer appears active.

------------------------------------------------------------------------

# 78. Map Review Passes 41--60

All fixes are already incorporated above.

### Pass 41 --- Renderer/vendor lock-in

Gap: map provider could become domain authority.\
Fix: MapLibre renderer + provider adapters + SmartAIHub geo API.

### Pass 42 --- External API overuse

Gap: every client pan could trigger third-party APIs.\
Fix: server normalization, viewport APIs, cache-first external adapters.

### Pass 43 --- Cache correctness

Gap: one cache layer could be mistaken for truth.\
Fix: L0--L4 cache hierarchy with PostGIS/domain state authoritative.

### Pass 44 --- Freshness semantics

Gap: old marker visually indistinguishable from live data.\
Fix: data-type freshness classes + explicit stale UI.

### Pass 45 --- Marker semantics

Gap: color-only pins cannot encode all-hazard state/accessibly.\
Fix: icon/shape + severity ring + verification/status + stale badge.

### Pass 46 --- Map interaction

Gap: clicking a marker lacked consistent behavior.\
Fix: preview bottom sheet → detail/timeline/media/actions.

### Pass 47 --- Source media

Gap: external images were not integrated safely.\
Fix: ExternalMediaReference/Evidence, attribution, timestamp, licensing
and derivatives.

### Pass 48 --- Dense-event performance

Gap: thousands of markers could overwhelm browser/network.\
Fix: viewport queries, LOD, vector/source layers and clustering.

### Pass 49 --- Nearby situational awareness

Gap: map displayed points but did not answer "what is happening around
me?"\
Fix: Around Me/Point summary + prioritized nearby layers.

### Pass 50 --- Privacy geometry

Gap: same coordinate could leak across roles.\
Fix: server-side exact/generalized/grid/no-geometry projections.

### Pass 51 --- Temporal exploration

Gap: old/current observations could be confused.\
Fix: Now/history/time scrub + unmistakable historical mode.

### Pass 52 --- Delta updates

Gap: polling full map wastes bandwidth/battery.\
Fix: feature revisions, cursor/change feed, debounced viewport refresh.

### Pass 53 --- Offline map

Gap: cached map could masquerade as live.\
Fix: offline timestamp banner + queued reports + explicit degraded mode.

### Pass 54 --- Routing safety

Gap: generic routing APIs do not know all emergency closures.\
Fix: operational accessibility overlay and no "safe" claim from routing
alone.

### Pass 55 --- Map accessibility

Gap: critical information available only visually.\
Fix: equivalent nearby list, keyboard/screen reader/non-color states.

### Pass 56 --- API budget

Gap: external map/feed costs/rate limits uncontrolled.\
Fix: per-provider budgets, cache metrics, backoff and emergency
override.

### Pass 57 --- R2 media delivery

Gap: media path/caching could leak private evidence or rely on
development URLs.\
Fix: custom-domain public derivatives, controlled sensitive access and
cache policy.

### Pass 58 --- Source provenance

Gap: marker could appear authoritative without source context.\
Fix: source/observation/fetch times, corroboration and attribution.

### Pass 59 --- Map scraping/security

Gap: bbox API could be abused to enumerate victims.\
Fix: projection, feature caps, scan protection, rate limits and
sensitive-access audit.

### Pass 60 --- End-to-end map usability

Gap: technically complete map could still require too many taps.\
Fix: one-tap preview, preserved viewport, nearby summary,
thumbnail-first media, layer presets and mobile bottom-sheet
interaction.

------------------------------------------------------------------------

# 79. Recommended Cloudflare-First Deployment Profile

``` text
Client
├─ MapLibre GL JS
├─ PWA Service Worker
└─ local viewport cache

Cloudflare
├─ Workers
│  ├─ /geo/*
│  ├─ auth / privacy projection
│  ├─ adapter orchestration
│  └─ cache policy
├─ CDN / Cache Rules
│  ├─ map styles/assets
│  ├─ public-safe feature projections
│  └─ public-safe thumbnails
├─ Workers KV
│  └─ normalized reusable external-feed cache
├─ R2
│  ├─ original evidence (private)
│  ├─ derivatives
│  └─ permitted map/static assets
└─ Queues/Workflows where existing orchestration contracts require async ingestion

Data
└─ PostgreSQL + PostGIS
   ├─ authoritative geometries
   ├─ incidents/observations
   ├─ spatial indexes
   └─ access graph
```

Use Durable Objects only when a concrete coordination/state pattern
justifies them; do not introduce them merely because the feature is a
map.

------------------------------------------------------------------------

# 80. Map Implementation Priority

**P0** - PostGIS spatial model/indexes - Geo API - viewport/nearby
queries - privacy projections - MapLibre renderer - marker design -
preview/detail - freshness/stale UX - clustering/LOD - location pin
workflow - R2 thumbnails/media authorization - offline/degraded status

**P1** - external feed adapters/cache - operational access/route
overlay - time controls/change feed - Around Me summary - public warning
polygons - API budgets/observability

**P2** - offline regional tile packages - richer temporal playback -
advanced vector-tile generation - predictive hazard layers - native map
clients

Map implementation MUST NOT wait for P2 capabilities before delivering
P0 emergency usefulness.

**End of Spec 260 R1.2 --- 60-Pass Cumulative Review / Map & Geospatial
Production Hardening**

# 81. Advanced Map Review Passes 61--70

Passes 61--70 are additional to the previous 60 cumulative reviews. All
discovered gaps below are normative fixes in R1.3.

## Pass 61 --- Geospatial Boundary Correctness

**Gap:** Naive bounding-box queries may fail around the antimeridian,
large radii, coordinate-order mistakes or invalid geometry.

**Fix:** - Geo APIs MUST define coordinate order explicitly and validate
latitude/longitude ranges. - BBOX queries crossing the antimeridian MUST
be supported or safely decomposed. - Geometry ingestion MUST
validate/fix/reject invalid polygons according to source policy. -
Spatial reference identifiers (SRID) MUST be explicit; authoritative
operational geometry SHOULD use a consistent canonical CRS. - Distance
queries MUST use appropriate geographic calculations rather than naive
degree arithmetic. - Tests MUST include antimeridian, near-pole,
tiny-radius, large-radius and malformed geometry cases.

## Pass 62 --- Marker Collision, Occlusion & Operational Priority

**Gap:** A critical marker can be hidden by clusters, labels or
lower-priority features.

**Fix:** - Define deterministic `display_priority`. - Critical
life-safety incidents and active warnings MAY bypass normal clustering
at policy-defined zooms. - Collision rules MUST prioritize critical
hazards over decorative/context layers. - Hidden/overlapping features
MUST remain discoverable through cluster/list/nearby views. - UI MUST
NOT infer severity from z-order alone. - "Too many features" fallback
MUST preserve critical counts and list access.

## Pass 63 --- Conflicting Sources on the Same Location

**Gap:** Two credible sources may disagree, e.g. one says road open and
another says closed.

**Fix:** - Never silently choose one source solely because it arrived
last. - Maintain source-specific observations and derive a `CONFLICTING`
operational projection when reconciliation rules cannot resolve them. -
Preview MUST expose conflict warning. - Detail MUST show material
conflicting observations, timestamps and provenance. - Routing MUST
treat unresolved safety-critical access conflicts conservatively
according to policy. - Operator/responder verification MAY resolve the
projection without deleting conflicting history.

## Pass 64 --- Legend, Semantics & Cognitive Load

**Gap:** A rich marker language is useless if users cannot understand it
quickly.

**Fix:** - Map MUST have an accessible legend. - Legend adapts to
currently visible layers/zoom and explains icon, severity, verification
and stale indicators. - Critical semantics MUST remain consistent across
citizen, responder and command-center surfaces. - Avoid excessive icon
variants; use a controlled design-token registry. - First-use/on-demand
explanation SHOULD be available without blocking emergency use. - Legend
MUST have text equivalent and not rely solely on color.

## Pass 65 --- Indoor / Multi-Floor / Complex-Site Incidents

**Gap:** One latitude/longitude is insufficient for hospitals, towers,
malls, factories and collapsed buildings.

**Fix:** - `LocationRef` MAY include site/building, floor/level,
unit/room/zone, entrance, access note and vertical uncertainty. -
Outdoor map marker remains the site anchor; detail may show internal
location text/diagram when authorized. - Do not pretend standard basemap
routing can navigate indoor rescue routes. - Multiple entrances/access
points MAY be represented. - Sensitive unit/room details MUST follow
role-based disclosure. - Building-collapse/search zones MAY use local
operational grids independent of public basemap.

## Pass 66 --- Area Hazards, Evacuation Zones & Geometry Revision

**Gap:** Point markers alone cannot represent flood extent, wildfire
perimeter, exclusion zones or evacuation areas.

**Fix:** - Support point, line, polygon and multi-geometry features. -
Area features require revision/version and effective/observed
timestamps. - Updated hazard polygons MUST supersede previous
operational geometry while retaining history. - Evacuation/exclusion
polygons MUST visually distinguish warning vs mandatory/authorized
status according to tenant terminology. - User can tap an area to see
source, freshness, status and instructions. - Geometry simplification
for low zoom MUST not materially alter safety boundaries without defined
tolerance.

## Pass 67 --- Cache Invalidation After Critical State Changes

**Gap:** TTL alone can leave resolved/cancelled/escalated events stale
at the edge.

**Fix:** - Critical mutations MUST emit cache-invalidation/revision
events. - Cache keys MUST include projection scope and revision where
appropriate. - Alert cancellation, incident closure/reopen, severity
escalation and privacy-withdrawal events require expedited
purge/invalidation for affected public projections. - If purge fails,
revision-aware clients/API responses MUST prevent old data from being
treated as current. - Sensitive data that loses authorization MUST never
rely solely on eventual TTL expiry. - Purge/revalidation failures MUST
be observable.

## Pass 68 --- Location Spoofing & Confidence Without Blocking Reports

**Gap:** Device coordinates can be falsified or simply inaccurate.

**Fix:** - Device location is evidence, not unquestionable truth. -
Preserve acquisition method and reported accuracy. - Compare location
with user-confirmed pin, media metadata, network/context and independent
observations only as supporting evidence. - Suspicious location MUST
lower/qualify confidence rather than automatically reject life-safety
intake. - Never require anti-spoof attestation as a prerequisite to
reporting an emergency. - Responder-confirmed location can supersede
operational projection while preserving prior values.

## Pass 69 --- Deep Links, Sharing & Safe Map Context

**Gap:** Users/responders need to share an event/map view without
leaking private coordinates or losing context.

**Fix:** - Support canonical deep links for public-safe alert/event/map
views. - Sensitive links MUST be authorization-bound and SHOULD expire
where appropriate. - Shared links MAY preserve zoom/layer/time context
but MUST NOT encode restricted data directly in URL parameters. - Public
share preview metadata MUST use public-safe title/image/location. -
Revoked/closed/private events must degrade shared links safely. -
Opening a link MUST resolve the viewer's role and return the correct
server-side projection.

## Pass 70 --- Projection Equivalence & End-to-End Map Truth

**Gap:** Public/community/responder/command projections could drift and
display contradictory state because they are tested separately.

**Fix:** - Define one canonical operational state and deterministic
projection functions. - Contract tests MUST derive all role views from
the same fixture/revision. - Lower-privilege projections may
omit/generalize information but MUST NOT invent contradictory status. -
Privacy tests MUST compare role pairs and prove monotonic disclosure
boundaries. - Map marker, preview card, detail page, nearby summary and
alert view MUST agree on canonical status/revision. - End-to-end tests
MUST verify a state mutation propagates through DB → projection → cache
invalidation → map → detail consistently.

------------------------------------------------------------------------

# 82. New R1.3 Map Data Contracts

Add or extend:

``` text
GeoQueryEnvelope
  bbox
  crosses_antimeridian
  center
  radius_m
  zoom
  layers
  filters
  cursor

MapDisplayPolicy
  display_priority
  cluster_policy
  collision_policy
  critical_visibility

SourceConflict
  feature_id
  observation_refs[]
  conflict_type
  detected_at
  resolution_state
  resolved_by
  resolution_reason

MapLegendToken
  icon_key
  label
  description
  hazard_class
  status_semantics

ComplexSiteLocation
  site_id
  building
  level
  zone
  room_or_unit
  entrance
  access_note
  vertical_confidence

GeometryRevision
  geometry
  revision
  effective_at
  observed_at
  supersedes

MapCacheInvalidation
  feature_id
  projection_scopes[]
  reason
  revision
  emitted_at

LocationEvidence
  method
  coordinates
  accuracy_m
  observed_at
  confidence
  source

MapShareRef
  public_safe_ref
  view_context
  authorization_class
  expires_at
```

------------------------------------------------------------------------

# 83. Additional Map Negative / Contract Tests

Implementation MUST prove:

1.  antimeridian-crossing viewport does not omit valid incidents;
2.  malformed geometry cannot poison spatial queries;
3.  critical marker remains discoverable when dense clustering is
    active;
4.  lower-severity marker cannot hide a critical marker solely through
    render order;
5.  conflicting road observations do not silently resolve by
    last-write-wins;
6.  stale/conflicting route cannot be labeled "safe" without appropriate
    verification;
7.  legend semantics match marker tokens used in the renderer;
8.  unauthorized user cannot obtain floor/room information from
    map/detail APIs;
9.  revised evacuation polygon supersedes old operational geometry
    without destroying history;
10. low-zoom simplification remains within configured safety tolerance;
11. alert cancellation triggers revision/invalidation and old cached
    alert cannot remain operationally active;
12. withdrawn disclosure permission prevents sensitive map/media fetch
    despite old client cache keys;
13. spoof-suspected location does not cause automatic rejection of
    critical intake;
14. user-confirmed incident pin is not silently replaced by device/EXIF
    coordinates;
15. public deep link cannot expose exact restricted coordinates in URL
    or preview metadata;
16. expired sensitive share link cannot retrieve incident detail;
17. public/community/responder projections derive from the same
    canonical revision;
18. lower-privilege projection never contains fields unavailable to its
    policy;
19. marker, preview, detail and nearby summary report the same canonical
    status;
20. reopen/escalation propagates through projection/cache/map without
    waiting only for long TTL expiry.

------------------------------------------------------------------------

# 84. Map UX Operational Presets

To reduce cognitive load, provide policy-configurable presets:

### "Near Me"

Critical hazards + active incidents + access problems +
shelters/facilities.

### "Travel / Route"

Road/access restrictions + hazards intersecting route + safe
destinations.

### "Help Nearby"

Only community-safe assistance opportunities for opted-in helpers.

### "Responder"

Assignments + incidents + access + facilities + team/resource layers.

### "Command"

Area hazards + all authorized incident/resource/response layers +
stale/conflict overlays.

Users MAY customize layers, but presets provide a safe useful default.

------------------------------------------------------------------------

# 85. Map Freshness & Conflict Banner

When visible map data includes operationally material stale/conflicting
sources, show a compact aggregate warning:

``` text
⚠ Some information may be outdated
3 visible items are stale • 1 source conflict
[Review]
```

`Review` opens the relevant list rather than forcing the user to inspect
every marker.

When all critical visible sources are fresh, do not display false
reassurance such as "area is safe"; instead state only factual
freshness, e.g. `Latest visible updates: 2 min ago`.

------------------------------------------------------------------------

# 86. R1.3 Map Definition of Done Extension

Map P0 is not complete until:

-   spatial boundary correctness suite passes;
-   marker collision/priority tests pass;
-   source-conflict UI and routing behavior pass;
-   legend/accessibility tests pass;
-   complex-site disclosure tests pass;
-   polygon revision/simplification tests pass;
-   critical cache invalidation tests pass;
-   location-confidence/spoof negative tests pass;
-   deep-link privacy tests pass;
-   cross-role projection equivalence tests pass;
-   map/detail/nearby state consistency E2E passes.

**End of Spec 260 R1.3 --- 70-Pass Cumulative Review / Advanced Map
Correctness & Operational Hardening**

# 87. Map Review Passes 71--80

Passes 71--80 extend the previous 70 cumulative reviews. All gaps
discovered below are normative R1.4 requirements.

## Pass 71 --- Tile / Style / Geodata Licensing and Attribution

**Gap:** Provider abstraction exists, but switching/caching map sources
can violate tile, style, geocoding or imagery licensing.

**Fix:** - Every `BasemapProviderAdapter` and geodata adapter MUST
declare license, attribution text/logo requirements, caching/retention
rights, offline rights and redistribution restrictions. - Attribution
MUST remain visible where required and MUST NOT be removed by tenant
branding. - Provider terms MUST be versioned/configurable. - Offline
tile packaging MUST be disabled for sources whose terms do not permit
it. - R2 MUST NOT become a permanent mirror of third-party tiles/media
unless rights permit. - Admin diagnostics SHOULD expose license/caching
constraints for each configured provider.

## Pass 72 --- Geocoding / Reverse-Geocoding Resilience

**Gap:** Address/place search can become a single-provider dependency.

**Fix:** - Implement `GeocodingProviderAdapter`. - Support provider
priority/fallback by tenant/region. - Cache only within provider
terms. - Preserve returned provider/source and confidence. - Failed
geocoding MUST NOT prevent manual pin/landmark reporting. - Reverse
geocoding is convenience only; exact coordinates remain canonical where
supplied. - Never overwrite a confirmed location merely because a
geocoder returns a different formatted address.

## Pass 73 --- Spatial Coverage / "No Data" Semantics

**Gap:** A blank map can be misread as "nothing is happening."

**Fix:** - Distinguish `NO_KNOWN_EVENT`, `NO_RECENT_DATA`,
`SOURCE_UNAVAILABLE`, `OUTSIDE_COVERAGE`, and `FILTERED_FROM_VIEW`. -
Map/nearby summary MUST surface meaningful coverage gaps. - Sensor/feed
coverage metadata SHOULD be represented where useful. - "No incidents
shown" MUST NOT be phrased as "safe" unless an explicit authoritative
safety determination exists. - Command Center SHOULD expose
degraded/missing source coverage.

## Pass 74 --- Sensor Density / Observation Bias

**Gap:** Dense urban sensor/citizen coverage can make one area appear
more hazardous simply because it is observed more.

**Fix:** - Analytics and risk layers MUST distinguish event intensity
from observation density. - Store/derive source coverage metadata where
available. - Public heatmaps MUST not equate report count directly with
hazard severity without explicit methodology. - Sparse-data areas SHOULD
display uncertainty/coverage limitations. - Forecast/risk models MUST
include data-coverage caveats/provenance.

## Pass 75 --- Responder Live-Location Privacy & Safety

**Gap:** Showing responder/team positions can expose personnel,
operations or create targeting risk.

**Fix:** - Responder live location is a sensitive operational layer. -
Visibility MUST be role/purpose scoped. - Public/community users MUST
not receive precise responder tracking by default. - Location history
retention MUST be minimized/configurable. - Team location MAY be
generalized/delayed where exact real-time disclosure is unnecessary. -
Responder can enter policy-defined covert/sensitive-operation mode. -
Location-sharing state must be clearly visible to responder devices
where practical.

## Pass 76 --- Evacuation Route / Destination Capacity

**Gap:** A geometrically valid route can still be unsafe because of
congestion, destination saturation or transport capacity.

**Fix:** - Evacuation planning MUST consider route accessibility, hazard
intersection, facility capacity, transport mode and known
congestion/capacity constraints when data exists. - Route
recommendations MUST carry freshness and source. - Do not label a
destination available based solely on map presence. - Destination
capacity commitment integrates with Section 37 facility-capacity
contracts. - If multiple routes exist, system MAY show alternatives and
reasons without claiming guaranteed safety. - Route invalidation MUST
propagate when hazard/access/facility state changes.

## Pass 77 --- Alert Geometry ↔ Incident Geometry Consistency

**Gap:** Warning polygons, incident markers and detail text can diverge.

**Fix:** - Alert geometry MUST reference its authoritative
revision/source. - Incident-to-alert relationships SHALL be explicit
where known. - Map must not infer that every incident inside an alert
polygon was caused by that alert's hazard. - Updated/cancelled alert
geometry must reconcile with cached map layers. - Detail surfaces must
show whether a user-selected point is currently inside, outside or near
an active alert area based on the same revision used by the map.

## Pass 78 --- User-Generated Map Content Moderation

**Gap:** Photos/text/pins on a map can expose abuse, doxxing, graphic
content or deliberate misinformation.

**Fix:** - User-generated public/community map projections require
content/safety policy appropriate to tenant and audience. - Private
operational evidence is not automatically public content. - Support
report/hide/review workflows for public map content. - Exact personal
addresses, phone numbers and identifying victim data must be removed
from public-safe descriptions. - Graphic/sensitive media may require
warning/blur/restricted access. - Moderation action MUST preserve
necessary original evidence under restricted policy rather than
destructively editing the evidentiary record. - Emergency intake MUST
NOT be delayed solely by public-content moderation.

## Pass 79 --- Spatial Privacy Inference / Mosaic Risk

**Gap:** Even generalized points can reveal a household when combined
with repeated updates, timestamps or other layers.

**Fix:** - Privacy review MUST consider mosaic/inference risk, not only
individual fields. - Public/community geometry generalization MAY change
by density/context. - Repeated generalized points SHOULD avoid
deterministic patterns that reveal the exact source. - Sensitive
timestamps MAY be bucketed/generalized in public projections. - Layer
combinations that reconstruct restricted location MUST be prevented by
projection policy. - High-risk map exports/downloads require separate
authorization.

## Pass 80 --- Map SLO, Capacity, Cost and Disaster-Scale Operations

**Gap:** Performance budgets existed but production SLO/capacity
behavior under disaster spikes was not explicit.

**Fix:** - Define map service SLOs for availability, viewport latency,
detail latency and critical-update propagation. - Define capacity
assumptions for concurrent map users, visible features, event ingestion
and media requests. - Load tests MUST include regional-disaster spikes
and cache-cold scenarios. - Protect emergency write/intake capacity from
public-map read surges. - Apply separate rate/budget classes for
anonymous public map, authenticated citizen, responder and command
traffic. - Expensive layers/media SHOULD degrade before critical
incident state. - Admin/operations must see external API spend,
Worker/KV/R2/cache usage and map degradation mode. - Disaster-mode cost
controls MUST NOT block protected emergency intake/critical state
updates.

------------------------------------------------------------------------

# 88. R1.4 New / Extended Contracts

``` text
MapProviderPolicy
  provider_id
  provider_type
  license_version
  attribution
  cache_allowed
  cache_ttl_max
  offline_allowed
  redistribution_allowed
  configured_region

GeocodeResult
  provider
  query
  coordinates
  formatted_address
  confidence
  fetched_at

CoverageState
  area
  source_id
  state
  last_successful_observation
  expected_update_interval

ObservationCoverage
  source_type
  spatial_density
  temporal_density
  confidence

ResponderLocationPolicy
  visibility_scope
  precision
  delay_seconds
  retention
  sensitive_operation_mode

EvacuationRouteAssessment
  route_revision
  hazard_intersections
  accessibility
  destination_ref
  capacity_state
  transport_mode
  freshness

AlertGeometryRelation
  alert_ref
  geometry_revision
  incident_ref?
  relation_type

PublicContentModeration
  content_ref
  public_projection_state
  sensitivity
  moderation_state
  reason

SpatialPrivacyPolicy
  projection_class
  geometry_precision
  time_precision
  density_rule
  export_allowed

MapServiceSLO
  audience_class
  availability_target
  viewport_latency_target
  critical_propagation_target
  degradation_policy
```

------------------------------------------------------------------------

# 89. R1.4 Additional Negative / Production Tests

Implementation MUST prove:

1.  a provider forbidding offline caching cannot be packaged into
    offline tiles;
2.  required attribution survives tenant theming;
3.  geocoder outage does not block manual-pin emergency reporting;
4.  reverse geocoder cannot overwrite user-confirmed coordinates;
5.  empty viewport caused by source outage is not presented as "safe";
6.  filtered-out events are distinguishable from no known events;
7.  public heatmap does not silently equate observation count with
    severity;
8.  sparse sensor coverage is surfaced in applicable risk views;
9.  anonymous/community user cannot obtain precise responder live
    coordinates;
10. responder location retention follows configured expiry;
11. saturated shelter is not recommended merely because it appears on
    map;
12. route is invalidated/reassessed when destination or access state
    changes;
13. map and detail use the same alert geometry revision;
14. an incident inside an alert polygon is not automatically relabeled
    as caused by that hazard;
15. private operational media cannot become public merely by attaching
    it to a map feature;
16. public description cannot expose victim phone/exact private address;
17. moderation does not destroy original evidence;
18. repeated generalized public points cannot trivially expose the exact
    restricted point under configured privacy policy;
19. unauthorized bulk map export is denied;
20. public read surge cannot starve protected emergency writes;
21. cold-cache regional disaster load remains within declared
    degradation behavior;
22. map cost-budget degradation disables optional expensive layers
    before critical incident state.

------------------------------------------------------------------------

# 90. Coverage & Freshness Panel

Map SHOULD expose a compact "Data status" control.

Example:

``` text
Data status

Incidents        ● Live       1 min
Flood sensors    ● Fresh      4 min
Road closures    ⚠ Aging     38 min
Weather          ● Fresh      9 min
Community reports● Live       2 min
Traffic          ✕ Source unavailable

Coverage:
Flood sensors: partial in this area

[View sources]
```

This is distinct from individual marker freshness and helps the user
understand whether the overall map has blind spots.

------------------------------------------------------------------------

# 91. Public Map vs Operational Map

The implementation MUST treat these as different projections, even if
rendered by the same MapLibre component.

## Public Map

Optimized for: - warnings; - generalized hazards; - safe public
information; - shelters/services; - public-safe reports; - privacy and
scalability.

## Operational Map

Optimized for: - exact authorized incident locations; -
tasks/teams/resources; - route/access intelligence; - evidence; -
stale/conflict analysis; - response coordination.

A tenant MUST NOT obtain an operational map simply by changing a
client-side layer flag.

------------------------------------------------------------------------

# 92. Map Cost Hierarchy

When cost/load pressure occurs, degrade in this order unless incident
policy requires otherwise:

``` text
high-resolution optional imagery
→ historical playback
→ non-critical external overlays
→ large thumbnails/media prefetch
→ decorative/context layers
→ lower refresh frequency for non-critical public data
```

Preserve:

``` text
emergency intake/write
critical incident state
active warnings
authorized responder assignments
critical location/access data
minimal basemap or list fallback
```

------------------------------------------------------------------------

# 93. Map Final Gate --- R1.4

Map production promotion requires evidence for:

-   provider licensing/attribution compliance;
-   geocoding fallback;
-   coverage/no-data semantics;
-   observation-density caveats;
-   responder-location privacy;
-   evacuation route/capacity integration;
-   alert/incident geometry consistency;
-   UGC moderation separation from emergency intake;
-   mosaic-risk privacy tests;
-   disaster-scale SLO/load/cost degradation.

**End of Spec 260 R1.4 --- 80-Pass Cumulative Review / Map Governance,
Coverage & Operational Scale Hardening**

# 94. Progressive Public Access --- Non-Negotiable Principle

SmartAIHub Emergency MUST use:

> **Progressive Access, Not Login-First**

A person MUST NOT be required to create an account or sign in merely to
obtain public emergency information necessary to understand danger,
avoid harm, find assistance, or decide whether/how to provide safe help.

Authentication is introduced only when the requested information/action
crosses a defined identity, privacy, accountability, fraud, or
operational boundary.

The system SHALL optimize for:

``` text
PUBLIC AWARENESS
→ PUBLIC-SAFE DETAIL
→ OPTIONAL INTERACTION
→ STEP-UP AUTHENTICATION WHEN NECESSARY
→ VERIFIED / ROLE-BOUND ACCESS WHEN NECESSARY
```

and MUST NOT default to:

``` text
LANDING PAGE → LOGIN WALL → EMERGENCY INFORMATION
```

------------------------------------------------------------------------

# 95. Access Ladder

## Level A0 --- Anonymous Public

No login required.

MUST be sufficient for meaningful public situational awareness.

May include, subject to projection policy: - public emergency map; -
active public alerts/warnings; - hazard/event type; - generalized event
location/area; - severity/urgency classification safe for publication; -
operational/public status; - freshness/last-updated age; -
verification/corroboration status; - source attribution; - public-safe
event summary; - public-safe timeline; - public-safe images/thumbnails
where permitted; - road/access restrictions; - evacuation/public warning
zones; - shelters, safe zones and public facilities; - public facility
status/capacity class where publishable; - public contact/emergency
instructions; - data coverage/freshness status; - nearby public-safe
situation summary; - public-safe aggregated assistance needs; -
public-safe information useful to determine whether safe assistance may
be possible.

A0 MUST NOT expose: - exact private household coordinates; - victim
phone/email/contact identifiers; - private chat; - medical details
beyond explicitly public emergency information; - exact responder live
tracking; - private evidence; - restricted facility/security data; -
private helper identity; - hidden moderation/abuse signals.

## Level A1 --- Anonymous Interactive Emergency Access

No account creation required.

May support: - report incident; - submit observation; - request urgent
help; - add public-safety update; - attach evidence subject to policy; -
acknowledge public warning; - select incident location; - receive an
ephemeral case/report reference; - continue a limited anonymous case
session; - provide optional callback/contact information.

Anti-abuse controls MUST NOT create a blanket login requirement.

## Level A2 --- Authenticated User

Login required where persistence/personalization/account-bound
interaction is needed.

Examples: - follow/watch incident; - saved locations; - persistent
notification preferences; - manage own reports/cases; - offer assistance
where identity linkage is required; - private case communication; -
cross-device continuation.

## Level A3 --- Verified User / Helper

Identity/contact/capability verification as required by policy.

Examples: - receive exact assistance location after
acceptance/authorization; - access requester relay; - perform selected
mutual-aid tasks; - access higher-trust operational instructions.

Verification depth MUST be proportional to task risk.

## Level A4 --- Verified Responder / Organization

Credential and role scoped.

Examples: - assigned exact incident locations; - operational evidence; -
restricted responder/task layers; - authorized victim/contact
information; - inter-team operational coordination.

## Level A5 --- Command / Authority

Strong authorization, tenant/organization scope and audit.

Examples: - common operational picture; - restricted cross-case views; -
resource/dispatch control; - sensitive operational layers; - authorized
break-glass access.

------------------------------------------------------------------------

# 96. Public Information Sufficiency Standard

Public projection MUST be useful enough that an unauthenticated person
can answer, where data exists:

1.  What is happening?
2.  Approximately where?
3.  How severe/urgent is it?
4.  How fresh is the information?
5.  How well verified is it?
6.  Is the area/road/access currently reported affected?
7.  Are there warnings or evacuation instructions?
8.  Are public shelters/services available nearby?
9.  Is there public-safe evidence/media?
10. Is there a safe, appropriate way I can help or report more
    information?

The product MUST NOT intentionally make A0 information artificially
incomplete merely to drive registration.

Registration conversion is never a life-safety objective.

------------------------------------------------------------------------

# 97. Public Event Detail Without Login

Clicking a public marker MUST NOT automatically trigger login.

Default flow:

``` text
Public Map
  ↓
Marker
  ↓
Public Preview
  ↓
Public Event Detail
  ├─ situation
  ├─ freshness
  ├─ verification
  ├─ source
  ├─ public timeline
  ├─ public-safe media
  ├─ access/warning information
  └─ public-safe assistance context
```

Only a restricted action/field triggers step-up.

Example:

``` text
[ดูข้อมูลเหตุการณ์]        → public, no login
[ดูภาพสาธารณะ]            → public, no login
[ดูเส้นทาง/พื้นที่เตือน]   → public, no login

[อาสาช่วยเคสนี้]           → may require login/verification
[ดูตำแหน่งบ้านที่แน่นอน]   → restricted
[ติดต่อผู้ขอความช่วยเหลือ] → restricted/relay
```

------------------------------------------------------------------------

# 98. Step-Up Authentication

Authentication MUST occur at the narrowest necessary boundary.

Requirements: - preserve current map viewport; - preserve selected
incident; - preserve filters/layers; - preserve intended action; - after
successful authentication, return user to the exact pending action where
safe; - do not force navigation back to a generic dashboard.

Example:

``` text
Public event
→ "I can help"
→ authentication required
→ login
→ return to same event
→ capability/safety check
→ assistance workflow
```

Step-up authentication does NOT automatically grant access.
Authorization/verification remains separate.

------------------------------------------------------------------------

# 99. Anonymous Emergency Reporting

Emergency reporting MUST support an anonymous/no-account path.

Minimum path:

``` text
What happened?
→ Where?
→ Anyone in immediate danger?
→ Minimum necessary details
→ Optional media
→ Optional contact
→ Submit
```

The system MAY: - issue an ephemeral report/case token; - ask for
contact verification when operationally justified; - apply risk-based
anti-abuse; - request additional verification later.

The system MUST NOT: - require account registration before accepting a
critical report; - require profile completion; - require social login; -
require marketing consent; - require unnecessary personal information.

------------------------------------------------------------------------

# 100. Anonymous Case Continuation

Where feasible, an anonymous reporter/requester SHOULD be able to
continue a case using a secure ephemeral capability/reference.

Requirements: - non-enumerable; - scoped to that case/session; - limited
privileges; - expiring/rotatable; - revocable; - protected against
URL/referrer leakage where applicable.

Anonymous continuation MAY allow: - view own public/limited case
status; - add update; - answer reassessment; - provide contact; - upload
follow-up evidence.

It MUST NOT become a general authorization token for unrelated incident
data.

------------------------------------------------------------------------

# 101. Anonymous → Account Claim / Upgrade

If an anonymous user later logs in or creates an account, the system MAY
allow the anonymous case to be linked/claimed.

Claiming requires proof appropriate to the original anonymous
capability/contact context.

Requirements: - preserve original reporter provenance; - do not rewrite
history as if user was authenticated at creation; - audit linkage; -
prevent another user from claiming merely by knowing public incident
ID; - support refusal/failed claim without affecting emergency case
processing.

------------------------------------------------------------------------

# 102. Authentication Outage Behavior

**Authentication outage MUST NOT equal emergency information outage.**

During auth degradation/outage, preserve where technically possible:

``` text
public map
public warnings
public-safe event detail
public shelters/services
public freshness/source information
anonymous emergency reporting
minimum anonymous case update
```

Actions requiring verified identity or privileged authorization SHOULD
fail closed or enter explicitly designed deferred verification states.

System MUST display an appropriate message such as:

> Account services are temporarily unavailable. Public emergency
> information and emergency reporting remain available.

Never redirect the entire emergency site to a broken login service.

------------------------------------------------------------------------

# 103. Public vs Authenticated API Boundary

Create explicit projection/API classes.

Illustrative:

``` text
/public/emergency/map
/public/emergency/events/{public_ref}
/public/emergency/alerts
/public/emergency/facilities
/public/emergency/nearby
/public/emergency/report

/auth/emergency/...
/verified/emergency/...
/operations/emergency/...
```

Actual routes MAY follow repository conventions.

Public endpoints: - return only public-safe DTOs; - are independently
rate-limited; - can use aggressive Cloudflare edge caching where
freshness permits; - MUST NOT accept client flags that switch to
restricted projection.

Restricted endpoints: - require server-side authn/authz; - use
private/no-store/scoped caching appropriate to sensitivity; - MUST NOT
share cache keys/namespaces with public projections where leakage is
possible.

------------------------------------------------------------------------

# 104. Cloudflare Public Delivery Architecture

Recommended:

``` text
Internet
   ↓
Cloudflare
   ├─ WAF / DDoS protection
   ├─ optional risk-based Turnstile
   ├─ rate controls
   ├─ Worker public projection
   ├─ CDN/Cache
   ├─ KV normalized public feed cache
   └─ R2 public-safe derivatives
         ↓
PostgreSQL/PostGIS authoritative state
```

Public read surge MUST be isolated from protected emergency writes.

Cache priority: - alerts/public warnings: short TTL + revision
invalidation; - public map viewport: short/cacheable by projection +
revision; - public event detail: cacheable when safe; - static
styles/icons: long; - public-safe thumbnails: long with
purge/revision; - anonymous report POST: never shared-cache.

------------------------------------------------------------------------

# 105. Anonymous Anti-Abuse Without Blanket Login

Use layered risk controls.

Possible controls: - Cloudflare WAF; - DDoS protection; - rate limits; -
Turnstile/challenge when risk warrants; - device/session-level
throttling where appropriate; - payload limits; - duplicate detection; -
media scanning; - progressive friction; - quarantine/review; - source
corroboration.

Rules: - `UNAUTHENTICATED != MALICIOUS`. - `UNVERIFIED != FALSE`. -
suspicious critical reports remain eligible for appropriate
triage/corroboration. - IP address alone MUST NOT be treated as a unique
person. - shared carrier/NAT networks MUST be considered. - anti-abuse
degradation MUST preserve a protected emergency intake path.

------------------------------------------------------------------------

# 106. Public Enumeration / Scraping Controls

Providing useful public information does not require publishing
sensitive raw datasets.

Controls: - public opaque IDs; - no sequential private incident IDs; -
viewport/radius caps; - pagination/cursor limits; - bulk-export
authorization; - rate controls; - public geometry generalization; -
public time bucketing where necessary; - anti-automation controls for
abnormal scanning; - separate public search index; - no victim/person
search.

Public APIs MUST remain usable by normal unauthenticated users without
becoming a directory of vulnerable households.

------------------------------------------------------------------------

# 107. Verified Helper Boundary

A person may inspect public-safe need context before login so they can
decide whether helping is relevant.

Example public-safe view:

``` text
Flood assistance needed
Approx. 1.2 km from selected point
Need: drinking water
Status: partially fulfilled
Remaining public-safe need: ~20 L
Updated: 7 min ago
Access: local road reported passable
```

Restricted until policy conditions are met:

``` text
exact household pin
resident names
phone
private chat
medical details
door/unit information
precise vulnerability data
```

Flow:

``` text
See public-safe need
→ decide to help
→ login if required
→ capability/safety/verification
→ requester/policy authorization
→ scoped exact-location disclosure
→ task
→ disclosure expires
```

This preserves help discovery without prematurely exposing victims.

------------------------------------------------------------------------

# 108. Login / Verification Must Be Risk-Proportionate

Do not use one verification level for all actions.

Examples:

``` text
Read public flood status          → none
Report flooded road              → none by default
Request emergency help           → none by default
Follow alert across devices      → login
Offer bottled water              → login / light verification per policy
Receive exact private home pin   → stronger scoped authorization
Provide first aid as professional→ credential verification
Access medical case data         → verified role + authorization
Command-center access            → strong organizational authorization
```

------------------------------------------------------------------------

# 109. Public Media Policy

Public-safe images can materially help users assess the situation and
SHOULD be available without login where lawful and safe.

Before public projection: - classify sensitivity; - redact/blur as
required; - strip inappropriate metadata; - verify
redistribution/license; - generate derivative; - attach
source/time/freshness; - ensure original remains separately protected.

Login MUST NOT be used as a substitute for proper media privacy.

An authenticated ordinary user still does not automatically receive
sensitive victim media.

------------------------------------------------------------------------

# 110. Public Information SEO / Indexability

Emergency public pages MAY need to be discoverable quickly through
search engines, but not every public endpoint should be indexed.

Policy: - active public alert/event pages MAY be indexable if tenant
policy permits; - sensitive/generalized incidents MAY use `noindex`; -
anonymous report/case continuation URLs MUST be `noindex`; -
private/verified/operational routes MUST never be indexed; - public
structured metadata MUST contain only public-safe fields; -
stale/resolved event indexing policy MUST be configurable.

Search-engine visibility is separate from authorization.

------------------------------------------------------------------------

# 111. Public Accessibility and No-App Requirement

Public emergency information MUST work in a normal browser without: -
installing SmartAIHub app; - creating an account; - enabling push
notifications; - granting precise location.

If location is denied: - user can search place; - select map point; -
open shared public event link; - browse public warning areas.

Core public pages SHOULD remain usable on low-end/mobile browsers and
degraded bandwidth.

------------------------------------------------------------------------

# 112. Public Access Audit Without Tracking Individuals

System SHOULD measure: - public map requests; - event-detail views; -
cache hit rate; - freshness; - anonymous report completion; - step-up
prompts; - auth outage availability; - abuse rates.

Do not require invasive user tracking to operate public emergency
information.

Analytics SHOULD use aggregation/data minimization appropriate to
policy.

------------------------------------------------------------------------

# 113. Access Decision Contract

Every protected resource/action SHOULD resolve an explicit decision:

``` text
AccessDecision {
  subject_class
  authentication_level
  verification_level
  resource
  action
  purpose
  incident_relation
  projection_class
  decision
  reason_code
  required_step_up?
  disclosure_scope?
  expires_at?
  policy_version
}
```

Common decisions:

``` text
ALLOW_PUBLIC
ALLOW_ANONYMOUS_SCOPED
REQUIRE_LOGIN
REQUIRE_VERIFICATION
REQUIRE_ROLE
REQUIRE_INCIDENT_RELATION
REQUIRE_CONSENT_OR_OTHER_LAWFUL_BASIS
DENY
```

Client UI MUST consume this decision rather than duplicate security
policy in front-end conditionals.

------------------------------------------------------------------------

# 114. Access Review Passes 81--90

## Pass 81 --- Public information sufficiency

**Gap:** Public Map existed but minimum useful public detail was not
formally guaranteed.\
**Fix:** A0 Public Information Sufficiency Standard.

## Pass 82 --- Login wall

**Gap:** Event-detail implementation could accidentally require login
for all detail.\
**Fix:** Public Preview + Public Event Detail before restricted step-up.

## Pass 83 --- Anonymous emergency reporting

**Gap:** Report-first principle lacked a complete no-account access
contract.\
**Fix:** A1 Anonymous Interactive Emergency Access.

## Pass 84 --- Session continuity

**Gap:** Anonymous user could lose case continuity.\
**Fix:** scoped ephemeral case capability + optional later account
claim.

## Pass 85 --- Step-up UX

**Gap:** Login could lose map/action context.\
**Fix:** preserve viewport/event/action and resume exact flow.

## Pass 86 --- Auth outage

**Gap:** identity-provider failure could disable emergency website.\
**Fix:** public/emergency anonymous plane remains independently
available.

## Pass 87 --- Cache leakage

**Gap:** public and authenticated projections could share unsafe cache
behavior.\
**Fix:** explicit API/cache namespaces and restricted-cache policy.

## Pass 88 --- Anti-abuse overreach

**Gap:** fraud protection could become de facto mandatory login.\
**Fix:** progressive friction, risk-based challenge and protected
emergency intake.

## Pass 89 --- Helper privacy boundary

**Gap:** helpers need enough pre-login context to decide, but not victim
identity.\
**Fix:** public-safe need discovery → verified scoped disclosure.

## Pass 90 --- Accessibility / exclusion

**Gap:** account/app/location requirements could exclude people in
emergencies.\
**Fix:** browser-first, no-app, no-login public access and manual place
selection.

------------------------------------------------------------------------

# 115. R1.5 Negative / Acceptance Tests

Implementation MUST prove:

1.  anonymous user can open public emergency map;
2.  anonymous user can open public event detail without login;
3.  public event detail contains freshness, verification and source when
    available;
4.  anonymous user cannot retrieve exact private household coordinates;
5.  anonymous user can submit critical report without account creation;
6.  login service outage does not remove public alerts/map/report
    intake;
7.  restricted action triggers step-up without losing selected
    event/viewport;
8.  successful login resumes intended action;
9.  login alone does not grant verified-helper/responder data;
10. public and restricted cache namespaces cannot cross-leak;
11. cached authenticated response cannot be served to anonymous user;
12. anti-bot/rate controls do not globally disable emergency intake;
13. public incident IDs cannot enumerate private records;
14. anonymous case token cannot access unrelated case;
15. public incident ID alone cannot claim anonymous case;
16. helper can inspect public-safe need before login;
17. helper cannot receive exact home pin before required authorization;
18. public media derivative does not expose original metadata/private
    original;
19. ordinary authenticated user cannot retrieve responder/medical
    restricted data merely because logged in;
20. user denying location permission can still browse/search/select map
    point;
21. public emergency pages function without app installation;
22. anonymous case URLs are not search-indexable;
23. restricted/operational pages cannot be search-indexed;
24. public analytics do not require identity creation;
25. AccessDecision policy version/reason is auditable for protected
    disclosure.

------------------------------------------------------------------------

# 116. R1.5 Production Gate

Production promotion requires:

-   public access projection tests;
-   anonymous emergency-report tests;
-   auth-outage chaos/degradation test;
-   step-up continuation E2E;
-   anonymous-case capability security test;
-   public/restricted cache isolation test;
-   enumeration/scraping test;
-   helper progressive-disclosure test;
-   media public-derivative privacy test;
-   no-location/no-app accessibility test;
-   SEO/indexability policy test;
-   emergency anti-abuse degradation test.

**End of Spec 260 R1.5 --- 90-Pass Cumulative Review / Progressive
Public Access & Emergency Authentication Hardening**

# 117. Cross-Device Emergency Experience --- Non-Negotiable Principle

SmartAIHub Emergency MUST be operationally usable on:

-   desktop/computer;
-   laptop;
-   tablet;
-   mobile phone;
-   PWA-capable browsers where supported.

The same canonical incident/state MUST power all surfaces, while
interaction density, navigation, map layout and notification delivery
adapt to device capability.

Responsive design MUST NOT mean merely shrinking the desktop UI.

The product SHALL follow:

> **Same operational truth, device-appropriate interaction.**

------------------------------------------------------------------------

# 118. Device Capability Profile

Client SHOULD derive a non-sensitive `DeviceCapabilityProfile` from
available browser/platform capabilities rather than user-agent
assumptions alone.

Illustrative:

``` text
DeviceCapabilityProfile {
  viewport_class
  orientation
  pointer_type
  hover_capable
  keyboard_capable
  safe_area
  standalone_pwa
  notification_capability
  push_capability
  background_capability
  location_capability
  camera_capability
  microphone_capability
  share_capability
  connection_hint?
  reduced_motion
  preferred_contrast?
  text_scale?
}
```

Capability detection MUST degrade safely when an API is unavailable.

Device profile MUST NOT become an identity/fingerprinting mechanism.

------------------------------------------------------------------------

# 119. Responsive Layout Classes

Breakpoints are implementation tokens and MAY evolve, but behavior
classes MUST exist.

## Compact --- Mobile

Primary goals: - one-hand operation; - minimum taps; - map + bottom
sheet; - persistent critical action access; - readable with large
text; - low bandwidth/battery.

Recommended pattern:

``` text
┌───────────────────────┐
│ Search / Area / Alert │
├───────────────────────┤
│                       │
│         MAP           │
│                       │
│                       │
├───────────────────────┤
│ Bottom Sheet          │
│ Nearby / Event / Need │
│ [Report] [Need Help]  │
└───────────────────────┘
```

Critical actions SHOULD be reachable near thumb zones and not hidden
behind hover.

## Medium --- Tablet

Primary goals: - map remains visible while inspecting details; -
split-view where space permits; - touch-first controls; -
landscape/portrait adaptation.

Landscape example:

``` text
┌─────────────────────────────────────┐
│ Search | Layers | Alerts | Status   │
├────────────────────┬────────────────┤
│                    │ Event / Nearby │
│       MAP          │ Detail Panel   │
│                    │ Timeline       │
│                    │ Actions        │
└────────────────────┴────────────────┘
```

Portrait MAY use map + expandable bottom/side sheet depending width.

## Expanded --- Desktop / Computer

Primary goals: - high information density without losing map context; -
keyboard/mouse efficiency; - multi-panel operations; - command/responder
workflows.

Example:

``` text
┌────────────────────────────────────────────────────────┐
│ Search | Filters | Time | Layers | Data Status | User │
├──────────────┬───────────────────────────┬─────────────┤
│ Layer /      │                           │ Incident /  │
│ Nearby List  │           MAP             │ Detail /    │
│ Alerts       │                           │ Timeline    │
│              │                           │ Actions     │
└──────────────┴───────────────────────────┴─────────────┘
```

Panels MUST be collapsible.

------------------------------------------------------------------------

# 120. Cross-Device Navigation Contract

Core destinations:

``` text
Map
Nearby
Alerts
Report
My Case / Cases
Help / Assist
```

Availability depends on role/projection.

Mobile SHOULD use compact bottom navigation or equivalent.

Tablet MAY use rail/bottom navigation.

Desktop MAY use sidebar/top navigation and keyboard shortcuts.

Navigation changes MUST NOT alter authorization semantics.

Selected incident/map state SHOULD survive navigation where practical.

------------------------------------------------------------------------

# 121. Map Interaction by Input Type

## Touch

-   minimum practical touch target;
-   tap marker;
-   drag/pinch map;
-   bottom-sheet gestures;
-   no hover dependency;
-   avoid tiny stacked map controls.

## Mouse

-   click;
-   wheel zoom where appropriate;
-   hover MAY preview but MUST NOT be sole access method;
-   contextual pointer feedback.

## Keyboard

-   focusable map controls;
-   list equivalent for markers;
-   shortcuts MAY exist;
-   escape closes sheet/modal;
-   focus MUST return predictably.

## Stylus

Tablet stylus SHOULD behave as pointer/touch without requiring special
workflow.

------------------------------------------------------------------------

# 122. Mobile Emergency UX

Mobile MUST optimize for emergency use under stress.

Requirements: - primary emergency/report action visible without deep
navigation; - map and event context preserved while sheet opens; - no
essential horizontal scrolling; - forms use progressive disclosure; -
numeric/phone inputs invoke appropriate keyboards where possible; -
camera/media capture can launch directly where supported; - location
permission request appears only when context explains why; - manual
location remains available; - safe-area insets respected; - virtual
keyboard MUST NOT hide submit/critical controls; - large-text mode MUST
not break critical actions; - destructive actions require clear
confirmation appropriate to risk.

------------------------------------------------------------------------

# 123. Tablet Emergency UX

Tablet is NOT treated as enlarged mobile only.

Requirements: - exploit split view when width permits; - map + detail
simultaneously; - responder workflows support touch-first task list +
map; - portrait/landscape state preserved; - large tap targets remain
despite extra space; - side panel width constrained for readability; -
tablet multitasking/split-screen MUST remain usable at reduced viewport
width; - no dependency on desktop hover behavior.

------------------------------------------------------------------------

# 124. Desktop / Computer Emergency UX

Requirements: - map + nearby/list + detail can coexist; - keyboard
navigation; - efficient filters/layers; - resizable/collapsible panels
where appropriate; - command-center density may exceed citizen density
but remains readable; - opening media SHOULD not destroy current
operational context; - multi-monitor support MUST NOT be assumed for
core workflow; - critical actions must work in a single ordinary browser
window.

------------------------------------------------------------------------

# 125. Orientation / Resize / Fold / Split-Screen

The UI MUST survive: - mobile portrait ↔ landscape; - tablet portrait ↔
landscape; - browser resize; - tablet split-screen; - desktop narrow
window; - foldable/hinge-safe layouts where browser exposes relevant
viewport segments.

State that MUST survive reflow: - selected incident; - map center/zoom
where feasible; - active layers; - filter; - open case/task; - unsent
form draft.

Layout change MUST NOT resubmit actions or duplicate tasks.

------------------------------------------------------------------------

# 126. Device-Aware Notification Architecture

Notification delivery MUST use a channel capability resolver.

``` text
Emergency Notification
        ↓
Notification Policy
        ↓
Recipient Contact Graph
        ↓
Device / Channel Capabilities
        ↓
Channel Selection
        ↓
Send
        ↓
Delivery / Acknowledgement
        ↓
Failover / Escalation
```

Channels may include: - in-app; - Web Push; - SMS; - LINE; - email; -
voice/call/IVR; - WhatsApp/Messenger where configured; - external
emergency system; - responder-specific operational channels.

No critical workflow may depend solely on Web Push.

------------------------------------------------------------------------

# 127. Notification Classes

At minimum:

``` text
INFO
STATUS_UPDATE
ACTION_REQUIRED
URGENT
CRITICAL_LIFE_SAFETY
```

Examples:

### INFO

Shelter information updated.

### STATUS_UPDATE

Team accepted request / ETA changed.

### ACTION_REQUIRED

Please confirm whether water level is rising.

### URGENT

Evacuation recommended in your area.

### CRITICAL_LIFE_SAFETY

Immediate danger / emergency instruction.

Tenant/jurisdiction policy determines wording and authoritative alert
semantics.

------------------------------------------------------------------------

# 128. Notification Device Behavior

## Active Desktop Browser

Prefer: - in-app banner/toast; - notification center; - Web Push when
appropriate and permission exists.

Do not repeatedly push the same event while user is actively viewing and
acknowledging it.

## Tablet

Prefer: - in-app + Web Push where supported; - layouts must open
notification into tablet-appropriate split/detail state.

## Mobile

Prefer: - Web Push where supported/allowed; - in-app when active; -
SMS/other configured channel for critical failover; - deep link directly
to relevant public/case/alert projection.

Notification tap MUST NOT dump user at generic home page.

------------------------------------------------------------------------

# 129. Notification Permission Strategy

Do NOT request browser notification permission immediately on first
public page load.

Ask contextually, e.g.:

``` text
Receive urgent updates for this area?
[Enable alerts] [Not now]
```

Then request platform permission.

Requirements: - public information remains usable if denied; - denial
does not repeatedly trigger prompts; - explain alternative channels when
appropriate; - notification permission is separate from location
permission; - login is not required merely to receive public alerts if
the chosen delivery mechanism/policy supports anonymous subscription.

------------------------------------------------------------------------

# 130. Anonymous Alert Subscription

Where technically/policy feasible, public users MAY subscribe without
account to: - an alert area; - public event; - selected map
point/radius; - hazard category.

Use a scoped anonymous subscription identifier.

It MUST NOT expose private incident data.

Users must be able to unsubscribe.

Anonymous subscription SHOULD have retention/expiry policy.

------------------------------------------------------------------------

# 131. Notification Deduplication / Bundling

Multiple channels MUST NOT create uncontrolled alert storms.

Notification engine requires: - `notification_event_id`; - semantic
dedup key; - revision; - urgency; - recipient; - channel attempts; -
acknowledgement state.

Rules: - same revision acknowledged in-app SHOULD suppress unnecessary
duplicate low-priority push; - critical policy MAY intentionally use
multiple channels; - repeated nearby incidents MAY be bundled when
safe; - alert update/cancel MUST supersede earlier notification; -
delivery retry MUST be idempotent.

------------------------------------------------------------------------

# 132. Notification Deep-Link Contract

Every actionable notification SHOULD contain a safe destination
reference.

Examples:

``` text
public alert → public alert detail/map area
case update → authorized case
task offer → authenticated/verified task flow
reassessment → specific question/action
```

Deep link handling: 1. resolve current access level; 2. show public
projection immediately if available; 3. step-up only if action requires
it; 4. return to intended action after authentication; 5. handle
expired/cancelled content gracefully.

Restricted data MUST NOT be embedded directly in notification URL/query
text.

------------------------------------------------------------------------

# 133. Notification Content Privacy

Lock-screen notifications may be visible to others.

Therefore: - classify notification sensitivity; - private medical/victim
details SHOULD NOT appear in lock-screen text by default; - use generic
wording where necessary; - reveal details after authorized open; -
user/tenant policy MAY configure preview level; - responder operational
notifications require appropriate sensitivity policy.

Example:

Preferred: `Your emergency case has an important update. Tap to view.`

Avoid: `Patient Somchai at 12/4 has [sensitive diagnosis]...`

------------------------------------------------------------------------

# 134. Critical Notification Failover

For configured life-safety events:

``` text
Primary channel
→ delivery timeout/failure
→ secondary channel
→ acknowledgement timeout
→ escalation
```

Example policy:

``` text
Web Push
→ SMS
→ LINE
→ voice/call
→ alternate contact / responder workflow
```

Actual sequence is tenant/user/jurisdiction configurable.

`SENT != DELIVERED != SEEN != ACKNOWLEDGED`.

No-response MUST NOT automatically mean safe.

------------------------------------------------------------------------

# 135. Quiet Hours / Do-Not-Disturb Semantics

Ordinary informational notifications MAY honor quiet hours.

Critical life-safety notifications MAY bypass application-level quiet
preferences only according to explicit policy and platform capability.

The application MUST NOT claim it can override OS-level Do Not Disturb
when the platform does not permit it.

UI must clearly distinguish: - app preference; - browser permission; -
OS/device notification controls; - external channels such as SMS/call.

------------------------------------------------------------------------

# 136. Multi-Device User

A logged-in user may have: - desktop browser; - phone; - tablet; -
multiple browser profiles.

Model:

``` text
User
 ├─ Contact endpoints
 └─ Device subscriptions[]
      ├─ capability
      ├─ last_seen
      ├─ push subscription
      ├─ permission state
      └─ revoked/expired
```

Rules: - stale push subscriptions are cleaned up; - logout/revocation
can remove scoped device subscription; - acknowledgement on one device
MAY suppress redundant low-priority notifications on others; - critical
policy may still target multiple devices/channels; - do not assume one
account = one device.

------------------------------------------------------------------------

# 137. Low-Battery / Low-Bandwidth Notification Behavior

When client indicates low-power/degraded mode: - reduce non-critical
polling; - avoid auto-loading notification media; - use concise text; -
defer optional thumbnails; - preserve urgent status; - do not require
app to remain open.

Server-side notification delivery MUST NOT depend on the page remaining
active.

------------------------------------------------------------------------

# 138. Notification Center

All device classes SHOULD have an in-product Notification Center backed
by canonical notification state.

Show: - unread; - urgency; - event/case; - timestamp; -
superseded/cancelled; - acknowledgement/action required.

Desktop may use panel.

Tablet may use panel/sheet.

Mobile may use dedicated screen/sheet.

OS push is a delivery mechanism, not the system of record.

------------------------------------------------------------------------

# 139. Cross-Device Draft / Action Safety

For forms/actions: - preserve draft locally where safe; - prevent
accidental duplicate submit after rotation/reconnect; - use idempotency
keys; - show pending/sent/failed state; - avoid optimistic "completed"
for critical server-side actions until acknowledged; - allow retry
without creating duplicate incident/task.

------------------------------------------------------------------------

# 140. Cross-Device Accessibility

Required across all classes: - WCAG-aligned semantic structure as
project policy requires; - text scaling; - screen reader labels; -
keyboard access on desktop/tablet keyboard; - touch targets; -
non-color-only status; - reduced motion; - sufficient contrast; - focus
management; - list alternatives to complex maps; - alerts conveyed
visually and semantically, not sound alone.

Audio/vibration MAY supplement but never be the sole critical signal.

------------------------------------------------------------------------

# 141. Cross-Device Performance Strategy

## Mobile

Prioritize: - critical text/state; - viewport map; - small thumbnails; -
lazy media; - reduced background work.

## Tablet

Balance map/detail and media.

## Desktop

May prefetch more operational context where bandwidth/policy permits.

Device class alone MUST NOT decide privacy/authorization.

Performance adaptation MUST consider actual capability/network signals
where available.

------------------------------------------------------------------------

# 142. Responsive Component Contract

Core components MUST explicitly support compact/medium/expanded modes:

``` text
EmergencyShell
EmergencyMap
NearbyPanel
IncidentPreview
IncidentDetail
AlertBanner
DataStatus
LayerControl
ReportFlow
CaseCard
NeedCard
ResponderTaskCard
NotificationCenter
MediaViewer
ConsentSheet
StepUpGate
```

No P0 component may ship as desktop-only.

------------------------------------------------------------------------

# 143. Responsive Visual QA Matrix

Minimum QA matrix MUST include representative widths/modes, not exact
device brands only:

``` text
Compact narrow phone
Compact large phone
Phone landscape
Tablet portrait
Tablet landscape
Tablet split-screen
Desktop narrow
Desktop standard
Desktop wide
Large text / 200% zoom where applicable
Reduced motion
Keyboard-only
Screen reader smoke test
Slow/degraded network
```

Test both anonymous and authenticated/operational projections where
applicable.

------------------------------------------------------------------------

# 144. Notification QA Matrix

Test:

``` text
Browser active / inactive
Notification permission allowed / denied / not asked
Push supported / unsupported
Logged in / anonymous
One device / multiple devices
Online / offline / reconnect
Alert active / updated / cancelled
Low priority / urgent / critical
Acknowledged / unacknowledged
Sensitive / public-safe content
Auth service available / unavailable
Expired deep link
Revoked device subscription
```

------------------------------------------------------------------------

# 145. Review Passes 91--100

## Pass 91 --- Responsive ≠ scaled desktop

**Gap:** Layout behavior by device class was not normative.\
**Fix:** compact/medium/expanded interaction contracts.

## Pass 92 --- Tablet as first-class device

**Gap:** Tablet could fall into stretched mobile/desktop layout.\
**Fix:** touch-first split view + portrait/landscape/split-screen
behavior.

## Pass 93 --- Mobile emergency ergonomics

**Gap:** Critical actions could be buried or keyboard/safe-area
obstructed.\
**Fix:** one-hand, bottom-sheet, safe-area and virtual-keyboard
requirements.

## Pass 94 --- Desktop operational density

**Gap:** Desktop did not formally exploit multi-panel/keyboard
workflows.\
**Fix:** map/list/detail coexistence and keyboard-efficient operation.

## Pass 95 --- Reflow/state continuity

**Gap:** rotation/resize could lose incident/draft/map state or
duplicate action.\
**Fix:** persistent view state + idempotent action contract.

## Pass 96 --- Device-aware notification selection

**Gap:** channels existed but device capability resolution was not
explicit.\
**Fix:** capability resolver + contact graph + policy-driven channel
selection.

## Pass 97 --- Notification permission friction

**Gap:** browser permission could be requested too early and harm public
access.\
**Fix:** contextual permission request; denial never blocks emergency
information.

## Pass 98 --- Multi-channel duplication/privacy

**Gap:** multiple devices/channels could cause alert storms or
lock-screen leaks.\
**Fix:** semantic dedup, acknowledgement suppression and
sensitivity-safe content.

## Pass 99 --- Deep-link/critical failover

**Gap:** notification could open generic home or rely solely on Web
Push.\
**Fix:** action-specific safe deep links + configured SMS/LINE/voice
failover.

## Pass 100 --- Cross-device production verification

**Gap:** no formal device/notification QA gate.\
**Fix:** responsive and notification QA matrices + production gate
below.

------------------------------------------------------------------------

# 146. R1.6 Negative / Acceptance Tests

Implementation MUST prove:

1.  mobile user can report an emergency one-handed without horizontal
    scrolling;
2.  virtual keyboard cannot hide final critical submit/action;
3.  mobile map marker opens usable bottom sheet;
4.  tablet landscape supports map + detail simultaneously;
5.  tablet split-screen degrades to valid compact/medium layout;
6.  tablet UI does not depend on hover;
7.  desktop supports map/list/detail without requiring multiple
    monitors;
8.  keyboard user can reach map-equivalent incident list and actions;
9.  orientation change preserves selected incident and unsent draft;
10. resize does not duplicate submission/task;
11. 200% text/zoom does not hide critical controls;
12. denied notification permission does not block public emergency use;
13. notification permission is not requested automatically on first page
    load;
14. anonymous public alert subscription works where enabled without
    account;
15. unsupported Web Push falls back according to configured policy;
16. notification tap opens correct event/case/action rather than generic
    home;
17. restricted notification deep link step-ups and resumes intended
    action;
18. sensitive medical/private data is absent from public lock-screen
    notification text;
19. same notification revision is not spammed across devices/channels
    contrary to policy;
20. acknowledgement on one device updates canonical notification state;
21. alert cancellation supersedes previous active notification state;
22. stale/revoked push subscription cannot receive new restricted
    updates;
23. critical workflow does not rely solely on browser being open;
24. offline reconnect does not duplicate report/action;
25. low-bandwidth mode does not auto-fetch heavy notification media;
26. notification center shows superseded/cancelled state;
27. OS DND capability is represented honestly; app does not claim
    impossible bypass;
28. public and restricted projections remain identical in authorization
    semantics across mobile/tablet/desktop;
29. device detection failure falls back to usable responsive UI;
30. client capability profile is not used as authorization evidence.

------------------------------------------------------------------------

# 147. R1.6 Production Gate

Production promotion requires evidence for:

### Responsive UX

-   compact/mobile QA;
-   tablet portrait/landscape/split-screen QA;
-   desktop narrow/standard/wide QA;
-   touch/mouse/keyboard QA;
-   large-text/reduced-motion accessibility QA;
-   orientation/reflow state continuity;
-   low-end/degraded-network smoke test.

### Notifications

-   permission lifecycle;
-   Web Push supported/unsupported;
-   anonymous subscription where enabled;
-   multi-device dedup;
-   acknowledgement;
-   update/cancel;
-   sensitive-content privacy;
-   deep-link + step-up continuation;
-   failover;
-   offline/reconnect;
-   auth-outage behavior;
-   stale subscription cleanup.

### Operational rule

A feature is NOT considered complete merely because it renders at three
viewport widths. It must remain **operationally usable, privacy-correct,
state-consistent and notification-correct** on each supported device
class.

**End of Spec 260 R1.6 --- 100-Pass Cumulative Review / Cross-Device UX
& Device-Aware Notification Hardening**

# 148. Review Passes 101--110 --- Cross-System Consistency & Human Factors

Passes 101--110 are additional to the previous 100 cumulative reviews.
All fixes below are normative in R1.7.

## Pass 101 --- Notification ↔ Canonical Case-State Race

**Gap:** A notification can be generated from revision N while the
incident has already advanced to N+1 (resolved, cancelled, reassigned,
escalated).

**Fix:** - Every actionable notification MUST reference canonical entity
ID + revision/event ID. - On open/action, server MUST re-evaluate
current state and authorization. - Notification payload is never
authoritative state. - If obsolete, UI explains the current state and
routes to the valid action. - Actions such as `Accept Task`, `Evacuate`,
`Acknowledge`, `Confirm Delivery` MUST use concurrency/idempotency
guards. - Superseded critical instructions MUST be actively reconciled
where channel supports it.

## Pass 102 --- Cross-Device Concurrent Editing

**Gap:** Phone, tablet and desktop may update the same case/need/task
simultaneously.

**Fix:** - State-changing requests require idempotency key and expected
revision/version where conflict matters. - Never use blind
last-write-wins for safety-critical structured state. - Conflicts MUST
be merged deterministically when fields are independent or surfaced for
resolution when not. - Free-text updates remain append-only timeline
events where practical. - Client shows `updated elsewhere` and refreshes
canonical state. - Offline edits reconcile using causal/revision
metadata.

## Pass 103 --- Lost / Stolen / Shared Device

**Gap:** Persistent emergency sessions or push subscriptions may expose
private case data after device loss or shared-device use.

**Fix:** - Device/session revocation MUST be supported. - Sensitive
cached data MUST have bounded retention and logout/session-expiry
cleanup. - Anonymous ephemeral case capability MUST be
revocable/rotatable. - Push subscription MUST be scoped to
device/session and removable independently. - Shared/public-device mode
SHOULD minimize persistence. - Public emergency information remains
accessible after logout without exposing prior private case context.

## Pass 104 --- Map/Push/JS Failure Fallback

**Gap:** Critical information could become inaccessible when WebGL,
JavaScript-heavy map rendering, Push API or a browser feature fails.

**Fix:** - Public alerts and critical incident information MUST have a
usable non-map/list/text representation. - If MapLibre/WebGL fails, fall
back to nearby/event list and textual location. - If Push unsupported,
expose alternative subscription/delivery options where configured. -
Critical report form SHOULD retain a minimal functional path under
partial client-feature failure. - No critical instruction may exist only
inside a canvas/map marker. - Feature failure MUST be observable and
clearly communicated.

## Pass 105 --- Emergency Localization & Language Switching

**Gap:** Multilingual data was covered, but urgent UX could still strand
a user in the wrong interface language.

**Fix:** - Language switch MUST be reachable from public emergency
surfaces without login. - Switching language MUST preserve selected
incident/map/action. - Critical static instructions SHOULD use reviewed
translations/templates where available. - Original source language
remains accessible where useful. - Machine-translated content MUST be
distinguishable when operationally material. - Numeric values, units,
addresses, times and emergency numbers require locale-safe rendering
without semantic alteration. - RTL/local script support is required when
a tenant enables those languages.

## Pass 106 --- Units, Time Zones & Administrative Boundaries

**Gap:** Disaster operations can cross regions with different units/time
zones and ambiguous place names.

**Fix:** - Store canonical measurement units and convert only at
presentation boundaries. - Display unit explicitly for depth, distance,
wind, temperature and quantity. - Store timestamps with unambiguous
instant + source timezone/offset where known. - Public UI uses local
context but detail/provenance can expose exact timestamp basis. -
Administrative boundary/version/source MUST be explicit where used for
alerts/coverage. - Never infer operational jurisdiction solely from
reverse-geocoded display text.

## Pass 107 --- Notification Fatigue / Escalation Discipline

**Gap:** Correct notifications can still become harmful/noisy when
repeated too frequently.

**Fix:** - Notification policy MUST support semantic grouping, cooldown,
escalation and material-change detection. - Do not notify merely because
a polling timestamp changed. - Critical updates are based on meaningful
state/revision changes. - Repeated unacknowledged critical alerts follow
escalation policy rather than infinite identical pushes. - User may tune
non-critical categories; life-safety policy remains explicitly
governed. - Operations dashboard SHOULD expose notification volume,
suppression, failure and acknowledgement rates.

## Pass 108 --- Public ↔ Authenticated ↔ Verified Transition Across Devices

**Gap:** A user may start anonymously on phone, authenticate on desktop
and later become verified on tablet; access/session state can diverge.

**Fix:** - Case identity and account linkage are server-side
canonical. - Device sessions re-resolve access policy rather than
assuming old authorization. - Verification upgrade/downgrade/revocation
propagates to active sessions. - Anonymous case claim on one device does
not invalidate legitimate ongoing emergency processing. - Public deep
links remain public-safe even when opened on authenticated devices
unless user explicitly enters restricted flow. - Access elevation MUST
NOT cause public cache/projection contamination.

## Pass 109 --- Client State Recovery / Reinstallation / Cache Corruption

**Gap:** PWA/browser storage can be cleared, corrupted or replaced.

**Fix:** - Client cache is never the sole copy of submitted emergency
state once server acknowledgement occurred. - Server-issued case
reference can restore authorized state. - Corrupt local cache triggers
safe reset, not silent state fabrication. - Service Worker upgrade MUST
have migration/rollback strategy for critical cached schemas. - Pending
offline writes MUST have durable queue metadata where platform allows
and visibly show unresolved state. - Never report a queued local action
as server-accepted before acknowledgement.

## Pass 110 --- End-to-End Human-Factors Safety

**Gap:** Individual features can pass tests while combined emergency
workflow remains too cognitively demanding.

**Fix:** - Run scenario-based usability tests under time pressure and
degraded conditions. - Critical screens prioritize: danger → required
action → location/context → confirmation. - Avoid jargon on
citizen-facing emergency flows. - Confirmation messages must say what
was actually recorded/sent, not vague "success". - Repeated questions
are suppressed using Case Memory unless freshness/change requires
re-asking. - Error recovery provides next action. - Do not use dark
patterns, registration pressure or promotional content in active
emergency flow. - Measure task completion/error rate, not engagement
time.

------------------------------------------------------------------------

# 149. R1.7 New / Extended Contracts

``` text
ActionRevisionGuard {
  entity_id
  expected_revision
  notification_event_id?
  idempotency_key
}

CrossDeviceConflict {
  entity_id
  local_revision
  canonical_revision
  conflicting_fields[]
  resolution_state
}

DeviceSession {
  device_subscription_id
  session_scope
  last_seen
  sensitivity_class
  revoked_at
}

ClientFallbackState {
  map_available
  javascript_capability
  push_available
  fallback_surface
}

LocaleContext {
  ui_language
  source_language
  timezone
  unit_system
  administrative_context
}

NotificationSuppressionDecision {
  semantic_key
  material_change
  cooldown
  suppression_reason
  escalation_state
}

ClientSyncState {
  canonical_revision
  local_revision
  pending_events[]
  last_acknowledged_event
  recovery_state
}
```

------------------------------------------------------------------------

# 150. R1.7 Negative / Acceptance Tests

Implementation MUST prove:

1.  obsolete notification cannot execute an action against stale task
    revision;
2.  opening cancelled alert notification shows current
    cancelled/superseded state;
3.  simultaneous phone/tablet update cannot silently overwrite
    safety-critical fields;
4.  independent concurrent fields can reconcile without losing either
    update;
5.  offline edit conflict is surfaced/reconciled rather than
    last-write-wins;
6.  revoked device session loses restricted case access;
7.  revoked push subscription receives no new restricted notifications;
8.  logout/shared-device cleanup removes bounded sensitive local state;
9.  WebGL failure still exposes critical events through list/text view;
10. Push unsupported does not make public alerts unavailable;
11. critical report remains possible through supported degraded UI;
12. language switch preserves current incident/action;
13. machine translation does not silently alter critical
    number/unit/address;
14. measurement is never displayed without appropriate unit;
15. timezone conversion does not reorder canonical audit history;
16. reverse-geocoder result alone cannot determine operational
    jurisdiction;
17. non-material refresh does not generate duplicate user notification;
18. unacknowledged critical notification follows escalation policy
    rather than infinite identical spam;
19. verification revocation propagates to active device sessions;
20. authenticated opening of public deep link does not expose restricted
    projection automatically;
21. cache corruption cannot fabricate server-accepted state;
22. queued offline report is visibly distinct from acknowledged report;
23. service-worker upgrade cannot discard acknowledged case state;
24. repeated citizen question is suppressed when current sufficient
    answer exists;
25. stale answer can trigger an explicit update question rather than
    duplicate interrogation;
26. citizen emergency flow contains no registration/marketing dark
    pattern;
27. error state provides actionable recovery;
28. confirmation identifies what was actually submitted;
29. combined mobile degraded-network scenario completes minimum
    emergency report;
30. combined responder scenario remains consistent across notification →
    map → task → completion.

------------------------------------------------------------------------

# 151. Human-Factors Scenario Suite

At minimum test these end-to-end scenarios:

### HF-A --- Injured bystander, one hand, poor signal

Mobile, no login, one-hand use, location approximate, upload deferred.
Must submit critical report and receive durable
acknowledgement/reference.

### HF-B --- Family member checking remotely

Desktop public map, selects another area, sees fresh/stale/source
status, public media and warnings without location permission/login.

### HF-C --- Helper transition

Tablet public-safe need → chooses help → step-up → verification →
returns to same case → scoped exact disclosure.

### HF-D --- Responder multi-device

Task notification on phone; command detail open on tablet; status update
from phone appears canonically on tablet without conflict.

### HF-E --- Auth outage

Anonymous public information/reporting works; verified operation clearly
reports temporary identity-service limitation without corrupting state.

### HF-F --- Map renderer failure

Public warning/event list remains available and actionable.

### HF-G --- Alert supersession

Urgent warning received; alert later updated/cancelled; old notification
cannot continue to present obsolete instruction as current.

### HF-H --- Language switch mid-case

User switches language during report; draft/location preserved; critical
values unchanged.

### HF-I --- Lost device

Old phone revoked; new device restores authorized case; old device
cannot receive restricted updates.

### HF-J --- Regional surge

Public reads spike; optional layers degrade; emergency writes and
critical notifications remain protected.

------------------------------------------------------------------------

# 152. R1.7 Production Gate

Promotion requires evidence for:

-   notification/canonical-state race tests;
-   multi-device conflict/revision tests;
-   device/session revocation tests;
-   map/WebGL/push fallback tests;
-   localization/unit/timezone tests;
-   notification fatigue/escalation tests;
-   cross-device access-transition tests;
-   service-worker/client-cache recovery tests;
-   combined human-factors scenario suite.

**Completion criterion:** passing component tests is insufficient. At
least the minimum emergency workflow must pass end-to-end on
compact/mobile, tablet and desktop under normal and one
degraded-condition profile.

**End of Spec 260 R1.7 --- 110-Pass Cumulative Review / Cross-System
Consistency, Recovery & Human-Factors Hardening**

# 153. Cloudflare Surge Architecture --- Non-Negotiable Principle

Emergency traffic is bursty. A regional disaster may create extreme
concurrent reads, reports, media uploads, alert subscriptions, map
refreshes and notification fan-out within minutes.

The architecture MUST optimize for:

``` text
EDGE-FIRST READS
SHORT SYNCHRONOUS WRITE PATH
ASYNC ENRICHMENT
PRIORITY-ISOLATED BACKGROUND WORK
BOUNDED DOWNSTREAM CONCURRENCY
PRECOMPUTED SITUATION PRODUCTS
GRACEFUL DEGRADATION
```

The user-facing request path MUST NOT synchronously wait for: - LLM
analysis; - news discovery; - media AI; - embeddings; - non-critical
geocoding enrichment; - external feed aggregation; - large notification
fan-out; - daily/area summary generation; - cross-source corroboration
beyond the minimum needed to accept the report.

Critical intake target:

``` text
validate minimum payload
→ authorize/public policy
→ durable canonical write / event
→ enqueue follow-up work
→ acknowledge user
```

------------------------------------------------------------------------

# 154. Cloudflare Execution Placement

Use Cloudflare capabilities deliberately; do not turn every capability
into a new authority.

## Workers

Use for: - public/read API; - auth/access decisions; - lightweight
validation; - projection; - short deterministic transforms; - queue
production; - cache control; - short synchronous critical operations.

## Queues

Use for burst absorption and asynchronous work: - source ingestion; -
normalization; - enrichment; - geocoding; - news processing; - media
processing requests; - AI analysis requests; - embedding/index
updates; - projection invalidation; - notification fan-out; - analytics
events; - summary refresh.

Use multiple priority/workload queues. Do NOT create one global
emergency queue.

## Workflows

Use for durable multi-step jobs that: - wait/retry; - span external
APIs; - require staged processing; - need durable continuation; - run
research/synthesis pipelines; - perform scheduled situation brief
generation.

Cloudflare Workflow is an execution mechanism under SmartAIHub Durable
Orchestration Kernel / `worker_jobs`, not an independent source of
orchestration authority.

## Durable Objects

Use only where per-key coordination/realtime state materially helps: -
realtime incident/case room; - area/channel realtime fan-out; -
connection coordination; - coalescing/thundering-herd control where
justified.

Prefer WebSocket Hibernation for applicable server-side realtime
channels.

Do NOT put global authoritative incident truth only inside Durable
Object memory.

## KV

Use for: - normalized public feed cache; - public projection
fragments; - non-authoritative configuration/cache; - coarse summary
cache.

Do not use a hot single KV key as a high-frequency counter/state
authority.

## R2

Use for: - evidence/media; - public-safe derivatives; - source snapshots
where policy permits; - generated brief artifacts; - large ingest
artifacts.

## PostgreSQL/PostGIS via Hyperdrive

Remains authoritative for: - incident; - need; - task; - observation; -
geometry; - resource; - fulfillment; - audit; - durable operational
state.

Hyperdrive pool MUST be sized against actual origin DB capacity; edge
concurrency MUST NOT be allowed to translate into unbounded origin DB
concurrency.

## Vectorize

Use for semantic retrieval: - news/document retrieval; -
incident/context knowledge; - related-source discovery; - skill/RAG
retrieval.

It remains non-authoritative for geographic truth.

------------------------------------------------------------------------

# 155. Priority Queue Topology

At minimum separate workload classes:

``` text
Q0_CRITICAL
  life-safety follow-up
  critical state propagation
  critical alert fan-out

Q1_OPERATIONAL
  incident normalization
  dispatch-related enrichment
  responder updates
  access graph updates

Q2_INTELLIGENCE
  news discovery/enrichment
  source corroboration
  AI classification
  semantic indexing

Q3_SUMMARY
  nearby summaries
  regional briefs
  scheduled situation reports
  daily summaries

Q4_MEDIA_ANALYSIS
  image/video/audio analysis
  derivative generation

Q5_ANALYTICS
  non-critical metrics
  aggregate learning
```

A backlog or rate limit in Q2--Q5 MUST NOT starve Q0.

Queue messages SHOULD carry references, not large media bytes.

------------------------------------------------------------------------

# 156. Rate-Limit Isolation / Backpressure

Every external dependency MUST have a provider budget:

``` text
ProviderBudget {
  provider
  operation
  max_concurrency
  request_rate
  token_or_cost_budget
  retry_policy
  circuit_state
  priority_reservation
}
```

Rules: - protect reserved capacity for critical operations where
provider permits; - use exponential backoff + jitter; - honor provider
retry hints; - circuit-break repeated failures; - batch/coalesce where
possible; - cache before calling external provider; - use
pull/controlled consumers when downstream capacity must be strictly
bounded; - queue backlog is preferable to cascading failure for
non-real-time work; - never retry non-idempotent effects blindly.

------------------------------------------------------------------------

# 157. Workers AI / LLM Capacity Policy

LLM/AI MUST NOT be a prerequisite for accepting a critical emergency
report.

AI workloads are classified:

``` text
REALTIME_REQUIRED
NEAR_REALTIME
BACKGROUND
BATCH
```

Examples: - deterministic intake validation → realtime; - short intent
extraction → realtime if capacity available, deterministic fallback
otherwise; - news classification → background; - embedding many articles
→ batch; - daily summary → batch/background; - historical media
enrichment → batch.

For supported workloads, asynchronous AI batch processing SHOULD be
considered when human interaction is not waiting.

Provider/model rate limits MUST be encoded in the Capability Resolver /
provider budget rather than discovered only after 429s.

AI degradation:

``` text
preferred model
→ cheaper/faster model
→ alternate provider
→ deterministic Skill
→ cached/previous verified summary + explicit freshness
```

Never fabricate a current summary when AI providers are unavailable.

------------------------------------------------------------------------

# 158. Skill-First Emergency Intelligence

All higher-level intelligence SHOULD be exposed through
discoverable/versioned Skills rather than hard-wired model prompts.

Core Skill families:

``` text
SituationIntakeSkill
NearbySituationSkill
AreaBriefSkill
UrgentFactsSkill
PreparednessSkill
NewsDiscoverySkill
NewsVerificationSkill
EventExtractionSkill
GeoResolutionSkill
EventCorrelationSkill
HazardSynthesisSkill
AccessImpactSkill
ResourceGapSkill
DemandForecastSkill
PublicBriefSkill
ResponderBriefSkill
CommandBriefSkill
DailySituationReportSkill
ChangeSinceLastViewSkill
RumorConflictSkill
SourceProvenanceSkill
```

Each Skill declares: - inputs; - outputs/schema; - required
capabilities; - source requirements; - confidence/provenance behavior; -
cost class; - latency class; - sync/async preference; - fallback; -
permission/projection; - cacheability; - version.

Skill First means the orchestrator can discover and compose these
capabilities without loading every implementation as a Tool.

------------------------------------------------------------------------

# 159. Situation Intelligence Products

Users should not need to inspect every marker.

Precompute/cache situation products:

## Nearby Situation Brief

For selected/current area: - most urgent nearby hazards; - what changed
recently; - road/access impacts; - active warnings; -
shelters/facilities; - major assistance needs; - verified important
events; - freshness/coverage caveats; - recommended preparedness actions
based on authoritative policy/content.

## Urgent Facts

A compact 3--7 item prioritized list: - evacuation; - rising hazard; -
power/water/road loss; - critical facility change; - major rescue
event; - authoritative warning.

## Area Brief

Human-readable summary plus structured facts for
district/province/geofence.

## Change Since Last View

Only material changes since user last opened the area/case.

## Daily Situation Report

Configurable time: - situation overview; - major events; - new/resolved
incidents; - warnings; - infrastructure; - access; - resource gaps; -
response progress; - expected next risks; - preparedness; -
source/freshness/confidence.

Different projections for public/responder/command.

------------------------------------------------------------------------

# 160. Brief Materiality Engine

Do not summarize everything equally.

Candidate facts receive a deterministic/auditable materiality assessment
using factors such as: - life-safety impact; - affected population; -
severity; - geographic relevance; - rate of change; - infrastructure
impact; - evacuation impact; - source confidence; - recency; -
novelty; - operational relevance.

LLM MAY explain/rank within policy constraints but MUST NOT silently
override hard life-safety priority rules.

The brief MUST distinguish: - verified fact; - official statement; -
sensor observation; - citizen report; - media report; - AI inference; -
forecast; - unresolved conflict.

------------------------------------------------------------------------

# 161. News Intelligence Pipeline

SmartAIHub SHOULD proactively discover high-value news relevant to
active hazards/areas.

Pipeline:

``` text
Source Discovery
→ Fetch
→ Normalize
→ Extract entities/events
→ Resolve geography
→ Detect duplicate story/event
→ Cross-source corroboration
→ Materiality assessment
→ Link to existing HazardEvent/Incident OR create EventCandidate
→ Human/policy verification when required
→ Public/operational projection
→ Map marker/area
→ Situation brief
```

Sources MAY include: - authoritative agencies; - local authorities; -
trusted news publishers; - configured feeds/APIs/RSS; - other
tenant-approved sources.

Web/news intelligence is evidence, not automatic truth.

------------------------------------------------------------------------

# 162. News → Map Event Candidate

A credible report such as:

> Major condominium evacuation due to severe flooding and power loss;
> approximately 10,000 residents affected.

SHOULD be extractable into:

``` text
EventCandidate {
  candidate_id
  source_refs[]
  headline
  event_type
  hazard_type
  extracted_location
  geo_confidence
  affected_population?
  infrastructure_impacts[]
  evacuation_status
  observed/published time
  source_confidence
  corroboration
  materiality
  proposed_geometry
  relation_candidates[]
}
```

Important: - AI-created candidate is NOT immediately authoritative
incident truth. - High-confidence authoritative source may be
auto-published as `SOURCE-ATTRIBUTED EVENT` according to policy. - Other
cases may require corroboration/operator review. - Map marker MUST
visibly show source/provenance/verification. - approximate article
location MUST NOT be presented as exact building coordinates unless
resolved with sufficient evidence. - later
correction/update/cancellation supersedes, never silently overwrites
history.

------------------------------------------------------------------------

# 163. Event Correlation / Duplicate News

Ten articles about the same evacuation MUST NOT create ten map
incidents.

Use: - normalized entity names; - spatial proximity; - temporal
overlap; - hazard/event type; - semantic similarity; - affected
facility; - official references; - source links.

Model:

``` text
NewsDocument[]
     ↓
NewsStoryCluster
     ↓
EventCandidate
     ↓
HazardEvent / Incident relation
```

Preserve every source for provenance.

------------------------------------------------------------------------

# 164. Active Research Triggering

Research SHOULD be event-driven, not indiscriminate continuous crawling.

Triggers: - new high-severity hazard; - unusual report cluster; - major
sensor threshold; - official warning; - infrastructure failure; -
evacuation; - high-impact facility event; - rapid incident growth; -
operator request; - scheduled area refresh.

Trigger determines: - search scope; - geographic radius; - source set; -
time window; - cost budget; - Skill pack; - refresh cadence.

This integrates with Continuous Research concepts without creating
duplicate research authority.

------------------------------------------------------------------------

# 165. Research Budget & Stop Conditions

Every autonomous research run MUST have: - objective; - incident/area
scope; - maximum duration; - max queries/provider calls; - token/cost
budget; - source diversity target; - stop conditions; - freshness
target; - output schema.

Stop when: - sufficient authoritative confirmation exists; - no material
new information after defined rounds; - budget exhausted; -
source/provider degraded; - event resolved and policy no longer requires
refresh.

P0 operations cannot be starved by research budget.

------------------------------------------------------------------------

# 166. Background Run Classification

## Must remain synchronous

-   minimum emergency intake acknowledgement;
-   critical authorization decision;
-   exact state-changing command validation;
-   public cached/read response where available;
-   task accept/decline acknowledgement;
-   explicit user action requiring immediate result.

## Prefer background

-   news discovery;
-   external feed refresh;
-   corroboration;
-   media AI;
-   embeddings;
-   translation enrichment;
-   event clustering;
-   large geocoding batches;
-   notification fan-out;
-   summary generation;
-   analytics;
-   public derivative generation.

## Durable workflow

-   multi-source research;
-   long-running incident follow-up;
-   scheduled summary;
-   escalation waiting for acknowledgement;
-   retry-heavy external integration;
-   complex media pipeline.

------------------------------------------------------------------------

# 167. Summary Cache / Precomputation

Do not invoke an LLM every time a user opens the map.

Maintain revision-aware:

``` text
AreaSituationSnapshot
NearbyBrief
UrgentFacts
DailySituationReport
CommandBrief
```

Regenerate when: - material event changes; - alert revision changes; -
important infrastructure/access changes; - freshness expires; -
scheduled refresh; - operator requests.

Serve cached brief immediately with: - generated_at; -
based_on_data_through; - source count; - confidence/coverage; -
revision.

Optional background refresh may follow.

------------------------------------------------------------------------

# 168. Realtime Update Strategy

Not every client needs every event.

Subscriptions SHOULD be scoped by: - area/geofence; - incident; -
role; - visible layers; - severity/materiality.

Realtime payloads SHOULD be compact invalidation/delta events rather
than complete state dumps.

Client:

``` text
receive delta/revision
→ update small local state OR
→ refetch affected projection
```

This reduces fan-out and protects database/API capacity.

Durable Objects MAY coordinate realtime channels where justified;
WebSocket Hibernation SHOULD be used for applicable idle-heavy channels.

------------------------------------------------------------------------

# 169. Database Surge Protection

PostgreSQL/PostGIS is authoritative but MUST be protected.

Requirements: - Hyperdrive; - tuned pool below origin DB safe maximum; -
short transactions; - indexes for spatial/status/time/tenant queries; -
precomputed/public projections where useful; - edge cache for anonymous
public reads; - queue non-critical writes/enrichment; - avoid per-marker
N+1; - batch inserts/upserts; - partition/archive strategy for
high-volume observations/audit where justified; - load shedding for
optional queries; - query timeout classes; - read-heavy public map MUST
not directly hammer origin for every pan/zoom.

------------------------------------------------------------------------

# 170. Disaster Surge Modes

System modes:

``` text
NORMAL
SURGE
REGIONAL_DISASTER
EXTREME_DEGRADED
```

Mode may alter: - cache TTL; - refresh cadence; - queue concurrency; -
optional layer availability; - AI model tier; - summary cadence; -
public media quality; - analytics sampling; - non-critical notification
behavior.

Never degrade: - emergency intake; - canonical critical state write; -
critical alert; - authorized critical task state; - minimum public
safety information.

------------------------------------------------------------------------

# 171. AI Brief UX

Primary public/citizen surface SHOULD expose a concise intelligence
card.

Example:

``` text
สถานการณ์ใกล้คุณ — อัปเดต 07:42

เร่งด่วน
• มีคำสั่งอพยพบริเวณ ...
• ถนน ... ปิดจากน้ำสูง
• อาคาร ... อยู่ระหว่างอพยพ หลังไฟฟ้าถูกตัด

ภาพรวม
น้ำยังเพิ่มใน 3 จุด ขณะที่ 2 จุดเริ่มทรงตัว
ศูนย์พักพิงใกล้พื้นที่เปิด 4 แห่ง

ควรเตรียม
• ชาร์จโทรศัพท์/Power Bank
• เตรียมยาและเอกสารจำเป็น
• หลีกเลี่ยงเส้นทาง ...

ข้อมูลใหม่ตั้งแต่ครั้งล่าสุด: 5 รายการ

[ดูแผนที่] [ดูเหตุการณ์สำคัญ] [แหล่งข้อมูล]
```

The brief MUST: - be skimmable; - separate urgent from context; - show
freshness; - expose source/provenance; - avoid false certainty; - adapt
to public/citizen/responder/command projection.

------------------------------------------------------------------------

# 172. Proactive Brief Delivery

Users MAY subscribe to: - immediate critical changes; - nearby material
changes; - morning/evening brief; - daily situation report; - selected
hazard/area.

Delivery follows existing device-aware notification policy.

A summary notification should link to the full current brief and map
context.

Do not send a new brief merely because a schedule fired if there is no
meaningful update unless user explicitly requested a fixed daily report.

------------------------------------------------------------------------

# 173. Cloudflare Observability for Surge

Monitor at minimum: - Worker request rate/error/p95/p99; - cache
hit/miss; - origin DB queries/connections/latency; - Hyperdrive pool
pressure; - queue ingress/egress/backlog/oldest age/retries/DLQ; -
per-priority queue health; - Workflow running/waiting/retry/failure; -
Durable Object connection count/CPU; - realtime fan-out; - provider
429/5xx/circuit state; - AI request rate/cost/fallback; - news fetch
success/freshness; - brief generation latency/freshness; - notification
fan-out/backlog/acknowledgement.

Alert on backlog age, not only queue size.

------------------------------------------------------------------------

# 174. Review Passes 111--120

## Pass 111 --- Synchronous hot-path overload

**Gap:** enrichment/AI could leak into user request latency.\
**Fix:** strict synchronous/background classification.

## Pass 112 --- Queue priority isolation

**Gap:** one shared queue could let news/AI starve life-safety work.\
**Fix:** Q0--Q5 workload isolation and protected capacity.

## Pass 113 --- Provider rate-limit cascade

**Gap:** autoscaled consumers could overwhelm bounded downstream APIs.\
**Fix:** ProviderBudget, controlled concurrency, backoff, circuit
breaker, pull consumer where appropriate.

## Pass 114 --- Cloudflare execution placement

**Gap:** Workers/Queues/Workflows/DO could overlap authority.\
**Fix:** explicit role matrix under Durable Kernel/worker_jobs.

## Pass 115 --- Skill-first intelligence

**Gap:** AI analysis could become hard-coded prompts/features.\
**Fix:** versioned discoverable emergency intelligence Skill families.

## Pass 116 --- Information overload

**Gap:** rich map still requires manual marker-by-marker reading.\
**Fix:** Nearby/Area/Urgent/Change/Daily intelligence products.

## Pass 117 --- News-to-event automation

**Gap:** major reported events may wait for citizen/manual intake.\
**Fix:** proactive news discovery → EventCandidate → map/brief with
provenance and verification policy.

## Pass 118 --- AI capacity/cost

**Gap:** high-volume LLM calls can hit capacity/rate/cost ceilings.\
**Fix:** background/batch inference, model fallback, cache/precompute,
deterministic Skill fallback.

## Pass 119 --- Origin/database surge

**Gap:** edge scale can overload a finite PostgreSQL origin.\
**Fix:** Hyperdrive pool discipline, edge projections, query/load
shedding and batch writes.

## Pass 120 --- Regional-disaster operations

**Gap:** no explicit end-to-end surge certification for intelligence
workload.\
**Fix:** surge modes, observability, chaos/load gates below.

------------------------------------------------------------------------

# 175. R1.8 Negative / Acceptance Tests

Implementation MUST prove:

1.  LLM outage cannot block emergency report acceptance;
2.  news provider 429 cannot slow P0 intake;
3.  Q2 intelligence backlog cannot consume Q0 protected capacity;
4.  queue consumer autoscaling cannot exceed configured downstream
    provider concurrency;
5.  duplicate queue delivery does not duplicate incident/event side
    effects;
6.  poison message is isolated without blocking queue progress;
7.  Workflow retry remains idempotent;
8.  Workflow is subordinate to canonical worker_jobs authority;
9.  Durable Object restart/hibernation cannot lose authoritative
    incident state;
10. realtime reconnect retrieves missed canonical revision;
11. 100+ duplicate news articles can converge to one candidate event
    cluster;
12. news candidate does not become verified fact solely from LLM output;
13. high-confidence official event can follow configured
    auto-publication policy with attribution;
14. approximate news location is not exposed as exact coordinate;
15. corrected news/event supersedes old projection while preserving
    provenance;
16. opening map does not trigger per-user LLM summary generation when
    valid cached brief exists;
17. material incident change invalidates/rebuilds affected area brief;
18. stale brief displays data-through/freshness;
19. no-news/no-new-data condition does not cause fabricated summary;
20. AI provider rate limit activates fallback without cascading retries;
21. batch/background AI results reconcile to correct event revision;
22. public read surge is served predominantly from edge/projection
    cache;
23. extreme public pan/zoom load cannot exhaust DB connection pool;
24. optional analytics/media degrade before emergency writes;
25. notification fan-out is queued and does not extend critical
    state-write latency;
26. daily brief uses public-safe projection for anonymous recipients;
27. responder/command brief does not leak through public cache;
28. active research run stops at configured budget/stop condition;
29. research job cannot starve life-safety provider budget;
30. surge-mode transition is auditable and reversible;
31. queue backlog age alert fires before SLA breach;
32. regional-disaster test preserves emergency intake under simultaneous
    map/news/AI/notification load.

------------------------------------------------------------------------

# 176. R1.8 Production / Load Gate

Before production certification, test at minimum:

### Edge/public

-   cached public map surge;
-   alert/event-detail surge;
-   cache-cold burst;
-   cache stampede/coalescing.

### Writes

-   emergency-report burst;
-   incident updates;
-   offline reconnect burst;
-   media upload burst.

### Background

-   feed ingestion spike;
-   news spike;
-   AI enrichment backlog;
-   notification fan-out;
-   summary regeneration storm.

### Dependency degradation

-   PostgreSQL slow;
-   provider 429;
-   provider 5xx;
-   Workers AI busy/unavailable;
-   news source timeout;
-   queue retry/DLQ;
-   auth outage.

### Certification rule

No test passes if P0 emergency intake or canonical critical state is
lost merely because optional intelligence, news, media or analytics is
saturated.

**End of Spec 260 R1.8 --- 120-Pass Cumulative Review / Cloudflare
Surge, Skill-First Intelligence & Autonomous Situation Synthesis**

# 177. Review Passes 121--130 --- Evidence-Grounded Autonomous Intelligence

Passes 121--130 are additional to the previous 120 cumulative reviews.
All fixes below are normative R1.9 requirements.

## Pass 121 --- Source Identity, Trust and Provenance

**Gap:** News/source ingestion exists, but a URL/domain alone is not
sufficient source trust.

**Fix:** - Maintain `SourceRegistry` with source identity,
publisher/agency, source class, jurisdiction, language, acquisition
method, policy status, known official relationship and terms. - Separate
`source identity` from `claim confidence`. - An official source can
still publish stale/incorrect information; an unofficial source can
provide useful early evidence. - Trust is contextual and MUST NOT become
a universal opaque score. - Every synthesized material claim MUST retain
source references and observation/publication time.

## Pass 122 --- Claim-Level Evidence Graph

**Gap:** Article-level provenance is too coarse when one document
contains multiple claims.

**Fix:** - Extract `Claim` objects for material facts. - Link each Claim
to supporting/contradicting evidence. - Brief generation MUST operate on
claim/evidence state, not merely article summaries. - A claim may be
`UNVERIFIED`, `SUPPORTED`, `CONFLICTING`, `OFFICIAL`, `RETRACTED`,
`SUPERSEDED`. - Preserve source wording/reference for audit without
treating extracted paraphrase as source text.

## Pass 123 --- Correction / Retraction / Deletion

**Gap:** A news publisher or authority may correct, retract or delete
information after SmartAIHub has mapped it.

**Fix:** - Source refresh can emit `CORRECTED`, `RETRACTED`, `REMOVED`,
`UNAVAILABLE`. - Retraction MUST propagate to EventCandidate, map
projection and briefs. - Never silently delete prior operational
history. - If a retracted claim materially influenced a
warning/response, create an audit/reassessment event. - Cached public
projections must be invalidated.

## Pass 124 --- Rumor / Coordinated Misinformation

**Gap:** High-volume repeated posts can look like corroboration even
when they copy one origin.

**Fix:** - Corroboration counts independent evidence chains, not raw
article/post count. - Detect syndicated/copied/common-origin content
where feasible. - `10 copies of one claim != 10 independent sources`. -
High-volume low-independence reports can trigger research but not
automatic confidence inflation. - RumorConflictSkill SHOULD summarize
what is known, disputed and missing.

## Pass 125 --- AI Hallucination Containment in Briefs

**Gap:** LLM can produce fluent but unsupported situation statements.

**Fix:** - Every material generated statement MUST map to one or more
structured facts/claims or be explicitly marked
inference/recommendation. - Brief generation uses constrained structured
input. - Unsupported numbers, names, locations and causal claims MUST
fail validation. - Post-generation grounding validator checks claim
IDs/source refs. - If grounding fails, omit statement or fall back to
deterministic template. - AI MUST NOT invent preparedness instructions;
use approved policy/knowledge sources where safety-relevant.

## Pass 126 --- Geographic Ambiguity

**Gap:** News may say "คอนโด X", "ถนน Y", district nickname or
duplicated place name without exact coordinates.

**Fix:** - GeoResolutionSkill outputs candidates + confidence, not
forced coordinate. - Resolve using administrative context, article text,
known POIs, incident context and corroborating sources. - Ambiguous
location can publish as area/landmark-level marker if policy permits. -
Exact pin requires sufficient evidence. - Location correction creates
geometry revision preserving previous proposal.

## Pass 127 --- Cross-Language / Cross-Script Event Deduplication

**Gap:** Thai/English/local-language reports of the same event may
create separate clusters.

**Fix:** - Normalize multilingual entity aliases without destroying
original names. - Use transliteration/alias registry, time/space/event
semantics and source relations. - Semantic similarity alone cannot merge
incidents. - Preserve language-specific source evidence. -
Cross-language clustering must remain reversible/auditable.

## Pass 128 --- Intelligence Product Consistency

**Gap:** Public, responder and command briefs could contradict each
other if independently generated.

**Fix:** - All briefs derive from one canonical `SituationSnapshot`
revision. - Projection policy filters/generalizes facts before narrative
generation. - Lower-privilege brief may omit/generalize but MUST NOT
contradict canonical status. - Shared claim IDs enable comparison across
projections. - Brief revision displayed/traceable.

## Pass 129 --- Scheduled Brief Freshness / Empty Change

**Gap:** Scheduled daily/area reports can become stale immediately or
waste AI when nothing changed.

**Fix:** - Separate schedule trigger from generation necessity. -
Evaluate material changes since previous brief. - Fixed daily report may
still generate if user requested it, but MUST state "no material change"
when applicable. - Event-driven critical brief can preempt scheduled
report. - Long generation time must re-check canonical revision before
publication. - If stale during generation, regenerate/patch or mark
data-through revision explicitly.

## Pass 130 --- Extreme Backlog Recovery

**Gap:** After outage/disaster surge, hours of queued enrichment can
become obsolete and cause a recovery storm.

**Fix:** - Queue jobs carry relevance expiry / max-age where
applicable. - Consumers check current canonical revision before
expensive work. - Coalesce superseded jobs by entity/area where
possible. - Drop/park obsolete non-critical work with audit metrics. -
Recovery concurrency ramps gradually against downstream budgets. -
Critical current-state jobs leapfrog stale enrichment. - Dead-letter
replay is controlled, filtered and idempotent. - Do not replay every
historical summary/news enrichment merely because it was queued.

------------------------------------------------------------------------

# 178. Source Registry

``` text
SourceRegistry {
  source_id
  source_name
  source_class
  publisher_or_authority
  official_scope?
  jurisdiction?
  languages[]
  acquisition_method
  canonical_domains/endpoints[]
  policy_status
  redistribution_policy
  refresh_policy
  active
}
```

Suggested source classes:

``` text
OFFICIAL_AUTHORITY
EMERGENCY_SERVICE
INFRASTRUCTURE_OPERATOR
SENSOR_NETWORK
NEWS_PUBLISHER
LOCAL_MEDIA
CITIZEN_REPORT
NGO
ACADEMIC
OTHER
```

Source class is descriptive, not a permanent truth score.

------------------------------------------------------------------------

# 179. Claim / Evidence Graph

``` text
Claim {
  claim_id
  event_candidate_id?
  claim_type
  normalized_value
  original_language
  extracted_at
  status
  confidence
  valid_from?
  valid_until?
}

ClaimEvidence {
  claim_id
  evidence_ref
  relation: SUPPORTS | CONTRADICTS | UPDATES | RETRACTS
  independence_group
  observed_or_published_at
  extraction_method
}
```

Example:

``` text
Claim A: "Condo X is being evacuated"
  Source 1 official district post → SUPPORTS
  Source 2 local news citing district post → SUPPORTS / same independence group
  Source 3 field responder report → SUPPORTS / independent

Claim B: "10,000 people"
  Source 1 → SUPPORTS
  Source 4 → says 6,000 → CONTRADICTS
```

Brief can then say:

``` text
อาคารอยู่ระหว่างอพยพตามประกาศของ...
จำนวนผู้ได้รับผลกระทบยังมีรายงานไม่ตรงกัน
```

instead of inventing a single definitive number.

------------------------------------------------------------------------

# 180. Grounded Brief Generation Pipeline

``` text
Canonical SituationSnapshot
→ Projection Policy
→ Relevant Claims/Facts
→ Materiality Selection
→ Skill Composition
→ Structured Brief Draft
→ Grounding Validator
→ Safety/Privacy Validator
→ Narrative Renderer
→ Cache + Revision
```

Required metadata:

``` text
brief_id
area/incident
audience_projection
snapshot_revision
generated_at
data_through
claim_refs[]
source_refs[]
model/skill versions
grounding_status
freshness
```

If grounding validator fails: 1. remove unsupported statement; 2. retry
constrained generation if budget permits; 3. fall back to deterministic
structured brief.

------------------------------------------------------------------------

# 181. Source Independence

Corroboration MUST estimate evidence independence.

Signals may include: - direct attribution/citation chain; - identical
text; - shared wire source; - same video/photo; - same official post; -
publication timing; - independent field observation; - separate
sensor/authority source.

Do not expose a misleading "12 sources confirm" if 11 merely copied the
first source.

UI MAY show:

``` text
3 independent sources
8 additional reports referencing the same announcement
```

------------------------------------------------------------------------

# 182. News Refresh Lifecycle

``` text
DISCOVERED
→ FETCHED
→ EXTRACTED
→ CLUSTERED
→ CANDIDATE
→ CORROBORATING
→ PUBLISHED_SOURCE_ATTRIBUTED
→ VERIFIED / CONFLICTING
→ UPDATED
→ RETRACTED / SUPERSEDED / CLOSED
```

A map marker derived from news MUST retain its lifecycle/provenance.

------------------------------------------------------------------------

# 183. Automatic Publication Policy

Policy can decide whether an EventCandidate appears automatically.

Inputs: - source class/scope; - hazard/event type; - location
confidence; - independent corroboration; - severity/materiality; -
privacy; - contradiction; - recency.

Possible outcomes:

``` text
HOLD_FOR_RESEARCH
HOLD_FOR_OPERATOR
PUBLISH_SOURCE_ATTRIBUTED
PUBLISH_CORROBORATED
LINK_EXISTING_EVENT
REJECT_DUPLICATE
EXPIRE
```

AI recommendation is advisory to this policy; policy remains
deterministic/auditable where required.

------------------------------------------------------------------------

# 184. Preparedness Intelligence Safety

PreparednessSkill MUST separate:

1.  **authoritative instruction** --- from configured authority/policy;
2.  **general preparedness guidance** --- reviewed knowledge base;
3.  **contextual AI suggestion** --- clearly identified and safety
    constrained.

For life-safety instructions, prefer authority/approved templates.

AI MUST NOT improvise: - evacuation orders; - medication instructions; -
hazardous rescue actions; - electrical/fire/HazMat procedures; - claims
that a route/location is safe without evidence.

------------------------------------------------------------------------

# 185. Summary Personalization Without Surveillance

Nearby/area briefs MAY adapt to: - selected/current area; - saved areas
if user chose them; - role; - subscribed hazards; -
accessibility/language preferences.

Do NOT require behavioral profiling.

Public anonymous user can select an area and receive the same
public-safe intelligence without login.

------------------------------------------------------------------------

# 186. Intelligence Backlog Policy

Each background job SHOULD include:

``` text
priority
created_at
not_before?
max_age?
entity_revision?
area_revision?
cost_class
provider_budget_class
coalesce_key?
```

Before expensive execution: - is job still relevant? - is newer revision
queued/completed? - is source still current? - has event closed? - is
output already cached? - is budget still appropriate?

If no, safely skip and record reason.

------------------------------------------------------------------------

# 187. R1.9 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  official source identity does not automatically force every claim to
    VERIFIED;
2.  material brief statement can be traced to claim/evidence references;
3.  unsupported LLM number is rejected;
4.  unsupported causal statement is rejected;
5.  grounded fallback brief works when LLM repeatedly fails validation;
6.  publisher correction updates event/brief/map projection;
7.  source retraction does not erase historical audit;
8.  retracted material claim triggers reassessment where required;
9.  20 copied stories from one announcement count as one evidence
    lineage for corroboration purposes;
10. independent responder evidence can increase corroboration
    separately;
11. ambiguous place name does not become an exact coordinate;
12. later exact location creates a revision rather than overwriting
    provenance;
13. Thai and English reports of same event can cluster when evidence
    supports it;
14. semantic similarity alone cannot merge two nearby separate
    incidents;
15. public/responder/command briefs share same canonical snapshot
    revision;
16. lower-privilege brief cannot contradict current canonical event
    status;
17. scheduled brief with no material change does not invent new content;
18. critical material change can preempt scheduled summary;
19. long-running brief checks revision before publication;
20. stale generated brief exposes correct data-through revision;
21. obsolete queued enrichment is skipped before costly provider call;
22. newer entity revision can coalesce older summary jobs;
23. backlog recovery respects downstream provider concurrency;
24. critical current job leapfrogs stale background enrichment;
25. DLQ replay cannot duplicate published event side effects;
26. source deletion/unavailability is distinguishable from source
    retraction;
27. conflicting population figures remain conflicting until resolved;
28. AI cannot silently convert forecast into observed fact;
29. preparedness brief cannot invent evacuation order;
30. anonymous nearby brief works without behavioral profile/login.

------------------------------------------------------------------------

# 188. R1.9 Intelligence Quality Gate

Production promotion requires: - SourceRegistry coverage for enabled
autonomous sources; - claim-level provenance; - source-independence
tests; - correction/retraction propagation; - multilingual geo/entity
resolution tests; - grounded brief validator; - projection-consistency
tests; - backlog relevance/coalescing tests; - autonomous publication
policy tests; - preparedness safety tests.

For every critical AI-generated brief sampled in certification: -
material factual statements must be source/claim grounded; - projection
must match audience authorization; - freshness must be visible; -
contradictions must not be silently flattened; - AI inference must not
masquerade as observed/verified fact.

**End of Spec 260 R1.9 --- 130-Pass Cumulative Review /
Evidence-Grounded Intelligence, Source Trust & Backlog Recovery**

# 189. Review Passes 131--140 --- Official Interop, Fan-out & Operational Control

Passes 131--140 extend the previous 130 cumulative reviews. All fixes
are normative R1.10 requirements.

## Pass 131 --- Official Alert Ingestion / CAP Lifecycle

**Gap:** CAP output/interoperability existed, but inbound official alert
ingestion and lifecycle reconciliation were not fully specified.

**Fix:** - Add inbound official alert adapters including CAP-compatible
feeds where available. - Preserve source identifier, sender, sent time,
status, msgType, scope, references and geometry. - Support
initial/update/cancel/error/expiry semantics. - An update MUST supersede
the correct prior alert, not create an unrelated duplicate. -
Cancellation MUST propagate to map, brief, subscription and notification
state. - Never infer authenticity solely because payload is
syntactically valid CAP; adapter/source trust still applies.

## Pass 132 --- Push/Webhook/Poll Source Acquisition Strategy

**Gap:** Continuous polling every source wastes API quota and creates
synchronized spikes.

**Fix:** - Each source adapter declares acquisition mode:
`WEBHOOK/PUSH`, `STREAM`, `POLL`, `SCHEDULED_BULK`, `MANUAL`. - Prefer
push/webhook where trustworthy and available. - Poll with adaptive
interval, conditional requests/ETag/Last-Modified where supported,
jitter and backoff. - Active incident/area MAY temporarily increase
refresh frequency. - Quiet/stable sources SHOULD back off. - One
provider outage must not trigger tight retry loops.

## Pass 133 --- Scheduler / Cron Thundering Herd

**Gap:** Thousands of area briefs/feed refreshes can start on the same
minute.

**Fix:** - Scheduled background jobs require jitter/spread windows
unless exact timing is operationally required. - Use coalescing keys for
overlapping area/source refreshes. - Prefer event-driven invalidation
over fixed frequent schedules. - Protect downstream APIs with provider
budgets. - Daily reports MAY be precomputed in rolling windows before
delivery time when freshness policy permits.

## Pass 134 --- Geofence Subscription Scaling

**Gap:** Matching every new event against every subscriber does not
scale.

**Fix:** - Spatially index subscription regions. - Partition/shard
matching by spatial cell/administrative area where appropriate. -
Maintain public anonymous subscription privacy. - Event→candidate
subscriber matching MUST be bounded and batchable. - Large polygons
require decomposition/index strategy. - Subscription match result
references current event revision. - Exact private user coordinates MUST
NOT leak into public notification jobs.

## Pass 135 --- Massive Notification Fan-out

**Gap:** One regional warning may target hundreds of thousands/millions
of endpoints.

**Fix:** - Fan-out is asynchronous and partitioned. - Separate
notification intent from per-channel delivery attempts. -
Batch/provider-specific dispatch where APIs support it. - Maintain
provider-specific concurrency/rate budgets. - Dedup at notification
intent and endpoint levels. - Track delivery backlog age. - Critical
fan-out gets reserved capacity. - A single invalid endpoint cannot block
a batch/partition. - Cancellation/update can supersede queued obsolete
deliveries where possible.

## Pass 136 --- Database Degradation / Failover Semantics

**Gap:** Edge/queue resilience is insufficient if PostgreSQL is
slow/unavailable.

**Fix:** - Define DB states: `HEALTHY`, `DEGRADED`, `READ_LIMITED`,
`WRITE_LIMITED`, `UNAVAILABLE`, `RECOVERING`. - Public cached
warnings/briefs MAY continue with explicit freshness during read
degradation. - Critical writes MUST never be falsely acknowledged as
durable if canonical DB commit did not occur. - If safe durable
alternate buffering is implemented, UI must distinguish
`RECEIVED_PENDING_CANONICAL_COMMIT` from `ACCEPTED`. - Recovery
reconciliation is idempotent and auditable. - Optional intelligence
writes shed before critical state writes.

## Pass 137 --- DLQ / Poison Message Operations

**Gap:** DLQ existed conceptually but operator workflow was incomplete.

**Fix:** - Classify failure: transient, provider-rate, schema,
authorization, poison, obsolete, bug. - DLQ item retains original
message reference, attempt history, failure reason, entity revision and
sensitivity. - Operators can inspect, retry selected, skip/close, replay
filtered batch. - Never expose sensitive payload broadly in admin UI. -
Replay passes idempotency/revision guards. - Alert on DLQ growth and
oldest unresolved critical item.

## Pass 138 --- Retention / Archive / Hot-Data Control

**Gap:** Years of observations, evidence, news and audit can degrade hot
operational queries/cost.

**Fix:** - Define retention class per entity/data category. - Separate
operational hot data from archive/history. - Partition high-volume
time-series/event tables where justified. - Preserve
legally/audit-required records according to policy. - Expired public
cache/search/vector entries are removed/rebuilt. - R2 lifecycle rules
MAY transition/delete eligible derivatives/artifacts. - Retention never
silently destroys evidence under hold/investigation policy.

## Pass 139 --- Autonomous Intelligence Kill Switch / Policy Control

**Gap:** Automated news/event publication needs rapid operational
disablement without disabling emergency intake.

**Fix:** - Fine-grained controls: - pause source; - pause autonomous
research; - pause auto-publication; - pause AI summaries; - force
deterministic summaries; - disable specific
Skill/version/model/provider; - quarantine source/event family. - Kill
switch MUST NOT disable P0 emergency intake. - Changes are audited,
scoped and reversible. - Emergency operator can downgrade autonomy while
retaining raw official/manual feeds.

## Pass 140 --- Human Override / Reconciliation

**Gap:** Operator correction can conflict with later automated refresh.

**Fix:** - Human override has scope, reason, actor, timestamp,
expiry/conditions and fields affected. - Automation MUST NOT immediately
overwrite protected override. - New contradictory evidence creates
reconciliation task/conflict. - Override can expire/release back to
automated projection. - Never erase underlying machine/source
evidence. - Command UI shows active overrides and stale overrides.

------------------------------------------------------------------------

# 190. Official Alert Adapter Contract

``` text
OfficialAlertAdapter {
  adapter_id
  source_id
  acquisition_mode
  authentication
  format
  cap_profile?
  poll_policy?
  webhook_validation?
  geometry_mapping
  lifecycle_mapping
  attribution
  failure_policy
}
```

Normalized alert:

``` text
OfficialAlertRecord {
  source_id
  external_identifier
  sender
  sent_at
  status
  message_type
  scope
  references[]
  hazard/event_type
  urgency
  severity
  certainty
  effective_at?
  expires_at?
  geometry
  instruction
  source_revision
  normalized_revision
}
```

------------------------------------------------------------------------

# 191. Source Acquisition Policy

Each adapter MUST expose:

``` text
AcquisitionPolicy {
  mode
  minimum_interval?
  normal_interval?
  active_event_interval?
  maximum_backoff?
  jitter_window?
  conditional_fetch_supported
  webhook_signature_validation?
  cost_budget
  priority_class
}
```

Do not synchronize all polling jobs to `:00`, `:05`, `:10`.

------------------------------------------------------------------------

# 192. Notification Intent / Delivery Separation

``` text
NotificationIntent {
  intent_id
  event_ref
  event_revision
  audience_query
  urgency
  content_template
  sensitivity
  created_at
  supersedes?
}

NotificationDelivery {
  intent_id
  endpoint_ref
  channel
  provider
  state
  attempts
  last_attempt
  delivered_at?
  acknowledged_at?
}
```

This allows one regional alert to create one canonical intent and many
partitioned deliveries without duplicating semantic state.

------------------------------------------------------------------------

# 193. Geofence Matching

Preferred conceptual pipeline:

``` text
Event Geometry
→ spatial cells / indexed geometry
→ affected subscription partitions
→ candidate subscribers
→ access/policy filter
→ NotificationIntent audience partition
→ channel resolver
→ delivery queues
```

Requirements: - geometry revision aware; - event cancellation aware; -
no full-table subscriber scan for each ordinary event at scale; -
privacy-preserving partitioning; - deterministic dedup.

------------------------------------------------------------------------

# 194. DB Degraded UX

Examples:

``` text
Public cached view:
"ข้อมูลล่าสุดที่ยืนยันในระบบเมื่อ 08:14 — ระบบข้อมูลส่วนกลางกำลังล่าช้า"

Critical submission before canonical commit:
"ระบบได้รับข้อมูลจากอุปกรณ์แล้ว แต่ยังยืนยันการบันทึกส่วนกลางไม่ได้
กรุณาเก็บหมายเลขอ้างอิงนี้ไว้ ระบบจะพยายามส่งต่อเมื่อการเชื่อมต่อกลับมา"
```

Never display: `ส่งสำเร็จ` / `รับเรื่องแล้ว` unless the corresponding
durability contract is actually satisfied.

------------------------------------------------------------------------

# 195. Autonomous Intelligence Control Panel

Command/admin view SHOULD expose:

``` text
Autonomous Intelligence
  News discovery       ON
  Official feeds       ON
  Auto-publication     LIMITED
  AI briefs            ON
  Public AI briefs     ON
  Deterministic fallback READY

Sources
  Source A healthy
  Source B rate-limited
  Source C quarantined

Queues
  Q0 Critical       healthy
  Q2 Intelligence   delayed 4m
  Q3 Summary        delayed 12m

Controls
  [Pause research]
  [Pause auto-publication]
  [Force deterministic brief]
  [Quarantine source]
```

High-impact controls require appropriate authorization and audit.

------------------------------------------------------------------------

# 196. Retention Classes

Suggested logical classes:

``` text
EPHEMERAL_CACHE
SHORT_OPERATIONAL
ACTIVE_INCIDENT
LONG_OPERATIONAL
AUDIT
LEGAL_HOLD
ARCHIVE
```

Retention policy depends on tenant/jurisdiction/data category.

Do not hard-code one global retention duration.

------------------------------------------------------------------------

# 197. R1.10 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  inbound CAP update supersedes correct original alert;
2.  CAP cancellation removes active warning projection and supersedes
    queued obsolete notification;
3.  malformed/unsigned/untrusted official-feed payload cannot gain trust
    solely from CAP syntax;
4.  webhook-enabled source does not continue unnecessary high-frequency
    polling;
5.  provider outage backs off with jitter rather than retry storm;
6.  10,000 scheduled area jobs do not start simultaneously;
7.  overlapping area refreshes can coalesce;
8.  geofence matching does not full-scan all subscribers for ordinary
    event;
9.  large warning polygon can be partitioned without duplicate
    subscriber spam;
10. one million-target notification intent can be partitioned without
    synchronous request blocking;
11. invalid push endpoint does not fail whole partition;
12. provider rate limit does not starve critical notification capacity;
13. alert cancellation can suppress not-yet-sent obsolete delivery where
    supported;
14. DB outage cannot produce false canonical-success acknowledgement;
15. cached public alert remains readable with explicit stale/degraded
    state;
16. pending durable-buffer state is distinguishable from canonical
    acceptance;
17. DB recovery reconciliation does not duplicate incident;
18. poison message reaches DLQ without blocking healthy messages;
19. DLQ replay respects current entity revision;
20. unauthorized operator cannot view sensitive DLQ payload;
21. archived observations do not remain in hot operational query path
    unnecessarily;
22. legal-hold evidence cannot be deleted by normal lifecycle rule;
23. expired public/vector projection is removed/rebuilt per policy;
24. pausing AI summaries does not pause emergency intake;
25. quarantining news source does not disable unrelated official feeds;
26. forcing deterministic brief works during LLM incident;
27. human override cannot be silently overwritten by next automated
    refresh;
28. new contradictory evidence against override creates reconciliation
    state;
29. expired override returns control according to policy;
30. all high-impact autonomous-control changes are audited.

------------------------------------------------------------------------

# 198. R1.10 Scale Certification Scenarios

## SC-A --- Regional official alert

Large polygon, very large subscriber population, simultaneous public map
surge. Alert ingestion, projection and fan-out must remain bounded and
cancellable.

## SC-B --- Provider rate-limit cascade

Push provider + news provider return rate limits while critical reports
continue. Q0/intake remain healthy.

## SC-C --- Scheduled morning brief wave

Large number of subscribed areas/users. Generation/delivery
spreads/coalesces rather than starting at one exact second.

## SC-D --- PostgreSQL degraded

Cached public information remains available with freshness warning.
Critical writes never falsely claim durable success.

## SC-E --- Queue poison

Bad schema message repeatedly fails. Healthy messages continue; item
reaches controlled DLQ.

## SC-F --- False automated event

Operator quarantines source/auto-publication and corrects event.
Automation cannot immediately re-publish same bad claim.

## SC-G --- Recovery

DB/provider/queue returns after long outage. Current critical work
executes before obsolete enrichment backlog.

------------------------------------------------------------------------

# 199. R1.10 Production Gate

Promotion requires: - inbound official-alert lifecycle tests; -
acquisition/poll jitter tests; - scheduler herd tests; - geofence
scaling benchmark; - mass notification partition/fan-out benchmark; - DB
degraded/failover drill; - DLQ operational drill; - retention/archive
verification; - autonomous kill-switch drill; - human override
reconciliation tests.

**Certification rule:** autonomous intelligence and high-volume public
delivery must be independently degradable. Neither may become a
prerequisite for accepting, durably recording, or operating on a
critical emergency incident.

**End of Spec 260 R1.10 --- 140-Pass Cumulative Review / Official Alert
Interop, Massive Fan-out & Operational Control Hardening**

# 200. Safe Mobility / Travel Intelligence

SmartAIHub Emergency Intelligence MUST also support a non-emergency
convenience mode for users who are travelling through an affected
region.

This is NOT: - emergency reporting; - assistance request; - dispatch; -
rescue; - sponsored emergency usage.

It is a paid user intelligence capability that reuses the same
real-world Situation Graph.

Canonical principle:

``` text
ONE REAL-WORLD SITUATION GRAPH
→ Emergency Response projection
→ Public Awareness projection
→ Safe Mobility / Travel Intelligence projection
```

Do not create a second hazard database.

------------------------------------------------------------------------

# 201. Travel Intent

Examples:

``` text
"จากบางบอนไปเซ็นทรัลลาดพร้าว ตอนนี้ควรไปทางไหน"
"ถนนวิภาวดีน้ำท่วมไหม"
"ถ้ารถเก๋งผ่านไม่ได้ มีรถไฟฟ้าทางไหน"
"เส้นไหนเร็วกว่าแต่เสี่ยงน้ำท่วมน้อยกว่า"
"รถกระบะสูงผ่านจุดนี้ได้ไหม"
"วันนี้ควรเลี่ยงพื้นที่ไหน"
"ถ้าจะไปโรงพยาบาล X มีเส้นทางไหนยังเปิด"
```

Intent Resolver SHOULD classify these as:

``` text
TRAVEL_INTELLIGENCE
ROUTE_RISK_QUERY
TRANSIT_ALTERNATIVE
ROAD_ACCESS_QUERY
AREA_TRAVEL_BRIEF
```

unless the user is actually requesting emergency help.

------------------------------------------------------------------------

# 202. Travel Query Contract

``` text
TravelQuery {
  origin
  destination
  departure_time
  transport_modes[]
  vehicle_profile?
  user_constraints?
  accessibility_requirements?
  avoid_preferences[]
  max_detour?
}
```

Vehicle profile MAY include:

``` text
SEDAN
EV
SUV
PICKUP
HIGH_CLEARANCE
MOTORCYCLE
BICYCLE
WALK
UNKNOWN
```

Vehicle classification is advisory. The system MUST NOT infer that a
vehicle can safely cross floodwater merely from class.

------------------------------------------------------------------------

# 203. Mobility Situation Inputs

Travel intelligence combines:

``` text
Base road/transit network
+ HazardEvent
+ Observation
+ AccessibilityEdge
+ OfficialAlert
+ RoadClosure
+ FloodDepth / water condition
+ Infrastructure outage
+ Traffic condition
+ Public transport status
+ Incident/EventCandidate
+ verified/news-derived major events
+ weather/forecast when relevant
+ freshness/confidence
```

Every dynamic constraint needs provenance and freshness.

------------------------------------------------------------------------

# 204. Dynamic Accessibility Edge

Extend `AccessibilityEdge`:

``` text
MobilityEdgeState {
  edge_id
  mode
  state:
    OPEN |
    OPEN_DELAYED |
    RESTRICTED |
    HIGH_CLEARANCE_ONLY |
    LOCAL_ACCESS_ONLY |
    CLOSED |
    UNKNOWN

  delay_estimate?
  hazard_type?
  hazard_severity?
  observed_condition?
  effective_from?
  expected_until?
  observed_at
  freshness
  confidence
  source_refs[]
}
```

`HIGH_CLEARANCE_ONLY` MUST NOT be interpreted as a guarantee of safe
passage.

If water depth/current/road integrity is uncertain, the system SHOULD
prefer safer alternatives and clearly state uncertainty.

------------------------------------------------------------------------

# 205. Multi-Modal Route Alternatives

The route engine SHOULD generate multiple meaningful alternatives rather
than one opaque "best route".

Example:

``` text
A. Lowest known hazard exposure
   Car → park at station → MRT/BTS
   + lower flood exposure
   + more transfers
   ETA 82–95 min

B. Car-only detour
   avoids closed roads
   + simpler
   - congestion near ...
   ETA 105–130 min

C. Direct road
   NOT RECOMMENDED / currently restricted
   flood observation at ...
```

Possible objectives:

``` text
LOWEST_HAZARD_EXPOSURE
FASTEST_AVAILABLE
MOST_RELIABLE
LEAST_WALKING
PUBLIC_TRANSIT_PREFERRED
ACCESSIBLE_ROUTE
EV_CHARGING_AWARE
```

Do not collapse hazard safety and travel time into an unexplained single
score.

------------------------------------------------------------------------

# 206. Route Constraint Graph

Conceptual flow:

``` text
Origin + Destination
        ↓
Base Mobility Graph
        +
Dynamic Situation Constraints
        ↓
Candidate Routes
        ↓
Hard Closure Filter
        ↓
Hazard Exposure Analysis
        ↓
Traffic / Delay Analysis
        ↓
Transit Alternatives
        ↓
Route Intelligence Skill
        ↓
Grounded Explanation
```

LLM explains route options; it MUST NOT invent the underlying route.

Routing/graph engine remains deterministic/data-driven where possible.

------------------------------------------------------------------------

# 207. Skill-First Mobility Intelligence

Add Skills:

``` text
TravelIntentSkill
MobilityContextSkill
RouteConstraintSkill
RoadAccessSkill
FloodRouteRiskSkill
TransitAlternativeSkill
TrafficImpactSkill
RouteComparisonSkill
TravelBriefSkill
RouteChangeSkill
DepartureAdviceSkill
DestinationAreaBriefSkill
```

Skills declare the same capability metadata pattern as other Spec 260
Skills.

Composition example:

``` text
TravelIntentSkill
→ MobilityContextSkill
→ RoadAccessSkill
→ TransitAlternativeSkill
→ RouteComparisonSkill
→ TravelBriefSkill
```

The Capability Resolver may select providers/algorithms based on tenant,
country and available transport data.

------------------------------------------------------------------------

# 208. AI Travel Brief

Instead of forcing the user to inspect every marker, return:

``` text
บางบอน → เซ็นทรัลลาดพร้าว
ข้อมูลสถานการณ์ถึง 08:20

แนะนำ:
ขับรถไปยัง ... แล้วต่อรถไฟฟ้า ...

เหตุผล:
• ถนน ... ปิดจากน้ำท่วม
• ช่วง ... รถทั่วไปมีรายงานผ่านลำบาก
• เส้น ... ยังผ่านได้ แต่การจราจรช้ากว่าปกติประมาณ ...
• รถไฟฟ้าช่วง ... ยังให้บริการตามข้อมูลล่าสุด

ทางเลือก:
1. ความเสี่ยงต่ำกว่า — ...
2. รถยนต์ล้วน — ...
3. เส้นตรง — ไม่แนะนำในขณะนี้

เหตุการณ์สำคัญใกล้เส้นทาง:
• ...
• ...

ข้อมูลบางจุดมีอายุ 18 นาที
[ดูเส้นทาง] [ดูเหตุการณ์] [ดูแหล่งข้อมูล]
```

The answer MUST distinguish: - official closure; - verified operational
state; - recent observation; - news-derived event; - predicted
congestion; - AI explanation.

------------------------------------------------------------------------

# 209. Travel Credit / Economic Policy

Travel Intelligence is normally USER-PAID.

``` text
UsagePurpose:
  EMERGENCY_LIFE_SAFETY
  PUBLIC_EMERGENCY_INFO
  TRAVEL_INTELLIGENCE
```

Default payer:

``` text
EMERGENCY_LIFE_SAFETY → sponsorship policy
PUBLIC_EMERGENCY_INFO → public/free policy
TRAVEL_INTELLIGENCE → USER wallet/credits
```

Reuse SmartAIHub existing wallet/credit/economic authority.

No second billing ledger.

Charge only for billable capabilities actually used, according to
existing usage accounting: - routing provider/API; - traffic/transit
provider; - premium search/news refresh initiated specifically for
query; - LLM tokens/inference; - paid geocoding if invoked; - Skill fee
if configured.

Do NOT charge the user again for: - already cached public hazard data
merely being read; - background news ingestion already paid by
platform/sponsor unless commercial policy explicitly allocates shared
cost; - failed provider calls where existing billing policy does not
recognize completed value; - duplicated retries caused by SmartAIHub.

Before expensive optional research, policy MAY use cached intelligence
first and refresh only if freshness requirement justifies cost.

------------------------------------------------------------------------

# 210. Cost-Aware Travel Resolver

``` text
TravelCostPlan {
  cached_data_available
  freshness_requirement
  routing_provider
  transit_provider?
  traffic_provider?
  research_required
  llm_model
  estimated_cost
  actual_cost
}
```

Resolver SHOULD choose the lowest-cost capability set that satisfies
freshness/quality requirements.

Example:

``` text
cached SituationSnapshot still fresh
+ cached traffic feed
+ routing call
+ small LLM synthesis
```

is preferred over unnecessary broad web research.

------------------------------------------------------------------------

# 211. Travel Intelligence Background Work

Do NOT perform all travel intelligence synchronously.

Background/shared: - road closure ingestion; - flood/access
observations; - transit status ingestion; - traffic normalization; -
news/event extraction; - route-impact projection; - area mobility
snapshots; - major corridor summaries.

Synchronous per query: - origin/destination resolution when needed; -
candidate route calculation; - latest relevant constraint lookup; -
final route comparison; - concise user-specific synthesis.

Optional background after answer: - subscribe/watch route; - refresh
when material route condition changes.

------------------------------------------------------------------------

# 212. Route Impact Projection

When a new event arrives:

``` text
Event / Observation
→ Geo intersection
→ affected mobility edges
→ mobility projection revision
→ affected corridor/area snapshots invalidated
→ subscribed route watches evaluated
```

Do not recompute every possible route globally.

------------------------------------------------------------------------

# 213. Travel Freshness Policy

Different mobility facts have different useful lifetimes.

Examples: - active road closure: event/revision driven; - flood depth:
short-lived; - traffic congestion: very short-lived; - transit
suspension: source/revision driven; - news event: depends on
corroboration/update; - static station/road geometry: long-lived.

Route answer MUST expose material stale/unknown conditions.

If critical segment has stale data: - do not silently assume OPEN; -
prefer alternative if reasonable; - state uncertainty.

------------------------------------------------------------------------

# 214. Route Safety Rules

The system MUST NOT encourage: - driving through moving floodwater; -
crossing a closed road; - bypassing emergency barricades; - entering
evacuation/restricted zones; - unsafe improvised routes; - assuming
bridge/road structural safety from absence of reports.

`No report` != `safe`.

Official restrictions override convenience routing.

------------------------------------------------------------------------

# 215. Destination Intelligence

Travel answer SHOULD include destination-area facts when material:

``` text
DestinationAreaBrief {
  active_alerts
  access_constraints
  local flooding
  transport disruption
  major incidents
  parking/access limitations?
  facility closure?
  last_updated
}
```

This prevents a technically passable route from sending the user to a
destination that is closed/inaccessible.

------------------------------------------------------------------------

# 216. Route Change Monitoring

Optional paid feature:

``` text
RouteWatch {
  origin/destination
  corridor
  departure_window
  transport_modes
  trigger_policy
  expires_at
}
```

Notify only material changes: - route closure; - severe delay; - new
flood/access restriction; - transit suspension; - safer route becomes
available; - major incident intersects corridor.

RouteWatch expires automatically after trip window unless user extends
it.

------------------------------------------------------------------------

# 217. Privacy

Travel queries may reveal sensitive movement patterns.

Requirements: - no public exposure; - minimum retention; - no permanent
movement profile by default; - saved commute requires explicit user
choice; - location history not required for one-off route; - route-watch
data expires according to policy; - do not mix private travel history
into public incident intelligence.

------------------------------------------------------------------------

# 218. Travel UI --- Cross Device

## Mobile

-   Origin / Destination
-   `ออกตอนนี้`
-   concise recommendation card
-   2--3 alternatives
-   hazard badges on route
-   one-tap map
-   large reroute warning

## Tablet

-   route alternatives + map split view
-   event/road status panel

## Desktop

-   map + alternatives + event timeline + source/freshness panel

User can ask follow-ups naturally:

``` text
"ถ้าไม่ขึ้นรถไฟฟ้าล่ะ"
"ถ้าเป็นรถกระบะ"
"ออกอีกสองชั่วโมงจะดีขึ้นไหม"
"ขอทางที่เสี่ยงน้ำน้อยที่สุด"
```

Chat maintains TravelQuery context.

------------------------------------------------------------------------

# 219. Mobility Map Layers

Add optional layers:

``` text
ROAD_STATUS
TRAFFIC_IMPACT
TRANSIT_STATUS
FLOOD_ACCESS
CLOSURES
HIGH_CLEARANCE_RESTRICTIONS
EVACUATION_RESTRICTIONS
MAJOR_TRAVEL_EVENTS
```

Public map and travel map reuse underlying projections but may present
different emphasis.

------------------------------------------------------------------------

# 220. Travel Acceptance Tests

Implementation MUST prove:

1.  travel query does not create Incident/Need/Task;
2.  travel query uses USER billing by default rather than emergency
    sponsorship;
3.  cached hazard data is not double-charged merely for being read;
4.  actual billable provider/model usage reaches existing credit ledger;
5.  closed road is excluded from normal candidate route;
6.  stale flood data is not interpreted as safe road;
7.  `HIGH_CLEARANCE_ONLY` is not described as guaranteed safe;
8.  official restriction overrides faster route;
9.  route explanation can trace material constraints to sources;
10. LLM cannot invent a road closure absent structured evidence;
11. LLM cannot invent a transit line/service state;
12. news-derived event can affect route only with explicit
    provenance/confidence policy;
13. duplicate news does not multiply route penalty;
14. destination closure/access problem appears in recommendation;
15. alternative public transport is considered when road route is
    materially impaired;
16. route can optimize lowest hazard exposure separately from fastest
    ETA;
17. uncertainty is visible when critical edge data is stale;
18. new road closure invalidates affected corridor projection;
19. unrelated event does not trigger global route recomputation;
20. route watch sends only material changes;
21. route watch expires after trip window;
22. one-off travel query does not require saved movement history;
23. mobile route recommendation remains usable one-handed;
24. tablet split view preserves selected alternative;
25. desktop map/list/source panels share same route revision;
26. provider failure can fall back to available lower-capability answer
    with explicit limitation;
27. inability to calculate safe route does not fabricate one;
28. user can ask follow-up changing vehicle/mode without re-entering
    origin/destination;
29. emergency-help intent discovered during travel chat can transition
    to emergency flow without losing location context;
30. emergency sponsorship does not accidentally subsidize ordinary
    commercial travel query.

------------------------------------------------------------------------

# 221. Architecture Relationship

``` text
                    REAL-WORLD SITUATION GRAPH
                              │
             ┌────────────────┼────────────────┐
             │                │                │
       PUBLIC AWARENESS   EMERGENCY RESPONSE   SAFE MOBILITY
             │                │                │
         free/public       sponsored by       user-paid
                           policy when
                           eligible
```

Shared intelligence: - Hazard/Event/Observation - News/Official
Sources - Access Graph - Traffic/Transit - Map - Situation Snapshot -
Skill Registry

Separate intent/policy: - emergency lifecycle; - travel routing; -
billing; - permissions; - output UX.

No duplicate orchestration authority. No duplicate economic authority.
No duplicate hazard truth.

**End of Spec 260 R1.11 --- Safe Mobility & Travel Intelligence
Extension**

# 222. Active Journey Intelligence

Safe Mobility MUST support users who are already travelling, not only
pre-trip planning.

Canonical lifecycle:

``` text
PLAN
→ START JOURNEY
→ MONITOR RELEVANT CORRIDOR
→ DETECT MATERIAL IMPACT
→ EXPLAIN
→ RECOMMEND
→ REROUTE / CHANGE MODE / WAIT
→ CONTINUE
→ ARRIVE / END
```

This is `ACTIVE_JOURNEY_INTELLIGENCE`, not emergency dispatch.

------------------------------------------------------------------------

# 223. Active Journey State

``` text
ActiveJourney {
  journey_id
  user_ref
  origin
  destination
  started_at
  planned_arrival?
  transport_mode
  vehicle_profile?
  current_route_revision
  route_corridor
  progress?
  last_location?
  last_location_at?
  location_precision
  monitoring_policy
  cost_policy
  expires_at
  state:
    ACTIVE |
    PAUSED |
    ARRIVED |
    CANCELLED |
    EXPIRED
}
```

Location tracking requires explicit user permission and MUST stop/expire
when the journey ends according to policy.

------------------------------------------------------------------------

# 224. Corridor-Aware Impact Analysis

Do not alert merely because an incident is geographically nearby.

Determine whether the event: - intersects current route; - affects an
upcoming segment; - blocks a necessary connection; - changes transit
service; - makes destination inaccessible; - causes a meaningful
detour; - creates hazard exposure near route; - affects a plausible
alternative route.

Conceptual model:

``` text
Current Journey Corridor
       +
Forward Travel Horizon
       +
Situation Graph Changes
       ↓
JourneyImpactSkill
       ↓
NO_IMPACT
INFORMATIONAL
DELAY_EXPECTED
ROUTE_DEGRADED
REROUTE_RECOMMENDED
ROUTE_BLOCKED
MODE_CHANGE_RECOMMENDED
STOP_AND_REASSESS
```

------------------------------------------------------------------------

# 225. Forward Travel Horizon

Analysis SHOULD prioritize what lies ahead.

Possible horizon dimensions: - next N kilometers; - next N minutes; -
next route segments; - next transfer; - destination area.

A flood behind the traveller normally should not interrupt the user
unless it affects return/access/safety.

------------------------------------------------------------------------

# 226. En-Route Impact Sources

Active Journey may use:

``` text
road closure/update
flood/water observation
traffic congestion
crash
fire
building collapse
protest/crowd/road block
utility/infrastructure failure
bridge/tunnel closure
rail/transit disruption
station closure
official warning
evacuation/restricted zone
major news-derived event
weather/hazard progression
responder/authority access update
```

Every impact must retain freshness/provenance.

------------------------------------------------------------------------

# 227. Journey Intelligence Skills

Add Skill-First capabilities:

``` text
ActiveJourneySkill
JourneyImpactSkill
AheadOfRouteSkill
DynamicRerouteSkill
ModeSwitchSkill
SafeStopSkill
JourneyConstraintSkill
JourneyChangeSummarySkill
ArrivalFeasibilitySkill
ReturnRouteImpactSkill
```

Example composition:

``` text
Situation Change
→ JourneyImpactSkill
→ JourneyConstraintSkill
→ DynamicRerouteSkill
→ JourneyChangeSummarySkill
→ Notification Policy
```

------------------------------------------------------------------------

# 228. Material Change Trigger

Do NOT continuously invoke expensive routing/LLM calls for every
location tick.

First use cheap deterministic filters:

``` text
event geometry changed?
event relevant to corridor?
within forward horizon?
material severity?
current route affected?
newer than processed revision?
```

Only then invoke expensive route recomputation or AI synthesis.

This is mandatory for concurrency/cost control.

------------------------------------------------------------------------

# 229. Adaptive Reroute

When a material problem is detected:

``` text
Current Route
→ affected segment
→ hard/soft restriction
→ candidate alternatives
→ hazard exposure
→ delay
→ mode feasibility
→ destination feasibility
→ recommendation
```

Possible recommendations: - continue current route; - slow/delay
expected; - take road detour; - exit before affected segment; - park and
change to rail; - change rail/bus line; - wait temporarily if evidence
supports it; - choose alternate destination/access point; - stop at a
safe place and reassess.

Do not recommend unsafe improvised maneuvers.

------------------------------------------------------------------------

# 230. User-Facing En-Route Brief

Example:

``` text
มีปัญหาบนเส้นทางข้างหน้า — อัปเดต 17:18

อีกประมาณ 6 กม.
ถนน ... มีน้ำท่วมและการจราจรชะลอตัวมาก
ข้อมูลล่าสุดระบุว่ารถทั่วไปผ่านลำบาก

คำแนะนำ
ออกทาง ... แล้วไปจอดที่ ...
จากนั้นต่อ MRT จะลดการผ่านพื้นที่น้ำท่วม

ผลกระทบโดยประมาณ
เส้นเดิม: +45–70 นาที / มีข้อจำกัดน้ำท่วม
ทางเลือก: +25–35 นาที / เปลี่ยนการเดินทาง 1 ครั้ง

ข้อมูลจาก:
• ...
• ...
อัปเดตล่าสุด 7 นาทีที่แล้ว

[เปลี่ยนเส้นทาง] [ดูเหตุการณ์] [ใช้เส้นเดิม]
```

Do not overload a driver with long text.

------------------------------------------------------------------------

# 231. Driving Interaction Safety

When mode indicates driving: - use concise high-priority information; -
minimize touch interaction; - support voice/audio presentation where
available; - no long article/news reading prompt; - defer non-critical
details; - large actionable controls; - avoid frequent alerts; - do not
require typing while vehicle is moving; - detailed source inspection can
wait until stopped.

System SHOULD NOT claim to know that the user is driving unless
supported by user-selected mode/context.

------------------------------------------------------------------------

# 232. Journey Constraints

Constraints may include:

``` text
vehicle clearance
EV range/charging
wheelchair/accessibility
maximum walking distance
avoid flood
avoid unverified roads
avoid restricted zones
public transport availability
parking availability if integrated
bridge/tunnel restrictions
time window
destination operating/access state
```

Constraints must be transparent to user.

------------------------------------------------------------------------

# 233. Unknown / Uncertain Road State

If an upcoming critical segment has: - stale observations; - conflicting
reports; - unknown flood depth; - unknown structural condition;

the route engine MUST NOT silently treat it as OPEN.

Possible result:

``` text
UNKNOWN / INSUFFICIENT CURRENT DATA
```

and select a more reliable alternative where reasonable.

------------------------------------------------------------------------

# 234. Safe Stop / Pause Strategy

If no reliable route can be confirmed:

``` text
SafeStopSkill
```

MAY identify a suitable nearby stopping/reassessment location from
available verified data.

It must not label a location "safe" without sufficient evidence. Prefer
wording such as: - known open facility; - designated shelter/rest
point; - verified open service area; - location outside currently known
affected geometry.

------------------------------------------------------------------------

# 235. Destination Feasibility

During journey, re-evaluate destination:

``` text
OPEN_AND_ACCESSIBLE
OPEN_ACCESS_DEGRADED
ACCESS_UNKNOWN
TEMPORARILY_INACCESSIBLE
CLOSED
EVACUATING
```

If destination becomes inaccessible, tell user before arrival and
propose alternatives only when supported.

------------------------------------------------------------------------

# 236. Transit Transfer Protection

For multimodal journeys monitor: - station closure; - line suspension; -
transfer disruption; - last-mile flooding; - access entrance closure; -
shuttle/replacement service when verified.

A functioning train line is insufficient if the destination station
exit/last-mile path is inaccessible.

------------------------------------------------------------------------

# 237. GPS / Network Degradation

Active Journey MUST tolerate: - temporary GPS loss; - approximate
location; - network loss; - stale location; - app backgrounding.

Rules: - show last-known location age; - never fabricate current
position; - cache critical route summary/known constraints; - queue
non-critical state where appropriate; - on reconnect, reconcile
route/event revisions; - avoid a notification storm for every missed
update.

------------------------------------------------------------------------

# 238. Journey Monitoring Cost Control

User pays for actual travel intelligence usage.

Do not bill a full AI/routing analysis for every GPS tick.

Cost model SHOULD separate: - low-cost local/corridor matching; - shared
cached Situation Graph updates; - routing recomputation; - premium live
traffic/transit call; - AI synthesis; - active route watch.

Material-change-triggered recomputation is preferred.

UI/policy SHOULD make premium continuous monitoring understandable.

------------------------------------------------------------------------

# 239. Journey Monitoring Background Architecture

``` text
Situation Event
→ spatial/corridor index
→ affected active-journey partitions
→ cheap relevance filter
→ material impact candidate
→ queue
→ bounded JourneyImpact processing
→ reroute only if required
→ concise notification
```

Do NOT scan all active journeys for every event.

Partition by spatial/corridor index and expire completed journeys
promptly.

------------------------------------------------------------------------

# 240. Journey Notification Policy

Notification classes:

``` text
JOURNEY_INFO
JOURNEY_DELAY
JOURNEY_REROUTE
JOURNEY_BLOCKED
JOURNEY_MODE_CHANGE
JOURNEY_DESTINATION_CHANGE
```

Dedup/coalesce repeated updates.

Notify based on material impact, not every source update.

Example: five reports about same flooded road → one material journey
update.

------------------------------------------------------------------------

# 241. Transition to Emergency

If user says:

``` text
"รถติดอยู่ในน้ำ ออกไม่ได้"
"น้ำกำลังเข้ารถ"
"มีคนเจ็บ"
"ติดอยู่บนถนนและระดับน้ำสูงขึ้น"
```

Intent Resolver MUST be able to transition:

``` text
TRAVEL_INTELLIGENCE
→ EMERGENCY_INTAKE
```

Reuse: - current/last-known location; - route; - vehicle profile; -
recent hazard context; - contact context with permission.

Do not make the user repeat known critical information.

Billing transitions according to Emergency Sponsorship Policy from the
point emergency intent/capability becomes eligible.

------------------------------------------------------------------------

# 242. Active Journey Privacy

-   explicit opt-in for active journey monitoring;
-   clear indication monitoring is active;
-   easy pause/end;
-   auto-expiry;
-   no public exposure;
-   minimize precise location retention;
-   no permanent mobility profile by default;
-   route corridor may be used instead of continuous exact coordinates
    where sufficient;
-   sharing with responder only after emergency/authorization policy
    permits.

------------------------------------------------------------------------

# 243. Active Journey Acceptance Tests

Implementation MUST prove:

1.  nearby but irrelevant event does not interrupt journey;
2.  event ahead intersecting route can trigger impact analysis;
3.  event behind traveller normally does not trigger reroute;
4.  every GPS tick does not invoke LLM/routing provider;
5.  duplicate reports about same closure coalesce into one journey
    impact;
6.  closed upcoming segment triggers candidate reroute;
7.  stale/unknown segment is not silently treated as open;
8.  high-clearance report does not guarantee safe crossing;
9.  official closure overrides convenience route;
10. transit line open but destination exit flooded is detected as
    last-mile issue;
11. destination closure discovered en route triggers destination
    feasibility update;
12. GPS loss displays last-known age rather than fabricated location;
13. reconnect does not emit all missed notifications individually;
14. completed journey stops monitoring;
15. journey expires automatically;
16. paused journey does not continue premium monitoring;
17. material change can trigger reroute cost; ordinary location tick
    cannot;
18. actual provider/AI use reaches existing economic ledger;
19. shared Situation Graph update is not double-billed as private
    provider call;
20. driving mode does not require long text interaction;
21. driver-facing alert is concise;
22. reroute explanation identifies material reason;
23. AI cannot invent road/transit constraint;
24. route recommendation preserves source/freshness;
25. active journey matching avoids full scan of all journeys;
26. corridor partition expires completed journeys;
27. privacy policy prevents public location exposure;
28. emergency phrase transitions to emergency intake;
29. emergency transition reuses known location/context;
30. eligible emergency processing switches away from ordinary travel
    billing according to sponsorship policy.

------------------------------------------------------------------------

# 244. R1.12 Architecture Summary

``` text
                     REAL-WORLD SITUATION GRAPH
                              │
                  Situation/Event Changes
                              │
             Spatial + Corridor Impact Index
                              │
              Active Journey Partitions
                              │
                 Cheap Relevance Filter
                              │
                 Material Impact?
                    │       │
                   NO      YES
                    │       │
                   END   Journey Skills
                            │
                    Route Recalculation
                            │
                   Grounded Recommendation
                            │
                 Device-Aware Notification
```

This preserves: - Cloudflare surge architecture; - Skill First; -
bounded background work; - rate-limit isolation; - canonical situation
truth; - existing credit authority; - emergency/public/travel policy
separation.

**End of Spec 260 R1.12 --- Active Journey Intelligence, En-Route Impact
Analysis & Adaptive Guidance**

# 245. Review Passes 141--150 --- Active Journey Reliability

Passes 141--150 extend the previous cumulative review set. All fixes
below are normative R1.13 requirements.

## Pass 141 --- Route Revision / Staleness While Moving

**Gap:** A route can be valid when generated but materially stale
several minutes later.

**Fix:** - `RouteRevision` MUST bind route geometry to relevant
mobility/situation revisions and generation time. - Revalidation is
triggered by material situation change, elapsed freshness threshold,
meaningful journey progress or explicit user request. - Revalidation
SHOULD focus on the forward corridor rather than recomputing the entire
trip blindly. - UI shows when route intelligence was last checked. - A
stale route is never presented as newly verified.

## Pass 142 --- Map Matching / GPS Drift

**Gap:** Raw GPS can place a traveller on a parallel road, frontage
road, bridge, tunnel or opposite carriageway.

**Fix:** - Separate `RawLocationObservation` from
`MatchedJourneyPosition`. - Map matching returns confidence and
candidate segment(s). - Low-confidence matching MUST NOT trigger hard
reroute solely from one sample. - Use trajectory continuity,
heading/speed when available and privacy-permitted, route topology and
repeated observations. - User can correct location/route when
necessary. - Never rewrite raw location evidence.

## Pass 143 --- Tunnel / Urban Canyon / Location Loss

**Gap:** GPS can disappear or jump in tunnels/dense urban areas.

**Fix:** - Support dead-reckoning only as an explicitly estimated
position when available; never present it as GPS fact. - Preserve last
verified/matched location and age. - Delay non-critical reroute until
confidence recovers where appropriate. - Time-critical route
restrictions ahead may still be surfaced based on planned corridor even
when exact current position is temporarily unknown. - Reacquisition must
avoid false "you turned around" events.

## Pass 144 --- Decision-Point Deadline

**Gap:** A technically correct reroute can arrive too late after the
user has passed the last practical exit/transfer.

**Fix:** - Model `DecisionPoint` and `latest_action_time/distance`. -
JourneyImpact processing prioritizes events whose action deadline is
approaching. - Notification/reroute latency budget is stricter before
critical exits/transfers. - If decision point is missed, recompute from
current state instead of repeating obsolete instruction. - Never
instruct unsafe U-turn/reversal to recover a missed decision.

## Pass 145 --- Reroute Oscillation / Route Flapping

**Gap:** Rapidly changing traffic/flood reports can alternate route A↔B
and overwhelm users/providers.

**Fix:** - Add hysteresis and minimum material-improvement threshold. -
Route switch requires meaningful benefit or hard safety constraint. -
Cooldown applies to convenience reroutes, not new critical closure. -
Preserve reason for current route choice. - Repeated source revisions
that do not change route materiality MUST NOT cause repeated rerouting.

## Pass 146 --- Transit Scheduled vs Realtime State

**Gap:** Static timetable may show service while realtime operations are
suspended or vice versa.

**Fix:** - Model scheduled service separately from realtime service
state. - Prefer current authoritative/realtime operational data where
available. - Expose freshness/source. - A missing realtime feed does not
mean service is normal. - Transfer feasibility accounts for disruption
and last-mile access. - Do not invent replacement buses/shuttles.

## Pass 147 --- Energy / Fuel Feasibility

**Gap:** A flood detour may materially increase range requirements for
EVs or fuel-limited vehicles.

**Fix:** - Energy/fuel constraint is optional user-supplied context,
never assumed. - Route alternatives MAY consider verified
charging/fueling availability and accessibility. - Infrastructure outage
can invalidate charging/fueling stops. - Do not guarantee charger/pump
availability from stale/static listing alone. - If remaining range is
unknown, do not fabricate it.

## Pass 148 --- Arrival, Parking and Last-Mile Failure

**Gap:** Destination can be open while access road, parking, station
exit or pedestrian last mile is unusable.

**Fix:** - `ArrivalFeasibility` combines destination state + access
edges + parking/access data if integrated + last-mile walking/transit
constraints. - Provide alternate access point only when supported. -
Distinguish destination open from destination reachable. - Accessibility
needs remain part of feasibility. - Re-evaluate shortly before arrival
when conditions are volatile.

## Pass 149 --- Shared Journey Without Surveillance

**Gap:** Users may want family to know trip status, but continuous exact
tracking creates privacy/security risk.

**Fix:** - Optional `JourneyShare` is explicit, time-bounded and
revocable. - Default share SHOULD favor coarse progress/status/ETA
rather than unrestricted historical location. - Exact live location
requires explicit choice. - Share token/session expires at journey end
or configured time. - Viewer cannot infer private emergency/case data
unless separately authorized. - No public journey directory/search. -
Abuse/revocation controls required.

## Pass 150 --- End-to-End Mobility Failure Recovery

**Gap:** Combined provider failures can leave a journey with
contradictory partial capabilities.

**Fix:** - Maintain `JourneyCapabilityState` for routing, map, traffic,
transit, location, situation feed and AI synthesis. - Guidance degrades
by capability: - full dynamic routing; - route + partial live
constraints; - cached route + current critical warnings; - textual known
closures/alerts only; - explicit inability to verify route. - Never
fabricate normal operation to hide provider failure. - User must be told
which part is degraded when material.

------------------------------------------------------------------------

# 246. Route Revision Contract

``` text
RouteRevision {
  route_id
  revision
  generated_at
  situation_revision
  mobility_projection_revision
  geometry
  transport_modes[]
  constraint_refs[]
  freshness_deadline?
  supersedes?
}
```

A route response is a time-bound decision product, not timeless map
truth.

------------------------------------------------------------------------

# 247. Location Observation / Map Matching

``` text
RawLocationObservation {
  observed_at
  coordinates
  accuracy?
  heading?
  speed?
  source
}

MatchedJourneyPosition {
  journey_id
  route_revision
  matched_at
  segment_id?
  progress?
  confidence
  candidate_segments[]
  derived_from[]
}
```

Low confidence MUST remain visible to the Journey engine.

------------------------------------------------------------------------

# 248. Decision Point

``` text
DecisionPoint {
  decision_id
  journey_id
  route_revision
  action_type:
    EXIT |
    TURN |
    TRANSFER |
    MODE_SWITCH |
    STOP_BEFORE_RESTRICTION
  location
  latest_action_time?
  latest_action_distance?
  impact_if_missed
}
```

Background priority may rise as a material decision deadline approaches,
but provider budgets remain bounded.

------------------------------------------------------------------------

# 249. Route Stability Policy

``` text
RouteStabilityPolicy {
  minimum_eta_improvement?
  minimum_risk_improvement?
  convenience_reroute_cooldown
  critical_override_enabled
  evidence_freshness_requirement
}
```

A hard closure, official restriction or material safety deterioration
bypasses convenience cooldown.

------------------------------------------------------------------------

# 250. Transit State Model

``` text
TransitServiceState {
  operator
  line/service
  scheduled_state
  realtime_state?
  affected_segment?
  station_states[]
  source_refs[]
  observed_at
  freshness
  confidence
}
```

`realtime_state = UNKNOWN` is distinct from `NORMAL`.

------------------------------------------------------------------------

# 251. Arrival Feasibility

``` text
ArrivalFeasibility {
  destination_ref
  destination_state
  primary_access_state
  alternate_access_points[]
  parking_state?
  pedestrian_last_mile
  accessibility_constraints[]
  transit_exit_state?
  checked_at
  source_refs[]
  confidence
}
```

------------------------------------------------------------------------

# 252. Journey Share

``` text
JourneyShare {
  share_id
  journey_id
  viewer_scope
  precision:
    STATUS_ONLY |
    COARSE_PROGRESS |
    ETA |
    EXACT_LIVE_LOCATION
  created_at
  expires_at
  revoked_at?
}
```

Journey sharing is not an authorization shortcut into
Incident/Need/medical/private emergency data.

------------------------------------------------------------------------

# 253. Journey Capability State

``` text
JourneyCapabilityState {
  routing
  traffic
  transit
  map
  location
  situation_feed
  ai_synthesis
  checked_at
}
```

Each capability:

``` text
AVAILABLE | DEGRADED | UNAVAILABLE | UNKNOWN
```

------------------------------------------------------------------------

# 254. Active Journey Cost & Compute Refinement

To protect both user credits and disaster-scale concurrency:

1.  location observations SHOULD be processed locally/cheaply where
    feasible;
2.  corridor relevance filtering precedes provider calls;
3.  reroute only on material change, route expiry or explicit request;
4.  reuse shared mobility/situation projections;
5.  cache route constraints by revision;
6.  use concise synthesis or deterministic renderer when LLM adds little
    value;
7.  do not charge provider/model cost that was not actually incurred;
8.  retries caused by platform failure follow existing non-duplicate
    billing rules.

The existing SmartAIHub economic authority remains canonical.

------------------------------------------------------------------------

# 255. Cloudflare Active-Journey Partitioning

Active Journey matching SHOULD avoid per-user global scans.

Conceptual design:

``` text
Situation/Mobility Change
→ spatial cell / corridor segment keys
→ active journey partition lookup
→ affected journey IDs
→ bounded queue batches
→ cheap revision/materiality check
→ optional reroute
```

Requirements: - TTL/expiry on active-journey indexes; - stale index
cleanup; - no exact private route geometry in public KV/cache; -
partition hot-spot monitoring; - adaptive subdivision for overloaded
geographic cells where implementation supports it; - queue messages
contain references/minimum required metadata rather than full private
histories.

Durable Objects MAY coordinate hot realtime partitions when justified,
but remain non-authoritative.

------------------------------------------------------------------------

# 256. Driver / Traveller Notification Escalation

Notification should consider: - time to decision point; - severity; -
current interaction mode; - whether user acknowledged; - whether route
has already changed; - whether the information is still actionable.

Priority example:

``` text
CRITICAL ROAD CLOSURE 2 km ahead
> severe delay 15 km ahead
> informational event near destination
```

Do not alert about a condition after it is no longer actionable unless
useful for explanation/history.

------------------------------------------------------------------------

# 257. Journey Change Summary

Instead of repeated notifications:

``` text
ตั้งแต่ตรวจครั้งล่าสุด
• เส้นทางเดิมถูกปิด 1 จุด
• เปลี่ยนไปใช้ ...
• เวลาเดินทางเพิ่มประมาณ ...
• จุดหมายยังเปิด แต่ทางเข้าด้าน ... ใช้งานไม่ได้
```

`JourneyChangeSummarySkill` uses structured deltas, not a fresh broad
research pass.

------------------------------------------------------------------------

# 258. R1.13 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  stale route revision is not displayed as freshly verified;
2.  one noisy GPS sample on parallel road cannot force hard reroute;
3.  raw location is preserved when map match changes;
4.  low-confidence map match remains explicit;
5.  tunnel GPS loss does not fabricate current coordinates;
6.  GPS reacquisition does not falsely infer a reversal;
7.  critical route restriction can still be warned from planned corridor
    during temporary GPS loss;
8.  reroute arriving after missed exit is recomputed rather than
    repeated;
9.  system never recommends unsafe U-turn solely to recover missed
    decision point;
10. minor ETA fluctuation does not cause route flapping;
11. hard closure bypasses convenience reroute cooldown;
12. repeated equivalent source revisions do not repeatedly invoke
    routing provider;
13. scheduled transit data cannot override fresher verified suspension;
14. absent realtime transit feed is represented as unknown, not normal;
15. replacement transport is not invented;
16. EV/fuel feasibility never fabricates remaining range;
17. stale charger listing is not represented as guaranteed available;
18. power outage can invalidate charging-stop feasibility;
19. open destination with closed access road is reported as
    inaccessible/degraded;
20. inaccessible station exit is considered in last-mile feasibility;
21. alternate entrance is not invented;
22. journey share defaults do not expose exact live location unless
    chosen;
23. revoked share loses access promptly;
24. journey share expires automatically;
25. shared journey does not expose emergency medical/private case state;
26. combined traffic+routing provider outage degrades honestly;
27. cached route can coexist with current critical warning without being
    called live-rerouted;
28. corridor relevance filter runs before expensive reroute;
29. active-journey spatial partition does not expose private route
    through public cache;
30. completed/expired journey is removed from active matching index;
31. hot geographic partition can be observed and mitigated without
    global scan;
32. user is not charged an LLM/routing call that was never executed;
33. platform retry does not duplicate user charge;
34. decision-point alert that is no longer actionable is
    suppressed/reframed;
35. structured delta summary does not require broad news research when
    existing state is sufficient.

------------------------------------------------------------------------

# 259. R1.13 Active Journey Production Gate

Promotion requires evidence for:

-   route revision/freshness tests;
-   map-matching uncertainty tests;
-   GPS-loss/tunnel recovery;
-   decision-point latency;
-   reroute hysteresis;
-   realtime-vs-scheduled transit state;
-   EV/fuel infrastructure degradation;
-   destination/last-mile feasibility;
-   JourneyShare privacy/revocation;
-   combined capability degradation;
-   active-journey partition load tests;
-   billing/no-duplicate-charge tests.

At least one certification scenario MUST combine:

``` text
regional flood
+ heavy traffic
+ GPS degradation
+ road closure update
+ provider rate limiting
+ route decision point
+ mobile device
```

and still produce either a grounded actionable recommendation or an
explicit inability to verify --- never fabricated certainty.

**End of Spec 260 R1.13 --- 150-Pass Cumulative Review / Active Journey
Reliability, Decision-Point Safety & Mobility Resilience**

# 260. Review Passes 151--160 --- Mode-Aware Mobility and Route Confidence

Passes 151--160 extend the cumulative review. All fixes below are
normative R1.14 requirements.

## Pass 151 --- Pedestrian / Bicycle / Motorcycle Semantics

**Gap:** Road accessibility cannot be applied identically to cars,
motorcycles, bicycles and pedestrians.

**Fix:** - `MobilityEdgeState` MUST be mode-aware. - A road closed to
cars may still have a safe pedestrian route, or the reverse. - Flood
depth/current, sidewalk/footbridge availability, tunnel/underpass
conditions and official restrictions can differ by mode. - Motorcycle
routing MUST NOT treat narrow access as safe merely because physically
passable. - Bicycle/pedestrian routes MUST not use motor-vehicle-only
roads unless explicitly permitted. - Never infer safe wading from
vehicle-access information.

## Pass 152 --- Accessibility / Reduced-Mobility Travel

**Gap:** "Route available" can be unusable for wheelchair users, older
adults, users with strollers or mobility limitations.

**Fix:** - Accessibility requirements are first-class query
constraints. - Monitor elevator/escalator outage where reliable data
exists. - Include step-free entrances, accessible transfers, walking
distance, slope/obstruction information where supported. - Do not claim
accessibility from absence of outage reports. - If accessibility data is
unavailable, expose that limitation.

## Pass 153 --- Direction, Lane, Turn and Carriageway Restrictions

**Gap:** Event geometry intersecting a road does not imply both
directions/lanes are equally affected.

**Fix:** - Dynamic constraints MAY target direction, carriageway, lane
group, turn or access point. - Preserve one-way and turn restrictions
from base mobility graph. - Incident-derived restriction should use the
most precise supported edge scope. - Unknown directionality must not be
converted into a precise lane closure. - Reroute must not propose
illegal turn/direction.

## Pass 154 --- Temporary Traffic Management / Contraflow

**Gap:** Disaster response may create reversible lanes, temporary
one-way operation, emergency-only lanes or checkpoint controls.

**Fix:** - Model temporary traffic control separately from permanent
topology. - Supported states include temporary direction,
emergency-only, authorized-vehicle-only, checkpoint/restricted entry and
temporary access window. - Require source/provenance and effective
period. - Temporary control expires/revalidates; it must not permanently
mutate base road topology. - Emergency-only access MUST NOT be offered
to ordinary travellers.

## Pass 155 --- Underpass / Bridge / Elevation Asymmetry

**Gap:** Nearby road segments can have radically different flood
exposure due to elevation.

**Fix:** - Where data supports it, distinguish bridge deck, underpass,
tunnel, ramp and surface road. - Flood intersection by 2D geometry alone
is insufficient when vertical separation is known. - An underpass flood
must not automatically close the bridge above it. - Conversely, a
visible dry bridge does not imply its ramps are accessible. -
Elevation/structure confidence is retained.

## Pass 156 --- Time-Dependent Constraints

**Gap:** A route may be open now but scheduled to close before the
traveller reaches it.

**Fix:** - Dynamic constraints include effective/expiry windows. - Route
feasibility SHOULD evaluate expected traversal time against constraint
windows. - Scheduled closure, tide-related restriction, event road
closure, curfew/access window and planned transit suspension can affect
future segments. - Do not assume an expired restriction remains active
without updated evidence. - Do not assume a future closure is already
active.

## Pass 157 --- Forecast Route Risk vs Observed Route State

**Gap:** Forecast flooding/storm risk can be useful but must not
masquerade as current closure.

**Fix:** - Separate `OBSERVED_CONSTRAINT` from `FORECAST_RISK`. -
Forecast risk MAY influence alternative comparison and departure
advice. - It MUST NOT automatically convert an edge to CLOSED unless
policy/data source explicitly defines an operational closure. - Show
forecast horizon, confidence and source. - Route brief distinguishes
"currently affected" from "may become affected".

## Pass 158 --- Route Confidence Composition

**Gap:** A route composed of many uncertain segments needs an
explainable confidence assessment.

**Fix:** - Do not average confidence blindly. - Identify
critical/weakest segments whose uncertainty materially affects
feasibility. - Route confidence is derived from data coverage,
freshness, source quality/context, critical edge uncertainty and
provider capability state. - UI SHOULD expose material uncertainty
rather than a misleading precise percentage. - Confidence is not a
safety guarantee.

## Pass 159 --- Traveller Feedback / Field Correction

**Gap:** A traveller may discover a closure/flood before official/news
feeds update.

**Fix:** - Allow lightweight route feedback: - road blocked; -
flood/water; - heavy delay; - route passable; - transit issue; -
other. - Feedback becomes `Observation`, not direct authoritative
topology mutation. - Apply location/time/provenance/confidence/abuse
controls. - Multiple independent observations may raise confidence. -
Never create permanent user trust score solely from route feedback.

## Pass 160 --- Cross-Provider Disagreement

**Gap:** Routing, traffic, official feeds and news may disagree.

**Fix:** - Preserve provider/source-specific facts. - Deterministic
policy resolves hard authority constraints first. - Contradiction
remains visible when unresolved. - Routing provider saying "open" cannot
override a current official closure. - Traffic provider absence of
congestion does not prove absence of flood/closure. - AI explains
disagreement; it does not silently choose a convenient answer.

------------------------------------------------------------------------

# 261. Mode-Aware Edge Constraint

``` text
ModeEdgeConstraint {
  edge_id
  modes[]
  state
  direction?
  carriageway?
  lane_scope?
  turn_scope?
  access_class?
  effective_from?
  effective_until?
  observed_at
  freshness
  confidence
  source_refs[]
}
```

Possible access classes:

``` text
PUBLIC
LOCAL_ACCESS
AUTHORIZED_ONLY
EMERGENCY_ONLY
SERVICE_ONLY
UNKNOWN
```

------------------------------------------------------------------------

# 262. Accessibility Profile

``` text
AccessibilityProfile {
  step_free_required?
  wheelchair_access?
  maximum_walking_distance?
  avoid_stairs?
  elevator_required?
  stroller_friendly?
  other_constraints[]
}
```

The profile is optional and user-controlled.

Do not infer disability or health status from route behavior.

------------------------------------------------------------------------

# 263. Structure-Aware Mobility Segment

``` text
MobilityStructure {
  structure_id
  type:
    SURFACE |
    BRIDGE |
    UNDERPASS |
    TUNNEL |
    RAMP |
    ELEVATED_ROAD |
    FOOTBRIDGE
  level/elevation_metadata?
  geometry
  confidence
  source
}
```

Hazard projection SHOULD use structure/elevation information when
available rather than only planar intersection.

------------------------------------------------------------------------

# 264. Temporal Route Constraint

``` text
TemporalConstraint {
  constraint_id
  edge_or_area
  state
  effective_from
  effective_until?
  recurrence?
  source_refs[]
  confidence
}
```

Candidate route evaluation:

``` text
estimated segment arrival
→ intersect constraint time window?
→ apply restriction/risk
```

------------------------------------------------------------------------

# 265. Forecast Route Risk

``` text
ForecastRouteRisk {
  edge_or_area
  hazard_type
  forecast_window
  probability_or_category?
  expected_severity?
  model/source
  issued_at
  confidence
}
```

Forecast products remain distinct from observations.

------------------------------------------------------------------------

# 266. Route Confidence Explanation

Instead of:

``` text
Route confidence = 73.4%
```

prefer:

``` text
ความเชื่อมั่นโดยรวม: ปานกลาง

เหตุผล:
• ถนนส่วนใหญ่มีข้อมูลล่าสุด
• ช่วงอุโมงค์ ... ไม่มีข้อมูลน้ำล่าสุด 28 นาที
• ถนน ... มีรายงานสองแหล่งที่ขัดแย้งกัน
• สถานะ MRT มาจากข้อมูลผู้ให้บริการล่าสุด
```

This is more operationally meaningful.

------------------------------------------------------------------------

# 267. Traveller Observation Flow

``` text
Traveller
→ quick feedback
→ Observation
→ abuse/rate policy
→ geo/time normalization
→ event/edge correlation
→ corroboration
→ mobility projection candidate
→ policy/review
→ route impact
```

A single "ผ่านได้" report MUST NOT automatically reopen an officially
closed road.

------------------------------------------------------------------------

# 268. Conflict Resolution Precedence

Default conceptual precedence for hard restrictions:

``` text
Current legally/operationally authoritative restriction
> verified operational responder/transport operator restriction
> strongly corroborated current observations
> routing/traffic provider inference
> news-derived claim
> isolated unverified observation
> forecast risk
```

This is NOT a universal truth ranking.

Context, jurisdiction, source scope, freshness and contradiction still
matter.

The policy MUST be configurable and auditable.

------------------------------------------------------------------------

# 269. Travel Intelligence Boundary

SmartAIHub SHOULD remain an **intelligence and adaptive decision
layer**, not unnecessarily reproduce every turn-by-turn navigation
function.

Preferred integration:

``` text
SmartAIHub Situation Intelligence
+ provider/base routing engine
+ SmartAIHub dynamic constraint overlay
+ Skill-based analysis
+ grounded recommendation
```

Where a capable routing/navigation provider already exists, SmartAIHub
SHOULD augment it with hazard/access/event intelligence rather than
reimplement commodity map navigation.

SmartAIHub owns: - Situation Graph; - emergency/hazard/access
intelligence; - provenance/freshness; - route-impact reasoning; -
multi-source conflict handling; - Skill composition; - policy; - user
explanation; - emergency transition.

Provider/base engine may own: - base road topology; - ordinary
turn-by-turn geometry; - standard ETA; - map matching where
appropriate; - standard transit itinerary generation.

This boundary reduces implementation cost and improves provider
replaceability.

------------------------------------------------------------------------

# 270. Additional Acceptance Tests --- Passes 151--160

Implementation MUST prove:

1.  car closure does not automatically imply pedestrian closure;
2.  pedestrian access does not imply vehicle access;
3.  motorcycle route does not infer safe flood passage from physical
    width;
4.  pedestrian route never recommends unsafe flood wading from vehicle
    evidence;
5.  wheelchair/step-free constraint affects candidate route when data
    exists;
6.  unavailable accessibility data is disclosed rather than assumed;
7.  elevator outage can invalidate accessible transfer;
8.  directional closure does not unnecessarily block opposite
    carriageway when data is precise;
9.  unknown direction is not fabricated into lane-level precision;
10. illegal turn is not introduced by dynamic reroute;
11. temporary contraflow does not mutate permanent base topology;
12. emergency-only lane is not offered to ordinary user;
13. expired temporary restriction does not remain active without
    evidence;
14. underpass flooding does not automatically close vertically separate
    bridge;
15. dry elevated segment does not imply flooded ramp is passable;
16. future road closure affects route when ETA reaches it after closure
    begins;
17. future closure is not represented as currently closed;
18. forecast flood risk is not represented as observed flooding;
19. forecast risk can influence departure/route comparison;
20. weakest critical segment uncertainty appears in route confidence
    explanation;
21. route confidence is not a misleading simple average;
22. one traveller "road open" report cannot override official closure;
23. traveller feedback becomes Observation with provenance;
24. duplicate/spam feedback does not inflate confidence as independent
    evidence;
25. independent fresh observations can contribute to corroboration;
26. routing-provider open state cannot override current official
    closure;
27. traffic provider "normal" does not negate verified flood constraint;
28. conflicting providers remain visible/auditable;
29. AI cannot silently resolve unresolved conflict into certainty;
30. mode/access/temporal constraints survive provider swap;
31. hazard overlay can augment third-party route without duplicating
    base navigation engine;
32. SmartAIHub can change routing provider without changing canonical
    Situation Graph;
33. public-safe travel response does not expose restricted operational
    source data;
34. temporal constraint evaluation uses expected segment arrival, not
    only query time;
35. accessibility preferences remain optional and are not inferred as
    personal attributes.

------------------------------------------------------------------------

# 271. R1.14 Production Gate

Promotion requires: - multi-mode constraint tests; - accessibility route
tests; - direction/lane/turn tests; - temporary traffic-control expiry
tests; - bridge/underpass vertical-separation tests; -
temporal-constraint simulation; - forecast-vs-observation separation; -
route confidence explanation tests; - traveller feedback
abuse/corroboration tests; - cross-provider disagreement tests; -
provider-replacement compatibility test.

Certification scenario:

``` text
car + pedestrian + rail alternatives
+ directional road closure
+ flooded underpass beneath open elevated road
+ future closure window
+ forecast heavy rain
+ one conflicting traveller report
+ official restriction
+ realtime transit disruption
```

The result MUST preserve mode, time, provenance and uncertainty without
converting incomplete information into false certainty.

**End of Spec 260 R1.14 --- 160-Pass Cumulative Review / Mode-Aware
Mobility, Temporal Constraints & Route Confidence**

# 272. Review Passes 161--170 --- Predictive Mobility, Auditability and Cost Settlement

Passes 161--170 extend the cumulative review. All fixes below are
normative R1.15 requirements.

## Pass 161 --- Departure-Time / Predictive Journey Advice

**Gap:** "ออกอีกสองชั่วโมงจะดีขึ้นไหม" requires future-state reasoning, not
current routing.

**Fix:** - Add `DepartureWindowAnalysis`. - Separate current observed
constraints from forecast/predicted travel conditions. - Compare
multiple departure windows using traffic forecast, hazard forecast,
scheduled closures/transit and confidence. - Never promise future road
availability. - Prediction must expose horizon/source/uncertainty. - If
forecast quality is insufficient, say so instead of selecting a precise
best minute.

## Pass 162 --- ETA / Impact Uncertainty Bands

**Gap:** Disaster travel ETAs can be highly uncertain; a single ETA is
misleading.

**Fix:** - Prefer ranges when uncertainty is material. - Track baseline
ETA separately from disruption impact. - Identify causes of uncertainty:
traffic volatility, unknown road state, forecast hazard, transit
reliability, stale observations. - Do not generate fake statistical
precision where provider does not supply calibrated uncertainty. -
Update ranges when evidence materially changes.

## Pass 163 --- Route Comparison Transparency

**Gap:** A "recommended" route can hide tradeoffs.

**Fix:** - Route alternatives expose comparable dimensions: - travel
time; - known hazard exposure; - critical unknown segments; -
transfers/walking; - reliability; - access restrictions; - data
freshness; - expected cost/tolls when available. - Do not declare one
universal winner if tradeoffs materially differ. - User can choose
objective such as lower hazard exposure or fewer transfers. - Hard
safety/legal restrictions cannot be overridden by preference.

## Pass 164 --- Preference vs Safety/Policy Boundary

**Gap:** User may ask for "shortest route even if flooded" or "ignore
closure".

**Fix:** - Preferences optimize only within policy-permitted candidate
set. - Official/legal closure, restricted zone and clearly unsafe
constraint remain hard exclusions unless user is an authorized role
under applicable policy. - System can explain why preference cannot be
honored. - Vehicle profile never grants emergency/authorized access. -
LLM cannot relax hard constraints.

## Pass 165 --- Multi-Stop / Waypoint Journey

**Gap:** Real trips may include school, pickup, hospital, charging,
delivery or multiple errands.

**Fix:** - Support ordered/optional waypoints. - Re-evaluate downstream
stops after a disruption. - Allow skip/reorder only when user
intent/policy permits. - Each leg has its own route revision and
constraints. - A blocked intermediate stop does not silently cancel
final destination. - Emergency transition can occur on any leg.

## Pass 166 --- Journey Interruption / Resume

**Gap:** App restart, battery loss, device reboot or long stop can
orphan ActiveJourney state.

**Fix:** - ActiveJourney state can recover from durable minimal state. -
Resume checks expiry, last route revision, last location age and current
situation before continuing. - Do not assume old route remains valid. -
User can resume, end or start a new journey. - Duplicate active sessions
are reconciled deterministically.

## Pass 167 --- Coverage / Provider Boundary

**Gap:** Travel capabilities differ by country, city and provider
coverage.

**Fix:** - Capability Resolver exposes geographic coverage and feature
availability. - Do not promise
traffic/transit/turn-by-turn/accessibility data where provider coverage
is absent. - Cross-border journey can change providers/policies by
segment. - Units, language, road rules and timezone remain
segment-aware. - Provider absence degrades to available Situation
Intelligence rather than fabricated navigation.

## Pass 168 --- Map/Base-Graph Version Drift

**Gap:** Dynamic constraints can reference an edge that
changes/disappears after base map/provider update.

**Fix:** - Bind dynamic edge constraints to provider/base-graph version
where possible. - Maintain remapping/reconciliation process. - Orphaned
constraints are quarantined for rematch rather than silently applied to
wrong edge. - Geometry/source evidence remains available for
re-projection. - Provider migration requires compatibility validation.

## Pass 169 --- Recommendation Reproducibility / Audit

**Gap:** After an incident, operators may need to know why a route was
recommended.

**Fix:** - Persist a bounded `JourneyDecisionRecord` for material
recommendations according to privacy/retention policy. - Record route
revision, situation revision, material constraints, sources, policy
version, Skill/model versions, provider refs and decision time. - Do not
retain unnecessary full movement history. - Reproduction means
reconstructing decision inputs/policy, not claiming identical external
provider output forever. - User-facing explanation and internal audit
share stable reason codes.

## Pass 170 --- Cost Estimate / Actual Settlement

**Gap:** Multi-provider travel intelligence can have uncertain pre-query
cost and retries/fallbacks.

**Fix:** - Before optional expensive operation, derive `TravelUsagePlan`
and estimated credit range when meaningful. - Record actual billable
calls/tokens/Skill fees. - Settle against existing SmartAIHub economic
ledger. - Provider fallback charges only actual eligible usage. -
Platform retries/duplicate executions must not double charge. - Cached
result must not be billed as fresh provider call. - If budget cap is
reached, degrade capability or request user approval according to
existing policy; do not silently overspend.

------------------------------------------------------------------------

# 273. Departure Window Analysis

``` text
DepartureWindowAnalysis {
  origin
  destination
  candidate_windows[]
  current_constraints[]
  scheduled_constraints[]
  hazard_forecast_refs[]
  traffic_forecast_refs[]
  transit_schedule_refs[]
  confidence
  generated_at
}
```

Example output:

``` text
ตอนนี้:
  น้ำท่วมช่วง ... + การจราจรหนาแน่น
  ETA 95–125 นาที

ประมาณ 10:30–11:00:
  การจราจรอาจลดลง แต่ฝนมีแนวโน้มเพิ่ม
  ความไม่แน่นอนสูง

ระบบยังไม่มีข้อมูลเพียงพอที่จะยืนยันว่าออก 11:00 จะดีกว่าแน่นอน
```

------------------------------------------------------------------------

# 274. Route Comparison Matrix

``` text
RouteAlternative {
  route_revision
  objective
  eta_range?
  known_hazard_exposure
  critical_unknowns[]
  restrictions[]
  transfers
  walking?
  reliability
  freshness
  estimated_external_cost?
}
```

UI SHOULD compare dimensions instead of hiding them in a single opaque
score.

------------------------------------------------------------------------

# 275. Hard Constraint Policy

Examples:

``` text
HARD:
  official closure
  legally restricted area
  emergency-only access
  known impassable edge
  policy-defined unacceptable hazard

SOFT:
  congestion
  toll preference
  extra walking
  moderate delay
  lower-confidence inconvenience
```

Policy is configurable by jurisdiction/tenant/role.

------------------------------------------------------------------------

# 276. Multi-Stop Journey Contract

``` text
JourneyStop {
  stop_id
  location
  order
  required
  time_window?
  dwell_time?
  state:
    PENDING |
    APPROACHING |
    ARRIVED |
    SKIPPED |
    BLOCKED |
    COMPLETED
}
```

Route planning MAY optimize optional stops only with user permission.

------------------------------------------------------------------------

# 277. Active Journey Recovery

Minimal durable resume state:

``` text
JourneyResumeState {
  journey_id
  destination/stops
  transport_mode
  current_leg
  route_revision
  last_known_location?
  last_location_at?
  monitoring_policy
  expires_at
}
```

On resume:

``` text
load
→ validate expiry/authorization
→ check situation revisions
→ check provider capabilities
→ revalidate route
→ continue or request user choice
```

------------------------------------------------------------------------

# 278. Mobility Capability Coverage

``` text
MobilityCapabilityCoverage {
  provider
  capability:
    BASE_ROUTING |
    TRAFFIC |
    TRANSIT |
    REALTIME_TRANSIT |
    ACCESSIBILITY |
    MAP_MATCHING |
    GEOCODING |
    EV_CHARGING |
    PARKING
  geography
  quality_class?
  known_limitations[]
  updated_at
}
```

Capability Resolver uses this before provider invocation.

------------------------------------------------------------------------

# 279. Base Graph Reconciliation

``` text
Dynamic Constraint
→ edge reference + geometry
→ base graph version changed?
   NO → continue
   YES
     → rematch candidate edges
     → confidence check
     → accept mapping / quarantine
```

Never attach an old restriction to a new edge solely because the
identifier was reused.

------------------------------------------------------------------------

# 280. Journey Decision Record

``` text
JourneyDecisionRecord {
  decision_id
  journey_id
  created_at
  decision_type
  route_revision_before?
  route_revision_after?
  situation_revision
  material_constraint_refs[]
  source_refs[]
  reason_codes[]
  policy_version
  skill_versions[]
  model_version?
  routing_provider_ref?
  capability_state
  user_choice?
}
```

Privacy/retention policy controls persistence.

------------------------------------------------------------------------

# 281. Travel Usage Plan and Settlement

``` text
TravelUsagePlan {
  query_id
  capabilities[]
  provider_calls_planned[]
  cached_components[]
  estimated_credit_min?
  estimated_credit_max?
  user_budget_cap?
}

TravelUsageSettlement {
  query_id
  actual_provider_calls[]
  model_usage[]
  skill_fees[]
  cache_hits[]
  failed_nonbillable_attempts[]
  actual_credit_charge
  payer
  ledger_refs[]
}
```

No duplicate economic authority is introduced.

------------------------------------------------------------------------

# 282. Predictive Advice Guardrails

Predictive mobility MUST label:

``` text
CURRENT_OBSERVED
CURRENT_REPORTED
SCHEDULED
FORECAST
PREDICTED
UNKNOWN
```

Example:

``` text
"ถนน A ปิดอยู่ในขณะนี้"       → observed/official current state
"ถนน A มีกำหนดเปิด 10:00"    → scheduled/announced
"คาดว่าการจราจรจะดีขึ้น"      → prediction
"มีโอกาสน้ำสูงขึ้นช่วงบ่าย"    → forecast
```

Do not collapse these states.

------------------------------------------------------------------------

# 283. R1.15 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  future departure question does not reuse current ETA as future fact;
2.  forecast conditions are labelled as forecast/prediction;
3.  insufficient forecast quality does not produce precise "best
    departure minute";
4.  material ETA uncertainty is represented as range/limitation;
5.  provider without uncertainty data does not cause fabricated
    statistical confidence;
6.  route comparison exposes major tradeoffs;
7.  user preference for fastest route cannot bypass official closure;
8.  "ignore flood" cannot remove hard safety constraint;
9.  high-clearance vehicle does not gain emergency-only access;
10. multi-stop journey preserves required final destination if
    intermediate stop blocks;
11. optional waypoint is not silently reordered without permission;
12. each journey leg maintains route revision;
13. emergency transition works from intermediate leg;
14. app restart can restore minimal journey state;
15. restored journey revalidates stale route before continuing;
16. duplicate resumed sessions reconcile deterministically;
17. expired journey is not silently resumed;
18. provider coverage absence is disclosed;
19. cross-border journey can change provider/capability by segment;
20. unsupported realtime transit is not fabricated;
21. base graph update does not silently misapply old dynamic constraint;
22. orphaned edge constraint enters reconciliation/quarantine;
23. provider migration tests dynamic constraint compatibility;
24. material route recommendation records stable reason codes;
25. audit record can identify situation/policy/Skill versions used;
26. audit retention does not require unnecessary permanent location
    history;
27. cached route intelligence is not charged as fresh provider
    invocation;
28. fallback provider bills only actual eligible usage;
29. duplicate retry cannot double charge;
30. budget cap prevents silent overspend;
31. capability can degrade when budget exhausted according to policy;
32. estimated cost distinguishes cached and planned paid components;
33. actual settlement references canonical economic ledger;
34. predictive route recommendation cannot present scheduled reopening
    as guaranteed;
35. current observed closure remains distinguishable from future hazard
    forecast.

------------------------------------------------------------------------

# 284. R1.15 Production Gate

Promotion requires: - departure-window simulation; -
uncertainty/ETA-range tests; - route-comparison transparency tests; -
hard-vs-soft constraint policy tests; - multi-stop journey tests; -
restart/resume recovery drill; - geographic capability coverage tests; -
base-map/provider version reconciliation; - JourneyDecisionRecord audit
reconstruction; - estimated-vs-actual credit settlement tests.

Certification scenario:

``` text
multi-stop journey
+ departure in 2 hours
+ current flood closure
+ forecast worsening rain
+ scheduled reopening
+ provider coverage change
+ app restart
+ base-map revision
+ routing fallback provider
+ user credit budget cap
```

The system MUST preserve the distinction between current fact, schedule,
forecast and prediction; preserve route-policy constraints; recover the
journey; and settle only actual eligible usage.

**End of Spec 260 R1.15 --- 170-Pass Cumulative Review / Predictive
Mobility, Multi-Stop Resilience, Auditability & Cost Settlement**

# 285. Review Passes 171--180 --- Capability Discovery, Access and Monetization UX

Passes 171--180 extend the cumulative review. These passes explicitly
address how users discover SmartAIHub capabilities without confusing
public safety information with paid convenience services.

## Pass 171 --- Contextual Capability Discovery

**Gap:** A powerful feature that users do not know exists is
operationally equivalent to a missing feature.

**Fix:** - Add `CapabilitySuggestion` as a shared SmartAIHub UX
concept. - Detect context where a relevant optional capability could
materially help. - Examples: - viewing flood map → suggest route-impact
analysis; - viewing road closure → suggest checking destination route; -
repeated travel questions → suggest Active Journey monitoring; - viewing
an area before travel → suggest departure-time comparison; - active trip
with volatile corridor → suggest RouteWatch. - Suggestions MUST be
relevant, dismissible and non-blocking. - Public emergency information
remains accessible without accepting a commercial suggestion.

## Pass 172 --- Access Class Disclosure

**Gap:** User may assume every suggested capability is free.

**Fix:** Every suggested capability MUST expose an access class before
activation:

``` text
FREE_PUBLIC
LOGIN_REQUIRED_FREE
LOGIN_REQUIRED_CREDIT
SPONSORED_IF_ELIGIBLE
ORGANIZATION_ENTITLEMENT
```

For paid features, the UI MUST clearly say that credits may be charged.

Do not hide the paid nature behind the final confirmation step.

## Pass 173 --- Cost Disclosure Before Paid Activation

**Gap:** "Try this feature" can accidentally become an undisclosed paid
action.

**Fix:** - Viewing a promotion/suggestion MUST NOT itself incur paid
usage. - Login/authentication MUST NOT automatically authorize paid
provider/LLM calls. - Before the first paid execution, show expected
pricing semantics: - estimated credits/range when feasible; - "charged
according to actual usage" when variable; - budget cap if configured; -
what triggers additional cost. - Existing global/user approval
preferences MAY streamline repeat use only when explicit and
revocable. - No dark patterns.

## Pass 174 --- Public vs Paid Boundary

**Gap:** Safety-critical public information could accidentally be moved
behind login/credit wall after adding travel monetization.

**Fix:** The following remain governed by public/emergency policy: -
public alerts; - public hazard map; - public-safe road
closures/restrictions; - evacuation/public safety instructions; -
shelters/public facilities; - public event/freshness information; -
emergency reporting/intake according to existing policy.

Paid Travel Intelligence may add: - personalized route analysis; -
provider-backed routing; - premium live traffic/transit calls; - route
comparison; - Active Journey monitoring; - RouteWatch; - predictive
departure analysis; - AI synthesis beyond free public summary; -
optional premium research.

Do not make a user pay merely to learn a current public life-safety
warning.

## Pass 175 --- Login Step-Up With Intent Preservation

**Gap:** Suggested feature may require login and lose the user's
origin/destination/context.

**Fix:** - Preserve pending capability intent through authentication. -
Preserve safe non-sensitive query context where policy allows. - After
login, return to the exact capability confirmation, not generic home
screen. - Do not execute paid action until post-login authorization/cost
conditions are satisfied. - Anonymous emergency/public context must
remain usable if user declines login.

## Pass 176 --- Capability Suggestion Frequency / Fatigue

**Gap:** Contextual promotion can become spam.

**Fix:** - Frequency-cap repeated suggestions. - Respect
dismiss/snooze. - Do not repeatedly promote a capability already
declined in the same context. - Critical safety message always outranks
commercial suggestion. - During active emergency intake, suppress
unrelated monetized promotions. - During driving, suppress non-essential
promotional interaction.

## Pass 177 --- Capability Catalog / "What SmartAIHub Can Help With"

**Gap:** Discovery should not rely only on opportunistic banners.

**Fix:** Provide a discoverable capability surface, accessible from
Chat/Task Control and relevant product pages.

Example categories:

``` text
Emergency & Safety
  Report emergency
  View warnings
  Nearby situation

Travel & Mobility
  Check route impact
  Compare safer alternatives
  Check before departure
  Monitor active journey
  Watch route changes

Situation Intelligence
  Area brief
  Important changes
  Daily situation report
```

Each capability card shows access/billing class.

## Pass 178 --- Skill Metadata for User Discovery

**Gap:** Skill registry metadata is optimized for agents, not
user-facing discovery.

**Fix:** Extend discoverable Skill/capability metadata:

``` text
display_name
short_description
user_examples[]
access_class
login_required
billing_mode
estimated_cost_policy?
sponsorship_eligibility?
availability/coverage
device_support
```

User-facing capability descriptions MUST be derived from controlled
metadata, not hallucinated by LLM.

## Pass 179 --- Conversion Without Coercion

**Gap:** Emergency context creates heightened vulnerability; aggressive
upsell is inappropriate.

**Fix:** - Never use fear-based copy to sell paid travel capability. -
Never imply rescue/public warning requires purchase. - Never hide
dismiss action. - Never preselect a paid upgrade because hazard severity
increased. - Suggestions should explain utility factually. - Emergency
transition can supersede commercial flow immediately.

## Pass 180 --- Entitlement / Billing State Correctness

**Gap:** User may already have tenant entitlement, subscription, sponsor
coverage or insufficient credits.

**Fix:** Before showing paid CTA semantics, resolve current entitlement:

``` text
FREE
INCLUDED_IN_PLAN
ORGANIZATION_PAID
CREDIT_REQUIRED
SPONSORED_ELIGIBLE
UNAVAILABLE
```

CTA adapts: - `ใช้ฟังก์ชั่น` when included; - `เข้าสู่ระบบเพื่อใช้` when login
required; - `วิเคราะห์เส้นทาง — ใช้เครดิตตามจริง` for credit use; - `เติมเครดิต`
when insufficient; - `ไม่พร้อมใช้งานในพื้นที่นี้` when coverage absent.

Do not ask for payment when entitlement already covers the action.

------------------------------------------------------------------------

# 286. Capability Suggestion Contract

``` text
CapabilitySuggestion {
  suggestion_id
  capability_id
  trigger_context
  title
  short_explanation
  access_class
  login_required
  billing_mode
  estimated_cost_hint?
  coverage_state
  priority
  expires_at?
  dismiss_policy
  reason_code
}
```

Example:

``` text
ตรวจสอบเส้นทางก่อนเดินทาง

SmartAIHub สามารถนำข้อมูลน้ำท่วม ถนนปิด การจราจร
รถไฟฟ้า และเหตุการณ์ล่าสุดมาวิเคราะห์เส้นทางให้ได้

ต้องเข้าสู่ระบบ
ใช้เครดิตตามการใช้งานจริง

[วิเคราะห์เส้นทาง] [ไว้ภายหลัง]
```

The suggestion itself is free. Paid execution begins only after the
defined activation/authorization boundary.

------------------------------------------------------------------------

# 287. Suggested Capability UX Examples

## Public flood map

``` text
กำลังจะเดินทางผ่านพื้นที่นี้หรือไม่?

ตรวจสอบได้ว่าเส้นทางของคุณได้รับผลกระทบจากน้ำท่วม
ถนนปิด หรือระบบขนส่งหรือไม่

[ตรวจสอบเส้นทาง]

ต้องเข้าสู่ระบบ • การวิเคราะห์เส้นทางใช้เครดิตตามจริง
```

## Road closure detail

``` text
ถนนนี้มีผลต่อการเดินทางของคุณหรือไม่?

ระบุต้นทางและปลายทางเพื่อให้ SmartAIHub
ตรวจสอบทางเลี่ยงและทางเลือกขนส่งสาธารณะ

[วิเคราะห์ผลต่อเส้นทาง]

เข้าสู่ระบบเพื่อใช้ • อาจมีการคิดเครดิต
```

## Active Journey opportunity

``` text
ให้ SmartAIHub ช่วยติดตามเส้นทางระหว่างเดินทางไหม?

ระบบจะแจ้งเฉพาะเมื่อมีเหตุการณ์สำคัญที่กระทบ
เส้นทางข้างหน้า เช่น ถนนปิด น้ำท่วม หรือรถไฟฟ้าหยุดให้บริการ

[เปิด Active Journey]

ต้องเข้าสู่ระบบ • ใช้เครดิตตามการใช้งานจริง
```

## Free public capability

``` text
ดูประกาศเตือนและถนนปิดล่าสุด

ข้อมูลสาธารณะนี้ดูได้โดยไม่ต้องเข้าสู่ระบบ

[ดูสถานการณ์]
```

This visual distinction is mandatory.

------------------------------------------------------------------------

# 288. Access and Billing Badge System

Canonical badges:

``` text
ฟรี / สาธารณะ
เข้าสู่ระบบ
รวมในแพ็กเกจ
ใช้เครดิต
องค์กรเป็นผู้ชำระ
สนับสนุนฉุกเฉิน
```

Badges SHOULD be visible near CTA, not hidden in terms.

Avoid ambiguous labels such as `Premium` alone without billing
semantics.

------------------------------------------------------------------------

# 289. Activation State Machine

``` text
DISCOVERED
→ USER_INTEREST
→ ACCESS_CHECK
→ LOGIN_REQUIRED?
→ ENTITLEMENT_CHECK
→ COST_DISCLOSURE
→ USER_CONFIRMATION
→ EXECUTION
→ USAGE_SETTLEMENT
→ RESULT
```

Exceptions: - free public action can skip login/cost stages; - emergency
flow follows emergency policy; - previously authorized bounded usage may
follow existing user preference policy.

At no point does `DISCOVERED` itself trigger billable provider work.

------------------------------------------------------------------------

# 290. Capability Discovery Engine

Inputs may include: - current page/product; - user query intent; -
map/event context; - active journey state; - feature availability; -
coverage; - authentication state; - entitlement; - device class; -
recent suggestion suppression state.

Output is a small set of relevant suggestions.

Rules: - contextual relevance \> promotion volume; - at most a small
number of suggestions per surface; - do not expose restricted capability
metadata to unauthorized users; - no sensitive inference for
marketing; - deterministic policy filters before LLM wording.

------------------------------------------------------------------------

# 291. Chat Capability Discovery

Chat/Task Control SHOULD proactively but sparingly surface relevant
functions.

Example:

``` text
User:
"แถวลาดพร้าวน้ำท่วมหลายจุดหรือเปล่า"

Assistant:
[public situation answer]

Optional capability card:
"ถ้าคุณกำลังจะเดินทาง ผมสามารถตรวจว่าต้นทาง→ปลายทาง
ได้รับผลจากน้ำท่วม/ถนนปิด/รถไฟฟ้าหรือไม่"

[ตรวจเส้นทาง]
เข้าสู่ระบบ • ใช้เครดิตตามจริง
```

The public answer MUST NOT be withheld to force use of the paid feature.

------------------------------------------------------------------------

# 292. Capability Discovery on Map

Potential placements: - contextual bottom sheet after viewing affected
corridor; - event detail card; - route-related floating action; -
non-blocking map insight card; - post-search suggestion.

Do NOT: - cover critical warning; - obscure map controls; - interrupt
emergency report; - auto-open checkout.

------------------------------------------------------------------------

# 293. Authentication and Context Handoff

Pending capability context SHOULD use a bounded `PendingAction`:

``` text
PendingAction {
  action_id
  capability_id
  safe_context_ref
  created_at
  expires_at
  pre_auth_access_class
}
```

After login: 1. restore context; 2. re-check entitlement/coverage; 3.
re-price if necessary; 4. show confirmation; 5. execute only after
authorization.

Do not store unnecessary precise location in auth handoff token.

------------------------------------------------------------------------

# 294. Billing Disclosure Levels

## Known fixed fee

Show exact credits before execution.

## Predictable bounded usage

Show estimated range/max cap.

## Variable actual usage

Show: `คิดเครดิตตามการใช้งานจริง` plus budget cap/approval policy where
available.

If a query expands into optional expensive research, request additional
authorization if it would exceed existing approved budget.

------------------------------------------------------------------------

# 295. Free-to-Paid Transition

Example:

``` text
FREE:
ดูว่าถนน A ปิดจากน้ำท่วม

PAID:
"ถนน A ปิดแล้วมีผลต่อเส้นทางจากบ้านผมไปเซ็นทรัลลาดพร้าวอย่างไร
และควรเปลี่ยนไปขึ้นรถไฟฟ้าที่ไหน?"
```

Public facts remain free according to policy; personalized
computation/provider usage is billable.

A free public view MAY use cached/generated public intelligence funded
by platform/sponsor.

------------------------------------------------------------------------

# 296. Emergency Override of Commercial Flow

If paid travel flow detects emergency intent:

``` text
PAID_TRAVEL_PENDING
→ EMERGENCY_INTENT
→ cancel/suspend commercial activation
→ emergency intake
→ emergency sponsorship eligibility
```

Do not require credit top-up before emergency intake.

Any already incurred legitimate travel usage before transition follows
normal settlement; subsequent eligible emergency processing follows
emergency policy.

------------------------------------------------------------------------

# 297. Capability Analytics Without Dark Patterns

Measure: - suggestion impressions; - dismissals; - voluntary
activations; - login completion; - execution completion; - billing
confirmation abandonment; - usefulness feedback.

Do NOT optimize solely for paid conversion.

Also measure: - inappropriate suggestion rate; - suggestion shown during
emergency; - repeated suggestion fatigue; - misunderstanding of free vs
paid; - billing complaints.

Safety/clarity metrics are first-class.

------------------------------------------------------------------------

# 298. User Controls

User SHOULD be able to control: - show feature suggestions; - travel
feature suggestions; - paid feature reminders; - suggestion frequency
where product policy permits.

Turning off commercial suggestions MUST NOT turn off critical public
warnings.

------------------------------------------------------------------------

# 299. Capability Discovery Acceptance Tests

Implementation MUST prove:

1.  public hazard information is shown before/without paid route
    suggestion;
2.  paid suggestion clearly states login requirement where applicable;
3.  paid suggestion clearly states credit semantics;
4.  merely viewing suggestion incurs zero paid usage;
5.  clicking "learn more" incurs zero provider/LLM charge unless clearly
    part of paid execution;
6.  login alone does not execute paid action;
7.  context survives login without executing automatically;
8.  entitlement is rechecked after login;
9.  included-plan user is not asked to pay credits unnecessarily;
10. insufficient-credit user receives correct funding/alternative path;
11. unsupported geographic coverage is disclosed before execution;
12. dismissed suggestion does not immediately reappear;
13. repeated map panning does not create promotion spam;
14. emergency warning outranks commercial suggestion;
15. emergency intake suppresses unrelated upsell;
16. driving mode suppresses nonessential commercial prompt;
17. free public CTA is visually distinguishable from credit CTA;
18. LLM cannot invent capability price/access class;
19. capability metadata is canonical source for user-facing access
    state;
20. public answer is not truncated to coerce paid route analysis;
21. paid feature cannot be preselected because hazard severity
    increased;
22. emergency intent cancels/suspends pending commercial activation;
23. emergency intake is not blocked by zero credits;
24. existing paid travel usage and subsequent sponsored emergency usage
    settle separately;
25. PendingAction expires and does not retain unnecessary precise
    location;
26. re-price occurs after stale auth handoff where needed;
27. optional expensive research above approved cap requires additional
    authorization;
28. user can disable commercial suggestions without disabling safety
    alerts;
29. capability catalog shows access/billing class;
30. capability suggestion reflects device/coverage availability;
31. organization entitlement changes CTA correctly;
32. suggestion analytics captures misunderstanding/complaints, not only
    conversion;
33. one contextual suggestion does not cause broad background paid
    research;
34. anonymous user can dismiss suggestion and continue public map;
35. sponsored emergency badge is not used to imply ordinary travel is
    free.

------------------------------------------------------------------------

# 300. Review Passes 171--180 Summary

``` text
171 Contextual capability discovery
172 Access-class disclosure
173 Cost disclosure before activation
174 Public-vs-paid boundary
175 Login step-up with intent preservation
176 Suggestion fatigue control
177 Capability catalog
178 User-facing Skill metadata
179 Non-coercive emergency-context promotion
180 Entitlement/billing-state correctness
```

The core rule is:

``` text
DISCOVERABILITY ≠ AUTO-EXECUTION
LOGIN ≠ PAYMENT AUTHORIZATION
PUBLIC SAFETY ≠ PAID FEATURE
PAID CONVENIENCE ≠ EMERGENCY SPONSORSHIP
```

------------------------------------------------------------------------

# 301. R1.16 Production Gate

Promotion requires: - contextual suggestion relevance tests; -
free/public vs paid boundary tests; - login handoff tests; - entitlement
tests; - credit disclosure/settlement tests; - suggestion
frequency/fatigue tests; - emergency suppression tests; - driving-mode
suppression tests; - Capability Catalog metadata tests; -
zero-charge-before-activation verification; - user-control tests; -
accessibility/readability review of access/billing badges.

Certification scenario:

``` text
anonymous user
→ opens public flood map
→ sees road closure
→ receives optional route-analysis suggestion
→ sees "login + credits"
→ continues public map without paying
→ later chooses route analysis
→ logs in
→ context restored
→ actual entitlement/coverage checked
→ cost disclosed
→ user confirms
→ route intelligence executes
→ only actual eligible usage is charged
```

A second certification scenario MUST prove:

``` text
paid travel flow
→ user reports being trapped/in danger
→ commercial prompt disappears
→ emergency intake starts immediately
→ zero credit balance does not block intake
→ sponsorship policy is evaluated independently
```

**End of Spec 260 R1.16 --- 180-Pass Cumulative Review / Capability
Discovery, Transparent Access & Paid Feature Activation**

# 302. Review Passes 181--190 --- Billing Safety, Consent and Capability Lifecycle

Passes 181--190 extend the cumulative review. All fixes below are
normative R1.17 requirements.

## Pass 181 --- Free Preview / Paid Execution Boundary

**Gap:** Users may need to understand value before spending credits, but
preview can accidentally trigger paid providers.

**Fix:** - Capability MAY offer a `FREE_PREVIEW` generated only from
already-available public/cached data. - Preview MUST clearly state its
limitations. - Preview MUST NOT silently call billable
routing/traffic/LLM/research providers. - Paid execution begins only
after explicit activation boundary. - If no meaningful free preview can
be produced without paid calls, say so rather than disguising paid work
as preview.

Example:

``` text
ฟรี:
เส้นทางของคุณอาจผ่าน 2 พื้นที่ที่มีรายงานน้ำท่วม

วิเคราะห์แบบเต็ม:
ตรวจเส้นทางจริง + ทางเลี่ยง + รถไฟฟ้า + traffic ล่าสุด
ต้องเข้าสู่ระบบ • ใช้เครดิตตามจริง
```

## Pass 182 --- Insufficient Credit / Graceful Degradation

**Gap:** A user with insufficient credits should not lose access to
already-free public information.

**Fix:** - If paid capability cannot execute: - retain public
hazard/closure/alert view; - offer lower-cost/cached option where
valid; - offer top-up or entitlement path; - never fabricate premium
result. - Partial paid execution MUST follow settlement policy and
disclose whether useful billable value was produced. - Emergency
transition remains independent of travel balance.

## Pass 183 --- Cancellation / Abort / Refund Semantics

**Gap:** User may cancel while providers/LLM calls are already in
progress.

**Fix:** - Define cancellation points. - Stop not-yet-started optional
calls. - Already-incurred eligible provider usage may remain billable
according to policy. - Failed/aborted work with no recognized billable
value follows existing nonbillable/refund policy. - Settlement UI MUST
distinguish reserved/estimated vs actually charged credits. -
Cancellation cannot erase audit/usage records.

## Pass 184 --- Duplicate Activation / Idempotent Billing

**Gap:** Double-click, retry, browser refresh or mobile reconnect can
execute the same paid analysis twice.

**Fix:** - Paid capability activation requires idempotency key. - Same
logical action/revision MUST not duplicate provider work/charge when
safely reusable. - UI disables/reflects in-progress activation. - Retry
attaches to existing execution when appropriate. - Settlement is
exactly-once from user economic perspective even if underlying
processing is at-least-once.

## Pass 185 --- Shared Device / Account Billing Safety

**Gap:** Shared tablet/desktop may expose one user's wallet to another
person's action.

**Fix:** - Before paid activation, verify current authenticated
principal/payer context. - High-value/continuous monitoring MAY require
re-auth/confirmation according to account policy. - Lock-screen/public
surfaces MUST NOT expose credit balance or private trip history
unnecessarily. - Logout/revocation stops new paid actions. - Never infer
payer from device identity alone.

## Pass 186 --- Personal vs Organization Payer Selection

**Gap:** User may belong to tenant/company plan while also owning
personal credits.

**Fix:** - Resolve eligible payer sources before activation. - Show
payer when meaningful: - Personal credits; - Organization entitlement; -
tenant-sponsored quota; - other configured payer. - Do not silently
charge personal wallet when organization policy covers the action. - If
multiple payer choices are allowed, follow configured priority/user
choice. - Reuse canonical SmartAIHub economic routing.

## Pass 187 --- Price / Policy Version Drift

**Gap:** Cost estimate shown before login/confirmation may become stale.

**Fix:** - Cost disclosure carries pricing/policy version and expiry. -
Re-price before execution if estimate expired or capability plan
materially changed. - If new estimate exceeds approved bound, require
renewed confirmation. - Lower actual usage settles lower where
usage-based policy applies. - Never retroactively apply an undisclosed
higher price.

## Pass 188 --- Continuous Monitoring Consent

**Gap:** Active Journey/RouteWatch uses continuing location/context and
continuing credit consumption.

**Fix:** Before activation disclose: - what is monitored; - location
precision; - monitoring duration; - notification behavior; - billing
mode/budget cap; - how to pause/end.

During monitoring: - persistent visible state; - easy pause/end; -
auto-expiry; - periodic budget/status visibility; - no hidden indefinite
monitoring.

## Pass 189 --- Capability Availability Changes Mid-Session

**Gap:** Provider, geographic coverage, entitlement or policy may change
while user is using a feature.

**Fix:** - Re-check critical capability availability at appropriate
boundaries. - If provider fails, degrade/fallback according to policy. -
If entitlement expires, do not silently switch payer and charge personal
credits without authorization. - If coverage disappears, explain
limitation. - Existing free/public information remains accessible where
possible.

## Pass 190 --- "Why Am I Seeing This?" Explanation

**Gap:** Contextual capability promotion can feel invasive or arbitrary.

**Fix:** - Suggestions SHOULD have a simple reason code/explanation. -
Example: `แนะนำเพราะคุณกำลังดูถนนที่มีเหตุการณ์น้ำท่วม` - Do not reveal sensitive
inferred attributes. - User can dismiss/disable category. - Reasoning is
derived from current interaction/context, not hidden behavioral
profiling by default.

------------------------------------------------------------------------

# 303. Capability Execution Contract

``` text
CapabilityExecution {
  execution_id
  idempotency_key
  capability_id
  user_principal
  payer_context
  access_class
  pricing_version
  policy_version
  estimated_cost?
  approved_budget?
  state:
    PENDING |
    AUTHORIZED |
    RUNNING |
    CANCELLING |
    CANCELLED |
    COMPLETED |
    FAILED
  created_at
  completed_at?
}
```

------------------------------------------------------------------------

# 304. Preview Contract

``` text
CapabilityPreview {
  capability_id
  generated_from:
    PUBLIC_CACHE |
    EXISTING_PUBLIC_PROJECTION |
    EXISTING_USER_CONTEXT
  billable_calls: 0
  limitations[]
  generated_at
  freshness
}
```

A `FREE_PREVIEW` with `billable_calls > 0` is invalid unless separately
sponsored by explicit policy and still represented accurately to the
user.

------------------------------------------------------------------------

# 305. Paid Activation UX

Example:

``` text
วิเคราะห์เส้นทางแบบละเอียด

รวม:
• เส้นทางและทางเลี่ยง
• น้ำท่วม/ถนนปิดตามข้อมูลล่าสุด
• traffic / transit ที่รองรับ
• สรุปข้อจำกัดสำคัญ

ผู้ชำระ: เครดิตส่วนตัว
ประมาณการ: 2–4 เครดิต
คิดตามการใช้งานจริง สูงสุดไม่เกิน 5 เครดิตสำหรับคำขอนี้

[ยืนยันและวิเคราะห์]
[ยกเลิก]
```

If organization entitlement applies:

``` text
ผู้ชำระ: บริษัท ABC
รวมอยู่ในสิทธิ์ขององค์กร
[วิเคราะห์เส้นทาง]
```

Do not show personal-credit CTA unnecessarily.

------------------------------------------------------------------------

# 306. Continuous Monitoring UX

Example:

``` text
Active Journey

ระบบจะ:
• ใช้ตำแหน่งระหว่างการเดินทาง
• ตรวจเฉพาะเหตุการณ์ที่กระทบเส้นทางข้างหน้า
• แจ้งเมื่อมีการเปลี่ยนแปลงสำคัญ

ระยะเวลา: จนถึง 11:30 หรือเมื่อถึงปลายทาง
การคิดเครดิต: ตามการใช้งานจริง
งบสูงสุดสำหรับการติดตามครั้งนี้: 12 เครดิต

[เริ่มติดตาม]
```

Persistent state:

``` text
Active Journey กำลังทำงาน
ใช้ไป 3.2 / สูงสุด 12 เครดิต
[หยุดชั่วคราว] [สิ้นสุด]
```

Exact display granularity may follow product/economic policy, but hidden
indefinite paid monitoring is prohibited.

------------------------------------------------------------------------

# 307. Payer Resolution

Conceptual:

``` text
Capability Request
→ entitlement check
→ eligible payer set
→ policy priority
→ user choice if required
→ budget validation
→ authorization
→ execution
→ settlement
```

Possible payer contexts reuse existing economic model:

``` text
PERSONAL
ORGANIZATION
TENANT
SPONSOR
SYSTEM
EMERGENCY_SPONSORSHIP
```

Travel convenience normally cannot claim emergency sponsorship merely
because hazard data is involved.

------------------------------------------------------------------------

# 308. Cost Reservation vs Settlement

If reservation is used:

``` text
estimated/reserved amount
≠ final charge
```

Requirements: - unused reservation released; - final settlement based on
eligible actual usage; - duplicate worker execution cannot duplicate
final charge; - cancellation resolves reservation deterministically; -
user can inspect completed usage record according to product policy.

------------------------------------------------------------------------

# 309. Paid Execution Failure Matrix

``` text
Failure before any billable call
→ charge 0

Provider billable call succeeded, later optional synthesis failed
→ settle eligible actual provider usage
→ return degraded result/refund adjustment according to policy

Platform duplicated execution
→ one logical user settlement

User cancelled before optional calls
→ stop remaining work
→ settle only eligible incurred usage

Emergency transition
→ close/suspend commercial execution
→ settle pre-transition eligible usage
→ new emergency operations use emergency payer policy
```

------------------------------------------------------------------------

# 310. Monitoring Budget Guard

Continuous capability MUST support at least one bounded control:

``` text
credit cap
time cap
trip completion
explicit end time
subscription entitlement boundary
```

If budget cap approaches: - reduce optional refresh where safe; - notify
user where useful; - do not exceed authorized cap; - preserve
free/public critical warnings; - allow user to extend budget explicitly.

------------------------------------------------------------------------

# 311. Capability Availability State

``` text
CapabilityAvailability {
  capability_id
  coverage
  provider_state
  entitlement_state
  auth_state
  billing_state
  device_support
  current_limitations[]
  checked_at
}
```

CTA is generated from this state, not hard-coded assumptions.

------------------------------------------------------------------------

# 312. Suggestion Reason Codes

Examples:

``` text
VIEWING_AFFECTED_AREA
VIEWING_ROAD_CLOSURE
TRAVEL_INTENT_DETECTED
REPEATED_ROUTE_QUESTION
ACTIVE_VOLATILE_CORRIDOR
DESTINATION_AFFECTED
UPCOMING_TRIP_CONTEXT
```

User-facing explanation should be simple and non-creepy.

------------------------------------------------------------------------

# 313. Capability Discovery Accessibility

Suggestions and billing disclosure MUST: - work with screen readers; -
not rely on color alone for free/paid distinction; - use understandable
Thai/localized language; - keep CTA and price/access information
adjacent; - support keyboard/touch; - avoid tiny disclaimers; - preserve
critical warning hierarchy.

------------------------------------------------------------------------

# 314. Capability Lifecycle Analytics

Track separately:

``` text
suggested
previewed
login_started
login_completed
cost_disclosed
authorized
execution_started
execution_completed
cancelled
failed
settled
refunded/adjusted
```

This helps distinguish: - feature discovery problem; - login friction; -
pricing confusion; - provider failure; - poor usefulness.

Do not interpret drop-off automatically as a need for more aggressive
upsell.

------------------------------------------------------------------------

# 315. R1.17 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  free preview makes zero billable calls;
2.  preview limitation is visible;
3.  insufficient credits do not hide public warnings/closures;
4.  lower-cost cached option is not represented as live premium
    analysis;
5.  cancel before billable call charges zero;
6.  cancel after eligible provider usage settles only allowed actual
    usage;
7.  unused reservation is released;
8.  double-click paid CTA produces one logical charge;
9.  browser refresh does not duplicate paid execution;
10. reconnect attaches to existing execution when appropriate;
11. shared device cannot select payer from device identity alone;
12. logout prevents new paid action;
13. organization entitlement is preferred according to configured
    policy;
14. personal wallet is not silently charged when organization covers
    action;
15. payer change is visible where meaningful;
16. expired price estimate is revalidated;
17. higher repriced cost beyond approval requires renewed confirmation;
18. undisclosed higher price is never applied retroactively;
19. Active Journey shows monitoring is active;
20. Active Journey exposes pause/end;
21. Active Journey has bounded duration/budget;
22. monitoring cannot silently continue indefinitely;
23. budget cap is not exceeded without authorization;
24. budget exhaustion does not suppress free critical public warning;
25. entitlement expiry does not silently switch to personal wallet;
26. provider coverage loss produces degraded/limited state;
27. capability reason does not expose sensitive inferred attributes;
28. user can dismiss/disable paid suggestion category;
29. suggestion reason can be explained from current context;
30. billing badge works without color-only semantics;
31. screen reader receives access/billing status;
32. capability lifecycle analytics distinguish authorization from
    execution;
33. platform duplicate worker run settles once;
34. emergency transition separates commercial and emergency settlement;
35. failed optional AI synthesis cannot cause fabricated successful
    premium result;
36. zero billable provider usage cannot produce nonzero usage charge;
37. organization payer revocation mid-run follows explicit policy rather
    than hidden fallback;
38. pending reservation is resolved after failure/cancel;
39. free preview does not trigger broad background research on behalf of
    the user;
40. capability availability CTA updates when auth/coverage/entitlement
    changes.

------------------------------------------------------------------------

# 316. Review Passes 181--190 Summary

``` text
181 Free preview boundary
182 Insufficient-credit degradation
183 Cancellation/refund semantics
184 Idempotent paid activation
185 Shared-device billing safety
186 Personal/organization payer resolution
187 Price/policy version drift
188 Continuous-monitoring consent
189 Mid-session capability availability changes
190 Explainable contextual suggestion
```

Core invariants:

``` text
NO SURPRISE CHARGE
NO HIDDEN CONTINUOUS MONITORING
NO DUPLICATE SETTLEMENT
NO SILENT PAYER SWITCH
NO PAYWALL ON PUBLIC SAFETY
```

------------------------------------------------------------------------

# 317. R1.17 Production Gate

Promotion requires: - zero-cost preview verification; -
insufficient-credit fallback tests; -
cancellation/reservation/settlement tests; - double-click/reconnect
idempotency tests; - shared-device payer tests; -
organization-vs-personal payer routing tests; - pricing version expiry
tests; - continuous monitoring consent/budget tests; - mid-session
entitlement/provider failure tests; - suggestion explanation/privacy
tests; - accessibility audit for access/billing disclosure.

Certification scenario:

``` text
user sees contextual Active Journey suggestion
→ free explanation/preview
→ login
→ organization entitlement unavailable
→ personal credit estimate shown
→ user authorizes max 10 credits
→ double-click/reconnect occurs
→ one execution/settlement
→ provider partially fails
→ system degrades
→ user cancels
→ unused reservation released
→ public warnings remain available
```

Second scenario:

``` text
organization initially pays
→ entitlement expires during monitoring
→ system does NOT silently charge personal wallet
→ monitoring pauses/degrades according to policy
→ user receives clear choice
```

**End of Spec 260 R1.17 --- 190-Pass Cumulative Review / Billing Safety,
Continuous Consent & Capability Lifecycle**

# 318. Sponsored Capacity & Quota Governance

Emergency/public-benefit sponsorship MUST NOT mean unlimited provider
consumption.

The system MUST protect: 1. life-safety minimum capability; 2. ordinary
SmartAIHub user workloads; 3. provider/API account quotas; 4. sponsor
budgets; 5. tenant budgets; 6. platform solvency and availability.

Core principle:

``` text
SPONSORED != UNLIMITED
EMERGENCY PRIORITY != CONSUME ALL CAPACITY
PUBLIC BENEFIT != BYPASS PROVIDER LIMITS
```

------------------------------------------------------------------------

# 319. Quota Dimensions

Quota policy MUST support combinations of:

``` text
TIME:
  HOURLY
  DAILY
  WEEKLY
  MONTHLY
  INCIDENT_LIFETIME

SCOPE:
  USER / PSEUDONYMOUS_REPORTER
  INCIDENT
  HOUSEHOLD
  AREA / GEO CELL
  HAZARD EVENT
  TENANT
  ORGANIZATION
  SPONSOR POOL
  PLATFORM

RESOURCE:
  CREDITS
  CURRENCY BUDGET
  PROVIDER REQUESTS
  MODEL TOKENS
  AI INFERENCE
  SEARCH/RESEARCH CALLS
  ROUTING CALLS
  MEDIA ANALYSIS
  SMS
  VOICE/CALL
  STORAGE/EGRESS
  NOTIFICATION FANOUT

CAPABILITY:
  emergency intake
  situation brief
  AI synthesis
  media analysis
  route intelligence
  research
  notification
  translation
  other Skill/capability
```

Policies may compose multiple dimensions.

------------------------------------------------------------------------

# 320. Sponsored Quota Policy

``` text
SponsoredQuotaPolicy {
  policy_id
  scope
  eligible_purposes[]
  eligible_capabilities[]
  provider/model constraints[]
  hourly_limit?
  daily_limit?
  weekly_limit?
  monthly_limit?
  incident_limit?
  currency_budget?
  credit_budget?
  reserved_emergency_minimum?
  normal_workload_reserve?
  warning_thresholds[]
  degradation_policy
  reset_policy
  sponsor_pool_refs[]
  priority
  version
  effective_from
  effective_until?
}
```

Example:

``` text
Emergency AI Sponsorship — Platform Pool

hourly: 10,000 sponsored credits
daily: 100,000
weekly: 500,000
monthly: 1,500,000

provider protection:
reserve at least 35% of provider capacity for normal SmartAIHub workloads

thresholds:
70% → optimize/cached-first
85% → cheaper model/deterministic Skills
95% → essential emergency functions only
100% → no optional sponsored AI; preserve minimum emergency path
```

Values are configuration examples, not normative defaults.

------------------------------------------------------------------------

# 321. Hierarchical Quota Evaluation

A sponsored request MUST pass all applicable quota scopes.

Conceptual:

``` text
Request
→ eligibility
→ per-user/reporter policy
→ incident quota
→ area/event quota
→ tenant quota
→ sponsor-pool quota
→ platform sponsored quota
→ provider capacity guard
→ admission/degradation decision
```

Passing a user quota does not bypass exhausted platform/provider
capacity.

------------------------------------------------------------------------

# 322. Quota Admission Result

``` text
QuotaAdmission {
  request_id
  purpose
  capability
  payer
  sponsor_pool?
  state:
    ALLOW |
    ALLOW_DEGRADED |
    ALLOW_RESERVED_MINIMUM |
    REQUIRE_USER_PAYMENT |
    DEFER_NONCRITICAL |
    DENY_OPTIONAL_SPONSORED
  limiting_scope?
  remaining_budget?
  reset_at?
  degradation_tier?
  reason_code
  policy_version
}
```

Life-safety minimum flows SHOULD degrade rather than simply fail when
feasible.

------------------------------------------------------------------------

# 323. Provider Capacity Protection

Quota governance MUST operate independently from financial credits.

Even if sponsor money is available, a provider can still have: -
request-per-minute limits; - token-per-minute limits; - concurrency
limits; - daily/monthly account quota; - model-specific capacity; -
messaging/SMS throughput; - routing/search quotas.

Therefore maintain:

``` text
ProviderCapacityEnvelope {
  provider
  capability/model
  total_capacity
  reserved_normal_capacity
  reserved_emergency_capacity?
  shared_burst_capacity
  current_consumption
  provider_reset_window
  circuit_state
}
```

Sponsored workload MUST NOT consume `reserved_normal_capacity`.

------------------------------------------------------------------------

# 324. Workload Capacity Classes

``` text
P0_LIFE_SAFETY_MINIMUM
P1_EMERGENCY_OPERATIONAL
P2_PUBLIC_SITUATION
P3_SPONSORED_ENRICHMENT
P4_PAID_USER_TRAVEL
P5_NORMAL_PLATFORM
```

This list describes workload classes, NOT a simple global priority
queue.

Capacity policy MUST reserve/isolate resources so P0/P1 surge cannot
starve P5 normal platform work, and P5 cannot consume protected P0
minimum.

Separate provider budgets/queues/pools SHOULD be used where practical.

------------------------------------------------------------------------

# 325. Degradation Ladder on Sponsored Quota Pressure

When sponsored quota approaches limit:

``` text
TIER 0 NORMAL
  preferred model/provider

TIER 1 OPTIMIZED
  cache-first
  shorter context
  coalesce requests
  reduced refresh

TIER 2 ECONOMY
  cheaper/faster model
  deterministic Skill where possible
  lower-cost provider

TIER 3 ESSENTIAL
  no optional research
  no optional media AI
  minimal synthesis
  critical notifications only

TIER 4 MINIMUM EMERGENCY
  deterministic intake
  canonical write
  critical state/read
  essential alert
  emergency escalation
```

Do not silently label degraded intelligence as full-quality live
analysis.

------------------------------------------------------------------------

# 326. User Experience When Sponsored Quota Is Limited

Example:

``` text
การวิเคราะห์ AI แบบสนับสนุนฟรีของพื้นที่นี้ใช้งานถึงโควต้าชั่วคราวแล้ว

ข้อมูลเตือนภัยและข้อมูลสาธารณะสำคัญยังใช้งานได้ตามปกติ

ตัวเลือก:
[ใช้ข้อมูลพื้นฐาน]
[ใช้เครดิตของฉันเพื่อวิเคราะห์เพิ่มเติม]
```

For life-safety intake, do not interrupt with payment CTA before minimum
emergency handling.

------------------------------------------------------------------------

# 327. Sponsor Pool

``` text
SponsorPool {
  pool_id
  sponsor_type:
    PLATFORM |
    GOVERNMENT |
    NGO |
    COMPANY |
    FOUNDATION |
    DONOR_POOL |
    OTHER
  sponsor_ref
  name
  funded_amount
  available_amount
  eligible_purposes[]
  eligible_hazards[]
  eligible_geographies[]
  eligible_capabilities[]
  start_at
  end_at?
  quota_multiplier?
  hard_budget_cap
  status
}
```

Adding funding MAY increase sponsored capacity according to policy.

Money alone does not override provider technical capacity.

------------------------------------------------------------------------

# 328. Sponsor Funding → Quota Expansion

Flow:

``` text
Sponsor Funding
→ verified payment/funding event
→ Sponsor Pool balance
→ policy eligibility
→ quota planner
→ expanded financial sponsored envelope
→ provider capacity check
→ effective quota
```

Effective quota is:

``` text
min(
  financial sponsored capacity,
  provider technical capacity,
  platform safety capacity,
  configured policy cap
)
```

Thus a large donation cannot accidentally overload providers.

------------------------------------------------------------------------

# 329. Multiple Sponsor Pools

A request MAY be eligible for multiple pools.

Example priority:

``` text
Flood-specific local sponsor
→ provincial/government pool
→ NGO disaster pool
→ platform emergency pool
```

Rules: - configurable ordering; - no duplicate funding of same usage; -
auditable payer split where allowed; - pool exhaustion falls through
according to policy; - restricted sponsor money cannot be repurposed
outside eligibility.

------------------------------------------------------------------------

# 330. Sponsor Transparency

Public/user-facing disclosure MAY show:

``` text
การวิเคราะห์นี้ได้รับการสนับสนุนโดย ...
ผู้ใช้ไม่ถูกหักเครดิต
```

Subject to sponsor/tenant policy.

Do not imply sponsor controls emergency decisions.

Sponsor identity MUST NOT affect triage priority.

------------------------------------------------------------------------

# 331. Quota Ledger

Quota consumption is separate from monetary ledger but linked.

``` text
QuotaUsageEvent {
  usage_id
  request_id
  policy_id
  scope_refs[]
  capability
  provider/model?
  quota_units
  financial_cost?
  sponsor_pool?
  occurred_at
  idempotency_key
  settlement_ref?
}
```

Requirements: - idempotent; - auditable; - supports reservation/release
where needed; - reset windows do not delete historical usage; -
corrections use adjustment events.

------------------------------------------------------------------------

# 332. Distributed Quota Enforcement

Because SmartAIHub is Cloudflare/distributed:

-   do not rely on a single unsafe in-memory counter;
-   use appropriate authoritative/coordination mechanism for strict
    quotas;
-   approximate edge counters MAY be used for early shedding only;
-   hard financial/provider limits require bounded overshoot design;
-   partition counters to avoid hot keys;
-   reservation tokens MAY be used for expensive operations;
-   reconciliation corrects drift without double charging.

Implementation MAY use Durable Objects/appropriate Cloudflare primitives
for coordination while PostgreSQL/economic records remain canonical
according to existing architecture.

No new orchestration authority is introduced.

------------------------------------------------------------------------

# 333. Quota Reservation

For expensive sponsored jobs:

``` text
check
→ reserve quota
→ execute
→ settle actual usage
→ release unused reservation
```

Reservation prevents concurrent workers from all seeing remaining budget
and overspending it.

Expired/crashed reservations MUST be reclaimable.

------------------------------------------------------------------------

# 334. Reset Windows

Support: - rolling hour; - calendar day; - rolling 24h; - calendar
week; - rolling 7d; - calendar month; - rolling 30d.

Policy MUST specify timezone for calendar windows.

Never infer reset timezone from client device for platform/sponsor
policy.

------------------------------------------------------------------------

# 335. Disaster Surge Override

Authorized operators MAY temporarily expand quota if: - funding exists
or authorized emergency platform budget permits; - provider capacity
supports it; - reason is recorded; - scope and expiry are bounded.

``` text
QuotaOverride {
  override_id
  scope
  old_limit
  new_limit
  reason
  actor
  approved_at
  expires_at
}
```

No permanent unlimited override.

------------------------------------------------------------------------

# 336. Provider Exhaustion Prevention

Before sponsored workloads can exhaust provider account:

``` text
provider usage forecast
→ warning threshold
→ reserve normal capacity
→ reduce optional sponsored calls
→ switch provider/model where policy permits
→ deterministic/cached fallback
→ stop optional sponsored enrichment
```

Admin alerts SHOULD trigger before hard exhaustion.

------------------------------------------------------------------------

# 337. Quota Forecasting

System SHOULD forecast:

``` text
current burn rate
remaining sponsored budget
remaining provider quota
time-to-exhaustion
active disaster demand
expected next-hour/day demand
```

This enables proactive sponsor/top-up/operator action.

Forecast is advisory and must expose uncertainty.

------------------------------------------------------------------------

# 338. Sponsor / Operator Dashboard

Dashboard SHOULD show: - funded amount; - remaining sponsor balance; -
hourly/daily/weekly/monthly usage; - provider quota health; -
normal-capacity reserve; - sponsored requests served; - degraded
requests; - denied optional sponsored requests; - estimated time to
exhaustion; - active incidents/areas consuming pool; - top capabilities
by cost; - sponsor pool coverage; - pending funding; - quota overrides.

No public victim-level details.

------------------------------------------------------------------------

# 339. Sponsor Funding Notification

When quota is approaching exhaustion, authorized sponsor/operator
surfaces MAY show:

``` text
กองทุนสนับสนุนเหตุอุทกภัยเหลือประมาณ 18%
จากอัตราการใช้งานปัจจุบันคาดว่าอาจเหลือ ~7 ชั่วโมง

[เพิ่มวงเงินสนับสนุน]
[ปรับนโยบาย]
```

Funding workflow remains separate from emergency triage.

------------------------------------------------------------------------

# 340. User-Paid Fallback

For non-life-safety optional capabilities:

``` text
sponsored quota exhausted
→ free/basic public capability remains
→ user MAY choose personal credits
```

Never automatically switch to personal wallet.

Explicit confirmation is required according to paid capability policy.

------------------------------------------------------------------------

# 341. Abuse Resistance

Sponsored quota is especially abuse-sensitive.

Controls MAY include: - per-user/reporter caps; - per-device/session
rate control; - incident correlation; - progressive friction; -
duplicate request suppression; - capability-specific limits; - anomaly
detection; - human review.

Do not require heavy identity verification before minimum life-safety
intake.

Do not equate anonymous with abusive.

------------------------------------------------------------------------

# 342. Fairness Under Scarcity

When sponsored resources are scarce: - life-safety minimum takes
precedence over optional enrichment; - do not allocate based on wealth,
sponsor identity or engagement metrics; - deterministic policy should
govern scarcity; - avoid first-come-first-served as sole rule for
critical emergency resources; - preserve geographic/tenant fairness
controls where configured; - audit overrides.

This quota policy controls computational/economic resources, not
clinical/rescue triage itself.

------------------------------------------------------------------------

# 343. Quota and Skill Metadata

Each potentially sponsored Skill SHOULD declare:

``` text
quota_class
estimated_units
provider_dependencies
degradation_fallback
minimum_viable_mode
sponsorship_eligible
user_paid_fallback_allowed
```

Capability Resolver can then select a path that fits remaining
budget/capacity.

------------------------------------------------------------------------

# 344. Example Policy

``` text
Public Emergency Situation AI

FREE PUBLIC:
  alerts
  public map
  public road closures
  shelters
  basic deterministic area facts

SPONSORED:
  concise AI area summary
  translation enrichment
  limited media classification
  emergency case summarization

LIMITS:
  hourly + daily + weekly + monthly
  incident/user/area anti-abuse limits
  sponsor pool hard cap
  provider reserve

WHEN 85% USED:
  cheaper model + cache-first

WHEN 95% USED:
  deterministic/minimal AI
  no optional research

WHEN 100% USED:
  minimum emergency path remains
  optional sponsored AI unavailable
  optional user-paid continuation may be offered outside emergency intake
```

------------------------------------------------------------------------

# 345. Sponsored Quota Acceptance Tests

Implementation MUST prove:

1.  sponsored emergency/public-benefit credits are not unlimited;
2.  hourly limit can coexist with daily/weekly/monthly limits;
3.  incident limit cannot bypass platform monthly cap;
4.  user limit cannot bypass provider technical cap;
5.  sponsor funding increases financial envelope only within policy;
6.  large sponsor funding cannot exceed provider safety envelope;
7.  normal SmartAIHub provider reserve cannot be consumed by optional
    sponsored workload;
8.  protected emergency minimum cannot be consumed by normal optional
    workload;
9.  70/85/95/100% thresholds can trigger configured degradation;
10. degradation does not hide that intelligence quality/freshness
    changed;
11. optional research stops before minimum emergency intake;
12. public critical warnings remain when sponsored AI quota is
    exhausted;
13. zero sponsored balance does not prevent minimum emergency report
    acceptance;
14. user-paid fallback is explicit, never automatic;
15. personal wallet is not silently charged after sponsor exhaustion;
16. multiple sponsor pools do not double-fund same usage;
17. restricted sponsor pool cannot pay outside geography/purpose;
18. pool fallback follows configured priority;
19. sponsor identity cannot change triage priority;
20. quota usage is idempotent under worker retry;
21. reservation prevents concurrent overspend;
22. crashed reservation can expire/release;
23. quota correction does not delete audit history;
24. calendar quota uses configured policy timezone;
25. daily reset does not accidentally reset monthly usage;
26. distributed workers cannot each independently spend full remaining
    hard quota;
27. approximate edge counters cannot authorize hard financial overspend;
28. provider 429/circuit state can force lower-cost/degraded path;
29. provider reserve remains visible in operator dashboard;
30. time-to-exhaustion forecast is marked advisory;
31. surge override requires actor/reason/scope/expiry;
32. surge override cannot create permanent unlimited quota;
33. quota dashboard does not expose victim-level private data;
34. funding event does not become usable until verified according to
    economic policy;
35. sponsor top-up can expand quota without redeploying application
    code;
36. Skill fallback can run deterministic minimum when AI budget is
    exhausted;
37. optional media AI cannot starve critical text intake;
38. SMS/voice provider quota can be governed separately from LLM quota;
39. route/research quota can be isolated from emergency intake quota;
40. ordinary Chat/LLM workloads continue under sponsored disaster surge
    according to reserved-capacity policy.

------------------------------------------------------------------------

# 346. Production Gate --- Sponsored Capacity

Before enabling sponsored emergency/public AI at scale, certify:

-   multi-window quota accounting;
-   hierarchical scope evaluation;
-   distributed reservation/settlement;
-   provider capacity reservation;
-   normal-workload isolation;
-   emergency-minimum isolation;
-   degradation ladder;
-   sponsor pool funding/top-up;
-   multi-sponsor fallback;
-   user-paid explicit fallback;
-   abuse controls;
-   quota reset timezone;
-   surge override expiry;
-   provider exhaustion forecasting;
-   admin/sponsor dashboard;
-   retry/idempotency/reconciliation.

Mandatory load scenario:

``` text
regional disaster surge
+ 50x normal emergency/public requests
+ sponsor pool at 85%
+ one LLM provider at 90% quota
+ SMS provider rate limiting
+ normal SmartAIHub Chat traffic
+ duplicate queue deliveries
+ new sponsor top-up during incident
```

The system MUST: - keep minimum emergency path operational; - preserve
configured normal-workload capacity; - degrade optional sponsored AI; -
avoid duplicate quota/credit settlement; - apply verified sponsor top-up
dynamically; - never exceed hard provider/platform safety limits.

**End of Spec 260 R1.18 --- Sponsored Capacity, Quota Governance &
Provider Protection**

# 347. Review Passes 191--200 --- Distributed Quota Safety, Fairness and Recovery

Passes 191--200 extend the cumulative review. All fixes below are
normative R1.19 requirements.

## Pass 191 --- Multi-Region / Distributed Quota Overshoot

**Gap:** Concurrent edge/region requests can each observe remaining
quota and collectively overspend.

**Fix:** - Hard sponsor/provider limits require atomic or leased
reservation semantics at an appropriate coordination boundary. -
Edge-local counters are advisory for early shedding, not final
authority. - Support bounded overshoot policy only where explicitly
configured. - Reservation IDs are globally unique/idempotent. -
Reconciliation MUST detect and correct drift. - If strict coordinator is
unavailable, expensive optional sponsored work fails/degrades closed
rather than assuming unlimited capacity.

## Pass 192 --- Reservation Leak / Dead Worker Recovery

**Gap:** Worker can reserve quota and crash before settlement/release.

**Fix:** - Reservations carry lease/expiry. - Heartbeat/renewal only for
legitimately running jobs. - Expired reservations enter
reclaim/reconcile flow. - Late settlement after reclaim must detect
reservation generation/fence and avoid double consumption. - Operator
can inspect stuck reservations. - P0 minimum capacity must not remain
permanently locked by abandoned work.

## Pass 193 --- Sponsor Funding Reversal / Chargeback

**Gap:** Funding can be reversed after quota was expanded.

**Fix:** - Sponsor funds have financial states: pending, verified,
available, restricted, reversed. - Quota expansion uses only eligible
verified/available funding. - Reversal reduces future available
envelope; it does not rewrite historical usage. - If reversal creates
deficit, freeze optional future sponsored spending according to
policy. - Never claw back emergency assistance from users. - Financial
correction is auditable.

## Pass 194 --- Provider Quota Telemetry Uncertainty

**Gap:** Some providers expose delayed/incomplete quota data.

**Fix:** - `ProviderCapacityEnvelope` includes telemetry
freshness/confidence. - When authoritative remaining quota is unknown,
use conservative configured envelope. - Rate-limit responses
(e.g. provider throttling) feed adaptive capacity estimate. - Do not
present estimated provider capacity as exact. - Critical minimum may use
alternate provider/deterministic path according to policy. - Optional
workload degrades earlier when capacity telemetry is stale.

## Pass 195 --- Fairness Across Tenants / Areas / Incidents

**Gap:** One high-volume tenant or disaster area can consume the entire
shared sponsored pool.

**Fix:** - Support configurable fair-share envelopes by
tenant/area/incident while retaining emergency severity policy. - Unused
share MAY be borrowed through controlled burst pool. - Borrowing is
revocable as other areas become active. - Sponsor geographic
restrictions still apply. - Fairness controls computational sponsorship,
not rescue triage. - Do not permanently penalize an area for earlier
high usage.

## Pass 196 --- Simultaneous Multi-Disaster Allocation

**Gap:** Flood, wildfire and earthquake may occur concurrently.

**Fix:** - Platform sponsorship planner sees all active hazard demand. -
Maintain minimum protected capacity per eligible active disaster/region
when configured. - Optional enrichment yields before protected
minimum. - Cross-disaster reallocation requires policy, not first
request wins. - Operators can view demand/capacity by disaster. - One
disaster cannot silently drain another disaster's restricted sponsor
pool.

## Pass 197 --- Forecast Error / Runaway Burn Protection

**Gap:** Burn-rate forecast can be wrong during sudden surge.

**Fix:** - Forecast never authorizes spending above hard cap. - Add
absolute hard stops plus soft forecast thresholds. - Detect acceleration
in burn rate, not only current percentage. - Trigger early degradation
when projected exhaustion enters configured horizon. - Forecast model
failure falls back to deterministic threshold policy. - No AI model is
sole authority for quota admission.

## Pass 198 --- Mid-Incident Sponsor Policy Change

**Gap:** Sponsor may change eligible geography/capability/end time while
jobs are queued/running.

**Fix:** - Sponsor policy is versioned. - Admission binds to policy
version. - Queued optional jobs revalidate before expensive execution. -
Already legitimately incurred usage settles under applicable
authorization semantics. - Policy narrowing does not retroactively erase
audit history. - Policy expansion can admit future work without
redeploy. - Critical emergency minimum remains governed by platform
emergency policy.

## Pass 199 --- Recovery After Quota / Provider Restoration

**Gap:** When capacity returns, releasing all deferred work at once
creates a second surge.

**Fix:** - Recovery is rate-limited and priority-aware. - Revalidate
deferred work for freshness/materiality before replay. - Obsolete jobs
are skipped/coalesced. - Do not replay old AI summaries/news research
solely because capacity returned. - Gradually restore model/provider
tier. - Notify users only if recovered result is still
useful/actionable. - Monitor recovery backlog age and provider health.

## Pass 200 --- Quota Decision Audit / Explainability

**Gap:** Operators need to answer why a request was sponsored, degraded,
deferred or required user payment.

**Fix:** - Every material admission decision records stable reason
codes. - Record applicable quota scopes, limiting scope, policy
versions, sponsor pool, provider envelope state and degradation tier. -
Avoid storing unnecessary sensitive incident details in quota logs. -
User-facing message is simpler than internal audit. - Operator override
is linked to decision record. - Audit does not become a duplicate
economic ledger.

------------------------------------------------------------------------

# 348. Quota Reservation Contract

``` text
QuotaReservation {
  reservation_id
  request_id
  policy_version
  scope_keys[]
  sponsor_pool?
  provider_envelope?
  units_reserved
  created_at
  lease_expires_at
  generation/fence
  state:
    RESERVED |
    SETTLING |
    SETTLED |
    RELEASED |
    EXPIRED |
    RECLAIMED
}
```

Rules: - one logical request cannot settle the same reservation twice; -
reclaimed reservation cannot be silently reused by stale worker; -
settlement links to actual usage/economic record.

------------------------------------------------------------------------

# 349. Provider Capacity Telemetry

``` text
ProviderCapacityTelemetry {
  provider
  resource
  observed_remaining?
  observed_limit?
  observed_reset_at?
  estimated_safe_remaining?
  telemetry_source
  observed_at
  freshness
  confidence
  recent_429_rate?
  recent_5xx_rate?
  circuit_state
}
```

Admission uses the safer applicable envelope when telemetry is
uncertain.

------------------------------------------------------------------------

# 350. Fair Share Envelope

``` text
FairShareEnvelope {
  pool_id
  dimension:
    TENANT |
    AREA |
    INCIDENT |
    HAZARD_EVENT
  subject_ref
  protected_minimum?
  normal_share?
  burst_limit?
  borrowed_units?
  reclaim_policy
  effective_until?
}
```

Fair share MUST remain configurable; no hard-coded geographic or tenant
favoritism.

------------------------------------------------------------------------

# 351. Multi-Disaster Capacity Planner

Conceptual:

``` text
Total Sponsored Capacity
  ├─ protected platform emergency minimum
  ├─ protected normal SmartAIHub reserve
  ├─ restricted sponsor pools
  ├─ per-disaster/area protected envelopes
  └─ controlled shared burst pool
```

The planner MUST respect both: - financial eligibility; - technical
provider capacity.

------------------------------------------------------------------------

# 352. Burn Acceleration Guard

Track:

``` text
usage_rate_now
usage_rate_15m
usage_rate_1h
rate_of_change
remaining_budget
estimated_time_to_exhaustion
```

Example policy:

``` text
remaining 40% but burn triples within 10 minutes
→ begin optimization early
```

Hard cap remains authoritative regardless of forecast.

------------------------------------------------------------------------

# 353. Deferred Sponsored Work

Only noncritical work may be deferred.

``` text
DeferredSponsoredJob {
  job_ref
  original_priority
  reason
  admitted_policy_version
  defer_until?
  max_age
  materiality_revision
}
```

Before replay:

``` text
still needed?
still fresh?
same incident/event revision?
still eligible?
provider healthy?
quota available?
```

If no, skip safely.

------------------------------------------------------------------------

# 354. Quota Decision Record

``` text
QuotaDecisionRecord {
  decision_id
  request_id
  decided_at
  admission_state
  purpose
  capability
  applicable_policy_versions[]
  applicable_scope_keys[]
  limiting_scope?
  sponsor_pool?
  provider_envelope_state?
  quota_before?
  reservation_ref?
  degradation_tier?
  reason_codes[]
  override_ref?
}
```

This is an admission/audit record, not the monetary source of truth.

------------------------------------------------------------------------

# 355. Stable Quota Reason Codes

Examples:

``` text
SPONSOR_POOL_AVAILABLE
SPONSOR_POOL_EXHAUSTED
HOURLY_LIMIT_REACHED
DAILY_LIMIT_REACHED
WEEKLY_LIMIT_REACHED
MONTHLY_LIMIT_REACHED
INCIDENT_LIMIT_REACHED
PROVIDER_RESERVE_PROTECTED
PROVIDER_TELEMETRY_STALE
PROVIDER_RATE_LIMITED
NORMAL_WORKLOAD_RESERVE
EMERGENCY_MINIMUM_RESERVED
FAIR_SHARE_LIMIT
BURST_POOL_GRANTED
POLICY_NOT_ELIGIBLE
POLICY_CHANGED
DEGRADED_TO_ECONOMY
DEGRADED_TO_MINIMUM
USER_PAYMENT_OPTION_AVAILABLE
```

------------------------------------------------------------------------

# 356. Operator Controls

Authorized operator may: - pause optional sponsored capability; -
reduce/increase bounded quota; - activate surge envelope; - reallocate
shared burst pool; - quarantine sponsor pool; - disable a failing
provider; - change degradation tier; - inspect reservations; - replay
eligible deferred jobs; - force reconciliation.

Every mutation requires: - actor; - reason; - scope; - timestamp; -
expiry where applicable; - audit.

No control should create unbounded execution authority.

------------------------------------------------------------------------

# 357. User Messaging Under Scarcity

Examples:

### Optional sponsored AI exhausted

``` text
โควต้าสนับสนุนสำหรับการวิเคราะห์เพิ่มเติมของพื้นที่นี้
ถึงขีดจำกัดชั่วคราวแล้ว

ข้อมูลเตือนภัย แผนที่ และข้อมูลสาธารณะสำคัญยังใช้งานได้

[ใช้ข้อมูลพื้นฐาน]
[ใช้เครดิตของฉัน]   (optional non-emergency only)
```

### Provider degraded

``` text
ข้อมูล AI เชิงวิเคราะห์กำลังทำงานในโหมดประหยัด
เนื่องจากผู้ให้บริการมีข้อจำกัดชั่วคราว

ข้อมูลฉุกเฉินหลักยังคงใช้งานได้
```

Do not expose internal provider secrets/contract limits.

------------------------------------------------------------------------

# 358. Sponsor Dashboard --- Multi-Disaster View

Add: - pool allocation by disaster/area; - protected vs burst usage; -
borrowed capacity; - reversal/adjustment state; - funding verification
status; - provider telemetry freshness; - deferred workload; - reclaimed
reservations; - forecast confidence; - policy version/effective period.

Sponsors do not receive private victim-level data by default.

------------------------------------------------------------------------

# 359. Quota Recovery State Machine

``` text
NORMAL
→ PRESSURE
→ DEGRADED
→ HARD_LIMIT
→ RECOVERING
→ NORMAL
```

Recovery requires hysteresis.

Do not switch repeatedly between full/degraded modes around a threshold.

Example: - enter degraded at 85%; - return only when reset/new
funding/provider capacity creates sufficient headroom.

------------------------------------------------------------------------

# 360. R1.19 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  two regions cannot each spend the same final hard quota;
2.  edge advisory counter cannot authorize beyond strict coordinator;
3.  strict coordinator outage degrades optional sponsored work closed;
4.  abandoned reservation expires/reclaims;
5.  stale worker cannot settle reclaimed generation twice;
6.  P0 reserve is released from dead reservation;
7.  pending sponsor funding does not expand quota;
8.  verified sponsor funding can expand eligible quota;
9.  chargeback/reversal does not erase historical usage;
10. reversal can freeze future optional sponsored work;
11. users are not retroactively charged for reversed sponsor funding;
12. stale provider telemetry triggers conservative envelope;
13. provider 429 updates effective capacity policy;
14. estimated provider capacity is not shown as exact fact;
15. one tenant cannot consume another protected fair share;
16. unused fair share can enter controlled burst pool if configured;
17. borrowed burst capacity can be reclaimed prospectively;
18. prior high usage does not permanently penalize an area;
19. simultaneous disasters retain configured protected minima;
20. restricted flood sponsor pool cannot fund unrelated wildfire work;
21. first-request-wins cannot bypass multi-disaster allocation policy;
22. burn forecast cannot exceed hard cap;
23. sudden burn acceleration can trigger early degradation;
24. forecast failure falls back to deterministic thresholds;
25. AI cannot independently authorize quota override;
26. queued optional job revalidates sponsor policy before expensive
    call;
27. narrowed sponsor policy does not erase prior valid settlement;
28. expanded sponsor policy applies without redeploy;
29. provider recovery does not replay all deferred jobs at once;
30. stale deferred summary is skipped;
31. duplicate deferred jobs are coalesced;
32. recovery has hysteresis and avoids tier flapping;
33. quota decision records limiting scope/reason;
34. quota audit does not duplicate monetary ledger authority;
35. operator override requires reason/scope/audit;
36. override expiry restores normal policy;
37. sponsor dashboard does not reveal private victim data;
38. quota logs minimize sensitive details;
39. normal SmartAIHub reserve survives concurrent multi-disaster surge;
40. emergency minimum survives sponsor reversal/provider degradation via
    configured fallback where feasible.

------------------------------------------------------------------------

# 361. R1.19 Production Gate

Promotion requires: - multi-region quota race test; - reservation
fencing/crash recovery; - sponsor reversal simulation; - stale provider
telemetry simulation; - tenant/area fair-share load test; - simultaneous
multi-disaster load test; - burn acceleration test; - mid-incident
sponsor policy version test; - deferred-work recovery test; - quota
decision audit reconstruction; - recovery hysteresis test.

Mandatory chaos scenario:

``` text
two Cloudflare regions
+ three simultaneous disasters
+ one sponsor pool reversal
+ another sponsor top-up
+ provider quota telemetry 15 minutes stale
+ sudden 4x burn acceleration
+ worker crashes after quota reservation
+ normal Chat workload
+ deferred research backlog
+ provider recovers
```

The system MUST: - avoid unbounded overshoot; - reclaim dead
reservations safely; - preserve normal workload reserve; - preserve
emergency minimum where feasible; - isolate sponsor restrictions; -
revalidate stale deferred work; - restore service gradually; - keep
economic and quota authorities non-duplicated.

**End of Spec 260 R1.19 --- 200-Pass Cumulative Review / Distributed
Quota Safety, Fairness & Recovery**

# 362. Review Passes 201--210 --- Governance Hardening, Policy Safety and Disaster Drills

Passes 201--210 extend the cumulative review. All fixes below are
normative R1.20 requirements.

## Pass 201 --- Sponsor Data Ownership / Purpose Limitation

**Gap:** Funding an emergency pool must not implicitly grant sponsors
access to victim/user-level data.

**Fix:** - Sponsorship and data-access authorization are independent. -
Sponsor default visibility is aggregate financial/operational reporting
only. - No exact household location, contact, medical detail, journey
history or private case content merely because sponsor paid. - Any
additional data access requires separate role/purpose/legal
basis/policy. - Sponsor reports use aggregation/de-identification
thresholds where needed. - Sponsor cannot condition computational
sponsorship on unauthorized personal-data disclosure.

## Pass 202 --- Incident Closure / Quota Resource Cleanup

**Gap:** Closed incidents may leave reservations, route watches, sponsor
allocations, realtime subscriptions or active indexes behind.

**Fix:** - Incident/area closure triggers bounded cleanup workflow. -
Reconcile outstanding quota reservations. - Expire incident-specific
temporary indexes/subscriptions. - Stop unnecessary
monitoring/research. - Preserve audit/economic records under retention
policy. - Do not delete unresolved Need/Task evidence merely because
hazard event closed. - Reopen/new episode creates new active
scope/revision without resurrecting stale reservations.

## Pass 203 --- Provider Credential / Account Isolation

**Gap:** Multiple tenants/sponsors/providers may use different
credentials, quotas or billing accounts.

**Fix:** - Provider credentials remain secret-scoped and tenant/platform
policy-bound. - Quota accounting MUST bind usage to the actual provider
account/credential class used. - Do not combine quotas from unrelated
credentials as if one pool. - Credential rotation/revocation updates
capability availability. - No provider secret in queue
payload/log/audit. - Emergency fallback across provider accounts
requires explicit configured authority.

## Pass 204 --- Tamper-Evident Critical Audit

**Gap:** Quota overrides, sponsor changes, emergency admission and
disclosure decisions are sensitive operational records.

**Fix:** - Critical audit events are append-oriented and
integrity-protected. - Maintain sequence/hash/signature or equivalent
tamper-evidence mechanism appropriate to architecture. - Corrections
append superseding events rather than destructive rewrite. - Access to
audit export is permissioned. - Tamper evidence does not imply public
disclosure. - Audit integrity failure triggers operator alert and
preserves minimum service.

## Pass 205 --- Safe Policy Rollout / Rollback

**Gap:** A bad quota/payer/degradation policy can affect the entire
emergency system instantly.

**Fix:** - Policies are versioned and immutable once used for a
decision. - New policy supports draft → validate → simulate → staged
activation → active. - Rollback selects prior known-good policy for
future decisions. - Existing settled decisions remain bound to their
historical version. - Policy activation has scope, actor, time and
audit. - Global policy change SHOULD support canary/staged rollout where
feasible.

## Pass 206 --- Policy Simulation / Shadow Evaluation

**Gap:** Operators need to know effects before changing quota rules
during disaster.

**Fix:** - Provide dry-run/shadow evaluation against sampled/replayed
recent requests. - Compare old vs proposed: - allowed/degraded/denied
counts; - estimated spend; - provider capacity impact; - tenant/area
fairness; - emergency-minimum impact. - Shadow evaluation MUST NOT
charge users, reserve quota or call billable providers. - Simulation
results are advisory and clearly separated from production state.

## Pass 207 --- Regional Data Residency / Cross-Region Quota Coordination

**Gap:** Incident/user data may be residency-restricted while quota
coordination spans regions.

**Fix:** - Quota keys/events SHOULD use minimum necessary identifiers. -
Global quota coordinator must not require replication of private
incident content. - Residency policy controls where sensitive
evidence/contact/medical data is stored/processed. - Aggregate quota
counters may cross region only according to applicable policy. -
Cross-region failover preserves residency constraints. - Sponsor
dashboard must not bypass residency boundaries.

## Pass 208 --- Network Partition / Reconciliation Semantics

**Gap:** Region can temporarily lose access to canonical quota/economic
services.

**Fix:** - Define partition mode by workload class. - Optional sponsored
work degrades/stops when hard authorization cannot be safely
established. - Minimum emergency intake may continue through bounded
fail-safe path if architecture/policy supports it. - Partition-local
records carry unique IDs/fences and reconcile later. - Reconciliation
never double-settles usage. - Conflicts produce explicit reconciliation
records, not silent overwrite. - Recovery does not release a backlog
without freshness checks.

## Pass 209 --- Disaster Drill / Sandbox Mode

**Gap:** Emergency systems cannot wait for a real disaster to test
quota, dispatch and notification behavior.

**Fix:** - Add `DRILL/SIMULATION` environment/mode. - Synthetic
incidents, sponsor pools, provider failures, alerts and quota exhaustion
can be injected. - Drill notifications MUST be visibly marked and
isolated from real public alerts. - Drill usage MUST NOT consume real
user credits/provider spend unless explicitly configured test account. -
Drill data is segregated/tagged. - No drill action can accidentally
dispatch real responders or publish real emergency alerts. -
Production-like load testing uses safe isolated endpoints/accounts.

## Pass 210 --- Scoped Kill Switch / Minimum-Service Preservation

**Gap:** Operators need emergency controls, but a broad kill switch can
accidentally disable life-safety minimum.

**Fix:** - Kill switches are capability/provider/source/sponsor/policy
scoped. - Examples: - disable optional AI synthesis; - stop news
research; - stop sponsor pool; - disable provider/model; - pause media
analysis; - disable public UGC publication. - Separate protected
minimum-service controls. - Disabling all optional intelligence MUST
still preserve configured minimum emergency intake/public critical
information where dependencies permit. - Full shutdown requires distinct
highest-authority procedure and explicit impact confirmation. - Every
kill-switch action has reason/scope/expiry/audit.

------------------------------------------------------------------------

# 363. Sponsor Visibility Policy

``` text
SponsorVisibilityPolicy {
  sponsor_pool_id
  allowed_metrics[]
  aggregation_level
  minimum_group_size?
  geography_precision
  incident_detail_level
  personal_data_access: NONE_BY_DEFAULT
  retention
}
```

Funding does not mutate responder/medical/privacy roles.

------------------------------------------------------------------------

# 364. Incident Resource Cleanup Contract

``` text
IncidentCleanupPlan {
  incident_or_event_ref
  close_revision
  quota_reservations[]
  active_monitors[]
  route_watches[]
  realtime_subscriptions[]
  temporary_indexes[]
  deferred_jobs[]
  retention_actions[]
}
```

Cleanup is idempotent and restart-safe.

------------------------------------------------------------------------

# 365. Provider Account Binding

``` text
ProviderAccountRef {
  provider
  credential_scope_ref
  tenant_scope?
  billing_account_class
  quota_envelope_ref
  residency_region?
}
```

Usage and capacity telemetry MUST identify the correct account reference
without exposing secret material.

------------------------------------------------------------------------

# 366. Critical Audit Integrity

Example chain:

``` text
AuditEvent[n] {
  event_id
  timestamp
  actor
  action
  scope
  payload_hash
  previous_event_hash
  integrity_metadata
}
```

Implementation MAY use another robust mechanism; the requirement is
tamper evidence and append-oriented correction.

------------------------------------------------------------------------

# 367. Policy Lifecycle

``` text
DRAFT
→ VALIDATED
→ SIMULATED
→ STAGED
→ ACTIVE
→ SUPERSEDED
→ RETIRED
```

Emergency rollback:

``` text
ACTIVE_BAD_VERSION
→ select known-good prior version
→ activate for new admissions
→ audit rollback
→ reconcile affected in-flight work by explicit policy
```

Do not rewrite historical decisions to pretend old policy was never
active.

------------------------------------------------------------------------

# 368. Shadow Policy Evaluation

``` text
PolicySimulationResult {
  simulation_id
  proposed_policy_version
  baseline_policy_version
  sample_window
  request_count
  allow_delta
  degrade_delta
  deny_delta
  estimated_cost_delta
  provider_capacity_delta
  fairness_metrics
  emergency_minimum_impact
  generated_at
}
```

No production side effect.

------------------------------------------------------------------------

# 369. Partition Operating Modes

``` text
CONNECTED
DEGRADED_COORDINATION
PARTITIONED
RECONCILING
```

Example behavior:

``` text
P0 minimum intake:
  bounded local durable receipt if certified

P1 operational:
  only if required authorization/state can be safely established

P2/P3 sponsored intelligence:
  degrade/defer/deny optional work

paid user travel:
  do not charge/execute expensive work without safe billing authorization
```

Exact behavior is capability-specific and must be tested.

------------------------------------------------------------------------

# 370. Reconciliation Record

``` text
ReconciliationRecord {
  reconciliation_id
  source_region
  target_authority
  local_event_refs[]
  conflicts[]
  duplicate_refs[]
  quota_adjustments[]
  economic_adjustments[]
  outcome
  reconciled_at
}
```

Reconciliation preserves provenance.

------------------------------------------------------------------------

# 371. Drill Mode Guard

Every simulated object carries:

``` text
environment:
  PRODUCTION |
  STAGING |
  DRILL
```

High-risk outbound connector checks environment before: - public alert
publication; - responder dispatch; - SMS/voice to real recipients; -
sponsor settlement; - user credit charge; - external emergency-system
push.

Production recipients/connectors are deny-by-default from DRILL unless
explicit isolated test destination is configured.

------------------------------------------------------------------------

# 372. Kill Switch Contract

``` text
OperationalKillSwitch {
  switch_id
  target_type:
    CAPABILITY |
    SKILL |
    MODEL |
    PROVIDER |
    SOURCE |
    SPONSOR_POOL |
    AUTO_PUBLICATION |
    RESEARCH |
    MEDIA_AI
  target_ref
  scope
  reason
  actor
  activated_at
  expires_at?
  minimum_service_impact
}
```

UI MUST show whether activating switch affects protected minimum
service.

------------------------------------------------------------------------

# 373. Governance / Security Operator UX

Operator surfaces SHOULD distinguish: - financial quota pressure; -
provider technical pressure; - policy misconfiguration; - credential
failure; - source failure; - privacy/residency restriction; -
audit-integrity issue; - network partition; - drill mode.

Avoid one generic red "system error" state.

------------------------------------------------------------------------

# 374. R1.20 Additional Negative / Acceptance Tests

Implementation MUST prove:

1.  sponsor funding alone grants no victim-level data access;
2.  sponsor aggregate report cannot expose exact household location;
3.  sponsor cannot receive medical details without separate
    authorization;
4.  incident closure reclaims stale quota reservations;
5.  incident closure stops obsolete route watches/research;
6.  cleanup retry is idempotent;
7.  incident reopen does not reuse stale reservation generation;
8.  provider usage binds to actual credential/account quota;
9.  unrelated tenant provider quotas are not merged;
10. provider secret never appears in queue/audit payload;
11. credential revocation changes capability availability;
12. critical audit correction is append/supersede, not destructive edit;
13. broken audit integrity triggers alert without disabling minimum
    intake;
14. policy used for settled decision remains historically identifiable;
15. draft policy cannot become active without required validation path;
16. rollback affects future decisions without rewriting history;
17. shadow simulation makes zero billable provider calls;
18. simulation reserves zero production quota;
19. simulation cannot charge user/sponsor;
20. simulation reports emergency-minimum impact;
21. global quota coordination does not require copying medical/contact
    content;
22. cross-region failover respects residency policy;
23. sponsor dashboard cannot bypass residency restriction;
24. partitioned optional sponsored work does not assume unlimited quota;
25. certified local minimum intake can reconcile without duplicate
    incident/economic event;
26. partition reconciliation does not double-settle;
27. conflicting partition events create explicit reconciliation record;
28. recovery revalidates backlog freshness;
29. DRILL alert is visibly marked as drill;
30. DRILL cannot publish real public emergency alert by default;
31. DRILL cannot dispatch real responder by default;
32. DRILL cannot charge real user credits by default;
33. DRILL cannot consume real sponsor pool by default;
34. production load test requires isolated safe accounts/connectors;
35. optional AI kill switch does not disable minimum emergency intake;
36. sponsor-pool kill switch does not erase prior settlements;
37. public UGC publication can be paused independently of emergency
    intake;
38. full shutdown requires distinct authority/confirmation;
39. kill switch records reason/scope/actor/expiry;
40. operator UI distinguishes quota pressure from provider credential
    failure.

------------------------------------------------------------------------

# 375. R1.20 Production Gate

Promotion requires: - sponsor visibility/privacy test; - incident
cleanup/reopen test; - provider-account isolation test; -
audit-integrity verification; - policy staged rollout/rollback drill; -
zero-side-effect shadow simulation; - residency/cross-region test; -
network partition/reconciliation chaos test; - DRILL connector isolation
certification; - kill-switch/minimum-service test.

Mandatory governance scenario:

``` text
active regional flood
+ two sponsors
+ one sponsor restricted to one province
+ one provider credential rotated
+ quota policy update proposed
+ shadow simulation
+ staged rollout
+ network partition
+ incident closes/reopens
+ optional AI malfunction
+ operator kill switch
```

The system MUST preserve: - sponsor/data separation; - correct
provider-account quota; - historical policy auditability; - residency; -
minimum emergency service; - idempotent cleanup/reconciliation; - zero
accidental drill/production crossover.

**End of Spec 260 R1.20 --- 210-Pass Cumulative Review / Governance
Hardening, Policy Safety, Residency & Disaster Drills**

# 376. Public Disaster Sponsorship & Funding

SmartAIHub SHOULD expose a public sponsorship surface that allows
individuals, companies, NGOs and other eligible supporters to fund
disaster/public-benefit compute and communication capacity.

This MUST reuse the existing SmartAIHub payment/economic infrastructure.

It MUST NOT create a parallel payment authority.

Core flow:

``` text
Existing Payment Method
→ Payment Verification
→ Funding Intent
→ Disaster Sponsor Pool
→ Sponsor Funding Ledger
→ Sponsored Quota Planner
→ Effective Sponsored Capacity
```

The destination differs from ordinary credit top-up:

``` text
PERSONAL TOP-UP:
Payment → User Wallet / Personal Credits

DISASTER SUPPORT:
Payment → Disaster Sponsor Pool
```

A disaster support payment MUST NOT accidentally credit the payer's
personal wallet.

------------------------------------------------------------------------

# 377. Public Sponsorship Website

Public website SHOULD provide a dedicated surface such as:

``` text
ช่วยสนับสนุนระบบข้อมูลภัยพิบัติ

เงินสนับสนุนถูกใช้สำหรับ:
• AI situation summaries
• emergency communication
• map/routing intelligence
• translation
• public situation information
• other policy-approved emergency capabilities

[สนับสนุนเหตุการณ์นี้]
[ดูกองทุนทั้งหมด]
```

The page SHOULD show: - active eligible disaster pools; -
disaster/area/purpose; - funding target if configured; - verified amount
received; - amount allocated/used; - remaining available balance; -
sponsored usage/capacity indicators; - last updated time; - sponsor list
according to privacy preferences; - material policy/eligibility
information.

Do not expose victim-level data.

------------------------------------------------------------------------

# 378. Disaster Sponsor Pool Public Projection

The internal `SponsorPool` MUST have a separate safe public projection.

``` text
PublicSponsorPool {
  pool_id
  public_name
  disaster/event
  eligible_geography
  purpose_summary
  funding_target?
  verified_funding_total
  available_balance?
  used_amount?
  supporter_count?
  public_supporters[]
  status
  start_at
  end_at?
  last_updated_at
}
```

Public projection MUST NOT expose: - payment identifiers; - internal
user ID; - email/phone; - billing address; - provider account; - private
organization metadata; - fraud/risk signals; - private sponsor
restrictions.

------------------------------------------------------------------------

# 379. Support Funding Intent

Before payment, create:

``` text
SponsorFundingIntent {
  funding_intent_id
  payer_user_id?
  pool_id
  amount
  currency
  payment_method
  display_preference:
    PUBLIC_NAME |
    PUBLIC_ALIAS |
    ANONYMOUS
  requested_display_name?
  show_amount:
    YES |
    NO
  message?
  consent_version
  created_at
  expires_at
}
```

The payment system uses this intent to route verified funds to the
correct pool.

------------------------------------------------------------------------

# 380. Donor Identity vs Public Identity

Payment identity and public sponsor identity MUST be separate.

Example:

``` text
PAYMENT RECORD:
legal/payment identity
transaction reference
fraud/verification information

PUBLIC RECORD:
"บริษัท ABC"
or
"คุณสมชาย"
or
"ผู้สนับสนุนไม่ประสงค์ออกนาม"
```

Selecting `ANONYMOUS` means anonymous to the public, NOT anonymous to
payment, fraud, accounting or legally required records.

------------------------------------------------------------------------

# 381. Public Name Consent

Before payment/support confirmation, user SHOULD be able to choose:

``` text
การแสดงชื่อผู้สนับสนุน

○ แสดงชื่อของฉัน
○ แสดงชื่อที่กำหนดเอง
● ไม่ประสงค์ออกนาม
```

Optional:

``` text
☑ แสดงยอดที่สนับสนุน
☐ แสดงข้อความสนับสนุน
```

Consent to public display MUST be separate from payment consent.

No preselected public-name disclosure.

------------------------------------------------------------------------

# 382. Post-Payment Privacy Change

Where product/legal policy permits, supporter SHOULD be able to change:

``` text
PUBLIC_NAME → ANONYMOUS
PUBLIC_ALIAS → ANONYMOUS
SHOW_AMOUNT → HIDE_AMOUNT
```

Historical accounting remains unchanged.

Changing public visibility MUST NOT alter: - payment record; - sponsor
pool balance; - quota already funded; - accounting/audit history.

If public attribution has already been externally cached/exported, UI
should describe practical limitations rather than promise impossible
erasure.

------------------------------------------------------------------------

# 383. Payment Reuse

The funding flow SHOULD reuse existing SmartAIHub: - payment
providers; - PromptPay/payment verification; - transaction status; -
fraud controls; - reconciliation; - receipts; - refunds/reversals where
applicable; - accounting/economic audit.

Introduce a destination/purpose dimension:

``` text
PaymentPurpose {
  PERSONAL_CREDIT_TOPUP
  DISASTER_SPONSOR_POOL
  ORGANIZATION_CREDIT
  OTHER_SUPPORTED_PURPOSE
}
```

Payment purpose is immutable after settlement except through explicit
correction workflow.

------------------------------------------------------------------------

# 384. Payment → Pool Settlement

``` text
FundingIntent
→ payment initiated
→ PENDING
→ payment verified
→ SETTLED
→ SponsorFundingLedger event
→ SponsorPool.available_amount increases
→ quota planner recalculates effective sponsored capacity
```

Never increase spendable sponsor quota from: - screenshot alone; -
client-side success; - unverified webhook; - pending transfer; - expired
intent.

Use canonical payment verification.

------------------------------------------------------------------------

# 385. Sponsor Funding Ledger

``` text
SponsorFundingLedgerEntry {
  entry_id
  pool_id
  funding_intent_id
  payment_transaction_ref
  payer_ref?
  gross_amount
  fees?
  net_amount
  currency
  state:
    PENDING |
    VERIFIED |
    SETTLED |
    REVERSED |
    REFUNDED |
    DISPUTED
  public_identity_ref?
  created_at
  settled_at?
}
```

This ledger links to the existing economic/payment source of truth
rather than replacing it.

------------------------------------------------------------------------

# 386. Public Sponsor Entry

``` text
PublicSponsorEntry {
  public_sponsor_id
  pool_id
  display_type:
    NAME |
    ALIAS |
    ANONYMOUS
  display_name?
  show_amount
  public_amount?
  public_message?
  funded_at
}
```

Moderate public aliases/messages before publication where necessary.

Do not publish payment/legal identity directly.

------------------------------------------------------------------------

# 387. Public Transparency Summary

Example:

``` text
กองทุนสนับสนุนระบบข้อมูลอุทกภัย — เชียงใหม่

ได้รับการสนับสนุนที่ยืนยันแล้ว     ฿428,500
ใช้สนับสนุนระบบแล้ว              ฿171,240
คงเหลือสำหรับการสนับสนุน          ฿257,260
ผู้สนับสนุน                         386 ราย

อัปเดตล่าสุด: 10:42
```

If values are delayed/reconciled, label them accordingly.

Do not imply every monetary unit maps one-to-one to provider credit
unless that is actually true.

------------------------------------------------------------------------

# 388. Public Supporter List

Example:

``` text
ผู้สนับสนุนล่าสุด

บริษัท Example Co.       ฿10,000
คุณ A                     ไม่แสดงยอด
ผู้สนับสนุนไม่ประสงค์ออกนาม  ฿500
Community Group           ฿2,000
```

Sort/filter MAY include: - latest; - organization; - amount bands; -
campaign/pool.

Avoid gamification that undermines emergency fairness.

Donation size MUST NOT affect emergency triage, service priority or
victim access.

------------------------------------------------------------------------

# 389. Sponsor Message Moderation

Optional public supporter messages are UGC.

Requirements: - moderation; - abuse/spam controls; - no political
targeting/profiling in operational emergency surfaces; - no victim
personal data; - no malicious URLs; - removable from public projection
without altering funding ledger.

Funding cannot purchase unrestricted public messaging.

------------------------------------------------------------------------

# 390. Pool Selection

Supporter MAY choose:

``` text
เหตุการณ์เฉพาะ
พื้นที่เฉพาะ
ประเภทภัยพิบัติ
กองทุนฉุกเฉินกลาง
```

Subject to configured pool policy.

If a pool closes before payment settles: - do not silently redirect
funds; - follow pre-disclosed fallback/refund policy; - obtain consent
where a materially different destination is required.

------------------------------------------------------------------------

# 391. Default General Emergency Pool

A platform-level general pool MAY exist:

``` text
SmartAIHub Emergency Support Pool
```

It can fund eligible emergencies according to published policy.

The allocation policy SHOULD be publicly summarized.

Internal detailed anti-abuse/security rules need not be public.

------------------------------------------------------------------------

# 392. Funding Target and Overflow

Pools MAY define:

``` text
target_amount
soft_cap
hard_cap
overflow_policy
```

Possible overflow: - stop accepting new support; - ask supporter to
choose another pool; - transfer to general emergency pool only with
clear pre-disclosed consent/policy; - hold for same disaster recovery
period where allowed.

Never silently move restricted funding to unrelated purpose.

------------------------------------------------------------------------

# 393. Funding and Effective Quota

Public funding increases financial capacity, but actual quota remains:

``` text
Effective Sponsored Capacity =
min(
  verified available funding,
  sponsor/pool policy cap,
  provider technical capacity,
  platform safety envelope
)
```

Public website SHOULD avoid misleading statements such as:
`บริจาคเพิ่มแล้ว AI จะทำงานได้ไม่จำกัด`.

Instead:

``` text
เงินสนับสนุนช่วยเพิ่มขีดความสามารถที่ระบบสามารถสนับสนุนได้
ภายใต้ข้อจำกัดของผู้ให้บริการและนโยบายความปลอดภัยของระบบ
```

------------------------------------------------------------------------

# 394. Support Receipt

After settlement, supporter receives a normal transaction
receipt/confirmation according to existing payment infrastructure.

Additionally show:

``` text
ขอบคุณสำหรับการสนับสนุน

กองทุน:
ระบบข้อมูลอุทกภัยเชียงใหม่

จำนวน:
฿1,000

การแสดงชื่อ:
ไม่ประสงค์ออกนาม

[ดูสถานะกองทุน]
[แก้ไขการแสดงชื่อ]
```

Do not characterize payment as legally tax-deductible donation unless
the receiving entity and jurisdiction actually support that status.

Use neutral terminology such as `สนับสนุน` by default.

------------------------------------------------------------------------

# 395. Authentication Policy for Support

System MAY support: - logged-in supporter; - guest support if existing
payment/compliance infrastructure safely supports it.

Login SHOULD be required for features such as: - persistent receipt
history; - later public-name preference management; - sponsor
dashboard; - organization sponsorship administration.

Do not require login solely to view public sponsor transparency.

------------------------------------------------------------------------

# 396. Organization Sponsorship

Organizations MAY have:

``` text
OrganizationSponsorProfile {
  organization_id
  verified_public_name
  logo?
  website?
  public_description?
  authorized_admins[]
}
```

Public organization profile publication requires
authorization/moderation.

Funding size does not grant operational authority.

------------------------------------------------------------------------

# 397. Sponsor Recognition Without Pay-to-Priority

Permitted recognition: - public supporter list; - sponsor logo
section; - aggregate contribution; - campaign supporter page; -
thank-you page.

Not permitted: - higher rescue priority; - access to victim private
data; - control over triage; - ability to suppress unfavorable public
safety information; - unrestricted operational command.

------------------------------------------------------------------------

# 398. Public Transparency API / Cache

Public sponsor totals may be served through cached public projections.

Requirements: - no direct public query against sensitive payment
tables; - safe projection; - cache invalidation after verified
settlement/reversal; - label update timestamp; - tolerate reconciliation
delay; - high-traffic public page must not overload payment database.

------------------------------------------------------------------------

# 399. Reversal / Refund Public Projection

If funding is reversed/refunded: - canonical pool balance adjusts; -
public aggregate adjusts on next projection; - public supporter entry
updates/removes amount as policy requires; - historical financial audit
remains; - do not publicly label individual supporter as fraudulent
merely because transaction reversed.

------------------------------------------------------------------------

# 400. Public Sponsorship Security

Controls: - CSRF/payment-intent protection; - idempotent settlement; -
signed/verified payment callbacks; - replay protection; -
amount/currency validation; - pool destination validation; - public
alias/message sanitization; - rate limiting; - bot/fraud controls; - no
client authority to increment pool balance.

------------------------------------------------------------------------

# 401. Public Sponsorship Analytics

Track: - pool page views; - funding intents; - payment completion; -
verified funding; - anonymous vs public-name preference; - average
support amount; - sponsor pool utilization; - supporter return rate
where lawful; - privacy preference changes.

Do not build sensitive donor profiling for emergency service allocation.

------------------------------------------------------------------------

# 402. Suggested Public Website Structure

``` text
/disaster
  current situations
  public alerts
  public map
  support

/disaster/support
  active sponsor pools
  general emergency pool
  transparency summary

/disaster/support/{pool}
  purpose
  affected area
  funding status
  system usage
  supporter list
  support CTA

/disaster/support/{pool}/fund
  amount
  payment method
  public-name preference
  confirmation

/account/support
  user's support history
  receipts
  public-display preferences
```

Exact routes may follow existing SmartAIHub routing conventions.

------------------------------------------------------------------------

# 403. Public Support CTA Discovery

Relevant public emergency pages MAY show:

``` text
ช่วยสนับสนุนให้ข้อมูลและระบบช่วยเหลือยังทำงานต่อได้

เงินสนับสนุนจะเข้าสู่กองทุนระบบสำหรับเหตุการณ์นี้
ไม่ใช่เครดิตส่วนตัวของคุณ

[สนับสนุนระบบ]
[ดูความโปร่งใส]
```

This CTA must not obstruct safety information.

Do not pressure affected victims to fund the system.

------------------------------------------------------------------------

# 404. Sponsorship Acceptance Tests

Implementation MUST prove:

1.  disaster support payment does not enter personal wallet;
2.  personal credit top-up does not enter sponsor pool;
3.  payment purpose cannot be switched client-side after settlement;
4.  pending payment does not expand quota;
5.  verified settlement increases correct pool;
6.  duplicate callback does not double-fund pool;
7.  reversed payment reduces future available pool correctly;
8.  anonymous preference hides public identity;
9.  anonymous public display still preserves lawful internal payment
    record;
10. public-name display requires explicit preference;
11. public-name option is not preselected by default;
12. show-amount preference is respected;
13. changing public display does not alter financial ledger;
14. public sponsor page exposes no payment transaction identifier;
15. public sponsor page exposes no phone/email/billing address;
16. sponsor funding grants no victim-level access;
17. sponsor size does not affect emergency triage;
18. public aggregate uses verified funding only;
19. public aggregate reflects reversals through projection;
20. delayed aggregate shows update timestamp;
21. supporter message can be moderated independently of funding;
22. removing public message does not reverse contribution;
23. malicious alias/message is sanitized;
24. closed pool does not silently redirect pending payment;
25. restricted funding cannot be moved to unrelated disaster without
    valid policy/consent;
26. general pool allocation follows published policy;
27. overflow handling follows disclosed rule;
28. funding target is not represented as provider unlimited capacity;
29. provider technical cap still limits effective quota;
30. public sponsor page works without login;
31. login can enable persistent supporter history/preferences;
32. guest support is allowed only if existing payment/compliance path
    supports it;
33. organization logo/name requires authorized publication;
34. organization sponsorship grants no operational command;
35. public projection reads from safe projection/cache rather than
    sensitive payment table;
36. payment callback cannot directly publish arbitrary public
    name/message;
37. refund/reversal does not publicly accuse supporter of fraud;
38. supporter receipt identifies destination pool;
39. support confirmation clearly states whether name/amount is public;
40. emergency/safety information remains usable without contributing
    money.

------------------------------------------------------------------------

# 405. Production Gate --- Public Sponsorship

Before enabling public funding:

-   payment-purpose routing test;
-   personal-wallet vs sponsor-pool isolation;
-   payment verification/idempotency;
-   sponsor ledger reconciliation;
-   public/private identity separation;
-   anonymous/public-name preference test;
-   public aggregate privacy review;
-   refund/reversal test;
-   pool close/overflow test;
-   sponsor message moderation;
-   provider-capacity/quota recalculation test;
-   public cache/load test;
-   organization sponsorship authorization;
-   receipt/history test.

Mandatory scenario:

``` text
anonymous visitor
→ views public flood page
→ opens support pool
→ chooses ฿500
→ selects "ไม่ประสงค์ออกนาม"
→ pays using existing SmartAIHub payment infrastructure
→ payment becomes VERIFIED/SETTLED
→ ฿500 enters disaster sponsor pool, not personal wallet
→ public total updates
→ supporter list shows anonymous according to preference
→ quota planner recalculates effective sponsored capacity
→ provider safety cap remains enforced
```

Second scenario:

``` text
logged-in supporter
→ supports ฿2,000
→ initially publishes name
→ later changes preference to anonymous
→ public projection removes name
→ financial/audit record remains intact
→ funded quota/balance is unchanged
```

**End of Spec 260 R1.21 --- Public Sponsorship, Disaster Pool Funding &
Donor Transparency**

# 406. Review Passes 211--220 --- Sponsorship Accounting, Allocation Integrity and Public Proof

Passes 211--220 extend the cumulative review. All fixes below are
normative R1.22 requirements.

## Pass 211 --- Gross / Fee / Net Funding Semantics

**Gap:** Public page may say "received ฿1,000" while payment processor
fees mean less is actually spendable.

**Fix:** - Track `gross_amount`, `payment_fee`, `net_settled_amount`,
and `spendable_amount` distinctly where applicable. - Public disclosure
MUST define whether "ยอดสนับสนุน" means gross contributed or net
available. - Sponsor pool quota expansion uses the policy-defined
spendable amount, not an ambiguous display total. - Never hide
platform/payment fees if they materially affect available sponsorship. -
Fee treatment is configurable by payment method/campaign and auditable.

## Pass 212 --- Multi-Currency / FX Integrity

**Gap:** International supporters may contribute in different
currencies.

**Fix:** - Preserve original amount/currency. - Record settlement/base
currency and FX rate/source/time when conversion occurs. - Do not
recompute historical contribution using today's FX rate. - Pool quota
uses settled spendable value in its configured accounting currency. -
Public display may show original contribution and/or normalized pool
value with clear labels. - FX fees/spread follow payment
provider/accounting records.

## Pass 213 --- Earmarked Allocation Integrity

**Gap:** A supporter may choose a specific disaster/area/purpose.

**Fix:** - Funding restriction becomes immutable allocation metadata
after settlement except explicit correction/refund/re-consent
workflow. - Restricted funding cannot be consumed by ineligible
capability/geography. - General pool money can follow published
allocation policy. - Allocation checks occur before sponsored usage
reservation. - Quota planner cannot treat all pool balances as fungible.

## Pass 214 --- Campaign Close / Residual Funds

**Gap:** Disaster campaign can end with unused money.

**Fix:** - Pool defines residual-funds policy before accepting
support. - Possible policies: - same disaster recovery; - same hazard
class; - general emergency pool with explicit disclosed consent; -
refund where operationally/legal/accounting feasible; - hold until
defined expiry/decision. - No silent diversion. - Closing a campaign
stops new funding intents according to policy but preserves
reconciliation/refund operations. - Public page shows
CLOSED/RECOVERY/ALLOCATING/ARCHIVED state.

## Pass 215 --- Refund Eligibility / Already-Consumed Funds

**Gap:** A supporter may request refund after sponsored capacity was
already consumed.

**Fix:** - Refund policy distinguishes unallocated/unspent vs
already-settled/consumed funds. - Do not promise unconditional refund if
funds have already funded eligible provider usage. - Payment
reversal/chargeback remains separate from voluntary refund. - Refund
never rewrites historical usage. - Public terms summarize refund/closure
policy before payment. - Accounting/legal review hooks remain
jurisdiction-specific.

## Pass 216 --- Receipt / Acknowledgement Correctness

**Gap:** Support receipt can be mistaken for tax-deductible donation
certificate or personal-credit receipt.

**Fix:** - Receipt identifies `DISASTER_SPONSOR_POOL` purpose. - Shows
destination pool, gross amount, currency, status, public-name
preference. - If fees/net are relevant to supporter disclosure, show
according to policy. - Do not claim charitable/tax-deductible status
unless verified for receiving entity/jurisdiction. - Receipt and public
recognition are separate artifacts. - Anonymous public display does not
make accounting receipt anonymous to payer.

## Pass 217 --- Public Aggregation / Small-Group Privacy

**Gap:** Tiny sponsor counts or precise timing can re-identify anonymous
supporters.

**Fix:** - Public aggregate can use minimum group thresholds/bucketing
where needed. - Exact "1 anonymous supporter at 10:03 for ฿37,421" may
be generalized if privacy risk is material. - Public supporter list
honors visibility preference independently from aggregate totals. -
Organization/public sponsors may opt into explicit attribution. -
Internal accounting remains exact.

## Pass 218 --- Public Total Reconciliation / Proof of Use

**Gap:** Public totals can drift from canonical ledger or fail to show
how support was used.

**Fix:** - Build public transparency projection from canonical settled
funding + eligible usage allocation. - Show last reconciliation time. -
Expose high-level use categories, e.g. AI inference, messaging,
routing/search, media processing, infrastructure, according to
accounting policy. - Never fabricate one-to-one mapping when shared
infrastructure cost allocation is estimated. - Estimated allocations
must be labeled. - Reconciliation differences enter explicit state, not
silently hidden.

## Pass 219 --- Matching Funds / Conditional Sponsorship

**Gap:** Company may offer "match public contributions up to ฿100,000".

**Fix:** - Add `MatchingProgram`. - Match only verified eligible
contributions. - Define match ratio, cap, time window, eligible
pool/payer types, exclusions. - Idempotent match generation. - Public
page distinguishes supporter funds from matching funds. - Matching
sponsor gains no triage/data authority. - Match program can pause when
cap reached or funding not verified.

## Pass 220 --- Fraud / Chargeback Reserve and Spendability

**Gap:** Immediately spending every newly settled payment can expose
platform to later disputes/chargebacks.

**Fix:** - Pool MAY maintain configurable financial reserve/holdback by
payment risk class. - `settled` and `immediately spendable` can
differ. - High-risk/reversible payment may enter delayed spendability
according to existing payment risk policy. - Do not publicly accuse
individual supporter. - Emergency platform may choose to front capacity
from its own authorized reserve, recorded as separate payer/advance. -
Sponsor quota planner uses `spendable_amount`, not merely displayed
gross total.

------------------------------------------------------------------------

# 407. Sponsorship Accounting Model

``` text
SponsorFundingAccounting {
  funding_entry_id
  original_amount
  original_currency
  gross_settled_amount
  settlement_currency
  payment_fee?
  fx_fee?
  fx_rate?
  fx_rate_source?
  fx_timestamp?
  net_settled_amount
  reserve_holdback?
  spendable_amount
  restricted_amount?
  allocated_amount
  consumed_amount
  refundable_amount?
  accounting_state
}
```

Canonical monetary values come from the existing SmartAIHub
payment/economic authority.

------------------------------------------------------------------------

# 408. Funding Restriction

``` text
FundingRestriction {
  restriction_id
  funding_entry_id
  pool_id
  allowed_hazard_events[]
  allowed_geographies[]
  allowed_purposes[]
  allowed_capabilities[]
  valid_from
  valid_until?
  residual_policy
  version
}
```

Usage reservation MUST satisfy restriction before sponsor funds are
selected.

------------------------------------------------------------------------

# 409. Pool Lifecycle

``` text
DRAFT
OPEN
PAUSED
CLOSED
RECOVERY
ALLOCATING_RESIDUAL
ARCHIVED
```

Behavior: - `OPEN`: accepts eligible funding. - `PAUSED`: no new
funding, existing accounting continues. - `CLOSED`: incident/campaign
funding closed. - `RECOVERY`: remaining funds may support disclosed
recovery scope. - `ALLOCATING_RESIDUAL`: residual policy being
executed. - `ARCHIVED`: read-only transparency/history.

------------------------------------------------------------------------

# 410. Residual Funds Decision Record

``` text
ResidualFundsDecision {
  pool_id
  balance_at_close
  policy_version
  destination_policy
  consent_basis?
  amount_moved?
  amount_refunded?
  decision_at
  actor/system_policy
  audit_ref
}
```

No residual movement without recorded policy basis.

------------------------------------------------------------------------

# 411. Matching Program

``` text
MatchingProgram {
  matching_program_id
  sponsor_ref
  pool_id
  match_ratio
  maximum_match_amount
  matched_so_far
  eligible_funding_types[]
  eligible_from
  eligible_until
  status
  public_name_policy
}
```

Match event:

``` text
verified supporter funding
→ eligibility check
→ idempotent matching event
→ matching sponsor funding allocation
→ pool accounting
→ quota recalculation
```

------------------------------------------------------------------------

# 412. Public Use-of-Funds Projection

Example:

``` text
เงินสนับสนุนที่ยืนยันแล้ว        ฿500,000
เงินที่พร้อมใช้สนับสนุนระบบ      ฿462,000
ใช้สนับสนุนระบบแล้ว             ฿188,400
คงเหลือพร้อมใช้                 ฿273,600

การใช้งานโดยประมาณ:
AI / การสรุปสถานการณ์            ฿62,300
SMS / การสื่อสารฉุกเฉิน          ฿51,800
Routing / Search                 ฿31,200
Media processing                ฿18,600
Infrastructure / Other          ฿24,500

อัปเดตจากบัญชีล่าสุด: 10:45
```

If cost allocation is estimated, label it:

``` text
"การแบ่งตามหมวดเป็นค่าประมาณจาก usage allocation"
```

Do not claim audited financial-statement status unless actually audited.

------------------------------------------------------------------------

# 413. Public Funding Status Semantics

``` text
PENDING_PAYMENT
VERIFIED
SETTLED
HELD
SPENDABLE
ALLOCATED
PARTIALLY_CONSUMED
CONSUMED
REFUNDED
REVERSED
DISPUTED
```

Public UI SHOULD simplify these without misrepresenting spendability.

Example: - `ได้รับการยืนยันแล้ว` - `พร้อมใช้สนับสนุนระบบ` - `ใช้สนับสนุนระบบแล้ว`

------------------------------------------------------------------------

# 414. Matching Funds UX

Example:

``` text
บริษัท Example สนับสนุน Matching Fund

ทุก ฿1 ที่ผู้ใช้สนับสนุน
บริษัทจะสมทบอีก ฿1
สูงสุดรวม ฿100,000

ยอดประชาชนที่เข้าเกณฑ์      ฿42,000
ยอดสมทบจากบริษัท            ฿42,000
วงเงินสมทบคงเหลือ           ฿58,000
```

Only verified eligible supporter funding counts toward match.

------------------------------------------------------------------------

# 415. Supporter Privacy Projection

For anonymous supporters, public system MAY display:

``` text
ผู้สนับสนุนไม่ประสงค์ออกนาม
```

For privacy-sensitive aggregates: - round/bucket time; - hide exact
amount if supporter requested; - delay publication where needed; -
combine anonymous entries into aggregate.

This does not change exact internal ledger.

------------------------------------------------------------------------

# 416. Funding Fraud / Risk Boundary

Public sponsorship flow reuses existing payment fraud/risk controls.

Emergency intelligence MUST NOT make fraud decisions.

Fraud/risk subsystem can return:

``` text
AVAILABLE
HOLD
REVIEW
REVERSED
```

Quota planner consumes spendability result only.

Do not expose fraud score/reason publicly.

------------------------------------------------------------------------

# 417. Platform Advance

When immediate emergency capacity is necessary before sponsor funds
become spendable:

``` text
PlatformAdvance {
  advance_id
  pool_id
  amount
  currency
  authorization
  reason
  created_at
  repayment_policy?
}
```

This is platform-funded capacity, not fabricated sponsor balance.

Public disclosure SHOULD distinguish platform advance from verified
supporter funding if material.

------------------------------------------------------------------------

# 418. Reconciliation States

``` text
RECONCILED
PENDING_RECONCILIATION
DIFFERENCE_DETECTED
UNDER_REVIEW
CORRECTED
```

Public page may show:

``` text
ยอดกำลังอยู่ระหว่างการกระทบยอด
อัปเดตล่าสุด ...
```

Never silently display stale total as real-time exact.

------------------------------------------------------------------------

# 419. Sponsor Accounting Acceptance Tests

Implementation MUST prove:

1.  gross contribution is not confused with spendable amount;
2.  payment fee treatment follows configured accounting policy;
3.  quota planner uses spendable amount;
4.  original currency is preserved;
5.  historical FX conversion is not recalculated using current rate;
6.  FX source/time is recorded when conversion applies;
7.  restricted geography funding cannot pay another geography;
8.  restricted capability funding cannot pay ineligible Skill;
9.  general pool remains governed by allocation policy;
10. campaign close stops new funding according to policy;
11. campaign close does not break refunds/reconciliation;
12. residual funds cannot silently move to unrelated pool;
13. residual decision is auditable;
14. already-consumed eligible funds are not promised as automatically
    refundable;
15. voluntary refund and chargeback are distinct;
16. refund does not erase historical usage;
17. receipt identifies disaster sponsor pool purpose;
18. support receipt is not mislabeled as personal-credit top-up;
19. receipt does not claim tax deductibility without verified basis;
20. public recognition is separate from accounting receipt;
21. anonymous supporter can receive private receipt;
22. small-group privacy policy can suppress identifying aggregate
    detail;
23. aggregate privacy does not alter canonical accounting;
24. public total is derived from canonical settled funding;
25. public usage projection records reconciliation timestamp;
26. estimated cost allocation is labeled estimated;
27. reconciliation difference is visible as state;
28. matching program counts only verified eligible funding;
29. duplicate payment callback cannot duplicate match;
30. match stops at configured cap;
31. matching sponsor gains no operational authority;
32. supporter and matching funds are distinguishable;
33. held/at-risk funds do not expand spendable quota prematurely;
34. chargeback reserve is configurable by risk/payment policy;
35. public page does not reveal fraud score;
36. platform advance is not presented as supporter funding;
37. platform advance has separate authorization/audit;
38. reversal adjusts future spendability without public accusation;
39. archived pool remains transparently viewable according to retention
    policy;
40. public sponsor accounting cannot mutate canonical economic ledger.

------------------------------------------------------------------------

# 420. R1.22 Production Gate

Promotion requires: - gross/net/spendable reconciliation test; -
multi-currency/FX test; - earmark restriction test; - campaign
close/residual funds drill; - refund/chargeback test; - receipt semantic
review; - anonymous aggregation privacy review; - public use-of-funds
reconciliation; - matching-funds idempotency/cap test; -
fraud-hold/spendability test; - platform-advance accounting test.

Mandatory scenario:

``` text
Thai supporter contributes THB
+ international supporter contributes foreign currency
+ company offers 1:1 matching up to cap
+ one payment is held for risk
+ one contribution is anonymous
+ one is earmarked to a province
+ campaign closes with residual funds
+ one payment later reverses
```

The system MUST: - preserve original currency/FX evidence; - calculate
spendable capacity correctly; - enforce earmarks; - avoid premature
spending of held funds; - match only eligible verified contributions; -
preserve anonymous preference; - apply residual policy explicitly; -
reconcile reversal without rewriting history; - keep public transparency
consistent with canonical accounting.

**End of Spec 260 R1.22 --- 220-Pass Cumulative Review / Sponsorship
Accounting, Allocation Integrity & Public Proof**

# 421. Sponsored Credits as the Operational and Public Unit

R1.23 standardizes the sponsorship economy around two distinct layers:

``` text
FIAT / PAYMENT MONEY
= payment, settlement, fee, FX, refund and accounting input

SPONSORED CREDITS
= disaster/public-benefit operational funding unit
= quota/capacity allocation unit
= primary public transparency unit
```

Canonical flow:

``` text
Supporter selects fiat amount
→ existing SmartAIHub payment infrastructure
→ payment verified/settled
→ payment fees / FX resolved
→ eligible net funding value
→ versioned conversion
→ Sponsored Credits minted to designated Disaster Sponsor Pool
→ quota/capacity planner
→ eligible emergency/public-benefit consumption
```

Public website SHOULD primarily communicate pool capacity in Sponsored
Credits.

Fiat values remain available where required for: - payment
confirmation; - receipt; - accounting; - refund/reversal; - legal/tax
reporting; - reconciliation; - transparency details where useful.

------------------------------------------------------------------------

# 422. Personal Credits vs Sponsored Credits

They are different economic instruments.

``` text
PersonalCredits
  owner: user/account
  purpose: ordinary user-paid SmartAIHub services
  transferable/use: according to normal SmartAIHub wallet policy

SponsoredCredits
  owner/control: designated Sponsor Pool
  purpose: policy-approved disaster/public-benefit usage
  personal withdrawal: prohibited
  personal service use: prohibited
  allocation: sponsorship policy
```

Invariants:

``` text
PERSONAL_CREDITS != SPONSORED_CREDITS
SPONSORED_POOL != USER_WALLET
SUPPORT_PAYMENT != PERSONAL_TOPUP
```

A user cannot convert Sponsored Credits into their personal wallet
merely because they funded the pool.

------------------------------------------------------------------------

# 423. Emergency Reserved Credits

A Sponsor Pool MAY internally reserve Sponsored Credits:

``` text
Sponsored Credits
├─ Available Sponsored Credits
├─ Allocated Sponsored Credits
├─ Reserved Emergency Credits
└─ Consumed Sponsored Credits
```

`Reserved Emergency Credits` are still Sponsored Credits; they are not a
third monetary currency.

Reservation is a quota/capacity state used to preserve minimum emergency
capability.

------------------------------------------------------------------------

# 424. Sponsored Credit Conversion Policy

``` text
SponsoredCreditConversionPolicy {
  policy_id
  version
  settlement_currency
  eligible_payment_methods[]
  conversion_basis:
    NET_SETTLED_AMOUNT |
    GROSS_AMOUNT_PLATFORM_SUBSIDIZED |
    OTHER_EXPLICIT_POLICY
  credits_per_unit
  rounding_rule
  minimum_credit_increment
  effective_from
  effective_until?
}
```

Recommended default:

``` text
verified payment
→ payment/FX fees
→ net settled amount
→ Sponsored Credits
```

If SmartAIHub chooses to absorb payment fees, use an explicit subsidized
policy rather than pretending fees do not exist.

------------------------------------------------------------------------

# 425. Conversion Example

Example only:

``` text
Support amount:                500 THB
Payment/processing fee:         10 THB
Eligible net amount:           490 THB
Conversion policy:
  1 THB net = 10 Sponsored Credits

Sponsored Credits minted:
  4,900 Credits
```

Public pool primary display:

``` text
Sponsored Credits received: 4,900
```

Private/accounting evidence preserves:

``` text
500 THB gross
10 THB fee
490 THB net
conversion policy/version
4,900 Sponsored Credits
```

The numerical rate above is illustrative, not a normative SmartAIHub
price.

------------------------------------------------------------------------

# 426. Funding Settlement Contract

``` text
SponsoredCreditMint {
  mint_id
  funding_entry_id
  pool_id

  original_amount
  original_currency

  gross_settled_amount
  settlement_currency
  payment_fee?
  fx_fee?
  net_eligible_amount

  conversion_policy_id
  conversion_policy_version
  conversion_rate
  rounding_rule

  sponsored_credits_minted

  idempotency_key
  minted_at
  state
}
```

One settled funding event MUST NOT mint Sponsored Credits more than
once.

------------------------------------------------------------------------

# 427. Public Sponsor Pool Credit Projection

``` text
PublicSponsorPoolCreditProjection {
  pool_id
  public_name

  sponsored_credits_received
  sponsored_credits_available
  sponsored_credits_reserved
  sponsored_credits_allocated
  sponsored_credits_consumed

  supporter_count?
  public_supporters[]

  updated_at
  reconciliation_state
}
```

This becomes the primary public capacity projection.

------------------------------------------------------------------------

# 428. Public Website --- Recommended Presentation

Example:

``` text
กองทุนสนับสนุนระบบข้อมูลอุทกภัยเชียงใหม่

ได้รับการสนับสนุน        428,500 Credits
ใช้สนับสนุนระบบแล้ว      171,240 Credits
สำรองฉุกเฉิน              25,000 Credits
คงเหลือพร้อมใช้งาน       232,260 Credits

ผู้สนับสนุน                  386 ราย
อัปเดตล่าสุด                  10:42
```

Optional secondary disclosure:

``` text
ดูรายละเอียดการเงินและวิธีคำนวณเครดิต
```

Do not make fiat amount the dominant operational metric.

------------------------------------------------------------------------

# 429. Public Use of Sponsored Credits

Example:

``` text
การใช้ Sponsored Credits

AI Situation Intelligence      72,000 Credits
Emergency Communication       51,100 Credits
Routing / Search              28,800 Credits
Media Analysis                11,320 Credits
Other eligible capabilities    8,020 Credits
```

If a category allocation is estimated rather than exact, label it.

------------------------------------------------------------------------

# 430. Funding Checkout UX

Fiat remains the payment unit at checkout.

Example:

``` text
สนับสนุนระบบภัยพิบัติ

จำนวนที่ชำระ:
500 บาท

ประมาณการ Sponsored Credits:
4,900 Credits

อัตราที่ใช้:
ตามนโยบาย conversion ที่แสดงด้านล่าง

การแสดงชื่อ:
● ไม่ประสงค์ออกนาม
○ แสดงชื่อ
○ ใช้ชื่อที่กำหนดเอง

[ยืนยันและชำระเงิน]
```

Before confirmation, disclose: - payment amount/currency; - estimated
Sponsored Credits where fee is not final; - whether processing fee is
deducted or subsidized; - conversion policy/rate; - destination pool; -
public identity preference.

------------------------------------------------------------------------

# 431. Estimated vs Final Sponsored Credits

Some payment fees/FX may not be final until settlement.

Therefore:

``` text
PRE-PAYMENT:
Estimated Sponsored Credits

POST-SETTLEMENT:
Final Sponsored Credits Minted
```

Never promise an exact final credit amount if payment settlement can
materially change it.

If fee/rate is deterministic before payment, exact display is allowed.

------------------------------------------------------------------------

# 432. Support Receipt

Receipt SHOULD show both economic layers:

``` text
ชำระเงิน:                   500 THB
ค่าธรรมเนียมที่เกี่ยวข้อง:    10 THB
ยอดสุทธิที่ใช้แปลงเครดิต:    490 THB

Sponsored Credits:
4,900 Credits

กองทุน:
Chiang Mai Flood Support Pool

Public display:
Anonymous
```

Actual fee disclosure follows applicable payment/accounting policy.

------------------------------------------------------------------------

# 433. Sponsored Credit Ledger

Sponsored Credits require a logical subledger linked to, not replacing,
the economic ledger.

``` text
SponsoredCreditLedgerEntry {
  entry_id
  pool_id
  event_type:
    MINT |
    RESERVE |
    RELEASE |
    ALLOCATE |
    CONSUME |
    ADJUST |
    REVERSE |
    TRANSFER_IF_AUTHORIZED
  credit_amount
  source_funding_ref?
  capability_usage_ref?
  policy_version
  idempotency_key
  created_at
}
```

Monetary source of truth remains existing payment/economic
infrastructure.

------------------------------------------------------------------------

# 434. Credit Conservation Invariant

For each pool, subject to explicit adjustment/reversal policy:

``` text
Minted Credits
+ Authorized Inbound Transfers
+ Authorized Adjustments
=
Available
+ Reserved
+ Allocated/Outstanding
+ Consumed
+ Authorized Outbound Transfers
+ Reversed/Expired
```

Reconciliation MUST detect violation.

Credits cannot appear solely because a public cache/UI value changed.

------------------------------------------------------------------------

# 435. Review Passes 221--230 --- Sponsored Credit Economy

## Pass 221 --- Conversion Rate Versioning

**Gap:** Conversion rate may change as provider cost/platform economics
change.

**Fix:** - Every mint binds immutable conversion policy/version. -
Historical credits are not recomputed under new rate. - Checkout
refreshes stale conversion quote. - Materially changed rate before
payment confirmation requires updated disclosure. - Public pool balance
remains credit-denominated and is not retroactively revalued.

## Pass 222 --- Fee Subsidy Semantics

**Gap:** SmartAIHub may sometimes absorb payment fees.

**Fix:** - Distinguish `NET_SETTLED_AMOUNT` conversion from
`GROSS_AMOUNT_PLATFORM_SUBSIDIZED`. - Platform subsidy has its own
accounting record. - Do not mint gross-based credits unless subsidy
authorization covers the difference. - Public page may say fees are
subsidized only when actually true.

## Pass 223 --- Rounding / Fractional Credit Integrity

**Gap:** FX/conversion can create fractional credits and cumulative
drift.

**Fix:** - Define integer/minimum credit unit. - Deterministic rounding
rule. - Never round independently in multiple services. - Canonical mint
service computes final credits once. - Reconciliation includes rounding
delta where financially relevant.

## Pass 224 --- Refund / Reversal After Credit Mint

**Gap:** Payment can reverse after Sponsored Credits have been minted or
partly consumed.

**Fix:** - Unconsumed credits can be reversed according to policy. -
Already legitimately consumed credits remain historical consumption. -
Deficit becomes sponsor-pool/economic adjustment, not negative victim
balance. - Platform/sponsor reserve can absorb deficit according to
policy. - Never claw back service already delivered to emergency
users. - Future spendability reflects adjusted balance.

## Pass 225 --- Sponsored Credit Expiry

**Gap:** Whether Sponsored Credits expire was undefined.

**Fix:** - Credit expiry MUST derive from pool/funding
restriction/residual policy, not arbitrary hidden wallet expiry. -
Public terms disclose relevant campaign/end/residual behavior. - Expiry
is ledger event, never silent deletion. - Restricted disaster credits
cannot simply become personal/platform free credits at expiry. - General
emergency pool MAY be non-expiring subject to policy.

## Pass 226 --- Pool-to-Pool Transfer

**Gap:** Residual funds/credits may need transfer between eligible
pools.

**Fix:** - Transfers require compatible funding restrictions and
residual policy/consent. - Preserve provenance to original funding. - No
double mint. - Source decreases exactly as destination increases. -
Cross-currency fiat is not reconverted merely because credit moves
between pools. - Unauthorized transfer fails closed.

## Pass 227 --- Credit Cost Drift

**Gap:** Provider prices may rise/fall after credits were minted.

**Fix:** - Sponsored Credit is an internal operational unit, not a
promise of fixed number of provider calls. - Capability cost in credits
may be versioned according to SmartAIHub economic policy. - Public site
MUST NOT claim "1 credit = one AI call" unless guaranteed. - Existing
quota/budget policies protect provider solvency. - Material pricing
policy changes require governance/audit.

## Pass 228 --- Public Capacity Interpretation

**Gap:** Users may assume 100,000 Credits means a guaranteed amount of
rescue/service.

**Fix:** - Public explanation states credits fund eligible
digital/system capabilities. - Credits are not rescue tickets, cash
balances, securities or guaranteed service units. - Emergency triage
does not depend on contribution. - Provider outages/capacity can
constrain effective usage even with remaining credits. - Avoid
misleading "X credits = X people rescued" claims.

## Pass 229 --- Mint Authorization / Anti-Forgery

**Gap:** A bug or compromised client must not mint Sponsored Credits.

**Fix:** - Client/public website cannot mint credits. - Mint requires
verified canonical payment/funding event or separately authorized
platform/sponsor allocation. - Idempotency + unique funding reference. -
Privileged mint/adjust operations audited. - Reconciliation compares
payment funding and minted credit evidence. - Suspicious mismatch
freezes optional new spending from affected pool while preserving
protected emergency policy.

## Pass 230 --- Credit Transparency and Reconciliation

**Gap:** Public credit totals can diverge from ledger due cache, retry
or adjustment.

**Fix:** - Public projection generated from reconciled Sponsored Credit
Ledger. - Show update/reconciliation state. - Reversal/adjustment
updates projection. - Historical public snapshots MAY be retained for
transparency. - Public API is read-only projection. - No public/admin UI
direct balance mutation.

------------------------------------------------------------------------

# 436. Sponsored Credit Cost Model

Capability execution uses credits:

``` text
CapabilityCreditCost {
  capability_id
  pricing_version
  base_credit_cost?
  metered_dimensions[]
  provider_cost_mapping
  minimum_charge?
  maximum_bound?
  effective_from
}
```

Examples of metered dimensions: - model tokens; - search calls; -
routing calls; - SMS segments; - voice minutes; - media
seconds/images; - storage/egress; - workflow execution.

Sponsored quota admission evaluates expected credit cost before
reservation.

------------------------------------------------------------------------

# 437. Sponsored Credit Reservation

``` text
estimate credit cost
→ reserve Sponsored Credits
→ execute eligible capability
→ meter actual usage
→ settle actual Sponsored Credits
→ release unused reservation
```

This reuses the distributed quota reservation/fencing requirements
already defined.

------------------------------------------------------------------------

# 438. Sponsored Credit Spendability

``` text
SponsoredCreditBalance {
  pool_id
  minted
  available
  reserved
  allocated
  consumed
  held
  reversed
  expired
}
```

`held` credits cannot authorize optional sponsored execution.

------------------------------------------------------------------------

# 439. Funding → Credit → Capacity Separation

Three concepts MUST remain distinct:

``` text
1. MONEY
   fiat/payment/accounting

2. SPONSORED CREDITS
   internal economic allocation unit

3. PROVIDER CAPACITY
   RPM/TPM/concurrency/account quota/technical availability
```

Therefore:

``` text
more money
→ potentially more Sponsored Credits

more Sponsored Credits
≠ unlimited provider capacity
```

Actual execution requires both sufficient Sponsored Credits and
provider/platform capacity.

------------------------------------------------------------------------

# 440. Sponsor Pool Public Explanation

Recommended concise explanation:

``` text
Sponsored Credits คือเครดิตกลางที่ใช้สนับสนุนค่าใช้ระบบ
สำหรับข้อมูลและบริการที่เกี่ยวข้องกับภัยพิบัติตามนโยบายของกองทุน

เครดิตนี้ไม่ใช่เครดิตส่วนตัวของผู้สนับสนุน
ไม่สามารถถอนหรือใช้กับบริการส่วนตัวได้

จำนวนบริการจริงที่รองรับได้ขึ้นอยู่กับประเภทงาน
ต้นทุนผู้ให้บริการ และความพร้อมของระบบในขณะนั้น
```

------------------------------------------------------------------------

# 441. Public Supporter Attribution

Public supporter entry SHOULD primarily show credits funded after
settlement:

``` text
บริษัท Example Co.        +100,000 Credits
คุณ A                     ไม่แสดงจำนวน
ไม่ประสงค์ออกนาม          +4,900 Credits
```

Optionally show original fiat contribution in transaction detail if
policy/user preference permits.

Do not infer a person's wealth or priority from contribution size.

------------------------------------------------------------------------

# 442. Matching Funds in Sponsored Credits

Matching program still originates from verified monetary commitment.

Flow:

``` text
eligible supporter payment
→ supporter Sponsored Credits minted
→ matching eligibility
→ matching sponsor financial allocation verified/authorized
→ matching Sponsored Credits minted
```

Do not create matching credits without actual authorized funding/subsidy
backing.

------------------------------------------------------------------------

# 443. Credit-Based Public Goals

Campaign MAY use:

``` text
เป้าหมาย: 1,000,000 Sponsored Credits
ได้รับแล้ว: 640,000 Credits
64%
```

The underlying funding target must be derived from an approved
conversion/economic plan.

If conversion economics change materially, do not rewrite historical
contributions; revise future target/policy transparently.

------------------------------------------------------------------------

# 444. Credit Reconciliation Dashboard

Operator view:

``` text
Fiat funding verified
→ net eligible funding
→ credits expected by conversion versions
→ credits actually minted
→ variance

Credits minted
→ available
→ reserved
→ consumed
→ reversed/expired
→ ledger conservation variance
```

Any unexplained variance above threshold triggers investigation.

------------------------------------------------------------------------

# 445. R1.23 Additional Acceptance / Negative Tests

Implementation MUST prove:

1.  public pool primary unit is Sponsored Credits;
2.  checkout still charges in supported fiat/payment currency;
3.  Personal Credits and Sponsored Credits cannot be confused by API
    type;
4.  disaster support cannot enter Personal Credit wallet;
5.  Sponsored Credits cannot purchase personal service;
6.  user cannot withdraw Sponsored Credits;
7.  one verified funding event mints credits once;
8.  duplicate payment webhook cannot double mint;
9.  mint stores conversion policy version;
10. old credits are not revalued when conversion rate changes;
11. stale checkout conversion quote is refreshed;
12. fee-deducted conversion uses net eligible amount;
13. gross-based conversion requires explicit platform subsidy;
14. platform subsidy difference is accounted;
15. fractional conversion follows one deterministic rounding rule;
16. two services cannot independently round/mint same funding;
17. refund before consumption can reverse eligible credits;
18. reversal after partial consumption preserves consumed history;
19. reversal never creates negative victim/user wallet;
20. sponsor deficit affects future pool capacity according to policy;
21. credit expiry is explicit ledger event;
22. expired restricted credits do not become personal credits;
23. pool transfer preserves original funding provenance;
24. pool transfer cannot double mint;
25. source/destination transfer balances conserve credits;
26. incompatible restricted pool transfer fails;
27. provider price change does not retroactively alter credit balance;
28. capability credit price is versioned;
29. public UI does not promise fixed provider calls per credit;
30. public UI does not imply credits guarantee rescue outcome;
31. client cannot mint Sponsored Credits;
32. public API cannot mutate pool balance;
33. privileged adjustment is audited;
34. payment-to-mint reconciliation detects unexplained mismatch;
35. public projection derives from credit ledger;
36. cache lag is exposed through update/reconciliation state;
37. matching credits require authorized financial backing;
38. reserved emergency credits cannot be consumed by optional workload;
39. remaining Sponsored Credits alone cannot bypass provider capacity
    guard;
40. credit conservation equation holds under retry/reversal/transfer.

------------------------------------------------------------------------

# 446. R1.23 Production Gate

Promotion requires: - Personal vs Sponsored Credit type isolation; -
payment→credit mint idempotency; - conversion version test; - fee
subsidy test; - FX + rounding test; - refund/reversal after mint test; -
expiry/residual policy test; - pool transfer conservation test; -
capability credit-cost version test; - unauthorized mint penetration
test; - public credit projection reconciliation; - provider-capacity
independence test.

Mandatory scenario:

``` text
supporter pays 500 THB
→ fee deducted
→ final net amount determined
→ versioned conversion mints Sponsored Credits
→ public pool increases in Credits
→ some credits reserved and consumed
→ provider price changes
→ conversion rate changes for future supporters
→ original credit balance is not revalued
→ payment partially reverses
→ pool accounting adjusts future spendability
→ public projection reconciles
```

System MUST preserve: - fiat accounting truth; - credit mint
provenance; - credit conservation; - historical conversion version; -
privacy; - provider capacity protection; - no retroactive personal
charge; - no duplicate mint/settlement.

**End of Spec 260 R1.23 --- 230-Pass Cumulative Review / Sponsored
Credit Economy, Conversion Integrity & Capacity Transparency**

# 447. Review Passes 231--240 --- Delegated Spend, Metering Integrity, Insolvency Safety and Economic Compatibility

Passes 231--240 extend the cumulative review. All fixes below are
normative R1.24 requirements.

## Pass 231 --- Agent / Skill Delegated Sponsored Spending

**Gap:** SmartAIHub Agents, Skills, Workflows and external harnesses may
invoke billable capabilities on behalf of an emergency case.

**Fix:** - Possession of a Skill/tool does not imply authority to spend
Sponsored Credits. - Every sponsored execution requires a bounded
`SponsoredSpendAuthority`. - Authority binds purpose, pool,
incident/event scope, allowed capabilities, max credits, expiry and
policy version. - Nested Skill/Agent calls cannot expand the parent
spending authority. - Child execution receives equal-or-narrower
authority. - External agents never receive unrestricted pool
credentials/balance mutation authority. - Durable execution receipt
links delegated spend to the originating case/task/run.

## Pass 232 --- Revenue Share / Marketplace Fee Boundary

**Gap:** Existing SmartAIHub marketplace may split normal user spend
among platform/tenant/plugin owner. Disaster sponsorship must not
silently become creator revenue.

**Fix:** - Sponsored Credits are consumed only under explicit
emergency/public-benefit economic policy. - Normal marketplace
revenue-share MUST NOT automatically apply to sponsored disaster
usage. - If a third-party Skill/provider is eligible to receive
compensation from sponsored funds, the policy must explicitly define
it. - Sponsor-facing transparency distinguishes
provider/platform/eligible third-party system costs where material. -
Tenant/plugin owner cannot self-mark an arbitrary Skill as sponsorship
eligible. - Emergency/public-benefit eligibility requires controlled
catalog/policy approval.

## Pass 233 --- Pre-Execution Credit Quote / Budget Bound

**Gap:** Variable-cost AI/search/media jobs can consume more credits
than expected.

**Fix:** - Expensive capability obtains estimated credit quote before
reservation. - Quote includes pricing version, expected amount/range,
hard execution bound where feasible, expiry. - Execution cannot exceed
authorized bound without policy-approved reauthorization/degradation. -
For emergency autonomous flow, policy may preauthorize bounded ranges
rather than prompt victim. - Quote expiration triggers re-evaluation. -
User/sponsor pool is never exposed to unbounded recursive agent spend.

## Pass 234 --- Metering Integrity / Usage Dispute

**Gap:** Provider usage, SmartAIHub metering and Skill-reported usage
may disagree.

**Fix:** - Preserve raw provider usage reference where available. -
Metering record states source and confidence/finality. - Reconciliation
compares estimated/reserved/observed/provider-settled usage. - Disputed
usage enters explicit state. - Corrections append adjustment entries. -
Public aggregate does not expose unresolved internal accusation. - A
third-party Skill cannot unilaterally self-report arbitrary billable
usage without validation.

## Pass 235 --- Provider Fallback Cost Change

**Gap:** Fallback provider/model can cost more than the originally
selected route.

**Fix:** - Resolver considers credit budget as a hard execution
constraint. - Fallback within reserved/authorized bound may proceed. -
More expensive fallback beyond bound requires policy authorization,
alternative degradation, or defer/stop. - Emergency minimum may use
separately reserved emergency authority. - Never silently consume a
large sponsor balance because primary provider failed. - Decision record
captures provider fallback and pricing version.

## Pass 236 --- Negative Pool Balance Prevention

**Gap:** Concurrent settlement, reversal and provider adjustments can
drive pool below zero.

**Fix:** - Available Sponsored Credits MUST NOT be negative for new
admission. - Atomic/fenced reservation prevents overspend. - Historical
economic deficit is represented separately as `PoolDeficit`, not by
pretending spendable credits are negative. - New optional sponsored work
stops/degrades when deficit exists according to policy. - Emergency
minimum can be funded by separate platform reserve if authorized. -
Deficit resolution is auditable.

## Pass 237 --- Administrative Credit Adjustment Governance

**Gap:** Admin "add credits" can bypass payment and destroy
transparency.

**Fix:** - No arbitrary balance edit. - Adjustments are ledger events
with typed reason: - reconciliation correction; - authorized platform
subsidy; - sponsor contractual allocation; - migration correction; -
incident compensation; - reversal correction. - High-value adjustment
MAY require dual approval. - Adjustment cannot erase original events. -
Public projection identifies platform-funded subsidy separately where
material. - Admin UI never writes balance directly.

## Pass 238 --- Public Proof Snapshot / Tamper Evidence

**Gap:** Public transparency page changes over time and users may want
evidence that historical totals were not silently rewritten.

**Fix:** - Generate periodic `PublicTransparencySnapshot`. - Snapshot
contains aggregate credit totals, use categories, pool state,
reconciliation timestamp and integrity hash/version. - Historical
snapshots may be publicly retrievable according to retention policy. -
Corrections publish a new snapshot; do not rewrite prior snapshot
invisibly. - Snapshot contains no victim/private payment identity. -
This is transparency evidence, not necessarily a financial audit
certification.

## Pass 239 --- Pool Insolvency / Sponsor Exhaustion

**Gap:** Pool can become economically insolvent due reversal, provider
adjustment, unexpected costs or funding exhaustion.

**Fix:** - Add solvency state: `HEALTHY`, `PRESSURE`, `DEFICIT`,
`RECOVERY`. - Optional sponsored admission responds to solvency state. -
Existing critical incident records/services are not deleted. - Public
page may show sponsorship capacity limited without exposing
fraud/private causes. - Operators receive deficit amount/cause category
and recovery options. - Recovery may use verified new funding,
authorized platform reserve or accounting correction. - No automatic
personal-user charge.

## Pass 240 --- Economic Schema / Version Migration Compatibility

**Gap:** Sponsored Credits are being added to an existing wallet/credit
system; unsafe migration could alter old balances or duplicate
authorities.

**Fix:** - Introduce additive typed ledger/account/purpose dimensions. -
Do not reinterpret historical Personal Credit entries as Sponsored
Credits. - Migration is replayable/idempotent. - Backfill uses explicit
version/provenance. - Old clients/API versions cannot accidentally spend
Sponsor Pool as personal wallet. - Capability/economic APIs fail closed
on unknown credit type. - Rollback preserves already-created ledger
evidence. - Existing SmartAIHub economic ledger remains canonical
monetary authority.

------------------------------------------------------------------------

# 448. Sponsored Spend Authority

``` text
SponsoredSpendAuthority {
  authority_id
  principal_type:
    SYSTEM |
    AGENT |
    SKILL |
    WORKFLOW |
    RESPONDER_APP |
    TENANT_SERVICE
  principal_ref
  pool_id
  incident_or_event_scope?
  purpose
  allowed_capabilities[]
  max_credits
  remaining_authorized_credits
  pricing_policy_versions[]
  issued_at
  expires_at
  parent_authority_id?
  policy_version
}
```

Rules:

``` text
child.max_credits <= parent.remaining_authorized_credits
child.capabilities ⊆ parent.capabilities
child.scope ⊆ parent.scope
child.expiry <= parent.expiry
```

Delegation cannot broaden authority.

------------------------------------------------------------------------

# 449. Sponsored Execution Budget

``` text
SponsoredExecutionBudget {
  execution_id
  authority_id
  capability_id
  quote_id
  estimated_credits
  reserved_credits
  hard_credit_bound
  actual_credits?
  state
}
```

No unbounded `while agent thinks useful → spend pool`.

------------------------------------------------------------------------

# 450. Credit Quote

``` text
SponsoredCreditQuote {
  quote_id
  capability_id
  pricing_version
  provider_route?
  estimated_credits
  estimate_range?
  hard_bound?
  generated_at
  expires_at
  assumptions[]
}
```

For deterministic fixed-cost operations, estimate may be exact.

------------------------------------------------------------------------

# 451. Metering Record

``` text
CapabilityMeteringRecord {
  metering_id
  execution_id
  capability_id
  provider
  provider_usage_ref?
  raw_usage?
  normalized_usage
  pricing_version
  calculated_credits
  metering_source
  state:
    PROVISIONAL |
    FINAL |
    DISPUTED |
    ADJUSTED
  observed_at
}
```

------------------------------------------------------------------------

# 452. Sponsored Settlement

``` text
credit quote
→ spend authority check
→ reserve
→ execute
→ meter
→ settle
→ release remainder
→ reconcile provider record
```

Retry MUST reuse logical execution/idempotency identity.

------------------------------------------------------------------------

# 453. Sponsored Marketplace Boundary

Default:

``` text
normal marketplace execution
→ normal SmartAIHub economic/revenue-share policy

sponsored emergency execution
→ sponsored eligibility policy
→ approved cost/revenue treatment
```

Never infer sponsorship eligibility from "published in marketplace".

------------------------------------------------------------------------

# 454. Sponsored Skill Eligibility

``` text
SponsoredSkillPolicy {
  capability_id
  eligibility_status
  allowed_emergency_purposes[]
  allowed_pool_types[]
  pricing_policy
  third_party_compensation_policy?
  max_credit_bound?
  reviewed_at
  reviewed_by/policy
}
```

A creator cannot grant itself access to disaster sponsor funds.

------------------------------------------------------------------------

# 455. Pool Deficit

``` text
PoolDeficit {
  deficit_id
  pool_id
  amount_credits_equivalent
  cause:
    REVERSAL |
    PROVIDER_ADJUSTMENT |
    METERING_CORRECTION |
    MIGRATION_CORRECTION |
    OTHER
  discovered_at
  resolution_state
  resolution_refs[]
}
```

Deficit is an accounting/governance condition, not a negative spendable
wallet.

------------------------------------------------------------------------

# 456. Solvency State

``` text
HEALTHY
PRESSURE
DEFICIT
RECOVERY
```

Example policy:

``` text
HEALTHY:
  normal eligible sponsorship

PRESSURE:
  optimize/degrade optional work

DEFICIT:
  no new optional sponsored spend
  preserve public/free/minimum emergency paths

RECOVERY:
  bounded restart after funding/correction
```

------------------------------------------------------------------------

# 457. Administrative Adjustment

``` text
SponsoredCreditAdjustment {
  adjustment_id
  pool_id
  type
  credit_delta
  financial_backing_ref?
  reason
  requested_by
  approved_by?
  created_at
  policy_version
}
```

`credit_delta` does not mutate a balance row directly; ledger projection
derives balance.

------------------------------------------------------------------------

# 458. Public Transparency Snapshot

``` text
PublicTransparencySnapshot {
  snapshot_id
  pool_id
  as_of
  received_credits
  available_credits
  reserved_credits
  consumed_credits
  use_categories[]
  supporter_count?
  pool_state
  reconciliation_state
  projection_version
  integrity_hash
}
```

Snapshot excludes private funding/payment identifiers.

------------------------------------------------------------------------

# 459. Public Snapshot UX

Public page MAY offer:

``` text
ความโปร่งใสของกองทุน
อัปเดตล่าสุด 10:45

[ดูประวัติยอดเครดิต]
[ดูการใช้เครดิต]
[ดูนโยบายกองทุน]
```

Historical chart is based on transparency snapshots, not mutable client
calculations.

------------------------------------------------------------------------

# 460. Migration Strategy

Suggested additive sequence:

``` text
1. introduce credit_type / purpose enum
2. add Sponsor Pool ledger structures
3. deploy read-only projections
4. add payment-purpose routing
5. enable mint in shadow/test
6. reconcile test funding
7. enable controlled sponsor pool
8. enable sponsored capability admission
9. enable public transparency
10. expand gradually
```

No one-step migration of existing Personal Credit balances.

------------------------------------------------------------------------

# 461. API Type Safety

Economic APIs MUST require explicit credit context:

``` text
credit_type:
  PERSONAL |
  SPONSORED

wallet_or_pool_ref
purpose
```

Unknown/missing type on sensitive mutation fails closed.

Do not use one ambiguous `balance` endpoint for both without typed
authorization.

------------------------------------------------------------------------

# 462. Agent Execution Example

``` text
Incident requires multilingual emergency summary

Orchestrator
→ Capability Resolver selects Translation/Summary Skill
→ Sponsored eligibility check
→ issue bounded SponsoredSpendAuthority: max 120 Credits
→ quote: 80–110 Credits
→ reserve 120
→ execute provider
→ actual 96
→ settle 96
→ release 24
→ return grounded result
```

If Skill tries nested research costing +500 credits: - parent authority
does not cover it; - nested call is denied/degraded or separately
authorized.

------------------------------------------------------------------------

# 463. Provider Fallback Example

``` text
Primary model quote: 100 Credits
Hard bound: 130

Primary provider unavailable

Fallback A: 115 Credits
→ allowed within bound

Fallback B: 220 Credits
→ not silently allowed
→ cheaper model/deterministic fallback
→ or explicit policy reauthorization
```

------------------------------------------------------------------------

# 464. Public Solvency Messaging

When pool is under pressure:

``` text
Sponsored Credits สำหรับการวิเคราะห์เพิ่มเติม
กำลังมีจำกัดชั่วคราว

ข้อมูลฉุกเฉินและข้อมูลสาธารณะหลักยังคงให้บริการ
ตามความพร้อมของระบบ
```

Do not expose supporter chargeback/fraud details.

------------------------------------------------------------------------

# 465. R1.24 Additional Acceptance / Negative Tests

Implementation MUST prove:

1.  Agent cannot spend Sponsored Credits without delegated authority;
2.  Skill installation does not imply spend authority;
3.  child Agent cannot increase parent's credit bound;
4.  nested Skill cannot broaden capability scope;
5.  expired authority cannot reserve credits;
6.  external harness receives no raw sponsor-pool mutation credential;
7.  execution receipt links sponsored spend to originating run/case;
8.  normal marketplace revenue share does not automatically consume
    sponsor funds;
9.  marketplace creator cannot self-authorize sponsorship eligibility;
10. approved third-party sponsored compensation follows explicit policy;
11. expensive execution has quote/pricing version;
12. expired quote is re-evaluated;
13. execution cannot exceed hard bound silently;
14. recursive agent loop cannot create unbounded spend;
15. provider usage reference is retained when available;
16. provisional metering is distinguishable from final;
17. disputed metering can be adjusted without deleting original record;
18. Skill self-reported usage cannot alone authorize arbitrary charge;
19. fallback within hard bound can execute;
20. fallback above bound cannot silently overspend;
21. provider failure cannot drain pool through expensive fallback;
22. available Sponsored Credit balance cannot be negative for admission;
23. reversal deficit is represented separately from spendable balance;
24. deficit does not create personal user debt;
25. optional sponsored work stops/degrades under DEFICIT;
26. admin cannot directly edit balance row;
27. admin adjustment requires typed reason;
28. high-value adjustment can require dual approval;
29. platform subsidy is distinguishable from public sponsor funding;
30. transparency snapshot contains no victim/payment identity;
31. old transparency snapshot is not silently rewritten after
    correction;
32. integrity hash/version changes with new snapshot;
33. public snapshot is not mislabeled as audited financial statement;
34. pool solvency state changes are auditable;
35. recovery from deficit does not burst all optional work immediately;
36. historical Personal Credits are not converted during migration;
37. migration replay does not duplicate Sponsor Credit ledger entries;
38. old API client cannot spend sponsor pool as personal wallet;
39. unknown credit type fails closed;
40. existing economic ledger remains canonical monetary authority.

------------------------------------------------------------------------

# 466. R1.24 Production Gate

Promotion requires: - delegated Agent/Skill spend-authority test; -
nested authority narrowing test; - marketplace sponsorship boundary
test; - quote/budget-bound test; - metering/provider reconciliation
test; - expensive fallback test; - deficit/negative-balance test; -
admin adjustment governance test; - public snapshot integrity test; -
additive migration/replay test; - old-client compatibility test.

Mandatory scenario:

``` text
emergency Agent receives 150-credit authority
→ Skill quotes 100 credits
→ primary provider fails
→ fallback costs 125
→ executes within bound
→ nested Skill attempts 500-credit research
→ denied
→ actual metering settles 121
→ payment reversal later creates pool deficit
→ optional sponsorship degrades
→ public emergency path remains
→ operator adds authorized platform subsidy
→ recovery proceeds gradually
→ transparency snapshot records corrected state
```

System MUST preserve: - bounded delegated spend; - no hidden marketplace
extraction; - metering provenance; - no negative spendable balance; - no
personal debt; - append-only adjustment evidence; - public
transparency; - canonical SmartAIHub economic authority.

**End of Spec 260 R1.24 --- 240-Pass Cumulative Review / Delegated
Spend, Metering Integrity, Insolvency Safety & Economic Compatibility**

# 467. Review Passes 241--250 --- Operational Governance, Recovery, Compatibility and Cost Integrity

Passes 241--250 extend the cumulative review. All fixes below are
normative R1.25 requirements.

## Pass 241 --- Separation of Duties / Four-Eyes Control

**Gap:** A single privileged operator could create a sponsor pool,
change conversion policy, mint an adjustment and alter public
presentation.

**Fix:** - Define privileged action classes and incompatible duties. -
High-impact economic actions SHOULD require dual control/four-eyes
approval. - At minimum separate: - payment/economic reconciliation; -
sponsorship policy administration; - high-value credit adjustment; -
public transparency publication override; - credential/security
administration. - Emergency operational responders do not automatically
receive economic admin rights. - Break-glass action requires reason,
bounded duration, enhanced audit and post-event review. - No approval
workflow may block protected minimum life-safety service.

## Pass 242 --- Compromised Admin / Credential Rotation

**Gap:** A stolen admin session, payment webhook secret, provider
credential or sponsor API key could manipulate funding or spend.

**Fix:** - Credentials are scoped, rotatable and revocable. - Rotation
must not require rewriting historical ledger events. - Credential
identity/version is recorded without exposing secret material. -
Suspected compromise can freeze affected optional mutations while
preserving public read/minimum emergency path. - Sessions/tokens used
for economic mutation require stronger policy than public viewing. -
Provider/payment credential fallback is explicit; no implicit
cross-account authority.

## Pass 243 --- Webhook Authenticity / Replay / Out-of-Order Events

**Gap:** Payment callbacks may be duplicated, delayed, replayed or
arrive out of order.

**Fix:** - Verify provider signature/authenticity. - Store provider
event ID and logical transaction identity. - Enforce idempotency. -
Reject/ignore stale replay according to provider semantics. - Model
payment state transitions; do not assume arrival order. - A late
`payment_succeeded` must not overwrite a later valid
`refunded/chargeback` state. - Unknown/conflicting sequence enters
reconciliation state. - Callback processing never directly edits public
pool balance.

## Pass 244 --- Clock Skew / Time Authority

**Gap:** Quota windows, conversion quote expiry, CAP alerts, funding
campaigns and audit ordering depend on time.

**Fix:** - Use trusted server-side time for authoritative economic
transitions. - Client timestamp is evidence/context, not settlement
authority. - Store `occurred_at`, `received_at`, and provider timestamp
where relevant. - Use monotonic sequence/fencing where ordering matters
more than wall clock. - Define tolerance for clock skew. - Quota reset
must not double-reset because clocks jump/DST changes. - Public display
uses timezone-aware timestamps.

## Pass 245 --- Backup / Point-in-Time Recovery / Economic RPO-RTO

**Gap:** Database recovery can resurrect or lose ledger/projection
state.

**Fix:** - Define RPO/RTO tiers for: - canonical payment/economic
ledger; - Sponsored Credit ledger; - incident/need/task state; -
evidence metadata; - public projections/cache. - PostgreSQL backup/PITR
strategy MUST cover canonical economic and incident records. - R2
evidence follows appropriate durability/version/retention policy. -
Cache is rebuildable and not source of truth. - Restore process performs
post-restore reconciliation before enabling normal sponsored spending. -
Recovery drill is required, not backup existence alone.

## Pass 246 --- Schema Migration During Active Disaster

**Gap:** Deploying an incompatible schema during a live emergency can
interrupt intake, dispatch, notifications or sponsorship.

**Fix:** - Prefer expand/migrate/contract. - New code must tolerate
mixed schema/client versions during rollout. - Avoid blocking table
rewrites on hot emergency paths. - Destructive contract phase waits
until old clients/workers are retired. - Migration has emergency
abort/rollback plan. - Minimum emergency path has a tested compatibility
window. - Economic migration is idempotent/replayable. - No migration
may reinterpret existing Personal Credits.

## Pass 247 --- Stale / Offline Client Protocol Compatibility

**Gap:** PWA/mobile/desktop/offline queue may reconnect after API/credit
schema changes.

**Fix:** - Requests carry protocol/schema version where needed. - Server
validates old mutation semantics safely. - Unknown credit type/purpose
fails closed for economic mutation. - Emergency report content SHOULD
still be recoverable even if optional paid/sponsored extension is
incompatible. - Offline queued messages use stable idempotency IDs. -
Client receives actionable upgrade/degraded-mode response rather than
corrupting state. - Deep links and notification actions have
version-compatible routing.

## Pass 248 --- Audit Export / Sponsor and Regulator Evidence

**Gap:** Internal audit exists, but authorized
sponsor/accounting/regulatory review may need portable evidence.

**Fix:** - Provide permissioned export of aggregate sponsor
funding/credits/usage/reconciliation/policy versions. - Export is
purpose-bound and redacted. - Sponsor export never includes victim
private data merely because sponsor funded the pool. - Include snapshot
IDs/integrity metadata and report generation timestamp. - Distinguish
operational transparency export from statutory accounting/tax records. -
Export generation is itself audited.

## Pass 249 --- Shared Cost Allocation

**Gap:** One cached situation summary, route dataset or shared alert can
benefit multiple pools, incidents, tenants or users.

**Fix:** - Do not double-charge full shared cost to every beneficiary. -
Define allocation method: - direct attribution; - proportional; -
platform-funded common infrastructure; - primary-beneficiary; -
configured pooled allocation. - Allocation method/version is
auditable. - Shared-cache hit may have zero/marginal credit charge
according to pricing policy. - Public use-of-funds labels estimated
allocation when exact attribution is impossible. - Sponsor restriction
compatibility is checked before allocating shared cost.

## Pass 250 --- Observability / Telemetry Cost Runaway

**Gap:** Logging, tracing, analytics and audit export can themselves
create large provider, storage or egress cost during a disaster surge.

**Fix:** - Define observability budget and priority. - Never sample away
legally/operationally mandatory economic/audit events. - High-volume
debug traces can be sampled/degraded. - Metrics cardinality is
bounded. - Sensitive payloads are not copied into logs by default. -
Telemetry failure does not block protected emergency intake. - Telemetry
cost is visible separately from victim-facing capability cost where
material. - Emergency surge mode reduces nonessential observability
before reducing protected minimum service.

------------------------------------------------------------------------

# 468. Privileged Action Matrix

``` text
Action                                  Suggested Control
---------------------------------------------------------------
View public sponsor page                Public
View internal aggregate pool            Authorized operator
Create/edit sponsor pool                Sponsorship admin
Activate conversion policy              Economic admin + policy control
High-value credit adjustment            Dual approval
Change residual-fund destination        Policy approval + audit
Rotate payment credential               Security/economic admin
Override reconciliation                 Dual approval
Break-glass economic action             Strong auth + reason + expiry
Publish corrected transparency snapshot Authorized publisher / policy
```

Exact roles are tenant/platform policy, but incompatible duties MUST be
expressible.

------------------------------------------------------------------------

# 469. Break-Glass Authorization

``` text
BreakGlassGrant {
  grant_id
  principal
  scope
  reason
  issued_at
  expires_at
  approved_by?
  actions_taken[]
  review_required
}
```

Break-glass: - is time bounded; - cannot silently become permanent
role; - cannot erase audit; - cannot override public/private victim-data
boundaries without valid emergency/legal policy.

------------------------------------------------------------------------

# 470. Credential Reference

``` text
CredentialReference {
  credential_ref
  provider
  account_scope
  credential_version
  status:
    ACTIVE |
    ROTATING |
    REVOKED |
    COMPROMISED
  activated_at
  revoked_at?
}
```

Never persist raw secret in operational audit event.

------------------------------------------------------------------------

# 471. External Event Envelope

``` text
ExternalEconomicEvent {
  provider
  provider_event_id
  transaction_ref
  event_type
  provider_occurred_at?
  received_at
  signature_verified
  payload_hash
  processing_version
  state
}
```

Raw provider payload retention follows payment/security policy.

------------------------------------------------------------------------

# 472. Payment State Ordering

Example state machine:

``` text
INITIATED
→ PENDING
→ VERIFIED
→ SETTLED
→ REFUNDED / PARTIALLY_REFUNDED / DISPUTED / CHARGEBACK
```

Provider-specific mappings may vary.

A state transition handler MUST use semantic precedence/version, not
HTTP arrival order alone.

------------------------------------------------------------------------

# 473. Time Semantics

For critical records, distinguish:

``` text
occurred_at
observed_at
provider_occurred_at
received_at
processed_at
effective_at
expires_at
```

Do not overload one `timestamp` field for all meanings.

------------------------------------------------------------------------

# 474. Recovery Criticality Tiers

Recommended logical tiers:

``` text
TIER 0 — Protected Emergency Intake / Incident Core
TIER 1 — Economic Ledger / Sponsored Credit Ledger / Dispatch State
TIER 2 — Notifications / Operational Projections
TIER 3 — Public Transparency / Search / Analytics
TIER 4 — Optional Enrichment / Historical Derived Products
```

Exact RPO/RTO values MUST be established from deployment/business
requirements and tested. Do not invent unsupported guarantees in the
spec.

------------------------------------------------------------------------

# 475. Post-Restore Reconciliation

After restoring canonical stores:

``` text
restore
→ verify ledger continuity
→ reconcile payment provider events
→ reconcile Sponsored Credit conservation
→ reconcile active reservations/leases
→ rebuild projections/cache
→ verify incident/task active state
→ resume bounded sponsored admission
```

Do not immediately trust restored cache.

------------------------------------------------------------------------

# 476. Schema Evolution Rules

``` text
EXPAND:
  add nullable/new structures
  deploy compatible readers/writers

MIGRATE:
  backfill/reconcile progressively

CONTRACT:
  remove legacy only after old clients/workers retired
```

Emergency-critical APIs SHOULD support at least the explicitly defined
compatibility window.

------------------------------------------------------------------------

# 477. Offline Mutation Envelope

``` text
OfflineMutation {
  mutation_id
  client_id
  protocol_version
  created_at_client
  received_at_server?
  mutation_type
  payload
  idempotency_key
}
```

Client time never authorizes payment/credit mutation.

------------------------------------------------------------------------

# 478. Audit Export

``` text
SponsorTransparencyExport {
  export_id
  pool_id
  reporting_period
  funding_summary
  sponsored_credit_summary
  usage_summary
  reconciliation_summary
  policy_versions[]
  transparency_snapshot_refs[]
  generated_at
  integrity_metadata
  redaction_profile
}
```

No victim-level details by default.

------------------------------------------------------------------------

# 479. Shared Cost Allocation Record

``` text
SharedCostAllocation {
  allocation_id
  source_execution_or_product
  total_cost_credits
  allocation_method
  beneficiaries[]
  allocated_credits[]
  pricing_policy_version
  estimated
  created_at
}
```

Invariant:

``` text
sum(allocated_credits) <= eligible total allocatable cost
```

unless an explicit platform markup/policy exists and is separately
represented.

------------------------------------------------------------------------

# 480. Shared Situation Product Example

``` text
One flood situation summary costs 1,000 Credits to produce.

It is used by:
- public map
- 3 incident briefings
- 2 tenant dashboards
- travel warning

Do NOT charge:
1,000 × every consumer.

Instead:
- allocate according to approved shared-cost policy,
or
- platform/common emergency pool funds the shared product,
then downstream cache reads may be zero/marginal cost.
```

------------------------------------------------------------------------

# 481. Observability Budget

``` text
ObservabilityBudget {
  environment
  workload_class
  log_budget
  trace_budget
  metrics_cardinality_budget
  storage_budget
  retention_policy
  degradation_order[]
}
```

Mandatory audit/economic integrity records are outside ordinary debug
sampling.

------------------------------------------------------------------------

# 482. Telemetry Degradation Order

Suggested:

``` text
1. reduce verbose debug logs
2. reduce noncritical traces
3. aggregate high-cardinality metrics
4. shorten optional telemetry retention
5. defer analytics exports
```

Never first remove: - payment settlement evidence; - Sponsored Credit
ledger; - critical audit; - incident/task state; - required security
events.

------------------------------------------------------------------------

# 483. R1.25 Additional Acceptance / Negative Tests

Implementation MUST prove:

1.  one ordinary operator cannot silently perform all high-impact
    economic roles;
2.  high-value adjustment can require second approval;
3.  responder role does not imply sponsor-economic admin;
4.  break-glass grant expires;
5.  break-glass action is audited;
6.  credential rotation does not rewrite historical ledger;
7.  revoked credential cannot authorize new mutation;
8.  raw secret is absent from audit/log;
9.  duplicate payment webhook does not duplicate settlement/mint;
10. replayed webhook is detected/idempotent;
11. out-of-order refund/success cannot regress canonical payment state;
12. conflicting provider sequence enters reconciliation;
13. client clock cannot authorize expired conversion quote;
14. quota reset is robust to DST/wall-clock change;
15. critical record preserves received vs occurred time where relevant;
16. backup restore can rebuild public projections;
17. cache is not treated as restored source of truth;
18. post-restore credit conservation is verified before normal
    admission;
19. restore drill tests actual recovery path;
20. schema migration supports mixed-version rollout;
21. destructive schema contraction waits for old clients;
22. migration failure does not reinterpret Personal Credits;
23. stale client cannot mutate Sponsor Pool using old ambiguous balance
    API;
24. offline emergency report can survive optional sponsored-feature
    incompatibility;
25. offline retry does not duplicate report/payment/credit mutation;
26. audit export is permissioned and redacted;
27. sponsor audit export contains no victim private data by default;
28. export includes policy/snapshot provenance;
29. export generation is audited;
30. one shared execution is not fully double-charged to every
    beneficiary;
31. shared allocation sums correctly;
32. restricted sponsor funding cannot be allocated to incompatible
    beneficiary;
33. cached read follows configured zero/marginal cost policy;
34. estimated shared allocation is labeled;
35. debug telemetry can degrade during surge;
36. mandatory economic audit is not sampled away;
37. high-cardinality metrics are bounded;
38. telemetry logs do not duplicate sensitive case payload by default;
39. telemetry failure does not block protected emergency intake;
40. observability cost is visible and cannot silently consume unlimited
    Sponsored Credits.

------------------------------------------------------------------------

# 484. R1.25 Production Gate

Promotion requires: - privileged-role/separation-of-duties test; -
break-glass expiry/review test; - credential compromise/rotation
drill; - webhook replay/out-of-order test; - clock-skew/time-window
test; - backup/PITR restore drill; - post-restore economic
reconciliation; - live-compatible schema migration rehearsal; -
stale/offline client compatibility test; - audit export privacy test; -
shared-cost allocation reconciliation; - observability surge/cost test.

Mandatory recovery scenario:

``` text
active disaster
→ payment webhooks duplicated and reordered
→ payment credential rotated
→ database restored from PITR in rehearsal
→ active offline client reconnects using older protocol
→ shared situation product serves several tenants/incidents
→ telemetry surge exceeds budget
```

System MUST: - preserve payment state semantics; - avoid duplicate
Sponsored Credit mint; - reconcile ledger after restore; - preserve
emergency report intake; - fail closed for ambiguous economic
mutation; - avoid double charging shared products; - degrade telemetry
before protected service; - retain mandatory audit evidence.

**End of Spec 260 R1.25 --- 250-Pass Cumulative Review / Operational
Governance, Recovery, Compatibility & Cost Integrity**

# 485. News Watch, Verification & Controlled Publication

SmartAIHub Emergency & Crisis Intelligence MUST support controlled
discovery, verification and publication of public news/situation
information.

This subsystem belongs under **Real-World Intelligence** and reuses the
existing SmartAIHub scheduling/orchestration, Continuous Research,
Capability Registry, Skills, worker_jobs, approval and audit
infrastructure.

It MUST NOT create: - a second scheduler authority; - a second research
runtime; - a second publication authority disconnected from SmartAIHub
policy.

Canonical pipeline:

``` text
Watch Plan
→ Scheduled / Event-Triggered Search
→ Source Retrieval
→ Normalize
→ Deduplicate / Cluster
→ Event Candidate
→ Claim Extraction
→ Evidence Graph
→ Source / Corroboration Assessment
→ Publication Risk Classification
→ Verification Gate
→ Human Review when required
→ Public Projection
→ Update / Correction / Retraction
```

------------------------------------------------------------------------

# 486. Why Verification Must Precede Public Publication

Search/retrieval is not publication.

A retrieved article, social report or AI-generated summary MUST NOT
become public operational fact merely because the system found it.

Invariant:

``` text
FOUND != VERIFIED
VERIFIED != OFFICIAL
AI_SUMMARY != SOURCE
PUBLICATION != SOURCE INGESTION
```

Public content must preserve provenance and verification state.

------------------------------------------------------------------------

# 487. News Watch Plan

``` text
NewsWatchPlan {
  watch_id
  tenant_id?
  name
  purpose
  hazard_types[]
  geographies[]
  languages[]

  query_sets[]
  source_policy_id
  publication_policy_id

  schedule_policy
  trigger_policy?

  lookback_window
  freshness_requirement

  query_budget
  provider_budget
  sponsored_credit_policy?

  enabled
  created_by
  policy_version
  created_at
  updated_at
}
```

------------------------------------------------------------------------

# 488. Query Set

``` text
NewsQuerySet {
  query_set_id
  watch_id

  seed_keywords[]
  synonyms[]
  related_terms[]
  geographic_terms[]
  official_terms[]
  exclusions[]
  language_variants[]

  generated_terms[]
  generated_terms_state:
    PROPOSED |
    APPROVED |
    ACTIVE |
    REJECTED

  version
}
```

AI/LLM MAY propose additional keywords.

AI MUST NOT silently change high-impact production watch semantics
without the configured policy/approval path.

------------------------------------------------------------------------

# 489. Keyword Example --- Flood

A flood watch should not depend only on the literal keyword `น้ำท่วม`.

Example:

``` text
น้ำท่วม
น้ำป่า
น้ำป่าไหลหลาก
น้ำล้นตลิ่ง
น้ำเข้าบ้าน
ระดับน้ำ
แม่น้ำล้น
ถนนน้ำท่วม
ถนนตัดขาด
สะพานขาด
อพยพ
ศูนย์พักพิง
เขื่อน
ประตูระบายน้ำ
ดินถล่ม
ไฟฟ้าดับ
```

Combine where appropriate with: - province; - district; - subdistrict; -
river/basin; - landmark; - road; - authority; - English/local-language
variants.

Query expansion should be semantic and bounded rather than producing
unlimited searches.

------------------------------------------------------------------------

# 490. Schedule Policy

Watch execution can support:

``` text
FIXED_INTERVAL
CRON
ADAPTIVE
EVENT_TRIGGERED
MANUAL
```

Examples:

``` text
Normal:
every 30 minutes

Elevated:
every 10 minutes

Active incident:
every 5 minutes

High-confidence material update:
trigger immediate bounded refresh
```

Exact minimum cadence is deployment/provider-policy dependent.

Scheduling MUST reuse SmartAIHub's existing durable
scheduling/orchestration authority.

------------------------------------------------------------------------

# 491. Adaptive Search Frequency

Search frequency MAY increase based on:

-   active HazardEvent;
-   official warning;
-   rapid observation growth;
-   material sensor change;
-   large public-report cluster;
-   high-severity unresolved Incident;
-   publication requiring follow-up;
-   known press/authority briefing time.

It SHOULD decrease when: - event stabilizes; - no material change; -
provider budget pressure; - duplicate rate is high; - watch becomes
stale/irrelevant.

Avoid synchronized polling herd.

------------------------------------------------------------------------

# 492. Source Policy

``` text
NewsSourcePolicy {
  source_policy_id

  allowed_source_classes[]
  preferred_sources[]
  restricted_sources[]
  blocked_sources[]

  official_source_rules
  news_media_rules
  social_source_rules
  citizen_source_rules

  domain_rate_limits
  licensing_rules
  attribution_rules
  retention_rules

  version
}
```

Source class examples:

``` text
OFFICIAL_AUTHORITY
EMERGENCY_AGENCY
WEATHER_GEOLOGICAL_AGENCY
LOCAL_GOVERNMENT
ESTABLISHED_NEWS
LOCAL_NEWS
NGO
ACADEMIC
SENSOR_DATA
CITIZEN_REPORT
SOCIAL_PUBLIC_POST
UNKNOWN_WEB
```

Source class is evidence context, not automatic truth.

------------------------------------------------------------------------

# 493. Source Identity and Independence

Corroboration MUST consider source independence.

Ten websites repeating one wire report are not necessarily ten
independent confirmations.

Model:

``` text
SourceIdentity {
  canonical_source
  source_class
  publisher
  upstream_origin?
  syndication_chain?
  authority_scope?
  geographic_scope?
}
```

Verification should avoid false corroboration caused by
copying/syndication.

------------------------------------------------------------------------

# 494. Retrieval Record

``` text
NewsRetrieval {
  retrieval_id
  watch_id
  query_id
  source_url/source_ref
  source_identity_ref
  title
  published_at?
  retrieved_at
  language
  content_hash
  license/usage_metadata
  raw_artifact_ref?
}
```

Respect source licensing/copyright/retention requirements.

Do not republish full copyrighted articles merely because they were
retrieved.

------------------------------------------------------------------------

# 495. Deduplication and Story Clustering

``` text
retrieved items
→ exact duplicate detection
→ near-duplicate detection
→ syndication detection
→ semantic event clustering
```

Output:

``` text
NewsStoryCluster {
  cluster_id
  event_candidate_id?
  member_retrievals[]
  canonical_topic
  geography
  time_window
  source_independence_summary
  updated_at
}
```

Original source records remain preserved.

------------------------------------------------------------------------

# 496. Claim-Level Extraction

Verification MUST be claim-aware.

Example article:

``` text
Claim A: flooding occurred in District X
Claim B: water depth is 80 cm
Claim C: 7 deaths were reported
Claim D: evacuation order was issued
```

These claims can have different evidence/verification states.

Do not assign one article-level confidence to every factual claim.

------------------------------------------------------------------------

# 497. News Claim

``` text
NewsClaim {
  claim_id
  cluster_id
  normalized_claim
  claim_type
  subject
  predicate
  object/value?
  geography?
  event_time?
  extracted_from[]
  extraction_method
  extraction_confidence
}
```

Extraction confidence is NOT verification confidence.

------------------------------------------------------------------------

# 498. Claim Verification Record

``` text
NewsClaimVerification {
  verification_id
  claim_id

  evidence_refs[]
  independent_source_count
  official_source_refs[]
  sensor/observation_refs[]

  consistency_state:
    CONSISTENT |
    CONFLICTING |
    INSUFFICIENT |
    UNKNOWN

  verification_state:
    UNVERIFIED |
    PARTIALLY_CORROBORATED |
    CORROBORATED |
    OFFICIAL_CONFIRMED |
    DISPUTED |
    RETRACTED

  verified_at?
  reviewer?
  policy_version
}
```

------------------------------------------------------------------------

# 499. Verification Rules

Rules vary by claim type and publication risk.

Examples:

``` text
ordinary road flooding:
credible independent corroboration may be sufficient for qualified publication

evacuation order:
prefer/require authorized official source

death/injury count:
stronger verification and source attribution

dam failure:
high-risk verification + human/authority gate

chemical release:
high-risk verification + authority/emergency source

weather observation:
official/sensor provenance where available
```

Never convert a general news report into an official order.

------------------------------------------------------------------------

# 500. Publication Risk Classes

``` text
LOW
MEDIUM
HIGH
CRITICAL_OFFICIAL
```

Typical interpretation:

### LOW

Low-consequence public context; strong automated checks may permit
automatic publication.

### MEDIUM

Developing event; requires corroboration threshold and/or review
depending on policy.

### HIGH

Potentially life-safety changing: - casualty count; - evacuation; -
dam/bridge failure; - hospital unavailable; - chemical/hazmat; - major
infrastructure failure; - severe route closure affecting evacuation.

Requires stronger evidence and usually human/authorized review.

### CRITICAL_OFFICIAL

Official alerts/orders/statements.

Preserve official provenance and semantics. AI may summarize for
accessibility but MUST NOT make an AI-generated statement appear to be
the original official alert.

------------------------------------------------------------------------

# 501. Publication Decision

``` text
PublicationDecision {
  decision_id
  candidate_or_claim_refs[]
  risk_class

  decision:
    AUTO_PUBLISH |
    REQUIRE_REVIEW |
    HOLD |
    REJECT |
    PUBLISH_QUALIFIED

  reason_codes[]
  evidence_snapshot_ref
  policy_version
  decided_at
  decided_by:
    POLICY |
    HUMAN |
    AUTHORIZED_SOURCE
}
```

------------------------------------------------------------------------

# 502. Qualified Publication

Some useful information can be published while uncertainty remains, if
policy permits.

Example:

``` text
มีรายงานหลายแหล่งว่าถนนบริเวณ X มีน้ำท่วม
ข้อมูลระดับน้ำยังอยู่ระหว่างการตรวจสอบ
อัปเดตล่าสุด 10:35
```

Do not rewrite this as:

``` text
ถนน X น้ำสูง 80 ซม.
```

unless the 80 cm claim itself passes verification.

------------------------------------------------------------------------

# 503. Human Review Queue

Command Center / editorial review SHOULD show:

``` text
Priority
Risk
Event
Claim
Location
Sources
Independent Sources
Official Confirmation
Conflict
Freshness
Suggested Decision
Reviewer
Age
```

Reviewer actions:

``` text
Publish
Publish with qualification
Hold
Request more evidence
Reject
Correct existing publication
Retract
Escalate
```

------------------------------------------------------------------------

# 504. News Watch Administration Table

Example:

``` text
Watch                 Schedule  Keywords         Last Run  Candidates  Verified  Held  Next Run
------------------------------------------------------------------------------------------------
Chiang Mai Flood      5 min     น้ำท่วม,น้ำปิง... 10:30     18          7        3     10:35
Thailand Earthquake   15 min    แผ่นดินไหว...     10:25      4          2        0     10:40
Wildfire North        adaptive  ไฟป่า,PM2.5...    10:31     12          5        1     adaptive
```

Additional columns/filters: - provider/search cost; - credits
consumed; - source failures; - duplicate ratio; - review backlog; -
publication count; - corrections/retractions.

------------------------------------------------------------------------

# 505. Watch Detail UI

Sections:

``` text
Overview
Queries / Keywords
Sources
Schedule / Triggers
Candidates
Claims
Verification
Publication Rules
Cost / Budget
History / Audit
```

Operators can test a query in preview before activating it.

------------------------------------------------------------------------

# 506. Query Preview / Simulation

Before activating new keywords:

``` text
query plan
→ dry-run search
→ candidate sample
→ estimated provider calls/cost
→ duplicate/noise estimate
→ source distribution
→ geographic relevance
```

Dry run MUST NOT auto-publish.

------------------------------------------------------------------------

# 507. Search Budget

Every watch has bounded resources:

``` text
SearchBudget {
  watch_id
  max_queries_per_window
  max_provider_cost
  max_sponsored_credits?
  max_parallel_queries
  max_deep_fetches
  max_ai_enrichment
}
```

Search discovery cannot consume unlimited Sponsored Credits.

Life-safety official-source monitoring may use protected policy separate
from optional enrichment.

------------------------------------------------------------------------

# 508. Search Query Planner Skill

Skill:

``` text
news.watch.plan_queries
```

Inputs: - event; - geography; - hazard; - current claims; - known
sources; - languages; - budget.

Outputs: - bounded query set; - rationale; - expected source types; -
exclusions; - estimated cost.

Planner output is advisory until policy admits execution.

------------------------------------------------------------------------

# 509. Skill-First Capability Set

Recommended logical Skills:

``` text
news.watch.plan_queries
news.search
news.retrieve
news.normalize
news.cluster
news.detect_syndication

claim.extract
claim.link_evidence
claim.check_corroboration
claim.detect_conflict
claim.verify

source.identify
source.assess_independence
source.check_authority_scope

publication.classify_risk
publication.review
publication.publish
publication.update
publication.correct
publication.retract
```

Skills are discoverable capabilities.

Execution authority remains with SmartAIHub policy/orchestration.

------------------------------------------------------------------------

# 510. Background Intelligence Integration

Reuse the existing background research/intelligence flow:

``` text
News Watch
→ worker_jobs
→ retrieval/search capabilities
→ EventCandidate
→ Situation Fusion Engine
→ Evidence Graph
→ verification
→ public projection
```

No duplicate news-only queue authority is required.

Queues may be workload-class isolated according to existing surge
architecture.

------------------------------------------------------------------------

# 511. Situation Graph Integration

Verified/qualified news does not live in an isolated news database
conceptually.

It contributes evidence to:

``` text
HazardEvent
Observation
Situation
AccessibilityEdge
InfrastructureStatus
Alert
Incident context
Journey impact
```

Every derived operational fact retains provenance back to
claims/evidence.

------------------------------------------------------------------------

# 512. Publication Artifact

``` text
PublicSituationPublication {
  publication_id
  event_id?
  title
  summary
  verified_claim_refs[]
  qualified_claim_refs[]
  source_attributions[]
  geography
  published_at
  updated_at
  publication_state
  revision
  policy_version
}
```

Do not include unsupported claims merely because they appeared in the
same article.

------------------------------------------------------------------------

# 513. Publication Lifecycle

``` text
DRAFT
→ REVIEW
→ PUBLISHED
→ UPDATED
→ CORRECTED
→ RETRACTED
→ ARCHIVED
```

Correction/retraction appends history.

Never silently rewrite a material public safety statement.

------------------------------------------------------------------------

# 514. Correction Record

``` text
PublicationCorrection {
  correction_id
  publication_id
  previous_revision
  new_revision
  affected_claims[]
  correction_reason
  corrected_at
  reviewer/policy
}
```

Public UI SHOULD visibly identify material corrections.

------------------------------------------------------------------------

# 515. Retraction

Retraction does not delete history.

Public representation:

``` text
ข้อมูลนี้ถูกถอนเมื่อ 11:20
เหตุผล: แหล่งข้อมูลต้นทางแก้ไขข้อมูล
ดูข้อมูลฉบับล่าสุด
```

Exact wording follows product/editorial policy.

------------------------------------------------------------------------

# 516. Source Correction Propagation

If a source: - corrects article; - retracts article; - changes casualty
number; - changes evacuation scope;

SmartAIHub SHOULD: 1. detect material source revision where supported;
2. re-evaluate affected claims; 3. identify derived
publications/situation facts; 4. trigger re-verification; 5.
correct/retract public projections where necessary; 6. notify
operators/subscribers if materially safety-relevant.

------------------------------------------------------------------------

# 517. Conflicting Sources

When credible sources conflict:

``` text
DO NOT force one value merely to simplify UI.
```

Store competing claims/evidence.

Example:

``` text
แหล่ง A รายงานระดับน้ำ 60 ซม.
แหล่ง B รายงาน 90 ซม.
เวลาหรือจุดวัดอาจแตกต่างกัน
ข้อมูลกำลังตรวจสอบ
```

Situation Fusion may resolve when geography/time/evidence clarifies the
difference.

------------------------------------------------------------------------

# 518. Official Source Scope

An official source is authoritative only within its relevant scope.

Examples: - local authority may be authoritative for local evacuation
order; - weather agency for meteorological warning; - hospital for its
facility status; - police for road/security closure within jurisdiction.

`OFFICIAL` is not a universal truth flag.

------------------------------------------------------------------------

# 519. Social / Citizen Source Handling

Social/public posts can provide valuable early signals.

They SHOULD: - create observations/event candidates; - retain
source/time/location context; - be corroborated where consequential; -
not be treated as verified solely due virality; - respect
privacy/licensing/platform terms; - avoid exposing private individuals
unnecessarily.

Virality is not verification.

------------------------------------------------------------------------

# 520. Media Verification

Image/video attached to news/report may support claims.

Checks MAY include: - capture/upload time consistency; - geolocation
where available; - duplicate/reused media detection; - known old-event
reuse; - visual-landmark consistency; - weather/environment
consistency; - source provenance.

AI media analysis remains evidence assistance, not sole high-risk
verification authority.

------------------------------------------------------------------------

# 521. Misinformation / Rumor Handling

Do not create a permanent citizen "truth score".

Instead classify specific content/claim:

``` text
UNVERIFIED
CONFLICTING
CORROBORATED
DISPUTED
RETRACTED
```

Public rumor-control page MAY explain verified corrections with
evidence/provenance.

Avoid amplifying harmful false claims unnecessarily.

------------------------------------------------------------------------

# 522. Publication Freshness

Every public item should have:

``` text
published_at
last_verified_at
freshness_state
next_review_due?
```

A previously verified claim can become stale.

Stale public safety information SHOULD be marked, refreshed, downgraded
or removed from active projection according to policy.

------------------------------------------------------------------------

# 523. Material Change Detection

Do not republish every minor article edit.

Materiality examples: - severity changed; - affected geography
changed; - evacuation status changed; - casualty count changed; - road
reopened/closed; - shelter opened/closed; - official warning
upgraded/cancelled; - forecast materially changed.

Material change can trigger publication update and notifications.

------------------------------------------------------------------------

# 524. Notification Boundary

News publication does not automatically imply push notification.

Separate:

``` text
PUBLICATION DECISION
from
NOTIFICATION DECISION
```

Notification policy evaluates: - severity; - geography; - subscriber
relevance; - freshness; - materiality; - alert fatigue; - official
status.

------------------------------------------------------------------------

# 525. Public Attribution

Public summaries SHOULD link/attribute source appropriately according to
licensing.

Do not copy long source text.

Use: - concise derived summary; - claim-level provenance; - source
name; - source timestamp; - link/reference where permitted.

------------------------------------------------------------------------

# 526. Search Provider Abstraction

Search/retrieval MUST be provider-independent.

``` text
SearchProvider {
  search(query, filters, budget)
  fetch(ref)
  metadata(ref)
}
```

Possible providers can change over time.

Watch logic should not be hardcoded to one commercial search/news API.

------------------------------------------------------------------------

# 527. Search Provider Failure

If one provider fails: - use approved fallback within budget; -
reduce/defer optional enrichment; - continue official-source direct
monitoring where configured; - expose degraded state; - do not fabricate
"no news" from provider failure.

`NO_RESULT` and `SEARCH_UNAVAILABLE` are distinct.

------------------------------------------------------------------------

# 528. Licensing / Retention Boundary

For each source/provider record: - allowed caching duration; - allowed
derived summaries; - attribution requirement; - redistribution
restriction; - raw content retention; - deletion obligations where
applicable.

Evidence graph can retain permissible metadata/provenance even when full
cached content must expire.

------------------------------------------------------------------------

# 529. Security / Prompt Injection Boundary

Retrieved web/news content is untrusted input.

Requirements: - treat embedded instructions as content, not system
commands; - isolate retrieval from execution authority; - no source text
can grant tools/spend/publication permission; - sanitize links/markup; -
structured extraction boundary; - publication requires policy gate after
AI processing.

------------------------------------------------------------------------

# 530. Watch Ownership and Tenant Boundary

Watch may be: - platform public-safety; - tenant-specific; -
organization-specific; - incident-specific.

Tenant watch cannot automatically publish into platform-wide public
emergency surface.

Cross-tenant sharing requires explicit policy and provenance.

------------------------------------------------------------------------

# 531. Cost Attribution

Search/news costs may be paid by: - platform public-safety budget; -
Sponsor Pool; - tenant; - organization; - user-paid research; - external
program.

Payer policy is explicit.

Public emergency information MUST NOT become inaccessible solely because
optional deep-research budget is exhausted.

------------------------------------------------------------------------

# 532. News Review SLO

System SHOULD track: - candidate age; - high-risk review backlog; -
time-to-first-verification; - time-to-correction; - source retrieval
latency; - duplicate ratio; - false/invalid candidate rate; -
publication-to-correction ratio.

SLO targets are deployment-specific and should not be invented without
operational evidence.

------------------------------------------------------------------------

# 533. News Intelligence Dashboard

Command Center metrics:

``` text
Active Watches
Search Health
Candidates / hour
High-Risk Awaiting Review
Verified Claims
Conflicting Claims
Published Updates
Corrections
Retractions
Provider Cost
Sponsored Credits Used
Review Backlog Age
```

High-risk old queue items receive visible escalation.

------------------------------------------------------------------------

# 534. Approval Policy Examples

``` text
LOW + corroborated + fresh
→ auto-publish may be allowed

MEDIUM + 2 independent credible sources
→ qualified auto-publish or review by policy

HIGH
→ human/authorized review

CRITICAL_OFFICIAL
→ verify official provenance
→ preserve official semantics
→ publish according to alert policy
```

These are policy patterns, not universal source-count rules.

------------------------------------------------------------------------

# 535. Scheduled Search Example

``` text
Watch: Chiang Mai Flood
Hazard: FLOOD
Area: Chiang Mai
Languages: th, en

Seed terms:
น้ำท่วม, น้ำปิง, น้ำล้นตลิ่ง, อพยพ,
ถนนตัดขาด, สะพานขาด, flood, evacuation

Normal cadence: 30 min
Active-event cadence: 5 min

Source priority:
official authority
weather/water authority
local government
established/local news
verified NGO
public/citizen signal

Budget:
bounded queries/run
bounded deep fetches
bounded AI claim extraction
```

------------------------------------------------------------------------

# 536. Event-Triggered Search Example

``` text
10 citizen observations cluster:
"bridge X cannot pass"

Situation Fusion
→ creates material EventCandidate
→ triggers bounded News Watch refresh:
  "bridge X"
  "road number"
  district
  local authority
  closure/collapse/flood terms

Search results
→ cluster
→ claims
→ verification
→ operator/publication policy
```

This improves intelligence without blindly searching the entire web.

------------------------------------------------------------------------

# 537. High-Risk Publication Example

Retrieved reports:

``` text
Source A: "dam has broken"
Source B: copies Source A
Social posts: viral reposts
Official dam authority: no confirmation
```

System should recognize weak source independence.

Result:

``` text
HOLD / REQUIRE_REVIEW
```

not:

``` text
PUBLIC: Dam failure confirmed
```

If official warning later confirms: - claim verification updates; -
public publication can be revised; - alert workflow can activate
according to policy.

------------------------------------------------------------------------

# 538. Claim-Level Partial Publication Example

Article says: 1. road flooding observed; 2. water 80 cm; 3. 7
casualties.

Evidence: - road flooding: corroborated; - 80 cm: one source only; -
casualties: conflicting.

Public output may state:

``` text
มีรายงานที่ตรวจสอบสอดคล้องกันว่าถนน X มีน้ำท่วม
ระดับน้ำและจำนวนผู้ได้รับผลกระทบยังอยู่ระหว่างตรวจสอบ
```

This is preferable to suppressing all useful information or publishing
all claims as fact.

------------------------------------------------------------------------

# 539. Acceptance / Negative Tests --- News Watch & Publication

Implementation MUST prove:

1.  retrieved article does not automatically become public;
2.  AI summary does not become official alert;
3.  watch uses existing scheduler/orchestration authority;
4.  duplicate scheduler authority is not created;
5.  fixed schedule can run idempotently;
6.  adaptive schedule is budget bounded;
7.  event trigger cannot create unbounded search storm;
8.  AI-generated keyword remains proposed until policy allows
    activation;
9.  exclusion terms are applied;
10. multilingual/geographic terms can be versioned;
11. search provider outage is not represented as "no incident";
12. duplicate articles are clustered without deleting originals;
13. syndicated copies do not count as fully independent corroboration;
14. one article can produce claims with different verification states;
15. extraction confidence is not treated as verification confidence;
16. official source is evaluated within authority scope;
17. virality is not verification;
18. high-risk claim cannot bypass required review;
19. low-risk auto-publication still records evidence/policy decision;
20. casualty claim can remain held while road-flood claim is published;
21. conflicting credible claims remain represented;
22. source correction triggers affected-claim re-evaluation;
23. material public correction preserves revision history;
24. retraction does not silently delete history;
25. stale verified claim is not displayed indefinitely as current;
26. publication and notification decisions are separate;
27. retrieved page cannot prompt-inject tool/spend/publication
    authority;
28. raw source content follows licensing/retention policy;
29. public summary does not reproduce full copyrighted article;
30. tenant watch cannot publish platform-wide without authorization;
31. search budget limits provider calls;
32. deep enrichment can degrade without disabling core public safety
    information;
33. sponsored search spend requires SponsoredSpendAuthority;
34. query preview performs no public publication;
35. human reviewer can request more evidence;
36. public item retains source attribution/provenance;
37. correction updates dependent public projection;
38. material update can trigger subscriber re-evaluation;
39. review backlog age is observable;
40. news pipeline failure cannot mutate canonical incident facts without
    evidence/policy path.

------------------------------------------------------------------------

# 540. Production Gate --- News Watch, Verification & Publication

Before enabling autonomous/scheduled news publication:

-   Watch scheduler integration test;
-   query budget/rate-limit test;
-   keyword proposal/approval test;
-   source-policy test;
-   provider outage/fallback test;
-   duplicate/syndication test;
-   claim extraction test;
-   independent-source corroboration test;
-   official-scope test;
-   high-risk human-gate test;
-   qualified publication test;
-   correction/retraction propagation test;
-   stale-publication test;
-   prompt-injection isolation test;
-   licensing/attribution review;
-   tenant publication boundary test;
-   Sponsored Credit spend-authority test;
-   surge/backlog test.

Mandatory scenario:

``` text
flood incident becomes active
→ adaptive watch changes 30 min → 5 min
→ keyword planner adds local river/road terms
→ multiple articles retrieved
→ 6 are copies of one upstream report
→ claim extraction finds:
   road flooding,
   80 cm depth,
   evacuation,
   casualty count
→ road flooding corroborated
→ depth uncertain
→ evacuation verified from local authority
→ casualty sources conflict
→ system publishes only verified/qualified claims
→ later official correction arrives
→ affected claim/publication is corrected
→ subscriber notification is re-evaluated
→ complete evidence/revision/audit history remains
```

**End of Spec 260 R1.26 --- News Watch, Claim Verification & Controlled
Public Publication**

# 541. Review Passes 251--260 --- News Integrity, Source Authenticity and Publication Safety

Passes 251--260 extend the cumulative review. All fixes below are
normative R1.27 requirements.

## Pass 251 --- Breaking-News Race / Conflicting First Reports

**Gap:** During a fast-moving incident, several credible outlets may
publish incompatible early facts within minutes.

**Fix:** - Preserve temporal claim versions instead of selecting a
premature winner. - Verification considers `claim_event_time`,
`source_published_at`, `retrieved_at`, and correction history. -
Early-source precedence is NOT evidence of correctness. - Public
projection may explicitly state that information is developing. -
High-impact numeric claims (casualties, missing persons, evacuation
population) use stronger change/review policy. - Later official
confirmation does not erase earlier evidence; it supersedes the active
claim projection with provenance.

## Pass 252 --- Headline / Body / Metadata Mismatch

**Gap:** Search snippets or headlines may be sensational, stale,
truncated, or inconsistent with article body.

**Fix:** - Do not verify high-risk claims from headline/snippet alone
when full authoritative content is required. - Store extraction origin:
headline, snippet, body, structured metadata, official feed. - Detect
material mismatch. - Publication uses the strongest accessible
evidence. - If body is unavailable, qualify evidence limitation. -
Search engine snippet is discovery evidence, not equivalent to publisher
confirmation.

## Pass 253 --- Silent Article Mutation / Revision Detection

**Gap:** Publishers can edit an article at the same URL without an
explicit correction marker.

**Fix:** - Track content hash/version where permitted. - Detect material
source revision. - Preserve permissible previous
metadata/hash/provenance. - Re-run affected claim
extraction/verification on material change. - Link source revision to
downstream publications/situation facts. - Do not treat cosmetic edits
as emergency updates.

## Pass 254 --- Paywall / Robots / Licensing / Access Boundary

**Gap:** The system may discover a source that it is not allowed or able
to fully retrieve/store.

**Fix:** - Respect provider terms, robots/access rules where applicable,
licensing and retention policy. - `DISCOVERED_BUT_NOT_RETRIEVABLE` is a
valid state. - Do not bypass paywalls/access controls. - Do not
fabricate body content from headline. - Use alternative lawful
sources/corroboration. - Store only permitted metadata/derived
facts/provenance. - Publication attribution follows license
requirements.

## Pass 255 --- Source Impersonation / Domain Authenticity

**Gap:** Fake domains/accounts may imitate authorities or news outlets.

**Fix:** - Source identity resolution includes canonical
domain/account/feed identifiers. - Official-source registry can store
verified authority endpoints. - Similar display name/logo is
insufficient. - Redirect/domain changes require controlled update. -
TLS/domain alone does not prove institutional authority. - High-risk
official claims require authenticated/registered source path or human
validation according to policy.

## Pass 256 --- Geographic Ambiguity / Same-Name Places

**Gap:** News may mention identical place names or vague landmarks.

**Fix:** - Geographic entity resolution stores candidate locations and
confidence. - Do not auto-attach a claim to active disaster merely
because place text matches. - Use
country/province/district/context/source scope/coordinates where
available. - Ambiguous high-impact claim remains held/qualified. -
Publication displays appropriate location precision. -
Cross-border/same-name collisions have tests.

## Pass 257 --- Cross-Language Duplicate / Translation Drift

**Gap:** Thai/English/local-language articles may describe the same
source event, causing false independent corroboration or translation
distortion.

**Fix:** - Cross-language semantic clustering. - Detect
translated/syndicated copies where possible. - Preserve
original-language claim. - Translation becomes derived evidence with
model/version. - Critical numeric/unit/proper-noun claims receive
consistency checks. - Independent-source count is based on provenance,
not language count. - Public translation must not strengthen certainty
beyond original source.

## Pass 258 --- Reviewer Conflict / Separation of Editorial Duties

**Gap:** A reviewer may have organizational, sponsor, source or
operational conflicts.

**Fix:** - High-risk review supports reviewer identity and conflict
declaration. - Configurable policy may require second reviewer for
selected claim classes. - Sponsor cannot purchase editorial approval. -
Source owner/tenant cannot automatically approve platform-wide
publication about itself when policy requires independent review. -
Emergency speed is preserved through bounded escalation/break-glass with
audit. - Review override records reason and evidence snapshot.

## Pass 259 --- Publication Rollback / Dependency Propagation

**Gap:** A wrong public claim may already have propagated into map
cards, summaries, notifications, travel warnings or cached products.

**Fix:** - Maintain dependency graph from claim → publication → derived
products/notifications. - Correction/retraction invalidates affected
derived projections. - Cache purge/invalidation is scoped and
versioned. - Already-sent notification cannot be "unsent"; issue
correction notification when materially necessary. - Corrected
route/travel advice is re-evaluated. - Rollback never deletes
audit/evidence history.

## Pass 260 --- Search Poisoning / SEO Spam / Coordinated Manipulation

**Gap:** Adversaries can flood search results with duplicated SEO pages,
keyword-stuffed content or coordinated false reports.

**Fix:** - Search rank is not verification rank. - Detect source/domain
concentration, near-duplicate bursts and suspicious syndication. - Bound
contribution from one provenance cluster. - Corroboration favors
independent evidence. - New/unknown sources can generate candidates but
not bypass verification. - Keyword planner cannot be steered solely by
malicious retrieved instructions/content. - Search poisoning signals may
reduce automation confidence and escalate review, not create permanent
person-level trust scores.

------------------------------------------------------------------------

# 542. Temporal Claim Version

``` text
TemporalNewsClaim {
  claim_id
  claim_family_id
  value
  event_time?
  valid_from?
  valid_until?
  source_published_at?
  retrieved_at
  verification_state
  supersedes_claim_id?
}
```

Example:

``` text
10:05 — "2 injured" — early local report
10:20 — "5 injured" — hospital statement
10:40 — "4 hospitalized, 1 treated on scene" — official clarification
```

The system preserves all three and exposes the currently supported
interpretation.

------------------------------------------------------------------------

# 543. Extraction Origin

``` text
ClaimExtractionOrigin {
  claim_id
  retrieval_id
  origin:
    HEADLINE |
    SEARCH_SNIPPET |
    ARTICLE_BODY |
    STRUCTURED_METADATA |
    OFFICIAL_FEED |
    TRANSCRIPT |
    MEDIA_DERIVED
  locator?
  extraction_model_or_rule
}
```

High-risk publication policy can require body/official-feed evidence.

------------------------------------------------------------------------

# 544. Source Revision

``` text
SourceRevision {
  source_ref
  revision_id
  content_hash?
  observed_at
  materiality:
    COSMETIC |
    MINOR |
    MATERIAL |
    UNKNOWN
  changed_claim_refs[]
}
```

Only retain source content/version bytes where licensing permits.

------------------------------------------------------------------------

# 545. Retrieval Availability State

``` text
AVAILABLE
METADATA_ONLY
DISCOVERED_BUT_NOT_RETRIEVABLE
PAYWALLED
ACCESS_RESTRICTED
REMOVED
LICENSE_EXPIRED
FETCH_FAILED
```

`FETCH_FAILED` != `SOURCE_FALSE`.

------------------------------------------------------------------------

# 546. Official Source Registry

``` text
OfficialSourceRegistryEntry {
  authority_id
  authority_name
  jurisdiction
  authority_scope[]
  canonical_domains[]
  canonical_accounts[]
  official_feeds[]
  verification_method
  valid_from
  valid_until?
  status
  reviewed_at
}
```

Registry changes are audited.

------------------------------------------------------------------------

# 547. Source Authenticity Decision

``` text
SourceAuthenticityDecision {
  source_ref
  claimed_identity
  matched_registry_entry?
  authenticity_state:
    VERIFIED_ENDPOINT |
    LIKELY |
    UNKNOWN |
    CONFLICTING |
    IMPERSONATION_SUSPECTED
  evidence_refs[]
  decided_at
  decision_method
}
```

Do not publicly accuse a source of impersonation solely from weak
automated inference.

------------------------------------------------------------------------

# 548. Geographic Resolution

``` text
ClaimGeoResolution {
  claim_id
  raw_place_text
  candidates[]
  selected_location?
  confidence
  resolution_evidence[]
  state:
    RESOLVED |
    AMBIGUOUS |
    UNRESOLVED
}
```

High-risk ambiguous geography blocks precise map placement.

------------------------------------------------------------------------

# 549. Cross-Language Claim Link

``` text
CrossLanguageClaimLink {
  original_claim_id
  derived_claim_id
  source_language
  target_language
  translation_model_or_service
  translation_version
  semantic_consistency
  numeric_consistency
  entity_consistency
}
```

Original-language provenance remains primary.

------------------------------------------------------------------------

# 550. Review Assignment

``` text
PublicationReviewAssignment {
  review_id
  risk_class
  claim_refs[]
  assigned_reviewer?
  reviewer_org?
  conflict_declared?
  second_review_required
  escalation_deadline?
  state
}
```

Reviewer inactivity can escalate; it does not silently auto-approve
high-risk content.

------------------------------------------------------------------------

# 551. Publication Dependency Graph

``` text
VerifiedClaim
→ PublicSituationPublication
→ MapFeature
→ SituationBrief
→ Notification
→ JourneyWarning
→ CachedSituationProduct
```

Each derived product records source publication/claim revision where
material.

------------------------------------------------------------------------

# 552. Correction Propagation Job

``` text
CorrectionPropagation {
  correction_id
  root_claim_or_publication
  affected_dependencies[]
  actions:
    INVALIDATE |
    RECOMPUTE |
    REPUBLISH |
    CORRECTION_NOTIFY |
    MANUAL_REVIEW
  state
  started_at
  completed_at?
}
```

Execution uses existing worker_jobs/orchestration authority.

------------------------------------------------------------------------

# 553. Correction Notification Policy

Send correction notification only when: - prior notification was
materially wrong/outdated; - recipient remains affected/relevant; -
correction changes safety action or important fact; - policy allows
contact.

Avoid notification storms for minor editorial changes.

------------------------------------------------------------------------

# 554. Search Manipulation Signals

``` text
SearchManipulationSignals {
  query_run_id
  domain_concentration
  near_duplicate_ratio
  provenance_cluster_count
  new_domain_burst
  keyword_stuffing_signal
  coordinated_timing_signal
  confidence
}
```

Signals affect review/automation policy, not person-level punishment.

------------------------------------------------------------------------

# 555. Provenance Diversity

Corroboration should consider:

``` text
publisher diversity
upstream-origin diversity
authority diversity
sensor/citizen/news diversity
geographic proximity
temporal independence
```

Simple `source_count >= N` is insufficient.

------------------------------------------------------------------------

# 556. Search Result Admission

Search results pass through:

``` text
provider result
→ URL/source normalization
→ source identity
→ safety/access/license check
→ dedup/provenance cluster
→ retrieval admission
→ claim extraction
```

Search provider rank never directly sets claim verification.

------------------------------------------------------------------------

# 557. Public Breaking-News Label

For rapidly changing events, public UI MAY show:

``` text
กำลังพัฒนา
ตรวจสอบล่าสุด 10:42
ข้อมูลบางส่วนอาจเปลี่ยนแปลงเมื่อมีการยืนยันเพิ่มเติม
```

This is preferable to false certainty.

------------------------------------------------------------------------

# 558. Numeric Claim Guard

High-impact numbers require explicit unit/context:

``` text
value
unit
population/reference set
geography
as_of time
source
verification state
```

Examples: - 80 cm water depth at which point? - 7 injured vs 7
hospitalized? - 5,000 evacuated vs 5,000 advised to evacuate?

Do not compare incompatible quantities.

------------------------------------------------------------------------

# 559. Headline Safety Rule

For HIGH / CRITICAL_OFFICIAL claims:

``` text
headline/snippet-only evidence
→ cannot by itself satisfy final verification
```

Exception only when the source itself is an authenticated structured
official alert/feed whose headline/title is the canonical alert payload
according to source contract.

------------------------------------------------------------------------

# 560. Paywall Safety Example

``` text
Search result:
"Hospital X evacuated after chemical leak"

Body inaccessible due subscription.

System:
- records discovery metadata;
- does NOT invent details;
- searches official hospital/emergency agency and independent lawful sources;
- may create high-risk EventCandidate;
- publication waits for sufficient evidence.
```

------------------------------------------------------------------------

# 561. Cross-Language Corroboration Example

``` text
Thai outlet A publishes report.
English outlet B translates A.
Aggregator C republishes B.

Naive count: 3 sources.
Actual independent provenance: 1 upstream report.
```

System MUST avoid counting this as three independent confirmations.

------------------------------------------------------------------------

# 562. Reviewer Independence Example

A sponsor company operates infrastructure involved in an incident.

Its sponsorship status: - does not suppress reporting; - does not grant
publication approval; - does not grant access to victim data; - does not
change verification threshold.

Conflict can be declared/escalated to independent reviewer.

------------------------------------------------------------------------

# 563. Publication Rollback Example

``` text
10:00 publication:
"Bridge X closed"

Derived:
- map marks CLOSED
- journey reroutes users
- push notification sent

10:20 official correction:
"Bridge remains open; adjacent road is closed"
```

Required: - correct claim; - update publication; - invalidate bridge
closure MapFeature; - recompute affected journeys; - update situation
brief; - send correction notification where materially relevant; -
retain original revision and reason.

------------------------------------------------------------------------

# 564. Search Poisoning Example

Hundreds of new domains repeat:

``` text
"Dam X collapsed"
```

but all trace to one unverified social post.

System: - clusters provenance; - recognizes concentration; - does not
treat volume as independent corroboration; - raises high-risk review; -
seeks official/sensor/independent evidence.

------------------------------------------------------------------------

# 565. News Integrity Operator Controls

Operators SHOULD have: - pause watch; - pause auto-publication while
keeping retrieval; - require human review for all claims; -
block/restrict a compromised source endpoint; - re-run verification; -
force source-registry refresh; - inspect provenance graph; - trigger
correction propagation; - inspect search manipulation signals.

Controls are scoped and audited.

------------------------------------------------------------------------

# 566. News Integrity Observability

Track: - headline/body mismatch rate; - source revision rate; -
inaccessible/paywalled discovery rate; - source-authenticity failures; -
geo ambiguity rate; - cross-language duplicate rate; - high-risk
second-review backlog; - correction propagation latency; - stale
dependency count; - provenance concentration; - search manipulation
alerts.

Metrics do not replace evidence.

------------------------------------------------------------------------

# 567. R1.27 Additional Acceptance / Negative Tests

Implementation MUST prove:

1.  earliest report is not automatically treated as most correct;
2.  conflicting breaking-news values can coexist with temporal
    provenance;
3.  later official claim supersedes active projection without deleting
    earlier evidence;
4.  headline-only high-risk claim cannot pass ordinary final
    verification;
5.  search snippet is tagged as snippet origin;
6.  headline/body mismatch is detectable;
7.  same URL material edit triggers re-verification;
8.  cosmetic edit does not trigger unnecessary emergency notification;
9.  paywall is not bypassed;
10. inaccessible body is not hallucinated;
11. metadata-only source can remain an EventCandidate;
12. fake display name/logo cannot establish official identity;
13. official endpoint is checked against registry/policy;
14. registry change is audited;
15. ambiguous same-name geography does not create precise map marker;
16. unresolved high-risk geography is held/qualified;
17. translated copy does not count as independent source by language
    alone;
18. critical number survives translation consistency check;
19. translation cannot strengthen original uncertainty;
20. high-risk reviewer can declare conflict;
21. sponsor cannot approve favorable publication merely because it funds
    pool;
22. required second review cannot be silently skipped;
23. break-glass editorial override records reason/evidence;
24. correction identifies dependent MapFeature;
25. correction invalidates affected cached product;
26. materially wrong sent notification can generate correction notice;
27. minor copy edit does not create correction storm;
28. corrected journey warning is recomputed;
29. search rank does not set verification confidence;
30. 100 duplicate domains from one upstream claim do not count as 100
    independent sources;
31. unknown source can create candidate but not bypass verification;
32. retrieved prompt injection cannot modify keyword/publication policy;
33. manipulation signal does not create permanent citizen trust score;
34. public breaking-news label exposes developing state;
35. numeric claim includes unit/context/as-of where required;
36. `FETCH_FAILED` is not interpreted as source falsehood;
37. source removal triggers appropriate evidence/publication review;
38. operator can pause auto-publication without stopping retrieval;
39. correction propagation uses existing orchestration authority;
40. all publication rollback actions preserve audit/history.

------------------------------------------------------------------------

# 568. R1.27 Production Gate

Promotion requires: - breaking-news conflict test; -
headline/snippet/body provenance test; - source silent-revision test; -
paywall/access-policy test; - official-source impersonation test; -
same-name geographic ambiguity test; - cross-language duplicate test; -
reviewer conflict/second-review test; - publication dependency rollback
test; - correction notification test; -
search-poisoning/provenance-concentration test; - prompt-injection
policy isolation test.

Mandatory scenario:

``` text
viral report claims a dam collapse
→ search returns 120 pages
→ 105 trace to one upstream social post
→ 8 are translations/aggregators
→ 5 are unrelated same-name locations
→ 2 credible outlets say "investigating"
→ official authority initially has no confirmation
→ high-risk claim is held
→ one article silently changes headline/body
→ official authority later confirms only a controlled spillway release
→ system resolves correct geography
→ rejects false independent-source count
→ publishes verified qualified update
→ invalidates any affected derived map/brief products
→ retains complete provenance and review history
```

**End of Spec 260 R1.27 --- 260-Pass Cumulative Review / News Integrity,
Source Authenticity & Publication Safety**

# 569. Review Passes 261--270 --- Source Continuity, Synthetic Media, Review Resilience and Provenance Defense

Passes 261--270 extend the cumulative review. All fixes below are
normative R1.28 requirements.

## Pass 261 --- Source Outage Does Not Mean Event Ended

**Gap:** An official/news source can disappear, fail, rate-limit, or
stop updating during the worst part of an incident.

**Fix:** - Model source health separately from event state. -
`SOURCE_UNAVAILABLE` MUST NOT imply `EVENT_RESOLVED`, `ROAD_OPEN`,
`ALERT_CANCELLED`, or `SAFE`. - Preserve last-known verified state with
freshness/staleness. - Seek approved alternate sources. - Public UI
labels stale/temporarily unavailable evidence. - Official alert
cancellation requires valid cancellation/expiry semantics, not mere feed
silence. - Source recovery triggers bounded catch-up/reconciliation.

## Pass 262 --- Compromised Official Feed / Account

**Gap:** A previously verified official endpoint can itself be
compromised.

**Fix:** - Official registry trust is necessary but not absolute. -
Detect anomalous content patterns, signing/auth failures, impossible
geography, abrupt scope change, or conflicting authoritative channels. -
High-impact anomalous official content can enter
`OFFICIAL_SOURCE_ANOMALY` and require secondary validation. - Do not
silently downgrade every official alert due generic anomaly heuristics;
apply risk-based policy. - Credential/feed compromise can revoke
endpoint while preserving historical provenance. - Re-enable only
through controlled registry/security review.

## Pass 263 --- Embargo / Future-Dated / Premature Publication

**Gap:** Retrieved material may be embargoed, scheduled, future-dated,
draft, or not yet authorized for public release.

**Fix:** - Store publication availability/embargo metadata when known. -
Retrieval permission does not imply public redistribution permission. -
Future-dated source is not automatically "current". - Embargoed content
cannot auto-publish before allowed time. - Emergency legal/public-safety
exceptions, if any, require explicit policy/legal authority. - Scheduler
uses server-authoritative time.

## Pass 264 --- Synthetic / AI-Generated / Manipulated Media

**Gap:** News evidence may contain generated or manipulated images,
audio or video.

**Fix:** - Media authenticity is a separate evidence dimension. - Use
provenance metadata/content credentials where available. - Check
reuse/known-old-media/context consistency. - AI/deepfake detector output
is probabilistic evidence, never sole truth authority. - High-risk
claims cannot be verified solely from unverified synthetic-looking
media. - AI-generated illustrative media must never be presented as
incident evidence. - Preserve distinction between
`DOCUMENTARY_EVIDENCE`, `ILLUSTRATION`, `AI_GENERATED`, `UNKNOWN`.

## Pass 265 --- Deleted / Removed Source and Evidence Durability

**Gap:** Source pages/posts may be deleted after publication.

**Fix:** - Source removal does not automatically erase prior evidence. -
Preserve legally permitted metadata, hashes, retrieval time,
citation/provenance and derived verification record. - Full cached
content retention follows license/privacy/legal policy. - Mark source
availability as removed. - Re-evaluate active high-risk claims if
removed source was essential evidence. - Do not imply deletion proves
the claim false.

## Pass 266 --- Cross-Channel Duplicate: News vs CAP vs Social vs Citizen Report

**Gap:** The same official warning can arrive through CAP, website, news
article, social account and citizen screenshots.

**Fix:** - Build cross-channel provenance linkage. - Prefer canonical
official alert identity when known. - Secondary channels can corroborate
delivery/visibility but should not multiply independent factual
authority. - Preserve channel-specific timestamps and delivery
evidence. - Avoid duplicate public cards/notifications for one
underlying alert. - Correction/cancellation from canonical source
propagates to derived channel representations.

## Pass 267 --- Legal Takedown / Privacy Removal vs Audit Preservation

**Gap:** Public content may require removal for privacy, legal, safety
or licensing reasons while operational audit must remain.

**Fix:** - Separate `PUBLIC_VISIBILITY` from `AUDIT_RETENTION`. -
Takedown hides/restricts public projection according to valid policy. -
Audit/economic/incident evidence remains according to retention/legal
basis. - Redaction may replace public artifact without rewriting
original audit chain. - Legal hold can prevent destructive deletion
where applicable. - Takedown authority, reason, scope and timestamp are
audited. - Victim privacy takedown does not imply factual retraction.

## Pass 268 --- Reviewer Overload / Surge Triage

**Gap:** During major disasters, hundreds of HIGH-risk claims can
overwhelm human reviewers.

**Fix:** - Review queue has
risk/materiality/affected-population/freshness priority. - Deduplicate
claims before human review. - Bundle related claims/evidence. - Route to
reviewers by jurisdiction/language/expertise. - Use bounded escalation
when SLA age grows. - LOW-risk optional publication may defer. -
Protected official alert path remains independent of editorial
backlog. - System MUST NOT silently auto-approve HIGH risk because queue
is long.

## Pass 269 --- Automated Correction Loop / Flapping

**Gap:** Conflicting sources can repeatedly flip a claim and trigger
endless map/publication/notification changes.

**Fix:** - Add correction hysteresis/materiality policy. - Distinguish
evidence update from active-public-state change. - Require stronger
evidence for repeated reversal where appropriate. - Suppress duplicate
correction notifications. - Preserve all revisions but avoid
UI/notification flapping. - Operator can freeze auto-public projection
for a claim while verification continues. - Official canonical update
can bypass ordinary hysteresis when policy requires immediate safety
action.

## Pass 270 --- Provenance Graph Poisoning / Cycles

**Gap:** Malicious or malformed source links can create circular
provenance or make derived summaries appear as independent primary
sources.

**Fix:** - Provenance graph is typed and cycle-aware. - Derived
SmartAIHub publication can never become independent evidence for its own
source claim. - Detect self-reference and circular citation. - Preserve
root/upstream origin where known. - Cap graph traversal depth/work to
prevent resource abuse. - Unknown ancestry lowers independence
confidence; it does not automatically mark content false. - Graph
mutations are append/audit based.

------------------------------------------------------------------------

# 570. Source Health

``` text
SourceHealth {
  source_ref
  state:
    HEALTHY |
    DEGRADED |
    RATE_LIMITED |
    UNAVAILABLE |
    AUTH_FAILURE |
    ANOMALOUS |
    REVOKED
  last_success_at?
  last_failure_at?
  last_verified_content_at?
  reason_codes[]
}
```

Source health is not event truth.

------------------------------------------------------------------------

# 571. Last-Known State Rule

When a source becomes unavailable:

``` text
last verified fact
+ freshness state
+ source-health warning
```

NOT:

``` text
missing feed
→ assume normal/safe
```

Example:

``` text
ถนน X: ปิด
ยืนยันล่าสุด 10:10
แหล่งข้อมูลไม่สามารถอัปเดตได้ตั้งแต่ 10:25
สถานะปัจจุบันกำลังตรวจสอบ
```

------------------------------------------------------------------------

# 572. Official Source Anomaly

``` text
OfficialSourceAnomaly {
  anomaly_id
  source_ref
  content_ref
  anomaly_types[]
  severity
  secondary_validation_refs[]
  state:
    OPEN |
    VALIDATED |
    FALSE_ALARM |
    SOURCE_REVOKED
  created_at
}
```

Possible anomaly types: - signature/auth mismatch; - out-of-jurisdiction
command; - impossible coordinates; - conflicting canonical feed; -
abrupt language/account behavior change; - suspicious redirect/domain
change.

------------------------------------------------------------------------

# 573. Publication Availability

``` text
PublicationAvailability {
  source_ref
  discovered_at
  source_published_at?
  public_release_at?
  embargo_until?
  availability_state:
    PUBLIC |
    EMBARGOED |
    FUTURE_SCHEDULED |
    PRIVATE_RESTRICTED |
    UNKNOWN
}
```

Unknown does not automatically mean embargoed.

------------------------------------------------------------------------

# 574. Media Authenticity Assessment

``` text
MediaAuthenticityAssessment {
  evidence_id
  media_role:
    DOCUMENTARY_EVIDENCE |
    ILLUSTRATION |
    AI_GENERATED |
    UNKNOWN

  provenance_credentials?
  metadata_consistency
  known_reuse_match?
  contextual_consistency
  synthetic_detection_signals[]
  assessment_state:
    SUPPORTED |
    UNCERTAIN |
    SUSPICIOUS |
    MANIPULATED_CONFIRMED
  assessed_at
}
```

Automated detector confidence MUST be retained as evidence, not
converted into absolute fact.

------------------------------------------------------------------------

# 575. Illustration Safety

If SmartAIHub generates explanatory imagery for a public page:

``` text
ภาพประกอบ / AI-generated illustration
```

must be visibly distinguishable where confusion with real incident
evidence is plausible.

Generated media MUST NOT enter documentary evidence graph as if captured
at scene.

------------------------------------------------------------------------

# 576. Removed Source Record

``` text
RemovedSourceRecord {
  source_ref
  last_available_at?
  removal_detected_at
  availability_state
  retained_metadata
  retained_hash?
  affected_claims[]
  revalidation_required
}
```

Retention follows applicable policy.

------------------------------------------------------------------------

# 577. Cross-Channel Provenance

``` text
CanonicalAlert/Event
├─ CAP feed
├─ authority website
├─ authority social post
├─ news report quoting authority
└─ citizen screenshot/share
```

These are multiple delivery channels, not necessarily multiple
independent factual sources.

------------------------------------------------------------------------

# 578. Cross-Channel Identity

``` text
CrossChannelSourceLink {
  link_id
  canonical_event_or_alert_ref
  channel_source_ref
  relationship:
    CANONICAL |
    MIRROR |
    QUOTE |
    REPOST |
    SCREENSHOT |
    DERIVED_SUMMARY
  confidence
}
```

------------------------------------------------------------------------

# 579. Public Takedown

``` text
PublicTakedown {
  takedown_id
  publication_or_evidence_ref
  scope:
    PUBLIC_ONLY |
    TENANT_PUBLIC |
    REGION_PUBLIC |
    ALL_NON_AUDIT_ACCESS
  reason_class:
    PRIVACY |
    LEGAL |
    LICENSING |
    SAFETY |
    SECURITY |
    OTHER
  authority_ref
  effective_at
  review_at?
}
```

A takedown is not necessarily a factual correction.

------------------------------------------------------------------------

# 580. Review Queue Priority

Conceptual factors:

``` text
life_safety_impact
affected_population
claim_risk_class
official_alert_relation
materiality
freshness
geographic relevance
dependency_count
queue_age
```

AI may assist prioritization but MUST NOT bury high-risk claims solely
due source popularity or sponsor status.

------------------------------------------------------------------------

# 581. Reviewer Routing

``` text
ReviewRouting {
  review_id
  required_languages[]
  required_jurisdiction?
  required_expertise[]
  independence_requirement?
  assigned_pool
  escalation_at?
}
```

Reviewer skills/capabilities can be represented through existing
Capability Registry where appropriate.

------------------------------------------------------------------------

# 582. Correction Hysteresis

Example:

``` text
Claim: Road X CLOSED

weak report says OPEN
→ evidence update only / keep CLOSED qualified

second strong independent source + official update says OPEN
→ change active projection to OPEN
```

This is policy-driven and claim-specific.

Never use hysteresis to delay authoritative emergency
cancellation/update that policy requires immediately.

------------------------------------------------------------------------

# 583. Claim Projection Freeze

Operator can:

``` text
freeze automatic public state changes
while continuing:
- retrieval;
- claim extraction;
- evidence accumulation;
- reviewer alerts.
```

Freeze is scoped, time-bounded where possible and audited.

It does not freeze official CAP handling unless explicitly authorized by
the relevant alert policy.

------------------------------------------------------------------------

# 584. Provenance Edge Types

``` text
ORIGINAL_REPORT
OFFICIAL_STATEMENT
QUOTES
REPOSTS
TRANSLATES
SUMMARIZES
DERIVES_FROM
SCREENSHOT_OF
CORROBORATES
CONTRADICTS
SUPERSEDES
CORRECTS
RETRACTS
```

Typed edges improve independence analysis.

------------------------------------------------------------------------

# 585. Provenance Cycle Rule

Invalid independence example:

``` text
News A cites SmartAIHub public summary
SmartAIHub summary cites News A
```

This is a cycle, not two-source corroboration.

Derived SmartAIHub output has `DERIVES_FROM` relation and cannot
increase independence count for its ancestors.

------------------------------------------------------------------------

# 586. Provenance Traversal Guard

``` text
max_depth
max_nodes
max_edges
timeout/budget
cycle_detection
```

If limit is reached:

``` text
ANCESTRY_INCOMPLETE
```

not false certainty.

------------------------------------------------------------------------

# 587. Source Catch-Up

After outage recovery:

``` text
source recovered
→ bounded lookback
→ retrieve missed revisions/alerts
→ dedup
→ reconcile claims
→ identify material missed changes
→ update/correct public products
```

Avoid unbounded backlog replay.

------------------------------------------------------------------------

# 588. Review Surge Mode

During reviewer overload:

``` text
P0: official life-safety alert integrity
P1: high-impact public safety claims
P2: operational closures/shelters/infrastructure
P3: general situation context
P4: optional/background stories
```

This prioritization is operational, not a truth score.

------------------------------------------------------------------------

# 589. Synthetic Media Public Label

If synthetic/illustrative media is intentionally public:

``` text
AI-generated illustration
Not incident evidence
```

Local-language equivalent should be prominent enough to avoid confusion.

------------------------------------------------------------------------

# 590. Source Deletion Example

``` text
10:00 local authority page says Bridge X closed
10:10 SmartAIHub verifies and publishes qualified closure
10:30 authority page disappears due website outage/migration
```

Do NOT immediately mark bridge open.

Instead: - source becomes unavailable/removed; - closure remains
last-known verified with aging freshness; - seek alternate
authority/field evidence; - revalidate.

------------------------------------------------------------------------

# 591. Compromised Official Account Example

Verified authority social account suddenly posts:

``` text
"Evacuate entire province immediately"
```

while: - CAP feed has no alert; - authority website is normal; -
geographic scope is implausible.

System: - detects high-risk official-source anomaly; - does not blindly
convert post into canonical evacuation order; - escalates secondary
verification; - preserves the suspicious post as evidence.

------------------------------------------------------------------------

# 592. Cross-Channel Duplicate Example

One CAP alert is: - mirrored on agency website; - tweeted by agency; -
quoted by 20 news sites.

The system should model: - one canonical official alert; - multiple
delivery/visibility channels; - news reports as downstream provenance.

It should not create 22 independent official alerts.

------------------------------------------------------------------------

# 593. Takedown vs Retraction Example

Photo exposes an injured person's identity.

Action: - public media takedown/redaction for privacy; - factual
incident claim may remain verified; - audit/evidence access follows
authorization/retention policy.

This is NOT equivalent to retracting the incident.

------------------------------------------------------------------------

# 594. Review Overload Example

500 claims enter queue after earthquake.

System: - clusters duplicates; - extracts shared evidence once; -
prioritizes evacuation/hospital/fire/bridge/casualty claims; - routes
Thai/Japanese/English items appropriately; - defers optional
human-interest stories; - never auto-approves HIGH claims merely to
reduce backlog.

------------------------------------------------------------------------

# 595. Correction Flapping Example

Three reports alternate Road X between OPEN/CLOSED every two minutes.

System: - retains all observations; - evaluates
provenance/time/location; - avoids repeated public/push flips on weak
evidence; - waits for stronger evidence according to policy; -
immediately honors authoritative closure/opening when applicable.

------------------------------------------------------------------------

# 596. R1.28 Additional Acceptance / Negative Tests

Implementation MUST prove:

1.  source outage does not resolve event;
2.  missing official feed does not cancel active alert;
3.  last-known verified state carries freshness;
4.  source recovery performs bounded catch-up;
5.  verified official endpoint can still enter anomaly review;
6.  auth/signature failure is distinguishable from content
    contradiction;
7.  suspected compromise does not delete historical provenance;
8.  revoked endpoint cannot generate new canonical official facts;
9.  embargoed content cannot auto-publish early;
10. future-dated source is not treated as current solely from date;
11. retrieval permission does not imply redistribution permission;
12. AI-generated illustration cannot become documentary evidence;
13. synthetic detector alone cannot prove high-risk claim false/true;
14. media role is explicit;
15. deleted source does not automatically invalidate prior fact;
16. source deletion triggers revalidation when essential;
17. removed source metadata retention follows policy;
18. CAP + website + social mirrors do not count as independent official
    alerts;
19. canonical alert cancellation propagates to mirrors/derived products;
20. public takedown does not erase audit record;
21. privacy takedown is distinguishable from factual retraction;
22. legal hold can prevent destructive deletion where policy requires;
23. reviewer overload does not auto-approve HIGH claims;
24. duplicate claims are clustered before review;
25. review routing can require language/jurisdiction expertise;
26. sponsor status does not raise review priority improperly;
27. correction hysteresis prevents weak flapping;
28. authoritative urgent update can bypass ordinary hysteresis;
29. duplicate correction push is suppressed;
30. projection freeze keeps evidence ingestion active;
31. projection freeze is audited;
32. SmartAIHub summary cannot corroborate its own source ancestor;
33. provenance cycle is detected;
34. graph traversal is bounded;
35. incomplete ancestry is represented as uncertainty;
36. search/news provenance edge types are retained;
37. synthetic public illustration is clearly labeled;
38. source health is observable independently from event state;
39. review surge mode preserves official life-safety path;
40. all corrections/takedowns/source-revocations preserve append-only
    history.

------------------------------------------------------------------------

# 597. R1.28 Production Gate

Promotion requires: - source-outage/last-known-state test; -
official-source compromise drill; - embargo/future-publication test; -
synthetic-media evidence test; - deleted-source revalidation test; -
CAP/news/social cross-channel dedup test; - privacy/legal takedown vs
retraction test; - reviewer-overload surge test; -
correction-flapping/hysteresis test; - provenance-cycle/poisoning
test; - bounded source-recovery catch-up test.

Mandatory scenario:

``` text
major flood
→ official website becomes unavailable
→ social account publishes anomalous evacuation message
→ CAP feed remains unchanged
→ 40 news sites quote the social message
→ one AI-generated image circulates as alleged evidence
→ reviewers are overloaded
→ old verified road closure source is deleted
→ official CAP later issues a narrower evacuation order
```

System MUST: - not interpret website outage as safety; - not treat 40
downstream reports as 40 independent official sources; - flag anomalous
official channel; - keep synthetic media uncertainty explicit; -
preserve last-known road state with freshness; - prioritize review
queue; - publish the later canonical alert with correct scope; -
propagate corrections without notification flapping; - retain full
provenance/audit history.

**End of Spec 260 R1.28 --- 270-Pass Cumulative Review / Source
Continuity, Synthetic Media, Review Resilience & Provenance Defense**
---

# R1.29 --- Passes 271--280: Emergency Data Commons, Mobility, MCP/API & Universal Agent Interoperability

## 0. Scope and architectural invariants

This revision adds an implementation-grade external emergency-data and
mobility interoperability layer without creating a second source of
truth, scheduler, credit ledger, identity system, incident authority, or
orchestration authority.

The existing SmartAIHub MCP Gateway (`/v1/mcp`), Capability Registry,
authentication/tenant boundary, Durable Orchestration Kernel,
`worker_jobs`, Emergency Response state, Communication Gateway, Media/R2
infrastructure, credit/sponsorship ledger, and audit/provenance model
remain authoritative.

Mandatory invariants:

1.  SmartAIHub is not required to own the UI, device, bot, assistant, or
    application participating in an emergency workflow.
2.  MCP is an adapter/capability surface, not a second emergency
    database or control plane.
3.  `emergency.report` means "resolve and contribute this report"; it
    MUST NOT mean unconditional `incident.create`.
4.  Repeated reports MUST NOT automatically create repeated incidents.
5.  A duplicate report MUST NOT be discarded merely because an incident
    already exists.
6.  Incident-identity deduplication and evidence deduplication are
    separate operations.
7.  False merge is a safety risk; uncertainty MAY preserve
    reports/incidents separately until resolved.
8.  External agents MAY retrieve only the current incident state
    permitted by authorization, purpose, privacy, and relationship.
9.  A new observation MAY materially change triage even when attached to
    an existing incident.
10. A one-time location grant MUST NOT imply continuous tracking
    consent.
11. Journey durable state belongs to SmartAIHub, not to a device.
12. Tracking sessions belong to runtime/device sessions and MAY be
    handed off or failed over.
13. Location ingestion MUST remain independent of map rendering.
14. Loss of tracking signal MUST NOT mean the journey stopped, arrived,
    or became safe.
15. Web MUST support the complete workflow permitted by browser/OS
    capabilities; native apps improve background reliability but MUST
    NOT be a prerequisite.
16. Credits MUST NOT override privacy, authorization, operational
    security, or minimum life-safety access policy.
17. Eligible emergency/public-benefit access MAY be sponsored/free to
    the caller while infrastructure usage remains metered in the
    canonical economic ledger.
18. External clients MAY run their own scheduler/cron. SmartAIHub MUST
    NOT become the scheduling authority for external systems merely
    because they poll its API.
19. Every externally distributed operational fact MUST preserve material
    provenance, freshness, verification state, revision, and
    correction/retraction semantics.
20. High-frequency position ingest MUST NOT invoke an LLM or durable
    workflow per GPS point by default.

------------------------------------------------------------------------

## Pass 271 --- Emergency Data Commons and purpose-aware access

### Gap found

The prior specification protected public emergency information and
defined sponsorship, but did not provide a unified external data-access
taxonomy for public-good reuse, rescue organizations, advanced
intelligence, and commercial consumers.

### Patch

Add:

``` ts
type DataAccessClass =
  | "PUBLIC_COMMONS"
  | "EMERGENCY_OPERATIONS"
  | "ADVANCED_INTELLIGENCE"
  | "COMMERCIAL_DATA"
  | "RESTRICTED_SENSITIVE";

type DataSensitivity =
  | "PUBLIC"
  | "AGGREGATED"
  | "OPERATIONAL"
  | "RESTRICTED"
  | "HIGHLY_SENSITIVE";

type AccessPurpose =
  | "PUBLIC_SAFETY"
  | "EMERGENCY_RESPONSE"
  | "HUMANITARIAN"
  | "RESEARCH"
  | "PERSONAL"
  | "COMMERCIAL"
  | "INTERNAL";
```

`PUBLIC_COMMONS` SHOULD include public alerts, public hazard areas,
public shelter/safe-zone information, public road/accessibility status,
public verified situation products, and appropriately aggregated
incident information.

`EMERGENCY_OPERATIONS` MAY include nearby incident/need feeds,
operational changes, responder coordination products, and finer-grained
data only where the caller has a valid emergency role and need-to-know.

`ADVANCED_INTELLIGENCE` includes compute-heavy semantic search,
historical analysis, AI synthesis, forecasting, media intelligence, and
derived products.

`COMMERCIAL_DATA` includes high-frequency/bulk/enterprise delivery,
commercial analytics, large-scale integration, and contracted SLA
products.

`RESTRICTED_SENSITIVE` includes exact victim/household locations, direct
contact details, protected medical data, protected responder
information, security-sensitive routes, and other policy-restricted
fields.

Public Commons MAY be rate-limited and abuse-protected, but life-safety
access MUST NOT be converted into a simple hard paywall.

------------------------------------------------------------------------

## Pass 272 --- Verified Emergency Organization and bounded EmergencyDataGrant

### Gap found

Sponsored/free rescue access without a bounded organization grant could
become either too restrictive for legitimate responders or an unlimited
data-exfiltration channel.

### Patch

Add `OrganizationProfile` and `EmergencyDataGrant`.

``` ts
interface EmergencyDataGrant {
  grantId: string;
  organizationId: string;
  purposes: AccessPurpose[];
  coverageAreas: string[];
  allowedDataClasses: DataAccessClass[];
  allowedCapabilities: string[];
  maximumLocationPrecision: string;
  quotaPolicyId: string;
  payerPolicyId?: string;
  validFrom: string;
  expiresAt: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED";
  approvedBy: string[];
}
```

Organization types include `RESCUE`, `NGO`, `GOVERNMENT`, `HOSPITAL`,
`RESEARCH`, `COMMERCIAL`, `DEVELOPER`, and `PUBLIC`.

Organization verification MUST be distinct from individual responder
authorization and task assignment.

A grant MUST NOT self-authorize or grant unrestricted victim data. Exact
victim information requires the additional
relationship/purpose/legal/operational checks defined by the privacy
model.

Credential rotation, suspension, revocation, expiry, audit, and
re-verification are mandatory.

------------------------------------------------------------------------

## Pass 273 --- Unified external data contract and bidirectional MCP/API parity

### Gap found

A read-only MCP surface would not support personal assistants, rescue
dispatch systems, field reporting, location contribution, evidence
submission, or journey updates.

### Patch

The same canonical DTO/versioning semantics MUST back MCP, REST/JSON,
webhook/change delivery, streaming, and bulk export. Transport-specific
envelopes MAY differ; emergency semantics MUST NOT.

Add `ExternalCrisisRecordEnvelope`:

``` ts
interface ExternalCrisisRecordEnvelope<T> {
  recordId: string;
  recordType: string;
  schemaVersion: string;
  revision: number;
  data: T;
  observedAt?: string;
  verifiedAt?: string;
  freshness: string;
  verificationState: string;
  provenanceRef: string;
  dataClass: DataAccessClass;
  sensitivity: DataSensitivity;
  tombstone?: boolean;
  supersedesRevision?: number;
}
```

Primary MCP capability families:

**Read** - `crisis.get_situation` - `crisis.search_events` -
`crisis.get_event` - `crisis.get_nearby_incidents` -
`crisis.get_alerts` - `crisis.search_verified_news` -
`crisis.get_verified_claims` - `crisis.get_public_evidence` -
`crisis.query_map_features` - `crisis.get_accessibility` -
`crisis.find_shelters` - `crisis.get_public_resources` -
`crisis.search_history` - `crisis.semantic_search` -
`crisis.get_changes_since` - `incident.get_public_state` -
`incident.get_known_facts` - `incident.get_missing_information` -
`incident.get_changes_since`

**Contribute/write --- separately scoped** - `emergency.report` -
`emergency.update_incident` - `observation.add` - `evidence.add` -
`location.report` - `need.request_assistance` -
`journey.report_position` - `journey.report_checkpoint` -
`journey.report_route_condition` - `communication.send_update`

Low-level write capabilities MUST be separately authorized and
idempotent. Read permission MUST NOT imply write permission.

For large image/video/audio, MCP MUST use media handoff rather than
routing large binary payloads through an LLM context:

`media.create_upload -> scoped upload -> media.commit -> evidence.attach`.

The canonical media remains in governed media/R2 infrastructure with
provenance and retention policy.

------------------------------------------------------------------------

## Pass 274 --- Incident resolution, duplicate detection, support-information loop

### Gap found

External assistants could create duplicate incidents, discard useful
duplicate reports, repeatedly ask already-known questions, or fail to
return useful current context to the reporter.

### Patch

`emergency.report` MUST enter an Incident Resolution Pipeline before
incident creation:

``` text
Normalize
→ Geo/time normalization
→ Candidate retrieval
→ Incident/Hazard relationship scoring
→ Evidence similarity/provenance analysis
→ Resolution
→ Contribution
→ Re-triage if material
→ Return permitted current state + missing critical information
```

Resolution classes:

-   `SAME_INCIDENT_HIGH_CONFIDENCE`
-   `PROBABLE_SAME_INCIDENT`
-   `POSSIBLE_RELATED`
-   `SAME_HAZARD_EVENT`
-   `DISTINCT_INCIDENT`
-   `UNCERTAIN`

Matching MAY use location/distance, observation time, hazard/type, text
semantics, entities, road/direction, media similarity, known
journey/vehicle context, and existing observations. Search rank or
semantic similarity alone MUST NOT decide identity.

False-merge protection: - ambiguous reports MAY remain separate; -
merges MUST be reversible/auditable; - original reports and provenance
MUST survive merge/link decisions; - moving entities MUST use
location-at-observation rather than only current location.

Core rule:

> Deduplicate incident identity, not useful evidence.

A repeated report can add a new observation/evidence item and trigger
re-triage.

The response to `emergency.report` SHOULD include, subject to policy:

``` ts
interface EmergencyReportResolution {
  reportId: string;
  incidentId?: string;
  relationship: string;
  acceptedObservationIds: string[];
  acceptedEvidenceIds: string[];
  currentPermittedState?: object;
  newlyContributedFacts?: object;
  knownFacts?: object;
  missingCriticalInformation?: string[];
  recommendedQuestions?: string[];
  publicGuidance?: string[];
  nextUpdateCursor?: string;
}
```

`recommendedQuestions` are hints to the calling assistant. The assistant
SHOULD avoid asking them if its current conversation already contains a
reliable answer.

`UNVERIFIED` MUST NOT equal `FALSE`. Conflicting facts MUST preserve
temporal source/provenance rather than overwrite history.

Media duplicate analysis MUST distinguish repeated/forwarded media from
genuinely independent contemporary observations where possible.

------------------------------------------------------------------------

## Pass 275 --- Machine-to-machine incremental synchronization and correction-safe delivery

### Gap found

Rescue organizations may operate their own queue/dispatch software and
scheduler and cannot depend on continuously opening SmartAIHub.

### Patch

Support cursor-based incremental synchronization:

-   `crisis.get_changes_since(cursor)`
-   `sync_since(cursor)`

Cursor semantics MUST define snapshot boundary, stable pagination,
opaque/checkpoint integrity, cursor expiry/rebootstrap, tombstones,
superseded revisions, correction/retraction, and offline recovery.

Network delivery MUST assume at-least-once delivery plus idempotent
consumers unless a stronger guarantee is explicitly implemented.
Exactly-once MUST NOT be falsely promised.

External clients MAY poll every N minutes according to their own
scheduler and grant/quota. SmartAIHub's internal scheduler remains
authoritative only for SmartAIHub-owned jobs.

Webhook/subscription delivery MUST support: - signed payloads; - event
IDs; - replay protection; - retry/backoff; - dead-letter/recovery; -
revision/sequence metadata; - subscription filters; -
cancellation/revocation; - critical correction/retraction events.

Streaming/SSE/WebSocket MAY be offered where operationally justified.
Heartbeats and connection occupancy MUST be metered separately from
factual record changes.

------------------------------------------------------------------------

## Pass 276 --- Emergency Mobility, route coordination and multi-runtime journey tracking

### Gap found

The prior route/accessibility model did not fully cover ambulance/organ
transport, route cooperation, route revisions, automatic tracking,
multi-runtime handoff, or tracking without continuous map rendering.

### Patch

Add first-class entities:

-   `EmergencyJourney`
-   `JourneyLeg`
-   `JourneyParticipant`
-   `JourneyRoute`
-   `RouteRevision`
-   `JourneyPosition`
-   `JourneyCheckpoint`
-   `JourneyStatus`
-   `JourneyEvent`
-   `RouteRequest`
-   `RouteConstraint`
-   `RouteClearanceRequest`
-   `RouteCooperationRequest`
-   `JourneySubscription`
-   `JourneyTrack`
-   `TrackingSession`
-   `LocationSource`

Journey purposes include: `AMBULANCE_RESPONSE`, `MEDICAL_TRANSFER`,
`ORGAN_TRANSPORT`, `RESCUE_RESPONSE`, `FIRE_RESPONSE`, `EVACUATION`,
`SUPPLY_DELIVERY`, `FIELD_OPERATION`, `PERSONAL_JOURNEY`,
`LOGISTICS_JOURNEY`, `OTHER`.

Journey states include: `PLANNED`, `DISPATCHED`, `EN_ROUTE`, `DELAYED`,
`REROUTING`, `ARRIVING`, `ARRIVED`, `COMPLETED`, `CANCELLED`.

Route revisions MUST be append/history preserving. Reasons include
flood, closure, traffic, accident, security, bridge/access constraint,
destination change, manual override, and faster/safer alternative.

`RouteClearanceRequest` MUST be distinct from route computation. A route
recommendation does not itself grant legal/operational authority to
clear roads. Requests require real authority/acknowledgement where
applicable.

Reference workflow: time-critical organ transport MAY span multiple
`JourneyLeg`s (hospital → ambulance → airport/aircraft → ambulance →
destination hospital) with handoff checkpoints and ETA propagation.

Supported producer runtimes: - Web foreground/browser location; -
SmartAIHub Desktop/Runner; - future native mobile/tablet background
runtime; - external GPS/fleet/dispatch system; - authorized external
personal agent.

All producers use a common location contract containing at minimum
capture time, received time, accuracy, source/runtime provenance, and
sequence/idempotency metadata.

Runtime/device handoff MUST preserve the same Journey. Multiple
simultaneous sources require source arbitration using authorization,
freshness, accuracy, continuity, and capability. Source loss MAY trigger
fallback.

Offline producers MUST support store-and-forward where the runtime
permits it. `captured_at` and `received_at` MUST remain distinct.

Tracking policy MAY adapt frequency to emergency priority, motion,
battery, network, and OS constraints. Runtime MUST be able to report
degraded effective frequency.

High-frequency location hot path:

``` text
Location producer
→ lightweight authenticated ingest
→ validation/dedup
→ state/geospatial processing
→ append/compact storage
→ material event detection
```

It MUST NOT require an LLM/workflow invocation for every position.

Material events include: `DEPARTED`, `CHECKPOINT_REACHED`,
`ROUTE_DEVIATION`, `ETA_MATERIAL_CHANGE`, `ROAD_BLOCKED`, `REROUTED`,
`ENTERED_HAZARD_AREA`, `EXITED_HAZARD_AREA`, `ARRIVING`, `ARRIVED`.

Map visualization is consumer-driven. Tracking MAY continue while no map
is open. Rendering SHOULD load the latest position, simplified track,
active route, and material events first; high-resolution historical
replay is fetched only when requested.

------------------------------------------------------------------------

## Pass 277 --- Universal personal-agent participation, delegation and voice/media/location reporting

### Gap found

Future mobile users may rely on Grok-class bots, Hermes-class agents,
OpenAI-class assistants, OS assistants, or other personal agents rather
than a dedicated SmartAIHub application.

### Patch

Define a provider-neutral **Universal Emergency Agent Interop
Contract**. Named providers are adapters/examples, never architectural
dependencies.

External agents MAY: - report incidents/observations; - send a one-time
permitted location; - attach selected image/video/audio; - request
assistance; - retrieve permitted incident context; - receive updates; -
start/update a permitted journey; - submit journey
positions/checkpoints; - request/reroute; - report route/accessibility
conditions; - acknowledge messages.

Voice-first target flow:

``` text
User voice/photo/video
→ Personal Assistant
→ user consent/delegation
→ SmartAIHub Emergency MCP/API
→ Incident Resolution
→ Observation/Evidence/Location
→ Triage/Situation Fusion
→ response returned to assistant
```

Add `AgentDelegationGrant` with: principal, delegate identity, allowed
capabilities, incident/journey scope, data precision, media permission,
continuous-location permission, frequency ceiling, spending budget,
validity window, and revocation.

A grant for a location snapshot MUST NOT imply a tracking grant.

Agent capability discovery SHOULD expose schema, authorization
requirements, risk/approval level, estimated/max cost where applicable,
sponsorship eligibility, and payer semantics.

External agents MUST be protected by rate limits, delegated credit
budgets, maximum calls, idempotency, and loop/anomaly detection.

Agent delivery is one Communication Gateway channel.
`SENT != DELIVERED != SEEN != ACKNOWLEDGED`. Life-safety fallback MAY
use other authorized channels.

------------------------------------------------------------------------

## Pass 278 --- Purpose-bound privacy, operational security and safe route/location disclosure

### Gap found

Live ambulance, organ transport, victim, and responder locations can be
operationally sensitive; a paid API or valid MCP credential alone is
insufficient authorization.

### Patch

Every external query/write MUST evaluate: caller identity, tenant,
organization, purpose, scope, coverage, incident relationship, task
assignment, need-to-know, data class, sensitivity, and applicable
legal/consent basis.

Location disclosure modes: - `PUBLIC_AREA_ONLY` - `COARSE` - `DELAYED` -
`OPERATIONAL` - `EXACT_AUTHORIZED` - `WITHHELD`

Nearby incident feeds SHOULD progressively disclose location. Exact
victim location, direct phone, medical detail, and sensitive household
data require stronger authorization.

Live organ-transport or security-sensitive routes MAY be withheld,
delayed, corridor-only, or restricted to coordination partners.

A public user MAY receive a safety message such as an emergency corridor
advisory without receiving exact vehicle GPS.

Location-sharing grants MUST expire. Purpose changes require
re-authorization.

Server-side redaction is mandatory. A caller MUST NOT be able to buy
greater precision with additional credits.

Disclosure actions MUST integrate with existing `DisclosureRecord`,
consent, audit, and purpose-limitation controls.

------------------------------------------------------------------------

## Pass 279 --- Sustainable usage-based credits and sponsored emergency mobility/data access

### Gap found

A flat "one call = one credit" model would unfairly price lightweight
cached access, high-frequency tracking, expensive AI analysis, and
realtime commercial streams.

### Patch

External usage metering MUST decompose actual cost drivers:

-   base access/platform service;
-   position ingest;
-   bytes/data volume;
-   storage and retention;
-   database/vector/geospatial retrieval;
-   route compute;
-   reroute compute;
-   ETA compute;
-   AI/provider compute;
-   freshness/realtime delivery;
-   webhook/stream connection/delivery;
-   historical replay;
-   map/tile/data delivery;
-   media processing;
-   notification delivery;
-   platform margin/policy fee.

Map rendering/data-delivery cost MUST NOT be charged merely because
tracking is active when no consumer requests map visualization.

Shared/cached products SHOULD charge retrieval/platform/data-service
cost rather than pretending every caller caused the original full
computation.

Existing quote → reserve → meter → settle → release economics remain
canonical. Expensive calls SHOULD expose estimated cost and hard/max
bound where feasible.

Eligible emergency organizations MAY use `EmergencyDataGrant` with payer
`SPONSOR`, `GOVERNMENT`, `NGO`, `SYSTEM_ADMIN`, or `FREE_EMERGENCY`
according to policy. Usage remains metered even when user charge is
zero.

Sponsor exhaustion MUST degrade optional compute-heavy features before
minimum emergency/public-safety access where policy requires continuity.

Commercial high-frequency, bulk, advanced intelligence, and SLA products
remain revenue-generating.

Sponsors MUST NOT obtain operational authority, editorial authority,
victim access, dispatch priority, or preferential triage by funding
access.

------------------------------------------------------------------------

## Pass 280 --- External-use provenance, abuse resistance, developer ecosystem and production gate

### Gap found

Opening operational data and write capabilities to bots, rescue systems,
and commercial clients expands correction, scraping, exfiltration,
replay, automation-loop, and schema-compatibility risks.

### Patch

Every externally distributed operational record MUST carry material: -
verification state; - freshness; - observed/verified time; - revision; -
provenance reference; - data class/sensitivity; -
correction/retraction/supersession state.

Change types: `CREATE`, `UPDATE`, `CORRECT`, `RETRACT`, `TOMBSTONE`.

Downstream clients MUST be able to process correction/retraction. A
SmartAIHub-derived publication MUST NOT be used as independent
corroboration of its own ancestor evidence.

External systems MAY build their own dispatch/queue/task models from
permitted data. They MUST NOT mutate canonical SmartAIHub incident/task
state unless using an explicitly authorized write capability.

Security/abuse controls: - OAuth/API key/service-account identity as
applicable; - narrow scopes; - credential rotation/revocation; -
WAF/rate limiting; - query-complexity controls; - victim-location
enumeration protection; - high-volume geo-scraping detection; -
agent-loop/cost anomaly detection; - webhook replay defense; -
per-client quotas/budgets; - tenant and organization isolation.

Developer ecosystem SHOULD include: - capability/schema documentation; -
generated/maintained SDKs where justified; - examples for MCP, REST,
webhook, cursor sync, and journey reporting; - synthetic/deidentified
sandbox datasets; - client usage/credit/quota dashboard; -
schema/version deprecation policy.

### Mandatory R1.29 end-to-end scenario

The production gate MUST test at least the following integrated
scenario:

1.  A citizen speaks to an authorized external personal assistant:
    "There is a serious crash here."
2.  The assistant obtains bounded consent and sends text + one-time
    location + selected image through `emergency.report`.
3.  SmartAIHub detects an existing probable incident rather than blindly
    creating another incident.
4.  The report adds a new observation/evidence item; current known facts
    are returned with one critical missing fact.
5.  The assistant does not ask a question already answered in its
    current conversation.
6.  The new observation reports smoke and triggers material re-triage.
7.  A verified rescue organization receives the changed incident through
    its own queue using `get_changes_since`.
8.  The organization has a sponsored `EmergencyDataGrant`; it sees
    operationally necessary information but not victim phone/medical
    data until separately authorized/assigned.
9.  An ambulance Journey starts from a mobile/native or Runner location
    source, while Command Center monitors through Web.
10. Tracking continues with the map closed; no map-rendering charge is
    generated.
11. The ambulance reports a blocked road; the observation enters
    accessibility fusion rather than immediately becoming unquestioned
    global truth.
12. The Journey receives a route revision and records why the route
    changed.
13. A route-clearance/cooperation request is sent to an authorized
    coordination party and remains distinct from route computation.
14. Tracking runtime goes offline for 45 minutes, buffers positions,
    reconnects, and resumes with idempotent sequence/cursor semantics
    preserving capture time.
15. A second device takes over tracking without creating a second
    Journey.
16. A correction to the incident is delivered to the rescue queue and
    external assistant with revision/provenance preserved.
17. The sponsor pool approaches exhaustion; optional AI summary
    frequency degrades while required emergency change-feed access
    remains available according to policy.
18. A commercial logistics client requesting a comparable high-frequency
    data product is charged under commercial policy rather than claiming
    emergency sponsorship.
19. Duplicate webhook deliveries and replay attempts do not create
    duplicate canonical mutations or duplicate economic settlement.
20. Audit can reconstruct report → resolution → evidence → triage change
    → external delivery → journey → route revision →
    sponsorship/metering without exposing prohibited public victim data.

### Acceptance-test additions

At minimum add tests for:

-   incident duplicate high-confidence match;
-   ambiguous incident false-merge preservation;
-   duplicate report still adds material evidence;
-   forwarded duplicate media not counted as independent corroboration;
-   same hazard but distinct household incidents;
-   moving-entity location-at-observation;
-   known-fact retrieval and redaction;
-   missing-information response;
-   duplicate-question suppression hint;
-   voice/text/location composite report;
-   scoped media upload/commit;
-   one-time location vs tracking consent separation;
-   agent delegation expiry/revocation;
-   external agent loop budget;
-   read scope does not imply write;
-   cursor offline recovery;
-   cursor expiry/rebootstrap;
-   correction/retraction propagation;
-   webhook signature/replay/idempotency;
-   rescue organization grant expiry/revocation;
-   organization grant does not expose victim medical data;
-   location progressive disclosure;
-   sensitive journey route withholding;
-   Web foreground tracking;
-   Runner/native tracking;
-   device handoff;
-   multi-source location arbitration;
-   stale tracking does not imply arrival;
-   store-and-forward capture/receive timestamps;
-   route revision history;
-   route clearance authority acknowledgement;
-   organ-transport multi-leg handoff;
-   route-condition observation verification;
-   tracking without rendering;
-   map rendering on demand;
-   cached/shared-cost metering;
-   sponsored emergency payer settlement;
-   sponsor exhaustion graceful degradation;
-   commercial high-frequency charging;
-   external write idempotency;
-   end-to-end audit reconstruction.

## R1.29 production gate

R1.29 MUST NOT be considered production-complete until:

-   the canonical MCP/API capability schemas are versioned;
-   the Incident Resolution Pipeline passes false-merge and
    duplicate-contribution tests;
-   external write operations are idempotent and separately scoped;
-   media handoff avoids mandatory large binary LLM transit;
-   location snapshot and continuous tracking permissions are
    demonstrably distinct;
-   Journey runtime handoff and offline recovery pass;
-   tracking operates without continuous map rendering;
-   sensitive route/location disclosure policies pass negative tests;
-   emergency organization grants cannot bypass assignment/need-to-know;
-   quote/reserve/meter/settle works for external paid usage;
-   sponsored access is economically metered without granting sponsor
    authority;
-   cursor/webhook correction propagation passes;
-   provenance survives all external delivery paths;
-   the mandatory integrated scenario above passes end to end.

**End of R1.29 additive review.**

------------------------------------------------------------------------

# R1.30 --- Passes 281--290: Interop Trust, Mobility Safety, Resilience & Cost Defense

This review is additive to R1.29. Existing SmartAIHub identity, MCP
Gateway, Durable Orchestration Kernel, Emergency Response state, credit
ledger, sponsorship, media, privacy, provenance, and audit authorities
remain canonical.

## Pass 281 --- External agent identity, attestation and replay-safe delegated authority

### Gap found

A valid user delegation alone does not prove that the runtime presenting
it is the intended agent/device, and captured MCP requests could
otherwise be replayed.

### Patch

Add `ExternalAgentIdentity`, `AgentRuntimeSession`, and
`DelegatedActionProof`.

Every privileged external write MUST bind: - principal/user; -
delegate/agent identity; - runtime/session identity where available; -
tenant/organization; - capability; - incident/journey scope; -
delegation grant; - issued/expiry time; - nonce/idempotency key; -
request digest for high-risk mutations.

Authentication strength MUST be recorded as provenance. Platform/device
attestation MAY strengthen trust but MUST NOT be treated as universally
available.

Replayed signed requests MUST NOT create a second observation mutation,
journey transition, task acceptance, media attachment, or economic
settlement.

Delegation revocation MUST propagate to active runtime sessions with
bounded cache lifetime. Offline clients MAY retain unsent local records
but MUST reauthorize before privileged upload when the grant is no
longer valid.

## Pass 282 --- Concurrent incident resolution, merge/split safety and canonical identity races

### Gap found

Two agents can report the same new incident simultaneously before either
sees the other's incident, creating a race beyond ordinary semantic
deduplication.

### Patch

Add an atomic `IncidentResolutionDecision` and canonicalization
boundary.

Requirements: - candidate resolution and create/link decision MUST use
transactional/idempotent fencing appropriate to the SoR; - simultaneous
creates MAY temporarily produce separate candidates, but reconciliation
MUST preserve every original report; - canonical merge MUST create
explicit aliases/redirects, never silently delete an incident ID; -
split MUST be supported when a prior merge is later proven wrong; -
downstream references MUST resolve through canonical identity without
rewriting historical provenance; - merge/split events MUST propagate
through change feeds and external caches; - economic charges MUST NOT
multiply merely because internal reconciliation produced aliases.

States: `CANDIDATE`, `CANONICAL`, `ALIASED`, `MERGED`, `SPLIT`,
`RETIRED`.

False merge remains a life-safety concern; automatic merge thresholds
MUST be stricter for simultaneous nearby high-severity incidents.

## Pass 283 --- Location integrity, spoofing/anomaly detection and uncertainty-aware tracking

### Gap found

Location producers may be inaccurate, spoofed, stale, teleported,
clock-skewed, or compromised. Accuracy metadata supplied by the client
cannot be blindly trusted.

### Patch

Add `LocationIntegrityAssessment`.

Signals MAY include: - impossible speed/teleport; - sequence reversal; -
capture/server clock skew; - repeated identical synthetic coordinates; -
source/runtime changes; - GNSS/OS accuracy where available; - route
topology mismatch; - cross-source disagreement; - device/session
continuity; - known mock-location/attestation signal where legitimately
available.

Assessment states: `NORMAL`, `DEGRADED`, `SUSPICIOUS`, `CONFLICTING`,
`UNUSABLE`, `UNKNOWN`.

A suspicious location MUST NOT silently overwrite the last reliable
operational position. The system MAY retain both reported and
operationally selected positions with provenance.

Location confidence MUST affect ETA, route deviation, proximity
matching, and public/operational display.

No permanent citizen "trust score" may be derived from location
anomalies.

## Pass 284 --- Route safety envelope, navigation-provider independence and stale-route defense

### Gap found

A shortest/fastest route can be operationally unsafe, stale,
incompatible with the vehicle, or based on an unavailable third-party
routing provider.

### Patch

Add `RouteSafetyEnvelope` and `RouteProviderAdapter`.

Route computation MUST consider, where data exists: - vehicle
class/dimensions/weight; - flood depth/accessibility; - bridge/road
restrictions; - hazardous areas; - emergency closures; - responder-only
restrictions; - time validity/freshness; - destination approach
constraints; - manual operational exclusions.

A route MUST carry `computed_at`, source/provider, input-accessibility
revision, constraint revision, and expiry/revalidation policy.

Stale accessibility information MUST be surfaced, not hidden.

Provider failure MUST permit configured fallback: cached safe route →
alternate provider → deterministic/basic graph route → human/manual
route, according to use case and safety policy.

SmartAIHub route output is advisory unless an authorized operational
workflow explicitly designates otherwise. It MUST NOT claim legal
traffic priority or road-clearance authority.

## Pass 285 --- Cross-organization journey handoff, custody and organ/medical chain-of-custody

### Gap found

Multi-leg organ transport and medical transfer require more than route
tracking: responsibility and custody can move between organizations.

### Patch

Add: - `JourneyCustodyAssignment` - `JourneyHandoff` -
`CriticalPayload` - `CustodyEvidence`

A JourneyLeg MUST identify responsible organization/team where
applicable.

Handoff states: `PLANNED`, `READY`, `OFFERED`, `ACCEPTED`,
`TRANSFER_CONFIRMED`, `FAILED`, `CANCELLED`.

For regulated/time-critical payloads such as organs, blood products,
specimens, or critical medication, policy MAY require: - sender/receiver
acknowledgement; - timestamp; - custody identity; -
condition/temperature reference where integrated; - seal/package
reference; - evidence; - exception reason.

Location tracking MUST NOT substitute for custody confirmation.

ETA updates SHOULD propagate to the next authorized handoff party
without exposing unnecessary patient/donor information.

## Pass 286 --- Connectivity degradation, emergency fallback and low-bandwidth protocol behavior

### Gap found

Store-and-forward covers offline recovery, but emergency clients also
face partial connectivity, high latency, data caps, failed media
uploads, and channel degradation.

### Patch

Define `ConnectivityProfile`: `NORMAL`, `CONSTRAINED`, `LOW_BANDWIDTH`,
`INTERMITTENT`, `OFFLINE`.

Protocol behavior MUST support: - compact position batches; -
delta/change payloads; - resumable media; - media thumbnail/metadata
before original; - priority ordering of critical text/location ahead of
large video; - bounded retry/backoff; - duplicate-safe resend; -
optional lower tracking frequency; - delayed noncritical analytics; -
explicit stale/freshness indicators.

A failed video upload MUST NOT prevent a critical text/location report
from being accepted.

When connectivity returns, reconciliation MUST preserve original capture
order/times while preventing obsolete queued commands from overriding
newer state.

## Pass 287 --- Tracking consent lifecycle, retention, purpose completion and post-journey privacy

### Gap found

Starting/stopping tracking was defined, but post-journey retention and
purpose completion could leave sensitive tracks available longer than
necessary.

### Patch

Add `TrackingConsentRecord` and `JourneyRetentionPolicy`.

Continuous tracking MUST record: - who granted; - delegate/runtime; -
purpose; - precision; - frequency ceiling; - start; - expiry/stop
condition; - retention class.

Tracking SHOULD stop automatically on explicit completion/expiry
according to policy, while preserving required audit/evidence records.

Raw high-resolution position history MAY have a shorter retention period
than: - simplified operational track; - material journey events; - route
revisions; - legally/audit-required records.

Retention MUST be purpose/jurisdiction/policy aware.

Stopping tracking MUST stop future collection; it MUST NOT be
represented as deletion of records that must legally/operationally be
retained.

Personal/commercial journey tracking MUST not inherit emergency
retention merely because it uses the same engine.

## Pass 288 --- Cost-amplification, query abuse and economic denial-of-service defense

### Gap found

An authorized external agent can accidentally or maliciously create high
costs through high-frequency tracking, route recomputation, AI
summaries, media processing, or subscription fan-out.

### Patch

Add `ExternalUsageBudget` and `CostAnomalyEvent`.

Controls: - per-capability rate/burst limit; - per-journey ingest
ceiling; - minimum reroute/recompute hysteresis; - AI summary
debounce/material-change trigger; - media size/type policy; - concurrent
stream/subscription limits; - query complexity/area/time-window
limits; - bulk export quotas; - per-user/org/tenant credit budgets; -
sponsor-pool budgets; - hard maximum charge where feasible; - anomaly
detection for recursive agent loops.

Life-safety minimum service MUST degrade safely rather than blindly
terminate because an optional expensive capability exhausted its budget.

Economic denial-of-service MUST be distinguished from factual/reporting
abuse. A caller may be blocked from expensive analytics while still
permitted to submit an eligible critical emergency report.

## Pass 289 --- Command conflict resolution, stale external actions and authority precedence

### Gap found

Multiple external agents, users, dispatch systems, and responders may
issue conflicting or stale commands against the same incident/journey.

### Patch

Add `OperationalCommandEnvelope`: - command ID; - actor/delegate; -
authority class; - target revision; - issued/captured time; - expiry; -
idempotency key; - expected state/precondition.

Commands such as journey stop, destination change, task acceptance,
route override, tracking-source switch, and incident closure MUST use
explicit state/precondition checks where races are material.

A delayed offline command MUST NOT overwrite a newer authoritative state
merely because it arrived later.

Authority precedence MUST be policy-defined and auditable; it MUST NOT
be inferred from who pays more credits or which agent is "smarter".

Conflicting commands SHOULD produce an explicit
conflict/needs-resolution event rather than silent last-write-wins for
life-safety state.

## Pass 290 --- Disaster-scale failover, external dependency isolation and production readiness

### Gap found

The new interop layer creates dependency on routing providers, messaging
providers, external agents, identity providers, media upload paths, and
high-volume ingest precisely when disasters cause load spikes and
outages.

### Patch

Define degraded operating modes: `NORMAL`, `SURGE`,
`DEPENDENCY_DEGRADED`, `REGIONAL_PARTITION`,
`MINIMUM_EMERGENCY_SERVICE`.

Minimum emergency service SHOULD prioritize: 1. critical incident/report
intake; 2. location snapshot/essential journey updates; 3. authoritative
alert/correction distribution; 4. responder operational change feed; 5.
essential route/accessibility data where available; then optional
AI/analytics/media enrichment.

No single external personal-agent provider, routing provider, map
renderer, AI model, or messaging channel may become the sole required
path for core emergency reporting.

Backpressure MUST protect PostgreSQL/SoR, event ingestion, credit
settlement, and critical queues from optional analytics workloads.

Operational telemetry MUST distinguish: - ingestion lag; - resolution
lag; - journey-position lag; - change-feed lag; - webhook backlog; -
media backlog; - routing-provider health; - sponsorship/economic
settlement lag.

Reconciliation after partition MUST cover both operational records and
economic records without allowing financial reconciliation to rewrite
factual emergency history.

## R1.30 acceptance-test additions

Add at least these tests:

1.  delegated request replay rejected/idempotent;
2.  revoked grant invalidates bounded cached authority;
3.  simultaneous same-incident reports converge without lost evidence;
4.  merge alias resolves for old external ID;
5.  erroneous merge can split without provenance loss;
6.  merge/split propagates to cursor clients;
7.  impossible location jump becomes suspicious;
8.  conflicting location sources preserve both provenance records;
9.  suspicious location does not silently replace reliable position;
10. route rejects incompatible vehicle constraint;
11. stale accessibility route is labeled/revalidated;
12. routing provider fallback preserves safety metadata;
13. route output does not imply clearance authority;
14. cross-organization JourneyLeg handoff;
15. organ custody requires explicit transfer confirmation;
16. ETA propagation does not expose donor/patient data;
17. failed large video does not block critical text/location;
18. constrained mode sends compact position batch;
19. reconnect preserves captured order;
20. stale queued command cannot overwrite newer state;
21. tracking auto-stops on bounded grant expiry;
22. post-journey raw-track retention differs from material events;
23. personal journey retention does not inherit emergency policy;
24. route-recompute storm is debounced;
25. recursive agent AI calls hit budget without blocking critical
    report;
26. sponsor exhaustion preserves minimum eligible emergency service;
27. commercial client cannot self-label as emergency to evade cost;
28. conflicting destination commands produce explicit conflict;
29. target-revision/precondition rejects stale operational mutation;
30. authority precedence independent of payer/credits;
31. surge mode prioritizes report intake over analytics;
32. routing provider outage does not disable incident reporting;
33. external agent provider outage does not disable Web reporting;
34. messaging-channel outage invokes configured fallback;
35. media backlog does not block incident resolution;
36. ingest backpressure protects canonical SoR;
37. operational and economic reconciliation remain separated;
38. location lag telemetry is measurable;
39. change-feed lag telemetry is measurable;
40. minimum-emergency-service integrated disaster test passes.

## Mandatory R1.30 scenario

During a regional flood and communications degradation: - two different
personal assistants simultaneously report the same ambulance crash; -
incident resolution initially creates two candidates due a race and
safely reconciles them with aliases while preserving both reports; - one
assistant later replays a captured write request and cannot duplicate
the mutation or charge; - an ambulance replacement Journey receives
positions from a phone and vehicle GPS, with one source producing an
impossible jump; - source arbitration keeps the reliable operational
position and records the anomaly without assigning a permanent trust
score; - the preferred routing provider fails and an alternate route is
produced with stale-accessibility warnings and vehicle constraints; - a
time-critical medical payload is handed from one organization to another
with explicit custody confirmation; - connectivity falls to
low-bandwidth mode, so text/location and compact deltas are delivered
before media; - a queued old destination-change command arrives after a
newer command and is rejected by revision/precondition; - repeated route
recomputation and AI-summary requests hit budget/hysteresis controls
without disabling critical reporting; - sponsor capacity becomes
constrained and the system enters minimum emergency service while
retaining essential incident, location, alert/correction, and responder
change-feed functions; - recovery reconciles operational and economic
records independently and audit reconstructs the complete chain.

## R1.30 production gate

R1.30 is not production-complete until: - delegated external writes are
replay-safe; - incident-resolution concurrency and reversible
merge/split pass; - location-integrity uncertainty affects downstream
mobility logic; - route safety metadata/fallback pass; -
multi-organization custody/handoff passes where enabled; -
constrained/offline protocol ordering passes; - tracking
consent/retention lifecycle passes; - cost-amplification controls
preserve minimum emergency reporting; - stale/conflicting command
handling is deterministic and auditable; - disaster-scale degraded-mode
and dependency-isolation scenario passes end to end.

**End of R1.30 additive review.**

------------------------------------------------------------------------

# R1.31 --- Passes 291--300: Scale, Federation, Temporal-Geospatial Safety & Compatibility

This review is additive. It does not create new authorities for
identity, orchestration, incident state, economic settlement, media, or
audit.

## Pass 291 --- Geospatial reference integrity, boundary ambiguity and spatial precision contracts

### Gap found

External systems may use different coordinate reference systems,
precision, geocoders, administrative boundaries, road datasets, or
place-name interpretations. A syntactically valid coordinate is not
sufficient for safe operational matching.

### Patch

Add `GeoReference`, `GeoResolution`, and `SpatialPrecisionPolicy`.

Every operational location SHOULD preserve: - original
coordinate/value; - normalized WGS84 representation where applicable; -
source CRS if not WGS84; - accuracy/uncertainty radius or geometry; -
capture method; - geocoder/provider/version where derived; -
jurisdiction/boundary version where material; - resolution method and
confidence.

Location forms include point, uncertainty circle, line/corridor,
polygon/area, landmark, address, administrative area, and route-relative
position.

Spatial matching MUST consider uncertainty geometry rather than
pretending every location is an exact point.

Same-name places and border/jurisdiction ambiguity MUST be explicitly
resolvable. Automatic jurisdiction selection MUST expose confidence and
evidence.

External APIs MUST declare coordinate order and units. Lat/lon reversal
and invalid-range tests are mandatory.

Public/coarse disclosure MUST be generated from policy-approved
transformation, not by merely rounding strings in the client.

## Pass 292 --- Temporal integrity, clock domains and ordering under offline/replayed data

### Gap found

Emergency state now depends on captured, observed, received, verified,
published, delivered, and corrected times across devices with unreliable
clocks.

### Patch

Add canonical time semantics: - `captured_at` - `observed_at` -
`device_reported_at` - `received_at` - `verified_at` -
`effective_from` - `effective_until` - `published_at` - `corrected_at`

Preserve device clock offset/uncertainty where measurable. Server
receive time MUST NOT silently replace observation time.

Ordering MUST use domain-appropriate semantics rather than one global
timestamp.

Offline late-arriving evidence MAY update historical understanding
without incorrectly rewinding current operational state.

Future-dated/clock-skewed reports MUST be flagged. Expiry calculations
for grants, alerts, route validity, and tracking consent MUST use
trusted server time unless a contract explicitly states otherwise.

## Pass 293 --- Emergency identity recovery, anonymous continuity and account-unavailable operation

### Gap found

During emergencies users may lose access to their normal account/device,
use a borrowed phone, report anonymously, or change agent/runtime.

### Patch

Add `EmergencyInteractionSession` independent of permanent account
identity.

The system MAY support: - anonymous/bystander reporting; - temporary
case-return tokens; - privacy-preserving incident follow-up; - verified
handoff from one device/agent to another; - later account binding where
policy permits.

Loss of login MUST NOT prevent minimum eligible emergency reporting.

Temporary recovery credentials MUST be scoped, expiring, non-enumerable,
revocable, and unable to expose unrelated incidents.

Identity upgrade (anonymous → authenticated) MUST append provenance
rather than rewrite the original reporter identity.

A responder/organization operational privilege still requires
appropriate stronger authentication; anonymous continuity does not
elevate authority.

## Pass 294 --- Subscription fan-out, notification storms and consumer-specific backpressure

### Gap found

A major incident can trigger millions of subscriptions/webhooks/agents.
Correct data can still overload the platform or downstream consumers.

### Patch

Add `DeliveryFanoutPlan` and `ConsumerBackpressureState`.

Delivery MUST support: - event coalescing; - material-change
thresholds; - per-consumer rate/burst policy; - digest mode; - priority
queues; - correction/critical-alert bypass rules; - retry budgets; -
dead-letter handling; - downstream `Retry-After`/backpressure signals
where available.

A slow consumer MUST NOT block canonical incident processing or other
consumers.

Repeated position events SHOULD NOT fan out individually unless the
subscription explicitly requires that fidelity and policy/budget permits
it.

Notification deduplication MUST use event/revision semantics, not
message text alone.

## Pass 295 --- Evidence/media lifecycle, malware/content safety and derivative provenance

### Gap found

Direct scoped media upload improves efficiency but creates ingestion
risks and derivative ambiguity.

### Patch

Add `MediaIngestState`: `UPLOADING`, `QUARANTINED`, `SCANNING`,
`AVAILABLE`, `RESTRICTED`, `REJECTED`, `DELETED_PUBLIC`,
`RETAINED_AUDIT`.

Media pipeline MUST support: - MIME/signature validation; -
size/duration limits; - malware/content safety scanning as
appropriate; - quarantine before operational/public distribution where
required; - checksum/content identity; - original-vs-derived linkage; -
thumbnail/transcode provenance; - metadata stripping/redaction policy; -
access-controlled originals; - resumable upload integrity.

AI captions, extracted frames, transcripts, redacted copies, and
transcoded media MUST link to the original evidence and MUST NOT
masquerade as independent evidence.

A failed derivative MUST NOT invalidate a valid original.

Deletion/takedown/public removal MUST follow the existing
audit/legal-retention separation.

## Pass 296 --- Schema evolution, capability negotiation and long-lived client compatibility

### Gap found

Rescue systems, bots, mobile apps, and embedded clients may remain
deployed for months or years while SmartAIHub schemas evolve.

### Patch

Add `CapabilityManifest` and `SchemaCompatibilityPolicy`.

Clients MUST be able to discover: - capability identifier; - semantic
version/schema version; - required scopes; - risk class; - supported
media/location modes; - cost/quote behavior; - deprecation status; -
minimum/maximum compatible versions where applicable.

Breaking changes require explicit versioning and migration/deprecation
windows appropriate to emergency operations.

Unknown additive fields MUST NOT break tolerant clients.

Server MUST NOT silently reinterpret an old field with incompatible
semantics.

Critical correction/retraction semantics MUST remain backward-compatible
or fail closed with an explicit unsupported-version response.

## Pass 297 --- Route/tracking privacy against inference, stalking and historical reconstruction

### Gap found

Even when exact coordinates are withheld, repeated coarse points,
timing, route revisions, and API queries can reconstruct sensitive
movement.

### Patch

Add `MobilityDisclosurePolicy`.

Controls MAY include: - temporal delay; - spatial coarsening; -
corridor-only disclosure; - sampling reduction; - start/end masking; -
restricted historical replay; - minimum aggregation population; -
query-rate controls; - relationship/assignment checks; -
anti-enumeration monitoring.

Public or unrelated callers MUST NOT reconstruct a
victim/responder/organ-transport path by repeatedly querying nearby
feeds.

Historical route replay is a distinct permission from current
operational access.

Emergency corridor advisories SHOULD disclose the minimum necessary
information for cooperation.

Privacy transformations MUST occur server-side and be auditable.

## Pass 298 --- Cross-tenant / cross-organization federation without authority collapse

### Gap found

Disasters cross tenant, municipal, hospital, NGO, and national
boundaries. Simple tenant isolation alone can prevent coordination;
unrestricted sharing collapses privacy and authority.

### Patch

Add `FederatedEmergencyShare` and `FederationPolicy`.

A federation share MUST define: - source tenant/organization; -
recipient; - purpose; - incident/event scope; - data classes/fields; -
location precision; - allowed actions; - validity; - onward-sharing
rule; - revocation; - audit references.

Canonical ownership and operational authority MUST remain explicit.
Sharing an incident MUST NOT automatically transfer dispatch authority,
editing rights, sponsorship control, or victim-data access.

Federated records MUST preserve source provenance and canonical
identifiers.

Revocation stops future access where feasible but MUST NOT pretend
already lawfully delivered records never existed; downstream obligations
remain governed by policy/contract.

Cross-jurisdiction sharing MUST allow policy hooks for residency/legal
constraints.

## Pass 299 --- Decision/audit explainability for automated resolution, routing and access

### Gap found

The system records audit events, but operators also need to understand
why an incident matched, a location source was rejected, a route
changed, data was redacted, or a caller was charged.

### Patch

Add `DecisionTraceRef` for material automated decisions.

Decision traces SHOULD capture: - decision type; - policy/model/rule
version; - material inputs/references; - selected outcome; -
uncertainty/confidence where applicable; - rejected alternatives/reason
codes where useful; - human override; - timestamp; - audit correlation
ID.

Do not store hidden model chain-of-thought. Store structured operational
reasons and evidence references.

Required trace categories include: incident resolution, merge/split,
triage material change, location-source arbitration, route revision,
disclosure/redaction, sponsorship/payer selection, quote/settlement, and
degraded-mode transition.

Operators MUST be able to reconstruct "what rule/evidence caused this?"
without exposing protected data to unauthorized viewers.

## Pass 300 --- Safe rollout, compatibility canaries, rollback and migration during active emergencies

### Gap found

A correct design can still fail if a schema/policy/MCP capability change
is deployed during an active disaster without compatibility and rollback
discipline.

### Patch

Add `EmergencyChangeControl`.

Production changes affecting incident resolution, location ingestion,
route safety, authorization, external schemas, credit settlement, or
correction delivery require risk-tiered rollout controls.

Controls SHOULD include: - backward-compatible database migration
strategy; - expand/migrate/contract where appropriate; -
capability/version canary; - synthetic/deidentified replay tests; -
shadow evaluation for matching/routing policy changes; -
tenant/organization canaries; - rollback plan; - feature flags with
scoped kill switches; - migration/reconciliation telemetry; -
freeze/escalation policy during declared high-severity operations.

Rollback MUST NOT erase factual events accepted under the newer version.

Policy rollback MUST define treatment of grants/actions already issued.

Schema rollback MUST not make newer external records undecodable without
a compatibility path.

Minimum emergency service MUST survive deployment rollback.

## R1.31 acceptance-test additions

Add at least: 1. lat/lon reversal rejected; 2. non-WGS84 input
normalized with original preserved; 3. uncertainty-circle matching; 4.
same-name place ambiguity surfaced; 5. coarse disclosure server-side
transformation; 6. device clock skew preserved; 7. late offline evidence
does not rewind current state; 8. trusted server time controls grant
expiry; 9. anonymous report accepted under minimum service; 10.
temporary case token cannot enumerate other incidents; 11.
anonymous-to-authenticated binding preserves provenance; 12. slow
webhook consumer isolated; 13. position-event fan-out coalesced; 14.
critical correction bypasses digest safely; 15. media MIME/signature
mismatch quarantined; 16. malware/quarantine path blocks distribution;
17. derived transcript links to original; 18. redacted derivative not
independent corroboration; 19. old client tolerates additive fields; 20.
incompatible breaking schema returns explicit version error; 21.
correction semantics preserved across supported versions; 22. repeated
coarse queries cannot reconstruct restricted route; 23. historical
replay requires separate permission; 24. organ route public advisory
exposes corridor only; 25. federated share preserves source canonical
ID; 26. federation does not transfer dispatch authority; 27. federation
revocation stops future reads; 28. cross-jurisdiction policy hook
enforced; 29. incident-match decision trace available; 30. location
arbitration trace available; 31. route revision trace identifies
constraints/provider revision; 32. redaction trace identifies policy
reason; 33. payer selection trace reconstructable; 34. canary old/new
schema interoperability; 35. matching-policy shadow evaluation cannot
mutate production; 36. rollback preserves accepted factual reports; 37.
grant policy rollback handles already-issued grants; 38. external newer
record remains decodable after rollback; 39. minimum emergency service
survives deployment rollback; 40. integrated
scale/federation/compatibility scenario passes.

## Mandatory R1.31 scenario

A flood crosses two tenant/jurisdiction boundaries. An anonymous caller
on a borrowed phone reports an incident using an external assistant with
an approximate landmark and skewed device clock. SmartAIHub resolves the
location with uncertainty, creates a temporary continuity session, and
later binds the interaction to an authenticated user without rewriting
provenance. A rescue organization in another tenant receives only a
bounded federated operational share. Thousands of subscribers are
coalesced/backpressured while a critical correction bypasses digest
delay. A video uploads under constrained connectivity, is
quarantined/scanned, and its transcript remains a derivative of the
original. A sensitive ambulance/organ route is exposed publicly only as
a minimal corridor advisory and cannot be reconstructed through repeated
queries. During the incident, a new MCP/schema version is canaried; old
clients remain compatible. A policy regression is rolled back without
deleting accepted reports or breaking minimum emergency service.
Decision traces reconstruct incident matching, location arbitration,
route revision, redaction, federation, and payer decisions.

## R1.31 production gate

R1.31 is not production-complete until: - geospatial
normalization/uncertainty and jurisdiction ambiguity tests pass; -
temporal/clock semantics pass under offline and skewed clients; -
anonymous emergency continuity cannot elevate authority; -
fan-out/backpressure protects canonical processing; - media
quarantine/derivative provenance passes; - schema/capability negotiation
supports long-lived clients; - mobility inference protections pass
negative tests; - cross-tenant federation preserves bounded authority; -
structured decision traces exist for material automated decisions; -
canary/rollback/migration tests pass during simulated active emergency.

**End of R1.31 additive review.**

------------------------------------------------------------------------

# R1.32 --- Passes 301--310: Mutual-Benefit Local Resilience, Utility Feed & Sustainable Community Economy

## 0. Economic and social design doctrine

SmartAIHub Emergency & Crisis Intelligence MUST be designed as a
sustainable mutual-benefit network, not as a charity-only system and not
as an extraction-oriented advertising system.

The system recognizes that, during and after disruption:

-   people may urgently need goods or services but do not necessarily
    require them for free;
-   local businesses, workers, drivers, technicians, equipment owners,
    farmers, shops, restaurants, and service providers may themselves be
    economically affected and need legitimate income;
-   buyers and service seekers need current, trustworthy, nearby
    availability;
-   sponsors may fund public-good access, specific service subsidies,
    emergency infrastructure, or community recovery;
-   SmartAIHub requires sustainable revenue to maintain data, compute,
    communication, verification, mapping, media, orchestration, and
    emergency infrastructure;
-   paid economic activity can itself be part of recovery when it
    reconnects local supply with legitimate local demand.

Core doctrine:

> HELP DOES NOT REQUIRE EVERY TRANSACTION TO BE FREE.

> REVENUE DOES NOT JUSTIFY EXPLOITING EMERGENCY VULNERABILITY.

> A HEALTHY RESILIENCE NETWORK SHOULD ALLOW PEOPLE WHO CAN PAY TO BUY,
> PEOPLE WHO CAN WORK TO EARN, SPONSORS TO SUBSIDIZE ELIGIBLE NEEDS, AND
> ESSENTIAL PUBLIC-SAFETY INFORMATION TO REMAIN ACCESSIBLE.

> COMMERCIAL ACTIVITY MAY FUND EMERGENCY COMMONS, PUBLIC FEED CAPACITY,
> SPONSORED ACCESS, OR TARGETED COMMUNITY ASSISTANCE WITHOUT BUYING
> EMERGENCY PRIORITY, EDITORIAL CONTROL, OR PRIVATE VICTIM DATA.

This revision adds no second marketplace, payment ledger, feed source of
truth, scheduler, or sponsorship authority. It reuses SmartAIHub
Marketplace/Mini App capabilities, existing credit/economic ledger,
sponsorship policy, canonical emergency/local data, News Watch, MCP/API,
geospatial services, Media, and Durable Orchestration Kernel.

------------------------------------------------------------------------

## Pass 301 --- Local Resilience & Recovery Economy domain

### Gap found

R1.31 can coordinate emergency response and external data use, but lacks
a first-class economic domain connecting local supply, local services,
recovery work, and current operational availability.

### Patch

Add logical subsystem:

**Local Resilience, Essential Services & Recovery Economy**

Canonical entities:

-   `LocalProvider`
-   `BusinessLocation`
-   `BusinessOperationalStatus`
-   `GoodsOffer`
-   `GoodsAvailability`
-   `ServiceOffer`
-   `ServiceAvailability`
-   `MobilityServiceOffer`
-   `EquipmentServiceOffer`
-   `RecoveryWorkOffer`
-   `CommunityResourceOffer`
-   `PriceSnapshot`
-   `ProviderCoverageArea`
-   `ProviderCapability`
-   `AvailabilityObservation`
-   `CommercialVerification`
-   `CommercialPromotion`
-   `ServiceLead`
-   `EconomicInteraction`

Offer modes:

`COMMERCIAL`, `FREE`, `DONATION`, `SUBSIDIZED`, `GOVERNMENT_PROVIDED`,
`NGO_PROVIDED`, `COMMUNITY_SHARED`, `SPONSOR_FUNDED`.

A provider may simultaneously have multiple offer modes. Example: a
restaurant may sell ordinary meals and donate a bounded number of meals.

Emergency responder status MUST remain distinct from commercial provider
status.

------------------------------------------------------------------------

## Pass 302 --- Operational availability, freshness and community confirmation

### Gap found

A static business directory is not useful enough during disruption.
Users need to know whether a provider is open now, what remains
available, whether the location is reachable, and when that information
was last confirmed.

### Patch

`BusinessOperationalStatus` and offer availability MUST support:

-   `OPEN`
-   `LIMITED`
-   `TEMPORARILY_CLOSED`
-   `CLOSED`
-   `UNKNOWN`
-   `STALE`

Availability records SHOULD include: - observed/updated time; -
valid-until/TTL; - quantity or capacity where appropriate; -
confidence; - source; - accepted payment methods; - opening window; -
contact methods; - accessibility by relevant vehicle/mobility class; -
delivery/pickup status; - service coverage; - price or price type where
supplied.

Verification of business identity MUST be separate from verification of
current availability.

Community users MAY submit observations such as "still open", "water
sold out", or "small cars cannot enter". These observations enter
provenance/fusion and MUST NOT blindly overwrite canonical provider
data.

TTL SHOULD be category-sensitive: rapidly changing food/water/fuel
availability expires faster than a longer-lived repair-service
capability.

------------------------------------------------------------------------

## Pass 303 --- Situation, Local Utility & Recovery Feed Engine

### Gap found

News, warnings, nearby conditions, businesses, services, free
assistance, and sponsored utility currently lack one coherent
high-quality distribution surface.

### Patch

Add logical projection:

**Situation, Local Utility & Recovery Feed Engine**

The Feed is NOT a new source of truth. It projects canonical records
from: - emergency alerts; - hazard/situation intelligence; -
verified/local/major news; - accessibility/road conditions; - community
observations; - business availability; - goods availability; -
transport; - local/recovery services; - free/donated resources; -
government/NGO information; - relevant sponsored content.

Feed item media MAY include: text, images, video, audio, gallery, map
preview, structured business/service card, alert card, journey/access
card, and CTA.

Feed mixing MUST preserve at least these logical lanes:

1.  `CRITICAL_SAFETY`
2.  `LOCAL_SITUATION`
3.  `LOCAL_UTILITY`
4.  `MAJOR_NEWS`
5.  `RECOVERY_SERVICES`
6.  `COMMUNITY`
7.  `SPONSORED_RELEVANT`

Local-first ranking MUST NOT suppress critical regional/national
information.

Critical alerts/corrections MAY preempt ordinary feed ranking.

User filters SHOULD include emergency, warnings, news, nearby, food,
water, open shops, transport, medical, shelters, repair, cleaning, heavy
equipment, free assistance, commercial services, and sponsored content.

Users SHOULD be able to reduce/hide nonessential commercial content
without losing critical safety information.

------------------------------------------------------------------------

## Pass 304 --- Utility-first ranking and ethical sponsored placement

### Gap found

A conventional engagement-maximizing or highest-bid advertising ranker
can undermine safety and trust.

### Patch

Organic utility ranking SHOULD consider:

-   safety relevance;
-   explicit user intent;
-   need match;
-   geographic relevance;
-   accessibility/reachability;
-   freshness;
-   actual availability;
-   capacity;
-   source/verification quality;
-   temporal relevance.

Sponsored content enters ranking only after
relevance/safety/availability eligibility.

Payment MUST NOT: - buy emergency triage priority; - displace a critical
warning; - make unavailable inventory appear available; - override
access/safety constraints; - buy verification status; - buy
victim/private data access; - buy editorial or dispatch authority.

Sponsored items MUST be identifiable as sponsored/paid placement in a
clear but non-disruptive manner.

The platform MUST NOT intentionally disguise paid placement as
independent editorial or emergency information.

Emergency vulnerability, medical status, household distress, protected
incident details, or responder-only data MUST NOT be used for commercial
targeting.

Contextual commercial relevance MAY use safe signals such as
user-selected category, broad permitted area, current search intent, and
public/local availability.

------------------------------------------------------------------------

## Pass 305 --- Feed freemium, active-consumption metering and safety exemption

### Gap found

A high-quality rich-media local feed has real query, bandwidth,
realtime, media, and AI cost. Unlimited free heavy use is economically
unsustainable, but a wall-clock paywall would penalize passive page-open
time and can obstruct legitimate public-safety use.

### Patch

Define `FeedUsageSession`, `FeedUsageMeter`, `FeedQuota`, and
`FeedEntitlement`.

Feed charging SHOULD meter meaningful resource consumption rather than
simple page-open duration.

Meterable dimensions MAY include: - feed queries/refreshes; - records
delivered; - rich-media bytes/delivery; - realtime subscription
occupancy/events; - historical retrieval; - AI personalization; - AI
summarization; - semantic/local intelligence query; - notification/watch
delivery.

Passive idle time with no meaningful delivery SHOULD have negligible or
zero feed-consumption charge.

A continuously active realtime feed MAY consume quota because delivery
infrastructure remains active.

Frontend SHOULD present understandable quota/credit information rather
than microscopic per-record charges.

Free quota SHOULD be sufficient for normal periodic checking and user
acquisition.

After quota exhaustion, ordinary extended feed MAY require
credits/subscription/sponsored quota.

Mandatory invariant:

> CRITICAL LIFE-SAFETY INFORMATION MUST NOT BE HIDDEN SOLELY BECAUSE
> NORMAL FEED QUOTA OR USER CREDITS ARE EXHAUSTED.

Critical safety feed, required corrections, evacuation notices, and
policy-defined essential public information use
emergency/sponsored/minimum-service payer policy.

------------------------------------------------------------------------

## Pass 306 --- Business/provider monetization and livelihood-support mechanics

### Gap found

Providers need sustainable ways to earn income and promote legitimate
availability; SmartAIHub needs revenue without charging every useful
community contribution.

### Patch

Supported commercial models MAY include:

-   free basic provider listing;
-   credit-based enhanced listing;
-   richer media/catalog/service profile;
-   sponsored relevant placement;
-   lead/contact fee where legally/operationally appropriate;
-   transaction/booking commission if later implemented;
-   provider subscription;
-   branch/API availability synchronization;
-   commercial MCP/API usage;
-   analytics/demand intelligence;
-   enterprise integration/SLA.

A provider posting genuinely free/donated emergency assistance SHOULD
NOT be forced into a paid advertising product merely to make the
assistance discoverable.

Commercial promotion and emergency/community contribution MUST be
distinguishable.

Service categories MAY include: food, water, household goods, pharmacy
where legally permitted, transport, motorcycle taxi, pickup/4x4/boat
transport, cleaning, pumping, debris removal, excavation, grading,
hauling, electrical repair, plumbing, building repair, vehicle repair,
communications, charging/power, accommodation, logistics, equipment
rental, and other locally relevant services.

The platform SHOULD support individuals/microbusinesses as well as
established companies, subject to verification/risk controls.

This creates a recovery mechanism in which affected people with usable
skills/equipment can earn legitimate income by helping others recover.

------------------------------------------------------------------------

## Pass 307 --- Sponsorship beyond donation: feed subsidy, service subsidy and community economic support

### Gap found

Sponsorship was primarily framed around emergency
infrastructure/credits. Sponsors can create additional mutual benefit by
subsidizing access or specific recovery services.

### Patch

Add sponsorship purposes:

-   `EMERGENCY_INFRASTRUCTURE`
-   `EMERGENCY_DATA_ACCESS`
-   `PUBLIC_FEED_QUOTA`
-   `LOCAL_INFORMATION_ACCESS`
-   `SERVICE_SUBSIDY`
-   `GOODS_SUBSIDY`
-   `TRANSPORT_SUBSIDY`
-   `RECOVERY_WORK_SUBSIDY`
-   `RESPONDER_OPERATIONS`
-   `COMMUNITY_RECOVERY_POOL`

Examples: - sponsor gives users in an affected area additional feed
quota; - sponsor subsidizes cleaning for eligible households; - sponsor
funds fuel/transport for responders; - sponsor funds emergency MCP/API
access for rescue organizations; - sponsor subsidizes locally purchased
goods rather than supplying goods directly.

Sponsored commercial/community programs MUST use eligibility and
economic ledger controls.

Sponsors MUST NOT receive emergency priority, private victim data,
dispatch authority, or verification/editorial control.

Impact reporting MUST use aggregate/deidentified measures and MUST NOT
equate credits directly with "lives saved".

A configurable allocation policy MAY direct a portion of
commercial/feed/provider revenue to Emergency Commons or community
sponsorship pools.

------------------------------------------------------------------------

## Pass 308 --- Local demand intelligence and supply-demand coordination

### Gap found

Once SmartAIHub sees aggregate searches, availability, shortages,
accessibility, and service demand, it can help suppliers and
institutions allocate resources more efficiently.

### Patch

Add derived products:

-   `LocalDemandSignal`
-   `LocalSupplySignal`
-   `SupplyDemandGap`
-   `RecoveryDemandTrend`
-   `AreaAvailabilityIndex`

Examples: - rising demand for drinking water in an area; - shortage of
open food providers; - high demand for electricians after flooding; -
shortage of accessible transport; - increasing cleaning/debris-removal
demand.

Consumer/private emergency data MUST be aggregated/deidentified before
commercial demand intelligence.

Protected vulnerability attributes MUST NOT be sold as advertising
segments.

Government, NGO, logistics, retailer, and enterprise clients MAY
purchase advanced aggregated intelligence through existing Advanced
Intelligence / Commercial Data pricing.

SmartAIHub MAY use these signals to recommend that providers reposition
inventory/capacity, but recommendations MUST distinguish forecast from
verified demand.

------------------------------------------------------------------------

## Pass 309 --- Feed/API/MCP growth loops and external distribution

### Gap found

The economic network becomes stronger when information can be consumed
and shared outside the SmartAIHub UI.

### Patch

Add capability family:

-   `feed.get_nearby`
-   `feed.get_critical`
-   `feed.get_major_news`
-   `feed.get_services`
-   `feed.get_open_businesses`
-   `feed.get_goods`
-   `feed.get_changes_since`
-   `feed.summarize_nearby`
-   `feed.create_watch`
-   `local.search_open_businesses`
-   `local.search_products`
-   `local.search_services`
-   `local.search_transport`
-   `local.get_availability`
-   `local.report_availability`

External personal agents MAY retrieve permitted feed/local utility
information and consume credits/sponsored quota under the same economic
policy as first-party clients.

Feed items SHOULD support privacy-safe share/deep-link projection to
social networks and messaging channels.

Shared emergency/local content SHOULD carry freshness/update time and
source/verification status where appropriate so stale screenshots/posts
are less likely to circulate without context.

Provider share links MAY become user-acquisition paths into SmartAIHub.

Feed Watch MAY notify users when a relevant condition changes, such as a
nearby road closure, an open water seller, or a needed service becoming
available. Monitoring MUST use event/subscription infrastructure where
possible rather than continuous LLM polling.

------------------------------------------------------------------------

## Pass 310 --- Mutual-benefit economy governance, anti-exploitation and production gate

### Gap found

Combining emergency context, local commerce, sponsorship, feed
monetization, and recovery work creates strong value but also risks
price exploitation, scams, hidden advertising, predatory targeting,
pay-to-priority, and conflicts between public good and platform revenue.

### Patch

Add `ResilienceEconomyPolicy`.

Mandatory safeguards:

1.  Commercial status MUST NOT confer emergency priority.
2.  Protected emergency/vulnerability data MUST NOT be commercial
    targeting data.
3.  Sponsored placement MUST be labeled.
4.  Provider identity verification and current availability verification
    remain distinct.
5.  Availability freshness MUST be visible/material to ranking.
6.  Scam/fraud reporting and suspension workflow are required.
7.  Price data MUST preserve timestamp/source; the system MUST NOT imply
    platform price guarantees unless explicitly contracted.
8.  Where price-gouging rules apply, jurisdictional policy hooks MAY
    restrict or flag offers.
9.  Free/donated resources MUST remain discoverable and MUST NOT be
    buried merely because they generate no ad revenue.
10. Paid services MAY be recommended where they are useful and relevant;
    the system MUST NOT imply that legitimate help must always be free.
11. Users SHOULD be able to distinguish free, donated, subsidized, and
    commercial offers.
12. Revenue allocation to public-good pools MUST be ledger-backed and
    auditable when represented publicly.
13. Feed optimization MUST use utility/safety constraints before
    commercial optimization.
14. Commercial feed exhaustion MUST NOT suppress essential safety.
15. Providers MUST NOT buy verification, official status, responder
    status, or false availability.
16. Sponsors MUST NOT control factual publication, incident resolution,
    triage, or dispatch.
17. Marketplace disputes MUST NOT mutate canonical emergency facts.
18. Emergency and commercial economic ledgers MAY share infrastructure
    but MUST preserve distinct purpose/provenance.
19. The platform SHOULD support livelihood generation as a legitimate
    recovery outcome.
20. Economic sustainability is an explicit system objective, but
    subordinate to life-safety, privacy, factual integrity, and lawful
    access controls.

### Mutual-benefit value loop

``` text
Useful local/emergency intelligence
        ↓
More citizens and organizations
        ↓
More observations + current availability
        ↓
Better local utility
        ↓
More businesses/workers/providers
        ↓
More legitimate transactions and promotions
        ↓
Platform revenue + provider income
        ↓
Emergency Commons / Feed subsidy / Recovery sponsorship
        ↓
Lower access burden for people needing help
        ↓
Stronger community participation and data
        ↺
```

This loop SHOULD be measured using balanced metrics, not engagement
alone.

Recommended metrics: - critical information reach; - useful local
searches fulfilled; - provider availability freshness; - successful
service/goods connections; - provider income/lead outcomes where
measurable and consented; - sponsored public access delivered; -
Emergency Commons funding; - feed quota subsidy; - fraud/dispute rate; -
correction rate; - user retention outside disasters; - local
supply-demand coverage; - percentage of feed impressions with
demonstrable utility/relevance; - commercial revenue without
safety-priority distortion.

## R1.32 acceptance-test additions

At minimum:

1.  free/donated/commercial offers are distinguishable;
2.  business verified does not imply availability verified;
3.  stale food inventory loses ranking;
4.  community "sold out" observation does not blindly overwrite provider
    state;
5.  critical alert preempts commercial content;
6.  major critical news survives local-first mixing;
7.  user can hide nonessential sponsored content;
8.  sponsored placement is labeled;
9.  highest bidder cannot override unavailable stock;
10. payment cannot buy emergency priority;
11. vulnerability data cannot become ad-targeting segment;
12. passive feed idle time does not consume ordinary active quota;
13. realtime active delivery can consume quota;
14. critical safety feed survives quota exhaustion;
15. normal user receives usable free daily quota;
16. rich media consumption meters separately;
17. AI nearby summary quotes/settles compute usage;
18. basic provider listing can be free;
19. enhanced listing consumes provider credits;
20. donated emergency offer remains discoverable without ad purchase;
21. affected local worker can publish recovery service;
22. responder status cannot be acquired through marketplace listing;
23. sponsor can fund public feed quota;
24. sponsor can fund bounded service subsidy;
25. sponsor cannot access beneficiary private data by default;
26. commercial revenue allocation to Emergency Commons reconciles;
27. aggregate demand signal excludes protected personal data;
28. demand intelligence distinguishes forecast from verified shortage;
29. external agent can query nearby feed under same policy;
30. external agent cannot bypass feed quota via MCP;
31. feed watch uses subscription/event path rather than LLM polling;
32. shared feed item carries freshness context;
33. provider deep link creates privacy-safe public projection;
34. scam report can suspend commercial promotion without deleting
    emergency facts;
35. price timestamp/source preserved;
36. free resource is not buried solely for zero revenue;
37. marketplace dispute cannot change incident truth;
38. commercial ledger purpose remains distinguishable from emergency
    sponsorship;
39. balanced utility/revenue metrics are emitted;
40. integrated mutual-benefit economy scenario passes.

## Mandatory R1.32 integrated scenario

A flood affects a district. Critical evacuation information remains
freely visible. A resident uses free feed quota to check nearby
conditions and sees a verified local restaurant still open, a government
water point, a paid motorcycle transport provider, and a sponsored
cleaning service. The restaurant sells meals rather than donating them;
this is valid because the user needs food and can pay, while the
restaurant itself needs revenue during disruption. Another restaurant
offers donated meals and remains discoverable without purchasing
promotion.

A local worker whose normal income was disrupted lists a paid
debris-cleaning service and receives legitimate work from nearby
households. A sponsor funds cleaning subsidies for eligible households,
so some customers pay partially or zero while the worker still receives
the contracted economic value. SmartAIHub records sponsorship and
settlement without exposing beneficiary vulnerability to the sponsor.

The user's ordinary feed quota later expires. Commercial/local extended
feed requires credits or sponsored quota, but a new evacuation
correction remains visible under essential safety policy. A sponsor adds
public feed quota for the affected area. A business purchases a clearly
labeled sponsored placement, but its listing is removed from eligibility
when availability becomes stale.

Aggregate searches show increasing demand for drinking water. SmartAIHub
exposes a deidentified demand signal to authorized logistics/retail
clients, helping additional supply move into the area. The signal does
not expose which households are distressed.

An external personal assistant queries the same nearby feed through MCP
and receives identical quota, sponsorship, privacy, and ranking policy.
Commercial revenue, provider income, sponsor subsidy, feed subsidy, and
Emergency Commons allocation reconcile in the canonical economic ledger.

## R1.32 production gate

R1.32 MUST NOT be considered production-complete until:

-   feed projection cannot become an alternate source of truth;
-   critical safety content remains accessible after ordinary quota
    exhaustion;
-   utility ranking precedes sponsored boost;
-   protected emergency data cannot enter commercial targeting;
-   availability freshness/verification and provider identity are
    distinct;
-   free/donated/subsidized/commercial offers are visibly
    distinguishable;
-   provider monetization and livelihood-support flows reconcile
    economically;
-   sponsor subsidy does not grant operational/private-data privileges;
-   external MCP/API feed consumption follows the same quota/economic
    policy;
-   local demand intelligence passes aggregation/privacy tests;
-   scam/fraud and stale commercial content can be contained without
    corrupting emergency truth;
-   the mandatory mutual-benefit scenario passes end to end.

**End of R1.32 additive review.**

------------------------------------------------------------------------

# R1.33 --- Passes 311--320: Market Trust, Fairness, Liquidity, Accessibility & Public-Benefit Impact

This review strengthens the Mutual-Benefit Resilience Economy introduced
in R1.32. It does not create a second marketplace, wallet, credit
ledger, payment authority, feed source of truth, or emergency authority.

## Pass 311 --- Market liquidity, cold-start coverage and graceful empty-market behavior

### Gap found

A local marketplace/feed is useful only when enough current supply
exists. New or severely affected areas may have few providers, stale
listings, or no commercial coverage.

### Patch

Add `LocalMarketCoverage` and `SupplyCoverageState`.

Coverage dimensions SHOULD include: - active providers by category; -
fresh offers; - geographic coverage; - accessible offers; -
free/donated/subsidized availability; - capacity estimates; -
demand/supply imbalance; - confidence/freshness.

States: `HEALTHY`, `THIN`, `CRITICAL_SHORTAGE`, `UNKNOWN`.

When commercial supply is thin, the system MUST NOT fabricate abundance
or repeatedly show stale providers. It SHOULD broaden safely through: 1.
nearby verified supply; 2. government/NGO/community resources; 3.
provider recruitment/invitation; 4. sponsor-supported supply
mobilization; 5. clearly labeled demand signal; 6. alternate
category/solution where appropriate.

"No current provider found" is a valid result.

The platform MAY invite nearby providers to activate availability, but
MUST respect anti-spam and consent rules.

## Pass 312 --- Price integrity, disaster price changes and anti-gouging policy hooks

### Gap found

Prices can legitimately rise due to distance, labor, scarcity, fuel, or
risk, while some jurisdictions prohibit exploitative emergency pricing.
A simplistic price cap would also harm providers who face real increased
costs.

### Patch

Add `PriceObservation`, `PriceChangeReason`, and
`PriceIntegrityAssessment`.

Price records SHOULD preserve: - amount/range; - unit; - currency; -
timestamp; - provider; - category; - geographic area; - quote
validity; - source; - optional reason for material change.

Material price changes MAY be explained by provider-declared reasons
such as fuel, distance, hazardous access, overtime, equipment, scarce
inputs, or changed scope.

SmartAIHub MUST NOT label a price illegal or exploitative solely from an
AI anomaly score.

Jurisdictional policy hooks MAY: - warn; - restrict promotion; - require
additional disclosure; - route for review; - block prohibited
transaction flows where legally required.

Organic discovery of a provider and paid promotion eligibility MAY be
treated differently.

Price ranking SHOULD NOT simply prefer the cheapest offer when
freshness, reachability, safety, capacity, quality, and scope differ.

## Pass 313 --- Provider trust, credentials, capabilities and high-risk service verification

### Gap found

A general business verification badge is insufficient for electricians,
structural repair, medical-adjacent services, heavy equipment,
transport, or other regulated/high-risk work.

### Patch

Add: - `ProviderCredential` - `ProviderCredentialVerification` -
`ServiceRiskClass` - `CapabilityEvidence`

Risk classes: `LOW`, `MODERATE`, `HIGH`, `REGULATED`.

High-risk/regulated categories MAY require licenses, insurance,
training, organization verification, equipment evidence, or other
jurisdiction-specific credentials before certain
claims/promotions/actions are allowed.

Provider identity verification MUST NOT imply professional credential
verification.

Credential expiry/revocation MUST propagate to eligible service
capabilities.

The platform MUST distinguish: - provider says they can do X; -
capability evidence exists; - credential is verified; - SmartAIHub
independently guarantees workmanship --- which MUST NOT be implied
unless explicitly contracted.

## Pass 314 --- Lead/contact abuse, spam, harassment and privacy-preserving provider discovery

### Gap found

Publishing phone/location/contact details can generate spam, harassment,
scraping, stalking, or automated lead extraction, especially for
individuals and microbusinesses.

### Patch

Add `ContactDisclosurePolicy` and optional `ContactRelay`.

Providers MAY choose: - public business contact; - in-app relay; -
masked contact; - request-to-contact; - booking/lead workflow; -
organization-only contact.

Personal home addresses SHOULD NOT be required for mobile service
providers.

Exact provider position MAY be withheld until accepted engagement where
appropriate.

Rate-limit bulk contact extraction and detect enumeration/scraping.

A paid lead MUST NOT grant unrelated personal data.

Users and providers require block/report controls.

Commercial lead generation MUST be distinct from emergency responder
contact/dispatch.

## Pass 315 --- Transaction, quote, booking and dispute boundary

### Gap found

Discovery can evolve into quote/booking/payment. Without a clear
boundary users may assume SmartAIHub guarantees a transaction that
actually occurred directly between parties.

### Patch

Add optional: - `ServiceRequest` - `ProviderQuote` - `BookingIntent` -
`CommercialTransactionRef` - `FulfillmentConfirmation` -
`CommercialDispute`

Transaction modes: `DISCOVERY_ONLY`, `CONTACT_HANDOFF`,
`PLATFORM_BOOKING`, `PLATFORM_SETTLED`.

UI/API MUST make transaction mode clear.

For `DISCOVERY_ONLY` and `CONTACT_HANDOFF`, SmartAIHub records
discovery/lead state but MUST NOT imply it processed or guaranteed
payment.

If platform booking/settlement is later enabled, it MUST reuse canonical
SmartAIHub economic infrastructure and define
cancellation/refund/dispute policy.

A commercial dispute MUST NOT rewrite canonical hazard/incident facts.
Evidence relevant to both domains may be referenced with appropriate
access control.

## Pass 316 --- Sponsor allocation fairness, bounded eligibility and anti-favoritism

### Gap found

Service subsidies can unintentionally favor certain providers,
neighborhoods, organizations, or people, or be captured by coordinated
abuse.

### Patch

Add `SubsidyProgram`, `SubsidyEligibilityDecision`,
`SubsidyReservation`, and `SubsidyAllocationPolicy`.

Programs MUST define: - sponsor/funding pool; - purpose; - eligible
area/time/category; - eligible recipient/provider rules; - maximum
benefit; - concurrency/reservation; - exhaustion behavior; - anti-abuse
controls; - public transparency level; - provider-selection constraints.

Sponsor MAY define lawful program purpose but MUST NOT select emergency
triage priority or gain protected beneficiary data.

Provider selection under a subsidy SHOULD preserve user choice where
practical and MUST not silently force sponsor-affiliated providers
unless the program is explicitly a disclosed provider-specific offer.

Allocation fairness SHOULD be measurable by geography, eligibility,
utilization, and unmet demand without exposing private beneficiary
identities.

## Pass 317 --- Feed manipulation, review/rating integrity and coordinated commercial influence

### Gap found

Providers may attempt fake availability, fake community confirmations,
coordinated reviews, repeated reposting, location spoofing, or
sponsored-content saturation.

### Patch

Add `CommercialIntegritySignal` and `FeedManipulationAssessment`.

Signals MAY include: - repeated self-confirmation; - coordinated
account/device patterns; - impossible provider locations; - abnormal
repost frequency; - duplicate media/catalog; - fake scarcity; -
rating/review anomalies; - misleading sponsorship disclosure; -
availability inconsistent with repeated field observations.

Ranking MUST not treat raw engagement, review count, or repost volume as
trustworthy without integrity controls.

Reviews/ratings, if enabled, MUST be separate from emergency report
trust and MUST NOT create permanent citizen credibility scores.

Enforcement MAY reduce promotion eligibility while preserving legitimate
emergency facts submitted by the same actor.

Commercial enforcement MUST NOT automatically erase unrelated emergency
observations.

## Pass 318 --- Inventory/capacity reservation, oversubscription and availability truth

### Gap found

Showing "50 meals available" to thousands of users can create a rush and
immediate oversubscription. Availability without reservation semantics
can become misleading.

### Patch

Add optional: - `OfferCapacity` - `CapacityReservation` -
`CapacityCommitment` - `CapacityFulfillment`

Availability types: `EXACT`, `ESTIMATED`, `RANGE`, `IN_STOCK`, `LOW`,
`UNKNOWN`.

The system MUST distinguish display availability from reserved/committed
capacity.

If reservation is unsupported, UI/API MUST NOT imply stock is held for
the viewer.

Provider/API updates and transaction reservations SHOULD reconcile
capacity idempotently.

Stale or rapidly changing capacity SHOULD be displayed with uncertainty.

For donated/subsidized scarce resources, reservation/eligibility rules
MUST prevent double allocation.

## Pass 319 --- Accessibility, language, digital inclusion and non-app participation in the local economy

### Gap found

A local utility economy that requires modern smartphones, literacy, a
SmartAIHub account, or online payment excludes people who may benefit
most.

### Patch

Provider/user participation SHOULD support, as available: - Web; -
mobile/tablet; - external personal agent; - MCP/API; - assisted operator
entry; - voice; - messaging channels; - QR/deep link; - phone/IVR/SMS
integrations where configured.

Offers SHOULD support multilingual text and structured fields. Machine
translation MUST preserve original content/provenance and indicate
translation.

Accessibility SHOULD cover screen readers, scalable text, low-bandwidth
media alternatives, clear status labels, and non-color-only indicators.

Cash/off-platform payment MAY be represented where lawful; SmartAIHub
MUST not imply platform settlement in that case.

A provider without advanced digital tooling MAY be entered/updated by an
authorized organization/operator with provenance.

## Pass 320 --- Public-benefit accounting, balanced success metrics and economic sustainability gate

### Gap found

R1.32 establishes a value loop, but without explicit public-benefit
accounting the platform could optimize revenue while claiming community
benefit without measurable evidence.

### Patch

Add: - `PublicBenefitAllocation` - `ResilienceEconomyMetric` -
`CommunityImpactProjection` - `RevenuePurposeAllocation`

Where SmartAIHub publicly represents that a share of revenue funds
Emergency Commons, feed subsidy, or recovery support, the allocation
MUST be backed by canonical ledger entries and reconciliation.

Metrics MUST distinguish: - gross commercial revenue; - platform net
revenue; - provider earnings where measurable; - sponsor funding; -
public-feed subsidy; - Emergency Commons allocation; - service/goods
subsidy; - unused/residual sponsor funds; - refunds/chargebacks.

Balanced product metrics MUST include safety/utility/trust measures
alongside revenue: - critical alert reach; - useful-query fulfillment; -
freshness; - successful provider connection; - supply coverage; - unmet
demand; - fraud/dispute rate; - sponsor utilization; -
free/subsidized/commercial mix; - user retention outside disasters; -
provider participation/retention; - correction/retraction rate; -
accessibility coverage.

The optimization objective MUST NOT be "maximize feed time" or "maximize
ad impressions".

Recommended objective: **maximize durable local utility and sustainable
economic exchange subject to safety, privacy, factual integrity,
fairness, and public-benefit constraints.**

## R1.33 acceptance-test additions

1.  empty local market returns honest no-supply result;
2.  thin market safely broadens search;
3.  stale providers do not simulate coverage;
4.  provider recruitment respects anti-spam controls;
5.  price timestamp/unit/source preserved;
6.  legitimate cost-based price change can be explained;
7.  AI price anomaly does not autonomously declare illegality;
8.  jurisdictional price policy can restrict promotion;
9.  cheapest unsafe/unreachable offer does not win ranking;
10. identity verification does not imply professional credential;
11. expired credential removes regulated capability eligibility;
12. platform does not imply workmanship guarantee;
13. individual provider can hide exact home address;
14. contact relay blocks bulk scraping;
15. paid lead does not reveal unrelated personal data;
16. discovery-only transaction is clearly labeled;
17. off-platform payment not represented as platform-settled;
18. commercial dispute cannot rewrite incident truth;
19. subsidy has bounded eligibility and maximum benefit;
20. sponsor cannot choose emergency priority;
21. subsidy can preserve user provider choice;
22. provider-specific sponsor offer is disclosed;
23. subsidy allocation fairness metrics exclude beneficiary PII;
24. coordinated fake availability reduces promotion eligibility;
25. commercial enforcement preserves unrelated emergency evidence;
26. reviews do not become citizen emergency trust score;
27. inventory display differs from reservation;
28. capacity reservation prevents double allocation;
29. unknown capacity is not represented as exact;
30. donated scarce resource cannot be double reserved;
31. external assistant can access local economy capabilities;
32. low-bandwidth user receives text alternative to rich media;
33. translated offer retains original/provenance;
34. cash payment is represented without false platform settlement;
35. assisted provider entry records operator provenance;
36. claimed Emergency Commons revenue allocation reconciles;
37. provider income and platform revenue are separate metrics;
38. public subsidy/residual/refund accounting reconciles;
39. optimization cannot maximize ad impressions over critical utility;
40. integrated market-trust/fairness scenario passes.

## Mandatory R1.33 integrated scenario

A disaster-recovery area has few active providers. SmartAIHub truthfully
marks cleaning-service supply as thin and invites nearby eligible
providers without spamming them. A local worker lists a paid cleaning
service using an assisted voice/operator flow and hides their home
address. A second provider offers a cheaper price but cannot reach the
flooded road; utility ranking prefers the reachable relevant option
without claiming it is universally "best."

A sponsor funds a cleaning subsidy. Eligible households may choose among
qualifying providers; the sponsor receives aggregate impact reporting
but no beneficiary identity. Capacity reservations prevent the same
sponsored slot from being allocated twice.

A heavy-equipment provider claims a regulated/high-risk capability;
promotion remains limited until required credentials are verified.
Another provider repeatedly fabricates "available now" confirmations;
commercial promotion is reduced, while a legitimate emergency road
observation previously submitted by that account remains preserved as
separate evidence.

A restaurant exposes approximate meal capacity. Hundreds of feed users
see availability, but the UI does not claim stock is reserved unless a
reservation exists. The provider updates capacity through API and
reservations reconcile idempotently.

A user without the SmartAIHub app accesses the service through an
external assistant and pays cash directly to a provider; the system
records discovery/contact handoff and does not represent the payment as
platform-settled.

Commercial revenue, provider earnings, sponsor subsidy,
refunds/residuals, feed subsidy, and the represented Emergency Commons
allocation reconcile separately. Product telemetry demonstrates useful
connections and public benefit without optimizing for maximum feed time
or ad impressions.

## R1.33 production gate

R1.33 MUST NOT be considered production-complete until: - thin/empty
market behavior is honest and safe; - price integrity/policy hooks pass
without autonomous legal conclusions; - high-risk provider credentials
are independently verified where required; - contact/lead privacy and
anti-scraping controls pass; - discovery/booking/payment transaction
boundaries are explicit; - sponsor subsidy allocation is bounded,
auditable, and independent of emergency priority; - commercial
manipulation controls cannot corrupt emergency evidence; -
capacity/reservation semantics prevent false stock guarantees/double
allocation; - accessibility/non-app participation paths are supported by
contract; - public-benefit claims reconcile to canonical economic
records; - balanced utility/safety/economic metrics are emitted; - the
mandatory integrated scenario passes end to end.

**End of R1.33 additive review.**

------------------------------------------------------------------------

# R1.34 --- Passes 321--330: Marketplace Governance, Portability, Settlement Resilience & Network Integrity

This review is additive to R1.33. Existing SmartAIHub identity,
credit/economic ledger, Marketplace, sponsorship, emergency authority,
Feed Engine, privacy, audit, and MCP/API contracts remain canonical.

## Pass 321 --- Proportional provider onboarding, identity assurance and low-friction participation

### Gap found

Provider trust controls can become so heavy that small local workers
cannot join, while weak onboarding exposes users to fraud.

### Patch

Add `ProviderAssuranceLevel`: `BASIC`, `IDENTITY_VERIFIED`,
`BUSINESS_VERIFIED`, `CREDENTIAL_VERIFIED`, `HIGH_ASSURANCE`.

Required assurance MUST be proportional to service risk, transaction
mode, value, legal requirement, and data access.

Low-risk local services MAY enter with lightweight onboarding and
visible assurance state. High-risk/regulated services require stronger
evidence.

KYC/business verification MUST NOT be imposed universally when not
legally or operationally necessary.

The system MUST display what was actually verified rather than a generic
badge that implies more.

Assurance upgrades MUST preserve listing/history/provenance.

## Pass 322 --- Tax, invoice, receipt and merchant-of-record boundary

### Gap found

Once SmartAIHub supports paid leads, bookings, subscriptions,
sponsorship, or platform-settled transactions, tax/invoice
responsibility can become ambiguous.

### Patch

Add `TransactionResponsibilityProfile`.

For each commercial flow define: - seller/service provider; - payer; -
payment processor; - merchant-of-record if any; - platform role; -
fee; - tax handling responsibility; - invoice/receipt issuer; - refund
authority; - jurisdiction/currency.

`DISCOVERY_ONLY` and off-platform cash/contact handoff MUST NOT be
represented as SmartAIHub merchant settlement.

Credits used for platform capabilities MUST remain distinguishable from
fiat consideration paid to a provider unless the product contract
explicitly maps them.

Tax calculation/reporting MUST use jurisdiction-specific
integration/policy; LLMs MUST NOT autonomously invent tax obligations.

## Pass 323 --- Cancellation, no-show, partial completion and force-majeure semantics

### Gap found

Recovery work and transport are especially vulnerable to road closures,
renewed flooding, customer absence, provider failure, or partial
completion.

### Patch

Add: - `BookingLifecycle` - `CancellationReason` - `FulfillmentState` -
`ForceMajeureEvent`

Fulfillment states: `PLANNED`, `CONFIRMED`, `IN_PROGRESS`,
`PARTIALLY_COMPLETED`, `COMPLETED`, `CANCELLED`, `FAILED`, `DISPUTED`.

Policies MAY distinguish customer cancellation, provider cancellation,
safety cancellation, inaccessible location, hazard escalation, force
majeure, and mutual cancellation.

A renewed emergency MUST be able to suspend/cancel commercial work
without being misclassified as provider fraud.

Subsidy/credit reservation MUST release or settle according to actual
policy and delivered value.

## Pass 324 --- Reputation integrity, context-specific reputation and portability

### Gap found

A single platform-wide star score can unfairly collapse distinct
contexts and can become a de facto permanent citizen/provider trust
score.

### Patch

Add `ProviderReputationProfile` with context-specific dimensions such
as: - reliability; - responsiveness; - service-category experience; -
fulfillment history; - dispute rate; - freshness discipline; -
credential status.

Emergency report credibility MUST remain separate from commercial
provider reputation.

Ratings/reviews MUST distinguish verified interaction where available
from unverified commentary.

Providers SHOULD be able to export their own non-protected
listing/history/reputation evidence in a portable format where policy
permits.

Imported external reputation MAY be displayed as externally sourced but
MUST NOT be silently treated as SmartAIHub-verified.

## Pass 325 --- Recommendation diversity, concentration risk and small-provider discoverability

### Gap found

Utility ranking plus historical success can create winner-take-all
concentration where large providers dominate, reducing resilience and
local livelihood opportunities.

### Patch

Add `RecommendationDiversityPolicy`.

Subject to safety/relevance: - avoid unnecessary repeated exposure of
the same provider; - preserve category/geographic diversity; - allow new
eligible providers exploration exposure; - monitor concentration; -
prevent sponsored saturation; - preserve free/donated visibility; -
support user sorting/filtering.

Diversity MUST NOT randomly elevate unsafe, stale, unreachable, or
irrelevant providers.

The platform SHOULD measure concentration and small-provider
participation without guaranteeing equal commercial outcomes.

## Pass 326 --- Sponsor conflict-of-interest, exclusivity and editorial separation

### Gap found

A sponsor may also be a retailer, insurer, logistics provider, telecom,
employer, or service seller and may seek preferential visibility or
suppression of competitors.

### Patch

Add `SponsorConflictDisclosure`.

Sponsor agreements MUST explicitly separate: - funding rights; -
branding/acknowledgement; - sponsored placement rights, if purchased
separately; - subsidy-program constraints; -
emergency/editorial/verification/dispatch authority.

A sponsor funding Emergency Commons MUST NOT receive competitor
suppression or default commercial exclusivity unless a separate lawful
commercial placement is clearly disclosed and still passes
utility/safety rules.

Sponsor relationships relevant to displayed commercial content SHOULD be
internally auditable and publicly disclosed where required.

## Pass 327 --- Collusion, subsidy fraud, self-dealing and circular economic abuse

### Gap found

Providers and recipients could coordinate fake jobs, fake subsidy
claims, self-referrals, duplicate identities, or circular transactions
to extract sponsor/credit pools.

### Patch

Add `EconomicIntegrityAssessment`.

Signals MAY include: - repeated reciprocal transactions; -
device/account/payment-link clusters; - impossible fulfillment timing; -
duplicate evidence; - repeated cancellations after subsidy
reservation; - provider-recipient identity overlap; - abnormal referral
loops; - capacity inconsistent with claimed volume.

Fraud signals MUST trigger risk controls/review rather than automatic
criminal conclusions.

Controls MAY include hold, reduced subsidy eligibility, stronger
verification, manual review, or payout delay.

Emergency reporting access MUST remain separated from
commercial/economic sanctions wherever possible.

## Pass 328 --- Settlement failure, processor outage, chargeback and provider payout resilience

### Gap found

The marketplace can be operationally useful while payment processors,
banks, PromptPay rails, card processors, or settlement integrations are
degraded.

### Patch

Add `SettlementAvailabilityState`: `NORMAL`, `DEGRADED`, `UNAVAILABLE`,
`RECONCILING`.

Commercial discovery MAY continue during settlement outage.

Platform-settled booking MUST clearly indicate when payment/settlement
is unavailable rather than silently accepting an unbacked promise.

Where policy allows, off-platform/cash contact handoff MAY remain
available.

Provider payout states MUST be distinct from customer payment success.

Chargeback/refund/reserve handling MUST reuse canonical economic ledger
and must not rewrite service fulfillment facts.

Recovery/reconciliation MUST be idempotent.

## Pass 329 --- Provider/user data ownership, export, deletion and platform exit

### Gap found

A sustainable ecosystem should not trap providers' own catalogs, service
descriptions, media, or operational history solely to preserve platform
lock-in.

### Patch

Add `ProviderDataExport` and `CommercialDataLifecyclePolicy`.

Providers SHOULD be able to export, subject to rights/policy: - their
profile; - listings/offers; - provider-supplied catalog/media
references; - availability history; - transaction/lead records they are
entitled to; - non-protected reputation evidence; - economic statements.

Exports MUST exclude other users' protected data unless independently
authorized.

Deletion/closure MUST distinguish: - public listing removal; - account
closure; - legal/audit/economic retention; - emergency evidence that
must remain under separate authority.

A provider leaving the platform MUST NOT cause historical emergency
facts or completed economic ledger entries to disappear.

API/MCP integrations SHOULD support clean credential revocation and
webhook/subscription shutdown.

## Pass 330 --- Network integrity, sustainability stress test and governance gate

### Gap found

Individual controls can pass while the whole ecosystem still drifts
toward sponsor dominance, provider concentration, excessive
monetization, subsidy leakage, or user lock-in.

### Patch

Add a periodic `ResilienceEconomyGovernanceReview`.

Review dimensions: - public safety access; - free quota adequacy; -
commercial revenue sustainability; - Emergency Commons funding; -
provider earnings/opportunity; - small-provider participation; -
concentration; - sponsor concentration/conflicts; - subsidy
utilization/leakage; - fraud/disputes; - price/freshness integrity; -
accessibility; - user/provider portability; - feed commercial density; -
critical-vs-commercial impression balance; - external MCP/API parity.

Governance review MUST be evidence-based and versioned. It MUST NOT give
sponsors unilateral policy authority.

Recommended stress scenarios: - one sponsor funds most Emergency
Commons; - one provider controls most local transport supply; -
settlement provider outage; - mass subsidy campaign; - rapid provider
influx after disaster; - low-income users exhaust normal quota; - heavy
commercial feed demand; - multiple external-agent clients; - provider
exit/export wave.

The platform MUST retain a viable minimum public-safety service even if
commercial revenue or a major sponsor disappears.

## R1.34 acceptance-test additions

1.  low-risk provider can onboard without unnecessary high-assurance
    KYC;
2.  regulated service requires appropriate assurance;
3.  verification badge describes actual verification scope;
4.  assurance upgrade preserves listing history;
5.  discovery-only flow has correct merchant responsibility;
6.  platform-settled flow identifies merchant/payment/refund roles;
7.  credits are not silently represented as provider fiat payment;
8.  tax policy is not invented by LLM;
9.  hazard escalation can cancel work as safety/force majeure;
10. partial completion settles according to policy;
11. subsidy reservation releases correctly after cancellation;
12. provider reputation does not alter emergency-report trust;
13. verified interaction review distinguished from unverified review;
14. provider reputation export excludes protected user data;
15. imported reputation labeled external;
16. new eligible provider can receive bounded exploration exposure;
17. diversity does not elevate unsafe/stale provider;
18. sponsored saturation limit works;
19. free/donated offer retains visibility;
20. sponsor funding does not suppress competitors;
21. sponsor commercial placement remains separately disclosed;
22. sponsor conflict is auditable;
23. circular subsidy transaction raises risk signal;
24. risk signal does not autonomously make criminal conclusion;
25. commercial fraud sanction does not block critical emergency report;
26. settlement outage preserves discovery;
27. unavailable platform payment is clearly shown;
28. provider payout state distinct from customer payment;
29. chargeback does not rewrite fulfillment history;
30. settlement reconciliation idempotent;
31. provider can export own catalog/listing history;
32. export excludes protected beneficiary data;
33. provider closure preserves required economic ledger;
34. provider closure preserves independent emergency evidence;
35. API credential revocation stops future access;
36. governance review detects sponsor concentration;
37. governance review detects provider concentration;
38. system survives loss of major sponsor;
39. system survives settlement-provider outage;
40. integrated network-integrity scenario passes.

## Mandatory R1.34 integrated scenario

Following a flood, hundreds of small providers join. Low-risk cleaning
workers use lightweight onboarding while electrical and structural
services require stronger credentials. A sponsor funds a large recovery
subsidy but also owns a service company; sponsor funding cannot suppress
competitors or silently force beneficiaries to use the sponsor's
company.

A household books cleaning, but renewed flooding makes the property
inaccessible. The booking is cancelled under safety/force-majeure
semantics, subsidy reservation is released, and the provider is not
automatically marked fraudulent.

A collusive group attempts circular subsidy claims; the economic
integrity system places the claims under review without blocking those
users from submitting genuine emergency reports.

The primary payment processor fails. Local discovery, contact relay,
free resources, and permitted cash/off-platform handoff continue while
platform settlement is clearly unavailable. Reconciliation later
restores canonical economic state without rewriting service fulfillment.

A dominant provider begins receiving excessive recommendation exposure.
Diversity controls create bounded exploration opportunities for other
safe/relevant providers without sacrificing utility.

A provider later exits SmartAIHub and exports its own permitted
catalog/history. Protected customer data remains protected, while
required economic and emergency records remain in canonical retention.

Finally, the largest sponsor withdraws. Minimum public-safety feed,
critical alerts, and emergency reporting continue under resilience
policy while commercial/subsidized features degrade according to funding
availability.

## R1.34 production gate

R1.34 is not production-complete until: - provider assurance is
proportional to risk; - merchant/tax/receipt responsibilities are
explicit per transaction mode; - cancellation/partial/force-majeure
settlement is deterministic; - reputation remains context-specific and
portable; - recommendation diversity controls concentration without
reducing safety; - sponsor conflicts cannot buy emergency/editorial
authority; - collusion/subsidy abuse controls preserve emergency
access; - settlement outages degrade safely; - provider/user data
portability and closure semantics pass; - ecosystem-level governance
detects concentration and funding dependency; - minimum public-safety
service survives major sponsor and settlement-provider loss; - mandatory
integrated scenario passes end to end.

**End of R1.34 additive review.**

------------------------------------------------------------------------

# R1.35 --- Thailand Tax, Accounting Evidence, Withholding & Financial Control Addendum

## Purpose

SmartAIHub's Mutual-Benefit Resilience Economy can receive platform
revenue, sponsorship, donations/contributions, commercial fees,
subscriptions, credits, service commissions, and other inflows; and can
pay providers, contractors, sponsored services, public-benefit programs,
refunds, infrastructure, and other expenses.

For Thailand operations, the system MUST preserve complete financial
evidence so that tax/accounting treatment can be determined from the
actual transaction, legal entity, counterparty, purpose, evidence, and
law applicable at that time.

### Core accounting invariant

> EVERY REAL MONEY INFLOW AND OUTFLOW MUST ENTER THE CANONICAL FINANCIAL
> RECORD BEFORE TAX OR ACCOUNTING CLASSIFICATION.

The system MUST NOT make money disappear from accounting merely because
a business label says `DONATION`, `SPONSORSHIP`, `SUBSIDY`,
`FREE_EMERGENCY`, `COMMUNITY_SUPPORT`, or similar.

However:

> BUSINESS LABEL != TAX TREATMENT.

A receipt called a donation/sponsorship/contribution is not
automatically taxable or tax-exempt merely because of its label.
Classification MUST be determined under applicable Thai law, recipient
legal status, transaction substance, supporting evidence, and approved
accounting/tax policy.

LLMs MAY assist classification/explanation but MUST NOT be the final
authority for tax liability.

## 1. Canonical Financial Event

Add `FinancialEvent` as an accounting projection/reference over the
existing canonical economic ledger; it MUST NOT become a second money
ledger.

Minimum fields: - event ID; - economic-ledger reference; - legal
entity/tenant; - transaction date/time; - accounting effective date; -
payer; - payee; - gross amount; - currency; - fee; - withholding amount
where applicable; - net cash movement; - VAT/tax components where
applicable; - business-purpose code; - preliminary accounting class; -
tax classification status; - sponsorship/donation/subsidy program
reference; - payment rail/reference; - evidence bundle; - approver where
required; - reconciliation state; - correction/reversal reference.

Never overwrite an accounting correction. Use append/reversal/corrective
entries with traceability.

## 2. Gross inflow completeness

All actual inflows MUST be captured, including: - platform fees; -
subscription; - credit purchases/top-ups; - commercial API/MCP
charges; - sponsored placement; - marketplace/service fees; -
sponsorship; - donations/contributions; - government/NGO funding; -
recovery-program funding; - interest/other income where applicable; -
refunds recovered/chargeback reversals; - other receipts.

The platform MUST be able to reconcile:
`economic ledger ↔ payment processor/bank/PromptPay ↔ accounting export`.

Unclassified inflow MUST remain visible in a suspense/unclassified state
and MUST NOT be omitted from reporting.

## 3. Tax classification

Add `TaxClassification` with: - jurisdiction; - legal entity; -
transaction nature; - counterparty type; -
taxable/exempt/non-income/other classification as supported by policy; -
VAT treatment if applicable; - withholding treatment; - legal/policy
rule reference; - effective version/date; - reviewer/approval; -
confidence/status.

Statuses: `UNCLASSIFIED`, `SYSTEM_PROPOSED`, `REVIEW_REQUIRED`,
`APPROVED`, `CORRECTED`.

Tax rules MUST be versioned/effective-dated. Do not permanently
hard-code a temporary Revenue Department measure into transaction
semantics.

## 4. Expense evidence and identifiable recipient

Add `ExpenseEvidenceBundle`.

For expenses claimed or represented as business/public-benefit
expenditure, preserve where applicable: - recipient/payee identity; -
taxpayer/business identifier where required/available; - address/contact
required by document type; - invoice/receipt/tax invoice; - payment
proof; - contract/order/engagement; - service/goods description; -
delivery/acceptance evidence; - approver; - program/incident/sponsorship
purpose; - withholding certificate/reference; - VAT evidence; -
bank/payment transaction reference; - exception reason and approval if
ordinary evidence cannot be obtained.

An outgoing bank transfer alone SHOULD NOT automatically prove
deductible business expense.

The system MUST distinguish: `MONEY_PAID` from
`EXPENSE_EVIDENCE_COMPLETE` from `TAX_DEDUCTIBILITY_APPROVED`.

If evidence is insufficient, the payment remains in financial history
but is flagged for accounting/tax review rather than being silently
treated as deductible.

## 5. Withholding tax

Add `WithholdingTaxObligation` and `WithholdingCertificateRef`.

Before/at relevant payments, the system SHOULD evaluate whether Thai
withholding rules apply based on payer/payee/type/amount/contract and
effective law/policy.

Where withholding applies, preserve: - gross payable; - withholding
base/rate; - withheld amount; - net paid; - certificate reference; -
filing/remittance period; - status; - correction.

Withholding obligations MUST be based on tax policy/rules, not inferred
casually by an LLM.

## 6. Donation/sponsorship/subsidy separation

Maintain separate business dimensions: - `DONATION/CONTRIBUTION` -
`SPONSORSHIP` - `COMMERCIAL_PROMOTION` - `SERVICE_SUBSIDY` -
`GOODS_SUBSIDY` - `PUBLIC_FEED_SUBSIDY` - `EMERGENCY_COMMONS_FUNDING`

But accounting/tax classification is independent.

Sponsor branding or commercial consideration can materially change
transaction substance and MUST be visible to accounting review.

Public statements that money was allocated to Emergency Commons or
beneficiaries MUST reconcile to actual ledger-backed
expenditure/reservation, not merely a marketing allocation.

## 7. Payout/payee verification

Before platform-controlled payout, require policy-appropriate payee
verification.

Controls MAY include: - payee name/account match; - tax identity where
required; - provider/organization identity; - bank/payment
destination; - duplicate recipient detection; - sanctioned/blocked
status where applicable; - payout purpose; - approval thresholds.

Emergency urgency MAY permit narrowly defined exceptions, but exception
payout MUST retain evidence, approver, reason, amount, recipient
information available at the time, and subsequent remediation
requirements.

## 8. Accounting periods, close and immutability

Add `AccountingPeriodControl`.

Support: - open/soft-close/hard-close; - late evidence; - adjusting
entry; - reversal; - correction; - period lock; - authorized reopen; -
audit trail.

Closed-period records MUST NOT be silently edited to make reconciliation
match.

Late documents attach to the original transaction while accounting
treatment follows approved period policy.

## 9. Reconciliation and exception queues

Mandatory reconciliations SHOULD include: - bank/PromptPay; -
card/payment processor; - credit/economic ledger; - provider payout; -
sponsor pool; - subsidy reservation/settlement; - refund/chargeback; -
withholding payable/remittance; - accounting export.

Add exception queues: - unmatched inflow; - unmatched outflow; - missing
receipt; - unknown payee; - missing tax ID where required; - withholding
mismatch; - duplicate document; - amount mismatch; - sponsor-purpose
mismatch; - stale unreconciled item.

Financial exception MUST NOT rewrite emergency factual history.

## 10. Document integrity and audit

Financial evidence SHOULD preserve: - immutable original/reference; -
checksum; - upload/source provenance; - issuer; - issue date; - document
number; - linkage to transaction; - extraction result if OCR/AI used; -
human correction; - duplicate detection; - retention class.

AI extraction is assistance only. Original document remains
authoritative evidence.

Access to tax IDs, bank details, receipts, and identity documents MUST
be role/purpose restricted and audited.

## 11. Accounting export / accountant workflow

Provide accountant/auditor-oriented exports or integrations for: -
journal-ready financial events; - receipts/invoices; - payout
evidence; - withholding schedules/certificates; - sponsor/subsidy
schedules; - bank reconciliation; - exception report; - revenue-purpose
allocation; - period corrections.

The platform SHOULD allow accountants to approve/correct classification
without mutating operational emergency records.

## 12. Thailand legal-policy update mechanism

Thai tax treatment changes over time.

Add `ThailandTaxPolicyPack` as a versioned policy/configuration layer,
not a new authority.

It SHOULD reference effective Revenue Department rules/announcements and
support controlled updates with: - effective date; - source/reference; -
reviewer; - migration impact; - test cases; - rollback/version history.

Tax/legal policy changes SHOULD be reviewed by qualified Thai
accounting/tax professionals before production activation where
material.

## Acceptance tests

1.  every bank inflow maps to a financial event or exception;
2.  donation label cannot bypass financial recording;
3.  sponsorship label cannot determine tax treatment alone;
4.  unclassified receipt remains reportable;
5.  gross/net/fee/withholding amounts reconcile;
6.  outgoing transfer without evidence is not automatically deductible;
7.  missing payee identity raises exception;
8.  receipt attaches to correct payment;
9.  duplicate receipt detected;
10. withholding obligation uses versioned policy;
11. withholding certificate links to payment;
12. payment correction uses reversal/adjustment, not destructive edit;
13. closed accounting period blocks silent mutation;
14. late evidence preserves original transaction date;
15. sponsor allocation reconciles to ledger;
16. Emergency Commons public-benefit claim is ledger-backed;
17. provider payout reconciles to payment rail;
18. refund/chargeback reconciles separately;
19. tax/accounting correction does not alter incident facts;
20. sensitive financial evidence is access-controlled;
21. AI-extracted receipt never replaces original evidence;
22. tax policy update is effective-dated;
23. historical transaction retains historical policy version;
24. accountant can correct classification without altering cash history;
25. emergency payout exception requires reason/approver/remediation;
26. cash/off-platform transaction is not falsely booked as platform
    cash;
27. commercial lead fee separated from provider service income where
    applicable;
28. sponsor branding/consideration visible to classification;
29. unmatched PromptPay receipt enters exception queue;
30. economic ledger and accounting export reconcile;
31. sponsor pool and subsidy settlement reconcile;
32. withholding payable and remittance reconcile;
33. unknown tax treatment cannot silently default to exempt;
34. unknown tax treatment cannot silently default to deductible;
35. provider closure preserves statutory/audit financial records;
36. document checksum/provenance survives export;
37. role without accounting purpose cannot read tax/bank evidence;
38. tax-policy rollback preserves historical classification provenance;
39. accountant/auditor export includes evidence references;
40. end-to-end Thai accounting-control scenario passes.

## Mandatory scenario

SmartAIHub receives platform subscriptions, provider promotion credits,
a corporate sponsorship payment, a contribution described by the payer
as a donation, and funding for a cleaning subsidy. Every inflow is
recorded gross and reconciled to the actual payment rail before tax
classification. The donation description does not cause automatic
exclusion from taxable accounting treatment; the Thailand Tax Policy
Pack and authorized accounting review determine treatment based on the
actual legal facts.

SmartAIHub pays local cleaning providers under the subsidy program. Each
payout preserves identifiable payee information, engagement/service
evidence, payment proof, and withholding treatment where applicable. One
provider lacks sufficient supporting evidence: the cash outflow remains
recorded but enters an accounting exception and is not silently treated
as a deductible expense.

A withholding obligation is identified under the effective policy,
gross/net/withheld amounts reconcile, and certificate/remittance
references are retained. Later, an accounting document arrives after
period close; the system uses a controlled adjustment rather than
editing history.

Public reporting states that a defined amount funded Emergency Commons.
That amount must reconcile to canonical allocation/expense records. No
sponsor, donation, or emergency label is permitted to bypass accounting
completeness, evidence requirements, or audit controls.

**End of R1.35 Thailand Tax & Accounting Evidence Addendum.**

------------------------------------------------------------------------

# R1.36 --- Passes 331--340: Thai Financial Controls, VAT, WHT, Restricted Funds & Audit Readiness

This revision strengthens R1.35. It does not replace the canonical
economic ledger or accounting system. Legal/tax rates, thresholds, forms
and deadlines remain versioned policy, not hard-coded domain truth.

## Pass 331 --- Double-entry accounting projection and subledger integrity

### Gap found

A complete FinancialEvent trail is necessary but not sufficient for
formal accounting. Economic events must be transformable into balanced
journal entries and reconcilable subledgers.

### Patch

Add `AccountingJournalProjection`, `JournalEntry`, `JournalLine`,
`AccountMappingRule`, `SubledgerReference`.

Every posted journal entry MUST balance debit/credit under the
configured accounting basis. Mapping from economic event to journal MUST
be versioned and reproducible.

Subledgers SHOULD separately support receivables/payables, provider
payouts, sponsor/restricted funds, credits/deferred obligations where
applicable, taxes, refunds/chargebacks and cash/bank.

Operational event correction MUST produce accounting adjustment/reversal
rather than destructive journal mutation.

## Pass 332 --- VAT and tax-document readiness, including electronic document integration

### Gap found

R1.35 captures tax classification but does not explicitly model
VAT/tax-invoice lifecycle and electronic tax-document readiness.

### Patch

Add `TaxDocument`, `VATTreatment`, `TaxInvoiceLifecycle`.

Support document roles as applicable: invoice, receipt, tax invoice,
abbreviated tax invoice, credit note, debit note, withholding
certificate and electronic equivalents.

Fields SHOULD preserve issuer/recipient tax identity where required,
document number, issue date, taxable base, VAT, total, currency,
original/correction/cancellation relation, delivery status and external
e-document reference.

Whether SmartAIHub must issue a particular tax document depends on legal
entity/transaction role and effective Thai policy.

Electronic tax-document integration MUST preserve authoritative source,
signature/integrity metadata where applicable, acknowledgement/status
and immutable linkage to the FinancialEvent.

## Pass 333 --- Withholding lifecycle, filing/remittance and certificate state machine

### Gap found

Calculating withholding is insufficient. The lifecycle includes
deduction, certificate, filing, remittance, correction and
reconciliation.

### Patch

Expand `WithholdingTaxObligation` states: `ASSESSED`, `WITHHELD`,
`CERTIFICATE_PENDING`, `CERTIFICATE_ISSUED`, `FILE_PENDING`, `FILED`,
`REMIT_PENDING`, `REMITTED`, `RECONCILED`, `CORRECTED`, `CANCELLED`.

Preserve form/reporting category under versioned policy.

Certificate number/version/replacement history MUST be traceable.

Agent/representative arrangements, if used, MUST preserve explicit
authority and who acts for whom.

The system MUST detect withheld-but-not-remitted and
remitted-but-unmatched exceptions.

## Pass 334 --- Restricted sponsor funds and purpose-bound fund accounting

### Gap found

Sponsor money can be legally/accountingly available yet contractually
restricted to a specific purpose. Ordinary cash balance does not prove
funds are freely spendable.

### Patch

Add `RestrictedFund`, `FundRestriction`, `FundRelease`,
`FundTransferAuthorization`.

Track: - funding source; - permitted purposes; -
geography/program/time; - restricted/unrestricted balance; -
committed/reserved/spent/refunded balance; - expiry/return rules; -
approval conditions.

Cash fungibility MUST NOT erase purpose restrictions.

A payment from the same bank account may still consume a specific
restricted fund only when policy and evidence permit.

Public claims about sponsor usage MUST reconcile both cash movement and
purpose restriction.

## Pass 335 --- Cash, PromptPay and ambiguous payment matching

### Gap found

Thai operations may receive QR/PromptPay/bank/cash payments with
incomplete references, duplicate uploads or payer names that differ from
account identities.

### Patch

Add `PaymentMatchCandidate`, `PaymentMatchDecision`,
`CashReceiptControl`.

Matching signals MAY include amount, timestamp, bank reference, QR
payload/reference, payer name, order/quote, expected amount and uploaded
evidence.

Never auto-match solely on equal amount when ambiguity exists.

Duplicate slip/image detection MUST NOT alone prove duplicate payment;
bank/processor transaction identity remains material.

Manual match/unmatch requires audit reason.

Cash collection, if supported, requires accountable collector,
receipt/reference, handover/deposit reconciliation and exception
handling.

## Pass 336 --- Expense approval, segregation of duties and related-party controls

### Gap found

Strong evidence can still be fraudulent if the same person creates a
vendor, approves the expense and controls payout.

### Patch

Add `FinancialApprovalPolicy`, `ApprovalRole`, `RelatedPartyDisclosure`.

High-risk/value flows SHOULD separate, according to policy: -
provider/vendor creation; - evidence submission; - expense approval; -
payout approval; - bank/payment execution; - reconciliation; -
accounting classification.

Emergency exceptions MAY compress roles only under explicit bounded
emergency authority and retrospective review.

Related-party/self-dealing indicators MUST be disclosed and auditable.

No sponsor, provider or employee should be able to approve their own
controlled payout where policy prohibits it.

## Pass 337 --- Advances, reimbursements, petty cash and emergency procurement

### Gap found

Emergency operations often require staff/volunteers to pay first,
receive advances, buy locally, or use petty cash where formal
procurement is impossible.

### Patch

Add `CashAdvance`, `ReimbursementClaim`, `EmergencyProcurementRecord`,
`AdvanceSettlement`.

Advance lifecycle: `REQUESTED`, `APPROVED`, `DISBURSED`,
`PARTIALLY_SETTLED`, `SETTLED`, `OVERDUE`, `RECOVERABLE`,
`WRITTEN_OFF_BY_POLICY`.

Require purpose, recipient, amount, evidence deadline, receipts where
obtainable, unused cash return and exception documentation.

Missing ordinary receipt during genuine emergency does not erase cash
movement; it triggers documented exception/remediation and accounting
review.

Reimbursement MUST not duplicate an already platform-paid expense.

## Pass 338 --- Capital asset, inventory and expense classification boundary

### Gap found

Emergency purchases can include laptops, radios, generators, pumps,
vehicles, equipment and stocked goods. Treating everything as immediate
expense can distort accounting.

### Patch

Add `AcquiredAssetRef`, `InventoryAcquisitionRef`,
`AccountingClassificationDecision`.

Accounting policy determines whether an acquisition is expense,
inventory, prepaid/deferred item, or capital asset.

For controlled assets preserve custodian/location/status/acquisition
reference where material.

Donation of an asset, disposal, loss or transfer MUST create traceable
lifecycle events.

Operational resource inventory and accounting inventory MAY reference
one another but MUST NOT become duplicate authorities.

## Pass 339 --- Document retention, audit package and privacy-aware statutory preservation

### Gap found

Financial evidence may need long retention while PDPA/minimum-necessary
principles discourage unnecessary exposure.

### Patch

Add `FinancialRetentionPolicy` and `AuditPackage`.

Retention MUST be policy/effective-date based by document/record class
and legal entity.

Expiry/deletion workflow MUST respect legal hold, tax/accounting
retention, dispute, audit and emergency-evidence authorities.

Sensitive tax ID/bank/identity fields SHOULD support
masking/tokenization in ordinary UI while authoritative evidence remains
restricted.

AuditPackage SHOULD reproducibly collect journal refs, bank/payment
refs, evidence, approvals, tax documents, WHT records, sponsor
restrictions and reconciliation results for a selected period/program.

## Pass 340 --- Year-end close, audit readiness, policy-change migration and financial disaster recovery

### Gap found

The design needs a complete close/audit cycle and resilience against
policy changes or partial system failure.

### Patch

Add `FinancialCloseRun` and `FinancialControlHealth`.

Close checks SHOULD include: - unclassified inflows/outflows; -
unbalanced journal projections; - unreconciled bank/payment items; -
open advances; - missing expense evidence; - WHT pending/remittance
exceptions; - VAT/tax-document exceptions; - sponsor/restricted-fund
reconciliation; - provider payout exceptions; - refunds/chargebacks; -
period adjustments; - audit evidence integrity.

Policy changes MUST be effective-dated and test historical versus
prospective treatment.

Backup/recovery MUST preserve ledger ordering, journal integrity,
evidence references and idempotent reconciliation.

Financial recovery MUST NOT mutate emergency factual history.

Production must support accountant/auditor review without granting
unnecessary emergency/victim-data access.

## R1.36 acceptance-test additions

1.  every posted journal entry balances;
2.  economic correction creates accounting adjustment not destructive
    edit;
3.  subledger reconciles to general-ledger projection;
4.  VAT treatment is versioned;
5.  tax invoice links to financial event;
6.  credit/debit note preserves original document relation;
7.  electronic tax-document status/provenance retained;
8.  WHT deduction enters lifecycle;
9.  WHT certificate replacement history preserved;
10. withheld-but-not-remitted raises exception;
11. remittance reconciles to obligation;
12. representative WHT action requires authority record;
13. sponsor restricted balance cannot fund unrelated purpose;
14. restricted fund reservation/spend/refund reconciles;
15. bank cash balance does not override fund restriction;
16. equal-amount PromptPay candidates remain ambiguous when necessary;
17. duplicate slip does not alone prove duplicate payment;
18. manual payment match/unmatch is audited;
19. cash receipt reconciles collector-to-deposit;
20. same actor cannot self-approve prohibited payout;
21. emergency approval override is bounded and reviewed;
22. related-party disclosure is retained;
23. advance settlement tracks unused return;
24. overdue advance raises exception;
25. reimbursement cannot duplicate platform-paid expense;
26. emergency missing-receipt exception remains visible;
27. equipment purchase can classify as asset;
28. inventory acquisition links operational and accounting refs without
    duplicate authority;
29. asset disposal/loss is traceable;
30. financial retention policy respects legal hold;
31. ordinary UI masks sensitive financial identity fields;
32. audit package reproduces evidence/approval/tax links;
33. year-end close detects unclassified inflow;
34. close detects unreconciled WHT;
35. close detects restricted-fund mismatch;
36. historical transaction retains old policy treatment;
37. prospective policy update uses new effective version;
38. backup/recovery preserves journal/evidence integrity;
39. accountant access does not imply victim-data access;
40. integrated Thai financial-control scenario passes.

## Mandatory R1.36 integrated scenario

SmartAIHub receives subscription revenue, a PromptPay provider promotion
payment, and sponsor funds restricted to flood-recovery cleaning. All
cash movements reconcile to FinancialEvents and balanced journal
projections. Two PromptPay payments have the same amount; the system
refuses an unsafe automatic match until additional transaction evidence
resolves them.

The sponsor funds cannot be used for unrelated platform advertising
merely because all money is held in the same bank account. A cleaning
provider payout requires appropriate approval, evidence and WHT handling
under the effective policy. The WHT lifecycle proceeds from assessment
through certificate, filing/remittance and reconciliation.

An emergency field coordinator receives a cash advance to buy pumps and
supplies. Some purchases have normal receipts, one has a documented
emergency exception, unused cash is returned, and the pump acquisition
is classified under accounting policy rather than automatically
expensed.

A tax-document correction creates a linked correction/credit/debit
workflow without erasing the original. At period close, the system
detects one unreconciled withholding item and blocks clean-close status
until resolved or formally excepted.

An auditor receives an AuditPackage with journal, payment, evidence,
approval, tax-document, WHT and restricted-fund references, while
unrelated victim/private emergency data remains inaccessible.

**End of R1.36 additive review.**

------------------------------------------------------------------------

# R1.37 --- Cloudflare-First Delivery Without Legacy Compatibility

This addendum is normative and takes precedence over any earlier Spec 260
wording that could be interpreted as requiring continued support for an
older SmartAIHub runtime, application client, route, schema contract, or
deployment path. Earlier review text remains as historical provenance;
it does not authorize legacy compatibility in the Spec 260 product.

## 1. Runtime and route authority

1. New Spec 260 production pages, APIs, and background-work consumers MUST
   use the approved Cloudflare-first application/runtime architecture.
2. Spec 260 MUST NOT introduce legacy runtime dispatch, traffic splits,
   dual-run/shadow routes, dual writes, compatibility adapters, obsolete
   service imports, or automatic fallback to a previous non-Cloudflare
   service.
3. One canonical route manifest MUST define public, authenticated,
   verified, and operations surfaces. `packages/shared/src/emergencyRouteManifest.ts`
   is the shared route contract consumed by the browser router and the
   Spec 260 Cloudflare Worker registration/tests. No Spec 260 route may
   redirect to a retired or legacy application surface.
4. Public emergency information and the minimum anonymous reporting path
   MUST remain available when account services are unavailable, subject
   to the public projection and abuse controls in this specification.
   Account-service outage means login/session/profile/credit service
   degradation; it does not include loss of authoritative PostgreSQL
   storage. Anonymous report acceptance is confirmed only after the
   emergency fact and its outbox record commit atomically in PostgreSQL.
   If that authority is unavailable, the client MUST show an explicit
   unavailable or locally-unsubmitted state and MUST NOT claim that KV,
   R2, a Queue, or a client-side draft accepted the report.

## 2. Client and data evolution

1. Old SmartAIHub client releases are not supported deployment targets
   for Spec 260. API version fields MAY be used for explicit safe evolution
   and standards-based external interoperability; they MUST NOT preserve
   obsolete client behavior or silently reinterpret an old payload.
2. Forward-only, additive, replay-safe migrations required by the
   authoritative schema are allowed. Spec 260 MUST NOT add dual-schema
   reads/writes for obsolete application behavior, compatibility shims,
   or rollback to the old runtime.
3. Database changes MUST preserve every accepted emergency and financial
   fact. A deployment rollback MAY select a prior Cloudflare release only
   when that release can safely process all accepted records. Otherwise,
   use a fenced forward fix or a controlled service hold; never erase or
   reinterpret accepted facts to make an older release work.
4. Offline mutation recovery, stable idempotency, explicit version errors,
   consent, auditability, and legal retention remain required product
   behavior. They are not old-client compatibility mechanisms.

## 3. Canonical platform authorities

Cloudflare placement MUST follow the existing platform contracts. It MUST
NOT create a second authority:

- PostgreSQL/PostGIS remains authoritative for emergency, geospatial,
  sponsorship, and financial business state.
- `worker_jobs` and the transactional outbox remain authoritative for
  durable background-work admission, leases, fencing, and settlement;
  Cloudflare Queues are delivery transport only.
  Producers MUST persist an emergency business fact and its outbox event
  in one PostgreSQL transaction. The canonical outbox publisher emits
  reference-only, idempotent envelopes. Queue consumers MUST use the
  canonical fenced job lease and MUST NOT create the originating business
  fact or settle work outside that authority.
- Existing platform identity/authorization, tenant scope, credit and
  accounting, audit, media, model routing, Skills, and notification
  authorities remain canonical.
- The Spec 260 Cloudflare Worker owns all new public, authenticated,
  verified, and operations HTTP endpoint registration and delegates
  identity/authorization to the canonical platform contracts. KV/CDN are
  non-authoritative caches with explicit freshness limits. R2 objects
  MUST be referenced by canonical media/evidence records; R2 MUST NOT
  become authoritative for metadata/state, client-controlled object keys
  MUST NOT be trusted, and private objects MUST be served only through
  authorization and the approved short-lived media broker. Public
  derivatives require an explicit approved projection. Durable Objects
  are used only for a concrete coordination or realtime need. Hyperdrive
  follows the approved database connection contract. No service is
  promoted to an authority solely because Cloudflare offers it.

Integrating a canonical authority means using its current contract; it
does not authorize retaining a retired runtime or reintroducing a system
listed as prohibited by repository instructions.

This addendum does not change the migration state or routing of unrelated
platform features. Every Spec 260 background dispatch MUST select its
Cloudflare adapter/binding explicitly and fail closed when unavailable;
it MUST NOT silently select another scheduler or transport as a fallback.
This requirement MUST NOT be implemented by globally removing or
redirecting unrelated platform job transports in this feature.

For Spec 260, “Sandbox” means only the approved Cloudflare Container
runtime when an isolated execution boundary is required. Do not create,
import, call, enable, or route through OpenSandbox, `sandbox_jobs`,
Docker/OpenSandbox dispatch, Agency, `work/request`, `work/requests`,
`workpacks/*`, `/workflows`, or the legacy custom workflow engine.
“Agency feeds” in earlier text means authorized public-authority or
external partner feeds and never the retired SmartAIHub Agency system.

## 4. Verification and release sequence

1. During implementation, developers MAY add unit, contract, component,
   API, browser, migration, fake-binding, and local integration tests.
   These tests MUST NOT be reported as proof of real Cloudflare behavior.
2. Real Cloudflare resource provisioning, credential probes, binding
   checks, deployment, canaries, provider delivery checks, and live
   observability verification are deferred until all Spec 260
   implementation sections and local/CI release gates are complete.
3. The first real Cloudflare check MUST exercise the integrated release
   candidate in an isolated staging environment. Fixes found there return
   through local/CI verification and require a complete integrated staging
   rerun; do not promote piecemeal unverified changes.
4. Staging evidence and production evidence MUST be reported separately.
   Production readiness remains unverified until production evidence is
   collected under an explicit release decision.

## 5. External interoperability

CAP, MCP, authorized public-authority/partner feeds, and other external standards or integrations
explicitly required by Spec 260 remain supported under their own trust,
authorization, provenance, privacy, and version contracts. Standards
interoperability is not backward compatibility with an older SmartAIHub
runtime or client.

**End of R1.37 normative Cloudflare-first delivery addendum.**

---

# R1.38 Downstream Geospatial Integration Alignment

This additive amendment records the integration boundary for Spec 262. It does not declare Spec 260 implementation complete, replace any canonical authority, or alter the requirements of R1.0–R1.37 except where it clarifies how a downstream geospatial feature integrates with them.

1. **Dependency status:** Spec 260 remains the canonical emergency-domain contract and its implementation status is tracked by `specs/feature/260-smartaihub-all-hazards-emergency-crisis-intelligence/implementation/progress.md`. Spec 262 may proceed with independently additive work while Spec 260 is in progress. Any slice depending on an unfinished Spec 260 contract, route, projection, authorization path, worker executor, or UI integration remains gated until that dependency is implemented and passes its required local integrated verification. Neither spec may claim completion on behalf of the other.
2. **Existing chat surface:** Geospatial Map/Feed conversational actions use the existing application-wide **AI Chat & Feedback** panel and its **AI Chat**, **Task Control**, and **Send Feedback** tabs. The current implementation is the shared panel wired through `FeedbackButton` and `ChatView`/the existing Task Control panel. “Global Mini Chat” is a product-level alias for this shared entry point, not a requirement to create a separate map chat, route, conversation authority, or composer. If no canonical conversation exists, the existing panel may create one through its normal lifecycle.
3. **Context and user action:** Map/Feed may attach bounded, permission-safe canonical references to the existing AI Chat turn. The shared Chat backend remains authoritative for conversation handling and authorization. Context MUST NOT submit a message, start a task, or invoke another side effect without the user's action through the existing panel. Task Control and Send Feedback remain in their existing tabs and flows.
4. **Durable work:** Geospatial ingestion, backfill, and material recomputation that require durable asynchronous execution use `worker_jobs` and the transactional outbox with the existing lease/fencing/idempotency/retry/settlement contracts. Cloudflare Queues remain delivery transport only; no geospatial subsystem may add an alternate scheduler or job authority.
5. **Coordinated contract changes:** A necessary shared-contract change is documented as a versioned additive amendment with impact and acceptance criteria in both Spec 260 and Spec 262 (or in their explicitly linked canonical contract). Until then, downstream implementation uses the existing Spec 260 contract or remains gated.
6. **Route ownership:** Existing public emergency map URLs, dashboard entry points, and API registrations remain owned by the shared `packages/shared/src/emergencyRouteManifest.ts` and its current consumers. Spec 262 geospatial deep links or shortcuts MUST extend that manifest additively and MUST NOT register a parallel route/navigation authority.

**End of Spec 260 R1.38 downstream geospatial integration amendment.**
