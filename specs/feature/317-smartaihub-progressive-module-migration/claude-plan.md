# Implementation plan — Chat-first independent module slice

## Outcome

Replace the assumption that `/dashboard` is the new home with a fresh Modular application flow: login → Chat. Create independently buildable Core/Shell/Chat/Browser Pilot packages with versioned assets and narrow contracts. Each workload has an explicit package build; there is no aggregate root build. The old site remains available until a healthy replacement is explicitly handed over.

## Requirements and current status

These rows use the IDs in the canonical SPEC-317 requirement ledger. Runtime, real-account login, and human UAT remain separate from local package verification.

| Requirement | Mapping | Current status | Evidence / next action |
|---|---|---|---|
| `REQ-4BB581C90577` small reversible releases | 01–05 | PARTIAL | Independent package builds pass; target-specific deploy/rollback evidence remains |
| `REQ-6F1846B57E8F` dependency-informed waves and an authenticated pilot | 01–05 | OPEN | Verify the authenticated pilot and permitted sequencing across modules |
| `REQ-069F6F822212` compatible reads and durable idempotent writer | 03, 05 | OPEN | Verify the canonical writer/fence before enabling persistence or jobs |
| `REQ-2B7D77E6D086` Shell routes and deep-link compatibility | 02, 04 | PARTIAL | Chat-first route passes; finish SPEC-304 deep-link/custom-domain compatibility |
| `REQ-64CA2E9BC303` authorized human UAT | 02, 05 | VALIDATION_PENDING | Run on the healthy Modular development target; mocked browser checks are not UAT |
| `REQ-48EFA6340760` legacy shared-data ownership registry | 03 | OPEN | Finish actual table ownership mapping before Chat writes |
| `REQ-6BA6E5614490` mandatory SPEC-224 entry path | 01–05 | NOT_APPLICABLE | Superseded only as an entry-path mandate by R1.7; SPEC-224 remains optional |
| `R1.4` development loop and selective handover | 01–05 | OPEN | Preserve target boundaries; finish real target health, acceptance, and handover evidence |
| `REQ-F08A9F0ABB58` identity, domains, and runtime targets | 01–05 | OPEN | Verify the owner-directed target/runtime separation at deployment time |
| `REQ-B89BDD10E8E0` canonical financial and job authority | 03, 05 | OPEN | Keep new data/job authority within approved shared contracts |
| `REQ-4C483EA0329D` credit and subscription economics | Deferred | OPEN | Verify before enabling paid/provider effects |
| `REQ-4A6FCC9AB87A` portability and business-effect idempotency | Deferred | OPEN | Verify per-provider/app before external business effects |
| `REQ-295AD937395C` bounded migration and dependency isolation | 01–05 | PARTIAL | Package isolation is evidenced; complete each module's provenance/data/release record |
| `REQ-2E717B8BD3E7` Chat-first new-app route | 02, 04 | PASS | Shell tests and mocked route/browser checks pass; real account proof is tracked separately |
| `REQ-32CAB23B7018` Core/Shell/Chat independent package builds | 01–04 | PARTIAL | Filtered builds and size evidence pass; deploy/rollback scopes remain |
| `REQ-B7D16C4F9A3E` aimarkethubs.com target and existing-account login | 02, 05 | VALIDATION_PENDING | Test only after target health; do not create/reset the canonical account |
| `REQ-E5EEFB57E176` direct Codex/Claude or optional SPEC-224 path | 01–05 | PASS | Direct Codex path integrated; do not claim SPEC-224 receipts for direct work |
| `REQ-E014BEE5B67C` independently buildable workload modules | 01–05 | PARTIAL | Core/Shell/Chat/Browser Pilot have filtered builds; add future workload packages with the same boundary |

R1.7 supersedes the older R1.1/R1.4 command-path mandate: development may run directly through Codex/Claude or optionally through SPEC-224 on `smartaihub.app`. Direct work must not be misreported as a SPEC-224 UI Run; record only execution evidence from the path actually used.

## Architecture and interfaces

