# Section 01 — Agent Contracts, Sessions and Job Handoff

## Source coverage

Feature 200 sections 1–7, 11–14, 21–25, 41–43, 46–48 and codebase baseline.

## Deliverable

Define provider-neutral AgentTaskManifest, session, turn, normalized event, approval, result and native evidence contracts linked to Feature 195 Job and Feature 196 plan/capability revisions.

## Files

- Modify: `python-backend/app/services`, `openai_agents_contracts.py`, Web `agentRuntime` services and existing `external_agent_task` path
- Test: focused Python/Web contract tests

## TDD steps

Test schema validation, tenant scope, idempotent Job handoff, sequence/dedupe and stale-result rejection; implement adapters/contracts; rerun.

## Completion gate

No provider session becomes a second durable Job truth.

