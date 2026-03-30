# 059 - SmartSpecPro Distributed Worker Runtime

Version: 1.0
Date: 2026-03-27
Status: Draft
Depends-on: 004-Desktop-App, 007-Python-Backend, 027-AgencySwarm, 043-PublicAPI-ExternalAgentGateway, 052-Agency-Swarm-Full-Capability
Reference: https://smartaihub.app/share/qNOTOIAVcnesZpe3zEsbE6URPIIHM0g7BGIMbjXXcAc

---

## 1. Overview

### 1.1 Purpose

This spec defines SmartSpecPro's distributed worker architecture across three runtime families:

- SmartSpecPro Web as the control plane, orchestrator, and product UX
- SmartSpec Desktop as the local worker runtime on Windows 11 machines
- ZeroClaw as the embedded sidecar runtime bundled with SmartSpec Desktop

It also defines additional worker classes for:

- OpenClaw workers for external agent and gateway-oriented workflows
- NemoClaw workers for policy-heavy sandboxed execution
- Tool-backed workers and promoted tools that need durable state, scheduling, or local execution

The goal is to let SmartSpecPro offload real work to external or local workers while keeping tenant isolation, credits, audit logging, and artifact publishing inside the platform.

### 1.2 Business Goals

This architecture should let SmartSpecPro:

- Use office PCs or dedicated workstations as actual compute workers
- Offload GPU-heavy and file-heavy tasks away from the central server
- Run long jobs such as rendering, subtitle burn-in, indexing, and local document processing
- Treat a worker as a first-class team member that can be scheduled by persona or workflow
- Return results back into SmartSpecPro storage, document library, media library, workflow history, and RAG
- Extend later into ComfyUI and other local creative tooling without redesigning the control plane

### 1.3 Non-Goals for Phase 1

The first phase does not aim to:

- Open unrestricted shell access to all users
- Expose public inbound ports directly to worker machines
- Allow arbitrary code execution without policy or approval
- Replace Media Studio, Workflow Engine, or RAG with ZeroClaw
- Build a fully autonomous creative director system without templates or workflow specs

---

## 2. Product Vision

### 2.1 Core Model

SmartSpecPro should operate as a three-layer system:

#### SmartSpecPro Web

- chat, personas, and team workspace
- document management
- media management
- workflow automation
- queueing and orchestration
- audit, admin, and policy
- worker registry and scheduling

#### SmartSpec Desktop

- native desktop shell
- local machine integration
- sidecar launcher
- secure local file access bridge
- local job execution supervisor
- job log streaming
- optional worker service lifecycle UI

#### ZeroClaw Sidecar Runtime

- local execution runtime
- long-running worker or daemon process
- tool invocation layer
- local workspace management
- process orchestration
- adapters for ffmpeg, ComfyUI, scripts, and future local tools

### 2.2 Conceptual UX

In the UI, a worker should look like a named execution unit, for example:

- `video-worker-bkk-01`
- `design-gpu-02`
- `local-doc-worker-finance-03`

Personas and workflows should be able to request work from a worker based on capability, for example:

- render a video from source footage
- run a ComfyUI workflow
- index a local folder into RAG
- process a shared drive and publish artifacts back to SmartSpecPro

---

## 3. Target Environment

### 3.1 Initial Platform Target

- Client OS: Windows 11 first
- Packaging: SmartSpec Desktop installer for Windows
- Worker hardware: office PCs, dedicated workstations, shared render PCs
- GPU target: NVIDIA first

### 3.2 Deployment Modes

#### Per-user worker

- Installed on each employee machine
- Best for local files, personal workspaces, and repo-specific work

#### Shared department worker

- Installed on a dedicated team machine
- Best for marketing, design, QA, and shared queue jobs

#### Dedicated GPU worker

- Installed on high-throughput GPU machines
- Best for rendering, image generation, and future video generation

---

## 4. High-Level Requirements

### 4.1 Core Requirements

The system must be able to:

1. Register a worker from SmartSpec Desktop into SmartSpecPro Web
2. Send heartbeat and online/offline signals
3. Show worker capabilities
4. Dispatch a job from Web to a matching worker
5. Stream progress, logs, and status back to Web
6. Upload results back to SmartSpecPro storage
7. Publish artifacts into document or media libraries
8. Trigger RAG indexing when outputs should become searchable

### 4.2 File Access Requirements

The worker must be able to access real files while staying policy-bound:

