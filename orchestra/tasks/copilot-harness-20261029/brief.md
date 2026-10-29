# SmartAIHub — Microsoft Copilot Harness Integration

**Mission:** Update Canonical SPECs and implement Microsoft Copilot Harness support in SmartAIHub Runner.

**Execution mode:** Autonomous implementation, repository-first, end-to-end delivery.

**Priority:** Additive integration. Do not interrupt SPEC-224 completion or Cloudflare production migration.

## 1. Objective

Implement Microsoft Copilot Harness as a first-class optional Harness Provider alongside existing:

- OpenAI Codex
- Claude Code
- Pi Native Harness
- Other registered and external harnesses

Use the existing SmartAIHub Runner, Harness Adapter Registry, Unified Job Control Plane, Model Gateway and Task Control architecture.

The result must allow an authorized SmartAIHub user to select Microsoft Copilot, select a verified available model, dispatch a Goal to a compatible Runner, monitor execution and receive results through the existing Task Control interfaces.

**This mission requires working implementation, tests and evidence — not documentation-only completion.**

## 2. Repository discovery — mandatory first step

Inspect the current repository and identify:

1. Canonical SPEC governance and locations of SPEC-224, SPEC-309, SPEC-310 and related contracts.
2. Existing Harness Registry, Adapter Interfaces and Runner capabilities.
3. Debian/Linux and Windows Runner architecture.
4. Existing Codex, Claude Code, Pi and external Harness implementations.
5. Model discovery, authentication, capability reporting and model-selection UI.
6. Goal/Job/Run/Attempt, Lease, Approval, Budget and Event Streaming contracts.
7. Existing Task Control and Mission Control integration points.
8. Session persistence, Workspace allocation and recovery mechanisms.
9. Existing SDK dependencies and conventions for tests, packaging and deployment.

Read implementation code, not just SPEC documentation.

Reuse existing infrastructure and contracts wherever possible.

Do not invent duplicate architecture, endpoints, data models or job orchestration.

Respect frozen SPEC governance. Changes must be additive to the appropriate current canonical documents.

Preserve unrelated working-tree changes. Do not reset or overwrite other sessions' work.

## 3. Update canonical specifications

### SPEC-309 — Native Agent Harness & Pi Lifecycle

Add a section or compatible amendment titled:

**Microsoft Copilot Harness Provider**

Define:

- Provider ID: `microsoft-copilot`
- Display name: Microsoft Copilot
- Implementation: Microsoft Copilot SDK + Copilot Runtime/CLI
- Execution targets: Debian Linux, Windows and compatible Cloud Runner environments
- Runtime discovery and version compatibility
- Authentication and BYOK modes
- Dynamic model discovery and availability checks
- Session create/resume/disconnect/cancel
- Structured event mapping
- Tool invocation and permission mediation
- Workspace and tenant isolation
- Usage accounting and error classification
- Lifecycle management, installation, updates, pinning and rollback
- Compatibility requirements and acceptance tests

Treat the existing provider name `github/copilot-sdk` and package `@github/copilot-sdk` as the current integration interface where applicable, while accounting for Microsoft's announced naming and repository transition.

Do not assume future package names or undocumented APIs.

### SPEC-310 — Harness and Agent SDK Alignment

Add the Copilot integration as an additive provider.

Define interoperability with the existing OpenAI Agents SDK and Pi alignment strategy.

Clarify ownership:

- SPEC-224 owns Goal, Job, Run, Attempt, Lease, Retry, Approval and final state.
- Harness adapters own provider-specific session control and execution.
- Model Gateway owns platform-routed provider access and usage accounting where applicable.
- Runner owns local execution capability, process supervision and Workspace access.
- Chat, Task Control and Mission Control consume the common execution event contract.

**Do not introduce a second Job Ledger or independent Mission Control.**

Document differences between Microsoft Copilot subscription authentication and BYOK routing through SmartAIHub Gateway.

Maintain backward compatibility with existing harnesses.

## 4. Implement Microsoft Copilot Harness Adapter

Use the existing Adapter Interface.

Do not rewrite existing Harness providers.

Preferred implementation:

- Official Microsoft/GitHub Copilot SDK
- TypeScript SDK when it best fits the current Runner architecture
- Copilot CLI Runtime via SDK-managed process or supervised Headless Server
- JSON-RPC transport
- Existing Runner execution and event infrastructure

Discover and use the officially supported APIs for the installed SDK version.

Required capabilities:

### Discovery

