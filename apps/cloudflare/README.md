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

## Static SPA staging configuration

`wrangler.staging.jsonc` is a separate Workers Dev deployment target with no
custom domain, cron, queue, KV, Hyperdrive, or activation. It serves the Vite
build from `apps/web/dist/public`; `run_worker_first` reserves API, auth,
OAuth, upload, internal, health, metrics, WebSocket, and well-known paths for
the Worker so an API miss cannot be rewritten to `index.html`. All other
unmatched browser navigation requests use the asset SPA fallback. A failed or
unconfigured Origin Proxy remains a closed 503. Do not use the production
template to deploy this staging target.

The copied `_headers` policy leaves the HTML shell revalidatable and gives Vite
fingerprinted `/assets/*` files a one-year immutable cache. The shell still has
SmartAIHub's production canonical metadata; client-side tenant SEO is not
server-rendered into the static HTML. Tenant-specific crawler metadata must
remain origin-owned until a canonical tenant metadata adapter is designed and
validated. The local static smoke proves routing and cache headers only; it is
not live Cloudflare staging or browser authentication acceptance.

Build and run the safe local Workers target with:

```sh
pnpm --filter @smartspec/web exec vite build --configLoader runner
pnpm dlx wrangler@4.151.1 deploy --config apps/cloudflare/wrangler.staging.jsonc --dry-run
pnpm dlx wrangler@4.151.1 dev --config apps/cloudflare/wrangler.staging.jsonc --local
```

Rollback is isolated to the staging Worker: disable/remove its staging Worker
deployment or revert the staging asset configuration. No production hostname,
route, activation, database, or job consumer is part of this target.

## Web/API origin routing

`src/apiRouteManifest.ts` is the explicit HTTP routing inventory. Hono backs
the Fetch-standard native API routes. The first business route is
`GET|HEAD /.well-known/smartaihub-evidence-keys.json`; it uses the same pure
key parser as the existing Express endpoint and does not access auth, tenant,
database, or job services. `/healthz` and `/readyz` also remain Worker-native;
`/readyz` reports Worker bindings/job wiring only, not Linux app or PostgreSQL
readiness. Auth/OAuth, tRPC, other public APIs, and uploads continue to use the
existing Linux Express authority. Metrics and ordinary HTTP streams also remain
on that origin. The three existing Node WebSocket routes (voice stream, runner
control and widget) have a separate optional Container bridge. It is disabled
unless `CLOUDFLARE_CONTAINER_REALTIME_ROUTES=enabled` is explicitly composed for
staging, and requires a pinned Node image profile, the origin attestation secret
and an exact HTTPS public-origin allowlist. Invalid handshakes are rejected
before resolving/starting a Container. The bridge forwards only those exact
routes and leaves the existing app's user/ticket authorization in place. It has
unit coverage but still requires staged browser/runtime acceptance before
activation. `/ws` and `/socket.io` remain on the Linux ingress. The Worker does
not import the Express application or its background dependency graph, so it
cannot start Linux schedulers or job workers.

New Worker HTTP routes should use Hono and be listed in the explicit manifest.
Existing Express routes move incrementally. The diff-aware
`scripts/guards/express-route-architecture.mjs` CI check blocks newly added
Express route registrations unless a route-specific, owner-and-expiry exception
is recorded; edits to existing routes remain allowed. Rollback for the public
evidence-key route is to change its manifest classification to `ORIGIN_PROXY`,
which sends it through the existing authenticated origin proxy.

The API proxy requires `AUTH_ORIGIN` (an HTTPS origin-only URL),
`AUTH_ORIGIN_PRIVATE_HOST` (its exact private hostname), and the
`AUTH_ORIGIN_TOKEN` secret. Set the same high-entropy `AUTH_ORIGIN_TOKEN` only
on the Worker and existing web origin through the approved secret pipeline.
The origin validates the token before honoring the Worker-provided forwarded
host/protocol. The proxy preserves cookies, CSRF and authorization headers,
redirects, streamed bodies, and response cookies; it strips caller-supplied
forwarded and internal trust headers. Missing Worker configuration returns a
closed 503, and a wrong token returns 403 at the origin. Do not put staging or
production values in Wrangler vars or source control.

For an Access-protected origin, also compose the dedicated
`AUTH_ORIGIN_ACCESS_CLIENT_ID` and `AUTH_ORIGIN_ACCESS_CLIENT_SECRET` bindings,
and `AUTH_ORIGIN_ALLOWED_PUBLIC_ORIGINS` as a JSON array of exact canonical
HTTPS public origins. An incomplete pair or absent/invalid allowlist fails
before fetch. Caller Access credentials are discarded; application bearer
Authorization remains separate. The proxy sets `x-smartaihub-public-origin`
from its request URL, alongside the app attestation, so intermediate proxy
rewrites cannot select the browser's tenant hostname. The origin must have the
same private-host pin, app secret and public-origin allowlist. Its dedicated
ingress rejects absent/wrong attestation before tenant handling and normalizes
forwarded host/protocol only after verification. Legacy public ingress remains
available; unsigned forwarded host values cannot choose tenants when the
protected origin is configured. This does not grant an application identity
or populate trusted App route provenance.

Dynamic proxy responses are private/no-store, independently of SPA asset
caching. Access login/challenge pages for JSON auth/tRPC endpoints become a
sanitized 503; legitimate application OAuth redirects are preserved. Caller
cancellation remains attached until the upstream body is consumed/canceled,
not just until its headers arrive. No state-changing request is auto-replayed.
State-changing cookie/browser requests on verified edge ingress must match
the attested public origin, including login before a session cookie exists;
existing bearer transport and signed-provider callback exemptions remain.
The paired secrets and configuration still require the scoped deployment
pipeline and actual Access/Tunnel authority; source support alone is not a
claim that this protected origin is provisioned or serving.

The production template intentionally has no broad SmartAIHub API route: its
existing routes are limited to the runtime hostname and SPEC-260 namespaces.
Do not add a general app-domain route until staging proves same-origin login,
logout, CSRF, OAuth callbacks, refresh/revocation, tenant isolation, and a
rollback. Rollback for a staged route is to remove/disable only that Worker
route (or restore the previous route target), leaving the Linux Express service
and database authoritative. No production routes or credentials were changed
by this work.

Canonical Queue consumption also calls the private platform's narrowly scoped
`/api/internal/cloudflare-job-control/*` endpoints for dispatch validation,
lease acquisition, and fenced settlement. Provision a separate high-entropy
`CLOUDFLARE_CONTROL_PLANE_TOKEN` secret with the same value on the Worker and
web platform. It must not reuse `PLATFORM_EDGE_TOKEN`, the general internal
gateway token, or a user credential. The platform routes reject requests when
the dedicated token is absent. Queue activation stays disabled until this
transport and an allowlisted Cloudflare executor registry are both composed.

When this private platform is the already-qualified Access ingress, pin
`PLATFORM_EDGE_ORIGIN`/`PLATFORM_EDGE_PRIVATE_HOST` to the exact
`AUTH_ORIGIN`/`AUTH_ORIGIN_PRIVATE_HOST` pair. Canonical job-control requests
then use the existing Access service credentials and application attestation,
while retaining their separate `CLOUDFLARE_CONTROL_PLANE_TOKEN`. This service
composition requires exactly one allowed public origin so a Queue event cannot
guess a tenant host. An incomplete pair, ambiguous allowlist, public application
host, or reused control-plane credential fails before network access. Other
private platform hosts retain the dedicated-token transport. This support does
not install a job executor, provision native resources, or enable activation.

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
