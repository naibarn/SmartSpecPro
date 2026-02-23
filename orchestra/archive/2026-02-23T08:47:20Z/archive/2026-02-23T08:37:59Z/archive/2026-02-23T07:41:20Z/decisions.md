# Orchestra Decisions — Feature 022: BytePlus ModelArk API

[2026-02-23T03:00:00Z] DECISION: Classify as scope=large (deep-plan-codex-chain route)
  Context: 4 domains affected (Node.js backend, Python adapter, frontend verification, provider template). No new DB tables but new provider + 6 models. New async task flow distinct from Kie.ai.
  Alternatives considered: scope=medium (multi-agent-waves) — rejected because Python adapter is a new file with complex async logic warranting deep-plan structure and TDD.

[2026-02-23T03:00:00Z] DECISION: Use synchronous response for image generation (stream=false)
  Context: BytePlus image API supports streaming. Starting simple for first iteration.
  Alternatives considered: stream=true — deferred to future enhancement.

[2026-02-23T03:00:00Z] DECISION: seedance-1-0-lite-t2v-250428 treated as video/Seedance model only
  Context: Listed under both Seedance and Seedream in user request. Model ID and API endpoint indicate it is a video model.
  Alternatives considered: Listing under both categories — rejected to avoid confusion.

[2026-02-23T03:00:00Z] DECISION: Poll-based task retrieval only (no webhook for BytePlus)
  Context: BytePlus task API does not appear to support callbacks/webhooks per available documentation. Poll every 5s, max 10 min.
  Alternatives considered: Webhook — not supported by BytePlus API.
