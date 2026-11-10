# SPEC-317 follow-on — Chat-first modular front door

## Owner intent

Build the new Modular SmartAIHub user experience so a user signs in and lands in Chat. The Legacy dashboard shown at `aimarkethubs.com/dashboard` is not the new product and must not be copied, embedded, or used as its default screen. Rebuild the new areas as small independent packages suited to Cloudflare Workers: Hono/TypeScript Worker APIs, a React/Vite account Shell, and a separately built/versioned Chat module. A Chat change must not run the Legacy `apps/web` build or rebuild/restart Core and unrelated modules.

Keep canonical identity and control-plane data in the existing `smartspec` PostgreSQL database. Use existing user IDs/password/session semantics; do not create/reset an account or introduce a replacement identity, wallet, job, or Chat authority. Existing Chat records are reusable only after the live schema and tenant/write contract are verified. Never import the Legacy Express server or its runtime into the new code.

## Product behavior

- Unauthenticated `/` or `/chat` resolves to `/login` with a safe same-origin return path.
- Successful login defaults to `/chat`.
- Authenticated `/` and `/dashboard` resolve to `/chat`; there is no Legacy dashboard route in the new Shell.
- Chat is a first-party module whose assets and API are independently versioned, built, served and rolled back. The Shell resolves its manifest and lazy-loads its hashed assets.
- The first Chat slice supports persisted conversation/message history, streamed text, tool/action progress where a canonical job contract exists, at least one typed inline code/diagram/choice renderer, and a persistent artifact panel.
- A Chromium/Playwright browser pilot runs only through an authorized adapter and canonical durable job authority. Browser execution is never inside Core or a Worker request lifecycle.

## Technical boundaries

- `apps/saas-core`: Hono API only; current auth work remains its own package/build.
- `apps/saas-shell`: fresh React/Vite static application for login, account/session state, navigation and module routing.
- `modules/chat`: fresh independently versioned Chat UI and Hono API package with `module.manifest.json` and its own Wrangler configuration.
- Shared packages expose only small versioned contracts/client primitives. Modules do not import each other's implementation or broad legacy DB schema.
- Root build commands are explicit per package. No default root command performs an all-app build.
- `aimarkethubs.com` remains unchanged until the new target is healthy and handover is intentional. `smartsihub.com` remains the separate inactive production target.

## Acceptance

1. Package-filtered Core, Shell, and Chat builds are independently runnable; a Chat build does not build Shell/Core or Legacy `apps/web`.
2. A new Shell supports login, session bootstrap, logout and direct `/chat` routing; `/dashboard` does not render the Legacy UI.
3. The Chat Worker validates identity through the Core trust boundary and derives tenant membership server-side. Client-supplied tenant IDs do not grant access.
4. Persisted chat data uses only a verified canonical source and scoped access; no new shared-database Chat schema is invented.
5. Chat route loads its versioned assets lazily, handles streaming/loading/empty/error/disabled states, and has the inline structured renderer plus persistent artifact panel.
6. Long-running browser work, if configured, is admitted through existing `worker_jobs` plus outbox and reports honest queued/running/complete/error states.
7. No new Modular traffic is sent through the old app. No domain deployment or account-password change is claimed without evidence.

## Known external acceptance evidence

Real user login requires the user to provide credentials through an approved local secret channel. A real model response and browser pilot require authorized provider configuration. If either is absent, keep the UI/API honest and record that narrow UAT gap; do not substitute a fake success.
