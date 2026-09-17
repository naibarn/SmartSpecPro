# Feature 196 — SmartAIHub Universal Goal Orchestration
## Capability & Expertise Graph + Solution Optimizer + Universal Command Gateway + Multi-Channel/Mobile Experience

**Status:** Architecture & Implementation Specification  
**Priority:** P0/P1 Platform Foundation  
**Feature ID:** 196  
**Recommended path:** `specs/feature/196/spec.md`  
**Depends on:** Feature 195 Unified Async Job Control Plane
**Companion architecture:** Feature 197 SmartAIHub Runner Adaptive Execution Fabric  
**Primary purpose:** Allow users or external assistants to state desired outcomes without knowing which Agent, Skill, Plugin, model, provider, runtime or device must be used.
**Current codebase implementation status:** Partial; this document defines the target Goal/Plan/Capability/Command architecture and must not be read as evidence that all durable registries or user flows already exist.

---

# 0. Executive Summary

SmartAIHub must become a **goal-oriented meta-orchestrator**, not merely a collection of models, Skills or Agents.

A user should be able to say:

```text
สรุปข่าว AI ให้ทุกเช้า
```

or:

```text
สร้างการ์ตูน 3D ตลก 2 นาทีให้ทุกวัน แล้วเตรียมไว้โพสต์ Facebook
```

or:

```text
วิดีโอที่เพิ่งถ่ายมาช่วยตัดให้กระชับ ใส่ subtitle และเก็บไว้ให้ฉันตรวจ
```

without needing to understand:

- Grok Bot
- Claude / Claude Code
- Codex
- Gemini
- Hermes
- AutoClaw
- OpenClaw
- ComfyUI
- FFmpeg
- Seedance
- KIE / fal / WaveSpeed
- SmartAIHub Runner
- Cloudflare Containers
- Plugins / Skills / Agents

SmartAIHub must know:

1. what the user wants
2. what capabilities are required
3. what SmartAIHub itself is professionally good at
4. what professional Plugins/Skills/Agents are installed/available
5. what external Agents the user already owns/uses
6. what devices/runtimes are online
7. what providers/models are currently available
8. what each option costs
9. expected quality/speed/reliability/privacy/control
10. which option best matches current user preferences and constraints

The output of Feature 196 is a **Compiled Execution Plan / Job Graph** consumed by Feature 195.

---

# 1. Strategic Product Position

SmartAIHub SHOULD be positioned as:

> **Meta-Orchestrator + Professional Capability Platform + Execution Broker**

It sits above individual agent/model ecosystems.

```text
User / External Assistant
        ↓
SmartAIHub Goal Orchestrator
        ↓
Capability & Expertise Graph
        ↓
Solution Optimizer
        ↓
Compiled Plan
        ↓
Feature 195 Job Control Plane
        ↓
Feature 197 Runner/Execution Fabric + managed backends
        ↓
Runner-hosted local tools / Providers / Cloud / Remote Services
```

This allows new technologies to be added as implementations of capabilities rather than requiring architecture redesign.

---

# 2. Core Separation of Concerns

## 2.1 Feature 196 asks:

```text
What does the user want?
What must be done?
Who/what can do each part?
Which combination should be used?
What trade-offs exist?
```

## 2.2 Feature 195 asks:

```text
How is the selected work queued?
Where is capacity available?
Which provider account/node executes it?
How is it retried/monitored/billed?
```

## 2.3 Feature 197 defines:

```text
How does Runner discover and expose local capabilities?
How are Runner-local tools resolved and controlled?
How are handoff/progress/provenance normalized?
How does execution history become planning evidence?
```

Feature 197 does not replace Feature 195 execution truth or Feature 196 planning truth. Do not merge these planes.

---

# 3. Universal Command Gateway

Every inbound channel connects to one normalized Command Gateway.

Supported/anticipated channels:

```text
SmartAIHub Web
SmartAIHub Mobile iOS
SmartAIHub Mobile Android
SmartAIHub Tablet UI
SmartAIHub Companion
Telegram
Voice interface
MCP
REST/API
Webhook
Grok Bot
Hermes
AutoClaw
OpenClaw
future personal assistants
future messaging platforms
```

The channel is a transport/presentation surface, not the owner of orchestration.

---

# 4. Why Multi-Channel Is a First-Class Requirement

Current AI assistants increasingly provide mobile/voice interfaces.

Examples verified during this spec preparation (September 2026):

- Grok Bot has mobile apps for iPhone and Android; the mobile app connects to the same Bots, conversations, routines, connectors and cloud computer, and cloud work continues when the app closes.
- Gemini mobile supports text, voice and Live conversations; Android can act as a mobile assistant and both Android/iOS have mobile experiences.

Therefore SmartAIHub must assume that users will increasingly issue commands from an assistant/mobile surface that is not SmartAIHub's own Web UI.

---

# 5. Command Normalization

All ingress adapters produce:

```json
{
  "command_id": "cmd_...",
  "tenant_id": "...",
  "user_id": "...",
  "caller": {
    "type": "user|external_agent|automation|api_client",
    "id": "..."
  },
  "channel": "mobile_android",
  "session_id": "...",
  "conversation_id": "...",
  "text": "...",
  "attachments": [],
  "voice_transcript": null,
  "context_refs": [],
  "constraints": {},
  "received_at": "..."
}
```

Ingress adapters MUST NOT choose providers/runtimes.

---

# 6. Cross-Channel Identity Resolution

A user can:

```text
start on Telegram
continue in SmartAIHub Mobile
approve on Web
receive result in Grok Bot
```

The system must resolve all channels to a canonical:

```text
tenant_id
user_id
principal_id
```

External assistants use delegated principals, not full user credentials.

---

# 7. Channel Identity Model

Suggested table:

```text
channel_identities
```

Fields:

```text
channel_identity_id
user_id
tenant_id
channel_type
external_subject_id
verified_at
status
scopes_json
metadata_json
```

Never use display name/username alone as identity proof.

---

# 8. Delegated External Assistant Identity

External agents such as Grok/Hermes/AutoClaw may call SmartAIHub on behalf of a user.

Delegation record:

```text
delegation_id
user_id
caller_type
caller_external_id
allowed_capabilities
max_credits_per_run
max_credits_per_day
approval_policy
expires_at
revoked_at
```

Default = least privilege.

---

# 9. Goal Object

The central user-level object is:

```text
Goal
```

A Goal describes desired outcome, not execution implementation.

Examples:

```text
Daily AI morning brief
Monitor news about named public officials
Research durian production and market
Create hashtag-news podcast daily
Generate storyboard from topic
Record daily farm production
Produce daily 3D comedy episode
Edit newly recorded camera footage
```

---

# 10. Goal Schema

Suggested:

```text
goals
```

Fields:

```text
goal_id
tenant_id
user_id
project_id optional
name
description
status
control_mode
solution_profile
budget_policy_id
privacy_policy_id
schedule_id optional
created_from_channel
created_at
updated_at
```

---

# 11. Goal Run

Recurring Goal != one execution.

```text
Goal
  ├── Goal Run #1
  ├── Goal Run #2
  └── Goal Run #3
```

`goal_runs` stores each invocation.

Fields:

```text
goal_run_id
goal_id
trigger_type
trigger_ref
status
plan_id
workflow_run_id
started_at
finished_at
summary
result_refs
```

---

# 12. Goal Understanding

Goal Analyzer extracts:

```text
objective
subject/domain
output format
schedule/deadline
quality expectation
budget
speed preference
privacy
control level
required destinations
input assets
recurrence
approval requirements
```

It should not force the user to name tools.

---

# 13. Goal Specification

Normalized `GoalSpec` example:

```json
{
  "objective": "create_daily_ai_news_podcast",
  "outputs": ["audio", "summary_text"],
  "schedule": "daily 07:00 Asia/Bangkok",
  "quality": "professional",
  "budget": {"max_credits_per_run": 40},
  "control_mode": "assisted",
  "delivery": ["mobile_push", "result_inbox"],
  "constraints": {
    "language": "th",
    "citations": true
  }
}
```

---

# 14. User Questions and Ambiguity

The orchestrator may ask only when ambiguity materially changes outcome/cost/risk.

Prefer sensible defaults and editable plan preview.

Example:

```text
User: ทำ podcast ข่าว AI ทุกเช้า
```

System may infer:

```text
time = user's morning default
language = user language
length = default preset
```

and show these assumptions before activation.

---

# 15. Control Modes

Standard modes:

```text
AUTO
ASSISTED
MANUAL
HYBRID
```

## AUTO
Goal → complete result with minimal intervention.

## ASSISTED
System plans; user approves major choices/checkpoints.

## MANUAL
User operates specialized Plugin UI/editor; AI assists.

## HYBRID
Automation performs parts; user takes over selected stages and can return control.

---

# 16. Solution Profiles

Default user-friendly profiles:

```text
Balanced
Professional / Highest Quality
Economy
Fastest
Private / Local First
Use My Tools First
Custom
```

A profile is a policy, not a vendor.

---

# 17. Capability-First Architecture

Workflow plans MUST depend on capabilities, not vendor names.

Bad:

```text
Step 1 = Grok
Step 2 = Claude
Step 3 = KIE
```

Good:

```text
Step 1 requires research.news
Step 2 requires content.script.write
Step 3 requires video.generate
```

Runtime/vendor binding happens through the Capability Broker.

---

# 18. Capability Namespace

Use hierarchical IDs.

Examples:

```text
research.web
research.news
research.deep
research.x
research.monitor.topic

content.summarize
content.article.write
content.script.write
content.podcast.create

story.idea.generate
story.script.generate
story.storyboard.generate
story.shotplan.generate

image.generate
image.edit
video.generate
video.edit.semantic
video.edit.rough_cut
video.edit.manual
video.render

audio.tts
audio.transcribe
audio.music.generate
audio.mix

data.capture.daily
data.report

browser.use
computer.use
code.read
code.modify
code.test

social.publish.facebook
social.publish.x
```

---

# 19. Capability Contract

Every capability has:

```text
capability_id
contract_version
input_schema
output_schema
interaction_modes
artifact_types
permission_requirements
quality_dimensions
known_constraints
```

Capability semantics are independent of provider implementation.

---

# 20. Capability Versioning

Support contract versions:

```text
video.edit.semantic/1
video.edit.semantic/2
```

or equivalent explicit version field.

A workflow pins a compatible capability contract, not necessarily a vendor version.

---

# 21. Capability & Expertise Graph

SmartAIHub maintains a dynamic graph describing:

```text
Capabilities
Offers/Implementations
Plugins
Skills
Agents
Multi-Agent Systems
Models
Providers
External Assistants
Devices
Runtimes
Connectors
UI Surfaces
Workflow Blueprints
```

Edges include:

```text
PROVIDES
REQUIRES
CAN_RUN_ON
USES_TOOL
SPECIALIZED_FOR
FALLBACK_FOR
COMPATIBLE_WITH
HAS_UI
DEPENDS_ON
OWNED_BY_USER
MANAGED_BY_SMARTAIHUB
```

---

# 22. SmartAIHub Expertise Catalog

SmartAIHub must explicitly know what its own professional ecosystem is good at.

Examples:

```text
Professional Storyboard
AI Rough Cut / Video Editor
Vertical Drama Production
Podcast Production
Media Generation
Document Processing
Domain-specific Plugins
```

Expertise is represented through verified capability offers, workflow depth and quality metadata.

---

# 23. Plugin Standard

A Plugin may contain any combination:

```text
UI + Skill
UI + Agent
UI + Skills + Agents
Skill only
Multi-Skill
Agent only
Agent + Skills
Multi-Agent
Multi-Agent + Multi-Skill
Workflow/Blueprint only
Runtime adapter
Provider adapter
```

UI is optional.

Capability declaration is mandatory.

---

# 24. Plugin Manifest — Required Sections

Conceptual:

```yaml
plugin:
  id: professional-video-editor
  version: 3.2.0

capabilities:
  - id: video.edit.semantic
    contract: 2
  - id: video.edit.rough_cut
    contract: 1

interaction_modes:
  - auto
  - assisted
  - manual
  - hybrid

ui:
  optional: false
  surfaces:
    - web
    - tablet

pricing:
  model: credits

quality:
  expertise_level: professional
  has_qc: true
```

---

# 25. Professional SmartAIHub Offers

SmartAIHub professional Plugins/Agents/Skills are **Offers** for capabilities.

They can be premium and consume additional credits.

User is not forced to use them if another eligible solution exists.

The platform should be able to explain:

```text
SmartAIHub Pro option
User-owned option
Cloud/API option
Local option
Manual option
```

---

# 26. Offer Object

Suggested table:

```text
capability_offers
```

Fields:

```text
offer_id
capability_id
contract_version
implementation_type
implementation_ref
owner_type
managed_mode
quality_profile
interaction_modes
pricing_policy_id
availability_policy_id
privacy_attributes
control_attributes
verified_status
version
```

---

# 27. Offer Types

```text
smartaihub_plugin
smartaihub_skill
smartaihub_agent
external_agent
user_owned_agent
user_owned_subscription
local_runtime
managed_provider
manual_ui
workflow_blueprint
```

---

# 28. User-Owned Capability Inventory

SmartAIHub must recognize resources already paid for or installed by the user.

Examples:

```text
Grok Bot
Claude Code
Codex
Gemini
Hermes on Mac Mini
ComfyUI on Windows GPU
SmartAIHub Runner
local LLM
```

These resources become candidate Offers.

---

# 29. Environment Inventory

Per user/tenant:

```text
Connected cloud assistants
Connected external services
Runner devices
Legacy Worker devices
Installed runtime packages
Installed local agent runtimes
Installed Plugins
Credentials/connections
Current health/online status
```

Inventory must refresh dynamically.

---

# 30. Capability Discovery

Each Adapter exposes discovery where possible:

```text
discover_agents()
discover_skills()
discover_tools()
discover_models()
discover_capabilities()
healthcheck()
```

If a platform cannot enumerate capabilities automatically, use a verified manifest/configuration profile.

---

# 31. Capability Claims Are Not Automatically Trusted

A Plugin/Adapter cannot merely claim professional capability.

Support:

```text
Capability Conformance Tests
Schema validation
Health tests
Sample execution tests
Version compatibility tests
```

Status:

```text
unverified
verified
deprecated
incompatible
```

---

# 32. Dynamic Capability Updates

Agent/model ecosystems change rapidly.

If a connected runtime gains a new capability, update Registry metadata without changing Planner core code.

Example:

```text
Old Grok capability set
→ research.x, research.web

New capability set
→ research.x, research.web, video.generate, computer.use
```

Planner sees new Offers automatically after verification.

---

# 33. Workflow Blueprint Registry

Reusable blueprints reduce LLM planning variability.

Initial examples:

