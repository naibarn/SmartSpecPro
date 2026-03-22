# Section 03: Observability and Approvals

## Goal

Ensure autonomous work stays inspectable and governable.

## Direction

Use existing room messages, monitoring events, run summaries, approvals, and notifications as the source of truth.

## Daily operator questions to support

- what was completed yesterday?
- what failed yesterday?
- which alerts remain unread?
- which approvals are still pending?
- what is overdue?
- what did the orchestrator decide today?

## Required outputs

- daily planning summary
- failure digest
- approval queue summary
- final day summary in room chat
- milestone-only and summary-only room views

## Approval model

- low-risk actions: auto-approve
- medium-risk actions: AI reviewer
- high-risk actions: human approval

## Main risk

If approvals are not batched or policy-based, autonomous teams will stall from approval overload.
