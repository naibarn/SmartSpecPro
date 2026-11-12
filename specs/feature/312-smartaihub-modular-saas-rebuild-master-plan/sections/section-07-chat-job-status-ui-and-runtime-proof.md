# Section 07 — Chat status UI and runtime proof

## Objective
Give the user immediate feedback after Chat admission, then render the completed response or actionable failure without holding the browser request open.

## Scope
- Make `/chat` the direct post-login workspace in the authorized personal default workspace; keep workspace selection/creation and New Chat available without a legacy dashboard gate.
- Match the approved SmartSIHub Chat workspace mockup with conversation history, model selector (Auto plus enabled models), selected-thread inspector and the Chat/Agents/Mini Apps/Task Control/Mission Control/Marketplace/Settings navigation. Unimplemented destinations must open an explicit placeholder, not a dead link or blank page; live agent/cloud status must come from real authorized data. A neutral Cloud Execution label may remain without a status source, but an “Always On” claim must not be shown as fact until backed by runtime state.
- Add Light/Balance/Dark theme selection through the installed Astryx theme system when available. Keep the lower-right theme control reachable without covering the composer on desktop, tablet or mobile; persist the selected preference.
- Add image/file selection, selected-file visibility and removal controls. Keep plain-text Chat usable independently. Until a user/workspace-scoped upload API validates and persists attachments, explain that selected attachments cannot be sent and do not imply they were uploaded.
- Show provider/model and timestamp together on one line under the completed assistant response; keep token and credit detail reachable in the message details without wrapping that summary line.
- Add an authenticated status endpoint whose read is scoped by user, selected workspace and environment tenant.
- Return queued/running/succeeded/failed status and only the stored Chat answer after successful settlement.
- Include safe credit reservation state for the owning user so insufficient-credit and ambiguous-held-credit failures are actionable; never expose another user's hold or provider diagnostics.
- Update the Chat API and responsive UI to create an idempotency key, show queued/running state, poll with bounded backoff, restore conversation history and display a terminal error.
- Keep native Queue producer/consumer bindings in Wrangler local Workerd. Future Cloudflare production remains a separate inactive target; do not create Cloudflare production resources.
- Apply the development migration, test the local Workerd Queue, run focused package checks, deploy the verified bundle only to `modular-debian-dev`, and record source/deployment evidence.

## Owned files and dependencies
`smartaihub-platform/modules/chat/src/**`, Core chat routes/worker, package tests, migration and canonical SPEC handoff evidence. Depends on sections 05 and 06.

## Acceptance evidence
The POST returns 202 before provider completion; UI polls and shows real result/failure; user/workspace isolation tests pass; a Queue redelivery and a restart preserve the job; desktop/tablet/mobile layout does not overflow; `aimarkethubs.com` serves the exact integrated source and all service health checks pass. Authenticated visual/interaction review also verifies post-login routing, every nav item's route-or-placeholder behavior, theme persistence, enabled-model/Auto selection, text response/history, one-line provider/model and timestamp metadata, token/credit detail access, and honest attachment picker behavior. Cloud execution state must be live-data-backed or presented as a neutral label. Actual attachment submission remains disabled until the authenticated upload contract is separately implemented and verified. No production hostname or `smartaihub.app` runtime is changed.

## Risks and rollback
If Queue/DB status becomes unavailable, preserve the job and show a retryable status-read error; never resubmit provider work implicitly. Use the existing modular-debian rollback controller and preserve port 3100 until replacement health is verified.
