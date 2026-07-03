# Synthesized Spec: Feature 130 Hybrid Flow OpenAI Agents SDK Runtime

## Summary

Upgrade Hybrid Flow from a Redis-backed simulated planning/approval preview into a real, durable, OpenAI Agents SDK-backed stage execution runtime.

The runtime must be independent from Chat-origin Agency workflow. Legacy Agency routes remain readable or redirect safely, but new Chat-origin Hybrid executions must not depend on a published Agency and must not use `agency-swarm`.

## Product Goals

1. Chat can offer Hybrid Flow only for genuinely staged, cooperative work.
2. Direct media, prompt enhancement, and single-skill requests remain fast direct paths.
3. Hybrid stages execute real work through OpenAI Agents SDK via the existing Feature 101 adapter.
4. Human approval is a durable checkpoint, not client-only state.
5. Commit stages use platform-owned executors with explicit allowlists and idempotency.
6. Stage output, artifacts, traces, usage, cost, and recovery state are visible to users/operators.
7. Rollout is gated by replay fixtures, contract tests, dependency upgrade validation, and rollback confidence.

## Non-Goals

- Do not remove all Agency UI.
- Do not remove `agency-swarm` until legacy usage migration is proven.
- Do not create a second SDK adapter or frontend SDK calls.
- Do not let model text directly invoke arbitrary tools/connectors/commit executors.
- Do not make Hybrid the default for every multi-step-looking phrase.
- Do not include automatic publishing or broad connector writes in the first slice.

## Required Architecture

High-level flow:

```text
Chat routing
  -> Hybrid planner / confirmation
  -> neutral Hybrid runtime router
  -> durable execution + stage records
  -> Node agent runtime client
  -> Python openai_agents_adapter.py
  -> OpenAI Agents SDK
  -> normalized HybridStageResult
  -> approval / repair / commit coordinator
  -> Hybrid workspace + operator observability
```

## Required Runtime Stages

- `intake`: normalize objective, constraints, and output schema.
- `explore`: SDK-backed swarm-like role graph with explorer, critic, synthesizer, validator.
- `validate`: structured pass/fail/repair/block verdict.
- `approval`: durable human checkpoint.
- `commit`: platform-owned executor only.

## Required Routing Guarantees

Direct routes that must not open Hybrid:

- `create image: ...`
- `สร้างภาพ ...`
- `create video: ...`
- `สร้างวิดีโอ ...`
- `enhance prompt: ...`
- `edit prompt ...`
- `ปรับ prompt ...`
- single article writer requests
- model/tool questions
- direct slash commands

Hybrid can be offered when the user asks for multi-stage alternatives, critique, validation, approval, or final action after review.

## Required Data Guarantees

Started Hybrid executions must survive reloads and Redis loss. Redis may remain as cache or preview compatibility only.

Records must support:

- execution status and origin surface
- stage input/result envelopes
- artifacts and trace refs
- approval checkpoints
- credit/cost summary
- idempotency keys
- contract/schema/SDK version metadata

## Required Compatibility

- `openai-agents` must be upgraded to the latest stable release at implementation time and pinned exactly.
- Node and Python must support current and current-1 runtime contract versions during rolling deploys or fail closed.
- Existing `/agencies/:id/hybrid-preview` links remain readable or redirect safely.
- Chat-origin Hybrid cannot silently fall back to Agency execution.

## Required UI/UX

- Chat card explains why Hybrid is recommended and offers keep-in-chat/direct-skill fallback.
- Neutral workspace supports `/hybrid/preview` and `/hybrid/:executionId`.
- Stage UI shows owner, status, timestamps, summaries, artifacts, verdict, trace id, cost, retry/repair actions.
- Approval UI supports approve, request changes, reject, edit instruction, resume, and cancel.
- Private chat and disabled Work OS states must not leak hidden Hybrid/Work OS UI.

## Required Release Gates

- Routing replay fixtures pass.
- SDK dependency is pinned and release notes are reviewed.
- Adapter contract tests pass for current/current-1.
- Chat/Team/Responses/shared skill regressions pass after SDK upgrade.
- Rollback leaves executions readable and blocks only new SDK-backed Hybrid starts.
- Operator recovery playbook exists before canary.

