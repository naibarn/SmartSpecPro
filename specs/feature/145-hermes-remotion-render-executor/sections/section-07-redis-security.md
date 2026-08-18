# Section 07 — Redis, Resilience, Observability, and Security Hardening

## Outcome

This section hardens the ephemeral coordination and security boundaries used by
Feature 145 before the dedicated Remotion executor can be enabled for any tenant.
It does not create another Redis abstraction, move durable worker jobs into Redis,
or make Redis the source of truth for ownership, billing, media, artifacts, or
terminal job state. It standardizes the existing split clients, introduces a
versioned key-policy registry, removes unsafe multi-instance fallbacks from the
paths touched by this feature, adds distributed abuse controls and operational
signals, and proves the MCP, worker, storage, and executor boundaries against the
threat model below.

The resulting invariant is:

> PostgreSQL and object storage remain authoritative. Redis may accelerate or
> coordinate a bounded operation, but losing Redis must never grant access,
> duplicate a paid operation, expose a secret, revive a stale lease, or redefine
> a durable terminal state.

This is a prose implementation section. It deliberately defines interfaces,
failure behavior, test-first work, and acceptance evidence without providing full
function implementations.

## Dependencies, sequencing, and ownership

This section depends on Section 01 having established the `remotion_executor`
runtime identity, typed feature flag, scope vocabulary, and shared contract names.
It also depends on the existing split Redis topology in
`apps/web/server/services/redisClients.ts`.

It may be implemented in parallel with Sections 02, 03, and 05 after their shared
interfaces are agreed, with the following hunk-level ownership boundaries:

- Section 02 owns worker target resolution, claim admission, lease transitions,
  artifact assignment checks, and the durable job state machine.
- Section 03 owns MCP tool schemas, catalog visibility, scope mapping, and calls
  into server services.
- Section 04 owns executor-local process isolation, credential adapters, HTTP
  retry behavior, and sanitized client logs.
- Section 05 owns canonical Library, media-history, R2, render-input, and artifact
  ACL resolution plus byte streaming.
- This section owns Redis client selection, key construction and value bounds,
  Redis-dependent failure policy, distributed rate-limit policy, security
  telemetry, and cross-boundary negative tests. Where a file is shared, this
  section changes only those concerns.

Section 08 is blocked until every mandatory test and operational gate in this
section passes. A missing metric, an unbounded key, a production in-memory
fallback, or an unresolved critical threat is a release blocker, not a follow-up.

## Current-state gaps that must be closed

The implementation starts from the following verified codebase state:

- `apps/web/server/services/redisClients.ts` already exposes
  `getCacheClient()` for short-lived cache/security state and
  `getRealtimeClient()` for connection-oriented pub/sub, concurrency, and queue
  state. This is the target topology.
- `apps/web/server/services/redis.ts` is the older general singleton. Existing
  unrelated BullMQ and legacy services may continue using it until their own
  migration, but new Feature 145 code must not import it.
- `apps/web/server/_core/mcpPublicServer.ts` now stores MCP sessions and
  MCP response-idempotency entries through `getCacheClient()` with a validated
  30-minute default session TTL and no process-local security fallback.
- `apps/web/server/routes/workerRuntime.ts` now stores worker-connect records
  through the cache client and bounded registry, has no process-local fallback,
  separates pending/approved TTLs, and issues bearer tokens only at device
  redemption; no token bundle is serialized in Redis.
- `apps/web/server/services/workerAuthService.ts` correctly uses
  `getCacheClient()` for proof nonces, but the distributed 60-second refresh
  grace currently serializes execution, upload, and refresh tokens. The grace
  behavior must be preserved without putting bearer tokens in Redis.
- `apps/web/server/services/mcpDownloadBrokerService.ts` issues a five-minute
  signed reference plus a bounded cache-backed active grant and rechecks the
  source ACL at redemption. Missing cache state or cache outage denies access.
- `apps/web/server/_core/limits.ts` and most of
  `apps/web/server/services/rateLimiter.ts` are process-local maps. They are not
  sufficient as the production abuse boundary for multi-instance MCP submit,
  download, connect, claim, or artifact endpoints.
- `apps/web/server/middleware/distributedRateLimit.ts` already uses the cache
  client and fails closed, but it currently maps a Redis outage to a normal
  `429`. Feature 145 must distinguish an unavailable enforcement backend (`503`)
  from a caller who exceeded a valid limit (`429`).

These are focused Feature 145 changes. This workstream does not perform a broad
repository-wide conversion of every `getRedisClient()` caller.

## Files and symbols in scope

The implementer must verify the current symbols before editing and keep changes
focused to these files or their direct test fixtures:

- Modify `apps/web/server/services/redisClients.ts` only as needed to expose
  health/status instrumentation and injectable test seams for the existing cache
  and realtime clients. Do not add a third singleton or silently alter BullMQ's
  required `maxRetriesPerRequest: null` behavior.
- Add `apps/web/server/services/redisEphemeralKeyRegistry.ts` as a pure policy and
  key-construction module. It may validate namespaces, hash untrusted key parts,
  bound serialization, declare TTLs, and attach low-cardinality telemetry. It
  must receive an existing Redis client; it must not create or own a connection.
- Modify `apps/web/server/_core/mcpPublicServer.ts` to use `getCacheClient()`, the
  key registry, bounded session/idempotency envelopes, atomic idempotency
  coordination, and typed Redis-unavailable errors.
- Modify `apps/web/server/routes/workerRuntime.ts` to use the cache client and key
  registry for connect state, remove production in-memory fallback, shorten and
  separate pending versus approved handoff lifetimes, and ensure bearer token
  material is issued at redemption rather than serialized into Redis.
- Modify `apps/web/server/services/workerAuthService.ts` so proof nonce and refresh
  rotation state conform to the registry. Replace the token-bearing distributed
  refresh-grace value with a deterministic, non-secret rotation receipt.
