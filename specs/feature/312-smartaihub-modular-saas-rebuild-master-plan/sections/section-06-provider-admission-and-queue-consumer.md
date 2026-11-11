# Section 06 — Provider admission and Queue consumer

## Objective
Consume canonical Chat job references with at-least-once Queue delivery, use a durable provider-shared limiter, invoke only current/configured/free models, and settle the existing Chat/job records idempotently.

## Scope
- Resolve OpenRouter `creator_user_id` from `GET /api/v1/key`, hash it, and use a per-provider-account Durable Object to coordinate active leases, quota snapshots and request windows across Worker instances. Separate API keys on the same provider account must share one limit. Persist only the hashed account scope; never persist or log the key or raw provider account ID.
- Apply OpenRouter's documented 20 free-model starts/minute and pace starts at 3 seconds so admitted calls use the available window without bursts. Keep the 10 concurrent/provider and 3 concurrent/user safety caps.
- Read each credential's live `free_model_daily_requests.limit` and `remaining` from OpenRouter `GET /api/v1/key`; cache the quota for at most 30 seconds per hashed credential, then subtract this system's starts since the snapshot. Fail closed if limits cannot be read and treat an invalid key as a terminal provider error. Never assume the 1,000/day allowance: free accounts start at 50/day, while eligible credited accounts can reach 1,000/day.
- Persist only the credential hash and numeric quota snapshot in the Durable Object. The provider key may pass transiently from the Worker to its per-credential Durable Object for the authenticated quota lookup, but it must not enter Queue messages, durable storage, logs, or receipts.
- Claim canonical jobs with a lease/fencing token before provider work. Duplicate Queue messages that lose the claim are ACKed without a second provider call.
- Release provider admission on all terminal paths. Honor explicit `Retry-After` or OpenRouter's `X-RateLimit-Reset` only when provider clearly rejected with 429; update the per-account cooldown, then retry the same canonical job through a delayed Cloudflare Queue message. Do not retry ambiguous network outcomes that may have completed.
- After an LLM request may have left the Worker, do not retry on a lost response, 408 or 5xx; mark the job `provider_outcome_unknown`. If a consumer crashes with an unfinished attempt, its expired lease must settle to the same terminal state rather than issuing another LLM request.
- Refresh/cache the public OpenRouter free-model catalog and filter stale or paid provider model mappings before Auto selection; never retry on a paid fallback.
- Record lifecycle events, attempts, output and terminal status in canonical rows; configure bounded retry and a DLQ for poison messages.

## Owned files and dependencies
Core `src/chat/**`, `src/worker.ts`, Core Wrangler DO/Queue config and focused tests; reuse the section 05 database functions. Does not import the Legacy Express app or use process-local Bottleneck.

## Acceptance evidence
Deterministic tests establish request-window, live daily quota admission, global and per-user limits under contention, idempotent reservation/release, 429 delay, duplicate message no-op, current-free-model filtering and single settlement. Local Workerd verifies DO persistence and native Queue redelivery behavior.

OpenRouter references: [free-model limits](https://openrouter.ai/collections/free-models) and [current API key quota fields](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key).

The `aimarkethubs.com` Debian development runtime uses Wrangler's local Queue and Durable Object emulation; it does not create or activate managed Cloudflare resources. Local queue delivery verifies behavior, while Cloudflare documents that consumer concurrency is unsupported locally, so autoscaling capacity is a production-target concern after that separate target is provisioned. The managed consumer leaves `max_concurrency` unset so Queues can autoscale; per-account admission remains the upstream guard. See [Queues local development](https://developers.cloudflare.com/queues/configuration/local-development/) and [consumer concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/).

## Risks and rollback
Fail closed when admission state/provider catalog is unavailable. Keep queue work in canonical state; do not call the provider on limiter failure. Retain exact DLQ and retry evidence for replay.
