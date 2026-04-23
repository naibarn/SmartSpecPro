# Self-Review Round 1: Adversarial Plan Review

Date: 2026-04-20
Reviewed file: `claude-plan.md`

## Summary

The plan is structurally sound and follows the source spec, but the adversarial review found four production-safety gaps that should be fixed before section splitting.

## Findings

### 1. Shadow mode side effects were underspecified

Risk:

Shadow mode could accidentally execute mutating tools, connector writes, media generation jobs, or approval-consuming actions while the legacy path is also running.

Fix applied:

- Added explicit shadow-mode side-effect rules.
- Mutating tools are disabled unless dry-run exists.
- Connector writes and real media submissions are disabled in shadow mode.
- Shadow decisions are persisted as comparison trace data only.

### 2. SDK trace export defaults could leak outside platform storage

Risk:

OpenAI Agents SDK tracing is enabled by default and can export traces externally. Even with sensitive data disabled, production policy should not rely on SDK defaults.

Fix applied:

- Production adapter must disable SDK external trace export unless explicitly enabled for development.
- Platform-owned trace processor/exporter is the source of durable trace data.

### 3. Dependency pinning was not strict enough

Risk:

An open-ended `openai-agents>=...` dependency could update during deployment and silently change runtime behavior.

Fix applied:

- Plan now requires exact SDK pinning.
- Plan requires explicit OpenAI Python client compatibility and rollback instructions.
- Plan requires lock/constraints regeneration guidance.

### 4. Adapter-selected skill/tool needed a Node verification gate

Risk:

If the adapter returns a selected skill or tool that is outside the original envelope, Node could persist or execute an invalid action.

Fix applied:

- Node runtime client must verify selected skill/tool/agent remains inside the original allowed envelope before side effects or persistence.

## Scorecard After Fixes

Structural Integrity: PASS
Completeness vs Spec: PASS
Implementability: PASS
Internal Consistency: PASS
Edge Cases and Failure Modes: PASS

## Remaining Suggestions

No blocking suggestions remain for the plan. Optional implementation-time refinement: if the repo already has a centralized internal Python RPC client pattern, use that exact transport instead of creating a new HTTP helper.