- Modify `apps/web/server/services/mcpDownloadBrokerService.ts` only for active
  download-grant state, bounded redemption, and Redis-dependent revocation. ACL,
  source resolution, storage streaming, and Range semantics remain owned by
  Section 05.
- Modify `apps/web/server/middleware/distributedRateLimit.ts` to provide atomic,
  namespaced, actor-aware limits and distinct `429` versus `503` behavior.
- Modify `apps/web/server/_core/limits.ts` and
  `apps/web/server/services/rateLimiter.ts` only at Feature 145 call sites or by
  adding a compatibility adapter. Unrelated process-local limiters remain out of
  scope, but no internet-facing Feature 145 security boundary may rely on them.
- Extend the existing audit/metrics integration used by the web service. If the
  repository's metric helper is not centralized, add a small instrumentation
  adapter beside the key registry rather than embedding vendor-specific calls in
  every handler.
- Add or extend the focused Vitest files listed in the TDD section. Security tests
  for `apps/remotion-executor` are added when Section 04 creates that package, but
  the required cases and fixture contract are defined here.

No schema migration is required for ordinary Redis keys. If implementation
discovers that deterministic refresh receipts cannot be generated from existing
claims and signing primitives without weakening token rotation, stop that subtask
and add a narrowly scoped PostgreSQL rotation-receipt migration; do not revert to
storing token bundles in Redis. Such a migration must be reviewed as a change to
Section 01's migration order before merge.

## Redis client topology

### Cache client

All new or migrated Feature 145 ephemeral state uses `getCacheClient()`:

- MCP sessions and response-idempotency coordination;
- worker connect/device-code state;
- device-proof nonce consumption;
- refresh-rotation receipts;
- active MCP download grants;
- distributed request-rate and concurrency limits;
- bounded deduplication and short-lived progress hints, only when an owning
  durable service explicitly requires them.

The cache client is allowed to fail a request quickly after its configured bounded
retries. Security-sensitive callers translate this failure into a typed transient
service error and do not continue the protected action.

### Realtime client

`getRealtimeClient()` remains reserved for pub/sub, distributed concurrency, and
the established queue adapters that require a persistent IORedis connection. A
Feature 145 service must not use the realtime client merely to avoid cache-client
limits. BullMQ-owned keys are created and retired through BullMQ configuration;
application code must not manufacture or delete BullMQ internals directly.

The dedicated executor uses authenticated HTTP polling against durable worker job
rows. It does not require a new Redis queue merely because it runs outside the
Worker App. If a later queue adapter is proven necessary, its exact owner,
`removeOnComplete`, `removeOnFail`, lock duration, and reconciliation behavior must
be added to this registry and reviewed before use.

### Legacy client

`apps/web/server/services/redis.ts` remains a compatibility boundary for untouched
legacy modules only. Feature 145 imports of `getRedisClient()` are prohibited by a
focused static assertion. This section does not claim that the whole repository
has migrated away from the legacy singleton.

### Durable-state boundary

Redis must never contain media bytes, artifact bodies, full prompts, raw provider
responses, provider credentials, worker private keys, worker refresh/access/upload
tokens, database credentials, R2 keys, complete presigned URLs, arbitrary local
paths, or the only copy of ownership/billing/terminal state. The following remain
authoritative:

- PostgreSQL: worker jobs, immutable target, lease/assignment state, task state,
  ownership, ACLs, billing reservation/settlement, artifact metadata, audit, and
  terminal reconciliation.
- R2/S3 or the established managed storage service: image, audio, video, document,
  archive, render output, and other media bytes.
- OS credential stores on the executor: device private key and worker refresh
  credential.

Any Redis progress or readiness value is a hint. Missing, expired, or corrupt hints
must cause a durable read or an unavailable response; they must not invent a job
state.

## Versioned key-policy registry

`redisEphemeralKeyRegistry.ts` is metadata and validation, not a connection layer.
Each family declares a stable logical name, a versioned namespace, owning service,
client class, TTL, maximum serialized bytes, key-part normalization, value schema,
atomic operation, redaction class, and outage behavior. Untrusted identifiers are
validated and then hashed before becoming key components. Raw bearer tokens,
device codes, user codes, prompts, URLs, filenames, and storage references never
appear in Redis key names or telemetry.

Use a deployment-stable prefix such as `ssp:f145:v1`. Environment names may be
added ahead of that prefix by existing infrastructure, but tenant input cannot
control the prefix. The exact constant is shared by tests so accidental namespace
changes are detected.

