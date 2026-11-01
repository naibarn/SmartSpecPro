# Section 02: Worker API adapter and scoped database

## Requirements

REQ-311-02, REQ-311-03, REQ-311-04, REQ-311-09.

## Prerequisites

section-01. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

`apps/cloudflare/src/index.ts`, apiRouteManifest, postgresClient/hyperdrive; portable service/context boundaries extracted from active web API code; existing storage bindings.

## Implementation tasks

Implement Fetch/tRPC adapter with request-scoped context and deliberate imports that do not start Express, schedulers or background services. Match transformer, errors, batching, cookies and headers. Enforce trusted host tenant resolution, reviewed origins and authorization. Use existing Hyperdrive/private connectivity and app-scoped credentials, transaction boundaries and finally cleanup; bypass unsafe cache for authorization/mutable reads.

Implement static assets/SPA route separation and shared storage adapters without a local filesystem dependency. Establish handler-level no-origin/no-app-Container egress checks. Schema evolution, only if needed, uses the existing migration runner with compatibility/rollback, never runtime auto-migrations.

## Focused verification

tRPC transformer/batch/error/cookie parity; request-scoped tenant context does not leak across requests or batch entries; spoofed hosts/forwarding headers rejected; DB TLS/role/transactions/cleanup and cache safety; no request-time schema writes; ordinary assets/upload ownership and no app-origin egress.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
