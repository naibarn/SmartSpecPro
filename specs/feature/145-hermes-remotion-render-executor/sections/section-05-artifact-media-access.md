# Section 05 — Artifact, Library, R2, and media-history access parity

## Purpose and implementation outcome

This workstream makes all MCP-visible media access pass through one canonical
authorization decision. It covers render input references, Worker App-equivalent
published artifacts, Library files, R2/managed-storage objects, and complete
tenant/user-scoped media history. It supports images, video, audio, documents,
archives, and future registered MIME types without making MCP a bucket browser or
filesystem API.

The output is an opaque, short-lived, source-bound download reference or bounded
server stream. It is never a raw R2 key, managed path, provider URL, signed URL
copied into MCP JSON, or client-controlled content type. PostgreSQL remains
authoritative for ownership, ACL, task/artifact metadata and publication state;
R2/managed storage remains authoritative for bytes.

## Scope and ownership boundaries

Owned implementation areas:

- `apps/web/server/services/managedStorageAuthorizationService.ts`
- `apps/web/server/services/managedMediaAccessService.ts`
- `apps/web/server/services/mcpDownloadBrokerService.ts`
- `apps/web/server/services/libraryService.ts`
- `apps/web/server/services/mediaAssetService.ts`
- existing adapters used by `media.listTasks`
- `apps/web/server/_core/mcpRegistry.ts` Library/history projections
- `apps/web/server/storage.ts` and managed storage integration in
  `apps/web/server/_core/index.ts`
- `python-backend/app/models/media_task.py` and migration
  `python-backend/migrations/013_add_media_task_tenant_id.py`

Section 02 owns worker artifact init/complete lease and checksum transitions.
Section 03 owns MCP schemas/catalog visibility. Section 07 owns Redis grant
coordination and outage behavior. No section may create a second ACL or
storage-key authorization rule.

## Canonical source descriptor and service boundary

Confirm current exports before editing. The canonical service boundary must
provide equivalent operations to:

- resolve a server-owned source by authenticated actor and source reference;
- authorize a Library item with the existing visibility/share/role engine;
- authorize a media-history task/artifact by tenant, owner and publication state;
- mint an opaque reference with bounded expiry and policy version;
- redeem it with a second ACL/source/expiry/replay check;
- stream or presign exactly the authorized object with content/range limits.

The MCP registry must call this boundary for
`smartspec.knowledge.library.download` and
`smartspec.media.history.download`. Render input resolution must call the same
boundary before staging data into an executor workspace. The existing internal
storage proxy may remain for compatible server consumers, but is not the MCP
authorization boundary.

Use a strict internal descriptor, never a user-supplied object:

```text
sourceType: library_file | media_history_artifact | remotion_artifact | managed_media
tenantId: server-derived tenant
ownerUserId: server-derived owner
resourceId: opaque server identifier
taskId/libraryItemId: nullable server identifiers
storageRef: server-resolved internal reference, never returned to MCP
contentType: server-registered MIME
byteSize: server-recorded bounded size
downloadable: server policy result
policyVersion: canonical ACL/download policy version
```

Reject raw storage keys, `storage://` URIs, external URLs, absolute/local paths,
arbitrary bucket names, client MIME overrides and IDs from another tenant.
Missing, deleted, unlinked, expired and cross-tenant/no-permission sources use
the same not-found-style result.

## Library and media-history authorization

Use the existing Library permission engine and cover owner/private, direct share,
team/group/role share, public policy, same-tenant-no-permission, cross-tenant,
deleted/unlinked/expired share and R2-backed registered files. Search/get may
return permission-visible metadata and stable item IDs. Download returns only the
opaque reference/stream contract and never the object key or presigned URL.

Use the same merged task source as the UI (`media.listTasks` plus provider,
deferred, HyperFrames, MCP and Hermes adapters). Paginate and deduplicate by
canonical task identity, enforcing tenant/user scope at every adapter. For legacy
Python `media_tasks`, use the tenant-aware model/request propagation and
migration 013. Null/unresolved tenant rows are not discoverable or downloadable;
never infer tenant from task ID, filename, R2 key or provider metadata. Cross-user
access requires existing Library/share permission, not tenant membership alone.