| Key family and pattern | Client and owner | Value and maximum | TTL | Required atomic behavior | Missing, corrupt, or backend-down behavior |
|---|---|---|---:|---|---|
| `ssp:f145:v1:mcp:session:{sessionHash}` | Cache; `mcpPublicServer` | Versioned, schema-validated MCP identity/scope envelope only; 16 KiB | 1,800 seconds sliding, hard lifetime capped by the authenticated credential/session expiry | Create with `SET ... NX EX`; refresh expiry only after successful parse and auth-context checks | Missing/expired is an invalid MCP session; malformed value is deleted and denied; Redis error is `503 mcp_session_store_unavailable`, never anonymous fallback |
| `ssp:f145:v1:mcp:pairing:{pairingHash}` | Cache; `hermesAgentPairingService` | Pending device/PKCE challenge, tenant/user/device-key hashes, requested/approved scope hashes, consent ID and state only; no access/refresh token, code, URL, or secret; 8 KiB | Pending: 900 seconds; redeemed tombstone: 120 seconds | `SET ... NX EX` plus one-time compare-and-set redemption; scope/device/tenant binding is checked before issuing the session | Missing, replayed, mismatched, malformed, or Redis-down pairing is denied with a typed `503`/expired projection; no in-memory or browser-cookie fallback |
| `ssp:f145:v1:mcp:idem:lock:{scopeHash}` | Cache; `mcpPublicServer` | Random operation owner ID and start time; 256 bytes | 60 seconds | `SET ... NX EX`; owner-checked release; no blind `DEL` | A mutating tool fails before side effects when the lock backend is unavailable; an existing durable operation is looked up before retry |
| `ssp:f145:v1:mcp:idem:result:{scopeHash}` | Cache; `mcpPublicServer` | Sanitized MCP response envelope, never raw provider output; 100 KiB, matching the public result ceiling | 1,800 seconds | Result write occurs only after durable service success and is bound to tenant, user, tool, normalized request hash, and idempotency-key hash | Missing falls through to the owning durable idempotency lookup; corrupt/mismatched values are deleted and denied; no duplicate provider/job/charge is created |
| `ssp:f145:v1:worker:connect:device:{deviceHash}` | Cache; `workerRuntime` | Pending or approved metadata, public worker summary, tenant/user approval IDs, stable handoff ID, timestamps, and status; no token bundle; 16 KiB | Pending: 900 seconds. Approved/redeemed handoff: 120 seconds | State transition uses compare-and-set or Lua/MULTI transaction; concurrent/retried redemption converges on one stable token lineage and never creates a second registration or token family | Production Redis failure returns `503 worker_connect_store_unavailable`; no in-memory fallback; expired codes return the existing indistinguishable not-found/expired projection |
| `ssp:f145:v1:worker:connect:user:{userCodeHash}` | Cache; `workerRuntime` | Device-record hash/reference only; 256 bytes | Same remaining TTL as the device record | Device and user indexes are created/transitioned/deleted atomically | Orphan index is deleted; it never authorizes approval by itself |
| `ssp:f145:v1:worker:proof:nonce:{nonceHash}` | Cache; `workerAuthService` | Constant marker and protocol version; 64 bytes | 300 seconds and never longer than accepted clock skew | `SET ... NX EX` is the replay decision across replicas | Non-`OK`, timeout, reconnect, or write error fails with `503 worker_proof_unavailable`; replay returns the existing auth failure and may block the connection |
| `ssp:f145:v1:worker:refresh:receipt:{presentedJtiHash}` | Cache; `workerAuthService` | Non-secret rotation receipt containing stable rotation ID, original rotation timestamp, token-family version, and derived replacement-JTI hashes; 1 KiB | 60 seconds, fixed and never sliding | First writer uses `SET ... NX EX`; racers read the winner and derive the same replacement claims | Redis must be available before revoking the presented token or issuing replacements. Missing after confirmed rotation fails closed and requires controlled reconnect; it never issues a second random token chain |
| `ssp:f145:v1:mcp:download:grant:{grantHash}` | Cache; `mcpDownloadBrokerService` | Versioned active-grant metadata: tenant/user hashes, resource type and opaque resource ID, scope/policy version, created/expiry timestamps; no storage key or URL; 2 KiB | 300 seconds, fixed and never extendable | Mint with `SET ... NX EX`; redemption validates the signed/opaque ref and active record, then re-runs ACL; bounded Range requests may reuse the grant until expiry | Missing, expired, revoked, malformed, or Redis-down redemption is denied. Backend outage is a typed `503`; ownership/ACL denial remains indistinguishable to the caller |
| `ssp:f145:v1:limit:{policy}:{actorHash}` | Cache; distributed limiter | Sorted-set timestamps or an equivalent bounded token-bucket state; cardinality is capped by TTL and actor policy | Window plus at most 60 seconds | One server-owned Lua script or transactional operation performs prune/count/add/expire atomically | A real limit returns `429` and `Retry-After`; backend failure returns `503 rate_limit_backend_unavailable`; no request is admitted by local fallback |
| `ssp:f145:v1:concurrency:{policy}:{actorHash}` | Cache unless an established realtime adapter owns the operation | Lease owner hash/count only; 1 KiB | At most the operation timeout plus 60 seconds | Acquire/renew/release must be owner checked; release cannot delete another owner's lease | Unavailable coordination denies new expensive work; durable job state remains queued/reconcilable |
| `ssp:f145:v1:progress:{jobHash}` | Cache; optional projection only | Sanitized stage, percent, and updated-at; 4 KiB | 900 seconds or the owning job's shorter UI hint TTL | Last-write is assignment-attempt aware | Missing/corrupt value triggers PostgreSQL status read; it never marks completion or failure |

The registry rejects a write before calling Redis when the serialized value exceeds
its declared maximum or contains a forbidden field name/value class. The check is
defense in depth, not a replacement for constructing narrow schemas. Key TTL is
set in the same atomic operation as the value; a later `EXPIRE` call is not an
acceptable create path because a process crash could leave an immortal key.

### MCP session migration

MCP sessions move from `mcp:session:{uuid}` to the versioned hashed namespace and
from the current 15-minute default to a validated 30-minute sliding TTL. The hard
session lifetime cannot exceed the browser session, API key, delegated worker
session, or bearer credential that created it. Configuration parsing rejects NaN,
zero, negative, or excessive values and caps the supported override.

Deploy one compatibility release that writes only the new format, reads the new
format first, and may read a valid legacy record only after applying the new schema,
size, identity, and credential-expiry checks. Delete closes both names. Remove the
legacy read after the maximum legacy session TTL has passed. Never dual-write a
new session to the old namespace.

### Worker connect token handoff

The current serialized connect record contains `session.result.tokens` and lives
for up to seven days. Replace that model with two bounded phases:

1. A pending record lives for 15 minutes and contains only the registration
   request and approval status.
2. Approval persists the durable worker registration and a non-secret approved
   handoff marker. The `/api/workers/connect/token` redemption atomically changes
   that marker to `redeemed` and derives one stable token lineage from the handoff
   ID, worker/device/runtime binding, and original approval timestamp. If a
   response is lost or two replicas race, a retry inside the two-minute handoff
   window returns the same claims/JTIs with the same anchored expiry; it never
   creates a second registration or extends token lifetime. The token set is
   issued directly in the HTTPS response and is never written to Redis, logs,
   audit metadata, or the browser approval response. The approved/redeemed marker
   expires after two minutes.

