# Worker Platform Expansion Roadmap

## Bound Worker, OpenClaw, ZeroClaw, and Full Platform Access

Document date: 2026-04-07  
Scope: Bound Worker expansion, delegated gateway access, worker-driven automation, GPU/local execution, credit attribution, and API vs MCP strategy

---

## 1. Why this document exists

Feature 071 currently gives us a solid **worker control plane** and **team binding** for OpenClaw workers, but it does **not yet** give Bound Worker a full "web-equivalent execution surface."

This document clarifies three things:

1. What works today
2. What still does not work yet
3. The recommended path to make workers truly useful for autonomous production work

The goal is not only to "connect a worker" but to make that worker valuable enough to:

- research information
- run skills or agencies
- generate images or videos
- use local GPU or local tools when appropriate
- publish artifacts back into SmartSpecPro
- send a final result or link back to the user

---

## 2. Executive recommendation

### Short version

The right architecture is:

- keep **Bound Worker** as the routing decision
- add a separate **delegated platform session** for gateway/API/MCP access
- use **HTTP APIs first** for production surfaces like LLM, skills, agencies, media, presentations, and video
- use **MCP as a tool plane** and workspace/browser plane, not as the primary production path for every expensive action
- expand worker-local execution separately for GPU, local tools, ComfyUI, ffmpeg, and other machine-specific workloads

### Hard recommendation

Do **not** make `Bound Worker` itself mean "full user access."

Instead, introduce:

- `worker control-plane token` for registration, heartbeat, claim, upload
- `worker delegated gateway token` for calling SmartSpecPro APIs
- `worker local execution capability` for tasks the worker should do on its own machine

This separation keeps the system useful and safe.

---

## 3. What works today

### 3.1 Bound Worker today

Today, `Bound Worker` means:

- an **External Connector** member in Teams points to a specific registered worker
- that binding currently accepts **OpenClaw gateway workers**
- the run engine can dispatch follow-up work to that worker through the worker job queue

Today it does **not** mean:

- full API access
- full MCP access
- full user-equivalent platform access
- automatic media generation rights
- ZeroClaw desktop parity

### 3.2 Current worker control-plane reality

The system already supports:

- worker registration
- heartbeat
- job claim
- job events
- artifact upload init/complete
- diagnostics
- worker admin controls:
  - Inspect
  - Drain
  - Disable
  - Resume
  - Revoke

This is a strong foundation for remote execution, but it is still primarily a **control-plane integration**.

### 3.3 Current credit handling

Current worker jobs already support:

- worker credit reservation
- worker credit reconciliation
- `worker_runtime` source tracking

This is good for control-plane dispatched jobs.

However, when a worker later calls platform APIs directly, those downstream calls should still be billed by their own source type, such as:

- `api_chat`
- `api_skill`
- `api_agency`
- `api_media`
- `api_video_project`
- `api_mcp`

So the next phase should preserve both:

- the parent worker job
- the downstream platform usage

### 3.4 Current platform surfaces that already exist

The web platform already has working HTTP APIs for:

- LLM gateway
  - `/v1/chat/completions`
  - `/v1/responses`
- skills
  - `/v1/skills`
  - `/v1/skills/:skillId/execute`
- agencies
  - `/v1/agencies`
  - `/v1/agencies/:agencyId/invoke`
- media
  - `/v1/media/images/generate`
  - `/v1/media/videos/generate`
  - `/v1/media/audio/generate`
- presentations
  - `/v1/presentations/...`
- video projects
  - `/v1/video-projects`
- jobs
  - `/v1/jobs`

These are the best surfaces to reuse for worker-driven automation.

### 3.5 Current MCP reality

MCP exists and is useful, but it is not fully equivalent to the HTTP platform yet.

Current status:

- MCP sessioning and scope checks exist
- MCP tool registry covers many SmartSpec capabilities
- some MCP tools are real
- some MCP tools still behave as bridges or placeholders

Important example:

- MCP media tools are declared
- but media generation via MCP is not yet fully wired end-to-end
- today they mainly signal "go to `/v1/media`"

So MCP is not yet the correct primary path for all production automation.

### 3.6 Capability matrix: current truth

| Capability | Current status | Practical verdict |
|---|---|---|
| Bind External Connector to OpenClaw worker | Yes | Ready |
| Bind ZeroClaw as the same Bound Worker path | No | Not ready |
| Dispatch external follow-up work from run engine | Yes | Ready |
| Worker control-plane lifecycle | Yes | Ready |
| Worker credit reservation and reconciliation | Yes | Ready |
| Worker can call LLM gateway automatically because it is bound | No | Not ready |
| Worker can call HTTP APIs with separate valid auth | Yes | Possible today |
| Worker can generate image/video via HTTP API with correct credits | Yes | Ready with proper auth |
| Worker can generate image/video via MCP end-to-end | No | Not ready |
| Worker can run skills via HTTP API | Yes | Ready with proper auth |
| Worker can run agencies via HTTP API | Yes | Ready with proper auth |
| Worker can use local GPU/local tools because it is bound | No | Not through Bound Worker alone |
| Worker can behave like a full web user automatically | No | Needs delegated platform session |

