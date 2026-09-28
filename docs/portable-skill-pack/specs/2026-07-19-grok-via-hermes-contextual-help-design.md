# Grok via Hermes Contextual Help Design

## Goal

Add source-grounded, bilingual contextual help for every UI surface used to
enable, connect, install, and monitor the Grok via Hermes media worker.

The new help must remain distinct from the existing `hermes-workers` topic,
which documents the separate Hermes Agent Gateway runtime.

## Chosen approach

Use the existing Markdown help-content system and `HelpButton` side panel.
Create four focused topics rather than one oversized article:

1. `grok-via-hermes-connections`
   - User-facing connection modes, OAuth, defaults, generation tests, reconnect,
     and common errors.
   - Contextual button: `HermesConnectPanel` on `/settings`.
2. `grok-via-hermes-admin`
   - Platform enablement, tenant rollout, three scopes, shared server worker,
     operational limits, safe configuration order, and rollback.
   - Contextual buttons: `HermesInfrastructureSettingsCard` on
     `/admin/settings` and `TenantFeatureFlagsPanel` on `/admin/tenants`.
3. `grok-via-hermes-worker-app`
   - Windows Worker App download, browser approval, Hermes runtime pack,
     online requirement, private connection behavior, and troubleshooting.
   - Contextual button: `WorkerAppConnect` on `/workers/connect`.
4. `grok-via-hermes-monitoring`
   - Worker readiness, doctor/capability state, heartbeat freshness,
     per-connection isolation, job lifecycle, and diagnostics.
   - Contextual button: the Claw Workers card on `/admin/monitoring`.

Each topic is authored separately in:

- `apps/web/docs/help/en/`
- `apps/web/docs/help/th/`

## UI integration

Reuse `HelpButton`; do not introduce a second dialog, route, or help framework.
Buttons pass both `page` and `topic` so the help panel opens directly at the
relevant article while preserving normal Help Center discovery.

Button labels follow the current page locale:

- Connections: `Grok via Hermes Help` / `คู่มือ Grok via Hermes`
- Admin: `Setup Help` / `คู่มือการตั้งค่า`
- Worker App: `Worker App Help` / `คู่มือ Worker App`
- Monitoring: `Grok Media Help` / `คู่มือ Grok Media`

The buttons remain secondary actions (`outline`, `sm`) and receive an accessible
visible label. Existing layout patterns and responsive wrapping are preserved.

## Content requirements

All operational claims must match current code and runtime behavior:

- Supported operations are `image.generate`, `image.edit`, and
  `video.generate`; actual availability is capability- and entitlement-gated.
- Connection scopes are tenant central (`server_shared`), personal on server
  (`server_personal`), and personal on device (`private_worker`).
- xAI authorization uses device authorization; SmartSpecPro must not request or
  display account passwords, cookies, or access tokens.
- Server connection resolution and readiness are DB-backed.
- Credentials are isolated per connection through a separate `HERMES_HOME`.
- A private-device connection requires an online Worker App.
- Windows Worker App/runtime is available; unpublished platforms must be
  described as unavailable rather than implied to work.
- The admin guide must distinguish Grok media worker flags from
  `hermesAgentRuntime`.

## Failure and safety guidance

The help must provide actionable recovery for:

- platform or tenant gate disabled
- server worker missing, offline, stale, or doctor/capability unavailable
- Worker App offline
- OAuth denied, expired, or incomplete
- Grok entitlement restrictions
- image/video operation not advertised
- expired references, invalid output, timeout, and quota/rate-limit errors

No secret values, tokens, user codes, connection IDs, or production-only
credentials are embedded in documentation or tests.

## Testing

1. Help-content service tests confirm all four slugs resolve in English and Thai
   and are discoverable for their declared pages.
2. Component tests confirm each contextual button passes the correct `page` and
   `topic`.
3. Existing Hermes connection, infrastructure, tenant flag, Worker App, and
   monitoring tests remain green.
4. Browser-level verification confirms each button opens the side panel directly
   to the correct localized topic at desktop and narrow viewport widths.

## Non-goals

- Replacing or renaming the existing `hermes-workers` Agent Gateway guide.
- Adding a new help backend, database table, or route.
- Documenting unrelated OpenClaw, NemoClaw, HiClaw, or Desktop Host workflows.
- Claiming that a user's Grok generation has been tested before that user
  authorizes an entitled account.
