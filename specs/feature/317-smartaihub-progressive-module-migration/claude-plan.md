# Implementation plan — Chat-first independent module slice

## Outcome

Replace the assumption that `/dashboard` is the new home with a fresh Modular application flow: login → Chat. Create independently buildable Core/Shell/Chat packages with versioned assets and narrow contracts. The old site remains available until a healthy replacement is explicitly handed over.

## Requirements and status

| Requirement | Mapping | Status before work | Required evidence |
|---|---|---|---|
| `REQ-4BB581C90577` small reversible releases; Core/Shell before module UAT | 01–05 | Open | filtered build evidence, target remains unchanged |
| `REQ-6F1846B57E8F` independently moving authenticated module | 01–05 | Open | Authenticated Chat route and package isolation |
| `REQ-069F6F822212` single durable writer/idempotency | 03, 05 | Open | Chat records/job operations use canonical writer and IDs |
| `REQ-2B7D77E6D086` consistent Shell/module routes | 02, 04 | Open | route and manifest behavior |
| `REQ-64CA2E9BC303` real human UAT | 05 | Open | authorized UAT record; not inferred from automated tests |
| `REQ-48EFA6340760` actual legacy-data ownership mapping | 03 | Open | schema/authority audit before any chat write |
| `REQ-AB16939A3F52` identity, domains and target separation | 01–05 | Open | shared identity contract and unchanged target evidence |
| `REQ-38590D443AC3` single Core financial/job authority | 03, 05 | Open | no duplicate writer/ledger/job store |
| `REQ-91CC7880E937` independent package/build model | 01, 04 | Open | per-package builds, no aggregate/root all build |
| `REQ-C8D3AE2138BD` bounded modules, manifest, no Legacy runtime | 01–05 | Open | dependency/bundle report and source scan |
| `REQ-34BA27C1BFAE` R1.6 Chat front door | 02, 04 | Open | login default `/chat`, no Legacy dashboard |
| `REQ-8ACA3DD0FDD4` R1.6 independent package builds | 01–04 | Open | filtered builds and lazy versioned module assets |
| `REQ-07858C20A7E7` R1.6 domain/runtime separation | 05 | Open | target map and unchanged live route evidence |

`REQ-6BA6E5614490` and `R1.4` prescribe initial development control-plane/Run evidence. Direct code changes may be used only as already authorized by the user/session and must not be misreported as a SPEC-224 UI Run. Record only actual execution evidence.

## Architecture and interfaces

1. Keep `apps/saas-core` as the existing standalone Hono Worker and expose only the minimal versioned session-principal contract required by the Chat module. Chat never receives the private browser-session signing key. Prefer an audience-bound short-lived internal assertion over forwarding raw session secrets between Workers.
2. Add `packages/saas-contracts` only if needed for stable route DTOs and module manifest types; do not create a central import barrel or put business logic/shared schema there.
3. Add `apps/saas-shell` as a React/Vite SPA. It owns `/login`, `/`, `/chat` resolution, account/logout chrome and the versioned module manifest loader. After login it always defaults to `/chat`; `/dashboard` in the new app resolves to `/chat`.
4. Add `modules/chat` as an independently versioned Vite UI + Hono Worker package. Its manifest declares route base `/chat`, asset version/hash, API route, required Core contract, capabilities, data authority, deployment scope, and optional job/browser adapter. The Shell lazy-loads Chat assets; it does not import Chat source.
5. Chat reads/writes only the verified existing conversation/message/artifact records using a narrow role or canonical API. Before persistence is implemented, inspect the actual `smartspec` catalog/schema and legacy writer contract without reading unrelated row contents. Do not add Chat DDL or a replacement store to the shared Core database by default.
6. Provider calls use server-side bindings/adapters with no browser key. A configured provider may stream directly for bounded responses. Any work that must survive request/browser closure is admitted to canonical `worker_jobs` and outbox and executed by an authorized existing worker; Chat does not create an alternate queue.

## Build contract

- Add named package scripts for Core, Shell, Chat and contracts as appropriate.
- Remove the root all-package `build` default. Do not add an all-app build replacement.
- Keep each Vite/Wrangler output under its package, with content-hashed static assets and a measured package-only size record.
- `pnpm --filter @smartaihub/saas-core build`, `pnpm --filter @smartaihub/saas-shell build`, and `pnpm --filter @smartaihub/chat build` must build only that selected package and true required dependencies.
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