- Read files and folders inside a declared workspace
- Read from local drives, mapped drives, shared folders, or user-selected folders
- Support an optional full-machine mode when admin policy and desktop owner consent allow it
- Maintain a local staging workspace for download, transform, render, and temp files
- Emit an audit trail for important file operations

### 4.3 GPU Work Requirements

The worker must support GPU-oriented work such as:

- video encode or transcode
- subtitle burn-in or mux
- image generation
- future video generation
- ComfyUI workflows
- local AI runtimes that can use GPU acceleration

### 4.4 Server Offload Goal

The central server should focus on:

- orchestration
- metadata
- storage coordination
- indexing and search
- auth and audit
- workflow state

The worker should carry the compute and local file I/O burden.

---

## 5. Architecture

### 5.1 Control Plane

SmartSpecPro Web is responsible for:

- authentication and authorization
- tenant and team context
- persona context
- worker registry
- job scheduling and dispatch
- workflow integration
- artifact catalog
- document and media ingestion metadata
- RAG indexing triggers
- audit logs
- admin policy
- update and compatibility checks

### 5.2 Execution Plane

SmartSpec Desktop plus ZeroClaw is responsible for:

- secure sidecar execution
- local machine identity
- local storage workspace
- local tool execution
- GPU workload dispatch
- job lifecycle management
- result upload
- log and progress reporting
- local policy enforcement

### 5.3 Component Model

#### Web Components

- Worker Registry Service
- Worker Scheduler Service
- Worker Job API
- Worker Event Ingestion API
- Artifact Publish Service
- RAG Ingest Trigger
- Admin Policy Service
- Team and Persona Task Router

#### Desktop Components

- Desktop UI
- Worker Agent Host
- ZeroClaw Sidecar Manager
- Job Runner Adapter Layer
- File Access Manager
- Upload Client
- Update Client
- Local Workspace Cleaner

#### Sidecar and Runtime Components

- ZeroClaw runtime process
- ffmpeg adapter
- subtitle adapter
- file indexing adapter
- ComfyUI adapter
- shell or process adapter bound by policy

---

## 6. Packaging and Installation

### 6.1 Bundle Strategy

ZeroClaw must be bundled into SmartSpec Desktop as a sidecar binary.

Rationale:

- the user installs one desktop app
- IT support stays simpler
- version compatibility is controlled centrally
- no dependency on PATH or global installs
- rollback and auto-update become easier

### 6.2 Windows Packaging

The Windows installer should include:

- SmartSpec Desktop application
- `zeroclaw.exe`
- optional bundled tools such as `ffmpeg.exe`
- worker config template
- updater configuration

### 6.3 Update Strategy

The desktop updater should update the app and sidecar together.

Requirements:

- signed updates only
- version compatibility checks between Web and Desktop
- staged rollout support
- forced updates for incompatible worker versions

### 6.4 Install Experience

After installation, onboarding should support:

- sign in to team or tenant
- register the machine as a worker
- choose worker mode
- personal worker
- shared worker
- GPU worker
- choose allowed workspaces and folders
- detect GPU, tools, and disk space
- publish capabilities to Web
- optionally install or start service mode

---

## 7. Worker Identity and Registration

### 7.1 Worker Entity

Worker identity should be explicit and durable.

Required fields:

- `worker_id`
- `tenant_id`
- `team_id`
- `machine_id`
- `machine_name`
- `display_name`
- `worker_type`
- `worker_mode`
- `registered_by_user_id`
- `installed_desktop_version`
- `installed_sidecar_version`
- `supported_job_types`
- `capabilities`
- `online_status`
- `last_seen_at`
- `policy_profile_id`

### 7.2 Capability Model

Capability examples:

- `file-access`
- `full-machine-scan`
- `gpu-nvidia`
- `video-edit`
- `subtitle-burn`
- `audio-normalize`
- `doc-indexing`
- `comfyui-image`
- `comfyui-video`
- `local-rag-ingest`
- `external-tool-runner`

### 7.3 Heartbeat

Workers must send heartbeat data including:

- `worker_id`
- `status`
- current job count
- queue depth
- free disk
- GPU status
- memory usage
- desktop version
- sidecar version
- capability state

---

## 8. Worker Communication Model

### 8.1 Recommended Model

Use outbound-only worker connections from Desktop to Web.

Why:

- works well behind office NAT and firewalls
- avoids inbound public ports on workers
- keeps the security model simple
- supports polling or persistent secure sessions

### 8.2 Communication Modes

The system should support at least:

