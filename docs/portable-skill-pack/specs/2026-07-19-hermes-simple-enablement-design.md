# Grok via Hermes — Simple Enablement Design

## Problem

The tenant flag `hermesMediaWorker` is only the tenant rollout gate. The
platform-wide `hermes_worker_enabled` gate and all connection scopes default to
off. The current UI presents these independent controls as peers, so an admin
can reasonably enable the tenant flag and still see a generic “feature is
disabled” message without knowing what remains missing.

## Approved Design

- Present one primary admin switch: **Enable Grok via Hermes**.
- Enabling applies one safe, atomic private-worker preset:
  - `hermes_worker_enabled=true`
  - `hermes_worker_private_enabled=true`
  - `hermes_worker_video_enabled=true`
  - `hermes_worker_shared_pool_enabled=false`
  - `hermes_worker_server_personal_enabled=false`
  - `web_process_hermes_worker_enabled=false`
- Disabling changes only the platform master gate to false so operator tuning
  is preserved.
- Keep advanced scope, limit, fee, version, shared-worker, and development
  controls available in a collapsed operator section.
- The user settings panel must identify the exact missing gate instead of
  showing a generic disabled message.
- Copy follows the active application language (English or Thai). The existing
  page-level language toggle remains the single language control.
- Rename the tenant flag description to clarify that it is a tenant rollout
  gate and still requires platform enablement.

## Safety Boundaries

- Do not enable shared-pool or server-personal modes until a shared worker ID is
  explicitly provisioned.
- Do not enable the in-web development worker in production.
- Do not expose secrets, device codes, or connection internals in readiness
  diagnostics.
- The global platform kill switch remains authoritative.

## Readiness Model

The settings panel reports:

1. Tenant rollout gate.
2. Platform enablement gate.
3. Private-worker scope.
4. Online eligible desktop worker.
5. Authorized Grok account connection.

Only the first three are configuration gates. Worker availability and Grok
authorization remain user-owned runtime prerequisites.

## Self-review

The design keeps the existing authorization and tenant boundary, adds no new
dependency or schema, preserves the emergency kill switch, and makes production
enablement reversible. It deliberately avoids pretending the service is fully
ready when a desktop worker or Grok authorization is still absent.
