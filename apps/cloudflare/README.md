# Cloudflare runtime boundary

This package is the provider-neutral Worker entrypoint and local contract
surface for Feature 186/187. It deliberately contains no account IDs,
credentials, production routes, or target bindings.

Local verification:

```text
npm --workspace @smartspec/cloudflare-runtime run check
npm --workspace @smartspec/cloudflare-runtime test
npm --workspace @smartspec/cloudflare-runtime run build
npm --workspace @smartspec/web run verify:cloudflare-local-readiness
npm --workspace @smartspec/web run verify:cloudflare-target-readiness -- --mode local
```

`/healthz` is liveness only. `/readyz` remains unavailable until activation
is enabled and the required capability bindings are injected. The queue
consumer acknowledges a message only after the canonical control-plane handler
returns success or a durable quarantine disposition; database/control-plane
failure requests bounded redelivery.

The `wrangler.jsonc` file is a deployment-safe template. The approved
pipeline must inject environment-specific Hyperdrive, Queue, Workflow,
Container, Worker App, R2, and Vectorize bindings after target-account
preflight. Local mocks and this package's tests do not satisfy production
connectivity, rollback, provider-recovery, or PITR gates.

The Spec260 production template names the canonical queue and its dead-letter
queue explicitly. Provision both names through the approved pipeline and bind
`JOB_QUEUE` to the producer resource. Do not enable activation until the
canonical fenced repository and allowed job executor composition are injected;
without them the consumer intentionally retries and `/readyz` remains false.

Search Result Cache is an optional, independently activated slice. When
configured, the deployment pipeline also injects the `SEARCH_RESULT_CACHE`
KV namespace binding and the `CLOUDFLARE_SEARCH_CACHE_TOKEN` secret. Its
`/internal/cache/search` endpoint is independent of `CLOUDFLARE_ACTIVATION` and
does not enable canonical job processing. `workers_dev` is disabled, so the
deployment must configure the approved runtime hostname/route before the web
application sets `CLOUDFLARE_RUNTIME_URL`. Durable Object bindings are not part
of this Worker release; add them only through the owning voice/session runtime
contract and reviewed namespace migration.

## Spec 260 edge API

Spec 260 API routes in `wrangler.production.jsonc` are attached to the known
SmartAIHub public zones so browser requests remain same-origin. Tenant custom
domains outside `smartaihub.app` and `smartspec.pro` must receive the same five
API namespace routes from the approved domain-routing pipeline before those
tenants enable Spec 260.

The canonical Node platform supports two ingress modes. `SPEC260_INGRESS_MODE`
defaults to `auto`: when `SPEC260_PLATFORM_EDGE_TOKEN` is present, the platform
requires the authenticated Cloudflare Worker route attestation; when it is
absent, the platform serves the shared routes directly for Linux deployments
(including Linux origins published through Cloudflare Tunnel). Set the mode to
`cloudflare` to fail closed if the Worker token is missing, or `direct` to force
Linux ingress. The direct mode derives host/protocol/route metadata from the
request and still applies the route's normal authentication, tenant, rate-limit,
and same-origin checks.

The production deployment pipeline must inject `PLATFORM_EDGE_ORIGIN` as an
HTTPS **origin-only** URL that bypasses the public Worker route (a private
origin hostname), set `PLATFORM_EDGE_PRIVATE_HOST` to the exact hostname vetted
by that pipeline, and set the `PLATFORM_EDGE_TOKEN` secret to the dedicated
`SPEC260_PLATFORM_EDGE_TOKEN` on the web platform. This secret must not reuse
the general internal gateway token. The platform also requires
`SPEC260_ANON_CASE_TOKEN_SECRET` (32+ random characters) to derive anonymous
continuation capabilities; keep that secret only on the web platform. Never point the origin at a public
hostname that carries these route patterns; that would recurse. Keep these
values out of source control. The Worker forwards requests to the canonical
app auth/service boundary and does not validate session tokens itself. Missing
origin/token produces a closed 503.

Canonical Queue consumption also calls the private platform's narrowly scoped
`/api/internal/cloudflare-job-control/*` endpoints for dispatch validation,
lease acquisition, and fenced settlement. Provision a separate high-entropy
`CLOUDFLARE_CONTROL_PLANE_TOKEN` secret with the same value on the Worker and
web platform. It must not reuse `PLATFORM_EDGE_TOKEN`, the general internal
gateway token, or a user credential. The platform routes reject requests when
the dedicated token is absent. Queue activation stays disabled until this
transport and an allowlisted Cloudflare executor registry are both composed.

Spec 260 basemap configuration is owned by the existing encrypted platform
`system_settings` authority and the Infrastructure Admin Maps & Geospatial panel.
The Cloudflare Worker forwards `/api/public/emergency/map/*` requests to the
private platform origin; it does not hold Google credentials or select a second
map configuration. Google Map Tiles session and tile requests are relayed by the
platform with a server-restricted API key, bounded coordinates, and `no-store`
responses. Google map content is visualization-only and is never persisted,
cached in R2, or offered as offline tiles. The configured MapLibre style remains
the provider fallback. Public map overlays continue to come only from canonical
Spec 260 projections.

Spec 260 evidence uploads use the private R2 staging prefix
`emergency-evidence-staging/` and promote verified bytes to
`emergency-evidence/`. Configure a bucket lifecycle rule in the provisioning
pipeline to delete every staging object after 24 hours. The application never
returns the promoted object key or a public R2 URL; private content is served
through a case-authorized platform API route. The pipeline must also allow
browser `PUT` from the two approved public application origins, with the
`Content-Type` request header only; do not enable anonymous `GET`, list, or
public-object delivery for either prefix.