Existing clients already receive `expiresIn` and polling interval fields; focused
Worker App compatibility tests must prove they correctly restart pairing after
expiry. A legacy seven-day record is accepted during migration only if its
`createdAt` is inside the new pending/approved lifetime. Any embedded legacy token
bundle is ignored and removed on rewrite; it is never returned after the new code
is deployed.

### Refresh rotation without token storage

Preserve the 60-second retry grace but store only a rotation receipt. On the first
successful refresh, derive stable replacement JTIs from a server-side keyed
function over the presented refresh JTI, worker connection, token use, and rotation
ID. Anchor `issuedAt` and expiry to the receipt's original rotation timestamp.
Every replica that validates the same device proof and reads the same receipt can
reissue semantically identical replacement claims without extending their life or
creating a second token lineage. The actual JWT strings, private signing material,
and refresh/execution/upload tokens never enter Redis.

Use a purpose-separated derivation key and version label so token-signing key
rotation does not create ambiguous receipt semantics. The receipt is written
before the old JTI is irrevocably consumed. If receipt
creation fails, return a typed transient error and leave the old token usable for a
bounded retry. If later signing fails, do not mark the rotation complete. A replay
outside 60 seconds remains rejected. A replay from a different device, worker,
tenant, runtime, or token plane is rejected even inside the grace window.

This replaces both the distributed token-bearing value and the production use of
the process-local refresh-grace map. A memory adapter may exist only as an injected
unit-test fake; `NODE_ENV` alone must not silently select a weaker production code
path.

### Eviction safety

Security nonce and rate-limit correctness cannot be guaranteed if Redis silently
evicts live security keys. Production readiness therefore verifies that the cache
service uses a no-eviction policy or an equivalent managed-service guarantee for
this keyspace, has adequate memory headroom, and rejects writes instead of
discarding live keys. If configuration cannot be inspected directly, deployment
must provide an explicit attestation/health signal and alert on memory pressure or
eviction counters.

An observed eviction, out-of-memory write rejection, or loss of the security
keyspace opens a cache-security circuit breaker. While open, new MCP sessions,
mutating MCP calls, worker connect/refresh/proof, download redemption, and
expensive submissions fail closed. Durable status/reconciliation APIs may remain
available only when their authentication does not depend on the unavailable MCP
session. The breaker closes only after Redis readiness and a controlled probe
succeed; it does not infer safety from a single reconnect event.

## Outage and degradation behavior

All Redis errors are classified by operation and key family. Callers receive a
stable public code and retry guidance, while logs and metrics retain only the
client class, operation, key family, latency, and sanitized error class. Raw Redis
URLs, key values, identifiers, tokens, and stack traces are not returned.

| Operation during cache outage or timeout | Required behavior | Durable recovery |
|---|---|---|
| MCP initialize/session load/delete | Initialize/load returns typed `503`; delete may return success only after recording that local cleanup did not prove server-side deletion | Client retries initialization after readiness; no anonymous or header-derived session is created |
| Read-only MCP tool call with an already required Redis session | Fail closed because identity cannot be reconstructed safely | The equivalent authenticated REST/UI status path may continue if independently authorized |
| Mutating MCP submit/cancel/generate | Fail before provider call, credit reservation, or job insertion when session, idempotency lock, or rate enforcement is unavailable | Retry with the same idempotency key; durable service lookup returns the existing operation if one was already committed |
| Worker connect start/status/approve/token | Return typed `503` for backend failure; return not-found/expired only for a confirmed missing record | Restart the short connect flow; do not reconstruct approval from caller fields |
| Worker proof nonce consume | Return `503 worker_proof_unavailable`; do not call claim, heartbeat, event, artifact, or refresh service | Executor performs bounded jittered retry while respecting lease expiry; stale assignment is reconciled from PostgreSQL |
| Worker refresh receipt | Fail before rotation when Redis is unavailable | Retry the same refresh and device proof; do not issue another random replacement chain |
| Download grant mint/redeem | Deny with typed transient error; never bypass active-grant or ACL recheck | Caller requests/redeems again after recovery; the five-minute grant is not extended |
| Distributed rate/concurrency check | Return `503`, not `429`, so operators can distinguish outage from abuse | Caller uses `Retry-After`; no process-local unlimited fallback |
| Optional progress hint | Ignore the hint and read PostgreSQL | Durable job and artifact rows determine status |
| Realtime/BullMQ client unavailable | Queue readiness is unhealthy and new queue-dependent work is not accepted | Existing queue reconciliation follows the owning queue contract; dedicated HTTP worker jobs remain governed by PostgreSQL |

Redis reconnect does not automatically retry a non-idempotent operation inside the
request handler. The client or owning service retries with the same idempotency and
assignment identity. Retry budgets are bounded and use jitter so a cache recovery
does not trigger a thundering herd.

## Distributed rate limits and backpressure

Feature 145 must use the existing distributed limiter foundation, upgraded to an
atomic operation. `ZREMRANGEBYSCORE`, count, add, and expiry cannot remain separate
commands because concurrent replicas can exceed the intended limit. Use one
server-owned Lua script loaded by hash or an equivalent transaction supported by
the configured cache service. Script input consists only of validated numeric
limits and server-generated keys; clients cannot supply script text or Redis key
fragments.

Final numeric limits remain configuration with conservative bounded defaults and
hard caps. The first implementation must define at least these independent policy
families:

| Policy | Primary key | Initial default | Additional backpressure |
|---|---|---:|---|
| MCP initialize and read catalog/status | IP hash before auth, then tenant/user/auth-mode hash | 60 requests/minute | Body and batch caps remain enforced before expensive parsing |
| MCP image/video submit | Tenant/user/tool hash | 10 requests/minute and existing credit/model limits | Required idempotency and existing per-user/per-connection queue or quota controls |
| MCP Remotion submit | User/tool hash plus a separate tenant/tool hash | 6 requests/minute per user and 30 requests/minute per tenant | Required idempotency, scheduler admission, and per-tenant active-render concurrency cap |
| MCP media/Remotion cancel | Tenant/user/tool hash | 20 requests/minute | Owner/scope/terminal-state check still runs; cancellation cannot be used as an existence oracle |
| MCP connection disconnect | Tenant/user/connection hash | 10 requests/hour | Existing durable disconnect idempotency and owner/admin policy remain authoritative |
| MCP download-reference mint | Tenant/user/resource-family hash | 60 requests/minute | Maximum references per response/request and five-minute fixed expiry |
| MCP download redemption | Tenant/user/grant hash plus trusted request IP hash | 120 requests/minute | Concurrent-stream cap, bounded Range count/size, server streaming limits, and connection abort cleanup |
| Worker connect start | Trusted request IP hash and runtime family | 10 requests/hour | One active pending code per device identity; repeated failures receive increasing bounded delay |
| Worker connect status/token | Device/user-code hash and trusted request IP hash | 60 requests/minute | Poll interval enforcement; one approved handoff yields one stable token lineage across bounded retries |
| Worker registration/refresh | Tenant/worker/device hash | 10 requests/minute | Device proof, token use, runtime binding, and rotation receipt are mandatory |
| Worker claim | Tenant/worker/runtime hash | 60 requests/minute | Server-advertised empty-queue backoff and per-worker concurrency declaration |
| Worker heartbeat | Tenant/worker hash | 120 requests/minute | Coalesce redundant heartbeats; do not extend a stale/mismatched lease |
| Worker events | Tenant/worker/job hash | 240 requests/minute | Assignment-aware progress throttling and maximum event body size |
| Artifact init/complete | Tenant/worker/job hash | 120 requests/minute | Upload-token plane, assignment, checksum, size, MIME, and object binding |

The implementation may tune defaults after load evidence, but it must not combine
MCP submit/download limits with worker heartbeat/artifact limits. Expensive actions
also enforce durable quota/credit/concurrency rules; Redis rate limiting is not the
billing authority. Internal-service bypasses require an authenticated service
identity and audit event, not a caller-controlled header or `res.locals` value.

Rate-limit responses include a stable code, `Retry-After`, limit, and remaining
headers when known. Metrics distinguish `allowed`, `limited`, and
`backend_unavailable`. User ID, tenant ID, IP, token hash, job ID, and grant ID are
not metric labels.

## Observability and operational controls

### Metrics

Instrument the following low-cardinality signals through the repository's
existing metric/monitoring path. Names may be adapted to the established naming
convention, but dimensions and semantics must remain equivalent:

- Redis command duration histogram by `client=cache|realtime`, operation family,
  key family, and outcome;
- Redis connection/reconnect/error counters by client and sanitized error class;
- ephemeral write-rejection counters by key family and reason (`oversize`,
  `forbidden_field`, `serialization`, `backend`, `circuit_open`);
- key expiry/miss/corrupt-value counters by family, without recording key names;
- security circuit-breaker state and transitions;
- rate-limit allowed/limited/backend-unavailable counters by policy;
- MCP authorization denial, idempotency replay hit/conflict, and tool timeout;
- worker proof replay/backend failure, refresh receipt conflict, connect expiry,
  claim conflict, stale assignment, and lease expiry;
- artifact init/upload/complete retry and checksum/size rejection;
- download grant mint/redeem/revoked/expired/range-denied outcomes;
- queue backlog and oldest queued-job age from the durable worker-job source;
- executor ready count, active count, and capacity by approved platform/runtime
  profile, with no machine fingerprint or worker ID labels.

Do not run `KEYS` or an unbounded `SCAN` in request paths. Cardinality and memory
telemetry comes from Redis/service metrics or a bounded background sampler. The
key registry makes expected cardinality calculable from active sessions, workers,
downloads, and rate-limit actors.

### Structured logs and audit

Operational logs use correlation/request IDs and low-cardinality outcome fields.
Security audit events may include actor ID, tenant ID, connection ID, job ID,
worker ID, runtime type, executor ID, tool name, operation, idempotency-key hash,
auth mode, policy version, and outcome because these are required for
investigation. They must not include:

- raw idempotency keys, device codes, user codes, nonces, tokens, private/public
  key bodies, machine fingerprints, or Redis keys;
- prompts, provider responses, provider credentials, local workspace/profile
  paths, R2 keys, storage credentials, signed URLs, or URL query strings;
- serialized Redis values or unredacted exception objects.

Use a single redaction/snapshot test fixture across MCP, worker, storage, and
executor logs. URLs are logged as origin plus approved route class only; query and
fragment are removed. Hashes intended for correlation use a server-keyed hash or a
fixed-length one-way digest and are never accepted as authorization.

### Alerts and readiness

The initial operational gate should alert on sustained cache/realtime command
errors, reconnect loops, security circuit opening, eviction or memory-pressure
signals, rate-limit backend unavailability, growth beyond expected key
cardinality, oldest queued-job age, proof failures, lease expiry, duplicate
idempotency conflicts, and artifact/upload failure ratios.

Readiness is false when the cache security backend cannot safely perform nonce,
session, rate-limit, and grant operations. Queue readiness is reported separately
from cache readiness so an Upstash/cache incident is not mislabeled as a Remotion
browser/FFmpeg failure, and a realtime/BullMQ incident is not mislabeled as a
provider quota problem. Health endpoints expose status and sanitized reason, not
Redis URLs or credentials.

## Threat model and required controls

