# TDD Plan: Feature 130 Hybrid Flow OpenAI Agents SDK Runtime

This document mirrors `claude-plan.md`. Each section describes tests to write before implementation.

## Wave 1: Contracts, Flags, And Replay Fixtures

Write tests first for:

- Chat routing fixtures:
  - direct image commands route to media/image skill, not Hybrid
  - direct video commands route to media/video skill, not Hybrid
  - prompt enhance/edit commands route to prompt enhancement, not Hybrid
  - Thai and English multi-stage prompts offer Hybrid confirmation
  - ambiguous prompts require confirmation
- Contract schemas:
  - valid Hybrid stage request parses
  - unsupported contract version fails closed
  - missing stage metadata fails validation
  - tool/handoff scope widening fails validation
- Feature flags:
  - disabled flags hide Chat Hybrid affordances
  - missing SDK health disables SDK-backed Hybrid only

## Wave 2: Durable Persistence And Migration

Write tests first for:

- starting a preview creates exactly one durable execution
- repeated start returns existing execution or fails idempotently
- stage records persist ordered stage state and idempotency keys
- Redis loss does not destroy a started execution
- legacy Redis preview can still resolve or fail safely
- tenant/user mismatch rejects execution and preview access
- preview token is single-purpose and tenant/user scoped
- expired preview can be regenerated only when original chat message access is still valid

## Wave 3: Neutral Hybrid Router And Runtime Coordinator

Write tests first for:

- `createPreviewToken` accepts Chat-origin payload without `agencyId`
- Agency-origin preview still accepts `agencyId`
- `startExecution` creates durable state and does not auto-complete non-human stages
- `resumeExecution` moves approval/repair state forward idempotently
- `cancelExecution` stops future stages
- `retryStage` preserves idempotency behavior
- old Agency route redirects or wraps neutral runtime safely

## Wave 4: Python OpenAI Agents SDK Hybrid Stage Support

Write tests first for:

- `openai-agents` dependency is exactly pinned
- adapter health exposes SDK and supported contract/schema versions
- Hybrid stage request validates surface, entry point, stage type, owner, and allowlists
- SDK model config uses SmartSpecPro gateway-provided model, not SDK defaults
- unsupported contract versions return structured errors
- role graph output normalizes into alternatives, critiques, recommendation, and verdict
- direct provider credentials are not accepted for production runtime traffic

## Wave 5: Stage Runner Integration

Write tests first for:

- intake stage writes normalized objective and next inputs
- explore stage calls agent runtime client and persists normalized result
- validation stage returns pass/fail/repair/block verdict
- stage failure records stable error reason code and retryable state
- usage and trace metadata persist with stage result
- current/current-1 compatibility is checked before runtime execution
- budget exceeded pauses before the next billable stage
- preflight validation does not charge credits
- stage duration and model/provider route are persisted for SLO/product metrics

## Wave 6: Chat Routing And UI Integration

Write tests first for:

- Hybrid card no longer queries `agency.list` for Chat-origin flow
- card creates neutral preview token and navigates to `/hybrid/preview`
- keep-in-chat action remains available
- direct-skill fallback appears when available
- disabled flags hide Hybrid affordance
- private chat does not show disabled Work OS or Hybrid UI
- mobile layout keeps confirmation actions reachable

## Wave 7: Neutral Hybrid Workspace UI

Write tests first for:

- `/hybrid/preview` renders loading, valid preview, expired preview, and error states
- `/hybrid/:executionId` renders stage list and current state
- approval actions call resume endpoint
- retry/cancel actions call correct endpoint
- trace id and cost summary appear when available
- Agency-origin route remains readable or redirects safely
- keyboard focus reaches primary actions

## Wave 8: Commit Executors, Approval, Repair, Retry, And Cancel

Write tests first for:

- executor registry rejects unknown executor ids
- commit cannot run without required approval and credit check
- first safe executor writes audit/idempotency evidence
- repeated commit with same idempotency key does not duplicate side effects
- model output cannot select arbitrary executor names
- cancel prevents future stages but preserves already committed artifact state
- cross-tenant commit attempts are rejected
- audit/idempotency record exists for failed commit attempts

## Wave 9: Observability, Replay, Rollout, And Operator Recovery

Write tests/checks first for:

- replay fixture suite covers all required groups
- shadow mode suppresses side effects
- shadow mode persists comparison metadata for routing and stage outputs
- canary gates require replay, SDK upgrade validation, and rollback notes
- rollback disables new SDK-backed Hybrid but leaves existing executions readable
- operator playbook covers adapter outage, unsupported contract, stuck approval, failed commit, duplicate prevention
- logs or dashboard queries expose routing decision, stage failures, approval pauses, cost, SDK version, and contract version
- product metric thresholds are present for Hybrid precision and direct-skill false positives
- manual golden quality review is required for complex Thai/English prompts
- missing SDK health, budget, or executor allowlist fails closed without breaking direct chat/direct skills