```text
Morning News Brief
Topic/Person News Monitor
Company/Product Intelligence Monitor
Deep Research
Daily Podcast
Storyboard Creator
Daily Production Logger
Daily Social Video Series
Camera Footage Rough Cut
Coding Project Task
```

---

# 34. Template-First, Not Template-Locked

Planning order:

```text
Goal
  ↓
Find compatible Blueprint
  ├── found → customize
  └── not found → Planner generates workflow
```

A generated workflow that proves reusable may later become a Blueprint.

---

# 35. Workflow Planner

Planner outputs an abstract capability graph.

Example:

```text
Daily AI Podcast
├── research.news
├── research.verify
├── content.summarize
├── content.podcast.script
├── audio.tts
├── audio.music.generate optional
├── audio.mix
└── result.deliver
```

No provider binding yet unless explicitly pinned.

---

# 36. Workflow Compiler

Compiler converts abstract graph into executable plan by:

1. validate capability contracts
2. query available Offers
3. apply user/tenant policy
4. apply Solution Profile
5. estimate cost/time
6. select/pin Offers where appropriate
7. define fallback candidates
8. define approval points
9. create executable step DAG
10. submit to Feature 195

---

# 37. Logical Agent vs Runtime Agent

A logical agent is a role/capability definition.

Example:

```text
AI News Researcher
requires:
  research.news
  research.verify
  content.summarize
```

It MUST NOT equal:

```text
AI News Researcher = Grok Bot
```

Runtime resolver may select:

```text
Grok Bot
Gemini
Hermes
SmartAIHub Pro Research Agent
future agent
```

---

# 38. Agent Composer

User requests may require an Agent that does not exist as a packaged binary.

Agent Composer can create a logical Agent Definition from:

```text
role
instructions
capabilities
Skills
Tools
memory policy
schedule
output contract
approval policy
```

This is usually configuration/workflow composition, not new source-code generation.

---

# 39. Multi-Agent Composition

Planner may compose:

```text
Research Agent
  ↓
Writer Agent
  ↓
Storyboard Agent
  ↓
QC Agent
```

Each Agent run maps to Feature 195 Jobs/child Jobs.

---

# 40. External Agent Provider Abstraction

Define:

```text
ExternalAgentProvider
```

Optional contract:

```text
discover()
capabilities()
list_agents()
create_agent()
update_agent()
start_run()
send_message()
get_status()
get_result()
cancel_run()
request_approval()
resume()
healthcheck()
usage()
estimate_cost()
```

Unsupported methods are declared unsupported, never faked.

---

# 41. Initial/Future External Agent Adapters

```text
HermesAgentAdapter
AutoClawAgentAdapter
OpenClawAgentAdapter
GrokBotAgentAdapter when supported
GrokAPIAgentAdapter
Claude/ClaudeCodeAdapter
CodexAdapter
GeminiAdapter
future agent platforms
```

---

# 42. Grok API vs Grok Bot

Treat them as different Offer types.

```text
Grok API Agent
= SmartAIHub owns lifecycle and calls xAI API

Grok Bot
= xAI product owns Bot identity/session/computer/routines
```

Do not assume management APIs exist where the provider does not expose them.

---

# 43. Bidirectional External Agent Integration

Two directions:

## SmartAIHub → External Agent

Use external Agent as executor for a capability.

## External Agent → SmartAIHub

External personal assistant calls SmartAIHub because SmartAIHub has a professional capability it lacks.

Both use the same Goal/Capability system.

---

# 44. SmartAIHub as an External Capability Provider

Expose through MCP/API:

```text
capabilities.search
capabilities.describe
solutions.preview
goals.create
capabilities.execute
runs.get
runs.cancel
results.get
approvals.resolve
```

External assistants should ask for capability/outcome, not provider account/runtime internals.

---

# 45. Async External Assistant Contract

External assistant call returns quickly:

```json
{
  "goal_run_id": "...",
  "workflow_run_id": "...",
  "status": "accepted"
}
```

Then use:

```text
poll status
webhook callback
MCP follow-up
channel delivery
```

according to connector capability.

---

# 46. Recursive Invocation Safety

Because an external Agent may call SmartAIHub while SmartAIHub has delegated to that Agent, carry:

```text
call_chain_id
parent_call_id
hop_count
max_hops
origin_system
```

Planner blocks unbounded loops.

---

# 47. Solution Optimizer

The optimizer evaluates multiple eligible solutions.

Dimensions:

```text
quality
cost
speed
reliability
privacy
control
availability
professional expertise
user-owned resource preference
manual UI availability
```

It does not simply choose the cheapest or most powerful tool.

---

# 48. Normalized Solution Attributes

Every Offer may expose:

```text
expected_quality_band
quality_confidence
estimated_cost
cost_confidence
estimated_duration
duration_confidence
reliability_score from telemetry
privacy_class
control_modes
locality
availability
professional_specialization
```

Unknown values remain unknown.

---

# 49. Cost Modes

## Managed
SmartAIHub pays provider/runtime and charges credits.

## BYO / User-Owned
User uses their own connected subscription/API/runtime.
SmartAIHub may charge orchestration/Plugin/execution fee according to policy.

## Local
Runs on user hardware; API provider cost may be zero, but Plugin/service policy may still apply.

## Mixed
Different workflow steps use different modes.

---

# 50. Cost Estimate

Plan preview should separate:

```text
SmartAIHub estimated credits
External/user-owned cost known
External/user-owned cost unknown
Local compute note
```

Never imply user-owned subscription use is free if actual external accounting is unknown.

---

# 51. Cost Ceiling

Goal can define:

```text
max credits/run
max credits/day
max external estimated cost
require approval above threshold
```

Feature 195 enforces actual reservations/settlement.

---

# 52. Quality Profiles

Example:

```text
Economy
Balanced
Professional
Highest Quality
```

For video generation:

```text
Economy → cheaper eligible model
Professional → SmartAIHub Pro workflow + high-quality model + QC
```

User may pin a model such as Seedance when desired.

---

# 53. Quality Is Task-Specific

Do not maintain one global ranking such as:

```text
Grok > Claude > Gemini
```

Maintain task/capability telemetry.

Example:

```text
research.news
code.refactor
video.generate
storyboard.generate
```

may each have different eligible Offers and measured outcomes.

---

# 54. Telemetry-Based Offer Performance

Collect:

```text
success rate
retry rate
latency
cost estimate error
user acceptance
manual correction amount
QC pass/fail
fallback rate
```

Use telemetry to improve routing.

Do not let an LLM invent performance claims.

---

# 55. User Preference Profile

Optional preferences:

```text
preferred solution profile
prefer own subscriptions
prefer SmartAIHub Pro
prefer local/private
max credits/day
default control mode
approval thresholds
preferred delivery channels
```

Per-Goal overrides are allowed.

---

# 56. Explainable Plan Selection

System should be able to explain at user-friendly level:

```text
Selected SmartAIHub Pro Editor because you chose Professional quality and manual editing may be needed.
```

or:

```text
Selected your Home-PC Runner because you prefer local processing and it is currently online.
```

Do not expose sensitive infrastructure details by default.

---

# 57. Plan Preview

Before recurring/expensive workflows, show:

```text
What will happen
When it will run
Expected outputs
Estimated SmartAIHub credits
External tools that may be used
Approval points
Control mode
Delivery destinations
```

Advanced users can expand execution candidates.

---

# 58. Alternative Plans

When trade-offs are material, show 2–3 meaningful alternatives.

Example video:

```text
Professional
Balanced
Use My Tools
```

Avoid overwhelming users with every provider/model.

---

# 59. Pinning

Advanced user may pin:

```text
specific Agent
specific Plugin
device/runtime
provider/model
local-only
cloud-only
```

Pinned requirement becomes a constraint; if unavailable, system asks/fails according to policy instead of silently changing it.

---

# 60. Fallback Policy

Unpinned plans may define:

```text
primary Offer
fallback Offers
fallback constraints
approval required for quality/cost change
```

Fallback decision is recorded and visible in monitoring.

---

# 61. Replanning

Planner may replan when:

```text
runtime offline
provider outage
rate limit
budget change
user changes quality
artifact invalid
manual correction
new capability becomes available
```

Replanning must preserve Goal identity and execution lineage.

---

# 62. Professional Plugin Handoff

A workflow may hand control to Plugin UI.

Example:

```text
AI Rough Cut
  ↓
User opens Video Editor
  ↓
manual timeline changes
  ↓
Continue automation / export / QC
```

Same Goal Run and artifact lineage remain intact.

---

# 63. UI Surface Registry

Plugins may declare UI surfaces:

```text
web_full
web_panel
mobile_summary
mobile_action
tablet_full
manual_editor
none
```

UI is optional for a Plugin, but if present it should advertise compatible surfaces.

---

# 64. SmartAIHub Web UX

Primary entry:

```text
What do you want SmartAIHub to do?
```

Home should emphasize Goals and active work rather than models/providers.

Sections:

```text
Ask / Create
My Goals
Active Work
Planner
Results
Approvals
Professional Tools
Devices & Connections
```

---

# 65. SmartAIHub Mobile — Product Role

SmartAIHub SHOULD have native/mobile-class Android and iOS experiences because it can provide richer orchestration UX than generic messaging platforms.

Mobile must be a first-class client of the same Goal/Run APIs, not a separate backend.

---

# 66. Mobile Home

Suggested bottom navigation:

```text
Assistant
Work
Planner
Results
More
```

Assistant screen supports:

```text
text
voice
image upload
video upload
file upload
camera capture
```

---

# 67. Mobile Voice Interaction

Voice flow:

```text
microphone
  ↓
ASR / live voice transport
  ↓
Command Gateway
  ↓
Goal Orchestrator
  ↓
spoken/text confirmation
```

For long work:

```text
"รับงานแล้ว ฉันจะทำต่อในเบื้องหลัง"
```

The voice session does not stay open for the execution lifetime.

---

# 68. Mobile Work Screen

Shows:

```text
Running
Queued
Waiting Approval
Needs Input
Completed Recently
```

Cards display user-level stages, not infrastructure jargon.

Example:

```text
Daily AI Podcast
Researching sources · 38%
Started 3m ago
[View]
```

---

# 69. Mobile Goal Run Detail

Show:

```text
Goal
Current stage
Overall progress
Elapsed
Estimated remaining if known
Plan summary
Outputs so far
Needs attention
Cost so far
```

Expandable advanced path:

```text
Research → your Grok Bot
Script → SmartAIHub Pro
Voice → managed provider
Mix → SmartAIHub Cloud
```

---

# 70. Mobile Planner

User can:

```text
create recurring Goal
change schedule
pause/resume
skip next run
run now
view next run
view history
edit quality/budget/delivery policy
```

---

# 71. Mobile Results Inbox

A unified Result Inbox supports:

```text
text
report
image gallery
audio player
video player
file/document
links to Library/project
```

Results are grouped by Goal/Run, not raw Job.

---

# 72. Mobile Approvals

Push notification deep-links to:

```text
Approve
Deny
View Details
Open Web/Plugin UI when detailed manual action is required
```

High-risk action should require appropriate authentication/reconfirmation.

---

# 73. Tablet Experience

Tablet can expose richer layouts:

```text
split assistant + work detail
image/video gallery
storyboard grid
result comparison
planner calendar/list
manual Plugin UI where supported
```

Tablet is not assumed to have local Runner capabilities.

---

# 74. Mobile/Tablet Offline Behavior

Client may be offline while Jobs continue.

On reconnect:

1. fetch Goal/Run state
2. fetch unread Result/Attention events
3. resume event subscription
4. avoid duplicate user actions

---

# 75. Push Notifications

Notification types:

```text
completed
failed
approval required
needs input
scheduled report ready
long delay if meaningful
```

Do not notify every low-level Job event.

---

# 76. Delivery Router

Feature 196 owns delivery decisions.

Targets:

```text
SmartAIHub Web Inbox
Mobile push
Mobile Result Inbox
Telegram
MCP callback
external webhook
Grok/Hermes connector response
email/other future connectors
```

Feature 195 only emits normalized execution events/results.

---

# 77. Delivery Policy

Per Goal:

```text
primary delivery
secondary delivery
notify on completion
notify on failure
quiet hours
send artifact previews?
require approval before external publish?
```

---

# 78. Cross-Channel Continuity

A Goal/Run must remain accessible from any authorized channel.

Example:

```text
Telegram creates Goal
Mobile views progress
Web opens professional editor
Mobile approves export
Grok Bot asks for final result
```

No duplicated Goal/Job is created merely because channel changed.

---

# 79. Session Model

Channel conversation session is different from Goal.

```text
Conversation Session
  ├── Goal A
  └── Goal B
```

A Goal may outlive the originating conversation/session.

---

# 80. Planner / Scheduling Model

A scheduled Goal contains:

```text
schedule
trigger
run policy
overlap policy
delivery policy
budget policy
```

Recurring execution creates new `goal_run` each occurrence.

---

# 81. Trigger Types

```text
manual
schedule
webhook
condition/event
external assistant
plugin event
file arrival
future connector event
```

Trigger creates a Goal Run; it does not execute business logic itself.

---

# 82. Overlap Policy

For recurring Goal when previous run active:

```text
skip
queue
replace
parallel
```

Planner recommends default based on workflow type.

---

# 83. Monitoring Hierarchy

User-facing hierarchy:

```text
Goal
  ↓
Goal Run
  ↓
Workflow Run
  ↓
Plan Steps
  ↓
Feature 195 Jobs
  ↓
Execution Attempts / Providers / Runtimes
```

Each level has a different responsibility.

---

# 84. Goal Run Status

Normalized high-level states:

```text
planning
waiting_confirmation
scheduled
queued
running
waiting_approval
waiting_input
partially_completed
completed
failed
cancelled
paused
```

Do not expose raw queue/provider states as top-level Goal state.

---

# 85. Workflow Run

Suggested table:

```text
workflow_runs
```

Fields:

```text
workflow_run_id
goal_run_id
plan_id
status
progress_percent nullable
current_stage
started_at
finished_at
estimated_cost
actual_cost
summary
```

---

# 86. Plan Step

Each plan step stores:

```text
plan_step_id
plan_id
capability_id
contract_version
dependencies
input_mapping
output_mapping
resolution_policy
selected_offer_id optional
fallback_offer_ids
local_resolution_allowed
allowed_local_implementation_ids optional
local_tool_binding_policy optional
agent_execution_mode optional
minimum_control_level optional
quality_contract_id optional
intervention_policy_id optional
user_owned_tool_policy_id optional
approval_policy
weight
```

---

# 87. Compiled Execution Plan

Compiler emits:

```text
DAG
plan_id / plan_revision / plan_hash
step contracts
selected/resolvable Offers
allowed_offer_ids / binding policies
fallbacks
budgets
approval points
execution preferences
execution-topology preferences
local tool binding/control requirements
user-owned-tool policy
quality contracts
intervention/replan policy
experience evidence snapshot/reference
data/privacy/residency policy
context_snapshot_id
artifact mappings
```

Feature 195 converts executable steps into canonical Jobs.

---

# 88. Plan Binding Modes

## Early Bound
Specific Offer is chosen before execution.

Use when:

- user pinned vendor/tool
- specialized professional Plugin required
- predictable pricing required

## Late Bound
Feature 196 compiles an explicit **eligible Offer set + binding policy**. Feature 195 may bind at execution time only among Offers that Feature 196 has already declared semantically equivalent and policy-compatible for that Plan Step.

Use when:

- runtime availability changes
- provider capacity changes
- several Offers satisfy the same capability contract and policy envelope

Feature 195 MAY choose:

- provider account
- queue slot
- execution node
- runtime instance
- model endpoint when the selected Offer explicitly permits it
- one `allowed_offer_id` from the pre-authorized equivalent Offer set

Feature 195 MUST NOT silently substitute an Offer outside the compiled set. If no allowed Offer remains eligible, Feature 195 emits `execution.replan_required` to Feature 196. Feature 196 then creates a new plan revision or asks for approval when the change affects semantics, quality, cost ceiling, privacy, provider pinning or control mode.

---

# 89. Plan-Step Monitoring

A step can show:

```text
Capability: video.edit.semantic
Selected solution: SmartAIHub Pro Editor
Execution: Home-PC Runner
Local runtime: FFmpeg / selected adapter when observable
Status: Running
Progress: 61% (native/derived source shown when useful)
```

or simplified:

```text
Editing video · 61%
```

---

# 90. Overall Progress

Overall progress is derived from plan-step weights and actual Feature 195 Jobs.

Rules:

- never fabricate progress
- dynamically added steps update denominator according to policy
- unknown-duration steps may report stage only
- user sees confidence where useful

---

# 91. Execution Path View

Advanced view visualizes:

```text
Goal
 → Blueprint
 → Capability Step
 → Offer
 → Agent/Plugin
 → Runtime/Device
 → Provider/Model
 → Artifact
```

This solves operational questions such as:

```text
งานนี้ใช้ระบบไหนทำ?
ทำไมเลือกตัวนี้?
ตอนนี้ติดอยู่ตรงไหน?
เสียเครดิตส่วนไหน?
```

---

# 92. Cost Monitoring

Goal Run shows:

```text
Estimated credits
Reserved credits
Actual credits so far
Final credits
BYO/external cost indicator
```

Step breakdown expandable.

Actual cost comes from Feature 195.

---

# 93. Professional vs User-Owned Choice UX

Example:

```text
Edit my camera video
```

Solutions may be:

```text
SmartAIHub Professional Editor
Use my Claude/Codex + Runner
Automatic basic edit
Open manual SmartAIHub Video Editor
```

The user chooses outcome profile/control level, not infrastructure details unless desired.

---

# 94. Manual Editing

SmartAIHub professional UI may provide full manual control.

Example Video Editor:

```text
AI rough cut
 → user edits timeline
 → AI subtitle/QC
 → render
```

Goal remains active throughout.

---

# 95. SmartAIHub Pro Value Model

Professional Plugin value comes from more than model access:

```text
domain workflow
specialized UI
curated Skills
multi-Agent composition
QC
presets/templates
continuity
artifact management
human checkpoints
```

This metadata helps Solution Optimizer distinguish specialized offers from generic agents.

---

# 96. Professional Expertise Metadata

Offer may declare:

```text
expertise_domain
expertise_level
workflow_depth
has_qc
has_manual_ui
supports_auto
supports_assisted
verified_version
```

Claims should be platform-verified where possible.

---

# 97. Domain/Risk Policy Engine

Some Goals need additional policies.

Examples:

```text
health information
political/public-official news monitoring
financial information
publishing/external actions
personal data
```

Policy Engine may require:

- higher-quality sources
- citations
- neutral summarization
- approval
- no autonomous high-risk action
- restricted Offers

The policy layer is independent of vendor/model choice.

---

# 98. Political/Public-Official Monitoring

For monitoring public officials/news:

- focus on factual summarization
- preserve source/date
- separate fact from attributed claims
- avoid persuasion/targeted political influence
- do not infer user political preference

This is a workflow policy, not a special provider.

---

# 99. Health Information Goals

For health information:

- distinguish general information from diagnosis/treatment
- use authoritative sources when research is required
- surface uncertainty/need for professional care where appropriate
- do not allow generic autonomous Agent to make high-stakes decisions without policy controls

---

# 100. Artifact and Result Model

Goal Run results reference SmartAIHub Library assets.

Result types:

```text
text
structured report
image
audio
video
document
dataset
workflow artifact
external link
```

Feature 196 groups them by Goal/Run.

---

# 101. Result Versioning

Manual edits/retries may produce versions.

```text
result v1
manual edit v2
final v3
```

Maintain lineage to producing Jobs/Offers.

---

# 102. Feedback Loop

User can mark:

```text
good result
needs improvement
wrong tool/approach
too expensive
too slow
prefer this solution
```

Use feedback to adjust user preferences and routing telemetry, not to mutate global policy blindly.

---

# 103. Capability Broker

Capability Broker answers:

```text
Which Offers can satisfy capability X right now for this user/tenant?
```

It filters by:

```text
contract compatibility
permissions
availability
user-owned connections
runtime health
policy
region/privacy
budget
interaction mode
```

---

# 104. Offer Resolver

Resolver ranks/filters eligible Offers according to Solution Profile.

It must be deterministic/explainable enough for debugging.

LLM may contribute planning context, but final eligibility is rule/registry based.

---

# 105. Why Planner Must Not Freely Guess Tools

Bad architecture:

```text
LLM hallucinates an Agent/tool exists
```

Required architecture:

```text
Planner proposes capability
  ↓
Registry verifies capability/Offer exists
  ↓
Compiler validates schemas/policies
  ↓
only then create executable plan
```

---

# 106. Offer Selection Decision Record

Record:

```text
candidate_offer_ids
excluded_reason codes
selected_offer_id
solution_profile
policy_version
estimated cost/time
selection_reason
```

Useful for debugging and user explanation.

---

# 107. Provider/Runtime Selection Boundary

Feature 196 may select a high-level Offer.

Example:

```text
SmartAIHub Managed Video Generation / Seedance quality class
```

Feature 195 selects **operational execution details inside the policy envelope compiled by Feature 196**:

```text
provider account
queue slot
Container/Runner
runtime instance
actual capacity
provider endpoint/model route only when the selected Offer allows that late binding
```

Feature 195 may fail over within the same pre-authorized semantic Offer set. A change to capability semantics, quality class, privacy boundary, user-pinned tool/vendor, interaction mode or materially different pricing requires `execution.replan_required` and a Feature 196 plan revision.

Do not duplicate provider-account scheduling in Feature 196, and do not let Feature 195 become a second Solution Optimizer.

---

# 108. User-Owned Subscription Boundary

If user owns Grok/Claude/Codex/Hermes:

Feature 196 decides whether that Offer matches Goal policy.

Feature 195 decides actual execution admission/monitoring when integrated.

Do not assume availability simply because the user once connected it.

---

# 109. External Agent Capability Insufficiency

An external assistant may discover it lacks a needed capability.

It can ask SmartAIHub:

```text
capabilities.search("professional storyboard")
```

then create a Goal/Run.

SmartAIHub may execute through a professional Plugin and return result asynchronously.

---

# 110. External Agent Must Not Bypass Pricing/Policy

Even if caller is Grok/Hermes/AutoClaw:

- SmartAIHub credits apply according to policy
- Plugin fees apply
- approvals apply
- tenant permissions apply
- budgets apply
- provider secrets remain hidden

---

# 111. Command Gateway Adapter Contract

```text
authenticate()
normalize_identity()
parse_message()
extract_attachments()
send_ack()
send_progress() optional
send_result()
send_approval_request() optional
supports_async_callback()
healthcheck()
```

---

# 112. Telegram Adapter

Telegram is one channel adapter.

It MUST NOT have Telegram-specific workflow business logic.

It maps:

```text
chat/message → canonical command/session
```

and renders normalized result/approval events.

---

# 113. SmartAIHub Mobile Adapter

Mobile is richer than messaging channels and can support:

```text
voice
attachments
result gallery
planner
approvals
job monitoring
manual editor deep links
push notifications
```

But it still calls the same backend contracts.

---

# 114. MCP Adapter

External agents/tools can use MCP to:

```text
search capabilities
create Goal
execute capability
get Run status
retrieve result
cancel
resolve approval if delegated
```

MCP tool responses should prefer IDs/references and async semantics for long work.

---

# 115. REST/API Adapter

Provide stable external API using the same Goal model.

API clients must not access internal Cloudflare Queue/provider-account implementation.

---

# 116. Result Subscription

A caller may register:

```text
poll
webhook
MCP callback pattern
channel delivery
mobile push
```

Delivery failure does not mark the underlying Goal execution failed.

---

# 117. Delivery Retry

Delivery has its own retry/idempotency policy separate from Job execution.

Do not rerun expensive video generation because Telegram delivery failed.

---

# 118. Approval Center

One approval decision may be surfaced on many channels.

Canonical approval state lives centrally.

Race-safe behavior:

```text
first valid decision wins according to policy
other clients refresh to resolved state
```

---

# 119. Attention Required Model

Normalize:

```text
approval_required
user_input_required
manual_edit_required
budget_increase_required
connection_required
```

Mobile/Web/external channels render the same underlying attention item.

---

# 120. Connection Required Flow

If a preferred solution requires an unavailable connection:

```text
Use your Grok Bot
→ not connected
```

System may:

- offer connection setup
- choose another eligible solution
- ask user depending on Solution Profile

Do not fail Goal unnecessarily.

---

# 121. Device Required Flow

If local-only job requires Runner and device offline:

```text
wait
fallback cloud if policy allows
ask user to turn device on
```

Plan policy decides.

---

# 122. Result Inbox as Cross-Channel Anchor

Regardless of origin channel, durable outputs appear in SmartAIHub Result Inbox/Library.

Messaging/assistant channels are notifications/access paths, not sole storage.

---

# 123. Planner History

User can inspect:

```text
active schedules
past runs
next runs
average cost
success/failure
latest results
```

---

# 124. Goal Duplication/Re-use

User can:

```text
Duplicate Goal
Save as Template
Share within tenant if allowed
Modify schedule
Change Solution Profile
```

---

# 125. Marketplace/Plugin Discovery Integration

If no installed Offer satisfies capability, SmartAIHub may suggest:

```text
available SmartAIHub Plugin/Skill/Agent
```

Installation/purchase remains explicit where required.

Do not silently install paid Plugins.

---

# 126. Plugin Revenue Integration

Offer selection carries:

```text
plugin owner
skill owner
tenant/partner context
pricing policy
```

Feature 195 cost ledger records actual consumption; existing revenue engine performs split.

---

# 127. Plan Cost Simulation

Before start, Planner may run a dry estimate using:

```text
input size
expected tokens
media duration
number of shots
model/provider rate cards
Plugin fees
runtime estimates
```

Return confidence/uncertainty.

---

# 128. Long-Running Cost Guard

During execution, if projected cost exceeds plan ceiling:

```text
pause before next expensive step
request approval
or choose eligible cheaper fallback
```

according to Goal policy.

---

# 129. Quality Escalation

If QC fails and policy allows:

```text
retry same Offer
use higher quality Offer
ask user
```

The escalation cost must be visible/controlled.

---

# 130. QC as Capability

QC is first-class:

```text
qc.image
qc.video
qc.storyboard
qc.audio
qc.content
```

Professional workflows may require QC before completion.

---

# 131. Example — Daily AI News Brief

Goal:

```text
สรุปข่าว AI ทุกเช้า
```

Abstract plan:

```text
schedule.daily
  ↓
research.news
  ↓
research.deduplicate
  ↓
research.verify
  ↓
content.summarize
  ↓
result.deliver
```

Possible executor set:

```text
Grok Bot
Gemini
SmartAIHub Pro Research
Hermes
Web research tools
```

User never needs to choose unless desired.

---

# 132. Example — Public Official News Monitor

Goal:

```text
ถ้ามีข่าวเกี่ยวกับนายกรัฐมนตรีหรือรัฐมนตรีที่กำหนด ให้สรุปมาให้
```

Plan:

```text
scheduled/event research
  ↓
entity/topic match
  ↓
source verification
  ↓
neutral summarization
  ↓
delivery
```

Political/public-official policy applies.

---

# 133. Example — Durian Research

Goal:

```text
research วิธีปลูกทุเรียนและตลาด
```

Plan:

```text
research.deep
  ├── cultivation
  ├── disease/nutrition
  ├── market
  └── sources
  ↓
synthesis report
```

Can use user-owned or managed research offers.

---

# 134. Example — Hashtag News Podcast Agent

Goal:

```text
สร้าง Agent สรุปข่าวจาก hashtag เหล่านี้ทุกวัน แล้วทำ podcast
```

System creates:

```text
Logical Agent Definition
+ recurring Goal
+ Workflow Blueprint instance
```

Workflow:

```text
research hashtag
filter/dedupe
verify
summarize
script
TTS
music optional
mix
store
notify
```

No code-generation requirement unless a custom implementation is genuinely needed.

---

# 135. Example — Storyboard Agent

Goal:

```text
สร้าง Agent รับหัวข้อแล้วสร้าง Storyboard
```

Capability set:

```text
story.idea.analyze
story.script.generate
story.storyboard.generate
story.shotplan.generate
qc.storyboard
```

SmartAIHub Pro Storyboard may be preferred under Professional profile.

---

# 136. Example — Daily Production Logger

Goal:

```text
บันทึกผลผลิตประจำวัน
```

Plan can include:

```text
mobile voice/text input
structured extraction
validation
record storage
summary/report
```

This may require almost no heavy external Agent execution.

---

# 137. Example — Daily 3D Comedy Series

Goal:

```text
สร้างการ์ตูน 3D ตลก 1.5–3 นาทีทุกวัน
```

Plan:

```text
idea
script
character continuity
storyboard
shots
image/video generation
voice
music/SFX
edit
QC
approval
publish preparation
```

Solution Optimizer may choose different media models based on Professional/Balanced/Economy profile.

---

# 138. Example — Camera Video Editing

Goal:

```text
ตัดต่อวิดีโอที่เพิ่งถ่ายมาให้ดีและกระชับ
```

Possible offers:

```text
SmartAIHub Professional Editor
SmartAIHub Auto Rough Cut
User Claude/Codex + Runner/FFmpeg
Manual SmartAIHub Video Editor
Hybrid rough-cut then manual
```

User can choose control mode and quality profile.

---

