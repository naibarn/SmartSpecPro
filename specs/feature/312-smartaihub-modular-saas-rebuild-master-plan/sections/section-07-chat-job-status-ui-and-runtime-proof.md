# Section 07 — Chat status UI and runtime proof

## Objective
Give the user immediate feedback after Chat admission, then render the completed response or actionable failure without holding the browser request open.

## Scope
- Add an authenticated status endpoint whose read is scoped by user, selected workspace and environment tenant.
- Return queued/running/succeeded/failed status and only the stored Chat answer after successful settlement.
- Update the Chat API and responsive UI to create an idempotency key, show queued/running state, poll with bounded backoff, restore conversation history and display a terminal error.
- Keep native Queue producer/consumer bindings in Wrangler local Workerd. Future Cloudflare production remains a separate inactive target; do not create Cloudflare production resources.
- Apply the development migration, test the local Workerd Queue, run focused package checks, deploy the verified bundle only to `modular-debian-dev`, and record source/deployment evidence.

## Owned files and dependencies
`smartaihub-platform/modules/chat/src/**`, Core chat routes/worker, package tests, migration and canonical SPEC handoff evidence. Depends on sections 05 and 06.

## Acceptance evidence
The POST returns 202 before provider completion; UI polls and shows real result/failure; user/workspace isolation tests pass; a Queue redelivery and a restart preserve the job; desktop/tablet/mobile layout does not overflow; `aimarkethubs.com` serves the exact integrated source and all service health checks pass. No production hostname or `smartaihub.app` runtime is changed.

## Risks and rollback
If Queue/DB status becomes unavailable, preserve the job and show a retryable status-read error; never resubmit provider work implicitly. Use the existing modular-debian rollback controller and preserve port 3100 until replacement health is verified.