- polling mode
- realtime channel mode using WebSocket or SSE

### 8.3 Required APIs

Worker to Web:

- register worker
- heartbeat
- claim jobs
- report job started
- report progress
- stream log chunks
- report artifact upload complete
- report job success or failure
- refresh capabilities

Web to Worker logically, via queue or session:

- assign job
- cancel job
- pause job in the future
- update policy in the future

---

## 9. Job Model

### 9.1 Generic Worker Job

Every job should use a shared schema.

Base fields:

- `job_id`
- `tenant_id`
- `team_id`
- `workflow_run_id`
- `requested_by_user_id`
- `requested_by_persona_id`
- `assigned_worker_id`
- `job_type`
- `priority`
- `input_refs`
- `output_targets`
- `instructions`
- `policy_scope`
- `resource_profile`
- `timeout_seconds`
- `retry_policy`
- `created_at`
- `scheduled_at`
- `started_at`
- `finished_at`
- `status`

### 9.2 Job Status Lifecycle

- queued
- claimed
- preparing
- running
- uploading
- indexing
- completed
- failed
- canceled
- expired

### 9.3 Resource Profile

Example profiles:

- `cpu-light`
- `cpu-heavy`
- `gpu-required`
- `large-disk-temp`
- `network-heavy`
- `long-running`

---

## 10. File Access Model

### 10.1 Principles

The worker should be able to work on real files, but not with an unrestricted filesystem.

The file model should support:

- explicit policy
- allowlists and denylists
- path scopes
- audit trail
- local cache and workspace separation

### 10.2 Access Modes

#### Mode A: Workspace-Scoped Access

- read only the folders explicitly assigned

#### Mode B: Team Drive Access

- read only the shared or mapped drives assigned to the team

#### Mode C: Full-Machine Work Access

- allowed only for approved machines and explicit consent
- requires admin policy
- must deny OS and system paths

### 10.3 File Operation Types

- read file
- enumerate directory
- copy to workspace
- write outputs
- delete temp workspace data
- hash or checksum
- metadata extraction
- media probe

### 10.4 File Source Types

- local disk
- removable disk
- mapped drive
- UNC path
- downloaded object storage file
- generated local artifact

---

## 11. GPU Workloads

### 11.1 Supported Initial Use Cases

Initial GPU ROI targets:

- video transcode or export
- subtitle burn or mux
- multi-format social export
- optional local AI subtitle or transcript acceleration
- image generation via ComfyUI in later phases
- video generation via ComfyUI or future runtimes later

### 11.2 Worker Hardware Metadata

At minimum track:

- `gpu_vendor`
- `gpu_model`
- `vram_total_mb`
- `driver_version`
- encoder support
- disk total and free
- RAM total and free
- CPU model

### 11.3 Scheduling Constraints

The scheduler should match workers by:

- required job type
- GPU availability
- VRAM requirement
- disk temp space
- current load
- tenant or team policy

---

## 12. Video Worker Pipeline

### 12.1 Primary Use Case

The canonical use case is:

- a user provides several video clips and a transcript or subtitle rule set
- the worker trims, edits, burns subtitles, renders outputs, and uploads results back
- the result becomes an artifact that can be published and indexed

### 12.2 VideoAssemblyJob

The standard job type should be `video_assembly`.

Inputs:

- source video refs
- transcript or subtitle input
- edit instructions
- intro or outro preset
- aspect ratios
- export codec and quality
- branding rules
- output location

Outputs:

- rendered video files
- subtitle files
- thumbnails
- job logs
- media metadata
- artifact links
- RAG references

### 12.3 Processing Stages

1. claim job
2. resolve inputs
3. stage local workspace
4. validate media
5. execute edit plan
6. generate or apply subtitles
7. render outputs
8. upload outputs
9. publish artifacts
10. trigger indexing
11. notify completion

### 12.4 Initial Tooling

The first version should use a deterministic pipeline with:

- `ffmpeg`
- `ffprobe`
- optional transcript or subtitle adapters

### 12.5 Supported Initial Video Operations

- concatenate clips
- trim by timestamps
- resize or reframe
- normalize audio
- insert intro or outro
- overlay logo or watermark
- hard subtitle burn-in
- soft subtitle mux
- export 16:9, 9:16, or 1:1
- generate thumbnail

---

## 13. OpenClaw and NemoClaw Worker Strategy

### 13.1 Purpose

