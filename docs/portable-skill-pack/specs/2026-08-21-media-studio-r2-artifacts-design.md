# Media Studio R2 Artifact Durability and History Design

## Objective

Make every Media Studio generated image, video, and audio durable in the configured R2 storage instead of depending on an expiring provider URL. Preserve the provider URL as provenance and a controlled fallback, while making R2 the canonical playback URL in Media History.

The change covers newly completed tasks and a resumable backfill for historical completed tasks. It must cover the provider-backed Python task path, deferred retries, MCP tasks, Hermes tasks, and other task projections already merged by `media.listTasks`.

## Existing context

- `media_tasks` stores one provider result URL plus JSON result data and has nullable legacy tenant identity.
- MCP and Hermes use separate task projections and already carry tenant/user ownership in their persistence paths.
- Vertical Drama has an R2 ingest pattern in `verticalDramaMediaAssetService`: download with redirect/SSRF validation, upload through the server storage adapter, register `media_assets`, and return `/api/storage/files/...`.
- `apps/web/server/storage.ts` already provides protected storage reads, ETag/conditional validation, and byte-range support for video.
- Media Studio currently selects `resultUrl` or a nested provider result URL in the client, so the client needs an explicit durable artifact projection rather than URL guessing.

## Design

### 1. Shared artifact ledger

Add a tenant/user-scoped `media_task_artifacts` table linked logically to every task source. The ledger owns the lifecycle contract for a generated output:

- source kind and source task ID
- tenant ID and user ID
- media type and provider/model metadata
- original provider URL
- provider availability state, last checked time, and optional provider error
- R2 media asset ID, storage key, and canonical protected URL
- R2 state: `pending`, `ready`, `failed`, or `missing`
- timestamps and retry metadata

Use a unique key over source kind, source task ID, and output index so multi-output provider responses can be represented without overwriting each other. All reads and writes must include both tenant and user ownership predicates. Missing tenant identity is a quarantine condition for backfill and never falls back to a default tenant.

The existing `media_assets` table remains the canonical object registry and stores the protected R2 URL. The artifact ledger stores provider provenance and task-level durability status, avoiding provider URLs leaking into generic media asset records.

### 2. Durability service and task projection

Create one Node service that:

1. Extracts one or more provider output candidates from a task payload.
2. Resolves an existing ledger row idempotently.
3. For a provider URL, downloads through validated redirects with media-specific size limits and MIME checks.
4. Uploads to R2 using a stable tenant/user/task/output key.
5. Inserts or reconciles `media_assets` with tenant/user ownership.
6. Returns a normalized artifact projection containing `r2Url`, `providerOriginalUrl`, `r2Status`, `providerStatus`, `playbackUrl`, `fallbackUrl`, and explicit status/reason fields.

The unified task polling boundary will invoke this service for completed tasks from every transport. Repeated polling must be idempotent and must not re-download an output whose R2 object and ledger state are already ready. Media History listing will use persisted ledger projections and must not synchronously download every row during a list request.

For a newly completed task, R2 is attempted before returning the completed projection. If storage is temporarily unavailable, the task remains completed with `storage_pending`/`storage_failed` metadata and a controlled provider fallback only when the provider URL has not been confirmed expired. The client must never treat the provider URL as canonical.

### 3. Provider expiry and fallback semantics

Provider status is explicit:

- `unknown`: not checked yet
- `available`: last verification succeeded
- `expired`: provider returned an unavailable/expired result
- `unavailable`: transient provider/network failure, not proof of expiry

The display priority is:

1. ready R2 URL;
2. provider URL only when R2 is pending/failed and provider status is `available` or `unknown`;
3. no playback URL with a clear expired/unavailable state.

When a provider fallback is attempted and returns 403/404 or an equivalent expired response, persist `providerStatus=expired`, preserve the original URL for audit, and show `provider_expired` in Media History. A transient timeout must not mark a URL expired.

### 4. Backfill

Add a resumable, dry-run-capable backfill command that scans completed tasks from all supported sources in bounded batches. For each row it:

- resolves and verifies tenant/user ownership;
- extracts every output URL without logging URLs or query secrets;
- creates/updates the artifact ledger;
- downloads and stores the object in R2 idempotently;
- records success, retryable failure, permanent failure, provider expiry, and missing tenant identity separately.

The command must support `--limit`, `--source`, `--after`, `--before`, `--dry-run`, and a retry-safe cursor/checkpoint. It must never delete provider data or rewrite unrelated task history. Historical rows without a trustworthy tenant ID are reported for manual reconciliation and remain inaccessible through tenant-scoped playback.

### 5. Media History UI

Extend the task response type with a normalized artifact projection. Media History cards and preview/open/download actions use `playbackUrl` and show the storage state. The UI must distinguish:

- R2 ready: normal playback/download;
- saving to R2: non-blocking progress state and retry/reload affordance;
- provider fallback: warning that the provider URL is temporary;
- provider expired: explicit “Provider link expired; this media cannot be viewed” state;
- R2 missing: storage error state with no silent provider substitution after expiry.

The original provider URL is not rendered as the main media source and is not copied into generic DOM attributes. If an audit/details action is added, it must be server-authorized and should expose only redacted metadata or a controlled link with the same tenant/user boundary.

### 6. Cache and serving contract

Continue serving R2 objects through the authorized `/api/storage/files/...` route. Authorization must happen before metadata validation or cache response. Use private browser caching with revalidation (`ETag`, `If-None-Match`, `Last-Modified`) and preserve Range requests for video. Do not use shared public caching for tenant-private media and do not replace protected URLs with permanent public provider URLs.

## Failure handling

- Provider download failure: keep the original URL and record retryable/unavailable status; do not expose provider error details or secrets.
- Provider expiry: record `expired` and do not retry paid generation automatically.
- R2 upload failure: leave a pending/failed ledger row for retry and keep Media History truthful.
- R2 object missing after ready: mark the R2 state `missing`, keep provider provenance, and surface the storage incident state.
- Database race: use unique constraints and re-read existing rows after conflict; never create duplicate assets for the same output.
- Missing tenant/user context: fail closed for new work and quarantine legacy backfill rows.

## Verification

Focused tests must cover artifact extraction, MIME/size/redirect safety, tenant/user isolation, idempotent ingest, provider expiry classification, list projection, all transport adapters, and Media History status rendering. Run changed-file TypeScript checks, focused Vitest suites, Python tests for any changed Python boundary, migration validation, `git diff --check`, and a cache/range route proof. Live R2/provider, authenticated browser, migration-on-target-DB, and deployment proof must be reported separately if unavailable.

## Non-goals

- Making provider URLs permanent or public.
- Deleting provider URLs from audit history.
- Changing unrelated Chat, Library, or Vertical Drama contracts except where they consume the shared durable artifact projection.
- Automatically regenerating media when both R2 and the provider result are unavailable.
