# Section 05 — User control plane

## Objective

Expose real owner-scoped OAuth connection visibility and revocation in the existing Settings connected-device surface.

## Ownership

- connected-device service/router and ownership tests
- `apps/web/client/src/components/settings/ConnectedDevicesPanel.tsx`
- locale strings and UI tests

## Acceptance

Each user sees only their own OAuth grants/devices, safe client/origin/fingerprint data, tenant, scopes, timestamps, expiry, and status. Revoke-one and revoke-all-own-MCP are idempotent and update durable grant, refresh family, JTI/device revocation, cache, and audit state. No raw credential is displayed. Tenant-admin emergency revoke is a separate audited path.