Besides SmartSpec Desktop plus ZeroClaw, the system should also support OpenClaw and NemoClaw workers for agentic automation, secure sandbox execution, multi-channel workflows, and strict control over egress, filesystem, and process execution.

### 13.2 Positioning

#### SmartSpec Desktop + ZeroClaw

Best for:

- local file access on Windows 11
- GPU workloads
- video editing and render
- local tool orchestration
- local creative pipelines
- future ComfyUI integration

#### OpenClaw Worker

Best for:

- self-hosted agent gateway use cases
- multi-channel or remote-access agent workflows
- plugin-based agent tools
- sandbox-adjacent tasks that need sessions, routing, memory, and channel integrations
- general assistant workers not tightly bound to the desktop UI

#### NemoClaw Worker

Best for:

- secure sandboxed OpenClaw execution
- tasks needing strict egress control
- isolated worker nodes for sensitive autonomous actions
- higher-risk agent pools

### 13.3 Official Runtime Characteristics

This spec assumes:

- OpenClaw is a self-hosted gateway with channels, plugins, sessions, memory, and multi-agent routing
- Windows support for OpenClaw is primarily WSL2-oriented
- NemoClaw is a more locked-down stack for sandboxed OpenClaw execution
- NemoClaw is higher overhead and more policy-heavy than Desktop plus ZeroClaw

### 13.4 Recommended Product Positioning

The platform should not make OpenClaw or NemoClaw replace Desktop plus ZeroClaw.

Instead:

- Desktop plus ZeroClaw is the primary local action and GPU worker runtime
- OpenClaw is the general-purpose external agent worker runtime
- NemoClaw is the secure and isolated worker runtime

### 13.5 OpenClaw Worker Use Cases

- remote agent worker for messaging or channel-driven automations
- always-on research or assistant nodes
- plugin-based external tools
- agent workers that need dashboards, sessions, and per-session routing
- bridge workers for MCP-style or tool-driven external workflows

### 13.6 NemoClaw Worker Use Cases

- secure sandboxed task execution
- controlled browsing or agent workflows with egress approval
- sensitive automations with filesystem and process restrictions
- isolated compliance-heavy automation pools

### 13.7 Worker Registration Types

The system should recognize:

- `desktop_zeroclaw`
- `openclaw_gateway`
- `nemoclaw_sandbox`

OpenClaw worker metadata should include:

- OpenClaw version
- gateway mode
- plugin list
- configured channels
- runtime OS
- workspace root
- dashboard endpoint if managed

NemoClaw worker metadata should include:

- NemoClaw version
- OpenShell version
- sandbox name
- blueprint version
- inference provider profile
- sandbox platform
- egress policy profile
- filesystem policy scope
- process restriction profile

### 13.8 Scheduling Rules

The scheduler should prefer:

- `desktop_zeroclaw` for local files, GPU render, ffmpeg, and direct desktop tasks
- `openclaw_gateway` for persistent agent workflows, plugin-driven tasks, and remote messaging
- `nemoclaw_sandbox` for high-risk or tightly controlled jobs

### 13.9 Integration Phases

#### Phase A

- register externally managed worker runtimes into SmartSpecPro via worker APIs

#### Phase B

- add scheduler awareness and policy-based routing

#### Phase C

- add persona-level worker selection

#### Phase D

- add secure task classes that require NemoClaw specifically

### 13.10 MVP Recommendation

OpenClaw and NemoClaw should not block the Desktop plus ZeroClaw MVP.

Recommended order:

1. ship Desktop plus ZeroClaw worker foundation
2. add OpenClaw worker registration and dispatch
3. add NemoClaw after the job and policy models are stable

---

## 14. ComfyUI Integration

### 14.1 Purpose

Future worker machines should be able to connect to local ComfyUI to support:

- image generation
- image editing
- upscaling
- style transfer
- image-to-image
- video generation
- batch prompt pipelines
- graph-based creative workflows

### 14.2 Integration Modes

#### Mode A: External Local Service

- ComfyUI runs as a separate local service

#### Mode B: Managed Companion Runtime

- SmartSpec Desktop can detect, start, stop, and health-check ComfyUI

### 14.3 ComfyUI Worker Capabilities

- `comfyui-image-generate`
- `comfyui-img2img`
- `comfyui-upscale`
- `comfyui-batch`
- `comfyui-video-generate`
- `comfyui-workflow-run`

### 14.4 ComfyUI Security Notes

- ComfyUI should stay local-only by default
- no public exposure
- secrets must not leak into logs
- workflow files should be treated as tenant-owned artifacts

