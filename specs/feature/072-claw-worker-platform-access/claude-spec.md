# Synthesized Specification

## 1. Objective

Feature 072 turns `Bound Worker` into a secure delegated execution model. The worker should behave like a digital operator that can complete assigned work on the user’s behalf by combining:

- SmartSpecPro platform capabilities
- worker-local runtime capabilities
- artifact publication and user-facing callbacks

The feature must preserve the worker control plane from Feature 071 while adding the missing delegated platform-access layer.

## 2. Product truth

The most important product requirement is that `Bound Worker` must become more than a routing hint. It should let a user ask for an outcome and let the worker carry the operational burden instead of forcing the user to click through the normal web UI to do the same work manually.

This does not mean the worker becomes an unrestricted permanent clone of the user account. The worker acts only inside a delegated job context and only with explicit grants, scopes, budgets, and auditing.

## 3. Current baseline

Current codebase reality:

- worker registration, heartbeat, claim, artifacts, diagnostics, and admin visibility already exist
- binding an external connector to a worker already exists
- that binding is currently OpenClaw-only
- worker billing already has a `worker_runtime` reservation and reconciliation model
- SmartSpecPro already has real `/v1/*` HTTP APIs for LLM, skills, agencies, media, presentations, video projects, and jobs
- selected MCP tools exist, but many high-value tools are still placeholder delegation bridges

Current gap:

- there is no job-scoped delegated platform session for workers
- there is no delegated-worker auth class for `/v1/*`
- there is no resource-grant layer for delegated worker use of platform surfaces
- there is no end-to-end callback model for worker-generated user-visible completions

## 4. Functional requirements

### 4.1 Delegated worker platform session

The platform must allow a claimed worker job to obtain a short-lived delegated session that is:

- tenant-safe
- job-scoped
- lease-bound
- revocable
- budgeted
- auditable

The delegated session must be separate from:

- worker registration token
- worker control-plane execution token
- upload token
- browser session auth
- API key auth

### 4.2 Worker-usable platform surfaces

The feature must support worker-driven access to real platform surfaces, starting with:

- LLM gateway
- skills
- agencies or swarms
- media generation
- presentations
- video projects
- jobs

HTTP is the primary implementation path for these surfaces in early phases.

### 4.3 Worker-local plus platform hybrid execution

One worker job must be able to combine:

- local execution on the worker
- delegated use of SmartSpecPro platform services
- result upload and publication back to SmartSpecPro

This is required to support high-value outcomes such as:

- research -> article -> image -> presentation
- research -> script -> video -> publish
- local GPU generation -> platform publication

### 4.4 Result publication

Workers must be able to report completion back into SmartSpecPro with:

- readable summaries
- artifact links
- status updates
- presentation or video links
- workflow or room updates that point users back to the system of record

## 5. Runtime requirements

### 5.1 OpenClaw

OpenClaw is the first runtime target because it already participates in the worker model and is a natural fit for gateway and agent-driven execution.

### 5.2 ZeroClaw

The design must remain open to ZeroClaw as a future participant when it can advertise the right bound-worker and platform-client capabilities.

### 5.3 Other Claw runtimes

NemoClaw and HiClaw are future paths and should not distort the MVP shape of this feature. Runtime-awareness matters; forced runtime uniformity does not.

## 6. Billing and budget requirements

The feature must preserve two layers of financial truth:

- the parent worker job remains visible as `worker_runtime`
- downstream platform usage remains visible as its real service type such as `api_chat`, `api_skill`, `api_agency`, `api_media`, `api_video_project`, or `api_mcp`

Delegated sessions must enforce a budget envelope, not just describe one.

## 7. Security requirements

The security model must include:

- explicit delegated-worker auth classification
- scope enforcement for delegated worker access
- resource-grant enforcement beyond scopes
- lease-bound issuance and invalidation
- tenant and team ownership checks
- short-lived tokens
- replay protection
- recursion-depth controls
- callback target binding
- audit logging and traceability
- operator kill switch

Workers must not gain access to tenant settings, billing admin, user management, API key management, feature flags, or unrelated admin surfaces.

## 8. Protocol strategy

- HTTP-first for durable production execution on existing `/v1/*` routes
- MCP-second for tool or workspace style interactions where parity is real and useful
- no false claim of full MCP parity in phase 1

## 9. Acceptance outcome

The feature succeeds when a user can assign a meaningful outcome to a Bound Worker, let the worker perform the necessary platform and runtime steps safely, and receive usable results back inside SmartSpecPro without manually reproducing the same workflow through the normal web UI.
