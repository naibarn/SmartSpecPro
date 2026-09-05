# Marketplace tie-in idea 524 repair

## Evidence ledger

- Incident: browser received HTTP 524 from `/trpc/verticalDramaEpisodes.generateMarketplaceReviewIdeas`.
- Scope: site health check was HTTP 200; the failure is isolated to the synchronous idea-generation request.
- Database: local PostgreSQL row `vertical_drama_marketplace_review_idea_runs.id=10` for series `53` is `succeeded`, `character_dialogue`, 3 selected characters, 3 ideas. This confirms the server can finish after the client connection has already timed out.
- Code path: the router performed `buildMarketplaceReviewIdeaInput` and then awaited the full LLM/validation/repair/billing/persistence flow before returning tRPC JSON. The LLM helper also has independent schema, transient, and model-fallback retry budgets.

## Decision

Use the existing Redis/BullMQ `vertical_drama_interactive_jobs` runtime for Marketplace idea generation. The tRPC mutation only validates/builds the request and enqueues an owned, idempotent job; the browser polls the existing owner-scoped status endpoint. The worker remains the single place that runs all retries, validates all 3 ideas and all 9 shot-dialogue entries, charges once after success, and persists the completed run.

## Acceptance checks

- A mutation returns a job handle before the proxy timeout.
- A successful job returns exactly 3 complete ideas to the UI.
- A failed job exposes an error and never displays a partial result.
- Existing advertising dialogue policy and nine-shot validation remain in the worker path.
- No deployment, paid retry, or production database mutation is performed in this turn.