A Remotion artifact is downloadable only after terminal server publication and
job ownership checks. Queued/running/failed jobs have no final download.

## Opaque reference and redemption

The reference is versioned and bound to tenant/user, source type, resource ID,
policy version, issued time, expiry and a server-side active grant. First-release
TTL is fixed at five minutes and cannot be extended by input. It must not encode
a raw storage key or complete URL.

Redemption must:

1. validate token shape, version, signature/hash, expiry and grant/replay state;
2. use the Section 07 active-grant policy; Redis loss denies rather than bypasses;
3. re-resolve the source and rerun tenant/user/Library/media ACL checks;
4. verify source ID, storage ref, MIME, size and policy version;
5. stream or presign only the exact object with bounded disposition/range policy.

Video/audio Range requests remain bound to the same grant/object and obey range,
byte and concurrent-stream limits. Audit records include actor/tenant/source/
resource/MIME/bytes/range/outcome, never raw keys, complete URLs, credentials or
prompts.

## Worker App artifact parity

The standalone executor uses Section 02's existing
`initWorkerArtifactUpload`/`completeWorkerArtifact` protocol. This section
owns post-publication resolution for MCP/UI/history, not another upload path.
Server publication verifies job, worker, lease, assignment attempt, checksum,
size, content type and storage ref. The published MP4 must be retrievable through
the same media/Library path as Worker App output, with no lane-specific shortcut.

The same parity rule applies to Connector-generated media initiated through
Hermes MCP. Image outputs are accepted only after checksum/size/MIME validation,
successful image decode, and bounded dimension checks. Video outputs are accepted
only after checksum/size/MIME validation and the same `ffprobe` container, codec,
duration, stream, and dimension checks used by the web/manual publication path.
Only after these checks pass may the server publish the artifact, settle billing,
register media history/Library metadata, and mint an ACL-bound download reference.
An MCP response may contain a safe task/artifact envelope or opaque download
reference, never binary bytes, a provider URL, an R2 key, or a presigned URL.

## Tests first

Add focused Vitest tests and Python tenant/history tests for:

- owner/private/team/public/direct/group/role/expired/deleted/cross-tenant/no-
  permission ACL matrix;
- R2 and managed/local sources for image/video/audio/document/archive and
  unknown-but-registered MIME types;
- raw key, external URL, local path, sibling object, altered resource ID and
  client MIME override rejection;
- expiry, replay, source binding, policy mismatch, ACL revocation, Redis outage
  and non-extendable reference;
- correct content type, filename, disposition, size and audio/video Range behavior;
- merged history pagination/deduplication across all UI sources;
- legacy null/wrong-tenant rows denied in Python and MCP;
- published-only Remotion artifacts and Worker App/dedicated parity;
- generated image/video decode and `ffprobe` rejection parity, including partial,
  wrong-MIME, corrupt, oversized, and checksum-mismatch uploads;
- publication, billing, media-history/Library registration and ACL/download
  parity for Connector-generated images/videos versus web/manual generation;
- audit/log snapshots containing no raw key, full URL, secret or prompt.

## Dependencies, rollback and definition of done

Depends on Section 01 and can run in parallel with Sections 02, 03 and 07.
Preserve current internal proxy behavior while the broker is dark. Hide new MCP
download references if broker tests fail; do not delete artifacts or change
legacy ownership during rollback.

Done means every source type passes the ACL matrix, references are opaque and
short-lived, cross-tenant access is denied, legacy rows are safe, and a published
dedicated MP4 downloads through the same path as Worker App output.

## UI/UX Contract

### Target User / JTBD
N/A — server authorization and storage behavior; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is expressed through API/download outcomes and test fixtures.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; API errors remain bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — operational evidence belongs to Section 08.
