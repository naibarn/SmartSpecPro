# Section 03 — Documentation resources and permission-correct files/media

## Scope

Own `resources/list/read` Phase 1 and the MCP-facing contract for existing
Library, R2, Remotion artifact, and media-history downloads. Do not expose user
data through generic resource URIs.

## Required design

Create an allowlisted documentation resource registry for
`smartaihub://docs/mcp/*`. Generate content from registry/docs sources where
possible, include revision/hash and cache hints, reject unknown schemes,
authorities, traversal, encoded traversal, symlink escapes, and arbitrary
network/storage URLs.

Keep user data in existing tools:

- Library search/get/download uses the existing Library permission engine;
- media history list/get/download uses all existing merged task sources with
  tenant/user checks at each source;
- Remotion/media output uses Feature 145 artifact publication and download
  broker;
- R2 objects are authorized first, then represented by short-lived signed
  broker grants with filename extension/MIME preservation.

Every download returns a safe reference/expiry and is audit logged. No raw R2
key, permanent public URL, local path, token, or binary body is returned by
default.

## TDD contract

Test docs list/read, cache/revision, unknown URI, traversal, file/http/r2
rejection, cross-tenant Library/media/artifact IDs, all supported MIME classes,
expired/revoked download grants, range behavior for videos, and URL/credential
redaction.

## Exit criteria

Resources are machine-readable docs only; a user cannot use `resources/read` to
reach another user's media or the server filesystem. Existing Feature 145
download tests and ACL behavior remain green.

## Implementation status — 2026-08-17

`mcpResources.ts` exposes four static Markdown documentation resources only.
URI scheme, length, traversal, and allowlist checks are enforced, and reads
return a stable revision plus public cache metadata. Library, R2, and Media
History files remain outside generic `resources/read`; they continue through
existing scoped tools and `mcpDownloadBrokerService`, which re-checks ACLs at
redemption time.

Focused resource tests cover allowlisting, revision output, traversal, unknown
scheme, and unknown URI rejection. Cross-tenant artifact and native worker
upload evidence remains a release gate.
