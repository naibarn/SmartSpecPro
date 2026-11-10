# Section 03 — Chat Worker auth, data and provider boundary

## Requirement IDs

`REQ-069F6F822212`, `REQ-48EFA6340760`, `REQ-38590D443AC3`, `REQ-AB16939A3F52`, `REQ-C8D3AE2138BD`.

## Objective

Add a separately buildable Hono Chat API package that authenticates via Core's trusted contract, uses only a verified canonical conversation/artifact/job authority, and calls model providers only server-side. Keep canonical shared identity, ledger and job control planes intact.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: `modules/chat/src/api/**`, `modules/chat/src/auth/**`, `modules/chat/src/data/**`, `modules/chat/src/providers/**`, `modules/chat/wrangler.jsonc`, `modules/chat/package.json`, tests and `module.manifest.json`. Change `apps/saas-core` only for a narrow versioned assertion endpoint/binding if necessary.

## Prerequisites

Section 01. Before persistence: read-only inspect actual development `smartspec` catalog/schema and Legacy conversation/message/artifact writer. Before cross-worker assertions: confirm existing Core cookie/revocation and environment binding semantics.

## Deliverable and completion predicate

- Chat Worker has small Hono routes for authenticated conversation listing/creation, messages/stream and artifact references, bounded input and safe error DTOs.
- Principal is obtained from Core per request or an audience/expiry-bound internal assertion. Never distribute Core's private session-signing key or trust caller-supplied user/tenant IDs.
- Membership and environment tenant are verified server-side. Recheck session revocation where required.
- Existing Chat rows are read/written only if catalog, ownership, schema fields and tenant filters are proven compatible; use a least-privilege role/API. No DDL or new database/table/schema by default.
- Model credentials stay in Worker bindings/approved secret storage. Provider adapter returns a truthful unavailable result when not configured; no browser key and no Legacy provider-process dependency.
- Long-running tool/browser work enters only canonical `worker_jobs` + outbox, with an idempotency key and canonical progress/artifact IDs. Short bounded text streaming may run in-request and persist through the verified message writer.
- Module worker and any required provider package build without Core/Shell or legacy build.

## Verification/evidence

Focused Hono route/contract tests for login principal, revoked/expired/cross-tenant access, malformed input, rate/size limits, stream abort/error, provider missing/failure, idempotent retry and unauthorized writes. Record schema evidence path and role scope without customer row contents or secrets.

## Fallback and risks

If no verified conversation writer or scoped role exists, implement only independently safe auth/health/contract routes and mark persistence as a precise unresolved dependency. Do not invent tables or silently call the Legacy Express API. If model configuration is absent, keep a visible unavailable response; do not return canned assistant success.

## Blocker challenge strategy

First inspect existing schema metadata and contracts. Resolve missing routine dev credentials through existing authorized repository tooling. Stop only the unsafe write/provider subpath; continue Shell/UI/build work. Never broaden Core DB privileges or create a second queue as a workaround.
