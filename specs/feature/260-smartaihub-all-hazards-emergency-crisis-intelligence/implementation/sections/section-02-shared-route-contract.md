# Section 02 — Shared Spec 260 Route Contract

## Goal

Implement the single route contract required by R1.37 so the public site, authenticated dashboard and Cloudflare Worker cannot drift into separate path or access-control maps.

## Requirements

- Page URLs follow the route matrix in `../development-plan.md` §3.
- API route prefixes distinguish public, authenticated, verified responder, and operations contexts.
- Public route definitions never carry restricted projections; restricted routes identify their required audience/access class.
- Every route has one stable id, unique path, explicit method for APIs, and declared public/private cache class.
- Route values are dependency-light and safe for both browser and Cloudflare Worker code. They contain no React components, Node-only imports, API secrets, or user data.
- Retired paths and systems are not aliases and are not targets in the manifest.

## Planned ownership paths

- `packages/shared/src/emergencyRouteManifest.ts`: canonical page and API route descriptors.
- `packages/shared/src/index.ts`: public export.
- `apps/cloudflare/src/spec260RouteManifest.test.ts`: manifest invariants and no-retired-path regression tests.
- `apps/cloudflare/package.json`, `apps/cloudflare/tsconfig.json`, and the root lockfile: consume the local shared package and include its source in the Worker compiler boundary; only local workspace dependency metadata is allowed, no external dependency.
- `apps/cloudflare/src/spec260RouteRegistration.ts`: Worker-side registry generated/imported from the shared contract, with explicit auth/cache classes and resource parameters.
- `apps/cloudflare/src/index.ts`: invoke the manifest dispatcher before the Worker not-found response; unconfigured known routes fail closed.
- `apps/web/client/src/App.tsx`: register page routes from the shared contract and protect non-public routes.
- `apps/web/client/src/components/Navbar.tsx`, `apps/web/client/src/pages/Dashboard.tsx`, and `packages/shared/src/constants/menu.ts`: public entry, dashboard quick link and shared menu destination.

## Test cases to add; do not run before the final implementation test pass

1. Every route id and path is unique.
2. Every public page/API route is anonymous-readable or anonymous-writable only where explicitly declared; every protected route has an access class.
3. Public map/detail/alerts/facilities/report API paths and their page destinations match the development plan.
4. Authenticated, verified, operations, and sponsor routes remain distinct.
5. The shared manifest has no `/workflows`, `/workpacks`, work/request(s), Agency, OpenSandbox, `sandbox_jobs`, or Docker dispatch route.
6. Cloudflare Worker registration covers each API descriptor exactly once, resolves route parameters for resource-level authorization, rejects an unrecognized policy class, and forces private/no-store on every non-public-success-GET response.

## Implementation steps

1. Inspect the package export and Cloudflare TypeScript/bundling boundary before choosing import shape.
2. Add the route descriptors and export without changing unrelated menu/runtime behavior.
3. Add manifest invariant tests and Worker registry tests.
4. Record any required local workspace dependency or compiler-root change; avoid external dependencies.

## Completion criteria

- The same descriptor object is imported by browser and Worker code, not copied into two literals.
- API route registration fails closed when a descriptor lacks authorization/cache policy.
- Page/API route names, audience, and cache semantics have regression tests.
- No tests or real Cloudflare environment operations are performed until the complete system implementation reaches its final verification phase.

## Actual implementation record

Implemented the shared page/API catalog and a Worker dispatcher factory with resource parameters passed to authorization and handlers. The Worker now invokes this dispatcher and returns an explicit unavailable response for declared routes until their service handlers are implemented. Added anonymous support contribution routing for the guest funding flow. Public cache headers are allowed only for successful public GET responses; restricted and error responses are private/no-store. The browser registers page routes from the same manifest and adds public navigation, dashboard menu, and quick link destinations. The route landing experience distinguishes loading, denied, unavailable, unsubmitted, and confirmed-report states. Tests are authored but intentionally not run until the final integrated test pass.
