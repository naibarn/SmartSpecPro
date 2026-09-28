# Section 07 — Consumer adoption

## Goal

Move current inference entrypoints onto the shared contract incrementally without breaking feature-specific APIs or global-cutover safety.

## Implementation

1. Map each consumer to trusted principal/tenant/purpose, task class, capabilities, data sensitivity, model/provider lock, budget, stream/tool behavior and settlement owner.
2. Add adapters at existing service boundaries; preserve request/response shapes and direct providers for feature fidelity.
3. Enable one low-risk consumer at a time using a server-side rollout revision; retain a tested rollback to the old path.
4. Inventory and monitor every approved exception; reject new direct provider callsites without a declared owner.
5. External harness/job selection remains with existing capability/job authorities; route only its governed model calls.

The first-party ChatView stream now sends a bounded SHA-256 `Idempotency-Key` derived from the persisted conversation/message identity and normalized model/provider selection. A transport retry of that same request keeps the same key; a separate user message or a different explicit route produces another key. The server handler forwards this key into the Spec 231 gateway. If WebCrypto is unavailable, the client omits the header and the server keeps its existing per-request unique fallback, so requests are not accidentally deduplicated.

## Tests first

- Contract mapping and compatibility tests for each adopted consumer.
- Tenant/principal spoof, user lock, response shape, tool and provider feature-fidelity regression tests.
- No unauthorized prompt/evidence egress in shadow or fallback.
- Caller inventory test reports every active path as migrated or explicitly excepted.

## Acceptance

- No global route switch; adoption and rollback are independent per consumer.
- All enabled calls use shared admission or have a reviewed exception with owner and evidence.