Every threat below needs both a preventive control and automated evidence. A test
owned by another section still appears in this gate and must be green before
Section 08 rollout.

| Threat | Boundary and attack | Required control | Required proof |
|---|---|---|---|
| Anonymous or header-derived MCP identity | Caller invents tenant/user headers or reaches a static fallback | Production `/v1/mcp` requires verified session/API-key/delegated auth; session context is schema validated and bound to credential expiry | Anonymous, forged-header, expired, revoked, and missing-context tests fail before tool/provider/job calls |
| MCP tool injection or arbitrary execution | Prompt/arguments guess hidden tools, command names, URLs, paths, provider methods, or extra JSON fields | Strict schemas reject unknown fields; catalog and executor dispatch use server-owned enums/services only; no shell or CLI passthrough | Unknown tool/field/operation, command string, path, URL, and provider-method tests have zero side effects |
| Scope escalation and token-plane confusion | User/MCP token calls worker route, upload token claims work, execution token completes artifact, or old broad scope gains new power | Audience, token-use, runtime, worker, tenant, role, scope, lease, and assignment checks at every service boundary | Full cross-product negative matrix across MCP, registration, execution, upload, refresh, download, and delegated tokens |
| Replay | Reuse of worker proof, refresh token, connect handoff, MCP idempotency key, or download grant | Atomic nonce consumption, deterministic refresh receipt, idempotent bounded connect handoff with one token lineage, request-hash-bound idempotency, active download grant, bounded TTL | Same-replica and cross-replica race tests; replay outside/inside windows; changed-body same-key conflict |
| Stale lease or assignment | Old executor reports progress/completion or uploads over a newer attempt | PostgreSQL lease/attempt remains authoritative; Redis hint includes attempt but cannot authorize; server rejects stale events and artifact calls | Expired lease, changed assignment, late success, duplicate complete, cancellation race, and worker-loss tests |
| Cross-tenant or owner spoofing | Caller supplies another tenant, user, connection, task, job, library ID, resource ID, or R2-like key | Identity comes from auth; canonical ACL rechecks every object; Redis values are not ownership truth; denial is indistinguishable | Tenant/user/team/role matrix for list/get/download/submit/status/cancel/artifact and legacy unscoped rows |
| SSRF and external URL smuggling | MCP input or job payload points executor/server at arbitrary HTTP, metadata, localhost, or redirect target | Only server-owned asset refs; approved HTTPS origin/path policy; no arbitrary URL input; redirect revalidation; localhost only in explicit dev mode | IPv4/IPv6 loopback, link-local, private ranges, DNS rebinding fixture, redirect, userinfo, mixed-case scheme, and encoded-host rejection |
| Path traversal and symlink escape | Pack, profile, workspace, filename, or asset extraction escapes its root | Canonical realpath containment, no shell interpolation, archive entry validation, symlink rejection, separate roots and restrictive permissions | `..`, absolute/UNC/device paths, alternate separators, case-folding, symlink/junction, archive traversal, and deletion-boundary tests on Windows/macOS fixtures |
| Child-process injection | Composition/job fields alter executable, flags, environment, or shell syntax | Fixed executable and argv arrays, environment allowlist, strict shared schema, no `cmd.exe`/PowerShell/shell mode | Metacharacter, quote, newline, option-prefix, environment, executable-path, and arbitrary-module tests never spawn an unapproved command |
| Presigned URL or credential leakage | URL/token appears in MCP, logs, audit, errors, process args, Redis, or diagnostics | Exact-use URL remains executor memory only; query redaction; secret-field denylist; no token-bearing Redis values | Snapshot scan over success/error/retry paths plus Redis-write spy forbids token/URL/credential patterns |
| R2/storage-key guessing | Caller submits raw object key or modifies reference | Opaque active grant plus signed claims, canonical ACL at mint and redemption, exact object binding, no raw-key API authorization | Guessed/prefix/sibling key, altered resource ID, expired/revoked grant, ACL change, and Range abuse tests |
| Redis key injection or poisoning | User input changes namespace/collides with another tenant, or corrupt JSON grants authority | Validate then hash key parts; versioned schemas and request hashes; bounded parse; corrupt security values fail closed and are deleted | Colon/slash/null/unicode/oversize/collision inputs and malformed/wrong-version/wrong-tenant values |
| Redis outage or eviction bypass | Attacker times requests during outage or causes memory pressure to lose nonce/rate-limit state | No-eviction readiness contract, circuit breaker, typed fail-closed behavior, bounded retry, no production memory fallback | Unavailable, timeout, reconnecting, OOM, eviction signal, partial transaction, and recovery-probe tests |
| Rate-limit bypass and resource exhaustion | Multi-IP/token/NAT manipulation, parallel replicas, huge batches/ranges, claim/heartbeat floods | Trusted-proxy policy, authenticated actor keys, atomic distributed limiter, body/result/range/concurrency/disk/time caps | Parallel-replica race, spoofed forwarding header, shared NAT, large body/batch/range, slow stream, and retry-storm tests |
| Capability or readiness spoofing | Executor advertises unsupported browser/FFmpeg/codec/contract or worker selects its own target | Server validates signed pack/runtime contract and immutable target; readiness is not stored as authoritative Redis state | Wrong runtime/platform/arch/version/capability, stale readiness, disabled flag, and kill-switch tests |
| Audit/log injection | Attacker puts newline/control data or secrets into names/errors | Structured fields, length bounds, control-character normalization, central redaction | Newline/control/unicode and secret-canary snapshots remain parseable and redacted |

Security denials occur before provider invocation, job insertion, credit
reservation, worker mutation, storage access, or process spawn. Tests must assert
the absence of those side effects, not only the returned status code.

## Test-first implementation plan

Use Vitest and the repository's existing service/route test conventions. Write the
failing tests first, prove each fails for the intended reason, implement the
smallest behavior, then refactor under green tests. Fake Redis must model TTL,
`NX`, atomic scripts/transactions, reconnect/error states, and value-size checks;
a plain object map is insufficient for outage/race acceptance.