---

## 4. What we actually want

The product target is stronger than "worker receives a task."

We want a worker to:

1. receive a real assignment from SmartSpecPro Web
2. understand budget, tenant, team, and artifact context
3. use local runtime strengths when useful
4. call platform resources when useful
5. publish outputs back into SmartSpecPro
6. notify the user or workflow with links and status

That means the target model is:

- **local execution** when the worker machine is the advantage
- **platform execution** when SmartSpecPro already has the capability
- **hybrid execution** when both are needed in one job

---

## 5. Answer to Requirement 1

## Bound Worker / OpenClaw / ZeroClaw should do complex work, including GPU and local execution

### What should happen

Workers should support two execution modes:

1. **Platform-routed work**
2. **Worker-local work**

### 5.1 Platform-routed work

This is for work where SmartSpecPro Web already has an API or service:

- LLM inference through gateway
- run skill
- run agency swarm
- create presentation
- generate image
- generate video
- submit async jobs

The worker should not reimplement these. It should call the platform through a delegated session.

### 5.2 Worker-local work

This is for work where the worker machine is the advantage:

- local GPU rendering
- local ffmpeg pipelines
- ComfyUI
- local file access
- workstation-only tools
- browser automation living inside the worker runtime
- worker-native agent skills

This should run through a typed worker adapter and publish results back.

### 5.3 Minimum useful upgrade

At minimum, OpenClaw or ZeroClaw as a worker must be able to:

- receive an objective
- continue the task inside its own agent/skill system
- optionally use local tools
- optionally call SmartSpecPro APIs
- publish a result back with artifact links

Without this, a Bound Worker remains mostly a routing label and not a truly useful autonomous teammate.

### 5.4 Recommended capability expansion

Add worker-declared capabilities such as:

- `llm-gateway-client`
- `skills-client`
- `agencies-client`
- `media-client`
- `presentation-client`
- `video-project-client`
- `mcp-client`
- `gpu-nvidia`
- `local-file-access`
- `video-edit`
- `comfyui-image`
- `comfyui-video`
- `worker-native-skill-runtime`
- `browser-automation`
- `artifact-publisher`

### 5.5 Recommended new job types

Keep the current generic worker jobs, but add typed job classes for useful production work:

- `worker_skill_run`
- `worker_skill_chain`
- `worker_research_publish`
- `worker_media_pipeline`
- `worker_presentation_build`
- `worker_video_build`
- `worker_local_gpu_task`
- `worker_browser_research`
- `worker_hybrid_content_pipeline`

These job types should be runtime-aware and capability-aware.

### 5.6 Runtime positioning

Recommended runtime roles:

- `openclaw_gateway`
  - remote agent runtime
  - tool-heavy autonomous work
  - browser/plugin/research workflows
- `desktop_zeroclaw_managed`
  - machine-local files
  - local GPU
  - media pipelines
  - desktop companion runtime
- `nemoclaw_sandbox`
  - secure or restricted workflows
- `hiclaw_cluster`
  - collaborative multi-agent team execution

### 5.7 Recommended product rule

Keep one shared worker model, but let each runtime declare:

- what tasks it can run locally
- what platform APIs it may call
- what security class it supports
- whether it is eligible for Bound Worker use

That gives us a single fabric without pretending all runtimes are the same.

---

## 6. Answer to Requirement 2

## Bound Worker should use the system gateway and deduct credits correctly

### 6.1 Current gap

Today, Bound Worker routing and platform gateway access are separate things.

That is actually correct from a security perspective, but incomplete for product usefulness.

### 6.2 Recommended solution

Introduce a new concept:

- **Delegated Worker Gateway Session**

This should be a short-lived token or session issued by SmartSpecPro after:

- the worker claims a job
- or the worker is executing a Bound Worker follow-up

### 6.3 Token classes we should have

#### A. Worker control-plane token

For:

- register
- heartbeat
- claim
- diagnostics
- artifact upload

This already exists conceptually and should remain limited.

#### B. Worker delegated gateway token

For:

- `/v1/chat/completions`
- `/v1/responses`
- `/v1/skills/*`
- `/v1/agencies/*`
- `/v1/media/*`
- `/v1/presentations/*`
- `/v1/video-projects/*`
- `/v1/jobs/*`
- `/v1/mcp`

