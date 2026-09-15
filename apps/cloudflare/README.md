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