### Phase A — key registry and split-client contract

Add `apps/web/server/services/__tests__/redisEphemeralKeyRegistry.test.ts` with
test stubs equivalent to:

- rejects raw, empty, overlong, delimiter-bearing, null-byte, and Unicode-confusable
  key components before hashing;
- produces deterministic versioned keys without exposing tenant/user/token/code
  input;
- sets value and TTL atomically for every family;
- rejects values above each declared byte maximum;
- rejects forbidden media, prompt, credential, token, storage-key, signed-URL,
  and local-path fields;
- validates values on read and fails closed for corrupt/wrong-version/wrong-scope
  records;
- records only low-cardinality metrics and redacted errors;
- proves no Feature 145 module imports `services/redis` or constructs an
  unregistered key prefix.

Extend `apps/web/server/services/__tests__/redisClients.test.ts` with test stubs
for independent cache/realtime configuration, bounded cache retries, BullMQ-safe
realtime options, health/reconnect state, graceful close, and sanitized connection
errors. The test must prove that one client's failure is reported independently
and does not silently route its workload through the other client.

### Phase B — MCP session and idempotency

Extend `apps/web/server/_core/__tests__/mcpPublicServer.test.ts` and
`mcpPublicServerSecurity.test.ts` with failing stubs for:

- 30-minute bounded sliding session TTL and credential-expiry hard cap;
- new versioned hashed session key, new-write/legacy-read migration, and dual-name
  delete;
- no anonymous/header/static fallback when Redis create/load is unavailable;
- malformed, oversize, wrong-tenant, wrong-user, wrong-auth-mode, and wrong-version
  session denial;
- atomic idempotency lock under parallel requests from separate server fixtures;
- same key and same normalized request returning the same durable operation;
- same key and changed body/tool/tenant/user returning a conflict;
- Redis failure before mutating tool side effects and safe durable lookup after a
  result-cache miss;
- result-envelope byte cap and absence of prompts, provider output, credentials,
  raw URLs, local paths, and signed URLs;
- one-time Connector pairing with device/PKCE/tenant/user binding, exact scope
  approval, replay rejection, refresh rotation, revocation, and no token-bearing
  Redis value;
- distinct `429` rate-limit and `503` enforcement-backend responses with
  `Retry-After`.

### Phase C — worker connect, proof, refresh, and endpoint limits

Extend `apps/web/server/services/__tests__/workerAuthService.test.ts` and
`apps/web/server/routes/__tests__/workerRuntime.test.ts` with failing stubs for:

- pending connect expiry at 15 minutes and approved handoff expiry at two minutes;
- no worker token material in Redis, approval response, browser status, log, or
  audit snapshots;
- atomic token redemption and two-replica/lost-response retries converging on one
  stable token lineage without extending expiry;
- no production in-memory fallback when Redis is missing, slow, reconnecting, or
  returns a partial transaction;
- proof nonce `SET NX EX`, five-minute TTL, replay blocking, cross-replica replay,
  wrong device/runtime/tenant/token plane, and backend-unavailable `503`;
- deterministic 60-second refresh receipt returning the same replacement claim
  lineage without storing token strings;
- refresh race, signing failure, Redis failure before revocation, replay after
  grace, changed device proof, and no token-lifetime extension;
- separate distributed limits for connect, registration, refresh, claim,
  heartbeat, event, artifact init, and artifact complete;
- stale lease/attempt and wrong token-use calls produce no registry/artifact/job
  side effect even when Redis is healthy.

Retain the existing Worker App route contract assertions. Add compatibility tests
showing a current Worker App client honors the returned shorter `expiresIn`, polls
at the declared interval, receives one stable token lineage across a lost-response
retry, and can reconnect after an expired flow.

### Phase D — download grant and storage boundary

Add `apps/web/server/services/__tests__/mcpDownloadBrokerService.test.ts` and
extend `managedStorageAuthorizationService.test.ts` with failing stubs for:

- five-minute fixed active-grant TTL that cannot be refreshed by redemption;
- no storage key, signed URL, bearer token, prompt, or filename path in the Redis
  value/key/log/audit;
- active-record requirement plus ACL recheck on every redemption;
- cross-tenant/user, deleted, expired, revoked, changed-ACL, guessed key, changed
  resource, wrong audience/scope, and malformed grant denial;
- safe repeated bounded Range requests for video/audio and rejection of abusive,
  overlapping, unsatisfiable, or excessive ranges;
- Redis unavailable/evicted/circuit-open denial without falling back to the
  generic `/api/storage/files/*` authorization path;
- stream abort cleanup and concurrent-stream limiter release;
- indistinguishable resource-not-found versus forbidden projection while audit
  retains the sanitized internal reason.

Section 05 remains responsible for the positive ACL/MIME/source matrix and actual
streaming behavior. This phase supplies the ephemeral grant and negative security
gate those tests consume.

### Phase E — executor boundary tests

When Section 04 creates `apps/remotion-executor`, add or extend package-local test
files for the following stubs:

- control-plane client sends only the token type allowed for each endpoint and
  never follows a redirect that would forward authorization or presigned-query
  material to another origin;
- bounded retry maps `503` Redis/security-backend failures to retryable states but
  stops at lease expiry and never creates a new job/idempotency identity;
- artifact retry reuses the exact job, assignment, checksum, size, and server URL,
  and redacts URL query strings in every error path;
- workspace/profile/render roots reject traversal, symlink/junction escape, unsafe
  deletion, arbitrary local input, and cross-job reuse;
- child process uses a fixed executable/argv/environment allowlist with no shell;
- log snapshots contain no refresh/execution/upload token, private key, storage
  credential, signed URL, local path, provider credential, or prompt secret;