---

## 15. SmartSpecPro Web Integration

### 15.1 Persona-to-Worker Model

Personas or virtual team members on Web should be able to invoke workers by capability.

Examples:

- video editor persona triggers `video_assembly`
- design assistant persona triggers `comfy_image_generation`
- research archivist persona triggers `local_folder_ingest`

### 15.2 Workflow Builder Integration

The workflow engine should add worker nodes such as:

- Dispatch Worker Job
- Wait for Worker Completion
- Publish Artifact
- Trigger RAG Index
- Route by Worker Capability

### 15.3 Document and RAG Integration

After a job finishes, the system should:

- create media or document records
- attach metadata
- create references in the library
- trigger chunking or indexing
- make results searchable in RAG
- return artifact URLs to chat, workflow, or persona responses

---

## 16. Security and Policy

### 16.1 Security Goals

- reduce shell exposure
- restrict binaries and arguments
- keep secrets scoped and short-lived
- isolate tenant and team work
- log all important actions

### 16.2 Shell Policy

Desktop should only invoke:

- bundled approved sidecars
- approved external tools
- policy-bound argument patterns

### 16.3 Worker Policy Profiles

Examples:

- `standard-office-worker`
- `gpu-render-worker`
- `full-machine-indexer`
- `design-lab-worker`

Each policy should define:

- file access scope
- job type allowlist
- tool allowlist
- max concurrency
- upload destinations
- network restrictions
- temp workspace quota

### 16.4 Secrets

Separate secrets should exist for:

- worker registration
- job execution
- upload
- optional future local integrations

All tokens should be short-lived and narrowly scoped.

---

## 17. Data Model

### 17.1 Core Tables

At minimum, the system needs:

#### `workers`

- `id`
- `tenant_id`
- `team_id`
- `machine_id`
- `display_name`
- `worker_mode`
- `status`
- `desktop_version`
- `sidecar_version`
- `policy_profile_id`
- `capabilities_json`
- `hardware_json`
- `last_seen_at`

#### `worker_heartbeats`

- `id`
- `worker_id`
- `status`
- `metrics_json`
- `created_at`

#### `worker_jobs`

- `id`
- `tenant_id`
- `team_id`
- `worker_id`
- `job_type`
- `status`
- `priority`
- `resource_profile`
- `input_json`
- `output_json`
- `instructions_json`
- `failure_reason`
- `created_at`
- `started_at`
- `finished_at`

#### `worker_job_events`

- `id`
- `worker_job_id`
- `event_type`
- `payload_json`
- `created_at`

#### `worker_artifacts`

- `id`
- `worker_job_id`
- `artifact_type`
- `storage_ref`
- `metadata_json`
- `published_document_id`
- `created_at`

#### `worker_policies`

- `id`
- `name`
- `rules_json`
- `created_at`
- `updated_at`

---

## 18. Desktop Runtime Design

### 18.1 Local Services in Desktop

SmartSpec Desktop should include modules such as:

- `AuthSessionManager`
- `WorkerRegistrationClient`
- `HeartbeatClient`
- `JobPoller`
- `JobExecutor`
- `SidecarInvoker`
- `FileWorkspaceManager`
- `ArtifactUploader`
- `UpdateManager`
- `PolicyEnforcer`

### 18.2 ZeroClaw Invocation Model

Desktop should not embed all business logic directly.

Instead it should use ZeroClaw for:

- starting the daemon
- executing worker adapters
- monitoring process outputs
- restarting on failure

### 18.3 Service Mode

Dedicated worker machines should support service mode:

- auto-start on login or service policy
- background execution without foreground UI
- survive logout where appropriate
- admin-controlled restart and update windows

---

## 19. Job Execution Adapters

### 19.1 Adapter Concept

To avoid coupling ZeroClaw to business logic, use adapter layers such as:

- `video_ffmpeg_adapter`
- `subtitle_burn_adapter`
- `local_folder_ingest_adapter`
- `comfyui_adapter`
- `image_batch_adapter`

### 19.2 Adapter Contract

Each adapter should accept:

- job spec
- workspace path
- secret or token context
- output path contract
- event callback handle

Each adapter should emit:

- progress events
- structured result metadata
- artifacts list
- error payload

---

## 20. Artifact Publish and RAG Ingestion

### 20.1 Publish Flow

When a worker job finishes:

1. upload result files to storage
2. create artifact records
3. optionally create document or media library items
4. attach metadata and source lineage
5. trigger indexing or chunking if needed
6. return references into chat, workflow, or persona output