# 139. Planner UI

Goal setup UI should show human concepts:

```text
What do you want?
When?
How much control?
Quality preference?
Budget limit?
Where should results be delivered?
```

Advanced section shows selected tools/offers.

---

# 140. Professional Tools UI

Separate discoverability area:

```text
Professional Tools / Plugins
```

Users can browse specialized SmartAIHub capabilities but are not required to understand/install them before expressing a Goal.

Planner may recommend them when relevant.

---

# 141. Capability Search UI

For advanced users/agents:

```text
Search capabilities: "video editing"
```

Return Offers grouped by capability and interaction mode.

Do not expose raw provider-account details.

---

# 142. Advanced Plan Inspector

Show:

```text
Plan DAG
Capability contracts
Selected Offers
Fallbacks
Estimated cost
Execution location preference
Approval points
```

Useful for developers/power users.

---

# 143. Admin Capability Registry UI

Admin can inspect:

```text
Capability
Offers
Versions
Verification
Health
Usage
Success rate
Cost/latency telemetry
Dependencies
```

---

# 144. Admin Environment UI

Inspect connected resources by tenant/user:

```text
Runners
Workers
external agents
provider connections
installed Plugins
runtime packages
```

Sensitive secrets remain hidden.

---

# 145. Admin Planner Debug UI

For a Goal Run show:

```text
parsed GoalSpec
Blueprint match
Planner output
candidate Offers
excluded Offers/reasons
selection policy
compiled DAG
replans/fallbacks
```

This is essential for debugging future ecosystem complexity.

---

# 146. Observability — Orchestration Metrics

Track:

```text
Goal creation rate
Blueprint reuse rate
planning latency
plan compile failure
Offer resolution failure
fallback rate
replan rate
manual takeover rate
approval wait
Goal success rate
Goal completion time
```

---

# 147. Observability — Selection Metrics

By capability/Offer:

```text
selection count
success rate
average actual cost
average duration
cost estimate error
user acceptance/feedback
QC pass rate
fallback-from rate
fallback-to rate
```

---

# 148. Goal Trace

Every run carries:

```text
trace_id
goal_id
goal_run_id
plan_id
workflow_run_id
command_id
origin_channel
caller/delegation
```

Feature 195 Jobs extend the same trace.

---

# 149. Audit

Audit:

```text
Goal changes
schedule changes
budget changes
plan approval
manual Offer pin
external delegation
approval decisions
publish actions
Plugin install/enable
```

---

# 150. Security — Command Injection Boundary

External messages/content are untrusted inputs.

Planner/tool system must distinguish:

```text
user instruction
retrieved content
external agent message
tool output
```

Retrieved webpages/documents must not silently become privileged instructions.

---

# 151. Security — External Caller Scope

MCP/Telegram/Grok/Hermes callers can only:

- act for linked user/tenant
- use allowed capabilities
- spend within budget
- access allowed artifacts/projects
- request high-risk actions through Approval Center

---

# 152. Security — Plugin Isolation

Plugin cannot:

- directly read Core DB tables
- bypass JobService for background execution
- bypass credit system
- bypass approval policy
- impersonate another tenant/user

Use Core API/SDK contracts.

---

# 153. Security — Capability Permission

A capability may require scopes:

```text
read_project
write_project
use_local_device
publish_social
access_credentials
spend_credits
```

Resolver excludes Offers lacking required authorized scopes.

---

# 154. Privacy Policy

Goal can define:

```text
cloud_allowed
external_agent_allowed
local_only
specific_provider_forbidden
sensitive_data_class
```

Optimizer respects this before cost/quality ranking.

---

# 155. Data Model Summary

Suggested tables/resources:

```text
goals
goal_runs
command_sessions
channel_identities
external_delegations
workflow_blueprints
workflow_plans
workflow_plan_steps
workflow_runs
capabilities
capability_offers
capability_offer_versions
capability_verifications
user_capability_inventory
connection_resources
solution_profiles
user_orchestration_preferences
delivery_subscriptions
attention_items
orchestration_audit
quality_feedback
```

Before creating any table, audit existing equivalents.

---

# 156. Goal API

Conceptual:

```text
POST /v1/goals
GET  /v1/goals
GET  /v1/goals/:id
PUT  /v1/goals/:id
POST /v1/goals/:id/run
POST /v1/goals/:id/pause
POST /v1/goals/:id/resume
```

---

# 157. Goal Run API

```text
GET  /v1/goal-runs
GET  /v1/goal-runs/:id
POST /v1/goal-runs/:id/cancel
GET  /v1/goal-runs/:id/results
GET  /v1/goal-runs/:id/execution-path
GET  /v1/goal-runs/:id/cost
```

---

# 158. Plan API

```text
POST /v1/solutions/preview
GET  /v1/plans/:id
POST /v1/plans/:id/approve
POST /v1/plans/:id/replan
PUT  /v1/plans/:id/preferences
```

---

# 159. Capability API

```text
GET /v1/capabilities
GET /v1/capabilities/:id
GET /v1/capabilities/:id/offers
POST /v1/capabilities/search
```

Admin:

```text
GET /v1/admin/capability-registry
POST /v1/admin/capability-registry/verify
```

---

# 160. Command API

Normalized entry:

```text
POST /v1/commands
```

Returns:

```text
command_id
goal_id optional
goal_run_id optional
response
attention items
```

---

# 161. External Assistant API/MCP

Recommended high-level tools:

```text
smartaihub.capabilities.search
smartaihub.solutions.preview
smartaihub.goals.create
smartaihub.goals.run
smartaihub.runs.get
smartaihub.runs.cancel
smartaihub.results.get
smartaihub.approvals.list
smartaihub.approvals.resolve
```

---

# 162. Mobile API Requirements

APIs must support:

```text
cursor pagination
compact cards
incremental events
push token registration
artifact thumbnails/previews
signed media streaming URLs
deep links
approval actions
planner queries
```

---

# 163. Event Model — Orchestration

Events:

```text
command.received
goal.created
goal.updated
goal_run.created
plan.match_found
plan.compiled
plan.approval_required
plan.approved
workflow.started
step.resolved
step.started
step.progress
step.fallback
step.completed
workflow.replanned
attention.created
result.available
goal_run.completed
goal_run.failed
```

Feature 196 also consumes Feature 195 execution events.

---

# 164. Event Replay

Web/Mobile clients must recover after disconnect using:

```text
current state + event cursor
```

Do not rely on a permanently open socket.

---

# 165. Notification vs State

Notifications are delivery artifacts, not source of truth.

If push/Telegram delivery fails, Goal/Run state remains queryable.

---

# 166. SmartAIHub Mobile Technical Direction

Backend contracts should support either native or cross-platform clients.

The spec does not mandate Flutter/React Native/native Swift/Kotlin yet.

Critical requirement is API/event/media architecture independent of client framework.

---

# 167. Mobile Security

Support:

```text
secure token storage
biometric/OS re-auth for high-risk approvals
short-lived media URLs
remote logout/revoke
push token rotation
```

Do not embed provider credentials in mobile app.

---

# 168. Mobile Media Handling

Large photo/video upload:

```text
request upload session
upload directly to R2/object storage
register asset
create Command/Goal referencing asset ID
```

Do not proxy large binaries through normal command JSON.

---

# 169. Camera-to-Workflow

Mobile use case:

```text
record/upload video
  ↓
"ช่วยตัดต่อคลิปนี้"
  ↓
Goal references uploaded Library asset
  ↓
Planner previews solutions
  ↓
Feature 195 executes selected plan
```

---

# 170. Voice-to-Planner

Voice input should be normalized to the same Command object as typed text.

Preserve transcript and optionally audio reference for audit/debug according to privacy policy.

---

# 171. Proactive Assistant Behavior

SmartAIHub may recommend:

```text
create recurring Goal from repeated command
save workflow as template
use existing professional Plugin
connect local Runner to reduce cost
```

Recommendations require user control and should not create recurring spending silently.

---

# 172. Suggesting Better Solution

If user asks for a cheap video but quality requirement is incompatible, explain trade-off and offer alternatives.

Do not silently exceed budget/quality constraints.

---

# 173. New Technology Onboarding

To add a future Agent/provider:

1. implement Adapter
2. provide capability manifest
3. define schemas/constraints
4. define cost/usage model
5. define availability/health
6. run conformance tests
7. publish Offers to Registry

No Planner code branch should be required for ordinary onboarding.

---

# 174. Capability Deprecation

When provider/tool capability disappears:

```text
mark deprecated/unavailable
stop new selection
existing Goals re-resolve at next run
pinned Goals notify user
```

Workflow Blueprint remains valid if equivalent capability Offers exist.

---

# 175. Version Compatibility

Planner/Compiler must validate:

```text
capability contract version
Plugin version
Runtime package version
Agent adapter protocol
Feature 195 execution protocol
```

---

# 176. Caching

Cache:

```text
capability discovery
health summary
pricing metadata
Blueprint matches
```

But do not cache dynamic capacity as authoritative; Feature 195 owns real-time capacity.

---

# 177. Resilience

Feature 196 must tolerate:

```text
Agent offline
Provider unavailable
Runner offline
Plugin deprecated
mobile disconnect
Telegram outage
push failure
partial workflow completion
replan
```

Goal state remains durable.

---

# 178. Partial Completion

A workflow may produce useful partial results.

Status:

```text
partially_completed
```

UI shows completed artifacts and failed/pending branches.

---

# 179. Cancellation Semantics

Cancel Goal Run:

```text
Feature 196 marks cancellation intent
  ↓
propagate cancel to all active Feature 195 Jobs
  ↓
collect final cancellation results
  ↓
Goal Run = cancelled/partial according to policy
```

---

# 180. Pause/Resume

Pause recurring Goal != pause active execution.

Separate:

```text
Goal schedule paused
Goal Run paused
Job paused where supported
```

UI must distinguish them.

---

# 181. Approval Semantics

Plan-level approval:

```text
approve proposed cost/solution
```

Execution-level approval:

```text
publish/delete/credential/system action
```

Feature 196 and 195 correlate but do not conflate these approvals.

---

# 182. Planner and Feature 195 Budget Contract

Feature 196 sends:

```text
budget ceiling
step budgets
approval threshold
solution profile
```

Feature 195 reserves/meters/settles actual usage.

If actual projection changes materially, Feature 195 emits attention event for Feature 196.

---

# 183. Planner and Feature 195 Capability Contract

Each executable step includes:

```text
capability_id
contract_version
selected_offer or resolution policy
requirements
fallbacks
```

Feature 195 never invents a different logical objective.

---

# 184. Execution Path Contract

Every Job created from Feature 196 must correlate:

```text
goal_id
goal_run_id
plan_id
workflow_run_id
plan_step_id
logical_capability_id
selected_offer_id
origin_channel
caller/delegation
```

This is required for end-to-end monitoring.

---

# 185. Monitoring User Experience

User should be able to answer:

```text
ตอนนี้งานไปถึงไหนแล้ว?
กำลังทำอะไร?
ใช้ระบบอะไรทำ?
ทำไมถึงใช้ระบบนั้น?
เสียเครดิตเท่าไรแล้ว?
มีอะไรให้ฉันทำไหม?
ผลลัพธ์ที่ได้อยู่ไหน?
```

without inspecting infrastructure logs.

---

# 186. Simplified vs Advanced Monitoring

Default:

```text
Researching → Writing → Generating → Editing → Ready
```

Advanced:

```text
research.news → Grok Bot
content.script.write → SmartAIHub Pro Writer
video.generate → Seedance via managed provider account
video.edit → Home-PC Runner / SmartAIHub Pro Editor
```

Admin can see account/runtime/queue details.

---

# 187. Progress Confidence

If an external Agent cannot expose percent progress:

```text
status = Running
stage = Researching
progress_percent = null
```

Do not invent 67% merely for UI aesthetics.

---

# 188. Result Delivery from External Assistants

If Goal was created by Grok/Hermes:

- durable result goes to SmartAIHub Result Inbox/Library
- connector sends summary/reference back to caller
- large media may be returned as secure link/reference
- caller disconnect does not stop work

---

# 189. Mobile-First Long-Running Workflow Principle

A mobile user should be able to:

```text
say request
lock phone
come back hours later
see progress/history/results
```

No foreground app lifetime dependency is allowed.

---

# 190. Planner Explainability for Cost/Quality

For meaningful alternatives, user should see:

```text
why Professional costs more
why Use My Tools may be slower/unavailable
why local option needs a device online
why cheaper model may reduce quality
```

Avoid technical jargon where possible.

---

# 191. Migration from Existing Feature-Level UX

Existing Media Studio/Video Edit/Agents remain task-oriented.

They can:

```text
create exact Jobs directly through Feature 195
```

or:

```text
create a Goal/Plan through Feature 196 when workflow orchestration is useful
```

Migration is incremental.

---

# 192. Migration Phase A — Capability Taxonomy

Inventory existing:

```text
Skills
Agents
Plugins
providers
models
Worker capabilities
Runner plans
MCP tools
Media workflows
Video Editor functions
```

Map to canonical capability IDs/contracts.

---

# 193. Migration Phase B — Offer Registry

Register existing SmartAIHub implementations as Offers.

Do not change execution yet.

Verify:

```text
inputs
outputs
cost model
interaction modes
health
```

---

# 194. Migration Phase C — Environment Inventory

Implement discovery for:

```text
Runner
Worker
Hermes
Codex/Claude where supported
connected external agents
installed Plugins
```

---

# 195. Migration Phase D — Goal/Command Gateway

Implement Web first with canonical Command and Goal APIs.

Then adapters:

```text
Telegram
MCP
Mobile
external assistants
```

---

# 196. Migration Phase E — Blueprint Planner

Start with high-value blueprints:

```text
Morning News Brief
Topic Monitor
Deep Research
Daily Podcast
Storyboard
Camera Video Rough Cut
```

Use deterministic compiler + Registry validation.

---

# 197. Migration Phase F — Solution Optimizer

Add:

```text
Balanced
Professional
Economy
Use My Tools
Private/Local
```

Cost preview and alternative plans.

---

# 198. Migration Phase G — Feature 195 Integration

Submit compiled `sah-execution-plan/1`.

Verify:

```text
correlation IDs
execution path
cost rollup
progress aggregation
fallback events
approval propagation
```

---

# 199. Migration Phase H — SmartAIHub Mobile MVP

MVP:

```text
text/voice command
Active Work
Goal Run detail
Planner
Result Inbox
push notifications
approvals
media previews
```

Do not attempt to port all desktop Plugin UIs in MVP.

---

# 200. Migration Phase I — External Assistant Ecosystem

Expose MCP/API capability/Goal tools.

Support delegated identity/budget.

Integrate Grok/Hermes/AutoClaw progressively according to supported APIs.

---

# 201. Test Strategy — Unit

