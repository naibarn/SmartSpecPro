# SPEC-311 development plan

Status: planning complete; runtime implementation and live acceptance unverified.

## Operational suspension

Owner-directed cleanup on 2026-11-01 removed the trial compute/runtime resources. Keep development and test work local while live migration is disabled. Source helpers and historical receipts remain reusable, but provider resources are not currently allocated. Do not execute live spikes or recreate resources until the owner explicitly resumes that phase; reconcile stale provision checkpoints and build only the dependencies required by the new Worker-native design.

## Approach

Reuse the existing Worker, Hyperdrive helpers, Queue transport, canonical job contracts, deployment credentials and release path. Extract portable services and register actual Worker handlers progressively. Keep the frontend API contract stable and isolate environment/tenant/runtime adapters. Do not import the whole Express startup graph or introduce a second job/approval system. Existing protected-origin/Container deployments remain rollback evidence, not native execution proof.

## Ordering and dependencies

Start with exhaustive inventory and a no-application-Container database spike, then the Worker API/context foundation. Auth/email is the first visible feature slice. Queue control may proceed once the foundation is ready, independent of complete domain API ports. Domain parity plus Queue infrastructure enables Chat/agents/native-dependency resolution. All streams converge on failure testing/soak and the actual cutover interlock.

## Verification and integration

Use scoped quick/package/integration profiles based on each change. Record revision, scope/command, UTC time, fresh resource evidence and outcome; OOM/exit137/stale resource evidence is RESOURCE_BLOCKED, not code failure. No repository-wide local typecheck. Integrate focused passing code to main promptly through existing protection, then apply any relevant authorized development migrations. Reuse canonical builds only when artifacts are needed. DNS/production release needs its existing exact-target authority and full spec gates.

## Capability and safety choices

Keep PostgreSQL smartspec and preserve admin debugging access while scoping runtime credentials. Do not use stale auth/query cache; do not copy customer payloads/secrets into Queue messages. Use durable leases/fencing and side-effect idempotency/reconciliation instead of claiming exactly-once transport. Use approved test tenants and recipients; no destructive customer-data tests. Preserve active features and the existing approved Python agent runtime boundary. Unsupported native work remains an explicit blocker unless the owner accepts a named bounded exception.

## Sections

1. **Inventory, portability and resource proof** — REQ-311-01, REQ-311-02, REQ-311-15, REQ-311-17; prerequisites: None; first development section. See [section](sections/section-01-inventory-and-portability.md).
2. **Worker API adapter and scoped database** — REQ-311-02, REQ-311-03, REQ-311-04, REQ-311-09; prerequisites: section-01. See [section](sections/section-02-worker-api-and-database.md).
3. **Identity, authentication, 2FA and email** — REQ-311-04, REQ-311-05, REQ-311-06; prerequisites: section-02. See [section](sections/section-03-identity-auth-and-email.md).
4. **Application APIs and browser feature parity** — REQ-311-07, REQ-311-09, REQ-311-15; prerequisites: section-02, section-03. See [section](sections/section-04-application-api-parity.md).
5. **Cloudflare Queues and durable job control** — REQ-311-10, REQ-311-11, REQ-311-12, REQ-311-13; prerequisites: section-02. See [section](sections/section-05-queues-and-job-control.md).
6. **Chat, agents and remaining execution dependencies** — REQ-311-08, REQ-311-12, REQ-311-14; prerequisites: section-03, section-04, section-05. See [section](sections/section-06-chat-agents-and-native-work.md).
7. **Readiness, observability and Staging acceptance** — REQ-311-01, REQ-311-14, REQ-311-16, REQ-311-17, REQ-311-18, REQ-311-19; prerequisites: section-03, section-04, section-05, section-06. See [section](sections/section-07-readiness-and-staging-acceptance.md).
8. **Controlled cutover and rollback** — REQ-311-13, REQ-311-19, REQ-311-20; prerequisites: section-07. See [section](sections/section-08-cutover-and-rollback.md).