- cancellation, shutdown, timeout, and stale-lease paths kill only owned child
  processes and never report success or upload after authority is lost.

These package tests use fake control-plane and process adapters for deterministic
coverage. Real Windows 11 and macOS platform proof remains Section 08's acceptance
gate.

### Phase F — integrated outage and threat suite

Add a focused integration suite under the existing web test conventions that
drives MCP submit through scheduler admission, worker proof/claim, render stub,
artifact complete, publication, and download grant while injecting Redis states:

- healthy;
- unavailable before any side effect;
- timeout after an atomic write response is lost;
- reconnecting;
- OOM/write rejection;
- corrupt/wrong-version value;
- expired key;
- simulated eviction signal/circuit open;
- cache healthy but realtime unhealthy, and the reverse.

For every injected state, assert the durable database row, credit reservation,
assignment attempt, artifact row, provider invocation count, and audit outcome.
No test passes solely because an HTTP code matched.

## Verification commands and evidence

Use the repository's actual package manager and test scripts discovered at
implementation time. The minimum focused evidence is:

1. Vitest for the key registry and split Redis clients.
2. Vitest for MCP public server/session/security and registry authorization.
3. Vitest for worker auth, worker runtime routes, scheduler, registry, and
   artifact services.
4. Vitest for download broker and managed storage authorization.
5. Executor package unit/integration tests once Section 04 exists.
6. A static search proving Feature 145 production modules do not import the
   legacy Redis singleton and do not contain forbidden key/value fields.
7. `git diff --check` limited to the implemented scope.
8. The Section 08 deterministic E2E suite plus real platform smoke evidence
   before rollout.

Run one focused test with a real disposable Redis-compatible instance in addition
to mocks. It must prove atomic `NX`/TTL behavior, the limiter transaction/script,
parallel-replica contention, reconnect classification, and cleanup. It must not
connect to production or delete keys outside the dedicated test namespace.

Report focused proof separately from repository-wide baseline failures. A passing
security subset is not a claim that the entire monorepo typecheck or test suite is
clean.

## Acceptance gates

This section is complete only when all of the following are true:

- every Feature 145 key is registered, versioned, namespaced, bounded, schema
  validated, redacted, measured, and created atomically with an explicit TTL;
- all new/touched Feature 145 ephemeral state uses the correct split client and
  no third Redis connection abstraction exists;
- no media bytes, full prompts, provider output, credentials, bearer/refresh/
  upload tokens, raw storage keys, signed URLs, or durable job payloads are written
  to Redis;
- MCP session, idempotency, worker connect/proof/refresh, download grant, and
  distributed limiter outage behavior is deterministic and fail closed;
- production paths do not fall back to process-local maps for authentication,
  replay protection, idempotency, downloads, claims, or abuse prevention;
- Redis outage is reported as a typed transient `503`, while a verified caller
  limit remains `429` with correct retry metadata;
- rate limits and concurrency limits are independent across MCP, worker, and
  artifact planes and are atomic across replicas;
- Redis eviction/no-eviction posture, memory headroom, circuit-breaker behavior,
  and alerts have operational evidence;
- every threat-model row has an automated negative test or, for platform-only
  behavior, a documented Section 08 operational proof with an owner;
- logs, audit, MCP output, Redis-write snapshots, and executor diagnostics pass
  secret/URL/path redaction tests;
- existing Worker App auth/claim/upload behavior remains compatible, including
  recovery from the shorter connect window;
- feature flag off and operator kill switch off preserve existing desktop routing
  and prevent new dedicated claims without deleting durable jobs or credentials.

## Rollout and rollback

Deploy this work dark before enabling `remotionDedicatedExecutorEnabled`:

1. Ship the key registry, metrics, and tests with no dedicated routing.
2. Migrate MCP and worker security writes to the new versioned keys. Read valid
   legacy keys only for the bounded compatibility windows described above.
3. Stop writing token-bearing worker connect and refresh-grace records. Wait at
   least the old 60-second refresh-grace TTL before inspecting Redis to prove no
   token-bearing grace values remain. Legacy connect records are accepted only
   under the new short age checks and rewritten without tokens.
4. Enable distributed limiter enforcement and security circuit readiness in a
   non-production environment, then one non-production tenant.
5. Run outage, race, cross-tenant, and redaction evidence before Section 08 enables
   preview or production dedicated dispatch.

Rollback is the dedicated-dispatch kill switch plus hiding the new MCP render
surface. Stop new `remotion_executor` claims and let durable reconciliation govern
in-flight assignments. Keep additive runtime/database values and durable jobs.

Do not roll back to token-bearing Redis values, seven-day token handoff records,
anonymous/static MCP fallback, or process-local production security maps. If the
new namespace or cache client causes an operational regression, a bounded
compatibility release may read validated legacy session/connect metadata while
the feature remains disabled, but it must preserve fail-closed behavior, value
bounds, redaction, and the prohibition on Redis token/media storage. New keys are
left to expire naturally; do not run broad wildcard deletion. Any cleanup script
must use the exact versioned test/feature prefix, dry-run counts, and an approved
maximum deletion bound.

Rollback proof consists of: flag and kill-switch state, no new dedicated claims,
safe reconciliation of existing assignments, legacy Worker App path green,
security readiness still enforced, and no destructive change to jobs, artifacts,
credentials, enum values, or unrelated Redis keyspaces.

## UI/UX Contract

This section introduces no browser route, visual component, responsive layout, or
interactive UI state. User-facing behavior is limited to existing MCP/API/CLI
surfaces receiving stable sanitized error codes, retry guidance, and expiry values.
Accessibility and browser screenshot evidence are therefore not applicable here;
end-to-end operator and platform evidence belongs to Section 08.

### Target User / JTBD
N/A — backend security, Redis policy, and operational behavior; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by service/API error codes and operational evidence.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; user-facing errors remain bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — security and operational evidence belongs to Section 08.