Test:

```text
Goal parsing
Blueprint matching
capability compatibility
Offer filtering
Solution Profile scoring
budget rules
privacy rules
plan compilation
fallback policy
loop detection
progress aggregation
```

---

# 202. Test Strategy — Integration

Test:

```text
Web → Goal → 195 Jobs
Telegram → Goal → Mobile monitoring
Mobile voice → Goal
External MCP agent → SmartAIHub → result callback
SmartAIHub → external Agent → child SmartAIHub call
manual Plugin handoff → resume workflow
provider/runtime fallback
```

---

# 203. Test Strategy — Multi-Channel Continuity

Scenario:

1. create Goal via Telegram
2. close Telegram
3. open SmartAIHub Mobile
4. view same Goal Run
5. approve on Mobile
6. open Web manual editor
7. complete edit
8. receive result through external assistant callback

Must remain one Goal Run.

---

# 204. Test Strategy — Rapid Ecosystem Change

Simulate:

```text
new Agent added
old Agent removed
capability version upgraded
provider cost changed
runtime offline
new Plugin becomes preferred Professional offer
```

No core Planner branch changes should be needed for ordinary manifest-driven updates.

---

# 205. Acceptance Criteria — Goal UX

1. user can request outcome without naming a tool
2. system creates understandable plan
3. recurring Goal can be scheduled
4. estimated cost is visible
5. user can select control/quality profile
6. user can choose SmartAIHub Pro or user-owned alternative when eligible
7. user can monitor from another channel/device
8. results remain available in SmartAIHub

---

# 206. Acceptance Criteria — Capability Graph

1. SmartAIHub professional capabilities registered
2. Plugin UI optional
3. Agents/Skills/Multi-Agent combinations supported
4. user-owned capabilities discoverable
5. capability versioning exists
6. conformance/verification exists
7. new Offers can be added without Planner branching
8. runtime health/availability reflected

---

# 207. Acceptance Criteria — Optimizer

1. supports quality/cost/speed/privacy/control dimensions
2. supports Managed/BYO/Local/Mixed cost modes
3. does not choose unavailable Offer
4. does not invent capabilities
5. respects pins/constraints
6. can present meaningful alternatives
7. records selection reason
8. supports fallback/replan

---

# 208. Acceptance Criteria — Multi-Channel

1. Web, Mobile and external channels map to same Goal model
2. origin channel does not own execution
3. channel disconnect does not cancel work
4. approvals can be resolved cross-channel
5. durable results exist independent of channel
6. delegated caller scopes/budgets enforced
7. delivery retry is separate from execution retry
8. recursive assistant loops are detected

---

# 209. Acceptance Criteria — Mobile

1. text and voice command
2. Active Work
3. Goal/Run history
4. Planner/schedules
5. Result Inbox
6. text/image/audio/video display
7. push notifications
8. approvals
9. background execution independent of app
10. deep link to manual/pro UI when needed

---

# 210. Acceptance Criteria — Feature 195 Integration

1. compiled plan maps to canonical Jobs
2. every Job carries Goal/Plan/Step correlation
3. execution path visible
4. actual cost rolls up to Goal Run
5. progress aggregates from real Job progress
6. fallback/replan is traceable
7. Provider Account details remain 195/Admin concern
8. 196 never becomes another queue system

---

# 211. Critical Blocking Rules

### Rule 1
User-facing orchestration must be outcome/capability-first, not vendor-first.

### Rule 2
Never assume the user knows which Agent/Skill/provider to use.

### Rule 3
Never let Planner execute hallucinated/unregistered capabilities.

### Rule 4
Never hard-code ordinary vendor selection throughout workflow code.

### Rule 5
Never make Telegram/Mobile/Grok the source of truth for Goal state.

### Rule 6
Never make Feature 196 a second execution queue/control plane.

### Rule 7
Never make Feature 195 responsible for interpreting free-form user Goals.

### Rule 8
Never bind professional capability permanently to one model/vendor.

### Rule 9
Never treat user-owned tools as unavailable merely because SmartAIHub has a paid alternative.

### Rule 10
Never silently spend above declared budget or use a materially different quality/cost fallback without policy permission.

### Rule 11
Never require desktop presence for long-running execution.

### Rule 12
Never allow external assistants unrestricted credits/permissions by default.

### Rule 13
Never lose Goal/Run lineage during manual/hybrid handoff.

### Rule 14
Never fabricate progress/cost certainty.

### Rule 15
Never require architectural redesign simply because a new Agent ecosystem appears.

---

# 212. Recommended Repository Boundaries

```text
web/
  features/goals/
  features/planner/
  features/work/
  features/results/
  features/professional-tools/
  components/orchestration/

mobile/
  assistant/
  work/
  planner/
  results/
  approvals/

server/
  command-gateway/
    adapters/
  goals/
  goal-runs/
  planner/
  workflow-compiler/
  blueprints/
  capabilities/
  expertise-graph/
  offers/
  solution-optimizer/
  environment-inventory/
  external-agents/
  delivery-router/
  attention/
  orchestration-policy/

sdk/
  capability-contracts/
  plugin-manifest/
  external-agent-adapter/
  channel-adapter/
  execution-plan-contract/
```

---

# 213. Spec 195 / 196 Shared Contract Package

Create a versioned shared package containing:

```text
Goal/Run IDs
Plan revision/hash/submission idempotency
Capability IDs/contracts
Offer references / eligible Offer sets
Execution Plan schema
Data/privacy/residency policy envelope
Context snapshot references
Progress aggregation schema
Execution event IDs/sequences/replay contract
Attention/Approval references
Manual handoff/control lease references
Evidence/source lineage references
Cost summary schema
Origin/Caller/delegation provenance
```

Avoid duplicating enum definitions in multiple services.

---

# 214. Current External Product References

Verified during preparation (September 2026):

Grok Bot Mobile:
`https://docs.x.ai/grok-bot/mobile`

Gemini mobile / Gemini Live:
`https://support.google.com/gemini/answer/14579026`
`https://support.google.com/gemini/answer/14554984`
`https://support.google.com/gemini/answer/15274899`

These are examples validating the multi-channel/personal-assistant direction. SmartAIHub architecture MUST NOT depend on any one product retaining its current features.

---

# 215. Definition of Done

Feature 196 is complete when SmartAIHub can reliably transform:

```text
"I want this outcome"
```

into:

```text
Goal
→ Plan
→ Capability DAG
→ Eligible Offers
→ Optimized/approved solution
→ Feature 195 executable Job Graph
→ monitored execution
→ durable result
→ delivery through any authorized channel
```

while the user does not need to know which Agent/model/provider/runtime is required.

The system must remain extensible enough that a future Grok/Claude/Gemini/OpenAI/third-party personal assistant can be either:

```text
1. an execution resource used by SmartAIHub
2. an external command surface that asks SmartAIHub to do professional work
3. both
```

without changing the core Goal/Capability/Execution architecture.
---

# 216. Cross-Plane Ownership Matrix

To prevent Feature 195 and 196 from converging into another monolith, ownership is explicit.

| Concern | Feature 196 | Feature 195 |
|---|---|---|
| User Goal semantics | Authoritative | Reference only |
| Capability requirements | Authoritative | Enforce |
| Offer candidate set | Authoritative | Consume |
| Quality/control/privacy intent | Authoritative | Enforce |
| Provider account selection | No | Authoritative |
| Queue/slot/capacity | No | Authoritative |
| Runtime instance/node | Policy envelope only | Authoritative |
| Actual execution status | Aggregate | Authoritative |
| Actual cost ledger | Aggregate/display | Authoritative |
| Plan revision/replan | Authoritative | Request/consume |
| Delivery presentation | Authoritative | Emit normalized event |
| Job retry/lease/watchdog | No | Authoritative |

A change that crosses this boundary MUST use a versioned contract/event, never an implicit shared database assumption.

---

# 217. Plan Revision, Hash and Idempotent Submission

Every compiled execution plan MUST include:

```text
plan_id
plan_revision
plan_hash
submission_id
idempotency_key
compiler_version
policy_version
capability_registry_snapshot_id
```

Rules:

- one accepted revision is immutable
- changed semantics create a new revision
- retries of the same submission do not create duplicate root Jobs
- Goal Run records the authoritative current revision
- old plan revisions remain inspectable for audit/replan history
- Feature 195 acceptance/rejection is persisted before UI reports the plan as queued

---

# 218. Professional Offer Evaluation and Certification

`verified_status` alone is insufficient for SmartAIHub Pro positioning.

Introduce a versioned evaluation record:

```text
offer_evaluations
```

Fields:

```text
evaluation_id
offer_id
offer_version
capability_id
contract_version
evaluation_suite_version
domain
test_dataset_version
quality_dimensions_json
conformance_result
qc_result
safety_policy_result
cost_sample
latency_sample
evaluated_at
expires_at
status
```

Evaluation sources:

```text
schema/conformance tests
curated benchmark tasks
human expert review when applicable
automated QC
production telemetry
user feedback
```

Rules:

1. no single global “best model” ranking
2. evaluation is capability/domain specific
3. evidence must be version/freshness aware
4. a major Offer/Agent/model upgrade triggers re-evaluation
5. professional badge/metadata requires a passing platform-defined evidence policy
6. production telemetry can downgrade confidence or trigger re-evaluation
7. user-owned tools may remain `available` without being `SmartAIHub Pro verified`

---

# 219. Cost Uncertainty and Utility Frontier

Plan optimization MUST represent uncertainty instead of pretending all estimates are exact.

For each Plan/Step:

```text
estimated_credits_low
estimated_credits_expected
estimated_credits_high
external_cost_known
external_cost_unknown
duration_low/expected/high
quality_confidence
```

The Optimizer SHOULD generate a small Pareto/utility frontier such as:

```text
Best Balance
Highest Quality
Lowest SmartAIHub Cost
Fastest
Use My Tools First
Private/Local First
```

Do not expose dozens of near-identical alternatives.

If actual projected cost crosses a configured threshold before an expensive step, the workflow:

```text
continue automatically within envelope
OR request approval
OR replan
```

according to Goal policy.

---

# 220. Channel Connection Lifecycle and Command Deduplication

Cross-channel identity needs a concrete connection lifecycle.

Suggested:

```text
channel_connections
```

Fields:

```text
connection_id
tenant_id
user_id
channel_type
external_subject_id
auth_method
credential_ref
scopes
status
linked_at
last_verified_at
expires_at
revoked_at
metadata_json
```

Supported lifecycle:

```text
link
verify
refresh
scope-change
suspend
revoke
relink
```

Inbound commands MUST have channel-specific dedupe keys.

Examples:

```text
Telegram update/message ID
MCP request ID
mobile client command UUID
web request idempotency key
external agent invocation ID
```

Duplicate delivery MUST map to the same canonical `command_id` and MUST NOT create a second Goal/Goal Run.

---

# 221. Voice and Multimodal Command Safety

Voice is an ingress modality, not a separate orchestrator.

Voice pipeline:

```text
audio capture
→ transcription
→ intent/Goal parsing
→ confirmation policy
→ canonical command
```

Requirements:

- preserve original audio reference only according to retention policy
- store transcript confidence when available
- visually/verbally confirm high-impact interpretations
- destructive/publishing/spending actions require the same approval rules as typed commands
- ambiguous names, amounts, dates and destinations SHOULD be confirmed before high-impact execution
- user can inspect/edit transcript before activation in Assisted mode
- attachments from camera/gallery/file share use the same canonical attachment references as Web

---

# 222. Scheduling Semantics: Timezone, DST, Missed Runs and Quiet Hours

Every recurring Goal schedule MUST define:

```text
schedule_expression
schedule_timezone
dst_policy
missed_run_policy
overlap_policy
quiet_hours_policy
start_at
end_at optional
```

`missed_run_policy`:

```text
skip
run_once_on_recovery
catch_up_bounded
catch_up_all
```

Default for content/news automation SHOULD normally be `run_once_on_recovery`, not unbounded catch-up.

DST policy MUST state whether the intention is:

```text
same local clock time
or fixed UTC cadence
```

Changing timezone creates an auditable schedule revision.

Delivery quiet hours may delay notifications without delaying the underlying Goal Run unless policy explicitly says otherwise.

---

# 223. Data Governance: Classification, Consent, Retention and Residency

Feature 196 owns user-facing/policy intent for data use.

Goal/Plan may carry:

```text
data_classification
purpose
retention_policy_id
residency_policy
external_processing_allowed
allowed_provider_regions
local_only
consent_record_ids
redaction_policy
```

Requirements:

1. Capability Broker excludes Offers that violate data policy.
2. Plan Preview discloses material external processing when user policy requires it.
3. A user can revoke a connection/delegation without invalidating historical audit records.
4. retention differs for command text, voice recordings, planning/debug traces, execution logs and durable Library assets.
5. deletion workflow propagates to mutable SmartAIHub stores and prevents future use of deleted context.
6. legal/compliance retention overrides are explicit and scoped.
7. sensitive Goal context is minimized when delegated to external agents.
8. residency rules flow to Feature 195 for actual dispatch enforcement.

---

# 224. Plugin Supply-Chain and Permission Evolution

Plugins are executable/professional packages and require lifecycle security.

Every installable Plugin version SHOULD provide:

```text
publisher_id
package_digest
signature/attestation
manifest_version
SBOM reference when executable code exists
capability declarations
permission scopes
runtime dependencies
minimum Core/SDK versions
release channel
```

Rules:

- immutable version/digest
- verify publisher/signature before activation
- dependency versions are resolved deterministically
- new permissions/capabilities are shown as a permission delta before update
- auto-update policy can differ by tenant/plugin
- rollback to last-known-good
- revoked Plugin version cannot receive new work
- professional verification is version-specific
- UI and headless Plugin forms obey the same permission model

---

# 225. Manual/Hybrid Handoff Ownership

Manual and Hybrid workflows require explicit control ownership.

States:

```text
automation_control
handoff_pending
user_control
plugin_ui_control
handback_pending
automation_control
```

During human/plugin control:

- downstream mutable steps pause
- editable artifact version is locked or branch/versioned
- autosave does not implicitly resume automation
- user explicitly chooses `Continue Automation`, `Finish Manually` or `Cancel`
- handback creates a new artifact version/checkpoint
- Planner validates whether downstream input mappings remain compatible

Feature 195 supplies the handoff control lease; Feature 196 presents the UX and decides workflow semantics.

---

# 226. Research Evidence and Source Lineage

Research/news/monitoring capabilities MUST support a normalized evidence model.

Suggested:

```text
evidence_items
```

Fields:

```text
evidence_id
goal_run_id
plan_step_id
source_url
source_type
publisher
author optional
published_at
retrieved_at
content_hash
citation_locator
claim_refs
freshness_class
verification_status
producing_offer_id
```

