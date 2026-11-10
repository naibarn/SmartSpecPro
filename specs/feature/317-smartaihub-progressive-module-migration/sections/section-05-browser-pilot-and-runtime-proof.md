# Section 05 — Browser pilot and runtime proof

## Requirement IDs

`REQ-4BB581C90577`, `REQ-64CA2E9BC303`, `REQ-B89BDD10E8E0`, `REQ-295AD937395C`, `REQ-E014BEE5B67C`, SPEC-317 R1.2/R1.3/R1.6/R1.7.

## Objective

Create Browser Pilot as a separately buildable workload package with a typed, fail-closed adapter boundary. Integrate it with Chat only through a server-verified capability and the canonical durable job boundary when those authorities exist. Demonstrate local Worker/package behavior without conflating it with deployment or human acceptance.

## Owned paths

In `/mnt/SmartSpecDev/projects/smartaihub-platform`: `modules/browser-pilot/**` for the independently built policy/adapter package, the narrow `modules/chat/**` capability projection/UI integration, workspace package scripts/lockfile entries, targeted tests and narrow run documentation. No browser binary or persistent worker is added to `apps/saas-core`.

## Prerequisites

Sections 01–04. Existing browser provider/runner and `worker_jobs` contracts must be verified before enabling a run action.

## Deliverable and completion predicate

- Chat exposes browser pilot only when a server-verified capability/provider is available.
- Browser Pilot has its own package-filtered build and focused test command; building it does not build Core, Shell, Chat UI, Legacy `apps/web`, or unrelated modules.
- Its typed runtime port accepts only policy-checked requests and delegates durable admission to an adapter for canonical `worker_jobs` plus outbox. The package itself creates no job table, queue, or alternate job authority.
- Admission is idempotent and uses the existing canonical `worker_jobs` plus outbox; no private queue, duplicate job table, or `waitUntil`-only long task.
- Job status/artifact links use canonical IDs and honest progress; browser session snapshots do not become durable authority.
- URL/domain policy and prompt-injection/action authorization are enforced server-side; the UI cannot authorize a run itself.
- If the only approved executor is an offline user device, the UI truthfully labels local/pending handoff instead of claiming cloud continuation.
- If no authorized provider/job adapter is configured, show an unavailable state and do not expose a run action.
- Local Worker checks prove only Workerd behavior; remote Hyperdrive, configured provider, browser service, real user login, and domain target health are separate evidence.
- Keep `aimarkethubs.com` old runtime/port/Tunnel unchanged until target application health and handover authority are proven. Do not touch Cloudflare production/DNS.

## Verification/evidence

Test adapter missing/unauthorized/unsupported host/provider outcomes and durable job DTO projection. Build only Chat and changed contracts. If authorized browser tooling exists, capture one test run with job/artifact receipt; otherwise record the exact adapter credential/runtime gap. Check deployment mapping and liveness without changing traffic.

## Fallback/substitution

Implement the independently built typed adapter package and a clearly disabled/unconfigured Chat UI state when real browser service credentials or canonical job admission are absent. Do not use Moli for production, bundle Playwright/browser binaries into Hono, call the old app route, or claim a successful browser pilot from a mocked test.

## Blocker challenge strategy

Continue all local build/auth/chat work if browser credentials are absent. Retry only when provider/runner availability changes. Do not create or deploy a replacement runtime/credential without the existing SPEC-208/SPEC-295 authorities.
