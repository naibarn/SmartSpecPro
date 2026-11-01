# SPEC-311 verification design

These are planned checks, not executed or passing tests. Existing focused suites are extended where possible. Feature sections first write meaningful failure cases, then implementation. Exact commands/files are selected against the owned code slice, not a broad local typecheck.

## Section 01: Inventory, portability and resource proof

Inventory detects an added unregistered route/procedure/job and a dynamic registration; retired boundaries remain excluded. Native dependency graph and live binding proof reveal Container/legacy-origin calls. Measure baseline and unsupported dependencies without claiming live success from source.

## Section 02: Worker API adapter and scoped database

tRPC transformer/batch/error/cookie parity; request-scoped tenant context does not leak across requests or batch entries; spoofed hosts/forwarding headers rejected; DB TLS/role/transactions/cleanup and cache safety; no request-time schema writes; ordinary assets/upload ownership and no app-origin egress.

## Section 03: Identity, authentication, 2FA and email

Existing password hashes and encrypted TOTP fixtures; valid/invalid/revoked session, logout, expiry, recovery code replay and challenge limits; OAuth state/redirects; tenant isolation; workers.dev cookie separation; generic anti-enumeration and authorized real email inbox receipt/code redemption; no double-send on retried delivery.

## Section 04: Application APIs and browser feature parity

Per-inventory positive/negative authorization and DTO parity; actual series/episode edit and existing record reads; credit/billing webhook duplicate and invalid signatures; storage authorization, signed URL expiry, size limits and upload cancellation; no feature hidden to make parity green.

## Section 05: Cloudflare Queues and durable job control

Crash before/after DB commit, Queue send and publish-marker persistence; duplicate/out-of-order delivery; expired/stale fencing token; cancellation race; external effect success before consumer death; retry/DLQ/replay; worker restart; multiple tenant fairness; shared-db Debian/Cloudflare consumer scope exclusion; no early ack or lost responsibility.

## Section 06: Chat, agents and remaining execution dependencies

Stream TTFT/error/cancel/reconnect, durable step recovery and usage settlement; actual pinned Worker limits/crypto/native import compatibility; Python Agents API compatibility spike with retained contracts; native media dependency proof and absent owner exception -> cutover BLOCKED.

## Section 07: Readiness, observability and Staging acceptance

Unknown/expired/missing per-component readiness prevents dispatch/cutover with a human-readable reason and enabled safe recovery; app Containers and Debian app egress unavailable while ordinary flows pass; full mapped fault suite, provider traces, no headers-only proof; minimum 24-hour supervised soak and measured costs.

## Section 08: Controlled cutover and rollback

Exact-SHA/config/coverage mismatch blocks cutover; backup restore rehearsal, session/schema compatibility, in-flight Queue drain/fence and rollback; real smartaihub.app Cloudflare execution plus aimarkethubs.com dev isolation; absent production authority leaves traffic unchanged.