Research output SHOULD distinguish:

```text
source evidence
derived claim
summary/inference
generated recommendation
```

For high-freshness Goals, Planner defines a maximum evidence age.

Political/public-official and health-information workflows can require stronger source/evidence policies through the Domain/Risk Policy Engine.

---

# 227. Delegation Chain and Capability Attenuation

Delegation MUST never increase authority.

Each hop receives an attenuated token/scope:

```text
delegation_chain_id
parent_delegation_id
caller
allowed_capabilities
allowed_projects/artifacts
max_credits
expiry
approval requirements
hop_count
```

Rules:

1. child scope ⊆ parent scope
2. child budget ≤ remaining parent budget
3. external assistant cannot mint a broader delegation
4. credentials are never forwarded when a scoped SmartAIHub capability token can be used
5. nested external-agent calls preserve origin/user/tenant provenance
6. loop detection and capability attenuation are both required

---

# 228. Delivery Reliability and Result Inbox

The Result Inbox is the canonical cross-channel presentation anchor.

Suggested records:

```text
result_inbox_items
delivery_attempts
```

Inbox item:

```text
inbox_item_id
user_id
goal_run_id
type
status
summary
artifact_refs
action_required
created_at
read_at
archived_at
```

Delivery attempt:

```text
delivery_attempt_id
inbox_item_id
channel_connection_id
channel_message_id
attempt
status
error
sent_at
acknowledged_at
next_retry_at
```

Rules:

- channel failure never loses the canonical result
- retry uses idempotency/dedupe
- user can open the same result from another authorized channel
- push notification is a pointer, not the only copy of the result
- sensitive result previews follow lock-screen/privacy policy

---

# 229. Registry Freshness and Stale Capability Handling

Capability discovery is dynamic, so every inventory snapshot needs:

```text
observed_at
expires_at
health_checked_at
source
adapter_version
confidence
```

Before expensive execution the Resolver MUST revalidate critical availability when the snapshot is stale.

Stale rules:

```text
hard stale → exclude
soft stale → include with reduced confidence / recheck
offline → exclude
unknown → policy-dependent
```

A capability disappearing after plan compilation triggers operational fallback or `execution.replan_required` according to the 195/196 boundary.

---

# 230. Goal/Planner Scalability and Indexing

For large Goal history and many channels:

Recommended query/index review:

```text
goals(tenant_id, user_id, status, updated_at)
goal_runs(goal_id, started_at)
goal_runs(user_id, status, started_at)
workflow_runs(goal_run_id)
workflow_plan_steps(plan_id, dependency order)
channel_connections(user_id, channel_type, status)
result_inbox_items(user_id, status, created_at)
evidence_items(goal_run_id, plan_step_id)
```

Rules:

- Result Inbox uses cursor pagination
- planner debug payloads may be archived separately from hot Goal metadata
- capability graph supports cached read models
- environment discovery updates incrementally rather than rebuilding full graph per request
- large plan/debug blobs use object/document storage references where appropriate

---

# 231. Orchestration SLO, Disaster Recovery and Degraded Mode

Feature 196 needs independent SLOs from Feature 195.

Categories:

```text
Command acceptance
Goal creation
planning latency
plan compilation
Result Inbox availability
cross-channel delivery
approval propagation
schedule trigger accuracy
```

Degraded modes:

```text
accept command and defer planning
use last-known-safe capability snapshot
disable expensive replanning
disable nonessential external assistants
Web/Mobile Result Inbox read-only
delivery-channel retry only
```

DR MUST define RPO/RTO for:

```text
Goals
Goal Runs
plans/revisions
channel identities/delegations
schedules
Result Inbox
audit/evidence metadata
```

A channel outage MUST NOT lose canonical Goal/Result state.

---

# 232. Routing Experimentation Guardrails

SmartAIHub may later test alternative Offers to improve routing, but experimentation MUST be controlled.

Rules:

- never experiment outside Goal privacy/budget/quality policy
- no hidden downgrade of a user-pinned or Professional requirement
- high-risk domains may disable exploration
- experiments are versioned and auditable
- user-owned resources are not consumed experimentally without policy
- experiment results feed capability-specific telemetry, not a global vendor ranking
- production exploration percentage has hard caps

---

# 233. Feature 196 Review Addendum — Definition of Done

Feature 196 is not considered architecture-complete until, in addition to previous criteria:

1. 195/196 ownership matrix is enforced
2. plans are revisioned, hashed and idempotently submitted
3. Professional Offers have versioned quality evidence, not self-claimed labels
4. cost uncertainty and threshold-based reapproval/replan are supported
5. channel connections have link/refresh/revoke lifecycle and command dedupe
6. voice/high-impact commands use confirmation policy
7. recurring schedules define timezone/DST/missed-run/quiet-hours behavior
8. data classification/consent/retention/residency flows through planning
9. Plugin supply chain and permission deltas are governed
10. manual/hybrid handoff has explicit control ownership
11. research outputs can preserve evidence/source lineage
12. nested delegation is scope-attenuating and budget-bounded
13. channel delivery failure cannot lose results
14. capability freshness is explicit
15. Goal/Result data paths have scalability/indexing strategy
16. orchestration has SLO/DR/degraded-mode requirements
17. routing experiments cannot violate user policy
---

# 234. Integration Directionality and Automation Legality

A user owning/subscribing to a tool does NOT automatically mean SmartAIHub may automate it programmatically.

Every external/user-owned Offer MUST declare an integration profile:

```text
integration_mode = official_api | mcp | local_cli | local_app_bridge | user_interactive | unsupported
invocable_by_smartaihub
can_invoke_smartaihub
background_automation_allowed
credential_handling_mode
terms_policy_status
terms_verified_at
required_user_presence
```

Examples:

- an MCP-capable personal assistant may call SmartAIHub even if SmartAIHub cannot programmatically create/run that assistant
- a locally installed CLI may be invocable through Runner when its license/integration mode permits it
- a consumer subscription MUST NOT be treated as an API entitlement unless the provider officially supports that use
- an interactive-only tool remains an Offer only for Manual/Assisted handoff, not AUTO background execution

Capability Broker MUST exclude an Offer from a control mode it cannot legally/technically support.

---

# 235. Planner Provenance and Reproducibility

Every Plan revision SHOULD persist enough provenance to explain why the Planner produced it:

```text
planner_engine_id
planner_model/version
planner_prompt/policy_version
blueprint_version
capability_registry_snapshot_id
environment_snapshot_id
user_preference_version
input_context_digest
compiled_at
```

The system is not required to reproduce stochastic model text byte-for-byte, but it MUST be able to reconstruct:

- the GoalSpec used
- the candidate Offers visible at planning time
- policy/budget/privacy constraints
- Blueprint/version selected
- final compiled DAG and decision records

This is required for debugging, audits and regression testing when external agent/model capabilities change rapidly.
---

# 236. Context and Memory Service

A goal-oriented personal assistant needs context that outlives one chat, but context MUST be scoped and provenance-aware.

Introduce a logical **Context Resolver / Memory Service** above the Planner.

Context scopes:

```text
current_command
conversation_session
goal
project
user_preferences
tenant_policy
prior_goal_results
SmartAIHub Library references
approved long-term memory
external assistant context reference
```

Planner receives a **Context Snapshot**, not unrestricted access to all historical data.

Suggested fields:

```text
context_snapshot_id
user_id
tenant_id
goal_id optional
project_id optional
source_refs[]
memory_refs[]
preference_version
created_at
expires_at
data_classification
```

Rules:

1. Context is purpose-limited to the active Goal.
2. Every injected memory/context item has source/provenance.
3. External-agent context is untrusted input, not privileged instruction.
4. Sensitive context is minimized before external delegation.
5. User/project memory can be disabled or scoped independently.
6. A Plan records the `context_snapshot_id` used.
7. Updating memory does not rewrite historical Plan provenance.
8. Replanning may request a fresh snapshot when old context is stale.

Examples:

- “ทำเหมือนคลิปเมื่อวาน” can resolve prior Goal/Artifact references.
- “ใช้รูปสินค้าเดิม” can resolve Library assets with permission checks.
- Personal preferences such as default language/control mode come from preference context, not model guesswork.

---

# 237. Trigger Engine and Event Subscription Contract

`Trigger` is a first-class orchestration input and MUST be reliable/idempotent.

Trigger types:

```text
schedule
webhook
connector_event
file_arrival
condition_watch
manual
external_assistant
plugin_event
```

Suggested records:

```text
goal_triggers
trigger_subscriptions
trigger_events
```

Every trigger event includes:

```text
trigger_event_id
trigger_id
source
source_event_id
occurred_at
received_at
dedupe_key
payload_ref
```

Rules:

- duplicate source events MUST NOT create duplicate Goal Runs
- schedule and connector cursors/checkpoints are persisted
- a trigger creates a Goal Run; it never bypasses Goal/Plan policy
- missed event recovery is explicit
- condition watches have evaluation cadence/backoff and do not busy-loop
- connector revocation pauses affected triggers and surfaces Attention Required
- trigger filters are versioned and auditable

---

# 238. Offer Entitlement, Installation and Commercial Availability

A Capability Offer may exist globally but still be unusable by a specific user/tenant.

Eligibility MUST include:

```text
installed/enabled
entitlement/license
subscription/plan
territory/tenant availability
required connection
required device/runtime
Plugin version compatibility
credit/budget availability
trial/expiry status
```

Suggested logical resource:

```text
offer_entitlements
```

Fields:

```text
user_or_tenant_scope
offer_id
status
source = marketplace|tenant_install|built_in|user_owned|trial
starts_at
expires_at
version_constraint
commercial_policy_ref
```

Capability Broker MUST distinguish:

```text
available globally
eligible for this user
ready now
requires setup
requires purchase/install
unavailable
```

Plan Preview may offer a professional SmartAIHub option that requires purchase/install, but AUTO execution MUST only select Offers currently authorized by Goal policy and entitlement.
---

# 239. Workflow Graph Semantics

The Workflow Compiler MUST emit more than a list of Steps. Every Plan Step needs explicit graph/failure semantics.

Fields SHOULD include:

```text
depends_on[]
condition optional
required_or_optional
fanout_policy optional
fanin_policy optional
failure_policy = stop|continue|fallback|replan|partial_success
retry_policy_ref
compensation_policy_ref optional
output_reuse_policy
```

The compiled graph MUST be acyclic unless an iterative loop is explicitly represented as a bounded iteration construct with:

```text
max_iterations
termination_condition
budget_limit
time_limit
```

Feature 195 enforces runtime dependency readiness; Feature 196 owns the semantic graph and failure policy.

---

# 240. Data Locality and Transfer-Aware Planning

For camera footage, large video, datasets and local project files, the best executor depends on where the bytes already are.

Solution Optimizer SHOULD consider:

```text
input size
current asset location
available upload bandwidth
expected transfer time
privacy/local-only constraints
network/egress cost
required manual UI
executor capability
```

Example:

```text
5 GB video already on Home-PC + Runner online
→ prefer local SmartAIHub Pro Editor/FFmpeg when quality policy allows

video uploaded from phone to SmartAIHub Library
→ cloud editor/render may avoid re-downloading to local PC
```

Plan Preview should disclose material transfers such as:

```text
Upload 5.1 GB to SmartAIHub Cloud
Estimated transfer time: ...
```

Unknown network speed remains unknown rather than fabricated.

---

# 241. Replan Reuse and Completed-Work Preservation

Replanning MUST reuse already-completed compatible work whenever safe.

For each completed Step, Feature 196 evaluates:

```text
output capability contract
artifact version/hash
input lineage
quality/profile compatibility
privacy policy
new downstream requirements
```

A new plan revision marks each prior result:

```text
reuse
revalidate
rerun
invalidated
```

Do not regenerate a paid video/image/audio asset merely because a downstream editor/runtime changed.

User override such as “ใช้ Seedance แทน Grok สำหรับช็อตนี้” should invalidate only affected descendants unless policy requires broader regeneration.


---

# 242. Feature 197 Alignment and Planner Ownership

Feature 196 remains authoritative for Goal semantics, Plan/DAG structure, capability requirements, semantic Offer eligibility, quality expectations, user intent, approval policy and Plan revisions.

Feature 197 supplies Runner capability/provenance/experience information but MUST NOT silently mutate Plan semantics.

Ownership summary:

```text
Goal / intent / output semantics / binding policy           → Feature 196
Job / lease / capacity / retry / execution truth            → Feature 195
Runner local topology / local capability discovery          → Feature 197
experience evidence / planning-learning feedback            → Feature 197
```

Any execution-time change that crosses semantic, quality, privacy, control, explicit vendor/tool pin or material-cost boundaries MUST return to Feature 196 for a Plan revision or approval decision.

---

# 243. Execution Topology as a Planning Dimension

Feature 196 MUST distinguish where a capability is implemented without treating every local tool as a globally registered executor.

Possible implementation topologies:

```text
SmartAIHub managed provider
SmartAIHub cloud runtime
SmartAIHub Runner-hosted local implementation
remote/external Agent service
outbound MCP/connector service
manual/user-interactive step
```

For Runner-hosted work, Planner usually selects:

```text
required capability
eligible Runner scope/pool
local implementation policy
minimum control/quality/privacy requirements
```

rather than a physical device or executable name.

A physical Runner/device SHOULD be pinned only for explicit affinity, locality or user choice.

---

# 244. Local Tool Binding Policy

Feature 196 MUST support normalized binding strength for Runner-hosted Agent/tool resolution.

```text
FREE
PREFERRED
REQUIRED
FORBIDDEN
```

Semantics:

## FREE

Runner/Agent may choose any implementation inside the allowed capability/policy envelope.

Example:

```text
Need image.generate.
Claude may use a user-owned FAL skill or SmartAIHub capability when both are allowed.
```

## PREFERRED

Planner expresses an ordered preference, but an equivalent allowed implementation may be chosen when the preferred implementation is unavailable or local policy permits substitution.

## REQUIRED

The specified tool/provider/implementation is semantically or contractually required. No silent substitution.

## FORBIDDEN

The specified tool/provider/implementation MUST NOT be used for this Plan Step.

Binding strength is separate from Offer eligibility and separate from physical Runner selection.

---

# 245. Agent Execution Modes

Feature 196 MUST support at least three normalized modes for Runner-hosted general-purpose Agents.

```text
AUTONOMOUS
COOPERATIVE
MANAGED
```

## AUTONOMOUS

Agent keeps its existing Skills/MCP/tools and chooses its own internal strategy within the Job's permission/privacy envelope. SmartAIHub supervises the execution envelope but may have limited internal observability.

## COOPERATIVE

Default recommended mode. Existing user tools remain available and Runner MAY provision additional job-scoped SmartAIHub capabilities/MCP/instructions. Agent may choose user-owned or SmartAIHub options according to binding policy.

