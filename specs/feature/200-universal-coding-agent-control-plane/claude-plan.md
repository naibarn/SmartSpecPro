# Feature 200 Universal External Agent Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a provider-independent External Agent Task control plane with durable Jobs, shared Runner control, scoped context/skills/assets/MCP, normalized events and verified workspace/results.

**Architecture:** Feature 200 is a runtime adapter and task/session plane over Feature 195 Jobs, Feature 196 plans/capabilities/approvals, Feature 197 Runner, Feature 198 Chat and Feature 199 MCP. OpenAI Agents SDK and external harnesses remain provider-specific execution engines; Agent Runtime Core owns platform contracts, session projection, verification and recovery.

**Tech Stack:** TypeScript/React, Drizzle/PostgreSQL, Python OpenAI Agents/LangGraph adapters, Tauri/Rust Runner, Vitest/jsdom/Playwright/pytest/Cargo.

**Spec:** `specs/feature/200-universal-coding-agent-control-plane/spec.md`

## Global Constraints

- Reuse `worker_jobs`/outbox and Feature 197 Runner control; no `coding_agent_jobs` queue truth.
- External Agent cannot connect directly to arbitrary MCP; use Feature 196/199 capability mediation.
- Preserve provider-native evidence while normalizing events/results.
- Scope workspace, context, asset and skill access; verify output before success/billing.
- Server-derived tenant authority, bounded retry/resume/cancel and stale-fence protection.
- OpenAI Agents SDK is not a global replacement for Feature 196 orchestration.
- No retired execution systems and no whole-repository typecheck.

## Source coverage ledger

Sections 1–5 cover rationale, task families, scope and architecture; 6–10 cover core components, discovery, provider integration and runtime/device registry; 11–17 cover Job/Task/session/event/artifact/workspace/verification models; 18–24 cover context, skills, assets, MCP, control/reconnect and UI integration; 25–40 cover API, security, errors, tests, operations, providers and acceptance criteria; 41–48 cover implementation phases, MVP/migration/guardrails/config/full support/decisions; 49–53 cover risks, NFRs, code organization, provider facts and final direction; 54 plus trailing codebase baseline/summary/acceptance sections are final gates. The section files cover every heading and acceptance item.

## Execution order

`section-01-agent-contracts-and-job-handoff → section-02-provider-adapters → section-03-runner-and-runtime → section-04-context-skills-assets-mcp → section-05-verification-and-ui → section-06-migration-tests-and-acceptance`

### Task 1: Agent Task, session and Job contracts

**Files:** Add/modify agent runtime contracts under `python-backend/app/` and `apps/web/server/services/agentRuntime`; reuse `openai_agents_contracts.py`, trace/checkpoint services and `external_agent_task` registration; add tests.

Define provider-neutral AgentTaskManifest, session, turn, normalized event, approval, result and evidence shapes. Link each task to a Feature 195 Job and Feature 196 plan/capability/approval revision; retain native provider IDs and sequence numbers.

**Tests first:** manifest validation, tenant scope, idempotent Job handoff, event sequence/dedupe, stale result rejection and provider-neutral serialization.

### Task 2: Provider adapter boundary

**Files:** Add/modify provider adapter modules under `python-backend/app/services/agent_runtime` and Web runtime selection; add fixtures/tests for Codex, Claude, Antigravity and DeepSeek.

Define one adapter interface for start/stream/pause/resume/cancel/collect/health, capability requirements and native evidence. Normalize provider events without flattening meaningful native diagnostics. Keep sandbox/CLI volatility isolated and never place secrets in manifests or logs.

**Tests first:** provider capability negotiation, malformed/empty output, timeout, duplicate/out-of-order events, cancellation and adapter error taxonomy.

### Task 3: Shared Runner, runtime discovery and workspace control

**Files:** Modify Feature 197 Runner control integration, Tauri/Rust runtime bridge and Web/Python runtime manager; add tests.

Resolve eligible local/cloud runtime from server policy and Runner capability snapshots, send commands through the shared control channel, and isolate workspace modes/paths. Reconcile process/session state after disconnect/restart before accepting new work. Use Cloudflare Containers only through approved Feature 195 path for isolated server execution.

**Tests first:** runtime eligibility, stale snapshot, control ACK/replay, process hang/restart, workspace confinement, cancellation cascade and no second Runner channel.

### Task 4: Context, Skills, Assets and MCP mediation

**Files:** Modify existing context/retrieval/asset/skill gateways and Feature 199 MCP capability adapter; add integration tests.

Build bounded Context Packages plus live scoped retrieval with provenance, expose SmartAIHub skills through capability metadata rather than package copying, pass asset references rather than prompt blobs, and route all MCP through Feature 199. Enforce ACL, consent, data egress and revocation at each call.

**Tests first:** context freshness/tenant isolation, asset authorization, skill version/deprecation, MCP direct-bypass rejection, revoked capability and large payload limits.

### Task 5: Workspace/result verification and Agent UI

**Files:** Modify verification/artifact/library projections, Chat/Assistant task components and add Agent Panel/live task/approval/result surfaces; add React/jsdom/browser tests.

Verify workspace diffs, artifact lineage, output schema and provider evidence before terminal success. Display native progress/events, approvals, unknown/disconnected states, diffs and retry/cancel controls from canonical Job/session projections.

**UI/UX Contract:** Target user is an end user or project owner starting an Agent Task from `/chat`/Assistant. Existing pattern references: Chat plan/approval/live task cards, job monitor, Runner connection and library artifact views; reuse their state and token patterns. Surfaces include Agent Panel, provider/runtime selector, task manifest preview, context/asset scope, approval dialog, live event card, diff/artifact verification and final result. State matrix covers loading/empty/error/success/partial/unknown/disconnected/approval/disabled/selected/hover/focus. Responsive: mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900 and wide desktop 1280×800 for diffs/logs. Accessibility includes keyboard controls, focus, labels, live-region semantics, contrast and reduced motion. Copy is bilingual and explicit about provider, workspace scope, pending approval, verification and untrusted/failed output; never show credentials. Browser evidence covers start → approve → live event → disconnect/recover → verify → result.

### Task 6: Migration, operations, tests and full acceptance

**Files:** Update migration/config/runbooks under `docs/operations/feature-200`, add provider matrix, resilience/security/load tests and acceptance evidence.

Roll out manifest/Job projection, one provider adapter, shared Runner, context/asset/skill/MCP mediation, verification and additional providers in stages. Include cost/usage, retention, audit, rollback, provider protocol drift, mixed versions and failure drills. Map all source Decision/Risk/NFR/Acceptance entries and do not declare full provider support without the required evidence.

## Definition of done

Every source heading and acceptance criterion is mapped, Agent Tasks use shared Job/Runner/control truth, providers are isolated behind adapters, context/assets/skills/MCP are scoped, results are verified, Chat UI is accessible and focused Web/Python/Rust tests pass.