- Detect installed SDK/CLI Runtime and installed version.
- Validate version/protocol compatibility.
- Detect authenticated status without exposing credentials.
- Discover available models dynamically.
- Report model availability and relevant capabilities.
- Report Runtime and Runner readiness.

Do not hardcode a static model list.

Do not mark an unavailable or unauthenticated harness as ready.

### Sessions

Implement equivalent operations for:

- Create session
- Resume session
- Send prompt
- Subscribe to events
- Interrupt/cancel execution
- Disconnect and cleanup
- Recover after restart where supported

Persist the relationship between:

`tenantId + userId + projectId + goalId + runId + attemptId + harnessSessionId + runnerId + workspaceId`

Use the existing canonical persistence contracts rather than introducing a separate authoritative ledger.

Ensure idempotent dispatch and prevent duplicate execution after retries or reconnection.

### Events

Map SDK events into existing SmartAIHub normalized event contracts.

Support:

- Session started
- Model selected
- Assistant output
- Reasoning/progress metadata where exposed and permitted
- Tool requested
- Tool running
- Tool completed/failed
- Permission required
- File modifications
- Usage and quota information
- Execution errors
- Session idle/completed
- Cancellation
- Final execution result

Use existing sequence ordering, replay, deduplication and audit mechanisms.

Do not expose private chain-of-thought, access tokens, secret environment values or sensitive tool arguments in UI events.

### Workspace

Use the existing project/goal/session Workspace model.

Do not execute arbitrary user jobs in the SmartAIHub application source root.

Ensure Workspace boundaries are enforced on every tool invocation and session resume.

For shared runtime scenarios, use the SDK's recommended isolation settings and explicitly registered tools.

Where arbitrary coding tools require host filesystem access, run inside an appropriate OS-level isolated execution boundary instead of relying on SDK session isolation alone.

## 5. Authentication and Gateway integration

Support two primary modes:

### Mode A — GitHub Copilot account

- Reuse connected GitHub OAuth credentials where compatible.
- Support the authorized user's Copilot subscription or approved organization identity.
- Validate eligibility and available models.
- Never reuse one user's token for another tenant.
- Store credentials using existing SmartAIHub secret management.
- Do not automatically fall back to an administrator's ambient CLI login.

### Mode B — SmartAIHub Gateway BYOK

- Use official Copilot SDK custom provider configuration.
- Route model inference through SmartAIHub Gateway using a compatible provider endpoint.
- Support the required wire protocol and tool-calling semantics.
- Reuse existing budget reservation and usage reconciliation.
- Use scoped, short-lived credentials where supported.
- Fail explicitly if Gateway compatibility cannot be established.

Treat Copilot subscription traffic and Gateway-routed BYOK traffic as distinct billing and egress modes.

Do not claim that Copilot subscription traffic passes through SmartAIHub Gateway when it does not.

Preserve the existing Gateway-only model egress requirement unless an authorized, explicit policy exception exists.

Do not introduce silent direct-provider fallback.

## 6. Permissions and autonomous execution

Integrate Copilot SDK permission requests with the existing SmartAIHub Approval Service.

Reuse the permissions and autonomy scope already approved for each Goal.

Within authorized bounds, permit execution to continue automatically without repetitive user approvals.

Required properties:

- Scoped authorization
- Explicit capability allowlist
- Workspace restrictions
- Budget enforcement
- Expiration and revocation checks
- Permission audit receipts
- User-visible pending approval for actions outside granted scope

Do not use unconditional `approveAll`, disable security controls or bypass managed approvals.

Do not require a new user confirmation for every Child Run or Phase when an existing valid Goal-scoped authorization already covers the action.

## 7. Runner lifecycle management

Add Copilot to the existing Runner capability discovery and lifecycle system.

Runner must report:

- Installed/not installed
- Version
- Authenticated/not authenticated
- Available models
- Supported execution modes
- Ready/unavailable/degraded
- Relevant installation or authentication errors

Implement process startup, health detection, restart and cleanup through existing Runner supervision.

Avoid starting an unnecessary independent CLI server for every request.

Use loopback-only or another authenticated private transport for CLI JSON-RPC. Do not expose an unauthenticated Copilot server to the public network.

Support controlled installation/update/pinning/rollback where compatible with existing Runner lifecycle contracts.

Prefer a lightweight Debian-first implementation, then reuse the same adapter contract on Windows.

Do not introduce a mandatory Rust rewrite.

Do not make Cloudflare Containers or Foundry a prerequisite for initial delivery.