## MANAGED

Use when enterprise/security/budget/reproducibility policy requires stronger restriction. Runner/adapter MAY filter tools, inject approved MCP/config, enforce hooks or restrict unapproved integrations when technically supported.

Planner MUST NOT assume MANAGED control is possible unless Feature 195/197 capability profiles confirm it.

---

# 246. User-Owned Tool Policy

Feature 196 MUST preserve the user's right to use existing subscriptions, local tools, Skills and MCP services when policy allows.

Suggested policy dimensions:

```text
prefer_user_owned_tools
allow_user_owned_tools
allow_unknown_external_cost
smartaihub_as_fallback
smartaihub_managed_required
local/private_only
approved_tool_ids / forbidden_tool_ids
```

`Use My Tools First` is a Solution Profile, not a vendor pin.

Example:

```text
Use My Tools First
→ user-owned Claude/Codex/Hermes/FAL/MCP may be preferred
→ SmartAIHub capability remains fallback when allowed
→ no automatic paid SmartAIHub substitution across approval/cost boundary
```

Planner MUST distinguish:

```text
"use Grok only"             = explicit tool pin
"use my tools first"        = preference profile
"prefer Grok"               = soft preference
```

---

# 247. Runner-Local Resolution Contract

A Plan Step that allows Runner-local resolution SHOULD compile:

```text
local_resolution_allowed
allowed_local_implementation_ids optional
forbidden_local_implementation_ids optional
local_tool_binding_policy
minimum_control_level optional
required_runtime_features optional
```

Example:

```yaml
capability_id: code.refactor
local_resolution_allowed: true
allowed_local_implementation_ids:
  - codex-cli
  - claude-code
  - hermes-cli
local_tool_binding_policy: FREE
```

Feature 195/Runner may choose among those implementations based on current readiness/resources, but MUST report the actual implementation selected for provenance.

If no allowed local implementation is ready, Feature 195 returns a decline/wait/fallback/replan signal according to compiled policy rather than silently expanding the allowed set.

---

# 248. Control Requirement Contract

Planner MUST treat interactivity/control as a first-class requirement when the user's workflow needs it.

Plan Step MAY require:

```text
minimum_control_level
required_control_features
```

Control features MAY include:

```text
status
stage_progress
steer
pause
resume
cancel
checkpoint
handoff
nested_tool_events
```

Example:

```text
User says: "I want to watch it work and be able to redirect it."
→ require `steer + cancel`
→ exclude implementations that cannot satisfy those controls when requirement is hard
```

Control requirement is not a global ranking of Agents. It is task/policy compatibility.

---

# 249. User Intervention Classification

The Universal Command Gateway MUST accept commands during an active Goal Run and classify them before deciding whether to mutate execution or Plan semantics.

Normalized intervention intents SHOULD include:

```text
STEER_CURRENT
PATCH_CURRENT_CONTEXT
PATCH_FUTURE
ADD_CONSTRAINT
SWITCH_EXECUTOR
PAUSE
RESUME
CANCEL_STEP
CANCEL_GOAL_RUN
APPROVE
REPLAN
```

Examples:

```text
"หยุด Codex แล้วใช้ Claude แทน"
→ SWITCH_EXECUTOR

"ถ้า research เสร็จ สรุปให้ไม่เกิน 2 นาที"
→ PATCH_FUTURE / output constraint

"ยกเลิกงานนี้"
→ CANCEL_GOAL_RUN
```

Feature 196 decides semantic scope; Feature 195 applies runtime-side effects.

---

# 250. Plan Revision Semantics for Live Intervention

Accepted Plan revisions remain immutable.

When user intervention changes future semantics:

```text
Plan revision N
→ user command
→ compile revision N+1
→ define effective boundary
```

The revision MUST record where it becomes effective, for example:

```text
effective_immediately where safe
effective_after_plan_step_id
effective_for_not_started_descendants_only
```

Already completed valid work SHOULD be preserved unless the new semantics invalidate it.

Example:

```text
Research executed under revision 3
User adds max 2-minute output
Summary/Script execute under revision 4
```

Audit UI MUST be able to reconstruct this boundary.

---

# 251. Switch-Executor Decision Semantics

A request to change executor MAY be either operational or semantic.

Feature 196 MUST determine whether the requested change:

```text
stays inside allowed equivalent local implementations
changes selected Offer
changes quality class
changes privacy/locality
changes external/SmartAIHub cost envelope
changes control mode
changes user-pinned tool/provider
```

If the system operationally selects another implementation inside the already compiled equivalent set, Feature 195 may perform local/cross-Runner handoff without a semantic replan.

However, an explicit user command such as `use Claude instead` creates a new hard preference/pin for the affected scope. Even if Claude was already in the allowed set, Feature 196 SHOULD persist that intent as a new Plan revision (or equivalent immutable intervention revision) before/with the handoff so future audit and learning distinguish system fallback from user-directed pinning.

If the change crosses any semantic/policy boundary, Feature 196 MUST create a Plan revision or obtain required approval before execution proceeds.

---

# 252. Quality Contract

Feature 196 MUST compile an explicit Quality Contract when a Step requires output validation beyond basic execution success.

Suggested structure:

```text
quality_contract_id
capability_id
contract_version
quality_profile
hard_gates
semantic_gates
human_approval_policy
repair_allowed
regenerate_allowed
quality_retry_budget
acceptance_evidence_requirements
```

Example:

```yaml
quality_profile: professional
hard_gates:
  playable: true
  audio_required: true
semantic_gates:
  preserve_key_context: true
  remove_repeated_speech: true
repair_allowed: true
regenerate_allowed: true
```

Feature 195 evaluates/enforces the gate. Feature 196 defines what acceptable output means.

---

# 253. Retry/Fallback/Replan Boundary

Feature 196 MUST compile enough policy for Feature 195 to recover operationally without asking the Planner for every transient failure.

Plan Step SHOULD define:

```text
allowed_offer_ids
fallback_offer_ids
local implementation set
fallback constraints
quality retry policy
cost/credit ceiling
time/deadline envelope
approval boundary
```

Feature 195 may handle:

```text
node loss
same Offer different capacity/account
allowed equivalent Runner implementation
transient provider retry
quality repair/retry within contract
```

Feature 195 MUST emit `execution.replan_required` when recovery would require crossing the compiled semantic/policy envelope.

---

# 254. User-Owned External Cost Uncertainty

Planner MUST represent user-owned external costs honestly.

For each relevant Step:

```text
smartaihub_cost_estimate
external_user_owned_cost_status = known | estimated | unknown
```

Examples of potentially unknown external cost:

```text
Claude subscription usage
Codex subscription usage
user FAL account
user-owned MCP SaaS
arbitrary paid CLI/API configured locally
```

Unknown MUST NOT be represented as zero.

Plan comparison MAY still explain that SmartAIHub credits are lower while external subscription/API charges may occur separately.

---

# 255. Runner Capability Snapshot as Planner Input

Feature 196 receives Runner availability through a versioned capability-registry snapshot, not direct ad-hoc device polling during every reasoning step.

Planner input SHOULD include:

```text
capability_registry_snapshot_id
observed_at
freshness/confidence
eligible Runner pool summary
control capabilities
locality/resource hints when relevant
```

A Plan should not hard-bind to a physical Runner merely because one was online at compile time unless affinity/pinning requires it.

Actual node/runtime binding remains Feature 195 execution responsibility.

---

# 256. Experience Evidence Input from Feature 197

Feature 196 Optimizer MAY consume curated experience evidence such as:

```text
task/domain scoped success rate
QC first-pass rate
retry/fallback rate
latency distribution
manual correction amount
user intervention patterns
cannot-continue/decline patterns
cost estimate error
version-scoped confidence
```

Planner MUST distinguish:

```text
raw telemetry
experience observation
curated planning lesson
verified platform evaluation
```

Raw Job logs SHOULD NOT be inserted wholesale into every planning prompt.

---

# 257. Learning Guardrails for Planning

Historical evidence MUST NOT become an uncontrolled permanent blacklist or self-reinforcing preference.

Every durable learned preference SHOULD be scoped by:

```text
task class/domain
user/tenant/global scope
implementation/Offer/version
sample count
confidence
created_at / last_confirmed_at
expiry/time decay
failure context
```

A single failure is insufficient for a hard routing rule.

Network outage, node loss and unrelated provider failure MUST NOT be misclassified as capability incompetence.

Major runtime/Agent/Offer version changes SHOULD reduce confidence or trigger re-evaluation.

`HARD_BLOCK` requires explicit user/admin/security/policy authority. Autonomous learning may produce `PREFER`, `DEPRIORITIZE`, `SOFT_AVOID` or equivalent evidence-backed guidance.

---

# 258. Adaptive Planning and Controlled Exploration

Planner SHOULD use historical evidence to improve future Plans while preserving user choice.

Example:

```text
Similar jobs:
Grok Bot frequently cannot continue
Codex completes reliably but is slower
SmartAIHub Pro has high QC pass rate but costs more
```

Future alternatives may reflect those observations, but MUST still honor the user's profile and pins.

Controlled exploration MAY test an alternative implementation only when:

```text
risk is low
budget permits
privacy policy permits
user/tenant policy permits
no explicit pin conflicts
```

Exploration must be labeled in telemetry so learning analysis does not treat it as ordinary production routing without context.

---

# 259. Three MCP/Runner Directions in Planner Semantics

Feature 196 MUST distinguish these directions:

```text
1. Runner execution
   SmartAIHub assigns work to Runner.

2. MCP inbound
   Claude/Codex/Hermes/OpenClaw/etc. invokes SmartAIHub MCP tools.
   The external client is a caller, not automatically an executor.

3. MCP outbound
   SmartAIHub invokes an external MCP/service capability.
   The external service is an implementation/tool used by the Plan.
```

Connecting to SmartAIHub MCP does not make an external Agent equivalent to Runner and does not grant local-device/job-claim privileges.

---

# 260. Optional Job-Scoped SmartAIHub MCP in Runner Plans

For COOPERATIVE/MANAGED Runner-hosted Agent execution, Plan MAY authorize Runner to provision a job-scoped SmartAIHub MCP capability surface.

Possible allowed tools:

```text
library.search
library.read
image.generate
video.generate
audio.generate
job.child.status
```

This surface is additional, not necessarily exclusive.

Planner MUST specify whether SmartAIHub capability usage is:

```text
FREE          # Agent may use or ignore
PREFERRED     # prefer SmartAIHub but alternatives allowed
REQUIRED      # must use SmartAIHub capability for this step
FORBIDDEN     # cannot use SmartAIHub managed capability
```

Nested SmartAIHub capability calls inherit parent Goal/Job permission, budget and approval constraints.

---

# 261. Progress Observability Contract

Feature 196 aggregates workflow progress only from Feature 195 normalized execution data.

Plan/UI MUST tolerate executors that expose different observability levels:

```text
opaque lifecycle only
stage/activity
native percent
estimated/derived percent
```

User-facing UI MUST distinguish native from estimated progress when material.

Example:

```text
Codex · Researching sources · detailed stage available
External Agent · Running · detailed progress unavailable
```

Do not penalize an implementation in planning solely for lacking percentage progress unless the user/workflow explicitly requires stronger observability/control.

---

# 262. User-Facing Active Work Control

Active Goal/Work UI SHOULD expose controls according to the current execution/control profile:

```text
Give instruction
Change future requirement
Switch executor
Pause
Resume
Cancel step
Cancel goal
Approve
```

Unavailable actions MUST be shown as unsupported/not available rather than simulated.

When the requested action requires a Plan revision, UI SHOULD explain that SmartAIHub is replanning rather than imply the current executor was directly modified.

---

# 263. Plan Recommendation Explanation from History

When history materially affects a recommendation, SmartAIHub SHOULD be able to explain the evidence at a user-friendly level.

Example:

```text
Codex is recommended for this task because 7 of your last 8 similar jobs completed successfully.
Grok Bot could not continue in 3 of the last 4 similar jobs.
```

Requirements:

- show scope: user/tenant/platform
- show recency/version relevance when useful
- avoid false precision from tiny samples
- allow user override where policy permits
- do not present learned preference as permanent truth

---

# 264. Learning-Based Rule User Controls

User/tenant admin SHOULD be able to inspect material learned routing preferences that affect them.

Controls MAY include:

```text
keep preference
remove/disable preference
pin a preferred tool
forbid a tool explicitly
reset task-specific learned preference
```

A user-forbidden tool becomes policy, not merely low-confidence learning evidence.

Learning UI MUST NOT expose another tenant's private execution history.

---

# 265. Revised Cross-Spec Compiled Plan Minimum

A production Compiled Execution Plan that may use Runner/Agent execution SHOULD carry or reference:

```text
plan_id / plan_revision / plan_hash
capability contracts
DAG dependencies
allowed Offers / binding policy
execution topology preferences
Runner pool scope if relevant
local_resolution_allowed
allowed/forbidden local implementation set where constrained
local tool binding policy
agent execution mode
minimum control requirements
user-owned-tool policy
quality contract
retry/fallback policy envelope
budget/cost approval envelope
privacy/residency policy
intervention policy
experience-evidence snapshot/reference
context snapshot
artifact mappings
```

Fields may be omitted when irrelevant, but absence MUST have well-defined defaults.

---

# 266. Feature 196 Revised Acceptance Criteria

Feature 196 is not ready for Runner-adaptive implementation until:

1. Planner distinguishes capability, Offer, Runner pool, physical node and local implementation.
2. Use-My-Tools profile is not treated as a vendor pin.
3. FREE/PREFERRED/REQUIRED/FORBIDDEN local binding semantics are explicit.
4. AUTONOMOUS/COOPERATIVE/MANAGED Agent modes are explicit.
5. user-owned tool policy is preserved and external cost can remain unknown.
6. Planner can require control features without assuming every Agent supports them.
7. live user intervention is normalized and Plan-revision boundaries are immutable/auditable.
8. switch-executor requests distinguish operational equivalent handoff from semantic replan.
9. Quality Contract is explicit and handed to Feature 195.
10. Feature 195 has enough retry/fallback envelope to recover operationally without unnecessary replanning.
11. Runner capability snapshot freshness/version is represented.
12. learning evidence is scoped, version-aware, confidence-aware and non-authoritative over hard policy.
13. MCP inbound, MCP outbound and Runner execution are distinct directions.
14. job-scoped SmartAIHub MCP usage is optional/policy-driven, not assumed mandatory.
15. progress aggregation never fabricates executor detail.
16. recommendation explanations can cite relevant execution history without exposing cross-tenant data.
17. completed valid work is preserved across Plan revision whenever semantics permit.
18. revised compiled-plan contract passes Feature 195/197 compatibility tests.


---

# 267. Nested Platform Capability Delegation Policy

