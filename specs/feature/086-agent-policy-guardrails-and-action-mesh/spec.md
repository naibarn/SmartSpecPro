# 086 - Agent Policy Guardrails And Action Mesh

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 033-Browser-Automation-Policy, 043-PublicAPI-ExternalAgentGateway, 075-unified-web-desktop-agent-platform, 082-work-os-case-ledger-and-operating-queues, 083-agent-registry-and-organization-model, 084-stateful-handoff-and-durable-run-ledger, 085-autonomy-ladder-and-hitl-control-plane
Audience: Security, Runtime, Integrations, MCP, Desktop Host, Public API, Admin, QA

---

## 1. Executive summary

Feature 033 gives SmartSpecPro a strong browser policy engine.
Feature 086 generalizes that idea into a platform-wide action mesh for all agent execution.

This feature adds:

- one unified action registry
- typed tool and connector contracts
- pre- and post-execution guardrails
- risk scoring and approval binding
- dry-run and simulation modes
- idempotency and compensation metadata

The key product rule is simple:

agents should never call integrations, external APIs, browser actions, desktop actions, or MCP tools as ad hoc side effects.
They should act through a governed action mesh.

The action mesh follows the same tenant hierarchy as the rest of the platform:

- system admins govern global policy and trust envelopes
- tenant admins govern policy inside their own tenant
- regular users may trigger approved actions only within their own tenant and team scope
- team-owned agents must not widen scope beyond the tenant rules that created them

---

## 2. Problem statement

The repo already contains governance ingredients:

- browser policy engine and runtime
- MCP registry
- delegated worker routing
- desktop-host policies
- audit logging
- public API and external runtime access

But governance is still fragmented by integration surface.

Without a unified action mesh:

- one tool path may have strong policy checks while another bypasses them
- action contracts drift across browser, MCP, external runtime, and desktop-host paths
- operators cannot explain why a run was allowed in one surface and denied in another

---

## 3. Goals

1. Define one canonical action model across browser, MCP, connectors, desktop-host actions, and delegated runtimes.
2. Add input and output validation before and after execution.
3. Classify actions by risk and effect type.
4. Bind actions to approval, budget, and policy rules consistently.
5. Support dry-run, simulation, and compensation metadata for side-effecting actions.
6. Keep existing browser policy concepts but extend them beyond the browser-only scope.

---

## 4. Non-goals

1. This feature does not implement every connector the platform may ever support.
2. This feature does not replace workpacks or role agents.
3. This feature does not remove the browser-specific protections from Feature 033; it builds on them.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/services/browserPolicyEngine.ts` | Browser policy already evaluates actions before execution | Generalize the same guardrail pattern to every action family |
| `apps/web/server/services/browserPolicyRuntime.ts` | Runtime enforcement already exists for browser flows | Reuse the enforcement model for tool and connector execution |
| `apps/web/server/_core/mcpRegistry.ts` | MCP tools are already discoverable and routable | Add typed action metadata, risk classes, and policy binding |
| `apps/web/server/services/workerDelegationService.ts` | Delegated execution already routes to worker families | Ensure delegated actions still pass through one action contract |
| `apps/web/shared/automation/contracts.ts` | Execution intent contracts already exist | Extend them with action-class and side-effect semantics |
| `apps/web/shared/desktopHost.ts` | Desktop-host contracts already model governed local execution | Bring desktop-side actions into the same mesh |

---

## 6. Locked product decisions

1. **Every meaningful tool call is an action.**
   - The platform must classify it as read, write, or external side effect.

2. **Guardrails apply before and after execution.**
   - Input validation alone is not enough.

3. **Risk belongs to the action contract, not just the caller.**
   - A trusted agent calling a high-risk action still triggers high-risk rules.

4. **Dry-run must be explicit.**
   - Side-effecting actions should expose whether simulation is supported and what it means.

5. **Compensation metadata is required for non-trivial writes.**
   - If rollback is impossible, the contract must say so clearly.

---

## 7. Core model

### 7.1 Canonical entities

| Entity | Purpose |
|---|---|
| `action_registry` | Global list of governed actions |
| `action_version` | Immutable typed contract revision |
| `action_policy_binding` | Policy and approval rules for an action |
| `action_execution_record` | Audited execution attempt |
| `action_compensation_profile` | Rollback, cleanup, or no-compensation posture |

### 7.2 Required action contract fields

- `action_type`
- `effect_class`
- `input_schema`
- `output_schema`
- `risk_score`
- `supported_modes` such as `live`, `dry_run`, `simulation`
- `approval_profile`
- `idempotency_requirement`
- `compensation_profile`
- `data_sensitivity_flags`
- `latency_expectation`

### 7.3 First-wave action families

- browser
- MCP tool
- connector API
- email and messaging
- document publish
- CRM and ticketing
- billing and payment-adjacent actions
- desktop-host local file or package actions

---

## 8. Functional requirements

### 8.1 Enforcement points

- Policy enforcement must support:
  - before model call where relevant
  - before action invocation
  - after action result
  - before handoff when the next owner would gain broader ability
  - before publishing or sending externally

### 8.2 Guardrail types

- input schema validation
- output schema validation
- semantic risk checks
- data exfiltration checks
- prompt-injection or hostile-context checks where applicable
- tenant-isolation checks

### 8.3 Operator visibility

- Operators must be able to inspect:
  - why an action was allowed
  - why it was denied
  - what approval profile applied
  - whether it ran live or dry-run
  - what compensation posture exists

---

## 9. Web and desktop responsibilities

### 9.1 Web control plane

- Web should own the canonical action registry, policy bindings, approval profiles, and audit record model across all action families.
- Connector governance, MCP discovery policy, external API policy, and tenant-wide action controls should be administered primarily from the web control plane.
- The action mesh should expose explainability and simulator surfaces on web because they span browser, desktop, delegated runtime, and server execution.

### 9.2 Desktop host and local runtime

- Desktop Host should consume the same action registry for local file actions, package actions, Pi and Agency Swarm tool calls, and governed local connector execution.
- Desktop-side actions must evaluate against the shared policy model before execution and report post-execution validation results back to the shared action record.
- Local action execution should surface whether the action ran live, dry-run, or simulation, especially for file system, local publishing, and connector-adjacent operations.

### 9.3 Shared contracts and sync

- Web and desktop must share one typed action contract with aligned schemas, risk scores, approval profiles, and compensation posture.
- Desktop may execute local actions, but it must not widen tool scope or bypass post-execution validation simply because the action is local.
- Any desktop-generated action record must sync into the shared audit and run-ledger model with the same action identity used by web and delegated runtimes.

## 10. Acceptance criteria

1. The platform can enforce the same policy language across browser, MCP, connector, and desktop-host actions.
2. Every side-effecting action has a typed contract, risk score, and approval posture.
3. The system can show whether an action was blocked before execution or rejected after output validation.
4. Delegated and external runtime paths cannot bypass the action mesh.
5. Operators can explain why a run was allowed, denied, or stepped up from the action record alone.
