# Feature 163 TDD plan

## Shared identity/scope/action contracts

- Effective principal resolves from Worker/connected device and fails closed
  for missing/revoked owner; request user/tenant fields have no authority.
- Owner/group/tenant access precedence and hidden-Series safe not-found are
  deterministic.
- One canonical scope registry derives execution/upload permission views and
  media-operator preset; upload scope cannot list/bind/Quick Action.
- Quick Actions are discriminated, bounded, idempotent, and reject shell/raw
  path/provider graph payloads.

## Control Plane/persistence

- Paginated projections are tenant/principal/filter scoped and cursor signed.
- List/detail/bind/revoke/workspace/action route errors/status/request ID,
  rate-limit, contract version, replay and stale revision behavior pass.
- Binding active uniqueness, `If-Match`, revoke/drain, audit and migration
  dry-run conflict reporting pass.

## Native Worker

- Typed root commands never return raw paths to webview/server.
- HMAC fingerprint rotates with device secret; tokens/cache invalidates on
  unpair/account/tenant/root revoke.
- One coordinator owns heartbeat/claim/upload/GPU lease; job checkpoints pin
  root/binding/policy/source/idempotency and recover safely.

## Shell/UI

- Legacy aliases resolve to canonical routes and preserve current controls.
- Sidebar, Topbar, Series context, binding wizard, Quick Actions, queue,
  runtime/access/settings screens cover all state and responsive/accessibility
  cases without duplicate loops or navigation state.

## Integration/rollout

- Pair → discover → select → bind → scan Feature 162 → publish → revoke →
  restart/recover is covered.
- Independent flags, canary/read-only rollout, rollback, unpair/delete
  revocation, and preservation of source/artifacts/history are tested.