1. Keep `apps/saas-core` as the existing standalone Hono Worker and expose only the minimal versioned session-principal contract required by the Chat module. Chat never receives the private browser-session signing key. Prefer an audience-bound short-lived internal assertion over forwarding raw session secrets between Workers.
2. Add `packages/saas-contracts` only if needed for stable route DTOs and module manifest types; do not create a central import barrel or put business logic/shared schema there.
3. Add `apps/saas-shell` as a React/Vite SPA. It owns `/login`, `/`, `/chat` resolution, account/logout chrome and the versioned module manifest loader. After login it always defaults to `/chat`; `/dashboard` in the new app resolves to `/chat`.
4. Add `modules/chat` as an independently versioned Vite UI + Hono Worker package. Its manifest declares route base `/chat`, asset version/hash, API route, required Core contract, capabilities, data authority, deployment scope, and optional job/browser adapter. The Shell lazy-loads Chat assets; it does not import Chat source. `modules/browser-pilot` is a separate bounded package; Chat consumes only its small shared capability contract, never its implementation.
5. Chat reads/writes only the verified existing conversation/message/artifact records using a narrow role or canonical API. Before persistence is implemented, inspect the actual `smartspec` catalog/schema and legacy writer contract without reading unrelated row contents. Do not add Chat DDL or a replacement store to the shared Core database by default.
6. Provider calls use server-side bindings/adapters with no browser key. A configured provider may stream directly for bounded responses. Any work that must survive request/browser closure is admitted to canonical `worker_jobs` and outbox and executed by an authorized existing worker; Chat does not create an alternate queue.

## Build contract

- Add named package scripts for Core, Shell, Chat, Browser Pilot and contracts as appropriate.
- Remove the root all-package `build` default. Do not add an all-app build replacement.
- Keep each Vite/Wrangler output under its package, with content-hashed static assets and a measured package-only size record.
- `pnpm run build:core`, `pnpm run build:shell`, `pnpm run build:chat`, and `pnpm run build:browser-pilot` select one workload and only its small direct dependencies. A Chat change must not build Core, Shell, Browser Pilot, Legacy `apps/web`, or unrelated modules.
- No `apps/web` build, legacy service restart or production Cloudflare resource change.

## Implementation order and checkpoints

1. Establish small workspace contracts, explicit build scripts, and manifest validation.
2. Build a fresh Shell login/session UX that defaults directly to Chat with no Legacy Dashboard screen.
3. Implement Core-to-Chat authorization plus verified persistence/provider interfaces in the Chat Worker.
4. Implement independently built Chat UI: conversation list, streaming composer, structured response block, persistent artifact panel, and state handling.
5. Wire a browser pilot only through an authorized provider adapter and canonical durable job contract; then run focused local Worker/build/browser checks and record evidence. Keep the current public domain route untouched until a separate target-health/handover action is actually ready.

## Cross-section consistency review

- Dependency direction is one-way: small contracts → Core/Shell/Chat; Shell resolves Chat's versioned artifact; no package imports another module's implementation.
- Root build/workspace files are owned in Section 01 before Shell/Chat sections add packages. Sections execute sequentially where paths overlap, so no simultaneous edits to the root manifest or module loader are planned.
- Shell auth uses existing Core browser login/session APIs. The Chat Worker does not receive the private browser signing key and uses a separate audience-bound Core contract if direct Core principal resolution is insufficient.
- Chat persistence is conditioned on a read-only live schema/tenant/writer audit. Provider configuration, canonical artifact capability and durable browser executor are independently optional and cannot become fake-success paths.
- Target boundary is consistent across all sections: Core local Worker is 3200; aimarkethubs.com's current service remains untouched until replacement health/handover; smartsihub.com remains inactive.
- Cross-section completion is demonstrated with package-filtered build artifacts and actual route/API evidence. Local Workerd output, automated tests, hosted provider calls, real account UAT and traffic handover remain distinct evidence claims.

## Completion and limits

Completion of source sections means the local package artifacts and route behavior are demonstrated. It does not mean aimarkethubs.com was switched, a real model response ran, a real user logged in, human UAT passed, or Cloudflare production is active. These require actual authorized runtime/provider/credential evidence. If required provider/database contract is absent, continue independent Shell/build work and record the precise gap rather than inventing data or success.

## Rollback

Revert only the package-owned source changes or deploy the previous versioned Shell/Chat artifact. Module rollback must not restart Core or Legacy, erase account/chat rows, change port 3100/3200 mapping, alter DNS, or affect smartsihub.com.
