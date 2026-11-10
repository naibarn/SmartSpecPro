# Focused verification plan — Chat-first independent module slice

## Package/build boundaries

- Build Core, Shell, Chat and small shared contract packages separately.
- Verify a Chat-only build does not invoke Core/Shell/Legacy build scripts and produces artifacts only under its package.
- Verify the root has no default all-app build entry point.
- Inspect package dependency graph/metafile for `apps/web`, Express, cross-module implementation imports and oversized unused dependencies.

## Login and Shell routing

- Unauthenticated `/` and `/chat` go to `/login` with same-origin return handling.
- Successful authentication defaults to `/chat`; `/dashboard` resolves to `/chat` and never renders a Legacy dashboard.
- Session restoration, logout, expired session, unavailable Core API, invalid credentials, loading/disabled/focus states are covered.
- Cookies remain host-scoped and HttpOnly/Secure/SameSite per the Core contract; client-provided tenant IDs do not authorize anything.

## Chat API and data authority

- Verify principal exchange is audience/expiry bound, tenant membership comes from Core, and caller-supplied user/tenant IDs are ignored/rejected.
- Verify unauthorized, revoked, cross-tenant, malformed, expired, duplicate idempotency key and provider failure paths.
- Verify repository SQL uses only live-verified canonical tables and a scoped DB role; no DDL, broad schema barrel, private chat store, or financial/job writer is introduced.
- Verify streamed output handles abort/disconnect while persisted records remain coherent; long jobs use canonical `worker_jobs` + outbox only.
- Never print credentials, password hashes, auth tokens, prompts, or private user row content in test output.

## Chat UI

- Cover conversation empty/list/history, stream begin/chunk/complete/fail/cancel, composer disabled/loading, structured code/diagram/choice rendering, copy action, artifact panel open/close/reload, and accessible keyboard/focus behavior.
- Ensure Chat module's asset manifest is version/hash validated and the Shell lazy-loads only selected module assets; stale/deep links fail safely.
- Use Playwright screenshots/evidence at mobile 390x844, tablet 768x1024 and desktop 1440x900; record skipped evidence with a reason if local browser or real credentials are unavailable.

## Browser pilot/runtime

- Adapter rejects unauthorized/missing capabilities, enforces URL/domain policy, uses a durable job identity, and returns honest queued/running/complete/error/cancel states.
- Browser run survives client disconnect only when an authorized hosted executor is actually configured. An offline-device-only executor must be labeled accordingly.
- Local Workerd tests cover Hono compatibility but do not claim remote Hyperdrive/provider/Cloudflare production proof.
- Verify deployment target map still reports modular Debian application unavailable/not deployable unless a separate health-checked replacement and actual handover evidence exist.