This token should carry:

- tenant ID
- acting user ID
- worker ID
- worker job ID
- team ID
- bound connector/member ID if present
- allowed scopes
- max credits
- expiry
- trace ID
- origin metadata

### 6.4 Billing model we should use

Recommended billing has two layers:

#### Layer 1: Parent worker job

Track the worker assignment itself as:

- `worker_runtime`

This captures:

- orchestration reservation
- worker session ownership
- top-level job accounting

#### Layer 2: Downstream platform usage

Track actual worker-triggered platform calls by their real source type:

- `api_chat`
- `api_skill`
- `api_agency`
- `api_media`
- `api_video_project`
- `api_mcp`

But attach metadata:

- `originSurface: worker_runtime`
- `workerId`
- `workerJobId`
- `delegatedByUserId`
- `boundProfileId`

This preserves accurate cost attribution and still lets finance or ops roll usage up under the parent worker job.

### 6.5 Why this is better than forcing one source type

If every worker-triggered action becomes only `worker_runtime`, we lose:

- true cost visibility by service
- media vs LLM vs skill cost comparison
- downstream product usage analytics

So the right answer is:

- keep the real source type
- add worker context metadata

---

## 7. Answer to Requirement 3

## Bound Worker should eventually do almost everything a user can do on the web

### 7.1 Product position

Yes, this is the correct high-value direction.

But the safe version is not:

- "worker gets all user rights forever"

The safe version is:

- "worker gets a temporary delegated session for a specific job, with explicit scopes and budgets"

### 7.2 What "web-equivalent worker" should mean

A useful worker should be able to:

- call LLM gateway
- run SmartSpecPro skills
- invoke agency swarm
- generate image
- generate video
- create presentation
- create async jobs
- use MCP tools when appropriate
- publish results back to SmartSpecPro
- notify a room, workflow, or user with the result

### 7.3 Best architectural model

Use a **hybrid API + MCP** model.

#### Use HTTP API as the primary production surface for:

- LLM requests
- skill execution
- agency invocation
- image generation
- video generation
- presentations
- video projects
- async jobs

#### Use MCP as the primary tool surface for:

- workspace access
- browser actions
- drive/file tools
- interactive tool discovery
- future tool composition where MCP parity is real

### 7.4 Simple recommendation: API vs MCP

| Task | Preferred now | Later optional |
|---|---|---|
| LLM gateway | HTTP | MCP helper wrapper |
| Skill execution | HTTP | MCP once fully bridged |
| Agency swarm | HTTP | MCP later |
| Image generation | HTTP | MCP later after real bridge |
| Video generation | HTTP | MCP later after real bridge |
| Presentation generation | HTTP | MCP later |
| Async jobs | HTTP | MCP later |
| File/drive read-write | MCP | Keep MCP primary |
| Browser automation | MCP or worker-local | Hybrid |
| Local GPU / ffmpeg / ComfyUI | Worker-local | Keep local |

### 7.5 Minimum useful milestone for "real worker value"

The minimum version that feels truly useful is:

1. Web dispatches a worker task
2. Worker receives a delegated gateway token
3. Worker can:
   - call LLM gateway
   - run skill
   - invoke agency
   - generate image/video
4. Worker can publish artifacts or links back
5. Worker can post a final summary into the room/workflow

At that point the worker becomes an actual automation partner, not just a remote placeholder.

### 7.6 Example high-value flow

Example: research + article + image + presentation

1. User asks for a market research brief
2. SmartSpecPro dispatches the task to Bound Worker
3. Worker researches using its own tools plus platform LLM calls
4. Worker writes the article draft
5. Worker calls media API to generate illustration
6. Worker calls presentation API to build a deck
7. Worker publishes outputs back
8. Worker sends a final message:
   - article link
   - image link
   - presentation link
   - summary of what was produced

This is exactly the kind of outcome that makes worker integration valuable.

---

## 8. Recommended architecture changes

### 8.1 Add a new delegated-session endpoint

Recommended endpoint:

- `POST /api/worker-jobs/{job_id}/delegated-session`

Response should include:

- delegated bearer token
- allowed scopes
- max credits
- expiry
- tenant/user/worker context
- allowed platform surfaces

### 8.2 Add explicit worker-to-platform origin metadata

Every delegated platform call should include metadata like:

- `originSurface = worker_runtime`
- `workerId`
- `workerJobId`
- `runtimeType`
- `boundMemberId`
- `delegatedByUserId`

### 8.3 Add worker completion-to-room callback support

Recommended endpoints:

- `POST /api/worker-jobs/{job_id}/publish-room-update`
- `POST /api/worker-jobs/{job_id}/publish-workflow-update`

This makes it easy for workers to return links and a user-friendly completion message.

### 8.4 Add runtime capability registry

Each worker should publish:

- runtime type
- local capability set
- platform client capability set
- GPU/tool availability
- local execution modes
- security class

### 8.5 Add worker execution profiles

Recommended profiles:

- `router_only`
- `gateway_client`
- `local_executor`
- `hybrid_executor`
- `sandbox_executor`

This is much clearer than pretending every worker should do the same thing.

---

## 9. Security requirements

### 9.1 Non-negotiable rule

Do not let a worker control-plane token become a general platform token.

These must stay separate:

- worker registration/control-plane auth
- delegated platform auth
- browser session auth
- API key auth

### 9.2 Required controls

- short-lived delegated sessions
- explicit scopes
- per-job max credit limit
- per-service allowlist
- audit logs for all delegated calls
- tenant and team binding enforcement
- worker and job identity in every downstream call
- ability to revoke delegated session immediately
- operator kill switch

### 9.3 Safe default

Default delegated session for a worker should be narrow, for example:

- `llm:chat`
- `skills:list`
- `skills:execute`
- `agencies:list`
- `agencies:invoke`
- `media:generate`
- `jobs:create`
- `jobs:read`

Then add more scopes only when needed.

### 9.4 Special note about MCP

MCP should not automatically imply platform-wide power.

For delegated worker sessions:

- `mcp:read` and `mcp:write` should still be explicit
- tool-level scopes must still apply
- write tools should remain gated

---

## 10. Recommended delivery phases

### Phase A — Documentation and truth alignment

Deliver:

- current capability matrix
- worker/runtime role definitions
- API vs MCP guidance
- billing model decision

Outcome:

- everyone understands what works now and what does not

### Phase B — Delegated worker gateway auth

Deliver:

- delegated worker gateway token/session
- strict scope model
- origin metadata
- audit logging

Outcome:

- worker can safely call platform APIs

### Phase C — HTTP-first worker automation

Deliver:

- worker calls:
  - LLM
  - skills
  - agencies
  - media
  - presentations
  - video projects
  - jobs

Outcome:

- worker can behave like a real autonomous platform client

### Phase D — Real MCP parity

Deliver:

- remove placeholder MCP bridges for key media/presentation/video surfaces
- make MCP tool execution real where it matters

Outcome:

- MCP becomes useful beyond discovery and basic tools

### Phase E — Local execution expansion

Deliver:

- ZeroClaw desktop parity
- local GPU/ffmpeg/ComfyUI adapters
- runtime-aware scheduling

Outcome:

- worker can choose local compute when it is the better execution path

### Phase F — Autonomous worker production flows

Deliver:

- research -> article -> media -> presentation/video pipelines
- room/workflow callback publishing
- final artifact handoff UX

Outcome:

- worker produces end-to-end outcomes, not only intermediate steps

---

## 11. Decisions to lock now

These are the decisions worth locking immediately:

1. `Bound Worker` remains a routing concept, not an automatic privilege grant
2. Worker platform access uses a new delegated session, not the control-plane token
3. HTTP APIs are the primary production surface for worker automation
4. MCP remains the tool/workspace plane until parity is real
5. Worker-local GPU and machine execution are expanded through capability-aware job types
6. Downstream billing keeps real source types and adds worker-origin metadata
7. ZeroClaw support should be added through the shared worker model, not through OpenClaw-specific hacks

---

## 12. Recommended "minimum useful" implementation target

If we only do one meaningful expansion round, the best target is this:

- Bound Worker dispatches to OpenClaw today
- worker claims the job
- worker receives a delegated gateway token
- worker can call:
  - `/v1/chat/completions`
  - `/v1/responses`
  - `/v1/skills/:skillId/execute`
  - `/v1/agencies/:agencyId/invoke`
  - `/v1/media/images/generate`
  - `/v1/media/videos/generate`
- worker can publish artifact links back into SmartSpecPro
- credits are tracked correctly with worker-origin metadata

This single milestone would already turn worker integration into something genuinely useful.

---

## 13. Final recommendation

The most suitable path is **not** to make Bound Worker magically become "full user mode."

The most suitable path is:

- keep Bound Worker for routing
- add delegated platform sessions for API/MCP access
- use HTTP-first for production surfaces
- use MCP for tooling and workspace where it fits best
- expand local runtime capabilities separately
- let workers produce real outputs and publish them back

That gives us a worker system that is:

- useful
- safe
- auditable
- credit-correct
- extensible across OpenClaw, ZeroClaw, and future Claw runtimes