A Plan Step executed on Runner MAY permit the Runner or nested Agent to request SmartAIHub capabilities during execution.

Planner SHOULD compile:

```text
nested_delegation_allowed
allowed_child_capability_ids
forbidden_child_capability_ids
max_delegation_depth
child_budget_policy
child_approval_policy
child_privacy/residency policy
```

This permission is independent of whether invocation uses Runner-native protocol or job-scoped SmartAIHub MCP.

Example:

```text
Claude may use user's FAL skill freely under user-owned policy,
AND may request SmartAIHub video.generate as fallback,
BUT may not publish externally without approval.
```

---

# 268. Nested Delegation Budget and Approval Semantics

Nested SmartAIHub child Jobs inherit a bounded budget context from the Goal/parent Step.

Planner MUST define whether child spend:

```text
shares the parent step ceiling
uses a dedicated child allowance
requires approval above threshold
is forbidden for managed SmartAIHub capabilities
```

Feature 195 meters the actual child Job and attributes its cost once.

Plan estimates SHOULD avoid double-counting child cost as both parent service cost and child service cost.

Unknown user-owned external spend remains separate from SmartAIHub budget accounting.

---

# 269. Delegation Cycle and Resource-Wait Policy

Plan/compiler SHOULD annotate workflows that allow dynamic child capability requests with limits sufficient for Feature 195 to prevent recursion/deadlock.

At minimum:

```text
max_delegation_depth
allow_same_capability_recursion = false by default
parent_resource_hold_policy
child_deadline_policy
```

If dynamic delegation would violate these limits, Feature 195 returns a structured failure/replan requirement rather than continuing recursively.

---

# 270. Semantic Intent to Execution-Control Mapping

Feature 196 semantic intervention intents map to Feature 195 execution commands as follows when policy permits:

| Feature 196 intent | Feature 195 execution effect |
|---|---|
| `STEER_CURRENT` | `STEER_CURRENT` when runtime supports it |
| `PATCH_CURRENT_CONTEXT` | `PATCH_CONTEXT` or restart/replan according to capability |
| `SWITCH_EXECUTOR` | `HANDOFF_REQUEST` and/or `SWITCH_LOCAL_RUNTIME` |
| `PAUSE` | `PAUSE` |
| `RESUME` | `RESUME` |
| `CANCEL_STEP` | `CANCEL_EXECUTION` for affected active Job sessions + stop future descendants |
| `CANCEL_GOAL_RUN` | cancel affected Job graph + `CANCEL_EXECUTION` for active sessions |
| `PATCH_FUTURE` | no current runtime command unless current work becomes invalid |
| `REPLAN` | compile new Plan revision then submit allowed execution changes |

This mapping prevents channel/UI vocabulary from becoming the Runner wire protocol.

---

# 271. Runner-Hosted Output Contract

Plan Step MUST define enough output semantics for a general-purpose local Agent to return a deterministic result.

Depending on capability, compile/reference:

```text
output_schema
required artifact types
required result summary/metadata
artifact count/size constraints when relevant
quality contract
```

Feature 195/Runner decides adapter-specific collection mechanics; Feature 196 defines what output is semantically required.

---

# 272. Revised Nested Delegation Acceptance Criteria

Before enabling dynamic Runner→SmartAIHub child capability requests in production:

1. parent/child lineage is persisted
2. child spend is attributed once
3. max delegation depth is enforced
4. self-recursive capability loops are prevented by default
5. parent-held resources cannot deadlock required child work
6. cancellation cascades are defined
7. child failure can return to parent fallback logic safely
8. Runner-native and Agent-MCP delegated calls use the same policy/budget authority
9. output/artifact contracts prevent arbitrary filesystem upload
10. all nested events remain reconstructable in Execution Journey


---

# 273. Offer vs Runner-Local Implementation

Feature 196 MUST distinguish semantic/commercial Offer identity from the concrete local implementation selected by Runner.

Example:

```text
Offer:
  user-owned local research/code capability

Allowed local implementations:
  Codex CLI
  Claude Code
  Hermes CLI
```

A generic Runner-capability Offer is useful when these implementations are semantically equivalent under the current Plan envelope.

A named implementation becomes part of Plan semantics when:

```text
user explicitly pins it
quality/control behavior materially differs
pricing/entitlement depends on it
privacy/compliance requires it
workflow is implementation-specific
```

Planner SHOULD avoid enumerating every physical Runner tool when a capability-level Offer plus local-resolution policy is sufficient.

---

# 274. Local Wait and Fallback Policy

Plan Step SHOULD define what happens when preferred local/tenant capacity is unavailable.

Suggested:

```text
preferred_pool_order
max_wait_per_pool
fallback_after_seconds
local_only
cloud_fallback_allowed
fallback_requires_approval
attention_after_seconds
deadline_at
```

Profiles MAY provide defaults, for example:

```text
Use My Tools First
→ wait for user-owned pool
→ optionally tenant-shared pool
→ managed SmartAIHub fallback only if policy/approval allows

Fastest
→ shorter local wait before equivalent managed fallback

Private/Local Only
→ never cross into cloud fallback
```

These are policy templates, not hard-coded global values.

---

# 275. Enforceability of External Cost Limits

Planner MUST distinguish limits SmartAIHub can enforce from costs it can only warn about.

```text
SmartAIHub managed provider/child Job cost
→ enforceable via reservation/budget guard

opaque user-owned subscription/tool cost
→ may be unknown and not enforceable by SmartAIHub
```

If user requests a hard all-in monetary ceiling but an AUTONOMOUS Agent may use opaque external paid tools, Planner MUST either:

```text
choose a more controllable execution mode/path
ask for confirmation that external spend is outside the ceiling
or mark the constraint as not fully enforceable
```

Do not claim budget guarantees SmartAIHub cannot technically enforce.

---

# 276. Planning Decision Record

Material Planner choices SHOULD emit a structured `planning_decision` record containing:

```text
goal_run_id
plan_revision
plan_step_id
candidate Offer/topology set
selected Offer/topology
binding policy
quality/cost/control/privacy constraints
experience evidence references used
reason codes
created_at
```

This record allows Execution Journey to show not only what happened but why the initial Plan was chosen.

If Feature 195 later performs an operational fallback inside the allowed envelope, its execution decision record links back to the Planner decision.

---

# 277. Task Similarity Scope for Experience Use

Feature 196 MUST consume learning evidence only when context is sufficiently comparable.

Experience lookup SHOULD consider a normalized task signature such as:

```text
capability_id
contract_version
domain/task class
quality profile
interaction/control requirements
input size/media class
privacy/locality class
relevant implementation/version
```

The system SHOULD NOT infer that an Agent is globally good/bad from unrelated task classes.

Similarity logic itself should be versioned/auditable where it materially affects routing.


---

# 278. Quality Evaluator Availability Policy

Quality Contract SHOULD specify what happens when the evaluator itself cannot run.

Possible policy:

```text
retry_same_evaluator
fallback_evaluator_ids
human_review_fallback
allow_provisional_result = false by default for mandatory gate
max_evaluation_wait
```

Planner/Feature 195 MUST distinguish evaluator infrastructure failure from output quality failure so media/code/research is not unnecessarily regenerated.

---

# 279. Local Implementation Selector

In addition to explicit IDs, Feature 196 MAY compile a selector so a Plan remains valid as Runner inventory changes.

Example dimensions:

```text
requires capability contract/version
user_owned / tenant_shared
trusted/verified adapter state
minimum control level
privacy/locality attributes
allowed runtime families
forbidden implementation IDs
version constraints when material
```

If no explicit narrowing is needed, `local_resolution_allowed=true` means Feature 195/Runner may use any trusted policy-compatible implementation satisfying the capability contract.

This avoids recompiling Plans merely because the user installed a new compatible CLI after the Plan was designed, while still honoring binding/permission constraints at execution time.

---

# 280. Same External Tool in Multiple Roles

Feature 196/MCP ingress MUST distinguish an external assistant acting as a **caller** from the same product acting as a Runner-hosted **executor**.

Example:

```text
Claude public MCP session → caller/channel context
Claude launched by Runner → local implementation/execution context
```

Goal/Command identity, permissions and learning evidence MUST preserve the role.

A successful MCP connection from an assistant is not evidence that its local CLI is installed/ready for Runner execution, and Runner readiness is not permission for that assistant to invoke all SmartAIHub MCP tools interactively.

---

# 281. Explicit User Tool Switch Becomes Durable Intent

When a user explicitly says:

```text
"Stop Codex and use Claude instead"
```

Feature 196 SHOULD persist scope and binding intent, for example:

```text
scope = current step | remaining workflow | future similar goals
binding = REQUIRED Claude for current scope
```

Current-step execution may hand off immediately after the revision/command is accepted.

Broader future preference requires explicit scope or a learned/user preference update; do not silently infer a permanent global ban on Codex from one current-step command.

---

# 282. Feature 196 Quality Failure Vocabulary

Planner/QC policy uses the shared vocabulary:

```text
QUALITY_FAILED
QUALITY_EVALUATION_FAILED
```

Only `QUALITY_FAILED` is evidence that the produced artifact violated the acceptance contract.

`QUALITY_EVALUATION_FAILED` is operational evaluator failure and SHOULD NOT be used by Feature 197 as negative evidence about the producing executor unless separate evidence supports that conclusion.

---

# 283. Codebase Alignment Baseline — 2026-09-17

This specification was checked against the repository as a target architecture. Current evidence and implementation boundaries are:

| Feature 196 contract | Current repository evidence | Alignment status |
|---|---|---|
| Model capability metadata | `apps/web/server/services/capabilityRegistry.ts` | Implemented partial registry for model capabilities and requirement filtering |
| Cross-surface catalog | `apps/web/server/services/orchestratorCapabilityCatalogService.ts` | Implemented partial catalog from static surfaces, visible Skills, enabled media models and tenant-approved Context Packs; it intentionally excludes retired Agency/workflow surfaces |
| Plan-aware execution | `apps/web/server/services/runEngine.ts` and `taskPlannerMiddleware` | Existing approved-plan/step behavior; not proof of a universal Goal/Plan/Offer registry |
| Chat and Skill entry points | `apps/web/server/routers/chat.ts`, `apps/web/server/services/agentRuntime/chatRuntimeOrchestrator.ts`, skill routes | Existing product surfaces; Universal Command Gateway behavior remains incomplete |
| OpenAI Agents runtime | `python-backend/app/api/internal_openai_agents_runtime.py`, `python-backend/app/services/openai_agents_contracts.py`, `apps/web/server/services/agentRuntime/client.ts` | Runtime contract and adapter exist; Goal-level planning/persistence is not thereby implemented |
| LangGraph runtime | `python-backend/app/orchestrator/langgraph_runtime.py` | Governed graph runtime exists; it is not a license to revive the retired custom `/workflows` engine |
| Durable Goal/Plan/Offer/Capability graph | No dedicated non-retired Feature 196 tables/routes were found in the current schema audit | Target work; must be added with tenant/auth/version/rollback contracts before production completion |
| Job handoff | Existing Feature 186 `worker_jobs` control plane; Feature 195 is authoritative target | Reuse required; Feature 196 MUST not create another durable execution state machine |
| Retired-code residue | Existing repository code still contains legacy identifiers/routes or compatibility adapters, including public docs/social-tool surfaces and Python Docker/Kilo services | Not valid Feature 196 implementation evidence; no new callers or compatibility paths may be added. Removal requires a separate authorized migration audit |

The terms “Flow” and “workflow” in this document mean a governed Goal/Plan or approved LangGraph flow only. They MUST NOT refer to, call, restore or add compatibility for the retired `/workflows` custom workflow engine, Agency, work requests/workpacks, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch. Approved isolated execution is through Feature 195 and Cloudflare Containers; local capabilities are resolved through Feature 197 Runner.

Before marking Feature 196 production-complete, implementation planning MUST include the missing persistence/API/UI contracts above, plus focused tenant-isolation, authorization, version-negotiation, plan-revision, event-idempotency and rollback tests.

## Problem

Users currently need to know which Skill, Agent, model, provider, runtime or device to invoke, while capability metadata, Chat entry points, external channels and execution state remain only partially unified. This prevents reliable goal-level planning and evolution.

## Solution

Compile user intent into a versioned Goal/Plan/Capability decision and a Feature 195 Job Graph, resolve eligible implementations through policy-aware Offers, and expose the same governed command contract across Chat, mobile and external channels. Delegate local execution to Feature 197 Runner.

## Requirements

Functional requirements include Goal understanding, Plan revision, capability discovery, Offer resolution, user/tenant policy, approval, schedule, channel/session continuity, cost/quality selection, fallback, learning and universal command handling. Non-functional requirements include tenant isolation, least privilege, version compatibility, deterministic audit records, bounded context/payloads, localization, accessibility, privacy and rollback.

## Architecture

Feature 196 owns Goal, intent, Plan, capability contracts, solution selection, command gateway and cross-channel orchestration semantics. Feature 195 owns durable Jobs and execution truth; Feature 197 owns Runner-local discovery and execution control; Feature 198 owns the intelligent Chat/evolution product surface while reusing these contracts.

## Implementation

The repository currently provides partial model capability filtering, a cross-surface catalog, approved-plan execution, Chat/Skill routes, LangGraph and OpenAI Agents runtime contracts. Dedicated non-retired Goal/Plan/Offer/Capability graph persistence and the full Universal Command Gateway remain implementation work and must be added with focused contract tests.

## Assumptions

Goal and Plan identity are tenant-scoped, user intent may be ambiguous, capability availability is dynamic, external assistants are delegated principals, and a plan may produce multiple Feature 195 Jobs without becoming a Job state machine itself.

## Constraints

Policy and explicit user pins override learning; client/hostname/queue input cannot authorize protected work; unknown cost must remain unknown; no direct provider hard-coding; and no retired Agency, work-request/workpacks, `/workflows`, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch.

## Risks

Primary risks are over-broad capability exposure, stale Offers, plan/provider drift, cross-channel identity confusion, unsafe learning, high-cardinality traces and treating partial runtime adapters as a complete universal orchestrator.

## Alternatives

A single intent classifier, provider-specific routers and isolated channel-specific planners are rejected because they cannot represent dynamic capability composition, policy-aware alternatives and durable cross-channel Goal continuity.

## User Stories

As a user, I can state an outcome in Thai or English without naming an implementation, preview or approve the resulting Plan, revise it, and continue across channels. As an operator, I can inspect why a capability or Offer was selected and roll back a changed route.

## Acceptance Criteria

The feature is accepted only when Goal-to-Plan decisions are versioned and auditable, capability discovery is policy-filtered, explicit pins are honored, durable work enters Feature 195, local work uses Feature 197 Runner, mixed versions are safe, and the missing registries/gateway have focused tenant/auth/rollback proof.
