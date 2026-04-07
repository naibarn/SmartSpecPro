# Deep Research

## Research scope

Research decision (auto):

- Codebase research: yes
- Web research: yes
- Testing research: yes

This repository already contains significant implementation for public gateway, auth, feature flags, teams, workflow monitoring, library publication, and testing. The planning risk is therefore not a blank design problem; it is a **fit-and-truthfulness problem** between product claims and current code.

## Codebase findings

### Worker-runtime foundation is still missing

Current repository state:

- there is no canonical `workers` registry
- there are no `worker_heartbeats`, `worker_jobs`, or `worker_artifacts` tables
- there is no `/api/workers/*` or `/api/worker-jobs/*` REST loop

Implication:

- OpenClaw support still needs a real control-plane foundation before any runtime claim is operationally complete

### Team and workflow integration already expose the right seam

Relevant areas:

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/server/services/runEngine.ts`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`

Findings:

- `assistant_profiles` already supports `external_connector`
- `externalRef` is already normalized and treated as a stable human reference
- runs can already pause on external-connector handoff
- current workflow UI still keys off human-readable pause reasons containing `external connector`

Implication:

- a nullable `externalWorkerId` bridge is the lowest-risk migration path
- rollout must preserve current external-wait semantics during transition

### HTTP LLM gateway is already materially real

Relevant areas:

- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/_core/authz.ts`

Findings:

- `/v1/chat/completions` is a real proxy route with auth, streaming, provider routing, and credit handling
- `/v1/responses` is a real proxy route with SSE, tool-call loop handling, and feature-flag checks
- `/v1/models` and `/v1/credits` are already live
- provider routing already differentiates `responses`, `messages`, `gemini`, and `chat-completions`

Implication:

- SmartSpecPro already has a strong HTTP-first compatibility surface for Claw-family runtimes
- future work should refine, document, and harden this surface instead of inventing a second gateway concept

### Two concrete gateway gaps remain

Findings:

1. `/v1/responses` still falls back to `tenantId = "default"` for non-internal callers.
2. `smartspec.llm.chat`, `smartspec.llm.embed`, and `smartspec.llm.models` inside `/v1/mcp` are still placeholder handlers.

Implication:

- external multi-tenant gateway support is not fully trustworthy yet
- MCP currently overstates parity unless those handlers are implemented or hidden

### Feature-flag and rollout behavior is split across DB and Redis

Relevant areas:

- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/server/services/featureFlags.ts`
- `apps/web/server/middleware/publicApiFeatureGuard.ts`

Findings:

- shared defaults and DB-backed tenant flag resolution already exist
- some route guards depend on Redis-backed lookups for fast-path enforcement
- bearer auth bypasses `publicApiFeatureGuard`

Implication:

- `openClawExternalRuntime` needs an explicit rollout design, not just a new flag name

### Testing baseline is strong enough for incremental delivery

Relevant areas:

- `apps/web/server/_core/llmRoutes.test.ts`
- `apps/web/server/__tests__/responsesRoutes.test.ts`
- `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`
- `apps/web/server/routes/__tests__/publicDocsApi.test.ts`
- shared feature-flag tests in `apps/web/shared/__tests__/*`

Implication:

- Feature 071 should extend existing route/unit suites instead of creating a separate testing model

## Web research findings

### OpenClaw current positioning

Official docs show OpenClaw as a self-hosted gateway with tools, skills, plugins, sessions, and onboarding across local and remote setups.

Key findings:

- official docs position OpenClaw as a self-hosted gateway connecting channel surfaces to AI agents
- the onboarding wizard is recommended across macOS, Linux, and Windows
- Windows is supported, but WSL2 is explicitly described as the more stable path for the full experience
- plugin and tool docs show strong support for gateway-backed tools, sessions, and plugin-driven extensions

Sources:

- https://docs.openclaw.ai/
- https://docs.openclaw.ai/wizard
- https://docs.openclaw.ai/windows
- https://docs.openclaw.ai/tools
- https://docs.openclaw.ai/tools/plugin

Implication:

- OpenClaw is a strong fit for SmartSpecPro's external general-purpose runtime class
- SmartSpecPro should avoid collapsing OpenClaw into a Windows-local media worker role

### ZeroClaw current positioning

Official ZeroClaw materials describe it as a Rust runtime with onboarding, daemon mode, gateway behavior, pairing, and filesystem/network guardrails.

Key findings:

- official quick-start flow includes onboarding, agent mode, and daemon mode
- the runtime defaults to loopback binding and requires pairing/token exchange
- the published security posture emphasizes workspace scoping and refusal of unsafe public binds without explicit exposure choices

Source:

- https://www.zeroclaw.dev/

Implication:

- ZeroClaw should still be modeled as a managed runtime profile, not as a thin sidecar
- its existence reinforces the need for SmartSpecPro to keep runtime taxonomy explicit

### NemoClaw current positioning

NVIDIA's official material positions NemoClaw as a safer OpenClaw reference stack using OpenShell and sandboxed local execution.

Key findings:

- NVIDIA describes NemoClaw as an open-source reference stack for running always-on assistants more safely
- the playbook centers on OpenShell sandboxing, local inference, and guided onboarding

Source:

- https://build.nvidia.com/spark/nemoclaw

Implication:

- NemoClaw fits SmartSpecPro's secure-pool / sandbox-oriented future class
- it should not be the default path for the OpenClaw external runtime feature

### HiClaw current positioning

Official HiClaw material positions it as a distributed multi-agent collaboration layer with centralized credentials and manager-worker orchestration.

Key findings:

- HiClaw emphasizes centralized credential security behind a gateway
- it is described as extending OpenClaw from a single-process agent into a distributed multi-agent team system
- visibility, monitoring, and manager-worker coordination are part of the core value proposition

Sources:

- https://hiclaw.org/
- https://higress.ai/en/hiclaw/

Implication:

- HiClaw belongs in a separate collaborative-cluster profile, not in the OpenClaw worker MVP

## Synthesis

The codebase and web research agree on the same strategic conclusion:

- SmartSpecPro should treat OpenClaw as the first external runtime class
- the existing HTTP gateway is already the strongest compatibility surface for Claw-family runtimes
- the remaining gaps are not conceptual; they are concrete implementation and truthfulness gaps:
  - worker control-plane foundation
  - MCP LLM parity or hiding
  - tenant-safe gateway identity
  - explicit docs and rollout gates

## Testing

Recommended testing approach:

- stay with the existing `apps/web` route/unit test stack
- extend current tests around:
  - feature flags
  - `llmRoutes`
  - `responsesRoutes`
  - `mcpPublicServer`
  - public docs
  - team/workflow UI integration

Primary test command:

- `npm --prefix apps/web test`