### 20.2 Required Metadata

- original job id
- worker id
- source refs
- output type
- file size
- duration or resolution for media
- checksum
- tenant and team ownership
- tags
- indexing status

---

## 21. Observability

### 21.1 Required Observability Features

- worker online/offline dashboard
- per-worker job history
- live progress and logs
- failure reasons
- retry count
- storage upload status
- indexing status
- update status and version drift

### 21.2 Metrics

Track at least:

- jobs completed per worker
- average execution time by job type
- upload failure rate
- heartbeat gaps
- GPU worker utilization
- queue latency
- temp disk pressure

---

## 22. Admin and Fleet Management

### 22.1 Admin Features

- list workers
- filter by team, capability, or status
- disable worker
- revoke worker token
- assign or change policy profile
- inspect version status
- view last job or log summary

### 22.2 Fleet Operations

- staged rollout by worker group
- canary updates
- minimum version enforcement
- maintenance mode
- drain worker queue

---

## 23. MVP Scope

### 23.1 MVP Must Include

- SmartSpec Desktop on Windows 11
- bundled ZeroClaw sidecar
- worker registration
- heartbeat
- job polling
- one generic execution loop
- `video_assembly` job type
- ffmpeg-based rendering pipeline
- upload outputs to SmartSpecPro storage
- artifact record creation
- RAG indexing trigger
- admin page for workers and jobs

### 23.2 MVP Nice to Have

- service mode
- shared worker tagging
- preset library for video jobs
- thumbnail generation
- worker health diagnostics

### 23.3 Post-MVP

- ComfyUI integration
- image generation jobs
- local folder ingest jobs
- multi-worker routing pools
- per-team worker policy templates
- advanced scheduling
- service auto-recovery

---

## 24. Acceptance Criteria

### 24.1 Worker Installation

- user installs SmartSpec Desktop on Windows 11
- ZeroClaw is available without separate installation
- desktop can register as a worker successfully

### 24.2 Worker Visibility

- web admin can see worker online status and capabilities
- heartbeat updates are visible within acceptable delay

### 24.3 Video Job Execution

- user can create a `video_assembly` job from Web
- job is assigned to a matching worker
- worker downloads sources, executes render, uploads result, and returns artifact links
- result is indexed or published into the library

### 24.4 File Access

- worker can read authorized local files and directories
- file access is enforceable through policy
- file operations are auditable

### 24.5 Failure Handling

- failed jobs produce structured failure reasons
- worker stays healthy after recoverable failures
- retry policy is enforced server-side

---

## 25. Open Questions

- Should polling or realtime channels be the default?
- Should full-machine file access ship in MVP or start with workspace-scoped access?
- How many concurrent jobs should one worker run?
- What should be the default transcript source for video jobs?
- Should worker uploads use signed URLs or an internal proxy?
- Should ComfyUI start as local-only unmanaged or be managed by Desktop?
- Should a worker be represented in UI as persona, tool, or hybrid abstraction?

---

## 26. Recommended Development Plan

### Epic 1: Desktop Worker Foundation

- package the desktop app
- bundle ZeroClaw sidecar
- implement worker registration and heartbeat
- add updater integration

### Epic 2: Worker Control Plane

- worker registry
- scheduling
- worker jobs model
- worker job event ingestion

### Epic 3: Video Worker MVP

- ffmpeg adapter
- job spec
- artifact upload
- publish to media or document library
- trigger RAG indexing

### Epic 4: Admin and Fleet

- worker list
- worker detail
- job history
- policy assignment

### Epic 5: Advanced File Access

- workspace modes
- team drive support
- full-machine access mode
- auditing

### Epic 6: ComfyUI Phase

- local ComfyUI detection
- ComfyUI adapter
- image generation jobs
- artifact publishing pipeline

---

## 27. Summary

This spec makes SmartSpecPro Web the single control plane for orchestration, personas, workflows, artifacts, and policy, while SmartSpec Desktop plus ZeroClaw provides local execution on real Windows 11 worker machines.

It also defines additional worker classes for OpenClaw and NemoClaw, so SmartSpecPro can support external agent gateways and secure sandboxed workers without replacing the desktop worker model.

The result is a hybrid worker fabric that can:

- reduce server-side compute
- use real local files
- use GPU on worker machines
- support creative and media pipelines
- expose workers as first-class team members
- grow into ComfyUI and other local runtimes later