## 8. Task Control and model-selection integration

Extend the existing Harness selection mechanism.

Display:

**Harness:** Microsoft Copilot

**Model:** dynamically discovered available models

Show availability status, authentication state and relevant capability constraints.

Disable unavailable models and provide actionable error information.

Use existing UI components and design conventions.

Do not hardcode Copilot model names in React components.

Do not create a second Model Registry.

Ensure the user can select Copilot and an available model and submit a Goal through the normal SPEC-224 flow.

Execution results must appear through the existing Task Control event stream.

Preserve the shared contract for later Chat and Mission Control presentation; do not expand unrelated UI redesign scope.

## 9. Error handling and resilience

Implement typed errors using the existing error contract, including equivalent conditions for:

- Runtime not installed
- Runtime version incompatible
- Authentication required
- Permission denied
- Model unavailable
- Quota exhausted
- Budget exceeded
- Gateway incompatible
- Session not found
- Runner disconnected
- Workspace inaccessible
- Runtime crashed
- Execution timeout

Ensure errors are visible and actionable.

Do not silently retry operations that may have produced side effects.

Support safe retry/resume, lease fencing, cancellation and state reconciliation.

## 10. Tests and acceptance criteria

Implement automated tests following existing repository conventions.

Required test scenarios:

1. Discover Microsoft Copilot Harness when installed.
2. Report unavailable when not installed.
3. Detect authentication state correctly.
4. Discover real available models rather than displaying a static list.
5. Create a Copilot session and submit a test Goal.
6. Receive and normalize streamed events.
7. Capture Tool Calls and permission decisions.
8. Preserve Workspace boundaries.
9. Resume or recover supported sessions.
10. Cancel execution correctly.
11. Report usage and quota without fabricating cost.
12. Preserve tenant and credential isolation.
13. Reject unauthorized filesystem or shell operations.
14. Avoid duplicate runs after retries.
15. Verify Codex, Claude and Pi regression compatibility.
16. Verify Task Control can select and dispatch the new Harness.
17. Verify final result and independent verification receipts.

Use mocks and contract tests for CI.

For live E2E tests, use an actually available Copilot authentication or approved BYOK test configuration.

Never fabricate successful live execution.

When live credentials are unavailable, complete all offline tests, report the live test as blocked with precise evidence and leave the remaining acceptance step executable.

## 11. Implementation sequence

Work autonomously in the following order:

**WP1 — Repository and SPEC**

Inspect actual contracts, write compatible SPEC-309/310 amendments and define acceptance tests.

**WP2 — Adapter**

Implement the Microsoft Copilot adapter and capability discovery.

**WP3 — Runner**

Connect session lifecycle, event forwarding, permissions, Workspace and supervision.

**WP4 — Task Control**

Integrate harness/model discovery and selection through existing UI/API contracts.

**WP5 — Verification**

Run unit, integration, regression and available live E2E tests.

**WP6 — Delivery**

Create commits and PRs using existing repository conventions where authorized. Produce an implementation handoff and verification report.

Continue across work packages without requiring manual Continue messages.

Use existing authorized development execution permissions and established repository workflow.

Do not perform unrelated production deployment, destructive database operations or privileged account changes without the required authorization.

If a non-recoverable external dependency prevents a work package, complete independent work packages and record the exact blocker rather than stopping the entire mission.

## 12. Non-negotiable constraints

- No replacement of Codex, Claude or Pi.
- No second Job Ledger.
- No separate orchestration plane.
- No Cloudflare Workers rewrite.
- No speculative SDK API implementations.
- No hardcoded model availability.
- No global cross-tenant CLI credential.
- No uncontrolled filesystem access.
- No unconditional permission bypass.
- No production migration dependency.
- No unrelated SPEC rewrites.
- No documentation-only completion presented as implementation success.

## 13. Final deliverables

Provide a concise final report including:

1. SPEC files updated and key decisions.
2. Implemented modules and files changed.
3. SDK and CLI versions verified.
4. Harness capabilities implemented.
5. Runner integration status.
6. Task Control integration status.
7. Test commands and results.
8. Actual live E2E evidence, or explicit blocker if unavailable.
9. Regression status for existing harnesses.
10. Commit SHA and PR URL where created.
11. Remaining gaps, prioritized by impact.

Final acceptance requires a working Copilot Harness integration through the existing SmartAIHub Job Control architecture, not merely a successful SDK installation.

**Start repository discovery now, then implement the integration end to end within the authorized development scope.**