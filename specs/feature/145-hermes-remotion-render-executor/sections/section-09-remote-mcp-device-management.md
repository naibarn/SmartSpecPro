# Workstream 09 — Remote MCP Default and Owner Device Management

## Goal

Remote MCP is the default SmartAIHub integration and does not require a
download. A local Remotion Executor is an explicit optional device capability,
not a prerequisite for connecting an MCP client. The logged-in user receives a
Settings surface that lists only that user's approved devices and MCP agent
sessions, including how access was granted, when it was approved, last activity,
and access/refresh expiry. The user can revoke one device/session safely.

## User-visible contract

Add an `MCP & Connected Devices` section to the existing user Settings page.
It contains:

1. SmartAIHub MCP connection information for `https://smartaihub.app/v1/mcp`,
   with Connect/Reconnect status. Connecting Remote MCP must not download a
   runtime pack.
2. `My connected devices`, filtered server-side by the authenticated user ID.
   Each row shows a safe display name, runtime kind, platform/architecture,
   connection method, approved scopes, status, approved time, last seen time,
   access-token expiry, refresh-token expiry, and a short non-secret device
   fingerprint.
3. Remote MCP remains the primary action and never downloads a file. The
   optional local-rendering action is intentionally withheld/disabled until
   signed Connector/Executor platform release gates pass; only that future
   action may start installation.
4. A `Revoke access` action with confirmation. Revocation is idempotent, removes
   the device's active auth capability, marks the record revoked, and remains
   visible in history with the revoker and timestamp.

The UI never renders access tokens, refresh tokens, private keys, raw public
keys, full IP addresses, cookie values, or arbitrary request headers.

## Data and authorization contract

Use a durable connected-device/session record rather than relying on a Redis
pairing record or a worker row alone. Store only metadata and hashes:

- tenant and owner user IDs;
- optional worker ID and MCP pairing/consent ID;
- stable device ID hash and public-key fingerprint;
- runtime kind, platform, architecture, display name, and connection method;
- requested/approved exact scopes and a redacted request summary;
- approved, last-seen, access-expiry, refresh-expiry, revoked, and updated
  timestamps;
- status and revocation actor/reason.

Never persist bearer or refresh token plaintext. The record is not itself an
authorization grant; every request still validates the existing token, device
proof, tenant binding, user binding, scope, and revocation key.

All list/detail/revoke operations use both tenant and owner predicates. A user
cannot access another user's record by changing an ID. Revoke must re-check the
record owner inside the mutation transaction, write the canonical revocation
key for the exact tenant/user/device binding, revoke any linked worker
credential lineage, and emit an audit event without secrets.

## Remote MCP and local executor boundaries

Remote MCP tools submit server-side work and return typed job/artifact
references. They do not inspect local files or start local processes.

The optional local executor remains a separate worker/data-plane connection. It
may reuse a verified Hermes One installation or a signed managed runtime beside
it, but it is shown as a device in this same owner-scoped page. Revoking the
device blocks worker claim, refresh, MCP pairing, and artifact upload for that
device. Existing Worker App behavior remains unchanged.

## API and testing contract

Add protected user procedures backed by one service:

- list owner devices with safe metadata and stable ordering;
- get one owner device if needed by the UI;
- revoke one owner device idempotently;
- expose Remote MCP endpoint/capability status without creating a local install.

Tests must prove same-owner access, cross-owner 404/forbidden behavior, tenant
isolation, idempotent revoke, token expiry projection, refresh/revocation
blocking, audit redaction, no-token serialization, and unchanged external MCP
server management. The implemented UI covers empty, connected, offline,
expired, revoked, and revoke-in-progress states; native installation remains a
release-gated follow-up rather than a hidden download.

## Rollout

The Settings UI can ship independently of local native packs. Remote MCP remains
available without the dedicated executor flag. The optional local executor
button is disabled or marked unavailable until the platform pack and pairing
client have passed their release gates. Existing tenant feature flags continue
to gate only dedicated executor dispatch, not basic Remote MCP connectivity.
