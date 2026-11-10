# Section 05 — Browser pilot and runtime proof

## Requirement IDs

`REQ-4BB581C90577`, `REQ-64CA2E9BC303`, `REQ-38590D443AC3`, `REQ-AB16939A3F52`, `REQ-C8D3AE2138BD`, SPEC-317 R1.2/R1.3/R1.6.

## Objective

Integrate a Chromium/Playwright pilot only through an authorized adapter and canonical durable job boundary, then demonstrate the fresh front door through local Worker/build evidence. Keep deployment and human acceptance separate from source success.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: `modules/chat/src/browser/**`, `modules/chat/src/jobs/**` adapter contracts, targeted browser/runtime tests and narrow deployment/run documentation. No browser binary or persistent worker is added to `apps/saas-core`.

## Prerequisites

Sections 01–04. Existing browser provider/runner and `worker_jobs` contracts must be verified before enabling a run action.

## Deliverable and completion predicate

- Chat exposes browser pilot only when a server-verified capability/provider is available.
- Admission is idempotent and uses the existing canonical `worker_jobs` plus outbox; no private queue, duplicate job table, or `waitUntil`-only long task.
- Job status/artifact links use canonical IDs and honest progress; browser session snapshots do not become durable authority.
- URL/domain policy and prompt-injection/action authorization are enforced server-side; the UI cannot authorize a run itself.
- If the only approved executor is an offline user device, the UI truthfully labels local/pending handoff instead of claiming cloud continuation.
- Local Worker checks prove only Workerd behavior; remote Hyperdrive, configured provider, browser service, real user login, and domain target health are separate evidence.
- Keep `aimarkethubs.com` old runtime/port/Tunnel unchanged until target application health and handover authority are proven. Do not touch Cloudflare production/DNS.

## Verification/evidence

Test adapter missing/unauthorized/unsupported host/provider outcomes and durable job DTO projection. Build only Chat and changed contracts. If authorized browser tooling exists, capture one test run with job/artifact receipt; otherwise record the exact adapter credential/runtime gap. Check deployment mapping and liveness without changing traffic.

## Fallback/substitution

Implement the typed adapter interface and a clearly disabled/unconfigured UI state when real browser service credentials do not exist. Do not use Moli for production, bundle Playwright/browser binaries into Hono, call the old app route, or claim a successful browser pilot from a mocked test.

## Blocker challenge strategy

Continue all local build/auth/chat work if browser credentials are absent. Retry only when provider/runner availability changes. Do not create or deploy a replacement runtime/credential without the existing SPEC-208/SPEC-295 authorities.
