# Section 06 — UI, Documentation, Telemetry, and Rollout

## Goal

Make user/operator surfaces agree with actual MCP/client/device/runtime
capabilities and provide safe recovery and deprecation measurement.

## Ownership

Modify shared onboarding/docs projections, Settings UI/locales, MCP resources
and public docs generation, telemetry projection, and tenant/admin rollout
surfaces. Preserve all existing integration panels and legacy fallback routes.

## Required behavior

- One descriptor drives `/v1/docs`, MCP resources, Settings setup cards, and
  client-specific instructions for Hermes One, Hermes CLI, Claude/Claude Code,
  Codex CLI, generic MCP, and browserless machines.
- UI clearly distinguishes MCP connection, Hermes device session, Worker
  runtime readiness, job, artifact publication, and download ACL.
- Show tenant, origin/verified origin, human-readable scopes, quota windows,
  expiry, client/version, last used, runtime/platform, and revoke actions.
- Show OAuth unavailable fallback and device-code/key states; never instruct
  users to edit production `.env` or paste Worker/provider secrets.
- Telemetry separates endpoint, transport, client family/version, auth mode,
  runtime/capability, failure code, latency, quota/publication state and redacts
  secrets/local paths.
- Production flags/config are DB/UI controlled, audited, dependency-aware,
  and off by default. Legacy endpoint/pairing use is measured for 30–90 days
  before deprecation.

## UI/UX Contract

### Target User / JTBD

End user and operator diagnose a connection/render without reading raw logs.

### Surface Inventory

Settings MCP/devices/API Keys, admin tenant flags/config, chat task status,
`/v1/docs`, and MCP resources.

### Component Map

Shared descriptor/status projection, connection/device panels, task timeline,
runtime readiness card, and telemetry/rollout admin view. Existing panel
ownership remains unchanged.

### State Matrix

Checking, ready, unavailable, fallback, pending, expired, revoked, blocked,
installing, running, uploading, publishing, completed, failed, partial, and
pending publication.

### Responsive Matrix

Mobile stacked content, tablet split setup/details, desktop comparison/detail
tables; action buttons remain reachable at every breakpoint.

### Accessibility Acceptance

Keyboard/focus, semantic status announcements, labelled icon buttons,
descriptive confirmation dialogs, contrast, and reduced motion.

### Copy Contract

Existing tokens and card patterns; Thai/English plain-language descriptions for
scopes, origin, tenant, quota, expiry, and next actions.

### Browser Evidence Required

Settings connection/revoke, task progress/recovery, and blocked runtime states
in a production-like browser.

## Tests-first requirements

- Descriptor/docs consistency tests compare UI/resources/manual capability
  availability to the same source.
- Telemetry redaction/dimension tests and legacy endpoint counters.
- Component tests for every key state and existing panel preservation.
- Tenant flag/config audit and rollback tests.
- Focused browser evidence for connection, fallback, revoke, and task status.

## Acceptance evidence

No UI or manual may call a disabled/unverified capability ready. Any stale
instruction is a release defect and must be corrected before rollout.

## Implementation status

Implemented descriptor-driven Settings/MCP documentation for the supported
client families and preserved the separate MCP, Hermes, and device panels.
Production browser evidence, telemetry observation, and the 30–90 day legacy
deprecation window remain rollout gates rather than code-complete claims.
