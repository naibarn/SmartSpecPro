# Deep Plan Research — Spec 245 Urgent Cloudflare Migration

## Research decision

- Codebase research: required. This repository is an active monorepo with a Cloudflare Worker package, readiness tooling, Redis responsibilities, and Admin Infrastructure UI.
- Web research: required for Workers KV consistency and Durable Objects semantics/lifecycle.
- Testing research: use the existing Vitest/tsx and Python pytest conventions. Do not run the repository TypeScript typecheck because the root instructions prohibit it due to RAM.
- Discovery method: SocratiCode MCP was unavailable in this runtime. Used focused `rg`, bounded reads, existing readiness verifiers, and Spec 232 inventory instead. This is a documented fallback, not proof of complete runtime inventory.

## Current repository evidence

1. `apps/cloudflare/src/index.ts` currently exposes `/healthz`, `/readyz`, and authenticated `/internal/jobs/publish`; there is no KV cache endpoint.
2. `apps/cloudflare/src/contracts.ts` declares Hyperdrive, Queues, Workflows, Containers, Worker App, R2, and Vectorize bindings; no KV binding exists.
3. `apps/cloudflare/wrangler.jsonc` intentionally omits account-specific bindings and keeps activation disabled. The approved deployment pipeline must inject target IDs/names.
4. Responses API web-search caching is Redis-only in `apps/web/server/services/searchResultCache.ts`, called from `apps/web/server/_core/responsesRoutes.ts`. Cache lookup/write failures are best effort, so this slice can migrate independently from auth, locks, and queues.
5. `apps/web/client/src/components/admin/InfrastructureSettingsPanel.tsx` has a Redis/cache provider panel but no KV cache switch, endpoint status, or complete Worker-binding guide.
6. `npm --workspace @smartspec/web run verify:cloudflare-local-readiness` passes with `localContractReady=true`, while `targetAccountProof=false` and `productionProof=false`.
7. `npm --workspace @smartspec/web run verify:cloudflare-target-readiness -- --mode target` fails closed with `target_evidence_file`; target-account evidence is absent. This blocks deployment proof, not repository-local implementation.
8. Existing R2/Vectorize status is not re-proven by Worker readiness; verify their live authorization, consistency, and recovery separately.

## Official Cloudflare research

- Workers KV is eventually consistent. A write may take 60 seconds or more to be visible elsewhere; KV is suitable for read-heavy disposable cache, not atomic coordination, exact counters, or revocation authority: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Durable Objects fit serialized stateful coordination, per-entity storage and persistent connections. Model one object per coordination atom such as user, room, or resource; avoid a global singleton: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- DO class lifecycle changes have separate deployment and rollback constraints; treat create/rename/delete/transfer as a governed lifecycle migration with forward recovery: https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/
- SQLite is the recommended storage backend for new DO classes. Add DO only where the inventory proves its coordination semantics are necessary.

## Testing and validation context

- Cloudflare Worker package uses Vitest and provides `npm --workspace @smartspec/cloudflare-runtime run check/build`.
- Web package uses Vitest; existing search cache tests are in `apps/web/server/__tests__/searchResultCache.test.ts`.
- Readiness commands: `npm --workspace @smartspec/web run verify:cloudflare-local-readiness` and `npm --workspace @smartspec/web run verify:cloudflare-target-readiness -- --mode target`. Target proof requires real evidence; never create a passing fixture to simulate production.
- Local contracts/mocks do not prove target bindings, production connectivity, recovery or account entitlement.

## Immediate blockers and independent work

- Target evidence and an authorized Cloudflare deployment identity are absent; no production binding or endpoint may be claimed live.
- Worker endpoint contracts, Node adapter, Admin guide/status/switch, inventories and focused local implementation can progress without that identity.
- The owner permits pausing beta tasks during cutover. Pause intake/consumers, inspect canonical jobs, and reconcile unknown provider outcomes before resuming; do not build a zero-downtime migration for every beta path.
